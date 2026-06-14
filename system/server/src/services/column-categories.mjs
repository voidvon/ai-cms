import {
  ensureColumnsSchema,
  getColumnById,
  listColumns,
  updateColumnRecord
} from './columns.mjs';
import { execute, queryOne } from '../db.mjs';
import { getDefaultLanguage } from './languages.mjs';

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function getCategoryConfig(model) {
  if (model === 'product') {
    return { modelCode: 'product', sourceType: 'product_category', rootSourceType: 'product_root' };
  }
  if (model === 'news') {
    return { modelCode: 'news', sourceType: 'news_category', rootSourceType: null };
  }
  throw new Error(`unsupported model: ${model}`);
}

function listCategoryColumns(model, languageCode = null) {
  ensureColumnsSchema();
  const config = getCategoryConfig(model);
  return listColumns({ languageCode, includeTranslations: true }).filter((item) => (
    String(item.model_code || '') === config.modelCode
    && String(item.source_type || '') === config.sourceType
    && String(item.column_kind || '') === 'category'
  ));
}

function getCategoryRootColumn(model, languageCode = null) {
  const config = getCategoryConfig(model);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.model_code || '') === config.modelCode
    && String(item.source_type || '') === config.rootSourceType
  )) || null;
}

function mapColumnToCategory(column, rootColumn = null) {
  const parentId = toInteger(column.parent_id, 0);
  return {
    id: toInteger(column.id, 0),
    column_id: toInteger(column.id, 0),
    source_id: toInteger(column.source_id, 0),
    name: column.name || '',
    parent_id: rootColumn && parentId === toInteger(rootColumn.id, 0)
      ? 0
      : parentId,
    sort_order: toInteger(column.sort_order, 0),
    slug: column.slug || null,
    content_html: column.content_html || '',
    seo_title: column.seo_title || null,
    seo_keywords: column.seo_keywords || null,
    seo_description: column.seo_description || null,
    legacy_extra: column.legacy_extra || null,
    page_data: column.page_data || null,
    current_language_code: column.current_language_code,
    translations: column.translations || {}
  };
}

function resolveCategorySourceIdByColumnId(columnId) {
  if (!columnId) {
    return 0;
  }
  const column = getColumnById(columnId, { includeTranslations: true });
  return column ? toInteger(column.source_id, 0) : 0;
}

function resolveCategoryColumnBySourceId(model, sourceId, languageCode = null) {
  const config = getCategoryConfig(model);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.model_code || '') === config.modelCode
    && String(item.source_type || '') === config.sourceType
    && toInteger(item.source_id, 0) === toInteger(sourceId, 0)
  )) || null;
}

function resolveCategoryColumnById(model, id, languageCode = null) {
  const config = getCategoryConfig(model);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.model_code || '') === config.modelCode
    && String(item.source_type || '') === config.sourceType
    && toInteger(item.id, 0) === toInteger(id, 0)
  )) || null;
}

function resolveParentColumnId(model, parentCategoryId, languageCode = null) {
  const safeParentId = toInteger(parentCategoryId, 0);
  if (safeParentId <= 0) {
    return toInteger(getCategoryRootColumn(model, languageCode)?.id, 0) || null;
  }
  return toInteger(resolveCategoryColumnById(model, safeParentId, languageCode)?.id, 0) || null;
}

function buildCategoryOptions(items) {
  const childrenByParent = new Map();
  for (const item of items) {
    const parentId = toInteger(item.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(item);
  }

  const options = [];
  const visit = (parentId, depth) => {
    for (const item of childrenByParent.get(parentId) || []) {
      options.push({ ...item, depth });
      visit(toInteger(item.id, 0), depth + 1);
    }
  };
  visit(0, 0);
  return options;
}

export function listColumnCategories(model, { languageCode = null } = {}) {
  const rootColumn = getCategoryRootColumn(model, languageCode);
  return listCategoryColumns(model, languageCode).map((item) => mapColumnToCategory(item, rootColumn));
}

export function listColumnCategoriesAdmin(model, { parentId = 0, page = 1, limit = 50, languageCode = null } = {}) {
  const items = listColumnCategories(model, { languageCode }).filter((item) => toInteger(item.parent_id, 0) === toInteger(parentId, 0));
  const safeLimit = Math.min(Math.max(toInteger(limit, 50), 1), 200);
  const safePage = Math.max(toInteger(page, 1), 1);
  const offset = (safePage - 1) * safeLimit;
  return {
    items: items.slice(offset, offset + safeLimit),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: items.length,
      totalPages: Math.max(Math.ceil(items.length / safeLimit), 1)
    }
  };
}

export function listColumnCategoryOptions(model, { languageCode = null } = {}) {
  return buildCategoryOptions(listColumnCategories(model, { languageCode }));
}

export function getColumnCategoryById(model, id, { languageCode = null, includeTranslations = false } = {}) {
  const rootColumn = getCategoryRootColumn(model, languageCode);
  const column = resolveCategoryColumnById(model, id, languageCode);
  if (!column) {
    return null;
  }
  const item = mapColumnToCategory(column, rootColumn);
  if (!includeTranslations) {
    delete item.translations;
  }
  return item;
}

export function createColumnCategory(model, input) {
  ensureColumnsSchema();
  const config = getCategoryConfig(model);
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const translations = input?.translations || {
    [defaultLanguageCode]: {
      name: String(input?.name || '').trim(),
      seo_title: toNullableString(input?.seo_title),
      seo_keywords: toNullableString(input?.seo_keywords),
      seo_description: toNullableString(input?.seo_description),
      content_html: String(input?.content_html || '')
    }
  };
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0];
  const sourceId = queryOne(
    'SELECT COALESCE(MAX(source_id), 0) + 1 AS value FROM columns WHERE source_type = ?',
    [config.sourceType]
  )?.value;
  const now = new Date().toISOString();

  const result = execute(
    `
      INSERT INTO columns (
        name,
        parent_id,
        model_code,
        source_type,
        source_id,
        column_kind,
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
      ) VALUES (?, ?, ?, ?, ?, 'category', ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)
    `,
    [
      String(defaultTranslation?.name || '').trim(),
      parentColumnId,
      config.modelCode,
      config.sourceType,
      toInteger(sourceId, 1),
      String(defaultTranslation?.content_html || ''),
      toNullableString(defaultTranslation?.seo_title),
      toNullableString(defaultTranslation?.seo_keywords),
      toNullableString(defaultTranslation?.seo_description),
      toNullableString(input?.base?.slug ?? input?.slug),
      input?.base?.legacy_extra ?? input?.legacy_extra ?? null,
      toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      now,
      now
    ]
  );

  updateColumnRecord(result.lastInsertRowid, {
    parent_id: parentColumnId,
    sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
    show_in_nav: 1,
    translations
  });

  return getColumnCategoryById(model, toInteger(result.lastInsertRowid, 0), { includeTranslations: true });
}

export function updateColumnCategory(model, id, input) {
  const column = resolveCategoryColumnById(model, id);
  if (!column) {
    return null;
  }
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const existingTranslations = column.translations || {};
  const translations = input?.translations || existingTranslations;

  execute(
    `
      UPDATE columns
      SET
        parent_id = ?,
        slug = ?,
        legacy_extra = ?,
        updated_at = ?
      WHERE id = ?
    `,
    [
      parentColumnId,
      toNullableString(input?.base?.slug ?? input?.slug ?? column.slug),
      input?.base?.legacy_extra ?? input?.legacy_extra ?? column.legacy_extra ?? null,
      new Date().toISOString(),
      column.id
    ]
  );

  updateColumnRecord(column.id, {
    parent_id: parentColumnId,
    sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
    show_in_nav: toInteger(input?.base?.show_in_nav ?? column.show_in_nav, 1),
    translations
  });

  return getColumnCategoryById(model, id, { includeTranslations: true });
}

export function deleteColumnCategory(model, id) {
  const column = resolveCategoryColumnById(model, id);
  if (!column) {
    return null;
  }

  const childCount = queryOne('SELECT COUNT(*) AS value FROM columns WHERE parent_id = ?', [column.id])?.value || 0;
  if (toInteger(childCount, 0) > 0) {
    throw new Error('请先删除或移动子分类');
  }

  execute('DELETE FROM columns WHERE id = ?', [column.id]);
  return mapColumnToCategory(column, getCategoryRootColumn(model));
}
