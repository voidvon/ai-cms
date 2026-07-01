import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_UPLOAD_MAX_SIZE_KB,
  MIME_TYPES,
  UPLOADS_FILES_ROOT,
  UPLOADS_IMAGES_ROOT,
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_MAX_SIZE_KB,
} from '../config.mjs';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';

const PURPOSE_TARGETS = {
  product_cover: {
    purpose: 'product_cover',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  news_cover: {
    purpose: 'news_cover',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  richtext_image: {
    purpose: 'richtext_image',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  column_image: {
    purpose: 'column_image',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  document_stamp: {
    purpose: 'document_stamp',
    mimeFallback: 'image/png',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  attachment: {
    purpose: 'attachment',
    mimeFallback: 'application/octet-stream',
    bucket: 'files',
    root: UPLOADS_FILES_ROOT,
    allowedExtensions: ATTACHMENT_ALLOWED_EXTENSIONS,
    maxSizeKb: ATTACHMENT_UPLOAD_MAX_SIZE_KB,
  },
};

let schemaEnsured = false;

export function ensureMediaAssetsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS media_assets (
      id INTEGER PRIMARY KEY,
      storage_driver TEXT NOT NULL DEFAULT 'local',
      purpose TEXT NOT NULL,
      original_name TEXT,
      mime_type TEXT,
      file_ext TEXT,
      file_size INTEGER NOT NULL DEFAULT 0,
      relative_path TEXT NOT NULL UNIQUE,
      fs_path TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_media_assets_purpose ON media_assets(purpose, id);
    CREATE INDEX IF NOT EXISTS idx_media_assets_status ON media_assets(status, id);
  `);

  schemaEnsured = true;
}

export function uploadMediaAsset({ buffer, originalFilename, purpose }) {
  ensureMediaAssetsSchema();

  const normalizedPurpose = resolvePurpose(purpose);
  const target = PURPOSE_TARGETS[normalizedPurpose];
  const extension = path.extname(String(originalFilename || '')).toLowerCase();
  if (!target.allowedExtensions.has(extension)) {
    throw new Error('unsupported file type');
  }

  const maxBytes = target.maxSizeKb * 1024;
  if (!buffer || buffer.length > maxBytes) {
    throw new Error('uploaded file exceeds size limit');
  }

  const monthSegment = getUploadMonthSegment();
  const fileName = buildFileName(extension);
  const fsDir = path.join(target.root, monthSegment);
  fs.mkdirSync(fsDir, { recursive: true });
  const fsPath = path.join(fsDir, fileName);
  fs.writeFileSync(fsPath, buffer);

  const relativePath = `/uploads/${target.bucket}/${monthSegment}/${fileName}`;
  const result = execute(
    `
      INSERT INTO media_assets (
        storage_driver,
        purpose,
        original_name,
        mime_type,
        file_ext,
        file_size,
        relative_path,
        fs_path,
        status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `,
    [
      'local',
      normalizedPurpose,
      String(originalFilename || ''),
      MIME_TYPES.get(extension) || target.mimeFallback,
      extension,
      buffer.length,
      relativePath,
      fsPath,
    ],
  );

  return getMediaAssetById(result.lastInsertRowid);
}

export function getMediaAssetById(id) {
  ensureMediaAssetsSchema();
  return queryOne(
    `
      SELECT
        id,
        storage_driver,
        purpose,
        original_name,
        mime_type,
        file_ext,
        file_size,
        relative_path,
        fs_path,
        status,
        created_at
      FROM media_assets
      WHERE id = ?
    `,
    [id],
  );
}

export function listMediaAssets({ page = 1, limit = 50, purpose, status } = {}) {
  ensureMediaAssetsSchema();

  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 50, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const whereParts = [];
  const params = [];

  if (purpose && purpose !== 'all') {
    whereParts.push('purpose = ?');
    params.push(resolvePurpose(purpose));
  }

  if (status && status !== 'all') {
    whereParts.push('status = ?');
    params.push(normalizeStatus(status));
  }

  const whereSql = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';
  const items = queryAll(
    `
      SELECT
        id,
        storage_driver,
        purpose,
        original_name,
        mime_type,
        file_ext,
        file_size,
        relative_path,
        fs_path,
        status,
        created_at
      FROM media_assets
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset],
  ).map((item) => ({
    ...item,
    file_exists: fs.existsSync(item.fs_path),
  }));

  const total = queryOne(
    `
      SELECT COUNT(*) AS count
      FROM media_assets
      ${whereSql}
    `,
    params,
  )?.count || 0;

  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1),
    },
  };
}

export function markMediaAssetStatusByPath(relativePath, status) {
  ensureMediaAssetsSchema();
  const normalizedPath = String(relativePath || '').trim();
  if (!normalizedPath || !['active', 'orphaned'].includes(String(status || ''))) {
    return;
  }

  execute(
    `
      UPDATE media_assets
      SET status = ?
      WHERE relative_path = ?
    `,
    [status, normalizedPath],
  );
}

export function cleanupOrphanedMediaAssets({ purpose } = {}) {
  ensureMediaAssetsSchema();

  const whereParts = ['status = ?'];
  const params = ['orphaned'];

  if (purpose && purpose !== 'all') {
    whereParts.push('purpose = ?');
    params.push(resolvePurpose(purpose));
  }

  const items = queryAll(
    `
      SELECT id, relative_path, fs_path
      FROM media_assets
      WHERE ${whereParts.join(' AND ')}
      ORDER BY id ASC
    `,
    params,
  );

  let deletedFiles = 0;
  let deletedRows = 0;

  for (const item of items) {
    if (item.fs_path && fs.existsSync(item.fs_path)) {
      fs.unlinkSync(item.fs_path);
      deletedFiles += 1;
    }
    execute('DELETE FROM media_assets WHERE id = ?', [item.id]);
    deletedRows += 1;
  }

  return {
    deletedFiles,
    deletedRows,
  };
}

function resolvePurpose(value) {
  const purpose = String(value || '').trim();
  if (purpose in PURPOSE_TARGETS) {
    return purpose;
  }
  return 'attachment';
}

function normalizeStatus(value) {
  return String(value || '').trim() === 'orphaned' ? 'orphaned' : 'active';
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

function getUploadMonthSegment(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}
