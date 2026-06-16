import {
  createManualColumn,
  deleteManualColumn,
  ensureColumnsSchema,
  getCategoryRootColumn,
  getColumnById,
  listCategoryColumns,
  listColumns,
  updateManualColumn,
  updateColumnRecord
} from './columns.mjs';
import { queryOne } from '../db.mjs';
import { getDefaultLanguage } from './languages.mjs';
import { getContentModelByCode } from './content-models.mjs';

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
    return { sourceType: 'product_category', rootSourceType: 'product_root', contentModelCode: 'product' };
  }
  if (model === 'news') {
    return { sourceType: 'news_category', rootSourceType: null, contentModelCode: 'news' };
  }
  if (model === 'corporation') {
    return { sourceType: 'corporation_category', rootSourceType: 'corporation_root', contentModelCode: null };
  }
  throw new Error(`unsupported model: ${model}`);
}

function mapColumnToCategory(column, rootColumn = null) {
  const parentId = toInteger(column.parent_id, 0);
  const translations = column.translations || {};
  const mapped = {
    id: toInteger(column.id, 0),
    column_id: toInteger(column.id, 0),
    source_id: toInteger(column.source_id, 0),
    name: column.name || '',
    parent_id: rootColumn && parentId === toInteger(rootColumn.id, 0)
      ? 0
      : parentId,
    sort_order: toInteger(column.sort_order, 0),
    dir_name: column.dir_name || null,
    detail_rule: column.detail_rule || null,
    summary: column.summary ?? '',
    content_html: column.content_html ?? '',
    keywords: column.keywords ?? null,
    seo_title: column.seo_title ?? null,
    seo_keywords: column.seo_keywords ?? null,
    seo_description: column.seo_description ?? null,
    publish_status: column.publish_status ?? 'published',
    published_at: column.published_at ?? null,
    is_visible: toInteger(column.is_visible, 1),
    is_featured_home: toInteger(column.is_featured_home, 0),
    legacy_extra: column.legacy_extra || null,
    page_data: column.page_data || null,
    current_language_code: column.current_language_code,
    translations
  };

  return mapped;
}

function resolveCategoryColumnById(model, id, languageCode = null) {
  const config = getCategoryConfig(model);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    String(item.source_type || '') === config.sourceType
    && toInteger(item.id, 0) === toInteger(id, 0)
  )) || null;
}

function resolveParentColumnId(model, parentCategoryId, languageCode = null) {
  const safeParentId = toInteger(parentCategoryId, 0);
  if (safeParentId <= 0) {
    return toInteger(getCategoryRootColumn(model, { languageCode })?.id, 0) || null;
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
  ensureColumnsSchema();
  const rootColumn = getCategoryRootColumn(model, { languageCode });
  return listCategoryColumns(model, { languageCode }).map((item) => mapColumnToCategory(item, rootColumn));
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
  const rootColumn = getCategoryRootColumn(model, { languageCode });
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
      summary: String(input?.summary || ''),
      keywords: toNullableString(input?.keywords),
      seo_title: toNullableString(input?.seo_title),
      seo_keywords: toNullableString(input?.seo_keywords),
      seo_description: toNullableString(input?.seo_description),
      content_html: String(input?.content_html || ''),
      publish_status: String(input?.publish_status || 'published') === 'draft' ? 'draft' : 'published',
      published_at: toNullableString(input?.published_at)
    }
  };
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0];
  const sourceId = queryOne(
    'SELECT COALESCE(MAX(source_id), 0) + 1 AS value FROM columns WHERE source_type = ?',
    [config.sourceType]
  )?.value;
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;

  const column = createManualColumn({
    base: {
      name: String(defaultTranslation?.name || '').trim(),
      parent_id: parentColumnId,
      source_type: config.sourceType,
      content_model_id: contentModelId,
      route_path: model === 'corporation' ? `/about/about-${toInteger(sourceId, 1)}.html` : `/__internal/${model}/${toInteger(sourceId, 1)}/`,
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      dir_name: toNullableString(input?.base?.dir_name ?? input?.dir_name),
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule),
      legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? null
    },
    translations
  });

  if (model !== 'corporation') {
    updateColumnRecord(column.id, {
      parent_id: parentColumnId,
      content_model_id: contentModelId,
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      translations
    });
  } else {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        content_model_id: contentModelId,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
        route_path: `/about/about-${column.id}.html`,
        is_visible: 1,
        custom_url: null
      },
      translations
    });
  }

  return getColumnCategoryById(model, column.id, { includeTranslations: true });
}

export function updateColumnCategory(model, id, input) {
  const column = resolveCategoryColumnById(model, id);
  if (!column) {
    return null;
  }
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const existingTranslations = column.translations || {};
  const translations = normalizeCategoryTranslations(input, existingTranslations, column);
  const config = getCategoryConfig(model);
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;

  if (model === 'corporation') {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        content_model_id: contentModelId,
        route_path: `/about/about-${column.id}.html`,
        dir_name: toNullableString(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name),
        detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule ?? column.detail_rule),
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? column.legacy_extra ?? null,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
        is_visible: 1,
        custom_url: null
      },
      translations
    });
  } else {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        source_type: column.source_type,
        content_model_id: contentModelId,
        route_path: column.route_path,
        dir_name: toNullableString(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name),
        detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule ?? column.detail_rule),
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
        is_visible: toInteger(input?.base?.is_visible ?? column.is_visible, 1),
        custom_url: null,
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? column.legacy_extra ?? null
      },
      translations
    });
  }

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

  deleteManualColumn(column.id);
  return mapColumnToCategory(column, getCategoryRootColumn(model));
}

function normalizeCategoryTranslations(input, existingTranslations, column) {
  if (input?.translations) {
    return input.translations;
  }

  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const fallbackTranslation = existingTranslations?.[defaultLanguageCode] || Object.values(existingTranslations || {})[0] || {};
  return {
    ...existingTranslations,
    [defaultLanguageCode]: {
      ...fallbackTranslation,
      name: String(input?.name ?? fallbackTranslation.name ?? column?.name ?? '').trim(),
      summary: String(input?.summary ?? fallbackTranslation.summary ?? column?.summary ?? ''),
      content_html: String(input?.content_html ?? fallbackTranslation.content_html ?? column?.content_html ?? ''),
      keywords: toNullableString(input?.keywords ?? fallbackTranslation.keywords ?? column?.keywords),
      seo_title: toNullableString(input?.seo_title ?? fallbackTranslation.seo_title ?? column?.seo_title),
      seo_keywords: toNullableString(input?.seo_keywords ?? fallbackTranslation.seo_keywords ?? column?.seo_keywords),
      seo_description: toNullableString(input?.seo_description ?? fallbackTranslation.seo_description ?? column?.seo_description),
      publish_status: String(input?.publish_status ?? fallbackTranslation.publish_status ?? column?.publish_status ?? 'published') === 'draft'
        ? 'draft'
        : 'published',
      published_at: toNullableString(input?.published_at ?? fallbackTranslation.published_at ?? column?.published_at)
    }
  };
}
