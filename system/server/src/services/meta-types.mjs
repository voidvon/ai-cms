import { execute, queryAll, queryOne } from '../db.mjs';

export function listMetaTypes() {
  return queryAll(
    `
      SELECT
        id,
        title,
        meta_keywords,
        meta_descriptions,
        legacy_extra
      FROM meta_types
      ORDER BY id ASC
    `
  ).map(normalizeMetaTypeRecord);
}

export function getMetaTypeById(id) {
  const row = queryOne(
    `
      SELECT
        id,
        title,
        meta_keywords,
        meta_descriptions,
        legacy_extra
      FROM meta_types
      WHERE id = ?
    `,
    [id]
  );
  return row ? normalizeMetaTypeRecord(row) : null;
}

export function createMetaType(input) {
  const payload = normalizeMetaTypeInput(input);
  const result = execute(
    `
      INSERT INTO meta_types (
        title,
        meta_keywords,
        meta_descriptions,
        legacy_extra
      ) VALUES (?, ?, ?, ?)
    `,
    [
      payload.title,
      payload.meta_keywords,
      payload.meta_descriptions,
      payload.legacy_extra
    ]
  );

  return getMetaTypeById(result.lastInsertRowid);
}

export function updateMetaType(id, input) {
  const existing = getMetaTypeById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeMetaTypeInput({ ...existing, ...input }, { existing });
  execute(
    `
      UPDATE meta_types
      SET
        title = ?,
        meta_keywords = ?,
        meta_descriptions = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.title,
      payload.meta_keywords,
      payload.meta_descriptions,
      payload.legacy_extra,
      id
    ]
  );

  return getMetaTypeById(id);
}

function normalizeMetaTypeInput(input, options = {}) {
  const existingExtra = parseLegacyExtra(options.existing?.legacy_extra);
  const typeName = toNullableString(input.type_name ?? input.typename ?? existingExtra.typename);
  if (!typeName) {
    throw new Error('type_name is required');
  }

  return {
    title: toNullableString(input.title),
    meta_keywords: toNullableString(input.meta_keywords),
    meta_descriptions: toNullableString(input.meta_descriptions),
    legacy_extra: JSON.stringify({
      ...existingExtra,
      typename: typeName
    })
  };
}

function normalizeMetaTypeRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    type_name: toNullableString(legacyExtra.typename) || null,
    typename: toNullableString(legacyExtra.typename) || null
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
