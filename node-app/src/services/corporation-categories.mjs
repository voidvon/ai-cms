import { execute, queryAll, queryOne } from '../db.mjs';

export function listCorporationCategoriesAdmin({ parentId = 0 } = {}) {
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  return queryAll(
    `
      SELECT
        c.id,
        c.name,
        c.parent_id,
        c.sort_order,
        c.is_external,
        c.external_url,
        c.legacy_extra,
        (
          SELECT COUNT(*)
          FROM corporation_categories child
          WHERE child.parent_id = c.id
        ) AS child_count
      FROM corporation_categories c
      WHERE c.parent_id = ?
      ORDER BY c.sort_order ASC, c.id ASC
    `,
    [safeParentId]
  ).map(normalizeCorporationCategoryRecord);
}

export function listRootCorporationCategories() {
  return queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        is_external,
        external_url,
        legacy_extra
      FROM corporation_categories
      WHERE parent_id = 0
      ORDER BY sort_order ASC, id ASC
    `
  ).map(normalizeCorporationCategoryRecord);
}

export function getCorporationCategoryById(id) {
  const row = queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        sort_order,
        is_external,
        external_url,
        legacy_extra
      FROM corporation_categories
      WHERE id = ?
    `,
    [id]
  );
  return row ? normalizeCorporationCategoryRecord(row) : null;
}

export function getNextCorporationCategorySortOrder(parentId = 0) {
  const safeParentId = Number.parseInt(String(parentId), 10) || 0;
  const maxValue = queryOne(
    `
      SELECT MAX(sort_order) AS value
      FROM corporation_categories
      WHERE parent_id = ?
    `,
    [safeParentId]
  )?.value;
  return Number.isInteger(maxValue) ? maxValue + 1 : 1;
}

export function createCorporationCategory(input) {
  const payload = normalizeCorporationCategoryInput(input);
  const result = execute(
    `
      INSERT INTO corporation_categories (
        name,
        parent_id,
        sort_order,
        is_external,
        external_url,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?)
    `,
    [
      payload.name,
      payload.parent_id,
      payload.sort_order,
      payload.is_external,
      payload.external_url,
      payload.legacy_extra
    ]
  );

  return getCorporationCategoryById(result.lastInsertRowid);
}

export function updateCorporationCategory(id, input) {
  const existing = getCorporationCategoryById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeCorporationCategoryInput({ ...existing, ...input }, { currentId: id, existing });
  execute(
    `
      UPDATE corporation_categories
      SET
        name = ?,
        parent_id = ?,
        sort_order = ?,
        is_external = ?,
        external_url = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.name,
      payload.parent_id,
      payload.sort_order,
      payload.is_external,
      payload.external_url,
      payload.legacy_extra,
      id
    ]
  );

  return getCorporationCategoryById(id);
}

export function updateCorporationCategoryContent(id, contentHtml) {
  const existing = getCorporationCategoryById(id);
  if (!existing) {
    return null;
  }

  const legacyExtra = parseLegacyExtra(existing.legacy_extra);
  execute(
    `
      UPDATE corporation_categories
      SET legacy_extra = ?
      WHERE id = ?
    `,
    [
      JSON.stringify({
        ...legacyExtra,
        Centern: String(contentHtml ?? '')
      }),
      id
    ]
  );

  return getCorporationCategoryById(id);
}

export function deleteCorporationCategory(id) {
  const existing = getCorporationCategoryById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM corporation_categories WHERE id = ?', [id]);
  return existing;
}

function normalizeCorporationCategoryInput(input, options = {}) {
  const name = String(input.name ?? '').trim();
  if (!name) {
    throw new Error('name is required');
  }

  const existingExtra = parseLegacyExtra(options.existing?.legacy_extra);
  const parentId = toInteger(input.parent_id, 0);
  if (options.currentId && parentId === Number(options.currentId)) {
    throw new Error('parent_id cannot equal id');
  }

  const isExternal = toBooleanInt(input.is_external ?? input.sitepath, 0);
  const externalUrl = parentId === 0 || isExternal === 0 ? null : toNullableString(input.external_url ?? input.siteurl);
  const contentHtml = input.content_html ?? existingExtra.Centern ?? existingExtra.content_html ?? '';

  return {
    name,
    parent_id: parentId,
    sort_order: toInteger(input.sort_order, 0),
    is_external: parentId === 0 ? 0 : isExternal,
    external_url: parentId === 0 ? null : externalUrl,
    legacy_extra: JSON.stringify({
      ...existingExtra,
      Centern: String(contentHtml ?? '')
    })
  };
}

function normalizeCorporationCategoryRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    content_html: String(legacyExtra.Centern ?? legacyExtra.content_html ?? ''),
    sitepath: Number.parseInt(String(row.is_external ?? 0), 10) || 0,
    siteurl: row.external_url || ''
  };
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', '-1'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return toInteger(value, fallback) === 0 ? 0 : 1;
}
