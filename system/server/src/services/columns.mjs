import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';
import { ensureTemplatesSchema } from './templates.mjs';
import { normalizeUploadedRelativePath } from './uploads.mjs';

let schemaEnsured = false;

const EDITABLE_MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page', 'contact_page']);
const MANUAL_SOURCE_TYPES = new Set(['custom_link', 'single_page', 'contact_page']);
const CONTENT_SOURCE_TYPE_BY_MODEL = {
  product: 'product_item',
  news: 'news_item'
};
const CATEGORY_SOURCE_TYPE_BY_MODEL = {
  product: 'product_category',
  news: 'news_category',
  corporation: 'corporation_category'
};
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
const DEFAULT_PRODUCT_IMAGE = '/skin/dfpic.gif';
const DEFAULT_NEWS_IMAGE = '';
const EMPTY_IMAGE_LIST = '[]';
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
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS columns (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      model_code TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      node_type TEXT NOT NULL DEFAULT 'category',
      column_kind TEXT NOT NULL DEFAULT 'category',
      content_type TEXT,
      custom_url TEXT,
      route_path TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 0,
      show_in_nav INTEGER NOT NULL DEFAULT 1,
      content_html TEXT NOT NULL DEFAULT '',
      summary TEXT,
      code TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      primary_image TEXT,
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      slug TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_featured_home INTEGER NOT NULL DEFAULT 0,
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
      summary TEXT,
      content_html TEXT,
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
  addColumnIfMissing('columns', 'content_html', "TEXT NOT NULL DEFAULT ''");
  addColumnIfMissing('columns', 'summary', 'TEXT');
  addColumnIfMissing('columns', 'code', 'TEXT');
  addColumnIfMissing('columns', 'images', `TEXT NOT NULL DEFAULT '${EMPTY_IMAGE_LIST}'`);
  addColumnIfMissing('columns', 'primary_image', 'TEXT');
  addColumnIfMissing('columns', 'keywords', 'TEXT');
  addColumnIfMissing('columns', 'seo_title', 'TEXT');
  addColumnIfMissing('columns', 'seo_keywords', 'TEXT');
  addColumnIfMissing('columns', 'seo_description', 'TEXT');
  addColumnIfMissing('columns', 'slug', 'TEXT');
  addColumnIfMissing('columns', 'legacy_extra', 'TEXT');
  addColumnIfMissing('columns', 'node_type', "TEXT NOT NULL DEFAULT 'category'");
  addColumnIfMissing('columns', 'content_type', 'TEXT');
  addColumnIfMissing('columns', 'publish_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing('columns', 'published_at', 'TEXT');
  addColumnIfMissing('columns', 'is_visible', 'INTEGER NOT NULL DEFAULT 1');
  addColumnIfMissing('columns', 'is_featured_home', 'INTEGER NOT NULL DEFAULT 0');

  addColumnIfMissing('column_translations', 'summary', 'TEXT');
  addColumnIfMissing('column_translations', 'keywords', 'TEXT');
  addColumnIfMissing('column_translations', 'publish_status', "TEXT NOT NULL DEFAULT 'published'");
  addColumnIfMissing('column_translations', 'published_at', 'TEXT');

  getDb().exec(`
    CREATE INDEX IF NOT EXISTS idx_columns_parent_sort ON columns(parent_id, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_source ON columns(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_columns_model_node ON columns(model_code, node_type, is_visible, sort_order, id);
    CREATE INDEX IF NOT EXISTS idx_columns_slug ON columns(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_columns_route_path_unique
    ON columns(route_path)
    WHERE route_path IS NOT NULL;
  `);

  migrateLegacyColumnsSchema();
  migrateLegacyContentIntoColumns();
  ensureDefaultColumnTranslations();
  migrateColumnsDropLegacyName();

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
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
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

export function getColumnBySource(sourceType, sourceId, { languageCode = null, includeTranslations = true } = {}) {
  ensureColumnsSchema();
  const row = queryOne(
    `
      SELECT
        id,
        parent_id,
        model_code,
        source_type,
        source_id,
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
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
    && String(item.node_type || '') === 'category'
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

export function listContentColumns(model, { languageCode = null, visibleOnly = false } = {}) {
  ensureColumnsSchema();
  const sourceType = CONTENT_SOURCE_TYPE_BY_MODEL[model];
  if (!sourceType) {
    return [];
  }
  return listColumns({ languageCode, includeTranslations: true }).filter((item) => (
    String(item.model_code || '') === model
    && String(item.source_type || '') === sourceType
    && String(item.node_type || '') === 'content'
    && (!visibleOnly || Number(item.is_visible || 0) === 1)
  ));
}

export function createManualColumn(input) {
  const payload = normalizeManualColumnMutationInput(input);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);
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
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    [
      payload.base.parent_id,
      payload.base.model_code,
      sourceType,
      sourceId,
      payload.base.node_type,
      payload.base.column_kind,
      payload.base.content_type,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      payload.base.show_in_nav,
      defaultTranslation.content_html,
      defaultTranslation.summary,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      defaultTranslation.keywords,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      defaultTranslation.publish_status,
      defaultTranslation.published_at,
      payload.base.is_visible,
      payload.base.is_featured_home,
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
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        model_code = ?,
        source_type = ?,
        node_type = ?,
        column_kind = ?,
        content_type = ?,
        custom_url = ?,
        route_path = ?,
        open_in_new_tab = ?,
        show_in_nav = ?,
        content_html = ?,
        summary = ?,
        code = ?,
        images = ?,
        primary_image = ?,
        keywords = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        slug = ?,
        publish_status = ?,
        published_at = ?,
        is_visible = ?,
        is_featured_home = ?,
        legacy_extra = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.model_code,
      payload.base.source_type,
      payload.base.node_type,
      payload.base.column_kind,
      payload.base.content_type,
      payload.base.custom_url,
      payload.base.route_path,
      payload.base.open_in_new_tab,
      payload.base.show_in_nav,
      defaultTranslation.content_html,
      defaultTranslation.summary,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      defaultTranslation.keywords,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      defaultTranslation.publish_status,
      defaultTranslation.published_at,
      payload.base.is_visible,
      payload.base.is_featured_home,
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
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        show_in_nav = ?,
        content_html = ?,
        summary = ?,
        keywords = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        publish_status = ?,
        published_at = ?,
        is_visible = ?,
        is_featured_home = ?,
        sort_order = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      payload.base.show_in_nav,
      defaultTranslation.content_html,
      defaultTranslation.summary,
      defaultTranslation.keywords,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      defaultTranslation.publish_status,
      defaultTranslation.published_at,
      payload.base.is_visible,
      payload.base.is_featured_home,
      payload.base.sort_order,
      new Date().toISOString(),
      id
    ]
  );

  saveColumnTranslations(id, payload.translations);
  return getColumnById(id, { includeTranslations: true });
}

export function createContentColumn(model, input) {
  ensureColumnsSchema();
  const payload = normalizeContentMutationInput(model, input);
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();
  const sourceType = CONTENT_SOURCE_TYPE_BY_MODEL[model];
  const sourceId = getNextSourceId(sourceType);
  const result = execute(
    `
      INSERT INTO columns (
        parent_id,
        model_code,
        source_type,
        source_id,
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, 'content', 'content', ?, NULL, NULL, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
    `,
    [
      payload.base.parent_id,
      model,
      sourceType,
      sourceId,
      model,
      defaultTranslation.content_html,
      defaultTranslation.summary,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      defaultTranslation.keywords,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      defaultTranslation.publish_status,
      defaultTranslation.published_at,
      payload.base.is_visible,
      payload.base.is_featured_home,
      payload.base.legacy_extra,
      payload.base.sort_order,
      payload.base.created_at || now,
      now
    ]
  );

  saveColumnTranslations(result.lastInsertRowid, payload.translations, now);
  return getColumnById(result.lastInsertRowid, { includeTranslations: true });
}

export function updateContentColumn(model, id, input) {
  ensureColumnsSchema();
  const existing = getContentColumnById(model, id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!existing) {
    return null;
  }

  const payload = normalizeContentMutationInput(model, input, { existingColumn: existing });
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultColumnTranslation(payload.translations, defaultLanguage?.code);
  const now = new Date().toISOString();
  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        content_html = ?,
        summary = ?,
        code = ?,
        images = ?,
        primary_image = ?,
        keywords = ?,
        seo_title = ?,
        seo_keywords = ?,
        seo_description = ?,
        slug = ?,
        publish_status = ?,
        published_at = ?,
        is_visible = ?,
        is_featured_home = ?,
        legacy_extra = ?,
        sort_order = ?,
        created_at = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      payload.base.parent_id,
      defaultTranslation.content_html,
      defaultTranslation.summary,
      payload.base.code,
      payload.base.images,
      payload.base.primary_image,
      defaultTranslation.keywords,
      defaultTranslation.seo_title,
      defaultTranslation.seo_keywords,
      defaultTranslation.seo_description,
      payload.base.slug,
      defaultTranslation.publish_status,
      defaultTranslation.published_at,
      payload.base.is_visible,
      payload.base.is_featured_home,
      payload.base.legacy_extra,
      payload.base.sort_order,
      payload.base.created_at || existing.created_at || now,
      now,
      id
    ]
  );

  saveColumnTranslations(id, payload.translations, now);
  return getContentColumnById(model, id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
}

export function deleteContentColumn(model, id) {
  const existing = getContentColumnById(model, id);
  if (!existing) {
    return null;
  }
  execute('DELETE FROM columns WHERE id = ?', [id]);
  return existing;
}

export function listContentColumnsPaged(model, {
  page = 1,
  limit = 20,
  columnId = null,
  includeDescendants = false,
  visibleOnly = false,
  featured = false,
  languageCode = null
} = {}) {
  ensureColumnsSchema();
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const safeColumnId = toInteger(columnId, 0);
  const hasColumnFilter = safeColumnId > 0;
  const offset = (safePage - 1) * safeLimit;
  const sourceType = CONTENT_SOURCE_TYPE_BY_MODEL[model];
  const columnNameJoin = buildColumnNameJoin('c', selectedLanguage.id, selectedLanguage.default_id);
  const parentNameJoin = buildColumnNameJoin('p', selectedLanguage.id, selectedLanguage.default_id);
  const baseParams = [model, sourceType];
  const treeSql = hasColumnFilter && includeDescendants
    ? `
      WITH RECURSIVE column_tree(id) AS (
        SELECT id FROM columns WHERE id = ?
        UNION ALL
        SELECT child.id
        FROM columns child
        INNER JOIN column_tree parent ON child.parent_id = parent.id
      )
    `
    : '';
  const whereParts = [
    'c.model_code = ?',
    'c.source_type = ?',
    "c.node_type = 'content'"
  ];
  const params = hasColumnFilter && includeDescendants ? [safeColumnId, ...baseParams] : [...baseParams];
  if (visibleOnly) {
    whereParts.push('c.is_visible = 1');
  }
  if (featured) {
    whereParts.push('c.is_featured_home = 1');
  }
  if (hasColumnFilter) {
    whereParts.push(includeDescendants ? 'c.parent_id IN (SELECT id FROM column_tree)' : 'c.parent_id = ?');
    if (!includeDescendants) {
      params.push(safeColumnId);
    }
  }
  const where = `WHERE ${whereParts.join(' AND ')}`;

  const rows = queryAll(
    `
      ${treeSql}
      SELECT
        c.id,
        ${columnNameJoin.nameExpr} AS name,
        c.parent_id,
        c.model_code,
        c.source_type,
        c.source_id,
        c.node_type,
        c.column_kind,
        c.content_type,
        c.custom_url,
        c.route_path,
        c.open_in_new_tab,
        c.show_in_nav,
        c.content_html,
        c.summary,
        c.code,
        c.images,
        c.primary_image,
        c.keywords,
        c.seo_title,
        c.seo_keywords,
        c.seo_description,
        c.slug,
        c.publish_status,
        c.published_at,
        c.is_visible,
        c.is_featured_home,
        c.legacy_extra,
        c.sort_order,
        c.is_system,
        c.created_at,
        c.updated_at,
        ${parentNameJoin.nameExpr} AS category_name
      FROM columns c
      LEFT JOIN columns p ON p.id = c.parent_id
      ${columnNameJoin.joinSql}
      ${parentNameJoin.joinSql}
      ${where}
      ORDER BY c.sort_order ASC, c.id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset]
  );

  const total = queryOne(
    `
      ${treeSql}
      SELECT COUNT(*) AS count
      FROM columns c
      ${where}
    `,
    params
  )?.count || 0;

  return {
    items: hydrateColumns(rows, {
      languageCode: selectedLanguage.code,
      includeTranslations: false,
      includeTranslationStatuses: true
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getContentColumnById(model, id, {
  languageCode = null,
  includeTranslations = false,
  includeTranslationStatuses = false
} = {}) {
  ensureColumnsSchema();
  const sourceType = CONTENT_SOURCE_TYPE_BY_MODEL[model];
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const columnNameJoin = buildColumnNameJoin('c', selectedLanguage.id, selectedLanguage.default_id);
  const row = queryOne(
    `
      SELECT
        id,
        ${columnNameJoin.nameExpr} AS name,
        parent_id,
        model_code,
        source_type,
        source_id,
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns c
      ${columnNameJoin.joinSql}
      WHERE id = ?
        AND c.model_code = ?
        AND c.source_type = ?
        AND c.node_type = 'content'
    `,
    [id, model, sourceType]
  );
  if (!row) {
    return null;
  }
  return hydrateColumns([row], {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  })[0] || null;
}

export function searchContentColumns(model, rawQuery, {
  page = 1,
  limit = 20,
  visibleOnly = true,
  languageCode = null
} = {}) {
  ensureColumnsSchema();
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const normalizedQuery = String(rawQuery ?? '').trim();
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const sourceType = CONTENT_SOURCE_TYPE_BY_MODEL[model];
  const columnNameJoin = buildColumnNameJoin('c', selectedLanguage.id, selectedLanguage.default_id);
  const params = [model, sourceType];
  const whereParts = [
    'c.model_code = ?',
    'c.source_type = ?',
    "c.node_type = 'content'"
  ];
  if (visibleOnly) {
    whereParts.push('is_visible = 1');
  }

  if (normalizedQuery !== '') {
    const likeQuery = `%${normalizedQuery}%`;
    whereParts.push(`(${columnNameJoin.nameExpr} LIKE ? OR coalesce(c.summary, '') LIKE ? OR coalesce(c.keywords, '') LIKE ?)`);
    params.push(likeQuery, likeQuery, likeQuery);
  }
  const where = `WHERE ${whereParts.join(' AND ')}`;
  const rows = queryAll(
    `
      SELECT
        id,
        ${columnNameJoin.nameExpr} AS name,
        parent_id,
        model_code,
        source_type,
        source_id,
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
        legacy_extra,
        sort_order,
        is_system,
        created_at,
        updated_at
      FROM columns c
      ${columnNameJoin.joinSql}
      ${where}
      ORDER BY sort_order ASC, id DESC
      LIMIT ?
      OFFSET ?
    `,
    [...params, safeLimit, offset]
  );
  const total = queryOne(
    `
      SELECT COUNT(*) AS count
      FROM columns c
      ${columnNameJoin.joinSql}
      ${where}
    `,
    params
  )?.count || 0;
  return {
    items: hydrateColumns(rows, {
      languageCode: selectedLanguage.code,
      includeTranslations: false,
      includeTranslationStatuses: false
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
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
    const resolvedSummary = fallbackTranslation?.summary ?? row.summary ?? '';
    const resolvedContentHtml = fallbackTranslation?.content_html ?? row.content_html ?? '';
    const resolvedKeywords = fallbackTranslation?.keywords ?? row.keywords ?? '';
    const resolvedSeoTitle = fallbackTranslation?.seo_title ?? row.seo_title;
    const resolvedSeoKeywords = fallbackTranslation?.seo_keywords ?? row.seo_keywords;
    const resolvedSeoDescription = fallbackTranslation?.seo_description ?? row.seo_description;
    const resolvedPublishStatus = fallbackTranslation?.publish_status ?? row.publish_status ?? 'published';
    const resolvedPublishedAt = fallbackTranslation?.published_at ?? row.published_at ?? null;
    const images = normalizeImageList(row.images);
    const primaryImage = String(row.primary_image || '').trim() || images[0] || '';
    const nodeType = String(row.node_type || row.column_kind || 'category');

    const base = {
      ...row,
      name: displayName,
      content_html: resolvedContentHtml,
      summary: resolvedSummary,
      code: row.code || '',
      images,
      primary_image: primaryImage,
      keywords: resolvedKeywords || '',
      seo_title: resolvedSeoTitle ?? null,
      seo_keywords: resolvedSeoKeywords ?? null,
      seo_description: resolvedSeoDescription ?? null,
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
      is_featured_home: toBooleanInt(row.is_featured_home, 0),
      open_in_new_tab: toBooleanInt(row.open_in_new_tab, 0),
      show_in_nav: toBooleanInt(row.show_in_nav, 1),
      node_type: nodeType
    };

    const contentMapped = mapContentLikeShape(base);
    return {
      ...contentMapped,
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

function mapContentLikeShape(column) {
  const model = String(column.model_code || '');
  if (model === 'product' && String(column.node_type || '') === 'content') {
    return {
      ...column,
      column_id: toNullableInteger(column.parent_id),
      category_name: column.category_name || undefined
    };
  }
  if (model === 'news' && String(column.node_type || '') === 'content') {
    return {
      ...column,
      title: column.name || '',
      picture: column.primary_image || '',
      image: column.primary_image || '',
      column_id: toNullableInteger(column.parent_id),
      category_name: column.category_name || undefined,
      created_at: column.created_at,
      is_featured: toBooleanInt(column.is_featured_home, 0)
    };
  }
  return column;
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
        String(translation?.name || '').trim(),
        String(translation?.summary || ''),
        String(translation?.content_html || ''),
        toNullableString(translation?.keywords),
        toNullableString(translation?.seo_title),
        toNullableString(translation?.seo_keywords),
        toNullableString(translation?.seo_description),
        normalizePublishStatus(translation?.publish_status),
        toNullableString(translation?.published_at),
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

  if (!hasColumn('columns', 'name')) {
    return;
  }

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
      )
      SELECT
        c.id,
        ?,
        coalesce(c.name, ''),
        coalesce(c.summary, ''),
        c.content_html,
        c.keywords,
        c.seo_title,
        c.seo_keywords,
        c.seo_description,
        c.publish_status,
        c.published_at,
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
        node_type,
        column_kind,
        content_type,
        custom_url,
        route_path,
        open_in_new_tab,
        show_in_nav,
        content_html,
        summary,
        code,
        images,
        primary_image,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        slug,
        publish_status,
        published_at,
        is_visible,
        is_featured_home,
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
  const sourceType = normalizeManualSourceType(input.source_type ?? existing?.source_type, columnKind);
  const name = String(input.name ?? options.existingColumn?.name ?? existing?.name ?? '').trim();
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
  const summary = toNullableString(input.summary ?? existing?.summary) || '';
  const keywords = toNullableString(input.keywords ?? existing?.keywords);

  if (columnKind === 'link') {
    const customUrl = normalizeColumnUrl(input.custom_url ?? existing?.custom_url);
    return {
      name,
      parent_id: parentId || null,
      model_code: 'link',
      source_type: sourceType,
      node_type: 'link',
      column_kind: columnKind,
      content_type: 'link',
      custom_url: customUrl,
      route_path: null,
      open_in_new_tab: toBooleanInt(input.open_in_new_tab ?? existing?.open_in_new_tab, 0),
      show_in_nav: showInNav,
      content_html: '',
      summary,
      code: '',
      images: EMPTY_IMAGE_LIST,
      primary_image: '',
      keywords,
      seo_title: seoTitle,
      seo_keywords: seoKeywords,
      seo_description: seoDescription,
      slug: null,
      publish_status: 'published',
      published_at: null,
      is_visible: 1,
      is_featured_home: 0,
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
    node_type: 'page',
    column_kind: columnKind,
    content_type: 'page',
    custom_url: null,
    route_path: routePath,
    open_in_new_tab: 0,
    show_in_nav: showInNav,
    content_html: String(input.content_html ?? existing?.content_html ?? ''),
    summary,
    code: '',
    images: EMPTY_IMAGE_LIST,
    primary_image: '',
    keywords,
    seo_title: seoTitle,
    seo_keywords: seoKeywords,
    seo_description: seoDescription,
    slug: toNullableString(input.slug ?? existing?.slug),
    publish_status: normalizePublishStatus(input.publish_status ?? existing?.publish_status),
    published_at: toNullableString(input.published_at ?? existing?.published_at),
    is_visible: toBooleanInt(input.is_visible ?? existing?.is_visible, 1),
    is_featured_home: 0,
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
  const isFeaturedHome = toBooleanInt(input?.is_featured_home ?? existing.is_featured_home, 0);

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
      publish_status: normalizePublishStatus(existing.publish_status),
      published_at: toNullableString(existing.published_at)
    }
  });

  return {
    base: {
      parent_id: parentId || null,
      sort_order: sortOrder,
      show_in_nav: showInNav,
      is_visible: isVisible,
      is_featured_home: isFeaturedHome
    },
    translations
  };
}

function normalizeContentMutationInput(model, input, { existingColumn = null } = {}) {
  const existing = existingColumn || {};
  const baseInput = input?.base || input || {};
  const parentId = toInteger(baseInput.column_id ?? baseInput.parent_id ?? existing.column_id ?? existing.parent_id, 0);
  if (parentId <= 0) {
    throw new Error('请选择所属栏目');
  }
  const parent = getColumnByIdRaw(parentId);
  if (!parent) {
    throw new Error('所属栏目不存在');
  }
  const sourceType = CATEGORY_SOURCE_TYPE_BY_MODEL[model];
  if (String(parent.model_code || '') !== model || String(parent.source_type || '') !== sourceType) {
    throw new Error('所属栏目类型不正确');
  }

  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const images = model === 'product'
    ? normalizeImageList(baseInput.images ?? existing.images)
    : [];
  const picture = model === 'news'
    ? normalizeSingleImage(baseInput.picture ?? baseInput.image ?? existing.picture ?? existing.image)
    : '';
  const primaryImage = model === 'product'
    ? (normalizeSingleImage(baseInput.primary_image ?? existing.primary_image) || images[0] || DEFAULT_PRODUCT_IMAGE)
    : picture;
  const fallbackBase = {
    name: model === 'news' ? String(existing.title || existing.name || '') : String(existing.name || ''),
    summary: String(existing.summary || ''),
    content_html: String(existing.content_html || ''),
    keywords: String(existing.keywords || ''),
    seo_title: toNullableString(existing.seo_title),
    seo_keywords: toNullableString(existing.seo_keywords),
    seo_description: toNullableString(existing.seo_description),
    publish_status: normalizePublishStatus(existing.publish_status),
    published_at: toNullableString(existing.published_at)
  };
  const translations = normalizeColumnTranslations(input?.translations || {}, {
    defaultLanguageCode,
    existingTranslations: existing.translations || {},
    fallbackBase,
    nameField: model === 'news' ? 'title' : 'name'
  });

  return {
    base: {
      parent_id: parentId,
      code: toNullableString(baseInput.code ?? existing.code) || '',
      images: model === 'product' ? JSON.stringify(images) : EMPTY_IMAGE_LIST,
      primary_image: model === 'product' ? primaryImage : picture,
      slug: toNullableString(baseInput.slug ?? existing.slug),
      is_visible: toBooleanInt(baseInput.is_visible ?? existing.is_visible, model === 'product' ? 1 : 1),
      is_featured_home: toBooleanInt(baseInput.is_featured_home ?? existing.is_featured_home ?? existing.is_featured, 0),
      sort_order: toInteger(baseInput.sort_order ?? existing.sort_order, 0),
      legacy_extra: baseInput.legacy_extra ?? existing.legacy_extra ?? null,
      created_at: toNullableString(baseInput.created_at ?? existing.created_at)
    },
    translations
  };
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
  if (normalized === 'link' || normalized === 'single') {
    return normalized;
  }
  throw new Error('栏目类型不正确');
}

function normalizeManualSourceType(value, columnKind) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return columnKind === 'link' ? 'custom_link' : 'single_page';
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

function migrateLegacyColumnsSchema() {
  // Historical columns table may have been created before some defaults existed.
  execute(`
    UPDATE columns
    SET
      show_in_nav = coalesce(show_in_nav, 1),
      node_type = CASE
        WHEN source_type = 'custom_link' THEN 'link'
        WHEN column_kind = 'single' THEN 'page'
        ELSE coalesce(node_type, 'category')
      END,
      content_type = CASE
        WHEN source_type IN ('custom_link') THEN 'link'
        WHEN model_code = 'page' THEN 'page'
        ELSE coalesce(content_type, model_code)
      END,
      images = CASE
        WHEN images IS NULL OR trim(images) = '' THEN '${EMPTY_IMAGE_LIST}'
        ELSE images
      END,
      primary_image = coalesce(primary_image, ''),
      summary = coalesce(summary, ''),
      code = coalesce(code, ''),
      content_html = coalesce(content_html, ''),
      publish_status = coalesce(NULLIF(trim(publish_status), ''), 'published'),
      is_visible = coalesce(is_visible, 1),
      is_featured_home = coalesce(is_featured_home, 0)
  `);
}

function migrateColumnsDropLegacyName() {
  if (!hasColumn('columns', 'name')) {
    return;
  }

  getDb().exec(`
    BEGIN;
    CREATE TABLE IF NOT EXISTS columns__new (
      id INTEGER PRIMARY KEY,
      parent_id INTEGER,
      model_code TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_id INTEGER NOT NULL DEFAULT 0,
      node_type TEXT NOT NULL DEFAULT 'category',
      column_kind TEXT NOT NULL DEFAULT 'category',
      content_type TEXT,
      custom_url TEXT,
      route_path TEXT,
      open_in_new_tab INTEGER NOT NULL DEFAULT 0,
      show_in_nav INTEGER NOT NULL DEFAULT 1,
      content_html TEXT NOT NULL DEFAULT '',
      summary TEXT,
      code TEXT,
      images TEXT NOT NULL DEFAULT '[]',
      primary_image TEXT,
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      slug TEXT,
      publish_status TEXT NOT NULL DEFAULT 'published',
      published_at TEXT,
      is_visible INTEGER NOT NULL DEFAULT 1,
      is_featured_home INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      legacy_extra TEXT,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (source_type, source_id),
      FOREIGN KEY (parent_id) REFERENCES columns(id) ON DELETE SET NULL
    );

    INSERT INTO columns__new (
      id,
      parent_id,
      model_code,
      source_type,
      source_id,
      node_type,
      column_kind,
      content_type,
      custom_url,
      route_path,
      open_in_new_tab,
      show_in_nav,
      content_html,
      summary,
      code,
      images,
      primary_image,
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      slug,
      publish_status,
      published_at,
      is_visible,
      is_featured_home,
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
      node_type,
      column_kind,
      content_type,
      custom_url,
      route_path,
      open_in_new_tab,
      show_in_nav,
      content_html,
      summary,
      code,
      images,
      primary_image,
      keywords,
      seo_title,
      seo_keywords,
      seo_description,
      slug,
      publish_status,
      published_at,
      is_visible,
      is_featured_home,
      sort_order,
      legacy_extra,
      is_system,
      created_at,
      updated_at
    FROM columns;

    DROP TABLE columns;
    ALTER TABLE columns__new RENAME TO columns;
    COMMIT;
  `);
}

function migrateLegacyContentIntoColumns() {
  ensureLegacyColumnRoots();
  migrateLegacyProductContent();
  migrateLegacyNewsContent();
  migrateLegacyCorporationContent();
  dropLegacyContentTables();
}

function ensureLegacyColumnRoots() {
  const productRoot = queryOne(
    `SELECT id FROM columns WHERE model_code = 'product' AND source_type = 'product_root' LIMIT 1`
  );
  if (!productRoot) {
    execute(
      `
        INSERT INTO columns (
          parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
          show_in_nav, content_html, summary, code, images, primary_image, publish_status,
          is_visible, is_featured_home, sort_order, is_system, created_at, updated_at
        ) VALUES (NULL, 'product', 'product_root', 0, 'category', 'category', 'product', 1, '', '', '', ?, '', 'published', 1, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [EMPTY_IMAGE_LIST]
    );
    const rootId = queryOne(`SELECT id FROM columns WHERE model_code = 'product' AND source_type = 'product_root' LIMIT 1`)?.id;
    if (rootId && getDefaultLanguage()?.id) {
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, '', '', NULL, NULL, NULL, NULL, 'published', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            updated_at = excluded.updated_at
        `,
        [rootId, getDefaultLanguage().id, '产品']
      );
    }
  }
  const corporationRoot = queryOne(
    `SELECT id FROM columns WHERE model_code = 'corporation' AND source_type = 'corporation_root' LIMIT 1`
  );
  if (!corporationRoot) {
    execute(
      `
        INSERT INTO columns (
          parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
          show_in_nav, content_html, summary, code, images, primary_image, publish_status,
          is_visible, is_featured_home, sort_order, is_system, created_at, updated_at
        ) VALUES (NULL, 'corporation', 'corporation_root', 0, 'category', 'category', 'corporation', 1, '', '', '', ?, '', 'published', 1, 0, 0, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [EMPTY_IMAGE_LIST]
    );
    const rootId = queryOne(`SELECT id FROM columns WHERE model_code = 'corporation' AND source_type = 'corporation_root' LIMIT 1`)?.id;
    if (rootId && getDefaultLanguage()?.id) {
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, '', '', NULL, NULL, NULL, NULL, 'published', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            updated_at = excluded.updated_at
        `,
        [rootId, getDefaultLanguage().id, '公司信息']
      );
    }
  }
}

function migrateLegacyProductContent() {
  const hasProductsTable = hasTable('products');
  if (!hasProductsTable) {
    return;
  }
  const hasProductTranslations = hasTable('product_translations');
  const defaultLanguage = queryOne(
    `
      SELECT id, code
      FROM languages
      WHERE is_default = 1
      LIMIT 1
    `
  );
  const languageRows = queryAll('SELECT id, code FROM languages ORDER BY id ASC');
  const languageIdByCode = new Map(languageRows.map((language) => [language.code, language.id]));
  const rows = queryAll(
    `
      SELECT
        p.id,
        p.column_id,
        p.name,
        p.code,
        p.summary,
        p.content_html,
        p.images,
        p.small_image,
        p.keywords,
        p.is_featured_home,
        p.is_visible,
        p.sort_order,
        p.slug,
        p.updated_at,
        p.legacy_extra
      FROM products p
      ORDER BY p.id ASC
    `
  );
  for (const row of rows) {
    const existing = queryOne(`SELECT id FROM columns WHERE source_type = 'product_item' AND source_id = ?`, [row.id]);
    const images = normalizeImageList(row.images, row.small_image);
    const primaryImage = images[0] || normalizeSingleImage(row.small_image) || DEFAULT_PRODUCT_IMAGE;
    const createdAt = toNullableString(row.updated_at) || new Date().toISOString();
    const payload = [
      toNullableInteger(row.column_id),
      row.id,
      row.summary || '',
      row.code || '',
      JSON.stringify(images),
      primaryImage,
      row.keywords || '',
      row.slug || null,
      toBooleanInt(row.is_visible, 1),
      toBooleanInt(row.is_featured_home, 0),
      toInteger(row.sort_order, 0),
      row.legacy_extra || null,
      createdAt,
      createdAt
    ];
    if (existing) {
      execute(
        `
          UPDATE columns
          SET
            parent_id = ?,
            summary = ?,
            code = ?,
            images = ?,
            primary_image = ?,
            keywords = ?,
            slug = ?,
            is_visible = ?,
            is_featured_home = ?,
            sort_order = ?,
            legacy_extra = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [
          toNullableInteger(row.column_id),
          row.summary || '',
          row.code || '',
          JSON.stringify(images),
          primaryImage,
          row.keywords || '',
          row.slug || null,
          toBooleanInt(row.is_visible, 1),
          toBooleanInt(row.is_featured_home, 0),
          toInteger(row.sort_order, 0),
          row.legacy_extra || null,
          createdAt,
          existing.id
        ]
      );
    } else {
      execute(
        `
          INSERT INTO columns (
            parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
            show_in_nav, content_html, summary, code, images, primary_image, keywords,
            seo_title, seo_keywords, seo_description, slug, publish_status, published_at,
            is_visible, is_featured_home, sort_order, legacy_extra, is_system, created_at, updated_at
          ) VALUES (?, 'product', 'product_item', ?, 'content', 'content', 'product', 0, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, 'published', NULL, ?, ?, ?, ?, 0, ?, ?)
        `,
        [
          toNullableInteger(row.column_id),
          row.id,
          row.content_html || '',
          row.summary || '',
          row.code || '',
          JSON.stringify(images),
          primaryImage,
          row.keywords || '',
          row.slug || null,
          toBooleanInt(row.is_visible, 1),
          toBooleanInt(row.is_featured_home, 0),
          toInteger(row.sort_order, 0),
          row.legacy_extra || null,
          createdAt,
          createdAt
        ]
      );
    }

    const contentColumn = queryOne(`SELECT id FROM columns WHERE source_type = 'product_item' AND source_id = ?`, [row.id]);
    if (!contentColumn) {
      continue;
    }
    if (defaultLanguage?.id) {
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'published', NULL, ?, ?)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            keywords = excluded.keywords,
            updated_at = excluded.updated_at
        `,
        [
          contentColumn.id,
          defaultLanguage.id,
          row.name || '',
          row.summary || '',
          row.content_html || '',
          row.keywords || '',
          createdAt,
          createdAt
        ]
      );
    }
  }

  if (hasProductTranslations) {
    const translations = queryAll(
      `
        SELECT
          pt.product_id,
          l.code AS language_code,
          pt.name,
          pt.summary,
          pt.content_html,
          pt.keywords,
          pt.seo_title,
          pt.seo_keywords,
          pt.seo_description,
          pt.publish_status,
          pt.published_at,
          pt.updated_at
        FROM product_translations pt
        INNER JOIN languages l ON l.id = pt.language_id
        ORDER BY pt.product_id ASC, l.id ASC
      `
    );
    for (const row of translations) {
      const column = queryOne(`SELECT id FROM columns WHERE source_type = 'product_item' AND source_id = ?`, [row.product_id]);
      const languageId = languageIdByCode.get(row.language_code);
      if (!column || !languageId) {
        continue;
      }
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
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
          column.id,
          languageId,
          row.name || '',
          row.summary || '',
          row.content_html || '',
          row.keywords || '',
          row.seo_title || null,
          row.seo_keywords || null,
          row.seo_description || null,
          normalizePublishStatus(row.publish_status),
          toNullableString(row.published_at),
          row.updated_at || new Date().toISOString(),
          row.updated_at || new Date().toISOString()
        ]
      );
    }
  }
}

function migrateLegacyNewsContent() {
  if (!hasTable('news')) {
    return;
  }
  const hasNewsTranslations = hasTable('news_translations');
  const defaultLanguage = queryOne(
    `
      SELECT id, code
      FROM languages
      WHERE is_default = 1
      LIMIT 1
    `
  );
  const languageRows = queryAll('SELECT id, code FROM languages ORDER BY id ASC');
  const languageIdByCode = new Map(languageRows.map((language) => [language.code, language.id]));
  const rows = queryAll(
    `
      SELECT
        n.id,
        n.column_id,
        n.title,
        n.summary,
        n.content_html,
        n.picture,
        n.keywords,
        n.is_featured_home,
        n.created_at,
        n.legacy_extra
      FROM news n
      ORDER BY n.id ASC
    `
  );
  for (const row of rows) {
    const existing = queryOne(`SELECT id FROM columns WHERE source_type = 'news_item' AND source_id = ?`, [row.id]);
    const picture = normalizeSingleImage(row.picture) || DEFAULT_NEWS_IMAGE;
    const createdAt = toNullableString(row.created_at) || new Date().toISOString();
    if (existing) {
      execute(
        `
          UPDATE columns
          SET
            parent_id = ?,
            summary = ?,
            primary_image = ?,
            keywords = ?,
            is_visible = 1,
            is_featured_home = ?,
            sort_order = ?,
            legacy_extra = ?,
            created_at = ?,
            updated_at = ?
          WHERE id = ?
        `,
        [
          toNullableInteger(row.column_id),
          row.summary || '',
          picture,
          row.keywords || '',
          toBooleanInt(row.is_featured_home, 0),
          0,
          row.legacy_extra || null,
          createdAt,
          createdAt,
          existing.id
        ]
      );
    } else {
      execute(
        `
          INSERT INTO columns (
            parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
            show_in_nav, content_html, summary, code, images, primary_image, keywords,
            seo_title, seo_keywords, seo_description, slug, publish_status, published_at,
            is_visible, is_featured_home, sort_order, legacy_extra, is_system, created_at, updated_at
          ) VALUES (?, 'news', 'news_item', ?, 'content', 'content', 'news', 0, ?, ?, '', ?, ?, ?, NULL, NULL, NULL, NULL, 'published', NULL, 1, ?, 0, ?, 0, ?, ?)
        `,
        [
          toNullableInteger(row.column_id),
          row.id,
          row.content_html || '',
          row.summary || '',
          EMPTY_IMAGE_LIST,
          picture,
          row.keywords || '',
          toBooleanInt(row.is_featured_home, 0),
          row.legacy_extra || null,
          createdAt,
          createdAt
        ]
      );
    }

    const contentColumn = queryOne(`SELECT id FROM columns WHERE source_type = 'news_item' AND source_id = ?`, [row.id]);
    if (!contentColumn) {
      continue;
    }
    if (defaultLanguage?.id) {
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'published', NULL, ?, ?)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            keywords = excluded.keywords,
            updated_at = excluded.updated_at
        `,
        [
          contentColumn.id,
          defaultLanguage.id,
          row.title || '',
          row.summary || '',
          row.content_html || '',
          row.keywords || '',
          createdAt,
          createdAt
        ]
      );
    }
  }

  if (hasNewsTranslations) {
    const translations = queryAll(
      `
        SELECT
          nt.news_id,
          l.code AS language_code,
          nt.title,
          nt.summary,
          nt.content_html,
          nt.keywords,
          nt.seo_title,
          nt.seo_keywords,
          nt.seo_description,
          nt.publish_status,
          nt.published_at,
          nt.updated_at
        FROM news_translations nt
        INNER JOIN languages l ON l.id = nt.language_id
        ORDER BY nt.news_id ASC, l.id ASC
      `
    );
    for (const row of translations) {
      const column = queryOne(`SELECT id FROM columns WHERE source_type = 'news_item' AND source_id = ?`, [row.news_id]);
      const languageId = languageIdByCode.get(row.language_code);
      if (!column || !languageId) {
        continue;
      }
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
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
          column.id,
          languageId,
          row.title || '',
          row.summary || '',
          row.content_html || '',
          row.keywords || '',
          row.seo_title || null,
          row.seo_keywords || null,
          row.seo_description || null,
          normalizePublishStatus(row.publish_status),
          toNullableString(row.published_at),
          row.updated_at || new Date().toISOString(),
          row.updated_at || new Date().toISOString()
        ]
      );
    }
  }
}

function migrateLegacyCorporationContent() {
  if (!hasTable('corporation_categories')) {
    return;
  }
  const rootColumn = queryOne(
    `
      SELECT id
      FROM columns
      WHERE model_code = 'corporation'
        AND source_type = 'corporation_root'
      LIMIT 1
    `
  );
  if (!rootColumn) {
    return;
  }
  const rows = queryAll(
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
      ORDER BY id ASC
    `
  );
  for (const row of rows) {
    const existing = queryOne(`SELECT id FROM columns WHERE source_type = 'corporation_category' AND source_id = ?`, [row.id]);
    const legacyExtra = parseLegacyExtra(row.legacy_extra);
    const contentHtml = String(legacyExtra.Centern ?? legacyExtra.content_html ?? '');
    const parentId = toInteger(row.parent_id, 0) > 0
      ? queryOne(`SELECT id FROM columns WHERE source_type = 'corporation_category' AND source_id = ?`, [row.parent_id])?.id || rootColumn.id
      : rootColumn.id;
    if (existing) {
      execute(
        `
          UPDATE columns
          SET
            parent_id = ?,
            custom_url = ?,
            open_in_new_tab = ?,
            content_html = ?,
            legacy_extra = ?,
            sort_order = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          parentId,
          toBooleanInt(row.is_external, 0) === 1 ? row.external_url || null : null,
          toBooleanInt(row.is_external, 0),
          contentHtml,
          row.legacy_extra || null,
          toInteger(row.sort_order, 0),
          existing.id
        ]
      );
    } else {
      execute(
        `
          INSERT INTO columns (
            parent_id, model_code, source_type, source_id, node_type, column_kind, content_type,
            custom_url, route_path, open_in_new_tab, show_in_nav, content_html, summary, code, images, primary_image,
            keywords, seo_title, seo_keywords, seo_description, slug, publish_status, published_at,
            is_visible, is_featured_home, legacy_extra, sort_order, is_system, created_at, updated_at
          ) VALUES (?, 'corporation', 'corporation_category', ?, 'category', 'category', 'corporation', ?, NULL, ?, 1, ?, '', '', ?, '', NULL, NULL, NULL, NULL, NULL, 'published', NULL, 1, 0, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          parentId,
          row.id,
          toBooleanInt(row.is_external, 0) === 1 ? row.external_url || null : null,
          toBooleanInt(row.is_external, 0),
          contentHtml,
          EMPTY_IMAGE_LIST,
          row.legacy_extra || null,
          toInteger(row.sort_order, 0)
        ]
      );
    }

    const categoryColumn = queryOne(`SELECT id FROM columns WHERE source_type = 'corporation_category' AND source_id = ?`, [row.id]);
    const defaultLanguage = getDefaultLanguage();
    if (categoryColumn && defaultLanguage?.id) {
      execute(
        `
          INSERT INTO column_translations (
            column_id, language_id, name, summary, content_html, keywords,
            seo_title, seo_keywords, seo_description, publish_status, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, '', ?, NULL, NULL, NULL, NULL, 'published', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            content_html = excluded.content_html,
            updated_at = excluded.updated_at
        `,
        [categoryColumn.id, defaultLanguage.id, row.name || '', contentHtml]
      );
    }
  }
}

function dropLegacyContentTables() {
  if (hasTable('products')) {
    getDb().exec(`
      DROP TRIGGER IF EXISTS products_ai;
      DROP TRIGGER IF EXISTS products_ad;
      DROP TRIGGER IF EXISTS products_au;
      DROP TABLE IF EXISTS products_fts;
      DROP TABLE IF EXISTS products;
    `);
  }
  if (hasTable('product_translations')) {
    execute('DROP TABLE IF EXISTS product_translations');
  }
  if (hasTable('news')) {
    getDb().exec(`
      DROP TRIGGER IF EXISTS news_ai;
      DROP TRIGGER IF EXISTS news_ad;
      DROP TRIGGER IF EXISTS news_au;
      DROP TABLE IF EXISTS news_fts;
      DROP TABLE IF EXISTS news;
    `);
  }
  if (hasTable('news_translations')) {
    execute('DROP TABLE IF EXISTS news_translations');
  }
  if (hasTable('corporation_categories')) {
    execute('DROP TABLE IF EXISTS corporation_categories');
  }
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
