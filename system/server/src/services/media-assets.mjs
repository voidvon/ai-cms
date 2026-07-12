import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  ATTACHMENT_ALLOWED_EXTENSIONS,
  ATTACHMENT_UPLOAD_MAX_SIZE_KB,
  IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
  MIME_TYPES,
  UPLOADS_PDFS_ROOT,
  UPLOADS_FILES_ROOT,
  UPLOADS_IMAGES_ROOT,
  UPLOAD_ALLOWED_EXTENSIONS,
  UPLOAD_MAX_SIZE_KB,
} from '../config.mjs';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { optimizeUploadedImage } from './image-optimizer.mjs';
import { ensureLanguagesSchema, getLanguageById } from './languages.mjs';
import { getSiteConfig } from './site.mjs';
import { resolveRuntimeAssetUrl } from './uploads.mjs';

const PURPOSE_TARGETS = {
  product_cover: {
    purpose: 'product_cover',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  news_cover: {
    purpose: 'news_cover',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  richtext_image: {
    purpose: 'richtext_image',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  column_image: {
    purpose: 'column_image',
    mimeFallback: 'image/jpeg',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  document_stamp: {
    purpose: 'document_stamp',
    mimeFallback: 'image/png',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  ai_generated_image: {
    purpose: 'ai_generated_image',
    mimeFallback: 'image/png',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  ai_input_image: {
    purpose: 'ai_input_image',
    mimeFallback: 'image/png',
    bucket: 'images',
    root: UPLOADS_IMAGES_ROOT,
    allowedExtensions: UPLOAD_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: IMAGE_UPLOAD_SOURCE_MAX_SIZE_KB,
    maxSizeKb: UPLOAD_MAX_SIZE_KB,
  },
  attachment: {
    purpose: 'attachment',
    mimeFallback: 'application/octet-stream',
    bucket: 'files',
    root: UPLOADS_FILES_ROOT,
    allowedExtensions: ATTACHMENT_ALLOWED_EXTENSIONS,
    sourceMaxSizeKb: ATTACHMENT_UPLOAD_MAX_SIZE_KB,
    maxSizeKb: ATTACHMENT_UPLOAD_MAX_SIZE_KB,
  },
  pdf_document: {
    purpose: 'pdf_document',
    mimeFallback: 'application/pdf',
    bucket: 'pdfs',
    root: UPLOADS_PDFS_ROOT,
    allowedExtensions: new Set(['.pdf']),
    sourceMaxSizeKb: ATTACHMENT_UPLOAD_MAX_SIZE_KB,
    maxSizeKb: ATTACHMENT_UPLOAD_MAX_SIZE_KB,
  },
};

const CONVERTIBLE_IMAGE_EXTENSIONS = new Set(['.heic', '.heif']);
const COMPRESSIBLE_ATTACHMENT_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const PDF_DOCUMENT_TYPES = new Set(['sales_brochure', 'installation_guide', 'technical_information']);

let schemaEnsured = false;

export function ensureMediaAssetsSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();

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
      language_id INTEGER,
      pdf_document_type TEXT,
      pdf_title TEXT,
      pdf_document_code TEXT,
      usage_references_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_media_assets_purpose ON media_assets(purpose, id);
  `);

  addColumnIfMissing('media_assets', 'usage_references_json', `TEXT NOT NULL DEFAULT '[]'`);
  addColumnIfMissing('media_assets', 'language_id', 'INTEGER');
  addColumnIfMissing('media_assets', 'pdf_document_type', 'TEXT');
  addColumnIfMissing('media_assets', 'pdf_title', 'TEXT');
  addColumnIfMissing('media_assets', 'pdf_document_code', 'TEXT');

  schemaEnsured = true;
}

export async function uploadMediaAsset({ buffer, originalFilename, purpose, languageId, pdfDocumentType }) {
  ensureMediaAssetsSchema();

  const normalizedPurpose = resolvePurpose(purpose);
  const target = PURPOSE_TARGETS[normalizedPurpose];
  const normalizedLanguageId = normalizeMediaAssetLanguageId(languageId);
  const normalizedPdfDocumentType = normalizePdfDocumentType(pdfDocumentType);
  const inferredPdfTitle = normalizedPurpose === 'pdf_document' ? inferPdfTitleFromFilename(originalFilename) : null;
  const inferredPdfDocumentCode = normalizedPurpose === 'pdf_document' ? inferPdfDocumentCodeFromFilename(originalFilename) : null;
  const extension = path.extname(String(originalFilename || '')).toLowerCase();
  if (!target.allowedExtensions.has(extension)) {
    throw new Error('unsupported file type');
  }

  const sourceMaxBytes = target.sourceMaxSizeKb * 1024;
  const maxBytes = target.maxSizeKb * 1024;
  if (!buffer || buffer.length > sourceMaxBytes) {
    throw new Error('uploaded file exceeds size limit');
  }

  const shouldOptimizeImage = target.bucket === 'images'
    || (normalizedPurpose === 'attachment' && COMPRESSIBLE_ATTACHMENT_IMAGE_EXTENSIONS.has(extension));
  const stored = shouldOptimizeImage
    ? await optimizeUploadedImage({
      buffer,
      extension,
      preserveExtension: normalizedPurpose === 'attachment' && !CONVERTIBLE_IMAGE_EXTENSIONS.has(extension),
    })
    : {
      buffer,
      extension,
      mimeType: MIME_TYPES.get(extension) || target.mimeFallback,
    };
  if (!stored.buffer || stored.buffer.length > maxBytes) {
    throw new Error('uploaded file exceeds size limit after optimization');
  }

  const monthSegment = getUploadMonthSegment();
  const fileName = buildFileName(stored.extension);
  const fsDir = path.join(target.root, monthSegment);
  fs.mkdirSync(fsDir, { recursive: true });
  const fsPath = path.join(fsDir, fileName);
  fs.writeFileSync(fsPath, stored.buffer);

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
        language_id,
        pdf_document_type,
        pdf_title,
        pdf_document_code,
        usage_references_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]')
    `,
    [
      'local',
      normalizedPurpose,
      String(originalFilename || ''),
      stored.mimeType || MIME_TYPES.get(stored.extension) || target.mimeFallback,
      stored.extension,
      stored.buffer.length,
      relativePath,
      fsPath,
      normalizedPurpose === 'pdf_document' ? normalizedLanguageId : null,
      normalizedPurpose === 'pdf_document' ? normalizedPdfDocumentType : null,
      inferredPdfTitle,
      inferredPdfDocumentCode,
    ],
  );

  return getMediaAssetById(result.lastInsertRowid);
}

export async function replaceMediaAssetFile(id, { buffer, originalFilename }) {
  ensureMediaAssetsSchema();

  const asset = getMediaAssetById(id);
  if (!asset) {
    const error = new Error('附件不存在');
    error.statusCode = 404;
    throw error;
  }
  if (asset.storage_driver !== 'local' || !asset.fs_path) {
    const error = new Error('当前资源不支持本地文件替换');
    error.statusCode = 400;
    throw error;
  }

  const target = PURPOSE_TARGETS[resolvePurpose(asset.purpose)];
  const extension = path.extname(String(originalFilename || '')).toLowerCase();
  if (!target.allowedExtensions.has(extension)) {
    const error = new Error('unsupported file type');
    error.statusCode = 400;
    throw error;
  }
  if (!buffer || buffer.length > target.sourceMaxSizeKb * 1024) {
    const error = new Error('uploaded file exceeds size limit');
    error.statusCode = 400;
    throw error;
  }

  const shouldOptimizeImage = target.bucket === 'images'
    || (asset.purpose === 'attachment' && COMPRESSIBLE_ATTACHMENT_IMAGE_EXTENSIONS.has(extension));
  const stored = shouldOptimizeImage
    ? await optimizeUploadedImage({
      buffer,
      extension,
      preserveExtension: asset.purpose === 'attachment' && !CONVERTIBLE_IMAGE_EXTENSIONS.has(extension),
    })
    : {
      buffer,
      extension,
      mimeType: MIME_TYPES.get(extension) || target.mimeFallback,
    };
  if (!stored.buffer || stored.buffer.length > target.maxSizeKb * 1024) {
    const error = new Error('uploaded file exceeds size limit after optimization');
    error.statusCode = 400;
    throw error;
  }
  if (stored.extension !== asset.file_ext) {
    const error = new Error(`替换文件必须保持原扩展名 ${asset.file_ext}`);
    error.statusCode = 400;
    throw error;
  }

  const fsDir = path.dirname(asset.fs_path);
  fs.mkdirSync(fsDir, { recursive: true });
  const temporaryPath = path.join(fsDir, `.${path.basename(asset.fs_path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, stored.buffer);
    fs.renameSync(temporaryPath, asset.fs_path);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }

  execute(
    `
      UPDATE media_assets
      SET original_name = ?, mime_type = ?, file_size = ?, pdf_title = ?, pdf_document_code = ?
      WHERE id = ?
    `,
    [
      String(originalFilename || ''),
      stored.mimeType || MIME_TYPES.get(stored.extension) || target.mimeFallback,
      stored.buffer.length,
      asset.purpose === 'pdf_document' ? inferPdfTitleFromFilename(originalFilename) : asset.pdf_title,
      asset.purpose === 'pdf_document' ? inferPdfDocumentCodeFromFilename(originalFilename) : asset.pdf_document_code,
      asset.id,
    ],
  );

  return getMediaAssetById(asset.id);
}

export function getMediaAssetById(id) {
  ensureMediaAssetsSchema();
  return decorateMediaAsset(queryOne(
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
        language_id,
        pdf_document_type,
        pdf_title,
        pdf_document_code,
        (
          SELECT code
          FROM languages
          WHERE languages.id = media_assets.language_id
        ) AS language_code,
        (
          SELECT name
          FROM languages
          WHERE languages.id = media_assets.language_id
        ) AS language_name,
        usage_references_json,
        created_at
      FROM media_assets
      WHERE id = ?
    `,
    [id],
  ), getSiteConfig());
}

export function listMediaAssets({ page = 1, limit = 50, purpose, usage, q, pdfSearch = false, languageId } = {}) {
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

  const safeLanguageId = Number.parseInt(String(languageId || ''), 10);
  if (Number.isInteger(safeLanguageId) && safeLanguageId > 0) {
    whereParts.push('language_id = ?');
    params.push(safeLanguageId);
  }

  const keyword = String(q || '').trim();
  if (keyword) {
    const keywordParam = `%${keyword}%`;
    if (pdfSearch) {
      whereParts.push(`(
        original_name LIKE ?
        OR pdf_title LIKE ?
        OR pdf_document_code LIKE ?
      )`);
      params.push(keywordParam, keywordParam, keywordParam);
    } else {
      whereParts.push(`(
        original_name LIKE ?
        OR relative_path LIKE ?
        OR mime_type LIKE ?
        OR pdf_document_type LIKE ?
        OR pdf_title LIKE ?
        OR pdf_document_code LIKE ?
      )`);
      params.push(keywordParam, keywordParam, keywordParam, keywordParam, keywordParam, keywordParam);
    }
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
  const siteConfig = getSiteConfig();
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
        language_id,
        pdf_document_type,
        pdf_title,
        pdf_document_code,
        (
          SELECT code
          FROM languages
          WHERE languages.id = media_assets.language_id
        ) AS language_code,
        (
          SELECT name
          FROM languages
          WHERE languages.id = media_assets.language_id
        ) AS language_name,
        usage_references_json,
        created_at
      FROM media_assets
      ${whereSql}
      ORDER BY id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset],
  ).map((item) => decorateMediaAsset(item, siteConfig));

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

export function updateMediaAssetLanguage(id, languageId) {
  ensureMediaAssetsSchema();

  const asset = getMediaAssetById(id);
  if (!asset) {
    const error = new Error('附件不存在');
    error.statusCode = 404;
    throw error;
  }
  if (asset.purpose !== 'pdf_document') {
    const error = new Error('只有 PDF 文档可以设置语言');
    error.statusCode = 400;
    throw error;
  }

  execute(
    `
      UPDATE media_assets
      SET language_id = ?
      WHERE id = ?
    `,
    [normalizeMediaAssetLanguageId(languageId), asset.id],
  );

  return getMediaAssetById(asset.id);
}

export function updateMediaAssetPdfDocumentType(id, pdfDocumentType) {
  ensureMediaAssetsSchema();

  const asset = getMediaAssetById(id);
  if (!asset) {
    const error = new Error('附件不存在');
    error.statusCode = 404;
    throw error;
  }
  if (asset.purpose !== 'pdf_document') {
    const error = new Error('只有 PDF 文档可以设置文档类型');
    error.statusCode = 400;
    throw error;
  }

  execute(
    `
      UPDATE media_assets
      SET pdf_document_type = ?
      WHERE id = ?
    `,
    [normalizePdfDocumentType(pdfDocumentType), asset.id],
  );

  return getMediaAssetById(asset.id);
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
  if (isLocalMediaAsset(asset) && asset.fs_path && fs.existsSync(asset.fs_path)) {
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
        language_id,
        pdf_document_type,
        pdf_title,
        pdf_document_code,
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

    if (isLocalMediaAsset(item) && item.fs_path && fs.existsSync(item.fs_path)) {
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

function decorateMediaAsset(item, siteConfig = null) {
  if (!item) {
    return null;
  }

  const usageReferences = parseUsageReferencesJson(item.usage_references_json);
  const isOriginalUrl = isOriginalPdfAsset(item);
  const isLocalFile = isLocalMediaAsset(item);

  return {
    ...item,
    public_url: resolveMediaAssetPublicUrl(item, siteConfig),
    file_exists: isLocalFile ? fs.existsSync(item.fs_path) : isOriginalUrl,
    is_local_file: isLocalFile,
    is_original_url: isOriginalUrl,
    language_id: item.language_id ? Number(item.language_id) : null,
    language_code: item.language_code || null,
    language_name: item.language_name || null,
    pdf_document_type: item.pdf_document_type || null,
    pdf_title: item.pdf_title || null,
    pdf_document_code: item.pdf_document_code || null,
    usage_references: usageReferences,
    usage_count: usageReferences.length,
  };
}

function resolveMediaAssetPublicUrl(item, siteConfig = null) {
  const relativePath = String(item?.relative_path || '').trim();
  if (!relativePath) {
    return '';
  }
  if (/^(?:https?:)?\/\//i.test(relativePath)) {
    return relativePath;
  }
  if (/^\/uploads\/(?:images|skin|pdfs|files)\//i.test(relativePath)) {
    return resolveRuntimeAssetUrl(relativePath, siteConfig);
  }
  if (isOriginalPdfAsset(item) && relativePath.startsWith('/')) {
    const baseUrl = String(siteConfig?.assets_public_base_url || siteConfig?.web_url || '').trim().replace(/\/+$/g, '');
    return baseUrl ? `${baseUrl}${relativePath}` : relativePath;
  }
  return relativePath;
}

function isLocalMediaAsset(item) {
  return String(item?.storage_driver || 'local') === 'local';
}

function isOriginalPdfAsset(item) {
  const relativePath = String(item?.relative_path || '').trim();
  return String(item?.purpose || '') === 'pdf_document'
    && String(item?.storage_driver || '') === 'remote'
    && (
      /^(?:https?:)?\/\//i.test(relativePath)
      || relativePath.startsWith('/')
    );
}

function inferPdfDocumentCodeFromFilename(filename) {
  const base = path.basename(String(filename || ''), path.extname(String(filename || ''))).toUpperCase();
  const match = base.match(/\b(?:IM|TI|TIS|SB|SP|GP)-[A-Z0-9]+(?:-[A-Z0-9]+){1,4}\b/);
  return match ? match[0] : null;
}

function inferPdfTitleFromFilename(filename) {
  const base = path.basename(String(filename || ''), path.extname(String(filename || '')));
  return base
    .replace(/-[a-f0-9]{10}$/i, '')
    .replace(/\b(?:im|ti|tis|sb|sp|gp)-[a-z0-9]+(?:-[a-z0-9]+){1,4}\b/ig, '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null;
}

function normalizePdfDocumentType(value) {
  const documentType = String(value || '').trim();
  if (!documentType) {
    return null;
  }
  if (!PDF_DOCUMENT_TYPES.has(documentType)) {
    const error = new Error('PDF 文档类型不存在');
    error.statusCode = 400;
    throw error;
  }
  return documentType;
}

function normalizeMediaAssetLanguageId(value) {
  const id = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(id) || id <= 0) {
    return null;
  }

  const language = getLanguageById(id);
  if (!language) {
    const error = new Error('语言不存在');
    error.statusCode = 400;
    throw error;
  }
  return language.id;
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
    { table: 'ai_conversation_messages', label: 'AI 会话消息', columns: ['conversation_id'], scanColumns: ['content_json'] },
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
