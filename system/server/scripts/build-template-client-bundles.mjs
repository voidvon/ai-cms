import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(__dirname, '..');
const systemRoot = path.resolve(serverRoot, '..');
const adminRoot = path.join(systemRoot, 'admin');
const adminRequire = createRequire(path.join(adminRoot, 'package.json'));

const vite = await import(pathToFileURL(adminRequire.resolve('vite')).href);

const manifestPath = process.argv[2];
const outputRoot = process.argv[3];

if (!manifestPath || !outputRoot) {
  throw new Error('Usage: node build-template-client-bundles.mjs <manifest.json> <outputRoot>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const bundles = Array.isArray(manifest.bundles) ? manifest.bundles : [];

for (const bundle of bundles) {
  const code = sanitizeTemplateCode(bundle.code);
  const modules = Array.isArray(bundle.modules) ? bundle.modules : [];
  if (!code || modules.length === 0) {
    continue;
  }
  await buildOneBundle({
    code,
    modules,
    outputRoot: path.resolve(outputRoot)
  });
}

async function buildOneBundle({ code, modules, outputRoot }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cms-template-${code}-`));
  const entryPath = path.join(tempRoot, 'entry.ts');
  const bundleModules = [];

  for (const [index, module] of modules.entries()) {
    const source = extractImperativeClientModule(String(module.source || ''));
    if (!source) {
      continue;
    }
    const sourcePath = path.join(tempRoot, `template-client-${index}.ts`);
    fs.writeFileSync(sourcePath, source, 'utf8');
    bundleModules.push({
      path: `./template-client-${index}.ts`,
      needsProps: module.needsProps !== false
    });
  }

  if (bundleModules.length === 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return;
  }

  fs.writeFileSync(entryPath, buildEntrySource(bundleModules), 'utf8');

  try {
    await vite.build({
      configFile: false,
      root: tempRoot,
      logLevel: 'warn',
      build: {
        outDir: path.join(outputRoot, 'assets', 'cms-templates'),
        emptyOutDir: false,
        minify: true,
        sourcemap: false,
        rollupOptions: {
          input: entryPath,
          output: {
            entryFileNames: `${code}.js`,
            chunkFileNames: `chunks/${code}-[name]-[hash].js`,
            assetFileNames: `assets/${code}-[name]-[hash][extname]`
          }
        }
      }
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function buildEntrySource(modules) {
  const importLines = modules.map((module, index) => `import { client as runClient${index} } from ${JSON.stringify(module.path)};`).join('\n');
  const runners = modules.map((module, index) => {
    const propsExpr = module.needsProps ? 'pageProps' : '{}';
    return `if (typeof runClient${index} === 'function') {
  runClient${index}({
    props: ${propsExpr}
  });
}`;
  }).join('\n\n');
  const anyNeedsProps = modules.some((module) => module.needsProps);

  return `${importLines}

const pageProps = ${anyNeedsProps ? 'readPageProps()' : '{}'};

${runners}

${anyNeedsProps ? `function readPageProps() {
  const node = document.getElementById('cms-tsx-page-props');
  if (!node) {
    return {};
  }
  try {
    return JSON.parse(node.textContent || '{}');
  } catch (error) {
    console.error('Invalid CMS TSX props JSON:', error);
    return {};
  }
}` : ''}
`;
}

function extractImperativeClientModule(source) {
  const normalizedSource = String(source || '');
  const functionMatch = normalizedSource.match(/export\s+function\s+client\s*\(/);
  if (functionMatch?.index != null) {
    return extractFunctionDeclaration(normalizedSource, functionMatch.index);
  }

  const variableMatch = normalizedSource.match(/export\s+(?:const|let|var)\s+client\s*=/);
  if (variableMatch?.index != null) {
    return extractVariableDeclaration(normalizedSource, variableMatch.index);
  }

  return '';
}

function extractFunctionDeclaration(source, startIndex) {
  const bodyStart = source.indexOf('{', startIndex);
  if (bodyStart === -1) {
    throw new Error('Invalid template client function: missing function body');
  }
  const bodyEnd = findMatchingBrace(source, bodyStart);
  return `${source.slice(startIndex, bodyEnd + 1)}\n`;
}

function extractVariableDeclaration(source, startIndex) {
  let cursor = startIndex;
  let depthParen = 0;
  let depthBrace = 0;
  let depthBracket = 0;
  let quote = '';
  let escaped = false;

  while (cursor < source.length) {
    const char = source[cursor];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      cursor += 1;
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      cursor += 1;
      continue;
    }

    if (char === '(') depthParen += 1;
    if (char === ')') depthParen = Math.max(0, depthParen - 1);
    if (char === '{') depthBrace += 1;
    if (char === '}') depthBrace = Math.max(0, depthBrace - 1);
    if (char === '[') depthBracket += 1;
    if (char === ']') depthBracket = Math.max(0, depthBracket - 1);

    if (char === ';' && depthParen === 0 && depthBrace === 0 && depthBracket === 0) {
      return `${source.slice(startIndex, cursor + 1)}\n`;
    }

    cursor += 1;
  }

  throw new Error('Invalid template client variable export: missing statement terminator');
}

function findMatchingBrace(source, openIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];

    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'' || char === '`') {
      quote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  throw new Error('Invalid template client function: unclosed block');
}

function sanitizeTemplateCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
