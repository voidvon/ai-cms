import fs from 'node:fs';
import path from 'node:path';
import { UPLOADS_IMAGES_ROOT, UPLOADS_PDFS_ROOT, UPLOADS_SKIN_ROOT } from '../config.mjs';

export function resolveUploadedFilePath(relativePath) {
  const normalized = normalizeSupportedUploadPath(relativePath);
  if (!normalized) {
    return null;
  }

  const candidate = resolveUploadCandidate(normalized);
  if (!candidate) {
    return null;
  }
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  return candidate;
}

export function normalizeUploadedRelativePath(relativePath) {
  return normalizeSupportedUploadPath(relativePath);
}

export function normalizeLegacyAssetText(value, siteConfig = null) {
  const input = String(value ?? '');
  if (!input) {
    return input;
  }

  return input.replace(
    /https?:\/\/[^/\s"'<>]+\/uploads\/(?:images|skin|pdfs)\/[^\s"'<>)]*|\/uploads\/(?:images|skin|pdfs)\/[^\s"'<>)]*/gi,
    (matched) => resolvePublicAssetUrl(matched, siteConfig)
  );
}

export function resolvePublicAssetUrl(relativePath, siteConfig = null) {
  const normalized = normalizeUploadedRelativePath(relativePath);
  if (!normalized) {
    return '';
  }
  const baseUrl = String(siteConfig?.assets_public_base_url || '').trim().replace(/\/+$/g, '');
  return baseUrl ? `${baseUrl}${normalized}` : normalized;
}

function resolveUploadCandidate(normalized) {
  const match = normalized.match(/^\/uploads\/(images|skin|pdfs)\/(.+)$/i);
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

  const matched = normalized.match(/^https?:\/\/[^/]+(\/uploads\/(?:images|skin|pdfs)\/[^?#]*)([?#].*)?$/i);
  if (matched) {
    return canonicalizeUploadsPath(`${matched[1]}${matched[2] || ''}`);
  }

  if (!/^\/uploads\/(?:images|skin|pdfs)\//i.test(normalized)) {
    return '';
  }

  return canonicalizeUploadsPath(normalized);
}

function canonicalizeUploadsPath(normalized) {
  const matched = normalized.match(/^([^?#]+)([?#].*)?$/);
  const pathname = matched?.[1] || normalized;
  const suffix = matched?.[2] || '';
  const canonical = pathname.replace(/^\/uploads\/(images|skin|pdfs)\//i, (_, bucket) => `/uploads/${String(bucket).toLowerCase()}/`);
  return canonical + suffix;
}
