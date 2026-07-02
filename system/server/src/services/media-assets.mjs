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
      usage_references_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_media_assets_purpose ON media_assets(purpose, id);
  `);

  addColumnIfMissing('media_assets', 'usage_references_json', `TEXT NOT NULL DEFAULT '[]'`);

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
        usage_references_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]')
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
        usage_references_json,
        created_at
      FROM media_assets
      WHERE id = ?
    `,
    [id],
  );
}

export function listMediaAssets({ page = 1, limit = 50, purpose, usage } = {}) {
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

  const usageFilter = usage;
  if (usageFilter && usageFilter !== 'all') {
    if (normalizeUsageFilter(usageFilter) === 'empty') {
      whereParts.push(`(usage_references_json IS NULL OR TRIM(usage_references_json) = '' OR TRIM(usage_references_json) = '[]')`);
    } else {
      whereParts.push(`(usage_references_json IS NOT NULL AND TRIM(usage_references_json) NOT IN ('', '[]'))`);
    }
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
        usage_references_json,
        created_at
      FROM media_assets
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset],
  ).map((item) => decorateMediaAsset(item));

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

export function deleteMediaAsset(id, { force = false } = {}) {
  ensureMediaAssetsSchema();

  const asset = getMediaAssetById(id);
  if (!asset) {
    const error = new Error('附件不存在');
    error.statusCode = 404;
    throw error;
  }

  const usageReferences = refreshMediaAssetUsageReferences(asset);
  if (usageReferences.length > 0 && !force) {
    const error = new Error('附件仍在使用中，不能删除');
    error.statusCode = 409;
    error.usageReferences = usageReferences;
    throw error;
  }

  let deletedFile = false;
  if (asset.fs_path && fs.existsSync(asset.fs_path)) {
    fs.unlinkSync(asset.fs_path);
    deletedFile = true;
  }

  execute('DELETE FROM media_assets WHERE id = ?', [asset.id]);

  return {
    deletedFile,
    deletedRow: true,
    usageReferences,
  };
}

export function cleanupOrphanedMediaAssets({ purpose } = {}) {
  ensureMediaAssetsSchema();

  const whereParts = [`(usage_references_json IS NULL OR TRIM(usage_references_json) = '' OR TRIM(usage_references_json) = '[]')`];
  const params = [];

  if (purpose && purpose !== 'all') {
    whereParts.push('purpose = ?');
    params.push(resolvePurpose(purpose));
  }

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
        usage_references_json,
        created_at
      FROM media_assets
      WHERE ${whereParts.join(' AND ')}
      ORDER BY id ASC
    `,
    params,
  );

  let deletedFiles = 0;
  let deletedRows = 0;

  for (const item of items) {
    const usageReferences = refreshMediaAssetUsageReferences(item);
    if (usageReferences.length > 0) {
      continue;
    }

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

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`);
  if (columns.some((column) => String(column.name || '') === columnName)) {
    return;
  }
  execute(`ALTER TABLE ${quoteIdentifier(tableName)} ADD COLUMN ${quoteIdentifier(columnName)} ${definition}`);
}

function decorateMediaAsset(item) {
  const usageReferences = parseUsageReferencesJson(item.usage_references_json);

  return {
    ...item,
    file_exists: fs.existsSync(item.fs_path),
    usage_references: usageReferences,
    usage_count: usageReferences.length,
  };
}

function refreshMediaAssetUsageReferences(asset) {
  const usageReferences = findMediaAssetUsageReferences(asset);
  execute(
    `
      UPDATE media_assets
      SET
        usage_references_json = ?
      WHERE id = ?
    `,
    [
      JSON.stringify(usageReferences),
      asset.id,
    ],
  );
  return usageReferences;
}

function parseUsageReferencesJson(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findMediaAssetUsageReferences(asset) {
  const relativePath = String(asset?.relative_path || '').trim();
  if (!relativePath) {
    return [];
  }

  const references = [];
  const seen = new Set();
  const contentModels = queryAll(
    `
      SELECT code, name, source_table
      FROM content_models
      WHERE source_table IS NOT NULL
        AND TRIM(source_table) <> ''
      ORDER BY sort_order ASC, id ASC
    `,
  );
  const modelByMainTable = new Map();
  const modelByTranslationTable = new Map();

  for (const model of contentModels) {
    const tableName = String(model.source_table || '').trim();
    if (!isSafeIdentifier(tableName)) {
      continue;
    }
    modelByMainTable.set(tableName, model);
    modelByTranslationTable.set(`${tableName}_translations`, model);
  }

  const scanTargets = [
    { table: 'columns', label: '栏目', columns: ['name'], scanColumns: ['images'] },
    { table: 'document_stamps', label: '文档印章', columns: ['name'], scanColumns: ['image_path'] },
    { table: 'site_config', label: '站点配置', columns: [], scanColumns: null },
    { table: 'site_config_translations', label: '站点配置翻译', columns: [], scanColumns: null },
    { table: 'templates', label: '模板', columns: ['name', 'code'], scanColumns: ['tsx_source', 'css_source', 'published_tsx_source', 'published_css_source'] },
    { table: 'template_versions', label: '模板历史版本', columns: ['template_id', 'version_no'], scanColumns: ['tsx_source', 'css_source'] },
    ...contentModels.flatMap((model) => {
      const tableName = String(model.source_table || '').trim();
      if (!isSafeIdentifier(tableName)) {
        return [];
      }
      return [
        {
          table: tableName,
          label: `${model.name || model.code}内容`,
          columns: ['name', 'title', 'code'],
          scanColumns: null,
        },
        {
          table: `${tableName}_translations`,
          label: `${model.name || model.code}内容翻译`,
          columns: ['name', 'title'],
          scanColumns: null,
        },
      ];
    }),
  ];

  for (const target of scanTargets) {
    if (!hasTable(target.table)) {
      continue;
    }
    const tableColumns = queryAll(`PRAGMA table_info(${quoteIdentifier(target.table)})`);
    const columnNames = tableColumns.map((column) => String(column.name || '')).filter(Boolean);
    const textColumns = tableColumns
      .filter((column) => shouldScanColumn(column, target.scanColumns))
      .map((column) => String(column.name || ''))
      .filter(Boolean);
    if (textColumns.length === 0) {
      continue;
    }

    const selectColumns = new Set(['id', ...textColumns]);
    for (const column of target.columns || []) {
      if (columnNames.includes(column)) {
        selectColumns.add(column);
      }
    }
    if (columnNames.includes('entry_id')) {
      selectColumns.add('entry_id');
    }
    if (columnNames.includes('language_id')) {
      selectColumns.add('language_id');
    }

    const rows = queryAll(
      `
        SELECT ${Array.from(selectColumns).map((column) => quoteIdentifier(column)).join(', ')}
        FROM ${quoteIdentifier(target.table)}
      `,
    );

    for (const row of rows) {
      for (const column of textColumns) {
        if (!textContainsMediaPath(row[column], relativePath)) {
          continue;
        }

        const reference = buildUsageReference({
          row,
          column,
          target,
          model: modelByMainTable.get(target.table) || modelByTranslationTable.get(target.table) || null,
        });
        const key = `${reference.table}:${reference.record_id}:${reference.field}:${reference.entry_id || ''}:${reference.language_id || ''}`;
        if (!seen.has(key)) {
          seen.add(key);
          references.push(reference);
        }
      }
    }
  }

  return references;
}

function shouldScanColumn(column, explicitColumns) {
  const name = String(column?.name || '');
  if (name === 'relative_path' || name === 'fs_path') {
    return false;
  }
  if (Array.isArray(explicitColumns)) {
    return explicitColumns.includes(name);
  }
  const type = String(column?.type || '').toUpperCase();
  return type.includes('TEXT') || type.includes('CHAR') || type.includes('CLOB');
}

function textContainsMediaPath(value, relativePath) {
  const text = String(value ?? '');
  if (!text) {
    return false;
  }
  return text.includes(relativePath) || text.includes(relativePath.replace(/^\/uploads\//, '/upload/'));
}

function buildUsageReference({ row, column, target, model }) {
  const recordId = Number(row?.id || 0) || null;
  const entryId = Number(row?.entry_id || 0) || null;
  const languageId = Number(row?.language_id || 0) || null;
  const recordName = String(row?.name || row?.title || row?.code || '').trim();
  const titleParts = [target.label];

  if (recordName) {
    titleParts.push(recordName);
  } else if (entryId) {
    titleParts.push(`内容 #${entryId}`);
  } else if (recordId) {
    titleParts.push(`#${recordId}`);
  }

  return {
    table: target.table,
    field: column,
    record_id: recordId,
    entry_id: entryId,
    language_id: languageId,
    label: titleParts.join(' - '),
    model_code: model?.code || null,
    model_name: model?.name || null,
  };
}

function hasTable(tableName) {
  if (!isSafeIdentifier(tableName)) {
    return false;
  }
  return Boolean(queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
    `,
    [tableName],
  ));
}

function isSafeIdentifier(value) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''));
}

function quoteIdentifier(value) {
  const identifier = String(value || '');
  if (!isSafeIdentifier(identifier)) {
    throw new Error(`invalid identifier: ${identifier}`);
  }
  return `"${identifier.replaceAll('"', '""')}"`;
}

function normalizeUsageFilter(value) {
  return String(value || '').trim() === 'orphaned' ? 'empty' : 'present';
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
