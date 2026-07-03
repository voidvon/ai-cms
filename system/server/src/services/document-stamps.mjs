import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { getMediaAssetById } from './media-assets.mjs';
import { getSiteConfig } from './site.mjs';
import { getSelectedTemplateVariant } from './template-variants.mjs';
import { resolveRuntimeAssetUrl } from './uploads.mjs';

let schemaEnsured = false;

export function ensureDocumentStampsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS document_stamps (
      id INTEGER PRIMARY KEY,
      theme_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      image_asset_id INTEGER,
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_document_stamps_theme_id
      ON document_stamps(theme_id, id);
  `);

  schemaEnsured = true;
}

export function listDocumentStamps({ themeId } = {}) {
  ensureDocumentStampsSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const siteConfig = getSiteConfig();
  return queryAll(
    `
      SELECT
        id,
        theme_id,
        name,
        image_asset_id,
        image_path,
        created_at,
        updated_at
      FROM document_stamps
      WHERE theme_id = ?
      ORDER BY updated_at DESC, id DESC
    `,
    [normalizedThemeId]
  ).map((row) => hydrateDocumentStampRecord(row, siteConfig));
}

export function getDocumentStampById(id, { themeId } = {}) {
  ensureDocumentStampsSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const row = queryOne(
    `
      SELECT
        id,
        theme_id,
        name,
        image_asset_id,
        image_path,
        created_at,
        updated_at
      FROM document_stamps
      WHERE id = ? AND theme_id = ?
      LIMIT 1
    `,
    [id, normalizedThemeId]
  );
  return hydrateDocumentStampRecord(row, getSiteConfig());
}

export function createDocumentStamp(input = {}, { themeId } = {}) {
  ensureDocumentStampsSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const payload = normalizeDocumentStampInput(input);
  const now = new Date().toISOString();
  const result = execute(
    `
      INSERT INTO document_stamps (
        theme_id,
        name,
        image_asset_id,
        image_path,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedThemeId,
      payload.name,
      payload.image_asset_id,
      payload.image_path,
      now,
      now,
    ]
  );
  return getDocumentStampById(result.lastInsertRowid, { themeId: normalizedThemeId });
}

export function updateDocumentStamp(id, input = {}, { themeId } = {}) {
  ensureDocumentStampsSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const existing = getDocumentStampById(id, { themeId: normalizedThemeId });
  if (!existing) {
    return null;
  }

  const payload = normalizeDocumentStampInput(input, { existing });
  const now = new Date().toISOString();
  execute(
    `
      UPDATE document_stamps
      SET
        name = ?,
        image_asset_id = ?,
        image_path = ?,
        updated_at = ?
      WHERE id = ? AND theme_id = ?
    `,
    [
      payload.name,
      payload.image_asset_id,
      payload.image_path,
      now,
      id,
      normalizedThemeId,
    ]
  );

  return getDocumentStampById(id, { themeId: normalizedThemeId });
}

export function deleteDocumentStamp(id, { themeId } = {}) {
  ensureDocumentStampsSchema();
  const normalizedThemeId = resolveThemeId(themeId);
  const existing = getDocumentStampById(id, { themeId: normalizedThemeId });
  if (!existing) {
    return false;
  }

  execute('DELETE FROM document_stamps WHERE id = ? AND theme_id = ?', [id, normalizedThemeId]);
  return true;
}

function normalizeDocumentStampInput(input = {}, options = {}) {
  const existing = options.existing || null;
  const normalizedName = String(input.name || existing?.name || '').trim();
  if (!normalizedName) {
    throw new Error('印章名称不能为空');
  }

  const imageAssetId = toInteger(input.image_asset_id ?? input.imageAssetId, existing?.image_asset_id || null);
  const rawImagePath = String(input.image_path || input.imagePath || existing?.image_path || '').trim();
  const resolvedAsset = imageAssetId ? getMediaAssetById(imageAssetId) : null;
  const normalizedImagePath = String(resolvedAsset?.relative_path || rawImagePath).trim();
  if (!normalizedImagePath) {
    throw new Error('印章图片不能为空');
  }

  return {
    name: normalizedName,
    image_asset_id: resolvedAsset?.id || imageAssetId || null,
    image_path: normalizedImagePath,
  };
}

function hydrateDocumentStampRecord(row, siteConfig = null) {
  if (!row) {
    return null;
  }

  const imagePath = String(row.image_path || '').trim();
  return {
    ...row,
    image_asset_id: toInteger(row.image_asset_id, null),
    image_path: imagePath,
    image_public_url: resolveRuntimeAssetUrl(imagePath, siteConfig),
  };
}

function resolveThemeId(themeId) {
  const normalizedThemeId = toInteger(themeId, null);
  if (normalizedThemeId) {
    return normalizedThemeId;
  }

  const selectedTheme = getSelectedTemplateVariant();
  const fallbackThemeId = toInteger(selectedTheme?.id, null);
  if (!fallbackThemeId) {
    throw new Error('未找到已选主题，无法管理印章');
  }
  return fallbackThemeId;
}

function toInteger(value, fallbackValue = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}
