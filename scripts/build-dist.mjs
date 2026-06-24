import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');

async function main() {
  await fs.rm(distRoot, { recursive: true, force: true });

  await copyFile('server.mjs');
  await writeDistPackageJson();

  await copyServer();
  await copyShared();
  await copyAdminDist();
  await copyAdminSiteSource();
  await copyPublicAssets();
  await createRuntimeDirs();
  await writeDeployReadme();

  console.log(`Distribution package generated: ${distRoot}`);
}

async function copyFile(relativePath) {
  await fs.mkdir(path.dirname(path.join(distRoot, relativePath)), { recursive: true });
  await fs.copyFile(path.join(root, relativePath), path.join(distRoot, relativePath));
}

async function copyDir(sourceRelativePath, targetRelativePath = sourceRelativePath, options = {}) {
  await fs.cp(path.join(root, sourceRelativePath), path.join(distRoot, targetRelativePath), {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const relative = path.relative(root, source);
      return !shouldSkip(relative, options);
    }
  });
}

async function copyServer() {
  await copyDir('system/server/package.json');
  await copyDir('system/server/src');
  await copyDir('system/server/scripts');
  await copyDir('system/server/schema');
  await copyDir('system/server/views');
  await copyDir('system/server/import');
  await copyDir('system/server/README.md');
}

async function copyShared() {
  await copyDir('system/shared');
}

async function copyAdminDist() {
  await copyDir('system/admin/dist', 'system/admin/dist', { allowDist: true });
}

async function copyAdminSiteSource() {
  await copyDir('system/admin/package.json');
  await copyDir('system/admin/src/site');
  await copyDir('system/admin/tsconfig.json');
  await copyDir('system/admin/tsconfig.node.json');
}

async function copyPublicAssets() {
  await copyDir('public');
}

async function createRuntimeDirs() {
  await fs.mkdir(path.join(distRoot, 'html'), { recursive: true });
  await fs.writeFile(path.join(distRoot, 'html/.gitkeep'), '');
  await copyOptionalFile('public/logo.svg', 'html/logo.svg');
  await fs.mkdir(path.join(distRoot, 'data'), { recursive: true });
  await fs.writeFile(path.join(distRoot, 'data/.gitkeep'), '');
}

async function copyOptionalFile(sourceRelativePath, targetRelativePath = sourceRelativePath) {
  try {
    await fs.access(path.join(root, sourceRelativePath));
  } catch {
    return;
  }

  await fs.mkdir(path.dirname(path.join(distRoot, targetRelativePath)), { recursive: true });
  await fs.copyFile(path.join(root, sourceRelativePath), path.join(distRoot, targetRelativePath));
}

async function writeDistPackageJson() {
  const pkg = {
    name: 'spiraxsarcocn-dist',
    private: true,
    type: 'module',
    scripts: {
      start: 'node server.mjs',
      'build:site': 'npm --prefix system/server run build:static',
      'db:init': 'npm --prefix system/server run db:init',
      'db:import': 'npm --prefix system/server run db:import',
      'admin:create': 'npm --prefix system/server run admin:create --'
    }
  };

  await fs.mkdir(distRoot, { recursive: true });
  await fs.writeFile(
    path.join(distRoot, 'package.json'),
    `${JSON.stringify(pkg, null, 2)}\n`
  );
}

async function writeDeployReadme() {
  const content = `# Deployment Package

This directory is the deployable runtime package.

## Server Steps

\`\`\`bash
npm install
npm --workspace system/server install --omit=dev
npm run build:site
PORT=1231 HOST=0.0.0.0 NODE_ENV=production npm start
\`\`\`

## Runtime Data

- \`html/\` is generated on the server by \`npm run build:site\`.
- \`system/admin/src/site/\` contains editable React templates. After changing them, click the admin generate button or run \`npm run build:site\`; the latest source is compiled at generation time.
- \`data/site.sqlite\` is runtime data and is not included in this package.
- For a fresh server, initialize or restore the database before generating HTML.
\`\`\`bash
npm run db:init
npm run admin:create -- admin your-password
\`\`\`
`;

  await fs.writeFile(path.join(distRoot, 'DEPLOY.md'), content);
}

function shouldSkip(relativePath, options = {}) {
  const basename = path.basename(relativePath);
  const segments = relativePath.split(path.sep);
  return basename === '.DS_Store'
    || basename.startsWith('._')
    || segments.includes('node_modules')
    || segments.includes('.git')
    || segments.includes('.venv')
    || segments.includes('generated')
    || segments.includes('generated-debug')
    || (!options.allowDist && segments.includes('dist'))
    || relativePath.endsWith('.sqlite')
    || relativePath.endsWith('.sqlite-shm')
    || relativePath.endsWith('.sqlite-wal')
    || relativePath.endsWith('.bak');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
