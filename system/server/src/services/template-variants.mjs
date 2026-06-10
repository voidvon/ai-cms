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

    CREATE TABLE IF NOT EXISTS template_variant_components (
      id INTEGER PRIMARY KEY,
      variant_id INTEGER NOT NULL,
      template_id INTEGER NOT NULL,
      UNIQUE (variant_id, template_id)
    );
  `);

  schemaEnsured = true;
}

export function listTemplateVariants() {
  ensureTemplateVariantsSchema();
  const rows = queryAll(
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
  );
  return attachVariantComponentIds(rows);
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
  return row ? attachVariantComponentIds([row])[0] : null;
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
  return row ? attachVariantComponentIds([row])[0] : null;
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

  if (payload.source_theme_id) {
    cloneTemplateVariantComponents(payload.source_theme_id, result.lastInsertRowid);
  } else {
    syncTemplateVariantComponentIds(result.lastInsertRowid, payload.component_template_ids);
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

  syncTemplateVariantComponentIds(id, payload.component_template_ids);

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

export function listTemplateVariantComponents(variantId, { publishedOnly = false } = {}) {
  ensureTemplateVariantsSchema();
  const variant = getTemplateVariantById(variantId);
  if (!variant) {
    return [];
  }

  const templateIds = resolveThemeComponentTemplateIds(variant, { publishedOnly });
  if (templateIds.length === 0) {
    return [];
  }

  const placeholders = templateIds.map(() => '?').join(', ');
  const wherePublished = publishedOnly ? "AND status = 'published'" : '';
  const rows = queryAll(
    `
      SELECT
        id,
        name,
        type,
        code,
        engine,
        content,
        published_content,
        status,
        is_default,
        sort_order,
        created_at,
        updated_at,
        published_at
      FROM templates
      WHERE id IN (${placeholders}) AND type = 'component' ${wherePublished}
      ORDER BY sort_order ASC, id ASC
    `,
    templateIds
  );
  const byId = new Map(rows.map((item) => [item.id, item]));
  return templateIds.map((id) => byId.get(id)).filter(Boolean);
}

export function listSelectedThemePublishedComponents() {
  const selected = getSelectedTemplateVariant();
  if (!selected?.id) {
    return [];
  }
  return listTemplateVariantComponents(selected.id, { publishedOnly: true }).map((item) => ({
    code: item.code,
    engine: item.engine || 'html',
    content: item.published_content || item.content || ''
  }));
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
    legacy_extra: options.existing?.legacy_extra ?? null,
    component_template_ids: normalizeComponentTemplateIds(
      input.manual_component_template_ids ?? input.component_template_ids,
      options.existing?.manual_component_template_ids ?? options.existing?.component_template_ids
    ),
    source_theme_id: toPositiveInteger(input.source_theme_id)
  };
}

function normalizeTemplateVariantRecord(row) {
  return { ...row };
}

function attachVariantComponentIds(rows) {
  const variants = rows.map(normalizeTemplateVariantRecord);
  if (variants.length === 0) {
    return variants;
  }

  const ids = variants.map((item) => item.id);
  const placeholders = ids.map(() => '?').join(', ');
  const componentRows = queryAll(
    `
      SELECT variant_id, template_id
      FROM template_variant_components
      WHERE variant_id IN (${placeholders})
      ORDER BY variant_id ASC, template_id ASC
    `,
    ids
  );
  const idsByVariant = new Map();

  for (const row of componentRows) {
    if (!idsByVariant.has(row.variant_id)) {
      idsByVariant.set(row.variant_id, []);
    }
    idsByVariant.get(row.variant_id).push(row.template_id);
  }

  return variants.map((item) => {
    const manualComponentTemplateIds = idsByVariant.get(item.id) || [];
    return {
      ...item,
      manual_component_template_ids: manualComponentTemplateIds,
      component_template_ids: resolveThemeComponentTemplateIds(item, {
        manualComponentTemplateIds
      })
    };
  });
}

function syncTemplateVariantComponentIds(variantId, templateIds = []) {
  execute('DELETE FROM template_variant_components WHERE variant_id = ?', [variantId]);
  for (const templateId of templateIds) {
    execute(
      `
        INSERT OR IGNORE INTO template_variant_components (variant_id, template_id)
        VALUES (?, ?)
      `,
      [variantId, templateId]
    );
  }
}

function cloneTemplateVariantComponents(sourceThemeId, targetThemeId) {
  const components = listTemplateVariantComponents(sourceThemeId, { publishedOnly: false });
  const clonedIds = [];

  for (const component of components) {
    const result = execute(
      `
        INSERT INTO templates (
          name,
          type,
          code,
          engine,
          content,
          published_content,
          status,
          is_default,
          sort_order,
          created_at,
          updated_at,
          published_at
        ) VALUES (?, 'component', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
      `,
      [
        component.name,
        buildClonedThemeComponentCode(component.code, targetThemeId),
        component.engine || 'tsx',
        component.content || '',
        component.published_content || component.content || '',
        component.status || 'published',
        component.is_default || 0,
        component.sort_order || 0,
        component.published_at || null
      ]
    );
    clonedIds.push(Number(result.lastInsertRowid));
  }

  syncTemplateVariantComponentIds(targetThemeId, clonedIds);
}

function buildClonedThemeComponentCode(baseCode, themeId) {
  return `${String(baseCode || 'component').trim()}__theme_${themeId}`;
}

function normalizeComponentTemplateIds(value, fallback = []) {
  const source = Array.isArray(value) ? value : fallback;
  return Array.from(
    new Set(
      source
        .map((item) => toPositiveInteger(item))
        .filter(Boolean)
    )
  );
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

function resolveThemeComponentTemplateIds(variant, options = {}) {
  const publishedOnly = options.publishedOnly === true;
  const manualComponentTemplateIds = Array.isArray(options.manualComponentTemplateIds)
    ? options.manualComponentTemplateIds
    : getManualThemeComponentTemplateIds(variant.id);
  const templateCacheByCode = new Map();
  const templateCacheById = new Map();
  const resolvedComponentIds = new Set();
  const visitedTemplateKeys = new Set();

  for (const templateId of manualComponentTemplateIds) {
    const component = getTemplateByIdCached(templateId, templateCacheById);
    if (!component || component.type !== 'component' || !matchesPublishedFilter(component, publishedOnly)) {
      continue;
    }
    resolvedComponentIds.add(component.id);
    collectNestedComponentTemplateIds(component, {
      publishedOnly,
      templateCacheByCode,
      templateCacheById,
      resolvedComponentIds,
      visitedTemplateKeys
    });
  }

  for (const field of Object.values(THEME_TEMPLATE_SLOT_FIELDS)) {
    const templateCode = normalizeThemeTemplateCode(variant?.[field]);
    if (!templateCode) {
      continue;
    }
    const template = getTemplateByCodeCached(templateCode, templateCacheByCode);
    if (!template || !matchesPublishedFilter(template, publishedOnly)) {
      continue;
    }
    collectNestedComponentTemplateIds(template, {
      publishedOnly,
      templateCacheByCode,
      templateCacheById,
      resolvedComponentIds,
      visitedTemplateKeys
    });
  }

  return Array.from(resolvedComponentIds);
}

function collectNestedComponentTemplateIds(template, context) {
  const cacheKey = `${template.type}:${template.id}`;
  if (context.visitedTemplateKeys.has(cacheKey)) {
    return;
  }
  context.visitedTemplateKeys.add(cacheKey);

  for (const componentCode of extractLiteralComponentReferences(getTemplateEffectiveContent(template, context.publishedOnly))) {
    const component = getTemplateByCodeCached(componentCode, context.templateCacheByCode);
    if (!component || component.type !== 'component' || !matchesPublishedFilter(component, context.publishedOnly)) {
      continue;
    }
    context.resolvedComponentIds.add(component.id);
    collectNestedComponentTemplateIds(component, context);
  }
}

function getManualThemeComponentTemplateIds(variantId) {
  return queryAll(
    `
      SELECT template_id
      FROM template_variant_components
      WHERE variant_id = ?
      ORDER BY template_id ASC
    `,
    [variantId]
  ).map((item) => Number(item.template_id)).filter(Boolean);
}

function getTemplateByIdCached(id, cache) {
  if (cache.has(id)) {
    return cache.get(id);
  }
  const template = queryOne(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  ) || null;
  cache.set(id, template);
  if (template?.code) {
    cache.set(template.id, template);
  }
  return template;
}

function getTemplateByCodeCached(code, cache) {
  const normalizedCode = normalizeComponentCode(code);
  if (!normalizedCode) {
    return null;
  }
  if (cache.has(normalizedCode)) {
    return cache.get(normalizedCode);
  }
  const template = queryOne(
    `
      SELECT id, name, type, code, engine, content, published_content, status, is_default, sort_order, created_at, updated_at, published_at
      FROM templates
      WHERE code = ?
      LIMIT 1
    `,
    [normalizedCode]
  ) || null;
  cache.set(normalizedCode, template);
  return template;
}

function getTemplateEffectiveContent(template, publishedOnly) {
  if (publishedOnly) {
    return template.published_content || template.content || '';
  }
  return template.content || template.published_content || '';
}

function matchesPublishedFilter(template, publishedOnly) {
  return !publishedOnly || template.status === 'published';
}

function extractLiteralComponentReferences(content) {
  const refs = new Set();
  const source = String(content || '');
  const patterns = [
    /#component\(\s*["']([A-Za-z0-9_-]+)["']\s*\)#/g,
    /\bcomponent\(\s*["']([A-Za-z0-9_-]+)["']/g
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source)) !== null) {
      refs.add(normalizeComponentCode(match[1]));
    }
  }

  return Array.from(refs).filter(Boolean);
}

function normalizeComponentCode(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

function toPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
