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
  // 修改：上传到 html/uploads/images/ 目录
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
      fsDir: 'uploads/images/news',
      urlPrefix: '/uploads/images/news'
    };
  }

  if (uploadType === 'richtext_image') {
    return {
      uploadType: 'richtext_image',
      fsDir: 'uploads/images/richtext',
      urlPrefix: '/uploads/images/richtext'
    };
  }

  return {
    uploadType: 'prod',
    fsDir: 'uploads/images/products',
    urlPrefix: '/uploads/images/products'
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

  // 兼容旧路径：从 public/upload/ 查找
  const publicCandidates = resolvePublicUploadCandidates(normalized);
  for (const candidate of publicCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  // 兼容旧路径：从 html/uploadfile/ 查找
  const legacyCandidates = resolveDirectUploadCandidates(normalized);
  for (const candidate of legacyCandidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return newCandidates[0] || publicCandidates[0] || legacyCandidates[0] || null;
}

function resolveNewUploadCandidates(normalized) {
  const uploadsRoot = path.resolve(CONTENT_ROOT, 'uploads/images');
  const stripped = normalized.replace(/^\/+/, '');
  const segments = stripped.split('/').filter(Boolean);

  // 新格式：/uploads/images/products/xxx.jpg, /uploads/images/news/xxx.jpg, /uploads/images/richtext/xxx.jpg
  if (segments.length >= 3 && segments[0].toLowerCase() === 'uploads' && segments[1].toLowerCase() === 'images') {
    segments[0] = 'uploads';
    segments[1] = 'images';
    segments[2] = segments[2].toLowerCase();
    const filePath = path.resolve(CONTENT_ROOT, segments.join('/'));
    return isInsideUploadsRoot(filePath, uploadsRoot) ? [filePath] : [];
  }

  // 单个文件名，尝试所有上传目录
  if (segments.length === 1 && /\.[a-z0-9]+$/i.test(segments[0])) {
    return [
      path.resolve(CONTENT_ROOT, 'uploads/images/products', segments[0]),
      path.resolve(CONTENT_ROOT, 'uploads/images/news', segments[0]),
      path.resolve(CONTENT_ROOT, 'uploads/images/richtext', segments[0])
    ].filter((filePath) => isInsideUploadsRoot(filePath, uploadsRoot));
  }

  return [];
}

function resolvePublicUploadCandidates(normalized) {
  const uploadsRoot = path.resolve(CONTENT_ROOT, 'upload');
  const stripped = normalized.replace(/^\/+/, '');
  const segments = stripped.split('/').filter(Boolean);

  // 旧格式：/upload/products/xxx.jpg, /upload/news/xxx.jpg, /upload/richtext/xxx.jpg
  if (segments.length >= 2 && segments[0].toLowerCase() === 'upload') {
    segments[0] = 'upload';
    segments[1] = segments[1].toLowerCase();
    const filePath = path.resolve(CONTENT_ROOT, segments.join('/'));
    return isInsideUploadsRoot(filePath, uploadsRoot) ? [filePath] : [];
  }

  // 单个文件名，尝试所有上传目录
  if (segments.length === 1 && /\.[a-z0-9]+$/i.test(segments[0])) {
    return [
      path.resolve(CONTENT_ROOT, 'upload/products', segments[0]),
      path.resolve(CONTENT_ROOT, 'upload/news', segments[0]),
      path.resolve(CONTENT_ROOT, 'upload/richtext', segments[0])
    ].filter((filePath) => isInsideUploadsRoot(filePath, uploadsRoot));
  }

  return [];
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
