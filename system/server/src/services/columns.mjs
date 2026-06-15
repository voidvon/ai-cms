import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, hasMultipleEnabledLanguages, listLanguages } from './languages.mjs';
import { ensureTemplatesSchema } from './templates.mjs';

let schemaEnsured = false;

const EDITABLE_MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page']);
const RESERVED_SINGLE_PAGE_PREFIXES = [
  '/about',
  '/news',
  '/service',
  '/valve',
  '/product',
  '/products',
  '/admin',
  '/api',
  '/assets',
  '/upload',
  '/uploads',
  '/uploadfile',
  '/skin'
];
const RESERVED_SINGLE_PAGE_PATHS = new Set([
  '/',
  '/index.html',
  '/contact.html',
  '/msg.html',
  '/robots.txt',
  '/sitemap.xml',
  '/web.config',
  '/.user.ini'
]);

export function ensureColumnsSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id INTEGER,
      model_code TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id),
      FOREIGN KEY (parent_id) REFERENCES columns(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);

    CREATE TABLE IF NOT EXISTS column_translations (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      content_html TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (column_id, language_id),
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_column_translations_column_id
    ON column_translations(column_id, language_id);
  `);

  addColumnIfMissing('columns', 'column_kind', "TEXT NOT NULL DEFAULT 'category'");
  addColumnIfMissing('columns', 'custom_url', 'TEXT');
  addColumnIfMissing('columns', 'route_path', 'TEXT');
  addColumnIfMissing('columns', 'open_in_new_tab', 'INTEGER NOT NULL DEFAULT 0');
  addColumnIfMissing('columns', 'content_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('columns', 'seo_title', 'TEXT');
  addColumnIfMissing('columns', 'seo_keywords', 'TEXT');
  addColumnIfMissing('columns', 'seo_description', 'TEXT');
  addColumnIfMissing('columns', 'slug', 'TEXT');
  addColumnIfMissing('columns', 'legacy_extra', 'TEXT');

  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_columns_route_path_unique
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);

  ensureDefaultColumnTranslations();
  schemaEnsured = true;
}

export function listColumns({ languageCode = null, includeTranslations = true } = {}) {  const rows = queryAll(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
    `
  );
  return hydrateColumns(rows, { languageCode, includeTranslations });
}

export function getColumnById(id, { languageCode = null, includeTranslations = true } = {}) {  const row = getColumnByIdRaw(id);
  if (!row) {
    return null;
  }
  return hydrateColumns([row], { languageCode, includeTranslations })[0] || null;
}

export function createManualColumn(input) {  const payload = normalizeManualColumnMutationInput(input);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();
  const sourceType = payload.base.column_kind === 'link' ? 'custom_link' : 'single_page';
  const sourceId = getNextManualColumnSourceId(sourceType);
  const result = execute(
    `
      INSERT INTO columns (
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        legacy_extra,
        sort_order,
        show_in_nav,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    [
      defaultTranslation.name,
      payload.base.parent_id,
      payload.base.model_code,
      sourceType,
      sourceId,
      payload.base.column_kind,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      defaultTranslation.content_html,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      payload.base.legacy_extra,
      payload.base.sort_order,
      payload.base.show_in_nav,
      now,
      now
    ]
  );

  saveColumnTranslations(result.lastInsertRowid, payload.translations, now);
  return getColumnById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateManualColumn(id, input) {  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const existingHydrated = getColumnById(id, { includeTranslations: true });
  const payload = normalizeManualColumnMutationInput(input, { currentId: id, existingColumn: existingHydrated });
  if (String(existing.column_kind || '') !== payload.base.column_kind) {
    throw new Error('暂不支持直接切换栏目类型');
  }
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);
  execute(
    `
      UPDATE columns
      SET
        name = ?,
        parent_id = ?,
        model_code = ?,
        column_kind = ?,
        custom_url = ?,
        route_path = ?,
        open_in_new_tab = ?,
        content_html = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        slug = ?,
        legacy_extra = ?,
        sort_order = ?,
        show_in_nav = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      defaultTranslation.name,
      payload.base.parent_id,
      payload.base.model_code,
      payload.base.column_kind,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      defaultTranslation.content_html,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      payload.base.legacy_extra,
      payload.base.sort_order,
      payload.base.show_in_nav,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function updateColumnRecord(id, input) {
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }

  const existingHydrated = getColumnById(id, { includeTranslations: true });
  const payload = normalizeExistingColumnMutationInput(input, existingHydrated);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);

  execute(
    `
      UPDATE columns
      SET
        name = ?,
        parent_id = ?,
        sort_order = ?,
        show_in_nav = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      defaultTranslation.name,
      payload.base.parent_id,
      payload.base.sort_order,
      payload.base.show_in_nav,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function deleteManualColumn(id) {  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const childCount = queryOne(
    'SELECT COUNT(*) AS value FROM columns WHERE parent_id = ?',
    [id]
  )?.value;
  if (Number(childCount || 0) > 0) {
    throw new Error('请先删除或移动子栏目');
  }

  ensureTemplatesSchema();
  execute(
    'DELETE FROM template_bindings WHERE target_type = ? AND target_id = ?',
    ['column', id]
  );
  execute('DELETE FROM columns WHERE id = ?', [id]);
  return existing;
}


function hydrateColumns(rows, { languageCode, includeTranslations = true } = {}) {
  if (!rows.length) {
    return [];
  }

  const columnIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsById = loadColumnTranslations(columnIds);
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const translationEnabled = hasMultipleEnabledLanguages();

  return rows.map((row) => {
    const translations = translationsById.get(Number(row.id)) || [];
    const translationMap = Object.fromEntries(translations.map((translation) => [translation.language_code, translation]));
    const selectedTranslation = translationMap[selectedLanguage.code];
    const defaultTranslation = translationMap[selectedLanguage.default_code];
    const fallbackTranslation = translationEnabled
      ? (selectedTranslation || defaultTranslation || translations[0] || null)
      : null;
    const displayName = fallbackTranslation?.name || row.name;

    return {
      ...row,
      name: displayName,
      content_html: fallbackTranslation?.content_html ?? row.content_html,
      seo_title: fallbackTranslation?.seo_title ?? row.seo_title,
      seo_keywords: fallbackTranslation?.seo_keywords ?? row.seo_keywords,
      seo_description: fallbackTranslation?.seo_description ?? row.seo_description,
      slug: row.slug || null,
      legacy_extra: row.legacy_extra || null,
      page_data: extractColumnPageData(row.legacy_extra),
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      ...(includeTranslations ? {
        translations: Object.fromEntries(
          Object.entries(translationMap).map(([language, translation]) => [
            language,
            {
              name: translation.name,
              content_html: translation.content_html,
              seo_title: translation.seo_title,
              seo_keywords: translation.seo_keywords,
              seo_description: translation.seo_description
            }
          ])
        )
      } : {})
    };
  });
}

function loadColumnTranslations(columnIds) {
  if (!columnIds.length) {
    return new Map();
  }

  const placeholders = columnIds.map(() => '?').join(', ');
  const rows = queryAll(
    `
      SELECT
        t.id,
        t.column_id,
        t.language_id,
        l.code AS language_code,
        t.name,
        t.content_html,
        t.seo_title,
        t.seo_keywords,
        t.seo_description
      FROM column_translations t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.column_id IN (${placeholders})
      ORDER BY t.column_id ASC, l.sort_order ASC, l.id ASC
    `,
    columnIds
  );

  const map = new Map();
  for (const row of rows) {
    const list = map.get(Number(row.column_id)) || [];
    list.push({
      id: Number(row.id),
      column_id: Number(row.column_id),
      language_id: Number(row.language_id),
      language_code: row.language_code,
      name: row.name || '',
      content_html: row.content_html || '',
      seo_title: row.seo_title || '',
      seo_keywords: row.seo_keywords || '',
      seo_description: row.seo_description || ''
    });
    map.set(Number(row.column_id), list);
  }
  return map;
}

function saveColumnTranslations(columnId, translations, now = new Date().toISOString()) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    execute(
      `
        INSERT INTO column_translations (
          column_id,
          language_id,
          name,
          content_html,
          seo_title,
          seo_keywords,
          seo_description,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(column_id, language_id) DO UPDATE SET
          name = excluded.name,
          content_html = excluded.content_html,
          seo_title = excluded.seo_title,
          seo_keywords = excluded.seo_keywords,
          seo_description = excluded.seo_description,
          updated_at = excluded.updated_at
      `,
      [
        columnId,
        languageId,
        String(translation?.name || '').trim(),
        translation?.content_html || '',
        toNullableString(translation?.seo_title),
        toNullableString(translation?.seo_keywords),
        toNullableString(translation?.seo_description),
        now,
        now
      ]
    );
  }
}

function ensureDefaultColumnTranslations() {
  const defaultLanguage = getDefaultLanguage();
  if (!defaultLanguage) {
    return;
  }

  execute(
    `
      INSERT INTO column_translations (
        column_id,
        language_id,
        name,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        created_at,
        updated_at
      )
      SELECT
        c.id,
        ?,
        coalesce(c.name, ''),
        c.content_html,
        c.seo_title,
        c.seo_keywords,
        c.seo_description,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      FROM columns c
      WHERE NOT EXISTS (
        SELECT 1
        FROM column_translations t
        WHERE t.column_id = c.id
          AND t.language_id = ?
      )
    `,
    [defaultLanguage.id, defaultLanguage.id]
  );
}

function getColumnBySource(sourceType, sourceId) {
  return queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      WHERE source_type = ? AND source_id = ?
    `,
    [sourceType, sourceId]
  );
}

function getColumnByIdRaw(id) {
  ensureColumnsSchema();
  return queryOne(
    `
      SELECT
        id,
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        content_html,
        seo_title,
        seo_keywords,
        seo_description,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns
      WHERE id = ?
    `,
    [id]
  ) || null;
}

function normalizeManualColumnInput(input, options = {}) {
  const currentId = toInteger(options.currentId, 0);
  const existing = currentId ? getColumnByIdRaw(currentId) : null;
  const columnKind = normalizeColumnKind(input.column_kind ?? existing?.column_kind);
  const name = String(input.name ?? existing?.name ?? '').trim();
  if (!name) {
    throw new Error('栏目名称不能为空');
  }

  const parentId = toInteger(input.parent_id ?? existing?.parent_id, 0);
  if (currentId && parentId === currentId) {
    throw new Error('父栏目不能选择自己');
  }

  const parent = parentId > 0 ? getColumnByIdRaw(parentId) : null;
  if (parentId > 0 && !parent) {
    throw new Error('父栏目不存在');
  }
  if (currentId && parentId > 0 && wouldCreateColumnCycle(currentId, parentId)) {
    throw new Error('不能将栏目移动到自己的子栏目下');
  }

  const sortOrder = toInteger(input.sort_order ?? existing?.sort_order, 0);
  const showInNav = toBooleanInt(input.show_in_nav ?? existing?.show_in_nav, 1);
  const seoTitle = toNullableString(input.seo_title ?? existing?.seo_title);
  const seoKeywords = toNullableString(input.seo_keywords ?? existing?.seo_keywords);
  const seoDescription = toNullableString(input.seo_description ?? existing?.seo_description);

  if (columnKind === 'link') {
    const customUrl = normalizeColumnUrl(input.custom_url ?? existing?.custom_url);
    return {
      name,
      parent_id: parentId || null,
      model_code: 'link',
      column_kind: columnKind,
      custom_url: customUrl,
      route_path: null,
      open_in_new_tab: toBooleanInt(input.open_in_new_tab ?? existing?.open_in_new_tab, 0),
      content_html: '',
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      legacy_extra: existing?.legacy_extra ?? null,
      sort_order: sortOrder,
      show_in_nav: showInNav
    };
  }

  const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path);
  validateSinglePageRoutePath(routePath, currentId || null);
  return {
    name,
    parent_id: parentId || null,
    model_code: 'page',
    column_kind: columnKind,
    custom_url: null,
    route_path: routePath,
    open_in_new_tab: 0,
    content_html: String(input.content_html ?? existing?.content_html ?? ''),
    seo_title: seoTitle,
    seo_keywords: seoKeywords,
    seo_description: seoDescription,
    legacy_extra: existing?.legacy_extra ?? null,
    sort_order: sortOrder,
    show_in_nav: showInNav
  };
}

function normalizeManualColumnMutationInput(input, { currentId = 0, existingColumn = null } = {}) {
  if (input?.base || input?.translations) {
    const existing = existingColumn || {};
    const baseSource = { ...existing, ...(input.base || {}) };
    const base = normalizeManualColumnInput(baseSource, { currentId });
    const translations = normalizeColumnTranslations(input.translations || {}, {
      defaultLanguageCode: getDefaultLanguage()?.code || 'zh-CN',
      existingTranslations: existing.translations || {},
      fallbackBase: base
    });
    return { base, translations };
  }

  const legacy = normalizeManualColumnInput({ ...(existingColumn || {}), ...(input || {}) }, { currentId });
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  return {
    base: legacy,
    translations: {
      [defaultLanguageCode]: {
        name: legacy.name,
        content_html: legacy.content_html,
        seo_title: legacy.seo_title,
        seo_keywords: legacy.seo_keywords,
        seo_description: legacy.seo_description
      }
    }
  };
}

function normalizeExistingColumnMutationInput(input, existingColumn = null) {
  const existing = existingColumn || {};
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const parentId = toInteger(input?.parent_id ?? existing.parent_id, 0);
  const sortOrder = toInteger(input?.sort_order ?? existing.sort_order, 0);
  const showInNav = toBooleanInt(input?.show_in_nav ?? existing.show_in_nav, 1);

  const translations = normalizeColumnTranslations(input?.translations || {}, {
    defaultLanguageCode,
    existingTranslations: existing.translations || {},
    fallbackBase: {
      name: String(existing.name || '').trim(),
      content_html: String(existing.content_html || ''),
      seo_title: toNullableString(existing.seo_title),
      seo_keywords: toNullableString(existing.seo_keywords),
      seo_description: toNullableString(existing.seo_description)
    }
  });

  return {
    base: {
      parent_id: parentId || null,
      sort_order: sortOrder,
      show_in_nav: showInNav
    },
    translations
  };
}

function normalizeColumnTranslations(translations, { defaultLanguageCode, existingTranslations = {}, fallbackBase }) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const normalized = {
      name: String(value?.name ?? existingTranslations?.[languageCode]?.name ?? '').trim(),
      content_html: String(value?.content_html ?? existingTranslations?.[languageCode]?.content_html ?? fallbackBase.content_html ?? ''),
      seo_title: toNullableString(value?.seo_title ?? existingTranslations?.[languageCode]?.seo_title ?? fallbackBase.seo_title),
      seo_keywords: toNullableString(value?.seo_keywords ?? existingTranslations?.[languageCode]?.seo_keywords ?? fallbackBase.seo_keywords),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description ?? fallbackBase.seo_description)
    };
    if (languageCode === defaultLanguageCode && !normalized.name) {
      throw new Error('默认语言的栏目名称不能为空');
    }
    if (normalized.name || normalized.content_html || normalized.seo_title || normalized.seo_keywords || normalized.seo_description) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallback = existingTranslations?.[defaultLanguageCode];
    output[defaultLanguageCode] = {
      name: String(fallback?.name || fallbackBase.name || '').trim(),
      content_html: String(fallback?.content_html || fallbackBase.content_html || ''),
      seo_title: toNullableString(fallback?.seo_title || fallbackBase.seo_title),
      seo_keywords: toNullableString(fallback?.seo_keywords || fallbackBase.seo_keywords),
      seo_description: toNullableString(fallback?.seo_description || fallbackBase.seo_description)
    };
    if (!output[defaultLanguageCode].name) {
      throw new Error('默认语言的栏目名称不能为空');
    }
  }

  return output;
}

function resolveDefaultColumnTranslation(translations, defaultLanguageCode) {
  const code = defaultLanguageCode || 'zh-CN';
  const direct = translations[code];
  if (direct?.name) {
    return direct;
  }
  const first = Object.values(translations).find((item) => item?.name);
  if (first) {
    return first;
  }
  throw new Error('至少需要提供默认语言的栏目名称');
}

function resolveLanguageForContent(languageCode) {
  const defaultLanguage = getDefaultLanguage();
  const fallbackCode = defaultLanguage?.code || 'zh-CN';
  const code = String(languageCode || '').trim() || fallbackCode;
  return {
    code,
    default_code: fallbackCode
  };
}

function assertEditableManualColumn(column) {
  if (!column || Number(column.is_system || 0) === 1 || !EDITABLE_MANUAL_SOURCE_TYPES.has(String(column.source_type || ''))) {
    throw new Error('当前栏目不支持直接编辑');
  }
}

function getNextManualColumnSourceId(sourceType) {
  const value = queryOne(
    'SELECT COALESCE(MAX(source_id), 0) + 1 AS value FROM columns WHERE source_type = ?',
    [sourceType]
  )?.value;
  return toInteger(value, 1);
}

function wouldCreateColumnCycle(currentId, parentId) {
  let cursor = getColumnByIdRaw(parentId);
  const visited = new Set();
  while (cursor) {
    const cursorId = toInteger(cursor.id, 0);
    if (!cursorId || visited.has(cursorId)) {
      break;
    }
    if (cursorId === currentId) {
      return true;
    }
    visited.add(cursorId);
    const nextParentId = toInteger(cursor.parent_id, 0);
    cursor = nextParentId > 0 ? getColumnByIdRaw(nextParentId) : null;
  }
  return false;
}

function validateSinglePageRoutePath(routePath, currentId = null) {
  if (RESERVED_SINGLE_PAGE_PATHS.has(routePath.toLowerCase())) {
    throw new Error('该访问路径已被系统保留');
  }

  const normalized = routePath.toLowerCase();
  if (RESERVED_SINGLE_PAGE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    throw new Error('该访问路径与系统栏目冲突');
  }

  const params = currentId
    ? [routePath, currentId]
    : [routePath];
  const existing = queryOne(
    currentId
      ? 'SELECT id FROM columns WHERE route_path = ? AND id <> ? LIMIT 1'
      : 'SELECT id FROM columns WHERE route_path = ? LIMIT 1',
    params
  );
  if (existing) {
    throw new Error('访问路径已存在');
  }
}

function normalizeColumnKind(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'link' || normalized === 'single') {
    return normalized;
  }
  throw new Error('栏目类型不正确');
}

function normalizeColumnUrl(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error('链接地址不能为空');
  }
  return normalized;
}

function normalizeRoutePath(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    throw new Error('访问路径不能为空');
  }
  if (/^https?:\/\//i.test(normalized)) {
    throw new Error('单页栏目访问路径不能是完整网址');
  }

  let routePath = normalized.startsWith('/') ? normalized : `/${normalized}`;
  routePath = routePath.replace(/\/{2,}/g, '/');

  if (routePath !== '/' && routePath.endsWith('/')) {
    return routePath;
  }
  if (pathLooksLikeFile(routePath)) {
    return routePath;
  }
  return `${routePath}/`;
}

function pathLooksLikeFile(value) {
  const lastSegment = String(value || '').split('/').filter(Boolean).pop() || '';
  return lastSegment.includes('.');
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
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

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function extractColumnPageData(legacyExtra) {
  const parsed = parseLegacyExtra(legacyExtra);
  return parsed?.page_data && typeof parsed.page_data === 'object'
    ? parsed.page_data
    : null;
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
