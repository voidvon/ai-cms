import { spawn } from 'node:child_process';
import { setPriority } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EVENT_MARKER = '__STATIC_BUILD_EVENT__';
const RESULT_MARKER = '__STATIC_BUILD_RESULT__';
const BUILD_NICE_PRIORITY = 10;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..', '..');
const BUILD_SCRIPT_PATH = path.join(SERVER_ROOT, 'scripts', 'build-static.mjs');

let activeBuild = null;

export function getActiveStaticBuild() {
  if (!activeBuild) {
    return null;
  }

  return {
    startedAt: activeBuild.startedAt,
    pid: activeBuild.pid,
    options: activeBuild.options
  };
}

export function subscribeActiveStaticBuild(listener) {
  if (!activeBuild?.subscribe || typeof listener !== 'function') {
    return null;
  }

  return activeBuild.subscribe(listener);
}

export async function runStaticBuild(options = {}) {
  if (activeBuild) {
    const error = new Error('静态生成正在执行，请等待当前任务完成后再试');
    error.code = 'STATIC_BUILD_IN_PROGRESS';
    error.statusCode = 409;
    throw error;
  }

  const normalizedOptions = normalizeBuildOptions(options);
  const state = {
    startedAt: new Date().toISOString(),
    pid: null,
    options: normalizedOptions
  };

  const buildPromise = spawnStaticBuildProcess(normalizedOptions, state);
  activeBuild = state;

  try {
    return await buildPromise;
  } finally {
    if (activeBuild === state) {
      activeBuild = null;
    }
  }
}

function spawnStaticBuildProcess(options, state) {
  const args = [BUILD_SCRIPT_PATH, '--json'];

  if (Array.isArray(options.sections) && options.sections.length === 1) {
    args.push(`--section=${options.sections[0]}`);
  }
  if (options.languageCode) {
    args.push(`--language=${options.languageCode}`);
  }
  if (options.outputRoot) {
    args.push(`--output-dir=${options.outputRoot}`);
  }
  args.push(`--clean-existing=${options.cleanExisting ? 'true' : 'false'}`);

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: SERVER_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    state.pid = child.pid || null;
    state.listeners = new Set();
    state.subscribe = (listener) => {
      state.listeners.add(listener);
      return () => {
        state.listeners.delete(listener);
      };
    };
    lowerChildPriority(child.pid);

    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdout += text;
      stdoutBuffer += text;

      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        handleChildStdoutLine(line, state.listeners);
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        const error = new Error(extractBuildFailureMessage(stderr, stdout, code));
        error.code = 'STATIC_BUILD_FAILED';
        error.statusCode = 500;
        reject(error);
        return;
      }

      try {
        resolve(extractBuildResult(stdout));
      } catch (error) {
        error.code = 'STATIC_BUILD_INVALID_RESULT';
        error.statusCode = 500;
        reject(error);
      }
    });
  });
}

function lowerChildPriority(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
  }

  try {
    setPriority(pid, BUILD_NICE_PRIORITY);
  } catch {
    // 优先保证兼容性，降优先级失败时仍允许构建继续执行。
  }
}

function extractBuildResult(stdout) {
  const markerLine = stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith(RESULT_MARKER));

  if (!markerLine) {
    throw new Error('静态生成结果解析失败');
  }

  return JSON.parse(markerLine.slice(RESULT_MARKER.length));
}

function handleChildStdoutLine(line, listeners) {
  const normalizedLine = String(line || '');
  if (!normalizedLine.startsWith(EVENT_MARKER)) {
    return;
  }

  try {
    const event = JSON.parse(normalizedLine.slice(EVENT_MARKER.length));
    for (const listener of listeners || []) {
      try {
        listener(event);
      } catch {
        // 单个监听器失败不影响构建和其他监听器。
      }
    }
  } catch {
    // 解析失败时忽略该事件，避免影响构建结果。
  }
}

function extractBuildFailureMessage(stderr, stdout, code) {
  const output = `${stderr}\n${stdout}`.trim();
  if (!output) {
    return `静态生成失败，退出码 ${code}`;
  }

  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.slice(-12).join('\n');
}

function normalizeBuildOptions(options) {
  return {
    sections: Array.isArray(options.sections)
      ? options.sections.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    languageCode: normalizeOptionalString(options.languageCode),
    outputRoot: normalizeOptionalString(options.outputRoot),
    cleanExisting: options.cleanExisting === undefined ? true : Boolean(options.cleanExisting)
  };
}

function normalizeOptionalString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}
