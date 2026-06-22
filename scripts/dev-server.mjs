import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import chokidar from 'chokidar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const watchRoot = path.join(projectRoot, 'system/server/src');
const serverEntryPath = path.join(projectRoot, 'system/server/src/server.mjs');
const useProcessGroups = process.platform !== 'win32';
let serverProcess = null;
let restarting = false;
let pendingRestart = false;
let shuttingDown = false;

await startServer();

const watcher = chokidar.watch(watchRoot, {
  ignoreInitial: true,
  usePolling: true,
  interval: 250,
  awaitWriteFinish: {
    stabilityThreshold: 200,
    pollInterval: 100
  }
});

watcher.on('all', async () => {
  if (shuttingDown) {
    return;
  }

  if (restarting) {
    pendingRestart = true;
    return;
  }

  await restartServer();
});

watcher.on('error', (error) => {
  console.error(`[dev:server] watcher error: ${error.message}`);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function startServer() {
  serverProcess = spawn('node', [serverEntryPath], {
    cwd: projectRoot,
    stdio: 'inherit',
    detached: useProcessGroups,
    env: {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV || 'development'
    }
  });

  serverProcess.on('exit', (code, signal) => {
    if (shuttingDown || restarting) {
      return;
    }

    if (signal) {
      console.error(`[dev:server] exited with signal ${signal}`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`[dev:server] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  serverProcess.on('error', (error) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev:server] failed to start: ${error.message}`);
    shutdown(1);
  });
}

async function restartServer() {
  restarting = true;
  if (serverProcess && !serverProcess.killed) {
    await stopServer();
  }
  await startServer();
  restarting = false;

  if (pendingRestart) {
    pendingRestart = false;
    await restartServer();
  }
}

async function stopServer() {
  await new Promise((resolve) => {
    if (!serverProcess || serverProcess.killed) {
      resolve();
      return;
    }

    const target = serverProcess;
    const timer = setTimeout(() => {
      terminateProcessTree(target, 'SIGKILL');
    }, 500);

    target.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });

    terminateProcessTree(target, 'SIGTERM');
  });
}

async function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  await watcher.close();
  await stopServer();
  process.exit(exitCode);
}

function terminateProcessTree(child, signal) {
  if (!child || child.killed) {
    return;
  }

  try {
    if (useProcessGroups && child.pid) {
      process.kill(-child.pid, signal);
      return;
    }
    child.kill(signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      console.error(`[dev:server] failed to send ${signal}: ${error.message}`);
    }
  }
}
