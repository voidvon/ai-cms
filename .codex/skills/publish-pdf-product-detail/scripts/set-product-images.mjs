#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../../../..');
const INVOCATION_CWD = process.cwd();
process.chdir(PROJECT_ROOT);

const { getDb } = await import('../../../../system/server/src/db.mjs');
const { getContentItemById, updateContentItem } = await import(
  '../../../../system/server/src/services/content-items.mjs'
);
const { uploadMediaAsset } = await import('../../../../system/server/src/services/media-assets.mjs');

function usage() {
  console.log(`用法:
  node set-product-images.mjs --product-id <ID> --image <图片> [--image <图片> ...]
                              [--replace-gallery] [--keep-primary]

默认行为:
  通过 CMS 媒体服务转换并上传图片；保留现有图库并追加新图，第一张新图设为主图。
  --replace-gallery 只让新图进入产品图库，但不会立即删除旧媒体，以保留回滚能力。
  --keep-primary 保留现有主图；不能与 --replace-gallery 同时使用。`);
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

function parseArgs(argv) {
  const output = {
    productId: null,
    images: [],
    replaceGallery: false,
    keepPrimary: false,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--help' || token === '-h') output.help = true;
    else if (token === '--product-id') output.productId = positiveInt(argv[++index], token);
    else if (token === '--image') output.images.push(requiredValue(argv[++index], token));
    else if (token === '--replace-gallery') output.replaceGallery = true;
    else if (token === '--keep-primary') output.keepPrimary = true;
    else fail(`未知参数: ${token}`);
  }
  if (!output.help) {
    if (!output.productId) fail('必须提供 --product-id');
    if (output.images.length === 0) fail('至少提供一个 --image');
    if (output.replaceGallery && output.keepPrimary) {
      fail('--replace-gallery 不能与 --keep-primary 同时使用');
    }
  }
  return output;
}

function normalizeImageList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : [];
  } catch {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function timestamp() {
  return new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }

  const imageFiles = unique(options.images.map((value) => path.resolve(INVOCATION_CWD, value)));
  for (const imageFile of imageFiles) {
    if (!fs.existsSync(imageFile) || !fs.statSync(imageFile).isFile()) {
      fail(`产品图片不存在或不是文件: ${imageFile}`);
    }
  }

  const product = getContentItemById('product', options.productId, {
    languageCode: 'en',
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!product) fail(`产品 ${options.productId} 不存在`);

  const currentImages = normalizeImageList(product.images);
  const currentPrimary = String(product.primary_image || currentImages[0] || '').trim();
  const db = getDb();
  const backupPath = path.join(
    PROJECT_ROOT,
    `tmp/site-before-product-images-${options.productId}-${timestamp()}.sqlite`
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

  const uploaded = [];
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const imageFile of imageFiles) {
      const asset = await uploadMediaAsset({
        buffer: fs.readFileSync(imageFile),
        originalFilename: path.basename(imageFile),
        purpose: 'product_cover'
      });
      uploaded.push(asset);
    }

    const uploadedPaths = uploaded.map((asset) => asset.relative_path);
    const nextImages = options.replaceGallery
      ? unique(uploadedPaths)
      : unique([...currentImages, ...uploadedPaths]);
    const nextPrimary = options.keepPrimary && currentPrimary
      ? currentPrimary
      : uploadedPaths[0];
    const updated = updateContentItem('product', options.productId, {
      base: {
        column_id: product.column_id,
        images: nextImages,
        primary_image: nextPrimary
      }
    });
    if (!updated) fail(`产品 ${options.productId} 图片写入失败`);
    db.exec('COMMIT');

    console.log(JSON.stringify({
      success: true,
      productId: options.productId,
      backupPath,
      mode: options.replaceGallery ? 'replace-gallery' : 'append-gallery',
      previous: { images: currentImages, primaryImage: currentPrimary },
      uploaded: uploaded.map((asset) => ({
        id: asset.id,
        originalName: asset.original_name,
        relativePath: asset.relative_path,
        mimeType: asset.mime_type,
        bytes: asset.file_size
      })),
      current: {
        images: normalizeImageList(updated.images),
        primaryImage: updated.primary_image
      },
      retainedForRollback: options.replaceGallery ? currentImages : []
    }, null, 2));
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    for (const asset of uploaded) {
      if (asset.fs_path && fs.existsSync(asset.fs_path)) fs.unlinkSync(asset.fs_path);
    }
    throw error;
  }
}

try {
  await main();
} catch (error) {
  console.error(error.message || error);
  usage();
  process.exit(1);
}
