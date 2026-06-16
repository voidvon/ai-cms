import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';
import { ensureTemplatesSchema } from './templates.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';
import { ensureContentModelsSchema, getContentModelById } from './content-models.mjs';

let schemaEnsured = false;

const EDITABLE_MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page', 'contact_page', 'product_category', 'news_category', 'corporation_category']);
const MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page', 'contact_page', 'product_category', 'news_category', 'corporation_category']);
const CATEGORY_SOURCE_TYPE_BY_MODEL = {
  product: 'product_category',
  news: 'news_category',
  corporation: 'corporation_category'
};
const CATEGORY_SOURCE_TYPES = new Set(Object.values(CATEGORY_SOURCE_TYPE_BY_MODEL));
const ROOT_SOURCE_TYPE_BY_MODEL = {
  product: 'product_root',
  news: null,
  corporation: 'corporation_root'
};
const ROOT_SOURCE_ID_BY_MODEL = {
  product: 0,
  news: null,
  corporation: 0
};
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
  '/skin'
];
const RESERVED_SINGLE_PAGE_PATHS = new Set([
  '/',
  '/index.html',
  '/contact.html',
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
  rebuildColumnTranslationsIfNeeded();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      model_code TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      column_kind TEXT NOT NULL DEFAULT 'category',
      custom_url TEXT,
      route_path TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 0,
      show_in_nav INTEGER NOT NULL DEFAULT 1,
      content_model_id INTEGER,
      slug TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id),
      FOREIGN KEY (parent_id) REFERENCES columns(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS column_translations (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
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
  addColumnIfMissing('columns', 'show_in_nav', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('columns', 'content_model_id', 'INTEGER');
  addColumnIfMissing('columns', 'slug', 'TEXT');
  addColumnIfMissing('columns', 'legacy_extra', 'TEXT');
  addColumnIfMissing('columns', 'is_visible', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('column_translations', 'summary', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('column_translations', 'content_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('column_translations', 'keywords', 'TEXT');
  addColumnIfMissing('column_translations', 'seo_title', 'TEXT');
  addColumnIfMissing('column_translations', 'seo_keywords', 'TEXT');
  addColumnIfMissing('column_translations', 'seo_description', 'TEXT');
  addColumnIfMissing('column_translations', 'publish_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing('column_translations', 'published_at', 'TEXT');

  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_columns_kind_visible ON columns(column_kind, is_visible, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_slug ON columns(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_columns_route_path_unique
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);

  ensureColumnContentModelBindings();
  migrateColumnsToLeanSchema();

  schemaEnsured = true;
}

export function listColumns({ languageCode = null, includeTranslations = true } = {}) {
  ensureColumnsSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_model_id,
        slug,
        is_visible,
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

export function getColumnById(id, { languageCode = null, includeTranslations = true } = {}) {
  const row = getColumnByIdRaw(id);
  if (!row) {
    return null;
  }
  return hydrateColumns([row], { languageCode, includeTranslations })[0] || null;
}

export function listCategoryColumns(model, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const sourceType = CATEGORY_SOURCE_TYPE_BY_MODEL[model];
  if (!sourceType) {
    return [];
  }
  return listColumns({ languageCode, includeTranslations: true }).filter((item) => (
    String(item.model_code || '') === model
    && String(item.source_type || '') === sourceType
  ));
}

export function getCategoryRootColumn(model, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const sourceType = ROOT_SOURCE_TYPE_BY_MODEL[model];
  if (!sourceType) {
    return null;
  }
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.model_code || '') === model
    && String(item.source_type || '') === sourceType
  )) || null;
}

export function createManualColumn(input) {
  const payload = normalizeManualColumnMutationInput(input);
  const now = new Date().toISOString();
  const sourceType = payload.base.source_type || (payload.base.column_kind === 'link' ? 'custom_link' : 'single_page');
  const sourceId = getNextSourceId(sourceType);
  const result = execute(
    `
      INSERT INTO columns (
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_model_id,
        slug,
        is_visible,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    [
      payload.base.parent_id,
      payload.base.model_code,
      sourceType,
      sourceId,
      payload.base.column_kind,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      payload.base.show_in_nav,
      payload.base.content_model_id,
      payload.base.slug,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
      now,
      now
    ]
  );

  saveColumnTranslations(result.lastInsertRowid, payload.translations, now);
  return getColumnById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateManualColumn(id, input) {
  const existing = getColumnByIdRaw(id);
  if (!existing) {
    return null;
  }
  assertEditableManualColumn(existing);

  const existingHydrated = getColumnById(id, { includeTranslations: true });
  const payload = normalizeManualColumnMutationInput(input, { currentId: id, existingColumn: existingHydrated });

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        model_code = ?,
        source_type = ?,
        column_kind = ?,
        custom_url = ?,
        route_path = ?,
        open_in_new_tab = ?,
        show_in_nav = ?,
        content_model_id = ?,
        slug = ?,
        is_visible = ?,
        legacy_extra = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.model_code,
      payload.base.source_type,
      payload.base.column_kind,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      payload.base.show_in_nav,
      payload.base.content_model_id,
      payload.base.slug,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
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

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        content_model_id = ?,
        show_in_nav = ?,
        is_visible = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.content_model_id,
      payload.base.show_in_nav,
      payload.base.is_visible,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function deleteManualColumn(id) {
  const existing = getColumnByIdRaw(id);
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

function hydrateColumns(rows, {
  languageCode,
  includeTranslations = true,
  includeTranslationStatuses = false
} = {}) {
  if (!rows.length) {
    return [];
  }

  const columnIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsById = loadColumnTranslations(columnIds);
  const selectedLanguage = resolveLanguageForContent(languageCode);
  return rows.map((row) => {
    const translations = translationsById.get(Number(row.id)) || [];
    const translationMap = Object.fromEntries(translations.map((translation) => [translation.language_code, translation]));
    const selectedTranslation = translationMap[selectedLanguage.code];
    const defaultTranslation = translationMap[selectedLanguage.default_code];
    const fallbackTranslation = selectedTranslation || defaultTranslation || translations[0] || null;
    const displayName = fallbackTranslation?.name || row.name;
    const resolvedSummary = fallbackTranslation?.summary ?? '';
    const resolvedContentHtml = fallbackTranslation?.content_html ?? '';
    const resolvedKeywords = fallbackTranslation?.keywords ?? '';
    const resolvedSeoTitle = fallbackTranslation?.seo_title ?? null;
    const resolvedSeoKeywords = fallbackTranslation?.seo_keywords ?? null;
    const resolvedSeoDescription = fallbackTranslation?.seo_description ?? null;
    const resolvedPublishStatus = fallbackTranslation?.publish_status ?? 'published';
    const resolvedPublishedAt = fallbackTranslation?.published_at ?? null;
    const base = {
      ...row,
      name: displayName,
      content_html: resolvedContentHtml,
      summary: resolvedSummary,
      keywords: resolvedKeywords || '',
      seo_title: resolvedSeoTitle ?? null,
      seo_keywords: resolvedSeoKeywords ?? null,
      seo_description: resolvedSeoDescription ?? null,
      content_model_id: toNullableInteger(row.content_model_id),
      slug: row.slug || null,
      publish_status: resolvedPublishStatus,
      published_at: resolvedPublishedAt,
      legacy_extra: row.legacy_extra || null,
      page_data: extractColumnPageData(row.legacy_extra),
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      source_id: toInteger(row.source_id, 0),
      sort_order: toInteger(row.sort_order, 0),
      is_system: toBooleanInt(row.is_system, 0),
      is_visible: toBooleanInt(row.is_visible, 1),
      open_in_new_tab: toBooleanInt(row.open_in_new_tab, 0),
      show_in_nav: toBooleanInt(row.show_in_nav, 1)
    };

    return {
      ...base,
      ...(includeTranslations ? {
        translations: Object.fromEntries(
          Object.entries(translationMap).map(([language, translation]) => [
            language,
            {
              name: translation.name,
              title: translation.name,
              summary: translation.summary,
              content_html: translation.content_html,
              keywords: translation.keywords,
              seo_title: translation.seo_title,
              seo_keywords: translation.seo_keywords,
              seo_description: translation.seo_description,
              publish_status: translation.publish_status,
              published_at: translation.published_at
            }
          ])
        )
      } : {}),
      ...(includeTranslationStatuses ? {
        translation_statuses: translations.map((translation) => ({
          language_code: translation.language_code,
          publish_status: translation.publish_status,
          published_at: translation.published_at,
          has_content: Boolean(
            String(translation.name || '').trim()
            || String(translation.summary || '').trim()
            || String(translation.content_html || '').trim()
          )
        }))
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
        t.summary,
        t.content_html,
        t.keywords,
        t.seo_title,
        t.seo_keywords,
        t.seo_description,
        t.publish_status,
        t.published_at
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
      summary: row.summary || '',
      content_html: row.content_html || '',
      keywords: row.keywords || '',
      seo_title: row.seo_title || '',
      seo_keywords: row.seo_keywords || '',
      seo_description: row.seo_description || '',
      publish_status: normalizePublishStatus(row.publish_status),
      published_at: toNullableString(row.published_at)
    });
    map.set(Number(row.column_id), list);
  }
  return map;
}

function saveColumnTranslations(columnId, translations, now = new Date().toISOString(), options = {}) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }
    const persistedTranslation = translation || {};

    execute(
      `
        INSERT INTO column_translations (
          column_id,
          language_id,
          name,
          summary,
          content_html,
          keywords,
          seo_title,
          seo_keywords,
          seo_description,
          publish_status,
          published_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(column_id, language_id) DO UPDATE SET
          name = excluded.name,
          summary = excluded.summary,
          content_html = excluded.content_html,
          keywords = excluded.keywords,
          seo_title = excluded.seo_title,
          seo_keywords = excluded.seo_keywords,
          seo_description = excluded.seo_description,
          publish_status = excluded.publish_status,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
      `,
      [
        columnId,
        languageId,
        String(persistedTranslation?.name || '').trim(),
        String(persistedTranslation?.summary || ''),
        String(persistedTranslation?.content_html || ''),
        toNullableString(persistedTranslation?.keywords),
        toNullableString(persistedTranslation?.seo_title),
        toNullableString(persistedTranslation?.seo_keywords),
        toNullableString(persistedTranslation?.seo_description),
        normalizePublishStatus(persistedTranslation?.publish_status),
        toNullableString(persistedTranslation?.published_at),
        now,
        now
      ]
    );
  }
}

function getColumnByIdRaw(id) {
  ensureColumnsSchema();
  return queryOne(
    `
      SELECT
        id,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_model_id,
        slug,
        is_visible,
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
  const existingView = options.existingColumn || existing || {};
  const columnKind = normalizeColumnKind(input.column_kind ?? existing?.column_kind);
  const sourceType = normalizeManualSourceType(input.source_type ?? existing?.source_type, columnKind);
  const name = String(input.name ?? existingView.name ?? '').trim();
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
  const seoTitle = toNullableString(input.seo_title ?? existingView.seo_title);
  const seoKeywords = toNullableString(input.seo_keywords ?? existingView.seo_keywords);
  const seoDescription = toNullableString(input.seo_description ?? existingView.seo_description);
  const summary = toNullableString(input.summary ?? existingView.summary) || '';
  const keywords = toNullableString(input.keywords ?? existingView.keywords);
  const contentModelId = normalizeContentModelId(input.content_model_id ?? existing?.content_model_id);

  if (columnKind === 'category' || CATEGORY_SOURCE_TYPES.has(sourceType)) {
    const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path ?? getManualRoutePathBySourceType(sourceType));
    return {
      name,
      parent_id: parentId || null,
      model_code: String(input.model_code ?? existing?.model_code ?? inferModelCodeBySourceType(sourceType)).trim() || inferModelCodeBySourceType(sourceType),
      source_type: sourceType,
      column_kind: 'category',
      custom_url: toNullableString(input.custom_url ?? existing?.custom_url),
      route_path: routePath,
      open_in_new_tab: toBooleanInt(input.open_in_new_tab ?? existing?.open_in_new_tab, 0),
      show_in_nav: showInNav,
      content_html: String(input.content_html ?? existingView.content_html ?? ''),
      summary,
      keywords,
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      content_model_id: contentModelId,
      slug: toNullableString(input.slug ?? existing?.slug),
      publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
      published_at: toNullableString(input.published_at ?? existing?.published_at),
      is_visible: toBooleanInt(input.is_visible ?? existing?.is_visible, 1),
      legacy_extra: existing?.legacy_extra ?? null,
      sort_order: sortOrder
    };
  }

  if (columnKind === 'link') {
    const customUrl = normalizeColumnUrl(input.custom_url ?? existing?.custom_url);
    return {
      name,
      parent_id: parentId || null,
      model_code: 'link',
      source_type: sourceType,
      column_kind: columnKind,
      custom_url: customUrl,
      route_path: null,
      open_in_new_tab: toBooleanInt(input.open_in_new_tab ?? existing?.open_in_new_tab, 0),
      show_in_nav: showInNav,
      content_html: '',
      summary,
      keywords,
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      content_model_id: contentModelId,
      slug: null,
      publish_status: 'published',
      published_at: null,
      is_visible: 1,
      legacy_extra: existing?.legacy_extra ?? null,
      sort_order: sortOrder
    };
  }

  const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path ?? getManualRoutePathBySourceType(sourceType));
  if (sourceType === 'single_page') {
    validateSinglePageRoutePath(routePath, currentId || null);
  }
  return {
    name,
    parent_id: parentId || null,
    model_code: 'page',
    source_type: sourceType,
    column_kind: columnKind,
    custom_url: null,
    route_path: routePath,
    open_in_new_tab: 0,
    show_in_nav: showInNav,
    content_html: String(input.content_html ?? existingView.content_html ?? ''),
    summary,
    keywords,
    seo_title: seoTitle,
    seo_keywords: seoKeywords,
    seo_description: seoDescription,
    content_model_id: contentModelId,
    slug: toNullableString(input.slug ?? existing?.slug),
    publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
    published_at: toNullableString(input.published_at ?? existing?.published_at),
    is_visible: toBooleanInt(input.is_visible ?? existing?.is_visible, 1),
    legacy_extra: existing?.legacy_extra ?? null,
    sort_order: sortOrder
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
        summary: legacy.summary,
        content_html: legacy.content_html,
        keywords: legacy.keywords,
        seo_title: legacy.seo_title,
        seo_keywords: legacy.seo_keywords,
        seo_description: legacy.seo_description,
        publish_status: legacy.publish_status,
        published_at: legacy.published_at
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
  const isVisible = toBooleanInt(input?.is_visible ?? existing.is_visible, 1);
  const contentModelId = normalizeContentModelId(input?.content_model_id ?? existing.content_model_id);

  const translations = normalizeColumnTranslations(input?.translations || {}, {
    defaultLanguageCode,
    existingTranslations: existing.translations || {},
    fallbackBase: {
      name: String(existing.name || '').trim(),
      summary: String(existing.summary || ''),
      content_html: String(existing.content_html || ''),
      keywords: String(existing.keywords || ''),
      seo_title: toNullableString(existing.seo_title),
      seo_keywords: toNullableString(existing.seo_keywords),
      seo_description: toNullableString(existing.seo_description),
      publish_status: normalizePublishStatus(existing.publish_status || 'published'),
      published_at: toNullableString(existing.published_at)
    }
  });

  return {
    base: {
      parent_id: parentId || null,
      content_model_id: contentModelId,
      sort_order: sortOrder,
      show_in_nav: showInNav,
      is_visible: isVisible
    },
    translations
  };
}

function normalizeContentModelId(value) {
  ensureContentModelsSchema();
  const modelId = toInteger(value, 0);
  if (modelId <= 0) {
    return null;
  }
  const model = getContentModelById(modelId);
  if (!model) {
    throw new Error('绑定的内容模型不存在');
  }
  return model.id;
}

function normalizeColumnTranslations(translations, {
  defaultLanguageCode,
  existingTranslations = {},
  fallbackBase,
  nameField = 'name'
}) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const translationName = String(
      value?.[nameField]
      ?? value?.name
      ?? value?.title
      ?? existingTranslations?.[languageCode]?.[nameField]
      ?? existingTranslations?.[languageCode]?.name
      ?? existingTranslations?.[languageCode]?.title
      ?? ''
    ).trim();
    const normalized = {
      name: translationName,
      summary: String(value?.summary ?? existingTranslations?.[languageCode]?.summary ?? fallbackBase.summary ?? ''),
      content_html: String(value?.content_html ?? existingTranslations?.[languageCode]?.content_html ?? fallbackBase.content_html ?? ''),
      keywords: toNullableString(value?.keywords ?? existingTranslations?.[languageCode]?.keywords ?? fallbackBase.keywords),
      seo_title: toNullableString(value?.seo_title ?? existingTranslations?.[languageCode]?.seo_title ?? fallbackBase.seo_title),
      seo_keywords: toNullableString(value?.seo_keywords ?? existingTranslations?.[languageCode]?.seo_keywords ?? fallbackBase.seo_keywords),
      seo_description: toNullableString(value?.seo_description ?? existingTranslations?.[languageCode]?.seo_description ?? fallbackBase.seo_description),
      publish_status: normalizePublishStatus(value?.publish_status ?? existingTranslations?.[languageCode]?.publish_status ?? fallbackBase.publish_status),
      published_at: toNullableString(value?.published_at ?? existingTranslations?.[languageCode]?.published_at ?? fallbackBase.published_at)
    };
    if (languageCode === defaultLanguageCode && !normalized.name) {
      throw new Error('默认语言名称不能为空');
    }
    if (
      normalized.name
      || normalized.summary
      || normalized.content_html
      || normalized.keywords
      || normalized.seo_title
      || normalized.seo_keywords
      || normalized.seo_description
    ) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallback = existingTranslations?.[defaultLanguageCode];
    output[defaultLanguageCode] = {
      name: String(fallback?.name || fallback?.title || fallbackBase.name || '').trim(),
      summary: String(fallback?.summary || fallbackBase.summary || ''),
      content_html: String(fallback?.content_html || fallbackBase.content_html || ''),
      keywords: toNullableString(fallback?.keywords || fallbackBase.keywords),
      seo_title: toNullableString(fallback?.seo_title || fallbackBase.seo_title),
      seo_keywords: toNullableString(fallback?.seo_keywords || fallbackBase.seo_keywords),
      seo_description: toNullableString(fallback?.seo_description || fallbackBase.seo_description),
      publish_status: normalizePublishStatus(fallback?.publish_status || fallbackBase.publish_status),
      published_at: toNullableString(fallback?.published_at || fallbackBase.published_at)
    };
    if (!output[defaultLanguageCode].name) {
      throw new Error('默认语言名称不能为空');
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
  throw new Error('至少需要提供默认语言名称');
}

function resolveLanguageForContent(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = getDefaultLanguage();
  const fallbackLanguage = defaultLanguage || languages[0] || null;
  const fallbackCode = fallbackLanguage?.code || 'zh-CN';
  const requestedCode = String(languageCode || '').trim();
  const selectedLanguage = languages.find((language) => language.code === requestedCode) || fallbackLanguage;
  const code = selectedLanguage?.code || requestedCode || fallbackCode;
  return {
    code,
    id: toInteger(selectedLanguage?.id, 0) || null,
    default_code: fallbackCode,
    default_id: toInteger(fallbackLanguage?.id, 0) || null
  };
}

function buildColumnNameJoin(tableAlias, languageId, defaultLanguageId) {
  const selectedAlias = `${tableAlias}_selected_translation`;
  const defaultAlias = `${tableAlias}_default_translation`;
  return {
    joinSql: `
      LEFT JOIN column_translations ${selectedAlias}
        ON ${selectedAlias}.column_id = ${tableAlias}.id
       AND ${selectedAlias}.language_id = ${languageId ? Number(languageId) : 0}
      LEFT JOIN column_translations ${defaultAlias}
        ON ${defaultAlias}.column_id = ${tableAlias}.id
       AND ${defaultAlias}.language_id = ${defaultLanguageId ? Number(defaultLanguageId) : 0}
    `,
    nameExpr: `COALESCE(${selectedAlias}.name, ${defaultAlias}.name, '')`
  };
}

function assertEditableManualColumn(column) {
  if (!column || Number(column.is_system || 0) === 1 || !EDITABLE_MANUAL_SOURCE_TYPES.has(String(column.source_type || ''))) {
    throw new Error('当前栏目不支持直接编辑');
  }
}

function getNextSourceId(sourceType) {
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
  if (normalized === 'link' || normalized === 'single' || normalized === 'category') {
    return normalized;
  }
  throw new Error('栏目类型不正确');
}

function normalizeManualSourceType(value, columnKind) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return columnKind === 'link' ? 'custom_link' : 'single_page';
  }
  if ((columnKind === 'single' || columnKind === 'category') && ['product_category', 'news_category', 'corporation_category'].includes(normalized)) {
    return normalized;
  }
  if (columnKind === 'link' && normalized === 'custom_link') {
    return normalized;
  }
  if (columnKind === 'single' && ['single_page', 'contact_page'].includes(normalized)) {
    return normalized;
  }
  throw new Error('栏目来源类型不正确');
}

function getManualRoutePathBySourceType(sourceType) {
  if (sourceType === 'contact_page') {
    return '/contact.html';
  }
  if (CATEGORY_SOURCE_TYPES.has(sourceType)) {
    return `/__internal/${inferModelCodeBySourceType(sourceType) || 'column'}/`;
  }
  return '';
}

function inferModelCodeBySourceType(sourceType) {
  if (sourceType === 'product_category' || sourceType === 'product_root') {
    return 'product';
  }
  if (sourceType === 'news_category') {
    return 'news';
  }
  if (sourceType === 'corporation_category' || sourceType === 'corporation_root') {
    return 'corporation';
  }
  return '';
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

function hasTable(name) {
  return Boolean(queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [name]
  ));
}

function hasColumn(tableName, columnName) {
  if (!hasTable(tableName)) {
    return false;
  }
  return queryAll(`PRAGMA table_info(${tableName})`).some((column) => column.name === columnName);
}

function addColumnIfMissing(tableName, columnName, definition) {
  if (hasColumn(tableName, columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function normalizeImageList(value, fallbackImage = null) {
  if (Array.isArray(value)) {
    return value
      .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
      .filter(Boolean);
  }
  const normalized = String(value || '').trim();
  if (!normalized) {
    return fallbackImage ? [normalizeUploadedRelativePath(String(fallbackImage).trim())].filter(Boolean) : [];
  }
  try {
    const parsed = JSON.parse(normalized);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
        .filter(Boolean);
    }
  } catch {
    // ignore
  }
  return [normalizeUploadedRelativePath(normalized)].filter(Boolean);
}

function normalizeSingleImage(value) {
  const normalized = String(value || '').trim();
  return normalizeUploadedRelativePath(normalized) || '';
}

function normalizePublishStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'draft' ? 'draft' : 'published';
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
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

function ensureColumnContentModelBindings() {
  ensureContentModelsSchema();
  const modelIdByCode = new Map(
    queryAll('SELECT id, code FROM content_models ORDER BY id ASC')
      .map((model) => [String(model.code || ''), Number(model.id)])
  );
  const bindings = [
    { code: 'product', sourceTypes: ['product_root', 'product_category'] },
    { code: 'news', sourceTypes: ['news_category'] }
  ];

  for (const binding of bindings) {
    const modelId = modelIdByCode.get(binding.code);
    if (!Number.isInteger(modelId) || modelId <= 0) {
      continue;
    }
    const placeholders = binding.sourceTypes.map(() => '?').join(', ');
    execute(
      `
        UPDATE columns
        SET content_model_id = ?
        WHERE content_model_id IS NULL
          AND model_code = ?
          AND source_type IN (${placeholders})
      `,
      [modelId, binding.code, ...binding.sourceTypes]
    );
  }
}

function migrateColumnsToLeanSchema() {
  const currentColumns = new Set(queryAll('PRAGMA table_info(columns)').map((column) => String(column.name || '')));
  const contentRows = queryOne(
    `
      SELECT COUNT(*) AS value
      FROM columns
      WHERE source_type IN ('product_item', 'news_item')
    `
  )?.value || 0;

  if (
    Number(contentRows) === 0
    && currentColumns.has('code')
    && currentColumns.has('images')
    && currentColumns.has('primary_image')
    && currentColumns.has('is_featured_home')
  ) {
    getDb().exec(`
      DROP INDEX IF EXISTS idx_columns_model_node;
      DROP INDEX IF EXISTS idx_columns_slug;
      DROP INDEX IF EXISTS idx_columns_route_path_unique;

      ALTER TABLE columns RENAME TO columns_legacy_rebuild;

      CREATE TABLE columns (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        model_code TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL DEFAULT 0,
        column_kind TEXT NOT NULL DEFAULT 'category',
        custom_url TEXT,
        route_path TEXT,
        open_in_new_tab INTEGER NOT NULL DEFAULT 0,
        show_in_nav INTEGER NOT NULL DEFAULT 1,
        content_model_id INTEGER,
        slug TEXT,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        legacy_extra TEXT,
        is_system INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (source_type, source_id),
        FOREIGN KEY (parent_id) REFERENCES columns(id) ON DELETE SET NULL
      );

      INSERT INTO columns (
        id,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_model_id,
        slug,
        is_visible,
        sort_order,
        legacy_extra,
        is_system,
        created_at,
        updated_at
      )
      SELECT
        id,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_model_id,
        slug,
        is_visible,
        sort_order,
        CASE
          WHEN trim(coalesce(primary_image, '')) <> '' THEN json_set(
            CASE
              WHEN json_valid(coalesce(legacy_extra, '')) THEN legacy_extra
              ELSE '{}'
            END,
            '$.cover_image',
            primary_image
          )
          ELSE legacy_extra
        END,
        is_system,
        created_at,
        updated_at
      FROM columns_legacy_rebuild
      WHERE source_type NOT IN ('product_item', 'news_item');

      DROP TABLE columns_legacy_rebuild;

      CREATE INDEX idx_columns_parent_sort ON columns(parent_id, sort_order, id);
      CREATE INDEX idx_columns_source ON columns(source_type, source_id);
      CREATE INDEX idx_columns_kind_visible ON columns(column_kind, is_visible, sort_order, id);
      CREATE INDEX idx_columns_slug ON columns(slug);
      CREATE UNIQUE INDEX idx_columns_route_path_unique
      ON columns(route_path)
      WHERE route_path IS NOT NULL;
    `);
  }
}

function rebuildColumnTranslationsIfNeeded() {
  const createSql = queryOne(
    `
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'column_translations'
    `
  )?.sql || '';

  if (!createSql.includes('"columns_legacy_rebuild"') && !createSql.includes('columns_legacy_rebuild')) {
    return;
  }

  getDb().exec(`
    ALTER TABLE column_translations RENAME TO column_translations__rebuild;

    CREATE TABLE column_translations (
      id INTEGER PRIMARY KEY,
      column_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content_html TEXT NOT NULL DEFAULT '',
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (column_id, language_id),
      FOREIGN KEY (column_id) REFERENCES columns(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );

    INSERT INTO column_translations (
      id,
      column_id,
      language_id,
      name,
      summary,
      content_html,
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      publish_status,
      published_at,
      created_at,
      updated_at
    )
    SELECT
      id,
      column_id,
      language_id,
      name,
      coalesce(summary, ''),
      coalesce(content_html, ''),
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      coalesce(publish_status, 'published'),
      published_at,
      created_at,
      updated_at
    FROM column_translations__rebuild;

    DROP TABLE column_translations__rebuild;

    CREATE INDEX idx_column_translations_column_id
    ON column_translations(column_id, language_id);
  `);
}
