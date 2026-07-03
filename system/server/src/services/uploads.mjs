import path from 'node:path';
import { UPLOADS_FILES_ROOT, UPLOADS_IMAGES_ROOT, UPLOADS_PDFS_ROOT, UPLOADS_SKIN_ROOT } from '../config.mjs';

export function resolveUploadedFilePath(relativePath) {
  const normalized = normalizeSupportedUploadPath(relativePath);
  if (!normalized) {
    return null;
  }

  const candidate = resolveUploadCandidate(normalized);
  if (!candidate) {
    return null;
  }
  return candidate;
}

export function normalizeUploadedRelativePath(relativePath) {
  return normalizeSupportedUploadPath(relativePath);
}

export function normalizeLegacyAssetText(value, siteConfig = null, options = {}) {
  const input = String(value ?? '');
  if (!input) {
    return input;
  }

  return input.replace(
    /https?:\/\/[^/\s"'<>]+\/uploads\/(?:images|skin|pdfs|files)\/[^\s"'<>)]*|\/uploads\/(?:images|skin|pdfs|files)\/[^\s"'<>)]*/gi,
    (matched) => resolvePublicAssetUrl(matched, siteConfig, options)
  );
}

export function resolvePublicAssetUrl(relativePath, siteConfig = null, options = {}) {
  const normalized = normalizeUploadedRelativePath(relativePath);
  if (!normalized) {
    return '';
  }
  const baseUrl = resolvePublicAssetBaseUrl(siteConfig, options);
  return baseUrl ? `${baseUrl}${normalized}` : normalized;
}

export function resolveRuntimeAssetUrl(relativePath, siteConfig = null) {
  return resolvePublicAssetUrl(relativePath, siteConfig, { preferInternalInDevelopment: true });
}

export function resolveRuntimeAssetBaseUrl(siteConfig = null) {
  return resolvePublicAssetBaseUrl(siteConfig, { preferInternalInDevelopment: true });
}

export function normalizeRuntimeAssetText(value, siteConfig = null) {
  return normalizeLegacyAssetText(value, siteConfig, { preferInternalInDevelopment: true });
}

function resolvePublicAssetBaseUrl(siteConfig = null, options = {}) {
  if (options.preferInternalInDevelopment && process.env.NODE_ENV === 'development') {
    const internalBaseUrl = resolveInternalAssetBaseUrl(siteConfig);
    if (internalBaseUrl) {
      return internalBaseUrl;
    }
  }

  return String(siteConfig?.assets_public_base_url || '').trim().replace(/\/+$/g, '');
}

function resolveInternalAssetBaseUrl(siteConfig = null) {
  const port = Number(siteConfig?.assets_port || 0);
  if (!Number.isInteger(port) || port <= 0) {
    return '';
  }

  const host = normalizeInternalAssetHost(siteConfig?.assets_bind_host);
  return `http://${formatHostnameForUrl(host)}:${port}`;
}

function normalizeInternalAssetHost(value) {
  const host = String(value || '').trim();
  if (!host || host === '0.0.0.0') {
    return '127.0.0.1';
  }
  if (host === '::' || host === '[::]') {
    return '::1';
  }
  return host.replace(/^\[|\]$/g, '');
}

function formatHostnameForUrl(hostname) {
  return String(hostname || '').includes(':') ? `[${String(hostname).replace(/^\[|\]$/g, '')}]` : hostname;
}

function resolveUploadCandidate(normalized) {
  const match = normalized.match(/^\/uploads\/(images|skin|pdfs|files)\/(.+)$/i);
  if (!match) {
    return null;
  }

  const bucket = String(match[1] || '').toLowerCase();
  const relativeRest = String(match[2] || '').replace(/^\/+/, '');
  if (!relativeRest) {
    return null;
  }

  const root = bucket === 'images'
    ? path.resolve(UPLOADS_IMAGES_ROOT)
    : bucket === 'files'
      ? path.resolve(UPLOADS_FILES_ROOT)
    : bucket === 'skin'
      ? path.resolve(UPLOADS_SKIN_ROOT)
      : path.resolve(UPLOADS_PDFS_ROOT);
  const filePath = path.resolve(root, relativeRest);
  return isInsideUploadsRoot(filePath, root) ? filePath : null;
}

function isInsideUploadsRoot(filePath, uploadsRoot) {
  return filePath === uploadsRoot || filePath.startsWith(`${uploadsRoot}${path.sep}`);
}

function normalizeSupportedUploadPath(relativePath) {
  const normalized = String(relativePath || '').trim().replaceAll('\\', '/');
  if (!normalized) {
    return '';
  }

  const matched = normalized.match(/^https?:\/\/[^/]+(\/uploads\/(?:images|skin|pdfs|files)\/[^?#]*)([?#].*)?$/i);
  if (matched) {
    return canonicalizeUploadsPath(`${matched[1]}${matched[2] || ''}`);
  }

  if (!/^\/uploads\/(?:images|skin|pdfs|files)\//i.test(normalized)) {
    return '';
  }

  return canonicalizeUploadsPath(normalized);
}

function canonicalizeUploadsPath(normalized) {
  const matched = normalized.match(/^([^?#]+)([?#].*)?$/);
  const pathname = matched?.[1] || normalized;
  const suffix = matched?.[2] || '';
  const canonical = pathname.replace(/^\/uploads\/(images|skin|pdfs|files)\//i, (_, bucket) => `/uploads/${String(bucket).toLowerCase()}/`);
  return canonical + suffix;
}
