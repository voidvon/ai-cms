import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

import { PROJECT_ROOT } from '../config.mjs';

const execFileAsync = promisify(execFile);
const RELEASE_REPOSITORY = String(process.env.CMS_RELEASE_REPOSITORY || 'voidvon/ai-cms').trim();
const RELEASE_ASSET_PREFIX = String(process.env.CMS_RELEASE_ASSET_PREFIX || 'ai-cms').trim();
const GITHUB_API_BASE = 'https://api.github.com';
const RELEASE_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_ARCHIVE_BYTES = 300 * 1024 * 1024;
const MAX_CHECKSUM_BYTES = 1024 * 1024;
const PROTECTED_TOP_LEVEL = new Set([
  '.deploy',
  '.git',
  '.updates',
  'data',
  'html',
  'node_modules',
  'uploads'
]);

let releaseCache = null;
let updatePromise = null;
let restartScheduled = false;

export async function getSystemVersionStatus(options = {}) {
  const current = await readCurrentVersion();

  try {
    const release = await getLatestRelease({ force: Boolean(options.force) });
    const comparison = compareReleaseVersions(release.version, current.version);

    return {
      current_version: current.version,
      current_version_source: current.source,
      update_supported: ['release', 'build'].includes(current.source),
      latest_version: release.version,
      latest_tag: release.tag,
      has_update: comparison > 0,
      release_url: release.htmlUrl,
      release_name: release.name,
      published_at: release.publishedAt,
      repository: RELEASE_REPOSITORY,
      checking_error: null,
      update_in_progress: Boolean(updatePromise),
      auto_restart: true
    };
  } catch (error) {
    return {
      current_version: current.version,
      current_version_source: current.source,
      update_supported: ['release', 'build'].includes(current.source),
      latest_version: null,
      latest_tag: null,
      has_update: false,
      release_url: `https://github.com/${RELEASE_REPOSITORY}/releases`,
      release_name: null,
      published_at: null,
      repository: RELEASE_REPOSITORY,
      checking_error: error.message || '检查新版本失败',
      update_in_progress: Boolean(updatePromise),
      auto_restart: true
    };
  }
}

export async function installLatestSystemRelease() {
  if (updatePromise) {
    const error = new Error('已有更新任务正在执行，请勿重复提交');
    error.code = 'UPDATE_IN_PROGRESS';
    throw error;
  }

  updatePromise = performUpdate();

  try {
    return await updatePromise;
  } finally {
    updatePromise = null;
  }
}

async function performUpdate() {
  const current = await readCurrentVersion();
  if (!['release', 'build'].includes(current.source)) {
    const error = new Error('当前安装缺少可信的构建版本元数据，已禁止在线更新');
    error.code = 'UPDATE_UNSUPPORTED';
    throw error;
  }

  const release = await getLatestRelease({ force: true });

  if (compareReleaseVersions(release.version, current.version) <= 0) {
    return {
      updated: false,
      current_version: current.version,
      latest_version: release.version,
      message: '当前已经是最新版本',
      restart_required: false,
      restarting: false
    };
  }

  const expectedBaseName = `${RELEASE_ASSET_PREFIX}-v${release.version}`;
  const archiveAsset = findReleaseAsset(release.assets, `${expectedBaseName}.tar.gz`);
  const checksumAsset = findReleaseAsset(release.assets, `${expectedBaseName}-SHA256SUMS.txt`);

  if (!archiveAsset || !checksumAsset) {
    throw new Error(`GitHub Release 缺少 ${expectedBaseName}.tar.gz 或对应的 SHA256 校验文件`);
  }

  if (Number(archiveAsset.size || 0) > MAX_ARCHIVE_BYTES) {
    throw new Error('GitHub Release 发布包超过允许的最大大小');
  }

  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-cms-update-'));
  const archivePath = path.join(tempRoot, archiveAsset.name);
  const checksumPath = path.join(tempRoot, checksumAsset.name);
  const extractRoot = path.join(tempRoot, 'extracted');

  try {
    await downloadReleaseAsset(archiveAsset, archivePath, MAX_ARCHIVE_BYTES);
    await downloadReleaseAsset(checksumAsset, checksumPath, MAX_CHECKSUM_BYTES);
    await verifyArchiveChecksum(archivePath, checksumPath);
    await validateArchiveEntries(archivePath, expectedBaseName);
    await fs.mkdir(extractRoot, { recursive: true });
    await execFileAsync('tar', ['-xzf', archivePath, '-C', extractRoot], {
      maxBuffer: 10 * 1024 * 1024,
      timeout: 2 * 60 * 1000
    });

    const payloadRoot = path.join(extractRoot, expectedBaseName);
    await validateExtractedRelease(payloadRoot, release.version);
    const backup = await applyReleasePayload(payloadRoot, release.version);

    try {
      const npmRuntime = await prepareNpmInstallRuntime();
      await execFileAsync(resolveNpmCommand(), getNpmInstallArgs(), {
        cwd: PROJECT_ROOT,
        env: createNpmInstallEnvironment(process.env, npmRuntime),
        maxBuffer: 20 * 1024 * 1024,
        timeout: 10 * 60 * 1000
      });
      await copyPayloadFile(payloadRoot, 'RELEASE.json');
      await trimUpdateBackups();
    } catch (error) {
      await rollbackReleasePayload(backup);
      throw new Error(`依赖安装失败，程序文件已回滚：${formatCommandError(error)}`);
    }

    releaseCache = null;
    await scheduleSystemRestartOnce();

    return {
      updated: true,
      previous_version: current.version,
      current_version: release.version,
      latest_version: release.version,
      message: '新版本已安装，服务正在重启',
      restart_required: false,
      restarting: true,
      backup_directory: backup.root
    };
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

export async function requestSystemRestart(options = {}) {
  if (updatePromise) {
    const error = new Error('系统更新正在执行，暂时不能单独重启');
    error.code = 'UPDATE_IN_PROGRESS';
    throw error;
  }

  await scheduleSystemRestartOnce(options);
  return {
    message: '系统正在重启，后台将短暂断开',
    restarting: true
  };
}

async function readCurrentVersion() {
  try {
    const metadata = JSON.parse(await fs.readFile(path.join(PROJECT_ROOT, 'RELEASE.json'), 'utf8'));
    const version = normalizeReleaseVersion(metadata.version);
    return {
      version,
      source: isFormalReleaseMetadata(metadata)
        ? 'release'
        : isUpdateableBuildMetadata(metadata) ? 'build' : 'invalid-build'
    };
  } catch {
    // 未找到有效发布元数据时继续读取开发版本来源。
  }

  const candidates = [
    { file: path.join(PROJECT_ROOT, '.release-version'), source: 'seed' },
    { file: path.join(PROJECT_ROOT, 'system/server/package.json'), source: 'server-package' }
  ];

  for (const candidate of candidates) {
    try {
      const raw = await fs.readFile(candidate.file, 'utf8');
      const value = candidate.file.endsWith('.json')
        ? JSON.parse(raw).version
        : raw.trim();
      const version = normalizeReleaseVersion(value);
      return { version, source: candidate.source };
    } catch {
      // 继续尝试下一个可靠的本地版本来源。
    }
  }

  return { version: '0.0.0', source: 'fallback' };
}

async function getLatestRelease(options = {}) {
  const force = Boolean(options.force);
  if (!force && releaseCache && Date.now() - releaseCache.cachedAt < RELEASE_CACHE_TTL_MS) {
    return releaseCache.release;
  }

  const response = await githubFetch(`${GITHUB_API_BASE}/repos/${RELEASE_REPOSITORY}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(force ? { 'Cache-Control': 'no-cache' } : {})
    },
    cache: force ? 'no-store' : 'default'
  });

  if (!response.ok) {
    throw new Error(`GitHub 版本接口请求失败（HTTP ${response.status}）`);
  }

  const payload = await response.json();
  const version = normalizeReleaseVersion(payload.tag_name);
  const release = {
    version,
    tag: `v${version}`,
    name: String(payload.name || payload.tag_name || `v${version}`),
    htmlUrl: String(payload.html_url || `https://github.com/${RELEASE_REPOSITORY}/releases/tag/v${version}`),
    publishedAt: payload.published_at || null,
    assets: Array.isArray(payload.assets) ? payload.assets : []
  };

  releaseCache = { release, cachedAt: Date.now() };
  return release;
}

async function githubFetch(url, options = {}) {
  const { timeoutMs = 30 * 1000, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers || {});
  headers.set('User-Agent', 'ai-cms-system-updater');
  headers.set('X-GitHub-Api-Version', '2022-11-28');

  const token = String(process.env.CMS_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '').trim();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  return fetch(url, {
    ...fetchOptions,
    headers,
    redirect: 'follow',
    signal: fetchOptions.signal || AbortSignal.timeout(timeoutMs)
  });
}

function findReleaseAsset(assets, expectedName) {
  return assets.find((asset) => String(asset?.name || '') === expectedName) || null;
}

async function downloadReleaseAsset(asset, targetPath, maxBytes) {
  const response = await githubFetch(String(asset.url || asset.browser_download_url), {
    headers: { Accept: 'application/octet-stream' },
    timeoutMs: 2 * 60 * 1000
  });

  if (!response.ok) {
    throw new Error(`下载 ${asset.name} 失败（HTTP ${response.status}）`);
  }

  const declaredSize = Number(response.headers.get('content-length') || asset.size || 0);
  if (declaredSize > maxBytes) {
    throw new Error(`${asset.name} 超过允许的最大大小`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) {
    throw new Error(`${asset.name} 超过允许的最大大小`);
  }
  await fs.writeFile(targetPath, buffer);
}

async function verifyArchiveChecksum(archivePath, checksumPath) {
  const checksumText = await fs.readFile(checksumPath, 'utf8');
  const archiveName = path.basename(archivePath);
  const checksumLine = checksumText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith(`  ${archiveName}`) || line.endsWith(` *${archiveName}`));

  const expected = checksumLine?.match(/^([a-fA-F0-9]{64})\s+[ *]/)?.[1]?.toLowerCase();
  if (!expected) {
    throw new Error(`SHA256 校验文件中没有找到 ${archiveName}`);
  }

  const actual = crypto.createHash('sha256').update(await fs.readFile(archivePath)).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) {
    throw new Error('发布包 SHA256 校验失败，已停止更新');
  }
}

async function validateArchiveEntries(archivePath, expectedBaseName) {
  const listOptions = {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 2 * 60 * 1000
  };
  const { stdout } = await execFileAsync('tar', ['-tzf', archivePath], listOptions);
  const prefix = `${expectedBaseName}/`;
  const entries = stdout.split(/\r?\n/).filter(Boolean);

  if (entries.length === 0) {
    throw new Error('发布包为空');
  }

  for (const entry of entries) {
    if (!entry.startsWith(prefix) || entry.startsWith('/') || entry.split('/').includes('..')) {
      throw new Error(`发布包中存在不安全路径：${entry}`);
    }
  }

  const { stdout: verboseOutput } = await execFileAsync('tar', ['-tvzf', archivePath], listOptions);
  for (const line of verboseOutput.split(/\r?\n/).filter(Boolean)) {
    if (!['-', 'd'].includes(line[0])) {
      throw new Error('发布包中不允许包含符号链接、硬链接或特殊文件');
    }
  }
}

async function validateExtractedRelease(payloadRoot, expectedVersion) {
  const release = JSON.parse(await fs.readFile(path.join(payloadRoot, 'RELEASE.json'), 'utf8'));
  const pkg = JSON.parse(await fs.readFile(path.join(payloadRoot, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(await fs.readFile(path.join(payloadRoot, 'package-lock.json'), 'utf8'));

  if (
    normalizeReleaseVersion(release.version) !== expectedVersion
    || pkg.name !== 'ai-cms'
    || packageLock.name !== pkg.name
    || Number(packageLock.lockfileVersion || 0) < 2
  ) {
    throw new Error('发布包身份或版本信息不匹配');
  }
}

async function applyReleasePayload(payloadRoot, version) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(PROJECT_ROOT, '.updates', 'backups', `${timestamp}-before-v${version}`);
  const backupPayloadRoot = path.join(backupRoot, 'payload');
  const relativeFiles = await collectPayloadFiles(payloadRoot);
  const appliedFiles = [];

  await fs.mkdir(backupPayloadRoot, { recursive: true });

  try {
    for (const relativePath of relativeFiles) {
      if (relativePath === 'RELEASE.json') {
        continue;
      }

      const sourcePath = path.join(payloadRoot, relativePath);
      const targetPath = path.join(PROJECT_ROOT, relativePath);
      const backupPath = path.join(backupPayloadRoot, relativePath);
      let existed = false;
      let previousMode = null;

      try {
        const targetStat = await fs.lstat(targetPath);
        if (!targetStat.isFile()) {
          throw new Error(`目标路径不是普通文件：${relativePath}`);
        }
        existed = true;
        previousMode = targetStat.mode;
        await fs.mkdir(path.dirname(backupPath), { recursive: true });
        await fs.copyFile(targetPath, backupPath);
      } catch (error) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }

      const sourceStat = await fs.stat(sourcePath);
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.copyFile(sourcePath, targetPath);
      await fs.chmod(targetPath, sourceStat.mode);
      appliedFiles.push({ relativePath, existed, mode: previousMode });
    }
  } catch (error) {
    await rollbackReleasePayload({ payloadRoot: backupPayloadRoot, appliedFiles });
    throw error;
  }

  await fs.writeFile(
    path.join(backupRoot, 'manifest.json'),
    `${JSON.stringify({ version, created_at: new Date().toISOString(), applied_files: appliedFiles }, null, 2)}\n`
  );

  return { root: backupRoot, payloadRoot: backupPayloadRoot, appliedFiles };
}

async function collectPayloadFiles(payloadRoot) {
  const files = [];

  async function visit(directory, relativeDirectory = '') {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relativePath = path.join(relativeDirectory, entry.name);
      if (isProtectedUpdatePath(relativePath)) {
        continue;
      }

      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolutePath, relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      } else {
        throw new Error(`发布包中不允许包含符号链接或特殊文件：${relativePath}`);
      }
    }
  }

  await visit(payloadRoot);
  return files;
}

async function copyPayloadFile(payloadRoot, relativePath) {
  const sourcePath = path.join(payloadRoot, relativePath);
  const targetPath = path.join(PROJECT_ROOT, relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
}

async function rollbackReleasePayload(backup) {
  for (const file of backup.appliedFiles) {
    const targetPath = path.join(PROJECT_ROOT, file.relativePath);
    if (!file.existed) {
      await fs.rm(targetPath, { force: true });
      continue;
    }

    const backupPath = path.join(backup.payloadRoot, file.relativePath);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.copyFile(backupPath, targetPath);
    if (file.mode) {
      await fs.chmod(targetPath, file.mode);
    }
  }
}

async function trimUpdateBackups() {
  const backupsRoot = path.join(PROJECT_ROOT, '.updates', 'backups');
  let entries;
  try {
    entries = await fs.readdir(backupsRoot, { withFileTypes: true });
  } catch {
    return;
  }

  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse();
  for (const directory of directories.slice(3)) {
    await fs.rm(path.join(backupsRoot, directory), { recursive: true, force: true });
  }
}

export async function scheduleRequiredRestart(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const oldPid = Number(options.oldPid || process.pid);
  const nodeBinary = options.nodeBinary || process.execPath;
  const logsRoot = path.join(projectRoot, 'logs');
  const deployRoot = path.join(projectRoot, '.deploy');
  const logFile = path.join(logsRoot, 'system-update-restart.log');
  const pidFile = path.join(deployRoot, 'server.pid');
  await fs.mkdir(logsRoot, { recursive: true });
  await fs.mkdir(deployRoot, { recursive: true });

  const restartScript = `
old_pid="$1"
project_root="$2"
node_bin="$3"
log_file="$4"
pid_file="$5"

while kill -0 "$old_pid" 2>/dev/null; do
  sleep 1
done

cd "$project_root"
printf '%s\\n' "$$" > "$pid_file"
exec "$node_bin" "$project_root/server.mjs" >> "$log_file" 2>&1
`;

  const restarter = spawn('/bin/sh', [
    '-c',
    restartScript,
    'ai-cms-update-restarter',
    String(oldPid),
    projectRoot,
    nodeBinary,
    logFile,
    pidFile
  ], {
    detached: true,
    stdio: 'ignore',
    env: options.env || process.env
  });

  await new Promise((resolve, reject) => {
    restarter.once('spawn', resolve);
    restarter.once('error', reject);
  });
  restarter.unref();

  if (options.terminateCurrent !== false) {
    setTimeout(() => {
      try {
        process.kill(oldPid, 'SIGTERM');
      } catch {
        // 进程已经退出时无需重复终止。
      }
    }, 1500).unref();
  }
}

async function scheduleSystemRestartOnce(options = {}) {
  if (restartScheduled) {
    const error = new Error('系统重启已安排，请勿重复提交');
    error.code = 'RESTART_IN_PROGRESS';
    throw error;
  }

  restartScheduled = true;
  try {
    const scheduleRestart = options.scheduleRestart || scheduleRequiredRestart;
    await scheduleRestart(options.restartOptions);
  } catch (error) {
    restartScheduled = false;
    throw error;
  }
}

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function prepareNpmInstallRuntime() {
  const runtimeRoot = path.join(PROJECT_ROOT, '.updates', 'npm-runtime');
  const cachePath = path.join(runtimeRoot, 'cache');
  const userConfigPath = path.join(runtimeRoot, 'user.npmrc');
  const globalConfigPath = path.join(runtimeRoot, 'global.npmrc');

  await fs.mkdir(cachePath, { recursive: true });
  await Promise.all([
    fs.writeFile(userConfigPath, ''),
    fs.writeFile(globalConfigPath, '')
  ]);

  return { cachePath, userConfigPath, globalConfigPath };
}

export function createNpmInstallEnvironment(sourceEnv, runtime) {
  const env = {};

  for (const [key, value] of Object.entries(sourceEnv || {})) {
    if (!key.toLowerCase().startsWith('npm_config_')) {
      env[key] = value;
    }
  }

  return {
    ...env,
    NPM_CONFIG_CACHE: runtime.cachePath,
    NPM_CONFIG_USERCONFIG: runtime.userConfigPath,
    NPM_CONFIG_GLOBALCONFIG: runtime.globalConfigPath,
    NPM_CONFIG_UPDATE_NOTIFIER: 'false'
  };
}

export function getNpmInstallArgs() {
  return ['ci', '--omit=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'];
}

function formatCommandError(error) {
  return String(error?.stderr || error?.stdout || error?.message || error).trim();
}

export function normalizeReleaseVersion(value) {
  const normalized = String(value || '').trim().replace(/^v/i, '');
  const match = /^(0|[1-9]\d?)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/.exec(normalized);
  if (!match) {
    throw new Error(`版本号无效：${value}`);
  }
  return match.slice(1).map(Number).join('.');
}

export function compareReleaseVersions(left, right) {
  const leftParts = normalizeReleaseVersion(left).split('.').map(Number);
  const rightParts = normalizeReleaseVersion(right).split('.').map(Number);

  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      return leftParts[index] - rightParts[index];
    }
  }
  return 0;
}

export function isProtectedUpdatePath(relativePath) {
  const normalized = String(relativePath || '').split(path.sep).join('/').replace(/^\.\//, '');
  const [topLevel] = normalized.split('/');

  return PROTECTED_TOP_LEVEL.has(topLevel)
    || topLevel === '.env'
    || topLevel.startsWith('.env.')
    || normalized === 'public/upload'
    || normalized.startsWith('public/upload/')
    || normalized === 'public/uploads'
    || normalized.startsWith('public/uploads/')
    || normalized === 'public/uploadfile'
    || normalized.startsWith('public/uploadfile/');
}

export function isFormalReleaseMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  if (metadata.release === true) {
    return /^[a-f0-9]{7,40}$/i.test(String(metadata.commit || ''));
  }

  // 兼容引入 release 字段前由正式发布脚本生成的历史附件。
  return metadata.release !== false
    && /^[a-f0-9]{7,40}$/i.test(String(metadata.commit || ''));
}

export function isUpdateableBuildMetadata(metadata) {
  return Boolean(
    metadata
    && typeof metadata === 'object'
    && metadata.updateable === true
    && /^[a-f0-9]{7,40}$/i.test(String(metadata.commit || ''))
  );
}
