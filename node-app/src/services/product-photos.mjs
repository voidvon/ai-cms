import { execute, queryAll, queryOne } from '../db.mjs';
import { deleteUploadedFile } from './uploads.mjs';

export function listProductPhotos({ limit = 100, page = 1 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 100, 1), 500);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const items = queryAll(
    `
      SELECT
        id,
        product_id,
        name,
        image_path,
        created_at
      FROM product_photos
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [safeLimit, offset]
  );

  const total = queryOne(`SELECT COUNT(*) AS count FROM product_photos`)?.count || 0;
  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getProductPhotoById(id) {
  return queryOne(
    `
      SELECT
        id,
        product_id,
        name,
        image_path,
        created_at
      FROM product_photos
      WHERE id = ?
    `,
    [id]
  );
}

export function createProductPhoto(input) {
  const payload = normalizeProductPhotoInput(input);
  const result = execute(
    `
      INSERT INTO product_photos (
        product_id,
        name,
        image_path,
        created_at
      ) VALUES (?, ?, ?, ?)
    `,
    [payload.product_id, payload.name, payload.image_path, payload.created_at]
  );

  return getProductPhotoById(result.lastInsertRowid);
}

export function deleteProductPhoto(id) {
  const existing = getProductPhotoById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM product_photos WHERE id = ?', [id]);
  deleteUploadedFile(existing.image_path);
  return existing;
}

export function normalizeProductPhotoInput(input) {
  const name = toNullableString(input.name);
  const imagePath = toNullableString(input.image_path);

  if (!name) {
    throw new Error('name is required');
  }
  if (!imagePath) {
    throw new Error('image_path is required');
  }

  return {
    product_id: toNullableInteger(input.product_id),
    name,
    image_path: imagePath,
    created_at: toNullableString(input.created_at) || new Date().toISOString()
  };
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}
