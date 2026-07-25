import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { incrementVersion, selectLatestTaggedVersion } from './next-release-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(root, 'dist');
const releaseIdentity = await resolveReleaseIdentity();
const releaseVersion = releaseIdentity.version;
const releaseCommit = releaseIdentity.commit;
const isFormalReleaseBuild = releaseIdentity.formal;

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
  await writeReleaseMetadata();
  await writeDeployReadme();

  console.log(`发布包已生成：${distRoot}（版本 ${releaseVersion}）`);
}

async function resolveReleaseIdentity() {
  const explicitVersion = process.env.RELEASE_VERSION?.trim();
  const commit = String(process.env.RELEASE_COMMIT || readGitOutput(['rev-parse', 'HEAD'])).trim();
  let value = explicitVersion;

  if (!value) {
    const tags = readGitOutput(['tag', '--list']).split(/\r?\n/).filter(Boolean);
    const exactVersion = selectLatestTaggedVersion(
      readGitOutput(['tag', '--points-at', 'HEAD']).split(/\r?\n/).filter(Boolean)
    );
    const isDirty = Boolean(readGitOutput(['status', '--porcelain']));

    if (exactVersion && !isDirty) {
      value = exactVersion;
    } else {
      const latestVersion = selectLatestTaggedVersion(tags)
        || (await fs.readFile(path.join(root, '.release-version'), 'utf8')).trim();
      value = incrementVersion(latestVersion);
    }
  }

  if (!/^(0|[1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.test(value)) {
    throw new Error(`RELEASE_VERSION 无效：${value}`);
  }

  if (!/^[a-f0-9]{7,40}$/i.test(commit)) {
    throw new Error(`RELEASE_COMMIT 无效：${commit}`);
  }

  return {
    version: value,
    commit,
    formal: Boolean(explicitVersion)
  };
}

function readGitOutput(args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
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
    name: 'ai-cms',
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
    tag: isFormalReleaseBuild ? `v${releaseVersion}` : null,
    commit: releaseCommit || null,
    release: isFormalReleaseBuild,
    updateable: true,
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
npm install --legacy-peer-deps --no-audit --no-fund
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

## 后台在线更新

- 后台从 \`https://github.com/voidvon/ai-cms\` 检查并下载最新 Release。
- 正式 Release 和包含可信 Git 提交号的普通构建包都允许执行在线更新。
- Node.js 服务账号需要对程序目录、\`system/\`、\`scripts/\`、\`public/\` 和 \`node_modules/\` 具有写权限。
- 更新过程会保留 \`data/\`、\`html/\`、\`uploads/\`、环境配置和部署运行目录。
- 安装完成后会强制重启服务。独立重启守护会等待旧进程退出，再通过项目根目录的 \`server.mjs\` 启动新进程。
`;

  await fs.writeFile(path.join(distRoot, 'DEPLOY.md'), content);
}

function shouldSkip(relativePath, options = {}) {
  const basename = path.basename(relativePath);
  const segments = relativePath.split(path.sep);
  const normalizedRelativePath = relativePath.split(path.sep).join('/');
  return basename === '.DS_Store'
    || basename.startsWith('._')
    || segments.includes('node_modules')
    || segments.includes('.git')
    || segments.includes('.venv')
    || segments.includes('generated')
    || segments.includes('generated-debug')
    || normalizedRelativePath === 'public/upload'
    || normalizedRelativePath.startsWith('public/upload/')
    || normalizedRelativePath === 'public/uploads'
    || normalizedRelativePath.startsWith('public/uploads/')
    || normalizedRelativePath === 'public/uploadfile'
    || normalizedRelativePath.startsWith('public/uploadfile/')
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
