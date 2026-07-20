import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  incrementVersion,
  selectLatestTaggedVersion
} from './next-release-version.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseAssetsRoot = path.join(root, 'release-assets');
const prepareOnly = process.argv.slice(2).includes('--prepare-only');

if (process.argv.slice(2).some((argument) => argument !== '--prepare-only')) {
  console.error('用法：node scripts/release.mjs [--prepare-only]');
  process.exit(1);
}

function capture(command, args) {
  return execFileSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: 'inherit'
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} 执行失败，退出状态码：${result.status}。`);
  }
}

function requireCommand(command) {
  const result = spawnSync(command, ['--version'], {
    cwd: root,
    stdio: 'ignore'
  });

  if (result.error?.code === 'ENOENT') {
    throw new Error(`缺少必需命令：${command}`);
  }
}

function readReleaseState(useRemoteTags) {
  const tagOutput = useRemoteTags
    ? capture('git', ['ls-remote', '--tags', '--refs', 'origin'])
    : capture('git', ['tag', '--list']);
  const tags = tagOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.includes('refs/tags/') ? line.split('refs/tags/').at(-1) : line);
  const latestVersion = selectLatestTaggedVersion(tags);
  const seedVersion = readFileSync(path.join(root, '.release-version'), 'utf8').trim();
  const currentVersion = latestVersion ?? seedVersion;

  return {
    currentVersion,
    nextVersion: incrementVersion(currentVersion),
    latestTag: latestVersion ? `v${latestVersion}` : null
  };
}

function assertLocalReleaseReady() {
  if (capture('git', ['branch', '--show-current']) !== 'main') {
    throw new Error('只能从本地 main 分支创建正式发布。');
  }

  if (capture('git', ['status', '--porcelain'])) {
    throw new Error('创建正式发布前，Git 工作区必须保持干净，请先提交或处理未提交修改。');
  }

  console.log('[发布] 正在拉取 origin/main 和远端版本标签...');
  run('git', ['fetch', 'origin', '--tags']);

  const localHead = capture('git', ['rev-parse', 'HEAD']);
  const remoteHead = capture('git', ['rev-parse', 'origin/main']);
  if (localHead !== remoteHead) {
    throw new Error('创建正式发布前，本地 main 必须与 origin/main 完全一致。');
  }

  console.log('[发布] 正在检查 GitHub CLI 登录状态...');
  run('gh', ['auth', 'status']);
}

async function validateDist(expectedVersion) {
  const pkg = JSON.parse(await fs.readFile(path.join(root, 'dist/package.json'), 'utf8'));
  const release = JSON.parse(await fs.readFile(path.join(root, 'dist/RELEASE.json'), 'utf8'));

  if (
    pkg.version !== expectedVersion
    || release.version !== expectedVersion
    || release.release !== true
    || !/^[a-f0-9]{7,40}$/i.test(String(release.commit || ''))
  ) {
    throw new Error('发布包中的版本信息与计算得到的发布版本不一致。');
  }

  const forbiddenNames = new Set(['.env']);
  const forbiddenSuffixes = ['.sqlite', '.sqlite-shm', '.sqlite-wal', '.bak'];

  async function inspectDirectory(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await inspectDirectory(entryPath);
      } else if (
        forbiddenNames.has(entry.name)
        || entry.name.startsWith('.env.')
        || forbiddenSuffixes.some((suffix) => entry.name.endsWith(suffix))
      ) {
        throw new Error(`发布包中发现禁止包含的运行数据或敏感文件：${entryPath}`);
      }
    }
  }

  await inspectDirectory(path.join(root, 'dist'));
}

async function sha256(filePath) {
  return crypto.createHash('sha256').update(await fs.readFile(filePath)).digest('hex');
}

async function createArchives(version) {
  const packageName = `ai-cms-v${version}`;
  const packageRoot = path.join(releaseAssetsRoot, packageName);
  const tarPath = path.join(releaseAssetsRoot, `${packageName}.tar.gz`);
  const zipPath = path.join(releaseAssetsRoot, `${packageName}.zip`);
  const checksumPath = path.join(releaseAssetsRoot, `${packageName}-SHA256SUMS.txt`);

  await fs.rm(releaseAssetsRoot, { recursive: true, force: true });
  await fs.mkdir(packageRoot, { recursive: true });
  await fs.cp(path.join(root, 'dist'), packageRoot, { recursive: true });

  run('tar', ['-C', releaseAssetsRoot, '-czf', tarPath, packageName]);
  run('zip', ['-qr', zipPath, packageName], { cwd: releaseAssetsRoot });

  const checksums = [
    `${await sha256(tarPath)}  ${path.basename(tarPath)}`,
    `${await sha256(zipPath)}  ${path.basename(zipPath)}`
  ].join('\n') + '\n';
  await fs.writeFile(checksumPath, checksums);
  await fs.rm(packageRoot, { recursive: true, force: true });

  return { packageName, tarPath, zipPath, checksumPath };
}

async function main() {
  for (const command of ['git', 'node', 'npm', 'tar', 'zip']) {
    requireCommand(command);
  }

  if (!prepareOnly) {
    requireCommand('gh');
    assertLocalReleaseReady();
  }

  const state = readReleaseState(!prepareOnly);
  const tag = `v${state.nextVersion}`;

  if (!prepareOnly && state.latestTag) {
    const commitCount = Number(capture('git', ['rev-list', '--count', `${state.latestTag}..HEAD`]));
    if (commitCount === 0) {
      throw new Error(`${state.latestTag} 之后没有新提交，已拒绝创建空发布。`);
    }
  }

  console.log(`[发布] 版本递增：${state.currentVersion} → ${state.nextVersion}`);
  console.log('[发布] 正在运行测试...');
  run('npm', ['test']);

  console.log('[发布] 正在构建 dist 发布包...');
  run('npm', ['run', 'build:dist'], {
    env: {
      ...process.env,
      RELEASE_VERSION: state.nextVersion,
      RELEASE_COMMIT: capture('git', ['rev-parse', 'HEAD'])
    }
  });

  await validateDist(state.nextVersion);
  console.log('[发布] 正在生成压缩包和校验文件...');
  const assets = await createArchives(state.nextVersion);

  if (prepareOnly) {
    console.log(`[发布] 本地发布附件已生成：${assets.packageName}`);
    console.log(`[发布] 附件目录：${releaseAssetsRoot}`);
    console.log('[发布] 本次仅执行本地准备，没有创建 Git 标签或 GitHub Release。');
    return;
  }

  console.log(`[发布] 正在将 ${tag} 发布到 GitHub...`);
  run('gh', [
    'release',
    'create',
    tag,
    assets.tarPath,
    assets.zipPath,
    assets.checksumPath,
    '--target',
    capture('git', ['rev-parse', 'HEAD']),
    '--title',
    tag,
    '--generate-notes',
    '--fail-on-no-commits',
    '--latest'
  ]);

  run('git', ['fetch', 'origin', 'tag', tag]);
  console.log(`[发布] ${tag} 已发布完成。`);
}

main().catch((error) => {
  console.error(`[发布失败] ${error.message}`);
  process.exit(1);
});
