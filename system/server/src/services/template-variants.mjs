import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureTemplatesSchema, listTemplates } from './templates.mjs';

let schemaEnsured = false;

export function ensureTemplateVariantsSchema() {
  if (schemaEnsured) {
    return;
  }

  getDb().exec(`
    CREATE TABLE IF NOT EXISTS template_variants (
      id INTEGER PRIMARY KEY,
      template_name TEXT NOT NULL,
      is_selected INTEGER NOT NULL DEFAULT 0
    );
  `);

  dropLegacyThemeSchema();
  schemaEnsured = true;
}

export function listTemplateVariants() {
  ensureTemplateVariantsSchema();
  ensureTemplatesSchema();
  const rows = queryAll(
    `
      SELECT id, template_name, is_selected
      FROM template_variants
      ORDER BY id ASC
    `
  );
  return attachThemeTemplates(rows);
}

export function getTemplateVariantById(id) {
  ensureTemplateVariantsSchema();
  ensureTemplatesSchema();
  const row = queryOne(
    `
      SELECT id, template_name, is_selected
      FROM template_variants
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  );
  return row ? attachThemeTemplates([row])[0] : null;
}

export function getSelectedTemplateVariant() {
  ensureTemplateVariantsSchema();
  ensureTemplatesSchema();
  const row = queryOne(
    `
      SELECT id, template_name, is_selected
      FROM template_variants
      WHERE is_selected = 1
      ORDER BY id ASC
      LIMIT 1
    `
  );
  return row ? attachThemeTemplates([row])[0] : null;
}

export function createTemplateVariant(input = {}) {
  ensureTemplateVariantsSchema();
  const count = queryOne('SELECT COUNT(*) AS count FROM template_variants')?.count || 0;
  const payload = normalizeTemplateVariantInput(input, {
    defaultSelected: count === 0
  });
  const result = execute(
    `
      INSERT INTO template_variants (template_name, is_selected)
      VALUES (?, ?)
    `,
    [payload.template_name, payload.is_selected]
  );

  if (payload.is_selected === 1) {
    execute('UPDATE template_variants SET is_selected = 0 WHERE id <> ?', [result.lastInsertRowid]);
  }

  if (payload.source_theme_id) {
    cloneThemeTemplates(payload.source_theme_id, result.lastInsertRowid);
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
      SET template_name = ?, is_selected = ?
      WHERE id = ?
    `,
    [payload.template_name, payload.is_selected, id]
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
  execute('DELETE FROM template_bindings WHERE theme_id = ?', [id]);
  execute('DELETE FROM templates WHERE theme_id = ?', [id]);

  if (existing.is_selected === 1) {
    const firstRemaining = queryOne('SELECT id FROM template_variants ORDER BY id ASC LIMIT 1');
    if (firstRemaining?.id) {
      execute('UPDATE template_variants SET is_selected = 1 WHERE id = ?', [firstRemaining.id]);
    }
  }

  return existing;
}

export function listThemeVariantTemplates(variantId, { publishedOnly = false } = {}) {
  ensureTemplateVariantsSchema();
  ensureTemplatesSchema();
  const templates = listTemplates({ themeId: variantId });
  return publishedOnly ? templates.filter((template) => template.status === 'published') : templates;
}

export function listTemplateVariantComponents(variantId, { publishedOnly = false } = {}) {
  return listThemeVariantTemplates(variantId, { publishedOnly }).filter((template) => template.type === 'component');
}

export function listSelectedThemePublishedComponents() {
  const selected = getSelectedTemplateVariant();
  if (!selected?.id) {
    return [];
  }
  return listTemplateVariantComponents(selected.id, { publishedOnly: true }).map((item) => ({
    code: item.code,
    engine: item.engine || 'tsx',
    tsx_source: item.published_tsx_source || item.tsx_source || '',
    css_source: item.published_css_source || item.css_source || '',
    global_css_source: item.published_global_css_source || item.global_css_source || ''
  }));
}

export function detachTemplateFromAllThemeVariants() {
  ensureTemplateVariantsSchema();
}

function normalizeTemplateVariantInput(input, options = {}) {
  return {
    template_name: toNullableString(input.template_name) || options.existing?.template_name || '未命名主题',
    is_selected: toBooleanInt(
      input.is_selected ?? options.existing?.is_selected,
      options.existing?.is_selected ? 1 : (options.defaultSelected ? 1 : 0)
    ),
    source_theme_id: toPositiveInteger(input.source_theme_id)
  };
}

function attachThemeTemplates(rows) {
  const templates = listTemplates();
  const templatesByThemeId = new Map();
  for (const template of templates) {
    const themeId = Number(template.theme_id || 0);
    if (!templatesByThemeId.has(themeId)) {
      templatesByThemeId.set(themeId, []);
    }
    templatesByThemeId.get(themeId).push(template);
  }

  return rows.map((item) => ({
    ...item,
    theme_templates: templatesByThemeId.get(Number(item.id || 0)) || [],
  }));
}

function cloneThemeTemplates(sourceThemeId, targetThemeId) {
  ensureTemplatesSchema();
  const templates = listTemplates({ themeId: sourceThemeId });
  for (const template of templates) {
    execute(
      `
      INSERT INTO templates (
        theme_id,
        name,
        type,
        code,
        engine,
        tsx_source,
        css_source,
        global_css_source,
        published_tsx_source,
        published_css_source,
        published_global_css_source,
        status,
        is_default,
        sort_order,
        created_at,
        updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [
        targetThemeId,
        template.name,
        template.type,
        template.code,
        template.engine || 'tsx',
        template.tsx_source || '',
        template.css_source || '',
        template.global_css_source || '',
        template.published_tsx_source || null,
        template.published_css_source || null,
        template.published_global_css_source || null,
        template.status || 'draft',
        template.is_default || 0,
        template.sort_order || 0
      ]
    );
  }
}

function dropLegacyThemeSchema() {
  const columns = queryAll('PRAGMA table_info(template_variants)');
  const hasLegacyColumns = columns.some((column) => [
    'home_index',
    'co_index',
    'produts_index',
    'produts_sort1',
    'produts_sort2',
    'produts_detail',
    'news_index',
    'news_sort1',
    'news_detail',
    'service_sort1',
    'service_detail',
    'msg_index',
    'contact',
    'legacy_extra',
  ].includes(column.name));

  if (hasLegacyColumns) {
    getDb().exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN TRANSACTION;

      ALTER TABLE template_variants RENAME TO template_variants__legacy_cleanup;

      CREATE TABLE template_variants (
        id INTEGER PRIMARY KEY,
        template_name TEXT NOT NULL,
        is_selected INTEGER NOT NULL DEFAULT 0
      );

      INSERT INTO template_variants (id, template_name, is_selected)
      SELECT id, template_name, is_selected
      FROM template_variants__legacy_cleanup;

      DROP TABLE template_variants__legacy_cleanup;

      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
  }

  execute('DROP TABLE IF EXISTS template_variant_components');
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
