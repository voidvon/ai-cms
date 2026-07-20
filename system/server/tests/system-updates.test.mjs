import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

import {
  compareReleaseVersions,
  isFormalReleaseMetadata,
  isProtectedUpdatePath,
  isUpdateableBuildMetadata,
  normalizeReleaseVersion,
  scheduleRequiredRestart
} from '../src/services/system-updates.mjs';

test('规范化 GitHub Release 版本标签', () => {
  assert.equal(normalizeReleaseVersion('v0.1.3'), '0.1.3');
  assert.equal(normalizeReleaseVersion('1.0.0'), '1.0.0');
});

test('按照三段版本号比较新旧版本', () => {
  assert.equal(compareReleaseVersions('0.1.3', '0.1.2'), 1);
  assert.equal(compareReleaseVersions('0.2.0', '0.1.99'), 1);
  assert.equal(compareReleaseVersions('1.0.0', '0.99.99'), 1);
  assert.equal(compareReleaseVersions('v0.1.3', '0.1.3'), 0);
  assert.equal(compareReleaseVersions('0.1.2', '0.1.3'), -1);
});

test('拒绝不符合项目规则的版本号', () => {
  for (const value of ['1.0', '0.1.100', '0.01.0', 'latest']) {
    assert.throws(() => normalizeReleaseVersion(value), /版本号无效/);
  }
});

test('在线更新保护运行数据和上传目录', () => {
  for (const relativePath of [
    'data/site.sqlite',
    'html/index.html',
    'uploads/images/example.webp',
    'public/upload/example.jpg',
    'public/uploads/example.jpg',
    'public/uploadfile/manual.pdf',
    '.env',
    '.env.production',
    '.deploy/server.pid',
    '.updates/backups/example'
  ]) {
    assert.equal(isProtectedUpdatePath(relativePath), true, relativePath);
  }

  assert.equal(isProtectedUpdatePath('system/server/src/server.mjs'), false);
  assert.equal(isProtectedUpdatePath('public/logo.svg'), false);
});

test('只有带提交号的正式发布元数据允许在线更新', () => {
  assert.equal(isFormalReleaseMetadata({ release: true, commit: 'a'.repeat(40) }), true);
  assert.equal(isFormalReleaseMetadata({ commit: 'b'.repeat(40) }), true);
  assert.equal(isFormalReleaseMetadata({ release: false, commit: 'c'.repeat(40) }), false);
  assert.equal(isFormalReleaseMetadata({ release: true, commit: null }), false);
  assert.equal(isFormalReleaseMetadata({ release: true, commit: 'not-a-commit' }), false);
});

test('普通构建带有可信提交号时也允许在线更新', () => {
  assert.equal(isUpdateableBuildMetadata({ updateable: true, commit: 'd'.repeat(40) }), true);
  assert.equal(isUpdateableBuildMetadata({ updateable: false, commit: 'd'.repeat(40) }), false);
  assert.equal(isUpdateableBuildMetadata({ updateable: true, commit: null }), false);
});

test('独立重启守护会等待旧进程退出并启动新进程', async () => {
  const projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-cms-restart-test-'));
  const markerPath = path.join(projectRoot, 'restart.marker');
  await fs.writeFile(
    path.join(projectRoot, 'server.mjs'),
    `import fs from 'node:fs'; fs.writeFileSync(process.env.RESTART_MARKER, 'restarted');\n`
  );

  const oldProcess = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 500)'], {
    stdio: 'ignore'
  });

  await scheduleRequiredRestart({
    projectRoot,
    oldPid: oldProcess.pid,
    nodeBinary: process.execPath,
    terminateCurrent: false,
    env: { ...process.env, RESTART_MARKER: markerPath }
  });

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      assert.equal(await fs.readFile(markerPath, 'utf8'), 'restarted');
      assert.match(await fs.readFile(path.join(projectRoot, '.deploy/server.pid'), 'utf8'), /^\d+\n$/);
      return;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  assert.fail('重启守护没有在预期时间内启动新进程');
});
