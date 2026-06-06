import { execute, queryAll, queryOne } from '../db.mjs';

const EXTRA_FIELDS = ['service_index', 'Contact'];

export function listTemplateVariants() {
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
        job_index,
        job_detail,
        msg_index,
        contact,
        legacy_extra
      FROM template_variants
      ORDER BY id ASC
    `
  ).map(normalizeTemplateVariantRecord);
}

export function getTemplateVariantById(id) {
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
        job_index,
        job_detail,
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

export function updateTemplateVariant(id, input) {
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
        job_index = ?,
        job_detail = ?,
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
      payload.job_index,
      payload.job_detail,
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
  const existing = getTemplateVariantById(id);
  if (!existing) {
    return null;
  }

  execute('UPDATE template_variants SET is_selected = 0');
  execute('UPDATE template_variants SET is_selected = 1 WHERE id = ?', [id]);
  return getTemplateVariantById(id);
}

export function deleteTemplateVariant(id) {
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

function normalizeTemplateVariantInput(input, options = {}) {
  const existingExtra = parseLegacyExtra(options.existing?.legacy_extra);
  const mergedExtra = { ...existingExtra };

  for (const field of EXTRA_FIELDS) {
    const value = toNullableString(input[field] ?? mergedExtra[field]);
    if (value == null) {
      delete mergedExtra[field];
    } else {
      mergedExtra[field] = value;
    }
  }

  return {
    template_name: toNullableString(input.template_name ?? input.tempname) || options.existing?.template_name || '默认模板',
    is_selected: toBooleanInt(input.is_selected ?? input.selected ?? options.existing?.is_selected, options.existing?.is_selected ? 1 : 0),
    home_index: toNullableString(input.home_index),
    co_index: toNullableString(input.co_index ?? input.Co_index),
    produts_index: toNullableString(input.produts_index),
    produts_sort1: toNullableString(input.produts_sort1),
    produts_sort2: toNullableString(input.produts_sort2),
    produts_detail: toNullableString(input.produts_detail),
    news_index: toNullableString(input.news_index),
    news_sort1: toNullableString(input.news_sort1 ?? input.News_sort1),
    news_detail: toNullableString(input.news_detail),
    service_sort1: toNullableString(input.service_sort1),
    service_detail: toNullableString(input.service_detail),
    job_index: toNullableString(input.job_index),
    job_detail: toNullableString(input.job_detail ?? input.Job_detail),
    msg_index: toNullableString(input.msg_index),
    contact: toNullableString(input.contact ?? input.Contact),
    legacy_extra: Object.keys(mergedExtra).length > 0 ? JSON.stringify(mergedExtra) : null
  };
}

function normalizeTemplateVariantRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    tempname: row.template_name,
    selected: row.is_selected,
    service_index: toNullableString(legacyExtra.service_index) || '',
    Contact: toNullableString(legacyExtra.Contact) || row.contact || '',
    News_sort1: row.news_sort1 || '',
    Job_detail: row.job_detail || '',
    Co_index: row.co_index || ''
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
