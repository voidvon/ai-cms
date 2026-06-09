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
const reactPluginModule = await import(pathToFileURL(adminRequire.resolve('@vitejs/plugin-react')).href);
const reactPlugin = reactPluginModule.default;

const manifestPath = process.argv[2];
const outputRoot = process.argv[3];

if (!manifestPath || !outputRoot) {
  throw new Error('Usage: node build-template-client-bundles.mjs <manifest.json> <outputRoot>');
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const templates = Array.isArray(manifest.templates) ? manifest.templates : [];

for (const template of templates) {
  const code = sanitizeTemplateCode(template.code);
  if (!code || !template.source) {
    continue;
  }

  await buildOneTemplate({
    code,
    source: String(template.source),
    outputRoot: path.resolve(outputRoot)
  });
}

async function buildOneTemplate({ code, source, outputRoot }) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cms-template-${code}-`));
  const sourcePath = path.join(tempRoot, 'template.tsx');
  const entryPath = path.join(tempRoot, 'entry.tsx');

  fs.writeFileSync(sourcePath, source, 'utf8');
  fs.writeFileSync(entryPath, buildEntrySource(code), 'utf8');

  try {
    await vite.build({
      configFile: false,
      root: tempRoot,
      logLevel: 'warn',
      plugins: [reactPlugin()],
      resolve: {
        dedupe: ['react', 'react-dom'],
        alias: [
          { find: /^react$/, replacement: adminRequire.resolve('react') },
          { find: /^react\/jsx-runtime$/, replacement: adminRequire.resolve('react/jsx-runtime') },
          { find: /^react\/jsx-dev-runtime$/, replacement: adminRequire.resolve('react/jsx-dev-runtime') },
          { find: /^react-dom\/client$/, replacement: adminRequire.resolve('react-dom/client') }
        ]
      },
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

function buildEntrySource(code) {
  return `import React from 'react';
import { createRoot } from 'react-dom/client';
import * as TemplateModule from './template.tsx';

const templateCode = ${JSON.stringify(code)};
const pageProps = readPageProps(templateCode);
const roots = Array.from(document.querySelectorAll('[data-cms-client-root]'));

for (const root of roots) {
  const name = root.getAttribute('data-cms-client-root') || 'default';
  const islandProps = readJsonAttribute(root, 'data-cms-client-props');
  const Component = resolveClientComponent(TemplateModule, name);
  if (Component) {
    createRoot(root).render(React.createElement(Component, {
      ...pageProps,
      ...islandProps,
      islandName: name
    }));
  }
}

const maybeClient = Reflect.get(TemplateModule, 'client');
if (typeof maybeClient === 'function') {
  maybeClient({
    React,
    props: pageProps,
    roots
  });
}

function resolveClientComponent(module, name) {
  const clientComponents = Reflect.get(module, 'ClientComponents');
  const namedComponent = Reflect.get(module, name);
  const defaultClient = Reflect.get(module, 'Client');
  if (clientComponents && clientComponents[name]) {
    return clientComponents[name];
  }
  if (name !== 'default' && typeof namedComponent === 'function') {
    return namedComponent;
  }
  return typeof defaultClient === 'function' ? defaultClient : null;
}

function readPageProps(code) {
  const node = document.getElementById('cms-tsx-props-' + code);
  if (!node) {
    return {};
  }
  try {
    return JSON.parse(node.textContent || '{}');
  } catch (error) {
    console.error('Invalid CMS TSX props JSON:', error);
    return {};
  }
}

function readJsonAttribute(node, name) {
  try {
    return JSON.parse(node.getAttribute(name) || '{}');
  } catch (error) {
    console.error('Invalid CMS TSX island props JSON:', error);
    return {};
  }
}
`;
}

function sanitizeTemplateCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
