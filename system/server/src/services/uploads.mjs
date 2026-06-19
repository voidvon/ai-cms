import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, UPLOADS_IMAGES_ROOT } from '../config.mjs';

let migratedUploadIndex = null;

export function resolveUploadedFilePath(relativePath) {
  const normalized = String(relativePath || '').trim().replaceAll('\\', '/');
  if (!normalized) {
    return null;
  }

  // 新路径：从 html/uploads/images/ 查找
  const newCandidates = resolveNewUploadCandidates(normalized);
  for (const candidate of newCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  const migratedCandidate = resolveMigratedUploadCandidate(normalized);
  if (migratedCandidate) {
    return migratedCandidate;
  }

  return newCandidates[0] || null;
}

export function normalizeUploadedRelativePath(relativePath) {
  const normalized = String(relativePath || '').trim().replaceAll('\\', '/');
  if (!normalized) {
    return '';
  }

  if (/^\/uploads\/images\/\d{6}\//i.test(normalized)) {
    return normalized;
  }

  const resolvedFilePath = resolveUploadedFilePath(normalized);
  if (!resolvedFilePath) {
    return normalized;
  }

  const contentUploadsRoot = path.resolve(UPLOADS_IMAGES_ROOT);
  if (resolvedFilePath === contentUploadsRoot || !resolvedFilePath.startsWith(`${contentUploadsRoot}${path.sep}`)) {
    return normalized;
  }

  const relativeToUploadsRoot = path.relative(contentUploadsRoot, resolvedFilePath).replaceAll(path.sep, '/');
  return relativeToUploadsRoot ? `/uploads/images/${relativeToUploadsRoot}` : normalized;
}

function resolveNewUploadCandidates(normalized) {
  const uploadsRoot = path.resolve(UPLOADS_IMAGES_ROOT);
  const stripped = normalized.replace(/^\/+/, '');
  const segments = stripped.split('/').filter(Boolean);

  if (segments.length >= 3 && segments[0].toLowerCase() === 'uploads' && segments[1].toLowerCase() === 'images') {
    segments[0] = 'uploads';
    segments[1] = 'images';
    const filePath = path.resolve(CONTENT_ROOT, segments.join('/'));
    return isInsideUploadsRoot(filePath, uploadsRoot) ? [filePath] : [];
  }

  if (segments.length === 1 && /\.[a-z0-9]+$/i.test(segments[0])) {
    const migratedCandidate = findMigratedUploadByBasename(segments[0]);
    return migratedCandidate ? [migratedCandidate] : [];
  }

  return [];
}

function resolveMigratedUploadCandidate(normalized) {
  const stripped = normalized.replace(/^\/+/, '');
  const segments = stripped.split('/').filter(Boolean);
  if (segments.length === 0) {
    return null;
  }

  const firstSegment = segments[0].toLowerCase();
  const isLegacyImagesPath =
    firstSegment === 'images'
    && String(segments[1] || '').toLowerCase() === 'global'
    && String(segments[2] || '').toLowerCase() === 'products';

  if (!['uploadfile', 'upload', 'aboutuppic'].includes(firstSegment) && !isLegacyImagesPath) {
    return null;
  }

  const filename = segments[segments.length - 1];
  if (!/\.[a-z0-9]+$/i.test(filename)) {
    return null;
  }

  return findMigratedUploadByBasename(filename);
}

function findMigratedUploadByBasename(filename) {
  const normalizedName = String(filename || '').trim().toLowerCase();
  if (!normalizedName) {
    return null;
  }

  if (!migratedUploadIndex) {
    migratedUploadIndex = buildMigratedUploadIndex();
  }

  const matches = migratedUploadIndex.get(normalizedName);
  return matches?.[0] || null;
}

function buildMigratedUploadIndex() {
  const uploadsRoot = path.resolve(UPLOADS_IMAGES_ROOT);
  const index = new Map();

  if (!fs.existsSync(uploadsRoot)) {
    return index;
  }

  const stack = [uploadsRoot];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }

      const key = entry.name.toLowerCase();
      const existing = index.get(key);
      if (existing) {
        existing.push(entryPath);
      } else {
        index.set(key, [entryPath]);
      }
    }
  }

  return index;
}

function isInsideUploadsRoot(filePath, uploadsRoot) {
  return filePath === uploadsRoot || filePath.startsWith(`${uploadsRoot}${path.sep}`);
}
