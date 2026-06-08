import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { CONTENT_ROOT, UPLOAD_ALLOWED_EXTENSIONS, UPLOAD_MAX_SIZE_KB } from '../config.mjs';

export function saveUploadedFile(file, options = {}) {
  if (!file) {
    throw new Error('uploadfile is required');
  }

  const extension = String(file.extension || '').toLowerCase();
  if (!UPLOAD_ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('unsupported file type');
  }

  const maxBytes = (options.maxSizeKb || UPLOAD_MAX_SIZE_KB) * 1024;
  if (file.data.length > maxBytes) {
    throw new Error('uploaded file exceeds size limit');
  }

  const target = resolveUploadTarget(options.uploadType);
  const fileName = buildFileName(extension);
  const fsDir = path.join(CONTENT_ROOT, target.fsDir);
  fs.mkdirSync(fsDir, { recursive: true });
  const filePath = path.join(fsDir, fileName);
  fs.writeFileSync(filePath, file.data);

  return {
    fileName,
    relativePath: `${target.urlPrefix}/${fileName}`,
    legacyFileName: fileName,
    uploadType: target.uploadType
  };
}

export function resolveUploadTarget(uploadType) {
  if (uploadType === 'news') {
    return {
      uploadType: 'news',
      fsDir: 'uploadfile/newsuppic',
      urlPrefix: '/UploadFile/Newsuppic'
    };
  }

  return {
    uploadType: 'prod',
    fsDir: 'uploadfile/produppic',
    urlPrefix: '/UploadFile/produppic'
  };
}

export function deleteUploadedFile(relativePath) {
  const filePath = resolveUploadedFilePath(relativePath);
  if (!filePath) {
    return false;
  }

  try {
    fs.unlinkSync(filePath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

function buildFileName(extension) {
  const stamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replaceAll('T', '')
    .replaceAll('.', '')
    .replaceAll('Z', '');
  const suffix = randomBytes(4).toString('hex');
  return `${stamp}_${suffix}${extension}`;
}

function resolveUploadedFilePath(relativePath) {
  const normalized = String(relativePath || '').trim().replaceAll('\\', '/');
  if (!normalized) {
    return null;
  }

  const directCandidates = resolveDirectUploadCandidates(normalized);
  for (const candidate of directCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return directCandidates[0] || null;
}

function resolveDirectUploadCandidates(normalized) {
  const uploadsRoot = path.resolve(CONTENT_ROOT, 'uploadfile');
  const stripped = normalized.replace(/^\/+/, '');
  const segments = stripped.split('/').filter(Boolean);

  if (segments.length === 1 && /\.[a-z0-9]+$/i.test(segments[0])) {
    return [
      path.resolve(CONTENT_ROOT, 'uploadfile/newsuppic', segments[0]),
      path.resolve(CONTENT_ROOT, 'uploadfile/produppic', segments[0])
    ].filter((filePath) => isInsideUploadsRoot(filePath, uploadsRoot));
  }

  if (segments.length >= 2 && segments[0].toLowerCase() === 'aboutuppic') {
    return [
      path.resolve(CONTENT_ROOT, 'uploadfile/newsuppic', segments.slice(1).join('/'))
    ].filter((filePath) => isInsideUploadsRoot(filePath, uploadsRoot));
  }

  if (segments.length < 2 || segments[0].toLowerCase() !== 'uploadfile') {
    return [];
  }

  segments[0] = 'uploadfile';
  segments[1] = segments[1].toLowerCase();
  const filePath = path.resolve(CONTENT_ROOT, segments.join('/'));
  return isInsideUploadsRoot(filePath, uploadsRoot) ? [filePath] : [];
}

function isInsideUploadsRoot(filePath, uploadsRoot) {
  return filePath === uploadsRoot || filePath.startsWith(`${uploadsRoot}${path.sep}`);
}
