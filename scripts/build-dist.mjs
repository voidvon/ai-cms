import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');
const releaseVersion = await resolveReleaseVersion();

async function main() {
  await fs.rm(distRoot, { recursive: true, force: true });

  await copyFile('server.mjs');
  await writeDistPackageJson();
  await copyDeployScripts();

  await copyServer();
  await copyShared();
  await copyAdminDist();
  await copyAdminSiteSource();
  await copyPublicAssets();
  await createRuntimeDirs();
  await writeReleaseMetadata();
  await writeDeployReadme();

  console.log(`发布包已生成：${distRoot}（版本 ${releaseVersion}）`);
}

async function resolveReleaseVersion() {
  const value = process.env.RELEASE_VERSION?.trim()
    || (await fs.readFile(path.join(root, '.release-version'), 'utf8')).trim();

  if (!/^(0|[1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.test(value)) {
    throw new Error(`RELEASE_VERSION 无效：${value}`);
  }

  return value;
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
  await copyDir('system/server/tests');
  await copyDir('system/server/schema');
  await copyDir('system/server/views');
  await copyDir('system/server/import');
  await copyDir('system/server/README.md');
}

async function copyDeployScripts() {
  await copyFile('scripts/patch-openai-agents-core-status.mjs');
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
    version: releaseVersion,
    private: true,
    type: 'module',
    workspaces: [
      'system/server',
      'system/admin'
    ],
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

async function writeReleaseMetadata() {
  const metadata = {
    version: releaseVersion,
    tag: `v${releaseVersion}`,
    commit: process.env.RELEASE_COMMIT?.trim() || null,
    builtAt: new Date().toISOString()
  };

  await fs.writeFile(
    path.join(distRoot, 'RELEASE.json'),
    `${JSON.stringify(metadata, null, 2)}\n`
  );
}

async function writeDeployReadme() {
  const content = `# 部署包说明

此目录是可部署的运行包。

发布版本：\`${releaseVersion}\`

## 服务器部署步骤

\`\`\`bash
npm install
npm run build:site
PORT=1231 HOST=0.0.0.0 NODE_ENV=production npm start
\`\`\`

## 运行数据说明

- \`html/\` 由服务器执行 \`npm run build:site\` 后生成。
- \`system/admin/src/site/\` 包含可编辑的 React 模板。修改后，可在后台点击生成按钮，或执行 \`npm run build:site\`；静态生成时会编译最新源码。
- \`data/site.sqlite\` 属于运行数据，不包含在此部署包中。
- 新服务器应先初始化或恢复数据库，再生成 HTML。
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
