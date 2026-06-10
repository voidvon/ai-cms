import { execute, getDb, queryAll, queryOne } from '../db.mjs';

const THEME_TEMPLATE_SLOT_FIELDS = {
  home: 'home_index',
  corporation: 'co_index',
  product_list: 'produts_sort1',
  product_detail: 'produts_detail',
  news_list: 'news_sort1',
  news_detail: 'news_detail',
  service_list: 'service_sort1',
  service_detail: 'service_detail',
  message: 'msg_index',
  contact: 'contact'
};

let schemaEnsured = false;

export function ensureTemplateVariantsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS template_variants (
      id INTEGER PRIMARY KEY,
      template_name TEXT NOT NULL,
      is_selected INTEGER NOT NULL DEFAULT 0,
      home_index TEXT,
      co_index TEXT,
      produts_index TEXT,
      produts_sort1 TEXT,
      produts_sort2 TEXT,
      produts_detail TEXT,
      news_index TEXT,
      news_sort1 TEXT,
      news_detail TEXT,
      service_sort1 TEXT,
      service_detail TEXT,
      msg_index TEXT,
      contact TEXT,
      legacy_extra TEXT
    );
  `);

  schemaEnsured = true;
}

export function listTemplateVariants() {
  ensureTemplateVariantsSchema();
  return queryAll(
    `
      SELECT
        id,
        template_name,
        is_selected,
        home_index,
        co_index,
        produts_index,
        produts_sort1,
        produts_sort2,
        produts_detail,
        news_index,
        news_sort1,
        news_detail,
        service_sort1,
        service_detail,
        msg_index,
        contact,
        legacy_extra
      FROM template_variants
      ORDER BY id ASC
    `
  ).map(normalizeTemplateVariantRecord);
}

export function getTemplateVariantById(id) {
  ensureTemplateVariantsSchema();
  const row = queryOne(
    `
      SELECT
        id,
        template_name,
        is_selected,
        home_index,
        co_index,
        produts_index,
        produts_sort1,
        produts_sort2,
        produts_detail,
        news_index,
        news_sort1,
        news_detail,
        service_sort1,
        service_detail,
        msg_index,
        contact,
        legacy_extra
      FROM template_variants
      WHERE id = ?
    `,
    [id]
  );
  return row ? normalizeTemplateVariantRecord(row) : null;
}

export function getSelectedTemplateVariant() {
  ensureTemplateVariantsSchema();
  const row = queryOne(
    `
      SELECT
        id,
        template_name,
        is_selected,
        home_index,
        co_index,
        produts_index,
        produts_sort1,
        produts_sort2,
        produts_detail,
        news_index,
        news_sort1,
        news_detail,
        service_sort1,
        service_detail,
        msg_index,
        contact,
        legacy_extra
      FROM template_variants
      WHERE is_selected = 1
      ORDER BY id ASC
      LIMIT 1
    `
  );
  return row ? normalizeTemplateVariantRecord(row) : null;
}

export function createTemplateVariant(input = {}) {
  ensureTemplateVariantsSchema();
  const count = queryOne('SELECT COUNT(*) AS count FROM template_variants')?.count || 0;
  const payload = normalizeTemplateVariantInput(input, {
    defaultSelected: count === 0
  });
  const result = execute(
    `
      INSERT INTO template_variants (
        template_name,
        is_selected,
        home_index,
        co_index,
        produts_index,
        produts_sort1,
        produts_sort2,
        produts_detail,
        news_index,
        news_sort1,
        news_detail,
        service_sort1,
        service_detail,
        msg_index,
        contact,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.template_name,
      payload.is_selected,
      payload.home_index,
      payload.co_index,
      payload.produts_index,
      payload.produts_sort1,
      payload.produts_sort2,
      payload.produts_detail,
      payload.news_index,
      payload.news_sort1,
      payload.news_detail,
      payload.service_sort1,
      payload.service_detail,
      payload.msg_index,
      payload.contact,
      payload.legacy_extra
    ]
  );

  if (payload.is_selected === 1) {
    execute('UPDATE template_variants SET is_selected = 0 WHERE id <> ?', [result.lastInsertRowid]);
  }

  return getTemplateVariantById(result.lastInsertRowid);
}

export function updateTemplateVariant(id, input) {
  ensureTemplateVariantsSchema();
  const existing = getTemplateVariantById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeTemplateVariantInput({ ...existing, ...input }, { existing });
  execute(
    `
      UPDATE template_variants
      SET
        template_name = ?,
        is_selected = ?,
        home_index = ?,
        co_index = ?,
        produts_index = ?,
        produts_sort1 = ?,
        produts_sort2 = ?,
        produts_detail = ?,
        news_index = ?,
        news_sort1 = ?,
        news_detail = ?,
        service_sort1 = ?,
        service_detail = ?,
        msg_index = ?,
        contact = ?,
        legacy_extra = ?
      WHERE id = ?
    `,
    [
      payload.template_name,
      payload.is_selected,
      payload.home_index,
      payload.co_index,
      payload.produts_index,
      payload.produts_sort1,
      payload.produts_sort2,
      payload.produts_detail,
      payload.news_index,
      payload.news_sort1,
      payload.news_detail,
      payload.service_sort1,
      payload.service_detail,
      payload.msg_index,
      payload.contact,
      payload.legacy_extra,
      id
    ]
  );

  if (payload.is_selected === 1) {
    execute('UPDATE template_variants SET is_selected = 0 WHERE id <> ?', [id]);
  }

  return getTemplateVariantById(id);
}

export function setSelectedTemplateVariant(id) {
  ensureTemplateVariantsSchema();
  const existing = getTemplateVariantById(id);
  if (!existing) {
    return null;
  }

  execute('UPDATE template_variants SET is_selected = 0');
  execute('UPDATE template_variants SET is_selected = 1 WHERE id = ?', [id]);
  return getTemplateVariantById(id);
}

export function deleteTemplateVariant(id) {
  ensureTemplateVariantsSchema();
  const existing = getTemplateVariantById(id);
  if (!existing) {
    return null;
  }

  const count = queryOne('SELECT COUNT(*) AS count FROM template_variants')?.count || 0;
  if (count <= 1) {
    throw new Error('cannot delete last template variant');
  }

  execute('DELETE FROM template_variants WHERE id = ?', [id]);

  if (existing.is_selected === 1) {
    const firstRemaining = queryOne('SELECT id FROM template_variants ORDER BY id ASC LIMIT 1');
    if (firstRemaining?.id) {
      execute('UPDATE template_variants SET is_selected = 1 WHERE id = ?', [firstRemaining.id]);
    }
  }

  return existing;
}

export function resolveSelectedThemeTemplateCode(slot) {
  const selected = getSelectedTemplateVariant();
  return selected ? getThemeTemplateCode(selected, slot) : null;
}

export function getThemeTemplateCode(variant, slot) {
  const field = THEME_TEMPLATE_SLOT_FIELDS[slot];
  if (!field) {
    return null;
  }

  return normalizeThemeTemplateCode(variant[field]);
}

function normalizeTemplateVariantInput(input, options = {}) {
  return {
    template_name: toNullableString(input.template_name) || options.existing?.template_name || '未命名主题',
    is_selected: toBooleanInt(
      input.is_selected ?? options.existing?.is_selected,
      options.existing?.is_selected ? 1 : (options.defaultSelected ? 1 : 0)
    ),
    home_index: normalizeThemeTemplateCode(input.home_index),
    co_index: normalizeThemeTemplateCode(input.co_index),
    produts_index: normalizeThemeTemplateCode(input.produts_index),
    produts_sort1: normalizeThemeTemplateCode(input.produts_sort1),
    produts_sort2: normalizeThemeTemplateCode(input.produts_sort2),
    produts_detail: normalizeThemeTemplateCode(input.produts_detail),
    news_index: normalizeThemeTemplateCode(input.news_index),
    news_sort1: normalizeThemeTemplateCode(input.news_sort1),
    news_detail: normalizeThemeTemplateCode(input.news_detail),
    service_sort1: normalizeThemeTemplateCode(input.service_sort1),
    service_detail: normalizeThemeTemplateCode(input.service_detail),
    msg_index: normalizeThemeTemplateCode(input.msg_index),
    contact: normalizeThemeTemplateCode(input.contact),
    legacy_extra: options.existing?.legacy_extra ?? null
  };
}

function normalizeTemplateVariantRecord(row) {
  return { ...row };
}

function normalizeThemeTemplateCode(value) {
  const normalized = toNullableString(value);
  if (!normalized || normalized === '没有模板') {
    return null;
  }

  const lowered = normalized.toLowerCase();
  if (lowered.includes('/') || lowered.includes('\\')) {
    throw new Error(`invalid theme template code: ${normalized}`);
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
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return parsed === 0 ? 0 : 1;
}
