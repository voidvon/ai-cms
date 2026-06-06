import { execute, queryAll, queryOne } from '../db.mjs';

export function listCustomLabelKinds() {
  return queryAll(
    `
      SELECT id, name, legacy_extra
      FROM custom_label_kinds
      ORDER BY id ASC
    `
  );
}

export function getCustomLabelKindById(id) {
  return queryOne(
    `
      SELECT id, name, legacy_extra
      FROM custom_label_kinds
      WHERE id = ?
    `,
    [id]
  ) || null;
}

export function createCustomLabelKind(input) {
  const name = normalizeRequiredName(input.name ?? input.kindname ?? input.addkind, 'name is required');
  const result = execute(
    `
      INSERT INTO custom_label_kinds (name, legacy_extra)
      VALUES (?, ?)
    `,
    [name, null]
  );
  return getCustomLabelKindById(result.lastInsertRowid);
}

export function updateCustomLabelKind(id, input) {
  const existing = getCustomLabelKindById(id);
  if (!existing) {
    return null;
  }

  const name = normalizeRequiredName(input.name ?? input.kindname ?? input.addkind ?? existing.name, 'name is required');
  execute('UPDATE custom_label_kinds SET name = ? WHERE id = ?', [name, id]);
  return getCustomLabelKindById(id);
}

export function deleteCustomLabelKind(id) {
  const existing = getCustomLabelKindById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM custom_labels WHERE kind_id = ?', [id]);
  execute('DELETE FROM custom_label_kinds WHERE id = ?', [id]);
  return existing;
}

export function listCustomLabels() {
  return queryAll(
    `
      SELECT
        l.id,
        l.kind_id,
        l.name,
        l.content,
        l.legacy_extra,
        k.name AS kind_name
      FROM custom_labels l
      LEFT JOIN custom_label_kinds k ON k.id = l.kind_id
      ORDER BY l.kind_id ASC, l.id ASC
    `
  ).map(normalizeCustomLabelRecord);
}

export function getCustomLabelById(id) {
  const row = queryOne(
    `
      SELECT
        l.id,
        l.kind_id,
        l.name,
        l.content,
        l.legacy_extra,
        k.name AS kind_name
      FROM custom_labels l
      LEFT JOIN custom_label_kinds k ON k.id = l.kind_id
      WHERE l.id = ?
    `,
    [id]
  );
  return row ? normalizeCustomLabelRecord(row) : null;
}

export function findCustomLabelByName(name) {
  const normalizedName = normalizeLabelName(name);
  if (!normalizedName) {
    return null;
  }

  const row = queryOne(
    `
      SELECT
        l.id,
        l.kind_id,
        l.name,
        l.content,
        l.legacy_extra,
        k.name AS kind_name
      FROM custom_labels l
      LEFT JOIN custom_label_kinds k ON k.id = l.kind_id
      WHERE l.name = ?
    `,
    [normalizedName]
  );
  return row ? normalizeCustomLabelRecord(row) : null;
}

export function createCustomLabel(input) {
  const payload = normalizeCustomLabelInput(input);
  const result = execute(
    `
      INSERT INTO custom_labels (
        kind_id,
        name,
        content,
        legacy_extra
      ) VALUES (?, ?, ?, ?)
    `,
    [
      payload.kind_id,
      payload.name,
      payload.content,
      payload.legacy_extra
    ]
  );
  return getCustomLabelById(result.lastInsertRowid);
}

export function updateCustomLabel(id, input) {
  const existing = getCustomLabelById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeCustomLabelInput({ ...existing, ...input }, { existing });
  execute(
    `
      UPDATE custom_labels
      SET
        kind_id = ?,
        name = ?,
        content = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.kind_id,
      payload.name,
      payload.content,
      payload.legacy_extra,
      id
    ]
  );
  return getCustomLabelById(id);
}

export function deleteCustomLabel(id) {
  const existing = getCustomLabelById(id);
  if (!existing) {
    return null;
  }
  execute('DELETE FROM custom_labels WHERE id = ?', [id]);
  return existing;
}

function normalizeCustomLabelInput(input, options = {}) {
  const existingExtra = parseLegacyExtra(options.existing?.legacy_extra);
  const kindId = toInteger(input.kind_id ?? input.editlkind ?? input.lkind, null);
  const name = normalizeLabelName(input.addclname ?? input.lname ?? input.name);
  const description = toNullableString(input.addcldes ?? input.ldes ?? input.description ?? existingExtra.ldes);
  const content = toNullableString(input.addclcontent ?? input.lcontent ?? input.content);

  if (!kindId) {
    throw new Error('kind_id is required');
  }
  if (!name) {
    throw new Error('name is required');
  }
  if (!description) {
    throw new Error('description is required');
  }
  if (!content) {
    throw new Error('content is required');
  }

  return {
    kind_id: kindId,
    name,
    content,
    legacy_extra: JSON.stringify({
      ...existingExtra,
      ldes: description,
      lidate: existingExtra.lidate || new Date().toISOString()
    })
  };
}

function normalizeCustomLabelRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    description: toNullableString(legacyExtra.ldes) || '',
    ldes: toNullableString(legacyExtra.ldes) || '',
    raw_name: stripLabelWrapper(row.name || ''),
    lname: row.name || ''
  };
}

function normalizeLabelName(value) {
  const trimmed = String(value ?? '').trim().replace(/\s+/g, '');
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('#') && trimmed.endsWith('#')) {
    return trimmed;
  }
  if (trimmed.startsWith('#BM_') && !trimmed.endsWith('#')) {
    return `${trimmed}#`;
  }
  if (trimmed.startsWith('BM_')) {
    return `#${trimmed}#`;
  }
  return `#BM_${stripLabelWrapper(trimmed)}#`;
}

function stripLabelWrapper(value) {
  return String(value ?? '')
    .replace(/^#/, '')
    .replace(/#$/, '')
    .replace(/^BM_/, '')
    .replace(/^#BM_/, '');
}

function normalizeRequiredName(value, message) {
  const normalized = toNullableString(value);
  if (!normalized) {
    throw new Error(message);
  }
  return normalized;
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

function toInteger(value, fallback = null) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
