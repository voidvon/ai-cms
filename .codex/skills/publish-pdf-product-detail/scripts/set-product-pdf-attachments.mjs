#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
process.chdir(PROJECT_ROOT);

const { getDb, queryAll, queryOne } = await import('../../../../system/server/src/db.mjs');
const { getContentItemById, updateContentItem } = await import('../../../../system/server/src/services/content-items.mjs');
const { uploadMediaAsset, deleteMediaAsset, getMediaAssetById } = await import('../../../../system/server/src/services/media-assets.mjs');

const DOCUMENT_TYPES = new Set(['sales_brochure', 'technical_information', 'installation_guide']);

function usage() {
  console.log(`用法:
  node set-product-pdf-attachments.mjs --product-id <ID> [--language en]
    --pdf <文档类型>=<PDF路径> [--pdf <文档类型>=<PDF路径> ...]
    [--replace] [--backup-path <SQLite备份>] [--dry-run]

文档类型：sales_brochure、technical_information、installation_guide。
默认合并并去重当前语言附件；--replace 只替换该语言附件引用，不立即删除旧媒体。`);
}

function fail(message) {
  throw new Error(message);
}

function requiredValue(value, flag) {
  if (!value || value.startsWith('--')) fail(`${flag} 缺少参数值`);
  return value;
}

function positiveInt(value, flag) {
  const parsed = Number.parseInt(requiredValue(value, flag), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} 必须是正整数`);
  return parsed;
}

function parsePdfSpec(value) {
  const separator = value.indexOf('=');
  if (separator <= 0 || separator === value.length - 1) {
    fail('--pdf 必须使用 <文档类型>=<PDF路径>');
  }
  const documentType = value.slice(0, separator).trim();
  if (!DOCUMENT_TYPES.has(documentType)) fail(`不支持的 PDF 文档类型: ${documentType}`);
  return { documentType, file: value.slice(separator + 1).trim() };
}

function parseArgs(argv) {
  const output = {
    language: 'en',
    pdfs: [],
    replace: false,
    backupPath: '',
    dryRun: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else if (token === '--replace') output.replace = true;
    else if (token === '--dry-run') output.dryRun = true;
    else if (token === '--product-id') output.productId = positiveInt(argv[++index], token);
    else if (token === '--language') output.language = requiredValue(argv[++index], token);
    else if (token === '--pdf') output.pdfs.push(parsePdfSpec(requiredValue(argv[++index], token)));
    else if (token === '--backup-path') output.backupPath = requiredValue(argv[++index], token);
    else fail(`未知参数: ${token}`);
  }
  if (!output.help && !output.productId) fail('必须提供 --product-id');
  if (!output.help && output.pdfs.length === 0) fail('至少提供一个 --pdf');
  return output;
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function inspectPdf(input) {
  const absolutePath = path.resolve(PROJECT_ROOT, input.file);
  if (!fs.existsSync(absolutePath)) fail(`PDF 不存在: ${absolutePath}`);
  if (path.extname(absolutePath).toLowerCase() !== '.pdf') fail(`附件不是 PDF: ${absolutePath}`);
  const buffer = fs.readFileSync(absolutePath);
  if (buffer.length < 5 || buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    fail(`附件缺少 PDF 文件头: ${absolutePath}`);
  }
  return {
    ...input,
    absolutePath,
    originalFilename: path.basename(absolutePath),
    buffer,
    sizeBytes: buffer.length,
    sha256: sha256Buffer(buffer),
  };
}

function parseAttachmentPaths(value) {
  if (Array.isArray(value)) return Array.from(new Set(value.map(String).map((item) => item.trim()).filter(Boolean)));
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(String).map((item) => item.trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

function buildBackupPath(options) {
  if (options.backupPath) return path.resolve(PROJECT_ROOT, options.backupPath);
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
  return path.join(PROJECT_ROOT, `tmp/site-before-pdf-attachments-${options.productId}-${timestamp}.sqlite`);
}

function checkBackupIntegrity(backupPath) {
  const backupDb = new DatabaseSync(backupPath);
  try {
    backupDb.exec('PRAGMA journal_mode = DELETE;');
    const row = backupDb.prepare('PRAGMA integrity_check;').get();
    if (String(row?.integrity_check || '').toLowerCase() !== 'ok') {
      fail(`数据库备份完整性检查失败: ${backupPath}`);
    }
  } finally {
    backupDb.close();
  }
}

function ensureBackup(options) {
  const backupPath = buildBackupPath(options);
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  let reused = false;
  if (fs.existsSync(backupPath)) {
    reused = true;
  } else {
    getDb().exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);
  }
  checkBackupIntegrity(backupPath);
  return { path: backupPath, reused };
}

function findReusableAsset(pdf, languageId) {
  const candidates = queryAll(
    `SELECT id
     FROM media_assets
     WHERE purpose = 'pdf_document'
       AND language_id = ?
       AND pdf_document_type = ?
       AND file_size = ?
     ORDER BY id DESC`,
    [languageId, pdf.documentType, pdf.sizeBytes],
  );
  for (const row of candidates) {
    const asset = getMediaAssetById(row.id);
    if (!asset?.file_exists || !asset.fs_path || !fs.existsSync(asset.fs_path)) continue;
    if (sha256Buffer(fs.readFileSync(asset.fs_path)) === pdf.sha256) return asset;
  }
  return null;
}

function buildPayload(product, languageCode, nextPaths) {
  const translations = Object.fromEntries(
    Object.entries(product.translations || {}).map(([code, translation]) => [code, { ...translation }]),
  );
  translations[languageCode] = {
    ...translations[languageCode],
    attachments_json: nextPaths,
  };
  return {
    base: {
      column_id: product.column_id,
      custom_url: product.custom_url,
      code: product.code,
      images: product.images,
      primary_image: product.primary_image,
      spec_options_json: product.spec_options_json,
      is_visible: product.is_visible,
      is_featured_home: product.is_featured_home,
      sort_order: product.sort_order,
      created_at: product.created_at,
    },
    translations,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  // Complete every non-mutating check before creating a backup or uploading media.
  const language = queryOne('SELECT id, code, is_enabled FROM languages WHERE lower(code) = lower(?)', [options.language]);
  if (!language) fail(`语言不存在: ${options.language}`);
  const product = getContentItemById('product', options.productId, {
    languageCode: language.code,
    includeTranslations: true,
    includeTranslationStatuses: true,
  });
  if (!product) fail(`产品 ${options.productId} 不存在`);
  if (!product.translations?.[language.code]) fail(`产品 ${options.productId} 缺少 ${language.code} 翻译记录`);

  const pdfs = options.pdfs.map(inspectPdf);
  const duplicateHashes = new Set();
  for (const pdf of pdfs) {
    if (duplicateHashes.has(pdf.sha256)) fail(`重复 PDF 输入: ${pdf.absolutePath}`);
    duplicateHashes.add(pdf.sha256);
  }
  const existingPaths = parseAttachmentPaths(product.translations[language.code].attachments_json);
  const plan = pdfs.map((pdf) => {
    const reusable = findReusableAsset(pdf, language.id);
    return {
      documentType: pdf.documentType,
      file: pdf.absolutePath,
      sizeBytes: pdf.sizeBytes,
      sha256: pdf.sha256,
      action: reusable ? 'reuse' : 'upload',
      reusableAssetId: reusable?.id || null,
      reusablePath: reusable?.relative_path || null,
    };
  });

  if (options.dryRun) {
    console.log(JSON.stringify({
      success: true,
      dryRun: true,
      productId: product.id,
      language: language.code,
      replace: options.replace,
      existingPaths,
      plan,
    }, null, 2));
    return;
  }

  const backup = ensureBackup(options);
  const uploaded = [];
  const selectedAssets = [];
  try {
    for (let index = 0; index < pdfs.length; index += 1) {
      const pdf = pdfs[index];
      const planned = plan[index];
      let asset = planned.reusableAssetId ? getMediaAssetById(planned.reusableAssetId) : null;
      if (!asset) {
        asset = await uploadMediaAsset({
          buffer: pdf.buffer,
          originalFilename: pdf.originalFilename,
          purpose: 'pdf_document',
          languageId: language.id,
          pdfDocumentType: pdf.documentType,
        });
        uploaded.push(asset);
      }
      selectedAssets.push(asset);
    }

    const selectedPaths = selectedAssets.map((asset) => asset.relative_path);
    const nextPaths = Array.from(new Set(options.replace ? selectedPaths : [...existingPaths, ...selectedPaths]));
    const updated = updateContentItem('product', product.id, buildPayload(product, language.code, nextPaths));
    if (!updated) fail(`产品 ${product.id} 附件写入失败`);

    console.log(JSON.stringify({
      success: true,
      productId: product.id,
      language: language.code,
      backup,
      replace: options.replace,
      attachments: nextPaths,
      media: selectedAssets.map((asset, index) => ({
        id: asset.id,
        relativePath: asset.relative_path,
        documentType: pdfs[index].documentType,
        action: plan[index].action,
      })),
      retainedOldPaths: options.replace ? existingPaths.filter((item) => !nextPaths.includes(item)) : [],
    }, null, 2));
  } catch (error) {
    for (const asset of uploaded.reverse()) {
      try {
        deleteMediaAsset(asset.id);
      } catch {
        // The backup path and leaked asset id remain visible in the thrown error context.
      }
    }
    error.message = `${error.message}（数据库备份: ${backup.path}）`;
    throw error;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
