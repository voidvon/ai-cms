import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_DIST_ROOT, CONTENT_ROOT, PUBLIC_ROOT, MIME_TYPES } from './config.mjs';

const ADMIN_DEV_SERVER_URL = normalizeDevServerUrl(process.env.ADMIN_DEV_SERVER_URL);

export async function serveStatic(request, reply) {
  const pathname = getPathname(request.url);
  const rewrittenPathname = rewriteLegacyStaticPath(pathname);

  if (isUnsafePath(rewrittenPathname)) {
    return false;
  }

  if (rewrittenPathname === '/admin' || rewrittenPathname.startsWith('/admin/')) {
    return serveAdminApp(request, reply, rewrittenPathname);
  }

  // 优先从 public/ 目录查找静态资源
  const publicHandled = await serveFromCandidates(
    PUBLIC_ROOT,
    getStaticCandidates(rewrittenPathname),
    request,
    reply
  );
  if (publicHandled) {
    return true;
  }

  // 然后从 html/ 目录查找生成的内容
  const contentHandled = await serveFromCandidates(
    CONTENT_ROOT,
    getStaticCandidates(rewrittenPathname),
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

  if (ADMIN_DEV_SERVER_URL) {
    reply.redirect(`${ADMIN_DEV_SERVER_URL}${pathname}`);
    return true;
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

  for (const sharedCandidate of getSharedAssetCandidates(pathname)) {
    candidates.push(sharedCandidate);
  }

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

function getSharedAssetCandidates(pathname) {
  const normalized = String(pathname || '').replace(/\/{2,}/g, '/');
  const match = normalized.match(
    /^\/([^/]+)\/(css|js|images|img|skin|uploadfile|upload|assets)(\/.*)?$/i
  );

  if (!match) {
    return [];
  }

  const [, , assetDir, suffix = ''] = match;
  const strippedPath = `/${assetDir}${suffix}`;
  const candidates = [strippedPath];

  const rewrittenStrippedPath = rewriteLegacyStaticPath(strippedPath);
  if (rewrittenStrippedPath !== strippedPath) {
    candidates.push(rewrittenStrippedPath);
  }

  return candidates;
}

function normalizeDevServerUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function rewriteLegacyStaticPath(pathname) {
  const normalized = String(pathname || '').replace(/\/{2,}/g, '/');

  if (/^\/img\/css\.css$/i.test(normalized)) {
    return '/skin/css.css';
  }
  if (/^\/img\/(.+)$/i.test(normalized)) {
    return normalized.replace(/^\/img\//i, '/images/');
  }
  if (/^\/js\/(.+)$/i.test(normalized)) {
    return normalized.replace(/^\/js\//i, '/js/');
  }
  if (/^\/js$/i.test(normalized)) {
    return '/js';
  }
  if (/^\/uploadfile\/(.+)$/i.test(normalized)) {
    const suffix = normalized.replace(/^\/uploadfile\//i, '');
    return `/uploadfile/${suffix}`;
  }
  if (/^\/uploadfile$/i.test(normalized)) {
    return '/uploadfile';
  }
  if (/^\/skin\/blue\/images\/(.+)$/i.test(normalized)) {
    return normalized.replace(/^\/skin\/blue\/images\//i, '/skin/blue/images/');
  }
  if (/^\/skin\/blue\/(.+)$/i.test(normalized)) {
    return normalized.replace(/^\/skin\/blue\//i, '/skin/blue/');
  }
  if (/^\/skin\/(.+)$/i.test(normalized)) {
    return normalized.replace(/^\/skin\//i, '/skin/');
  }

  return normalized;
}
