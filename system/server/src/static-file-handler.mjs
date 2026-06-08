import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_DIST_ROOT, CONTENT_ROOT, MIME_TYPES } from './config.mjs';

export async function serveStatic(request, reply) {
  const pathname = getPathname(request.url);

  if (isUnsafePath(pathname)) {
    return false;
  }

  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return serveAdminApp(request, reply, pathname);
  }

  const contentHandled = await serveFromCandidates(
    CONTENT_ROOT,
    getStaticCandidates(pathname),
    request,
    reply
  );
  if (contentHandled) {
    return true;
  }
  return false;
}

export async function serveAdminApp(request, reply, pathname = getPathname(request.url)) {
  if (!isStaticMethod(request.method)) {
    return false;
  }

  const subPath = pathname === '/admin' ? '/' : pathname.slice('/admin'.length) || '/';
  const normalizedSubPath = subPath.startsWith('/') ? subPath : `/${subPath}`;

  if (normalizedSubPath !== '/' && normalizedSubPath !== '/index.html') {
    const assetHandled = await serveFromCandidates(
      ADMIN_DIST_ROOT,
      [normalizedSubPath],
      request,
      reply
    );
    if (assetHandled) {
      return true;
    }
  }

  return serveFromCandidates(ADMIN_DIST_ROOT, ['/index.html'], request, reply);
}

async function serveFromCandidates(rootDir, candidates, request, reply) {
  for (const candidate of candidates) {
    const handled = await trySendFile(rootDir, candidate, request, reply);
    if (handled) {
      return true;
    }
  }
  return false;
}

async function trySendFile(rootDir, candidate, request, reply) {
  if (!isStaticMethod(request.method)) {
    return false;
  }

  const filePath = path.resolve(rootDir, `.${candidate}`);
  if (!filePath.startsWith(rootDir)) {
    return false;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';

    reply.type(contentType);
    reply.header('Content-Length', stats.size);

    if (request.method === 'HEAD') {
      reply.send();
      return true;
    }

    const content = await fs.promises.readFile(filePath);
    reply.send(content);
    return true;
  } catch {
    return false;
  }
}

function getPathname(url) {
  return url.split('?')[0];
}

function isUnsafePath(pathname) {
  return path.normalize(pathname).includes('..');
}

function isStaticMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

function getStaticCandidates(pathname) {
  const candidates = [];

  candidates.push(pathname);

  const lowerPath = pathname.toLowerCase();
  if (lowerPath !== pathname) {
    candidates.push(lowerPath);
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const capitalizedPath = '/' + segments
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join('/');
    if (capitalizedPath !== pathname && capitalizedPath !== lowerPath) {
      candidates.push(capitalizedPath);
    }
  }

  if (pathname.endsWith('/')) {
    candidates.push(`${pathname}index.html`);
    candidates.push(`${lowerPath}index.html`);
  }

  return [...new Set(candidates)];
}
