import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';
import { ensureTemplatesSchema } from './templates.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';
import { ensureContentModelsSchema, getContentModelById } from './content-models.mjs';
import { resolveRelativePublicPath } from './column-paths.mjs';

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
const COLUMN_SOURCE_TYPES = new Set([
  'product_root',
  'product_category',
  'news_category',
  'corporation_root',
  'corporation_category',
  'contact_page',
  'single_page',
  'custom_link'
]);
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
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      custom_url TEXT,
      route_path TEXT,
      content_model_id INTEGER,
      dir_name TEXT,
      detail_rule TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id)
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
      UNIQUE (column_id, language_id)
    );

    CREATE INDEX IF NOT EXISTS idx_column_translations_column_id
    ON column_translations(column_id, language_id);
  `);

  addColumnIfMissing('columns', 'custom_url', 'TEXT');
  addColumnIfMissing('columns', 'route_path', 'TEXT');
  addColumnIfMissing('columns', 'content_model_id', 'INTEGER');
  addColumnIfMissing('columns', 'dir_name', 'TEXT');
  addColumnIfMissing('columns', 'detail_rule', 'TEXT');
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
    CREATE INDEX IF NOT EXISTS idx_columns_visible_sort ON columns(is_visible, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_dir_name ON columns(dir_name);
    DROP INDEX IF EXISTS idx_columns_route_path_unique;
    CREATE INDEX IF NOT EXISTS idx_columns_route_path
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);

  ensureColumnContentModelBindings();
  migrateColumnVisibilityToSingleField();
  migrateColumnsToLeanSchema();
  migrateColumnsDropOpenInNewTab();
  migrateColumnsReplaceSlugWithDirName();
  migrateColumnPageDataSummaryToTranslations();
  migrateColumnRoutePathConventions();

  schemaEnsured = true;
}

export function listColumns({ languageCode = null, includeTranslations = true } = {}) {
  ensureColumnsSchema();
  const rows = queryAll(
    `
      SELECT
        id,
        parent_id,
        source_type,
        source_id,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
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
    String(item.source_type || '') === sourceType
  ));
}

export function getCategoryRootColumn(model, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const sourceType = ROOT_SOURCE_TYPE_BY_MODEL[model];
  if (!sourceType) {
    return null;
  }
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.source_type || '') === sourceType
  )) || null;
}

export function createManualColumn(input) {
  const payload = normalizeManualColumnMutationInput(input);
  validateColumnResolvedPathConflict(payload.base);
  const now = new Date().toISOString();
  const sourceType = payload.base.source_type || 'single_page';
  const sourceId = getNextSourceId(sourceType);
  const result = execute(
    `
      INSERT INTO columns (
        parent_id,
        source_type,
        source_id,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.base.parent_id,
      sourceType,
      sourceId,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
      now,
      now
    ]
  );

  syncManagedColumnRoutePaths();
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
  validateColumnResolvedPathConflict(payload.base, id);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        source_type = ?,
        custom_url = ?,
        route_path = ?,
        content_model_id = ?,
        dir_name = ?,
        detail_rule = ?,
        is_visible = ?,
        legacy_extra = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.source_type,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.legacy_extra,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  syncManagedColumnRoutePaths();
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
  validateColumnResolvedPathConflict({ ...existingHydrated, ...payload.base, source_type: existing.source_type }, id);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        content_model_id = ?,
        dir_name = ?,
        route_path = ?,
        detail_rule = ?,
        is_visible = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.content_model_id,
      payload.base.dir_name,
      payload.base.route_path,
      payload.base.detail_rule,
      payload.base.is_visible,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  syncManagedColumnRoutePaths();
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
      model_code: inferModelCodeBySourceType(row.source_type),
      column_kind: inferColumnKindBySourceType(row.source_type),
      name: displayName,
      content_html: resolvedContentHtml,
      summary: resolvedSummary,
      keywords: resolvedKeywords || '',
      seo_title: resolvedSeoTitle ?? null,
      seo_keywords: resolvedSeoKeywords ?? null,
      seo_description: resolvedSeoDescription ?? null,
      content_model_id: toNullableInteger(row.content_model_id),
      dir_name: row.dir_name || null,
      detail_rule: row.detail_rule || null,
      publish_status: resolvedPublishStatus,
      published_at: resolvedPublishedAt,
      legacy_extra: row.legacy_extra || null,
      page_data: extractColumnPageData(row.legacy_extra),
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      source_id: toInteger(row.source_id, 0),
      sort_order: toInteger(row.sort_order, 0),
      is_visible: toBooleanInt(row.is_visible, 1)
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
        source_type,
        source_id,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        legacy_extra,
        sort_order,
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
  const currentSourceType = String(existing?.source_type || '').trim().toLowerCase();
  const requestedKind = normalizeColumnKind(input.column_kind ?? inferColumnKindBySourceType(currentSourceType));
  const sourceType = normalizeManualSourceType(input.source_type ?? existing?.source_type, requestedKind);
  const columnKind = inferColumnKindBySourceType(sourceType);
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
  const isVisible = toBooleanInt(input.is_visible ?? existing?.is_visible, 1);
  const seoTitle = toNullableString(input.seo_title ?? existingView.seo_title);
  const seoKeywords = toNullableString(input.seo_keywords ?? existingView.seo_keywords);
  const seoDescription = toNullableString(input.seo_description ?? existingView.seo_description);
  const summary = toNullableString(input.summary ?? existingView.summary) || '';
  const keywords = toNullableString(input.keywords ?? existingView.keywords);
  const contentModelId = normalizeContentModelId(input.content_model_id ?? existing?.content_model_id);
  const detailRule = normalizeColumnDetailRule(input.detail_rule ?? existing?.detail_rule, sourceType);

  if (columnKind === 'category' || CATEGORY_SOURCE_TYPES.has(sourceType)) {
    const routePath = normalizeRoutePath(input.route_path ?? existing?.route_path ?? getManualRoutePathBySourceType(sourceType));
    return {
      name,
      parent_id: parentId || null,
      source_type: sourceType,
      custom_url: toNullableString(input.custom_url ?? existing?.custom_url),
      route_path: routePath,
      content_html: String(input.content_html ?? existingView.content_html ?? ''),
      summary,
      keywords,
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      content_model_id: contentModelId,
      dir_name: normalizeColumnDirName(input.dir_name ?? existing?.dir_name),
      detail_rule: detailRule,
      publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
      published_at: toNullableString(input.published_at ?? existing?.published_at),
      is_visible: isVisible,
      legacy_extra: existing?.legacy_extra ?? null,
      sort_order: sortOrder
    };
  }

  if (columnKind === 'link') {
    const customUrl = normalizeColumnUrl(input.custom_url ?? existing?.custom_url);
    return {
      name,
      parent_id: parentId || null,
      source_type: sourceType,
      custom_url: customUrl,
      route_path: null,
      content_html: '',
      summary,
      keywords,
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      content_model_id: contentModelId,
      dir_name: null,
      detail_rule: null,
      publish_status: 'published',
      published_at: null,
      is_visible: isVisible,
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
    source_type: sourceType,
    custom_url: null,
    route_path: routePath,
    content_html: String(input.content_html ?? existingView.content_html ?? ''),
    summary,
    keywords,
    seo_title: seoTitle,
    seo_keywords: seoKeywords,
    seo_description: seoDescription,
    content_model_id: contentModelId,
    dir_name: normalizeColumnDirName(input.dir_name ?? existing?.dir_name),
    detail_rule: detailRule,
    publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
    published_at: toNullableString(input.published_at ?? existing?.published_at),
    is_visible: isVisible,
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
  const isVisible = toBooleanInt(input?.is_visible ?? existing.is_visible, 1);
  const contentModelId = normalizeContentModelId(input?.content_model_id ?? existing.content_model_id);
  const sourceType = String(existing.source_type || '').trim().toLowerCase();
  const dirName = normalizeColumnDirName(input?.dir_name ?? existing.dir_name);
  const routePath = supportsManagedCategoryRoutePath(sourceType)
    ? normalizeRoutePath(input?.route_path ?? existing.route_path ?? getManualRoutePathBySourceType(sourceType))
    : toNullableString(input?.route_path ?? existing.route_path);
  const detailRule = normalizeColumnDetailRule(input?.detail_rule ?? existing.detail_rule, sourceType);

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
      dir_name: dirName,
      route_path: routePath,
      detail_rule: detailRule,
      sort_order: sortOrder,
      is_visible: isVisible
    },
    translations
  };
}

function supportsManagedCategoryRoutePath(sourceType) {
  return sourceType === 'product_root'
    || sourceType === 'product_category'
    || sourceType === 'news_category'
    || sourceType === 'corporation_root'
    || sourceType === 'corporation_category';
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
  if (!column || !EDITABLE_MANUAL_SOURCE_TYPES.has(String(column.source_type || ''))) {
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
  const normalizedRoutePath = resolveColumnResolvedRoutePath({ route_path: routePath, parent_id: null, source_type: 'single_page' });
  if (RESERVED_SINGLE_PAGE_PATHS.has(normalizedRoutePath.toLowerCase())) {
    throw new Error('该访问路径已被系统保留');
  }

  const normalized = normalizedRoutePath.toLowerCase();
  if (RESERVED_SINGLE_PAGE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    throw new Error('该访问路径与保留栏目路径冲突');
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

function inferColumnKindBySourceType(sourceType) {
  if (CATEGORY_SOURCE_TYPES.has(sourceType) || sourceType === 'product_root' || sourceType === 'corporation_root') {
    return 'category';
  }
  if (sourceType === 'custom_link') {
    return 'link';
  }
  if (sourceType === 'single_page' || sourceType === 'contact_page') {
    return 'single';
  }
  return 'category';
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

  let routePath = normalized.startsWith('/') ? normalized : normalized;
  routePath = routePath.startsWith('/') ? routePath : routePath.replace(/^\/{2,}/g, '/');
  routePath = routePath.replace(/\/{2,}/g, '/');

  if (routePath !== '/' && routePath.endsWith('/')) {
    return routePath;
  }
  if (pathLooksLikeFile(routePath)) {
    return routePath;
  }
  return `${routePath}/`;
}

function normalizeColumnDirName(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  return normalized
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '') || null;
}

function normalizeColumnDetailRule(value, sourceType) {
  const normalizedSourceType = String(sourceType || '').trim().toLowerCase();
  const normalizedValue = migrateLegacyDetailRule(toNullableString(value), normalizedSourceType);

  if (!supportsColumnDetailRule(normalizedSourceType)) {
    return null;
  }

  if (!normalizedValue) {
    return getDefaultColumnDetailRule(normalizedSourceType);
  }

  const allowed = getAllowedDetailRules(normalizedSourceType);
  if (!allowed.has(normalizedValue)) {
    throw new Error('内容页命名规则不受支持');
  }
  return normalizedValue;
}

function supportsColumnDetailRule(sourceType) {
  return sourceType === 'product_root'
    || sourceType === 'product_category'
    || sourceType === 'news_category';
}

function getDefaultColumnDetailRule(sourceType) {
  if (sourceType === 'product_root' || sourceType === 'product_category') {
    return '{id}/index.html';
  }
  if (sourceType === 'news_category') {
    return 'detail/{id}.html';
  }
  return null;
}

function getAllowedDetailRules(sourceType) {
  if (sourceType === 'product_root' || sourceType === 'product_category') {
    return new Set(['{id}/index.html', '{id}.html']);
  }
  if (sourceType === 'news_category') {
    return new Set(['detail/{id}.html', '{id}.html', '{slug}/index.html']);
  }
  return new Set();
}

function migrateLegacyDetailRule(value, sourceType) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return normalized;
  }
  if ((sourceType === 'product_root' || sourceType === 'product_category') && normalized === '{slug}/index.html') {
    return '{id}/index.html';
  }
  if (sourceType === 'news_category' && normalized === '{slug}.html') {
    return '{id}.html';
  }
  return normalized;
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
          AND source_type IN (${placeholders})
      `,
      [modelId, ...binding.sourceTypes]
    );
  }
}

function migrateColumnPageDataSummaryToTranslations() {
  const defaultLanguage = getDefaultLanguage() || listLanguages()[0] || null;
  const languageId = toInteger(defaultLanguage?.id, 0);
  if (languageId <= 0) {
    return;
  }

  execute(
    `
      UPDATE column_translations
      SET
        summary = (
          SELECT json_extract(columns.legacy_extra, '$.page_data.summary')
          FROM columns
          WHERE columns.id = column_translations.column_id
        ),
        updated_at = CURRENT_TIMESTAMP
      WHERE column_translations.language_id = ?
        AND trim(COALESCE(column_translations.summary, '')) = ''
        AND EXISTS (
          SELECT 1
          FROM columns
          WHERE columns.id = column_translations.column_id
            AND json_type(columns.legacy_extra, '$.page_data.summary') = 'text'
            AND trim(COALESCE(json_extract(columns.legacy_extra, '$.page_data.summary'), '')) <> ''
        )
    `,
    [languageId]
  );

  execute(`
    UPDATE columns
    SET
      legacy_extra = CASE
        WHEN json_type(legacy_extra, '$.page_data') = 'object'
          THEN json_remove(legacy_extra, '$.page_data.summary')
        ELSE legacy_extra
      END,
      updated_at = CURRENT_TIMESTAMP
    WHERE json_type(legacy_extra, '$.page_data.summary') IS NOT NULL
  `);
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
      DROP INDEX IF EXISTS idx_columns_dir_name;
      DROP INDEX IF EXISTS idx_columns_route_path_unique;

      ALTER TABLE columns RENAME TO columns_legacy_rebuild;

      CREATE TABLE columns (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER,
        source_type TEXT NOT NULL,
        source_id INTEGER NOT NULL DEFAULT 0,
        custom_url TEXT,
        route_path TEXT,
        content_model_id INTEGER,
        dir_name TEXT,
        detail_rule TEXT,
        is_visible INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        legacy_extra TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (source_type, source_id)
      );

      INSERT INTO columns (
        id,
        parent_id,
        source_type,
        source_id,
        custom_url,
        route_path,
        content_model_id,
        dir_name,
        detail_rule,
        is_visible,
        sort_order,
        legacy_extra,
        created_at,
        updated_at
      )
      SELECT
        id,
        parent_id,
        source_type,
        source_id,
        custom_url,
        route_path,
        content_model_id,
        CASE
          WHEN trim(coalesce(slug, '')) <> '' THEN slug
          ELSE NULL
        END,
        NULL,
        CASE
          WHEN show_in_nav IS NULL THEN coalesce(is_visible, 1)
          ELSE show_in_nav
        END,
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
        created_at,
        updated_at
      FROM columns_legacy_rebuild
      WHERE source_type NOT IN ('product_item', 'news_item');

      DROP TABLE columns_legacy_rebuild;

      CREATE INDEX idx_columns_parent_sort ON columns(parent_id, sort_order, id);
      CREATE INDEX idx_columns_source ON columns(source_type, source_id);
      CREATE INDEX idx_columns_visible_sort ON columns(is_visible, sort_order, id);
      CREATE INDEX idx_columns_dir_name ON columns(dir_name);
      CREATE INDEX idx_columns_route_path
      ON columns(route_path)
      WHERE route_path IS NOT NULL;
    `);
  }
}

function migrateColumnVisibilityToSingleField() {
  const currentColumns = new Set(queryAll('PRAGMA table_info(columns)').map((column) => String(column.name || '')));
  if (!currentColumns.has('show_in_nav')) {
    return;
  }

  execute(`
    UPDATE columns
    SET
      is_visible = CASE
        WHEN show_in_nav IS NULL THEN coalesce(is_visible, 1)
        ELSE show_in_nav
      END,
      updated_at = CURRENT_TIMESTAMP
  `);

  getDb().exec(`
    DROP INDEX IF EXISTS idx_columns_parent_sort;
    DROP INDEX IF EXISTS idx_columns_source;
    DROP INDEX IF EXISTS idx_columns_visible_sort;
    DROP INDEX IF EXISTS idx_columns_dir_name;
    DROP INDEX IF EXISTS idx_columns_route_path_unique;

    ALTER TABLE columns RENAME TO columns_visibility_merge_rebuild;

    CREATE TABLE columns (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      custom_url TEXT,
      route_path TEXT,
      content_model_id INTEGER,
      dir_name TEXT,
      detail_rule TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id)
    );

    INSERT INTO columns (
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      dir_name,
      detail_rule,
      is_visible,
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    )
    SELECT
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      CASE
        WHEN trim(coalesce(dir_name, '')) <> '' THEN dir_name
        WHEN trim(coalesce(slug, '')) <> '' THEN slug
        ELSE NULL
      END,
      NULL,
      coalesce(is_visible, 1),
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    FROM columns_visibility_merge_rebuild;

    DROP TABLE columns_visibility_merge_rebuild;

    CREATE INDEX idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX idx_columns_source ON columns(source_type, source_id);
    CREATE INDEX idx_columns_visible_sort ON columns(is_visible, sort_order, id);
    CREATE INDEX idx_columns_dir_name ON columns(dir_name);
    CREATE INDEX idx_columns_route_path
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);
}

function migrateColumnsDropOpenInNewTab() {
  const currentColumns = new Set(queryAll('PRAGMA table_info(columns)').map((column) => String(column.name || '')));
  if (!currentColumns.has('open_in_new_tab')) {
    return;
  }

  getDb().exec(`
    DROP INDEX IF EXISTS idx_columns_parent_sort;
    DROP INDEX IF EXISTS idx_columns_source;
    DROP INDEX IF EXISTS idx_columns_visible_sort;
    DROP INDEX IF EXISTS idx_columns_dir_name;
    DROP INDEX IF EXISTS idx_columns_route_path_unique;

    ALTER TABLE columns RENAME TO columns_open_in_new_tab_rebuild;

    CREATE TABLE columns (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      custom_url TEXT,
      route_path TEXT,
      content_model_id INTEGER,
      dir_name TEXT,
      detail_rule TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id)
    );

    INSERT INTO columns (
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      dir_name,
      detail_rule,
      is_visible,
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    )
    SELECT
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      CASE
        WHEN trim(coalesce(dir_name, '')) <> '' THEN dir_name
        WHEN trim(coalesce(slug, '')) <> '' THEN slug
        ELSE NULL
      END,
      NULL,
      coalesce(is_visible, 1),
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    FROM columns_open_in_new_tab_rebuild;

    DROP TABLE columns_open_in_new_tab_rebuild;

    CREATE INDEX idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX idx_columns_source ON columns(source_type, source_id);
    CREATE INDEX idx_columns_visible_sort ON columns(is_visible, sort_order, id);
    CREATE INDEX idx_columns_dir_name ON columns(dir_name);
    CREATE INDEX idx_columns_route_path
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);
}

function migrateColumnRoutePathConventions() {
  const rows = queryAll(`
    SELECT id, source_type, source_id, parent_id, custom_url, route_path, dir_name, detail_rule, legacy_extra
    FROM columns
  `);

  for (const row of rows) {
    const sourceType = String(row.source_type || '').trim();
    const currentRoutePath = toNullableString(row.route_path);
    const currentCustomUrl = toNullableString(row.custom_url);
    const currentDirName = normalizeColumnDirName(row.dir_name);
    const currentDetailRule = toNullableString(row.detail_rule);

    let nextRoutePath = currentRoutePath;
    let nextCustomUrl = currentCustomUrl;
    let nextDirName = currentDirName;
    let nextDetailRule = normalizeColumnDetailRule(currentDetailRule, sourceType);

    if (sourceType === 'custom_link') {
      nextRoutePath = null;
      nextDirName = null;
      nextDetailRule = null;
    } else if (sourceType === 'contact_page') {
      nextRoutePath = '/contact.html';
      nextCustomUrl = null;
      nextDirName = null;
      nextDetailRule = null;
    } else if (sourceType === 'product_root') {
      nextRoutePath = '/products/';
      nextCustomUrl = null;
    } else if (sourceType === 'product_category') {
      nextCustomUrl = null;
    } else if (sourceType === 'news_category') {
      nextCustomUrl = null;
      if (toInteger(row.parent_id, 0) === 0) {
        const sectionDir = resolveNewsRouteDirFromColumn(row);
        nextRoutePath = sectionDir ? `/${sectionDir}/` : currentRoutePath;
        nextDirName = sectionDir || null;
      }
    } else if (sourceType === 'corporation_root') {
      nextRoutePath = '/about/';
      nextCustomUrl = null;
      nextDirName = null;
      nextDetailRule = null;
    } else if (sourceType === 'corporation_category') {
      nextRoutePath = `/about/about-${toInteger(row.id, 0)}.html`;
      nextCustomUrl = null;
      nextDetailRule = null;
    } else if (sourceType === 'single_page') {
      nextCustomUrl = null;
      nextDetailRule = null;
    }

    if (
      nextRoutePath !== currentRoutePath
      || nextCustomUrl !== currentCustomUrl
      || nextDirName !== currentDirName
      || nextDetailRule !== currentDetailRule
    ) {
      execute(
        `
          UPDATE columns
          SET
            custom_url = ?,
            route_path = ?,
            dir_name = ?,
            detail_rule = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          nextCustomUrl,
          nextRoutePath,
          nextDirName,
          nextDetailRule,
          toInteger(row.id, 0)
        ]
      );
    }
  }

  syncManagedColumnRoutePaths();
}

function resolveNewsRouteDirFromColumn(row) {
  // 只使用数据库配置的 dir_name，不进行任何推断
  const explicitDirName = String(row?.dir_name || '').trim();
  if (explicitDirName && explicitDirName !== 'null') {
    return explicitDirName;
  }

  // 如果没有配置，返回 null（强制要求手动配置）
  return null;
}

function migrateColumnsReplaceSlugWithDirName() {
  const currentColumns = new Set(queryAll('PRAGMA table_info(columns)').map((column) => String(column.name || '')));
  if (!currentColumns.has('slug')) {
    return;
  }

  getDb().exec(`
    DROP INDEX IF EXISTS idx_columns_parent_sort;
    DROP INDEX IF EXISTS idx_columns_source;
    DROP INDEX IF EXISTS idx_columns_visible_sort;
    DROP INDEX IF EXISTS idx_columns_slug;
    DROP INDEX IF EXISTS idx_columns_dir_name;
    DROP INDEX IF EXISTS idx_columns_route_path_unique;

    ALTER TABLE columns RENAME TO columns_slug_to_dir_name_rebuild;

    CREATE TABLE columns (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      custom_url TEXT,
      route_path TEXT,
      content_model_id INTEGER,
      dir_name TEXT,
      detail_rule TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id)
    );

    INSERT INTO columns (
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      dir_name,
      detail_rule,
      is_visible,
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    )
    SELECT
      id,
      parent_id,
      source_type,
      source_id,
      custom_url,
      route_path,
      content_model_id,
      CASE
        WHEN trim(coalesce(dir_name, '')) <> '' THEN dir_name
        WHEN trim(coalesce(slug, '')) <> '' THEN slug
        ELSE NULL
      END,
      NULL,
      coalesce(is_visible, 1),
      sort_order,
      legacy_extra,
      created_at,
      updated_at
    FROM columns_slug_to_dir_name_rebuild;

    DROP TABLE columns_slug_to_dir_name_rebuild;

    CREATE INDEX idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX idx_columns_source ON columns(source_type, source_id);
    CREATE INDEX idx_columns_visible_sort ON columns(is_visible, sort_order, id);
    CREATE INDEX idx_columns_dir_name ON columns(dir_name);
    CREATE INDEX idx_columns_route_path
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);
}

function validateColumnResolvedPathConflict(base, currentId = null) {
  const sourceType = String(base?.source_type || '').trim().toLowerCase();
  if (sourceType === 'custom_link') {
    return;
  }

  const resolvedRoutePath = resolveColumnResolvedRoutePath(base, currentId);
  if (!resolvedRoutePath) {
    return;
  }

  const rows = queryAll(
    `
      SELECT id, parent_id, source_type, route_path
      FROM columns
      WHERE route_path IS NOT NULL
    `
  );

  for (const row of rows) {
    const rowId = toInteger(row.id, 0);
    if (currentId && rowId === toInteger(currentId, 0)) {
      continue;
    }
    const existingResolvedPath = resolveColumnResolvedRoutePath(row);
    if (existingResolvedPath && existingResolvedPath === resolvedRoutePath) {
      throw new Error('访问路径已存在');
    }
  }
}

function resolveColumnResolvedRoutePath(column, currentId = null) {
  const sourceType = String(column?.source_type || '').trim().toLowerCase();
  const routePath = toNullableString(column?.route_path);
  if (!routePath) {
    return '';
  }

  const parentPublicPath = resolveColumnParentRoutePath(column, currentId);
  const resolved = resolveRelativePublicPath(routePath, parentPublicPath);
  if (!resolved) {
    return '';
  }
  if (resolved !== '/' && !pathLooksLikeFile(resolved) && !resolved.endsWith('/')) {
    return `${resolved}/`;
  }
  return resolved;
}

function resolveColumnParentRoutePath(column, currentId = null) {
  const parentId = toInteger(column?.parent_id, 0);
  if (parentId <= 0) {
    return '/';
  }
  const parent = getColumnByIdRaw(parentId);
  if (!parent) {
    return '/';
  }
  if (currentId && toInteger(parent.id, 0) === toInteger(currentId, 0)) {
    return '/';
  }

  const sourceType = String(parent.source_type || '').trim().toLowerCase();
  if (sourceType === 'product_root') {
    return '/products/';
  }
  if (sourceType === 'corporation_root') {
    return '/about/';
  }

  return resolveColumnResolvedRoutePath(parent, currentId) || '/';
}

function syncManagedColumnRoutePaths() {
  const rows = queryAll(`
    SELECT id, parent_id, source_type, route_path, dir_name, sort_order
    FROM columns
    ORDER BY coalesce(parent_id, 0) ASC, sort_order ASC, id ASC
  `);
  if (!rows.length) {
    return;
  }

  const rowById = new Map(rows.map((row) => [toInteger(row.id, 0), row]));
  const computedPathById = new Map();

  for (const row of rows) {
    const id = toInteger(row.id, 0);
    const nextRoutePath = computeManagedColumnRoutePath(row, rowById, computedPathById);
    if (!nextRoutePath) {
      continue;
    }
    computedPathById.set(id, nextRoutePath);
    if (String(row.route_path || '').trim() !== nextRoutePath) {
      execute(
        `
          UPDATE columns
          SET route_path = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [nextRoutePath, id]
      );
    }
  }
}

function computeManagedColumnRoutePath(row, rowById, computedPathById) {
  const sourceType = String(row?.source_type || '').trim();
  if (sourceType === 'product_root') {
    return '/products/';
  }
  if (sourceType === 'product_category') {
    const segments = buildManagedColumnDirSegments(row, rowById, 'product_root');
    return segments.length > 0 ? `/products/${segments.join('/')}/` : '/products/';
  }
  if (sourceType === 'news_category') {
    const parentId = toInteger(row?.parent_id, 0);
    if (parentId <= 0) {
      return String(row?.route_path || '').trim() || '/news/';
    }
    const parent = rowById.get(parentId);
    const parentRoutePath = parent ? (
      computedPathById.get(parentId)
      || computeManagedColumnRoutePath(parent, rowById, computedPathById)
    ) : '';
    const dirName = normalizeColumnDirName(row?.dir_name);
    if (!dirName || !parentRoutePath) {
      return String(row?.route_path || '').trim();
    }
    return joinManagedRoutePath(parentRoutePath, dirName);
  }
  if (sourceType === 'corporation_root') {
    return '/about/';
  }
  return null;
}

function buildManagedColumnDirSegments(row, rowById, stopSourceType) {
  const segments = [];
  let current = row;
  const visited = new Set();

  while (current) {
    const currentId = toInteger(current.id, 0);
    if (currentId <= 0 || visited.has(currentId)) {
      break;
    }
    visited.add(currentId);

    const dirName = normalizeColumnDirName(current.dir_name);
    if (dirName) {
      segments.unshift(dirName);
    }

    const parentId = toInteger(current.parent_id, 0);
    if (parentId <= 0) {
      break;
    }
    const parent = rowById.get(parentId);
    if (!parent) {
      break;
    }
    if (String(parent.source_type || '').trim() === stopSourceType) {
      break;
    }
    current = parent;
  }

  return segments;
}

function joinManagedRoutePath(parentRoutePath, dirName) {
  const parent = String(parentRoutePath || '').trim().replace(/\/+$/, '');
  const child = String(dirName || '').trim().replace(/^\/+|\/+$/g, '');
  if (!parent) {
    return child ? `/${child}/` : '/';
  }
  if (!child) {
    return `${parent}/`;
  }
  return `${parent}/${child}/`;
}

function parseJsonObject(value) {
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
      UNIQUE (column_id, language_id)
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
