import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_DIST_ROOT, CONTENT_ROOT, MIME_TYPES, PROJECT_ROOT, PUBLIC_ROOT, UPLOADS_ROOT } from './config.mjs';
import { getLanguageById, listLanguages } from './services/languages.mjs';
import { getSiteConfig } from './services/site.mjs';
import { normalizeLegacyAssetText } from './services/uploads.mjs';

const ADMIN_DEV_SERVER_URL = normalizeDevServerUrl(process.env.ADMIN_DEV_SERVER_URL);

export async function serveStatic(request, reply, options = {}) {
  const pathname = getPathname(request.url);
  const rewrittenPathname = pathname;

  if (isUnsafePath(rewrittenPathname)) {
    return false;
  }

  if (isDisabledStaticPath(rewrittenPathname)) {
    return false;
  }

  if (rewrittenPathname === '/admin' || rewrittenPathname.startsWith('/admin/')) {
    return serveAdminApp(request, reply, rewrittenPathname);
  }

  const sharedUploadHandled = await serveSharedUploads(request, reply, rewrittenPathname);
  if (sharedUploadHandled) {
    return true;
  }

  const contentRoot = resolveRequestContentRoot(request, options);

  const directoryRedirectLocation = await resolveDirectoryIndexRedirectLocation(rewrittenPathname, request, {
    contentRoot
  });
  if (directoryRedirectLocation) {
    reply.redirect(301, directoryRedirectLocation);
    return true;
  }

  const publicHandled = await serveFromCandidates(
    PUBLIC_ROOT,
    getStaticCandidates(rewrittenPathname),
    request,
    reply
  );
  if (publicHandled) {
    return true;
  }

  const contentHandled = await serveFromCandidates(
    contentRoot,
    getStaticCandidates(rewrittenPathname),
    request,
    reply
  );
  if (contentHandled) {
    return true;
  }

  return false;
}

export async function serveNotFoundPage(request, reply, options = {}) {
  const contentRoot = resolveRequestContentRoot(request, options);
  return serveFromCandidates(
    contentRoot,
    ['/404.html'],
    request,
    reply,
    { statusCode: 404 }
  );
}

export async function serveSharedUploads(request, reply, pathname = getPathname(request.url)) {
  if (!isStaticMethod(request.method)) {
    return false;
  }

  const normalized = normalizeSharedUploadPath(pathname);
  if (!normalized) {
    return false;
  }

  return serveFromCandidates(
    UPLOADS_ROOT,
    [normalized],
    request,
    reply
  );
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

export function resolveContentRootByLanguageSite(language) {
  const configuredOutputDir = String(language?.site?.output_dir || '').trim();
  const siteMode = String(language?.site?.site_mode || '').trim();

  if (!configuredOutputDir || configuredOutputDir === 'html') {
    return CONTENT_ROOT;
  }

  if (siteMode === 'standalone') {
    return path.resolve(PROJECT_ROOT, configuredOutputDir);
  }

  return path.resolve(CONTENT_ROOT, configuredOutputDir.slice('html/'.length));
}

function resolveRequestContentRoot(request, options = {}) {
  const overrideRoot = String(options?.contentRoot || '').trim();
  if (overrideRoot) {
    return path.resolve(overrideRoot);
  }

  const languageSiteId = Number.parseInt(String(options?.languageSiteId ?? request.routeOptions?.config?.languageSiteId ?? ''), 10);
  if (Number.isFinite(languageSiteId) && languageSiteId > 0) {
    const language = listLanguages().find((item) => Number(item?.site?.id || 0) === languageSiteId)
      || getLanguageById(languageSiteId);
    if (language) {
      return resolveContentRootByLanguageSite(language);
    }
  }

  return CONTENT_ROOT;
}

async function serveFromCandidates(rootDir, candidates, request, reply, options = {}) {
  for (const candidate of candidates) {
    const handled = await trySendFile(rootDir, candidate, request, reply, options);
    if (handled) {
      return true;
    }
  }
  return false;
}

async function trySendFile(rootDir, candidate, request, reply, options = {}) {
  if (!isStaticMethod(request.method)) {
    return false;
  }

  const resolvedRoot = path.resolve(rootDir);
  const filePath = path.resolve(resolvedRoot, `.${candidate}`);
  if (!filePath.startsWith(resolvedRoot)) {
    return false;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    if (!stats.isFile()) {
      return false;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES.get(ext) || 'application/octet-stream';

    const devHtmlRewriter = shouldRewriteHtmlAssetUrls(contentType)
      ? createDevelopmentHtmlAssetRewriter(request)
      : null;

    if (devHtmlRewriter) {
      const content = await fs.promises.readFile(filePath, 'utf8');
      const rewritten = devHtmlRewriter(content);
      const body = Buffer.from(rewritten, 'utf8');

      reply.type(contentType);
      if (Number.isInteger(options.statusCode) && options.statusCode > 0) {
        reply.code(options.statusCode);
      }
      reply.header('Content-Length', body.byteLength);

      if (request.method === 'HEAD') {
        reply.send();
        return true;
      }

      reply.send(body);
      return true;
    }

    reply.type(contentType);
    if (Number.isInteger(options.statusCode) && options.statusCode > 0) {
      reply.code(options.statusCode);
    }
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

function getSearch(url) {
  const normalized = String(url || '');
  const queryIndex = normalized.indexOf('?');
  if (queryIndex < 0) {
    return '';
  }
  return normalized.slice(queryIndex);
}

function isUnsafePath(pathname) {
  return path.normalize(pathname).includes('..');
}

function isDisabledStaticPath(pathname) {
  return pathname === '/embedded-tools' || pathname.startsWith('/embedded-tools/');
}

function isStaticMethod(method) {
  return method === 'GET' || method === 'HEAD';
}

async function resolveDirectoryIndexRedirectLocation(pathname, request, options = {}) {
  if (!isStaticMethod(request.method)) {
    return '';
  }

  if (!shouldCanonicalizeDirectoryPath(pathname)) {
    return '';
  }

  const contentRoot = path.resolve(String(options.contentRoot || CONTENT_ROOT));
  const candidatePath = `${pathname}/index.html`;

  if (await fileExists(PUBLIC_ROOT, candidatePath) || await fileExists(contentRoot, candidatePath)) {
    return `${pathname}/${getSearch(request.url)}`;
  }

  return '';
}

function shouldCanonicalizeDirectoryPath(pathname) {
  const normalized = String(pathname || '').trim();
  if (!normalized || normalized === '/' || normalized.endsWith('/')) {
    return false;
  }

  if (
    normalized === '/admin'
    || normalized.startsWith('/admin/')
    || normalized === '/api'
    || normalized.startsWith('/api/')
    || normalized === '/embedded-tools'
    || normalized.startsWith('/embedded-tools/')
  ) {
    return false;
  }

  const lastSegment = normalized.split('/').filter(Boolean).pop() || '';
  if (!lastSegment || lastSegment.includes('.')) {
    return false;
  }

  return true;
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
    /^\/([^/]+)\/(css|js|skin|upload|uploads|assets)(\/.*)?$/i
  );

  if (!match) {
    return [];
  }

  const [, , assetDir, suffix = ''] = match;
  const strippedPath = `/${assetDir}${suffix}`;
  return [strippedPath];
}

async function fileExists(rootDir, candidate) {
  const resolvedRoot = path.resolve(rootDir);
  const filePath = path.resolve(resolvedRoot, `.${candidate}`);
  if (!filePath.startsWith(resolvedRoot)) {
    return false;
  }

  try {
    const stats = await fs.promises.stat(filePath);
    return stats.isFile();
  } catch {
    return false;
  }
}

function normalizeSharedUploadPath(pathname) {
  const normalized = String(pathname || '').replace(/\/{2,}/g, '/');
  if (/^\/uploads\/(?:images|skin|pdfs)\//i.test(normalized)) {
    return normalized.replace(/^\/uploads\//i, '/');
  }

  if (/^\/upload\/(?:images|skin|pdfs)\//i.test(normalized)) {
    return normalized.replace(/^\/upload\//i, '/');
  }
  if (/^\/skin\//i.test(normalized)) {
    return normalized;
  }

  return '';
}

function normalizeDevServerUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function shouldRewriteHtmlAssetUrls(contentType) {
  return process.env.NODE_ENV === 'development' && /^text\/html\b/i.test(String(contentType || ''));
}

function createDevelopmentHtmlAssetRewriter(request) {
  const site = getSiteConfig();
  const assetsPort = Number(site?.assets_port || 0);
  if (!Number.isInteger(assetsPort) || assetsPort <= 0) {
    return null;
  }

  const protocol = String(request.protocol || request.headers['x-forwarded-proto'] || 'http').trim() || 'http';
  const hostname = resolveRequestHostname(request);
  if (!hostname) {
    return null;
  }

  const internalBaseUrl = `${protocol}://${formatHostnameForUrl(hostname)}:${assetsPort}`;
  return (html) => normalizeLegacyAssetText(html, {
    ...site,
    assets_public_base_url: internalBaseUrl
  });
}

function resolveRequestHostname(request) {
  const hostHeader = String(request.headers.host || '').trim();
  if (!hostHeader) {
    return '';
  }

  try {
    return new URL(`http://${hostHeader}`).hostname || '';
  } catch {
    return hostHeader.replace(/:\d+$/, '');
  }
}

function formatHostnameForUrl(hostname) {
  if (!hostname.includes(':')) {
    return hostname;
  }
  return hostname.startsWith('[') ? hostname : `[${hostname}]`;
}
