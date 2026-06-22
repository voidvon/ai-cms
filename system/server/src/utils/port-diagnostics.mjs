import { execFileSync } from 'node:child_process';

export function describePortConflict(port) {
  const safePort = Number.parseInt(String(port || ''), 10);
  if (!Number.isInteger(safePort) || safePort <= 0) {
    return '';
  }

  try {
    const output = execFileSync(
      '/usr/sbin/lsof',
      ['-nP', '-iTCP:' + safePort, '-sTCP:LISTEN'],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }
    ).trim();

    if (!output) {
      return '';
    }

    const lines = output.split('\n').filter(Boolean);
    if (lines.length <= 1) {
      return '';
    }

    const details = lines
      .slice(1, 4)
      .map((line) => line.trim().replace(/\s+/g, ' '))
      .join(' | ');

    return details ? ` 端口占用进程: ${details}` : '';
  } catch {
    return '';
  }
}

export function withPortConflictDetails(error, port) {
  if (!isAddressInUseError(error)) {
    return error;
  }

  const detail = describePortConflict(port);
  if (!detail) {
    return error;
  }

  const wrapped = new Error(`${error.message}${detail}`);
  wrapped.name = error.name || 'Error';
  wrapped.code = error.code;
  wrapped.cause = error;
  return wrapped;
}

function isAddressInUseError(error) {
  return String(error?.code || '').trim() === 'EADDRINUSE';
}
