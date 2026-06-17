import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;
const useProcessGroups = process.platform !== 'win32';

startProcess('server', 'npm', ['--prefix', 'system/server', 'run', 'dev'], {
  ADMIN_DEV_SERVER_URL: process.env.ADMIN_DEV_SERVER_URL || 'http://127.0.0.1:5173'
});
startProcess('admin', 'npm', ['--prefix', 'system/admin', 'run', 'dev']);

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('exit', () => shutdown(0));

function startProcess(name, command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    detached: useProcessGroups,
    env: {
      ...process.env,
      ...extraEnv
    }
  });

  children.push(child);

  child.on('exit', (code, signal) => {
    if (shuttingDown) {
      return;
    }

    if (signal) {
      console.error(`[dev:${name}] exited with signal ${signal}`);
      shutdown(1);
      return;
    }

    if (code !== 0) {
      console.error(`[dev:${name}] exited with code ${code}`);
      shutdown(code || 1);
    }
  });

  child.on('error', (error) => {
    if (shuttingDown) {
      return;
    }
    console.error(`[dev:${name}] failed to start: ${error.message}`);
    shutdown(1);
  });
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  for (const child of children) {
    terminateChildTree(child, 'SIGTERM');
  }

  setTimeout(() => {
    for (const child of children) {
      terminateChildTree(child, 'SIGKILL');
    }
    process.exit(exitCode);
  }, 300).unref();
}

function terminateChildTree(child, signal) {
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
      console.error(`[dev] failed to send ${signal}: ${error.message}`);
    }
  }
}
