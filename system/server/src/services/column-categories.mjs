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
import { resolveRelativePublicPath } from './column-paths.mjs';

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

function normalizeDirName(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/-+/g, '-')
    .replace(/^[-/]+|[-/]+$/g, '');
  return normalized || null;
}

function slugifyName(value, fallback) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function getCategoryConfig(model) {
  if (model === 'product') {
    return { columnType: 'list', contentModelCode: 'product', rootBasePath: '/products/' };
  }
  if (model === 'news') {
    return { columnType: 'list', contentModelCode: 'news', rootBasePath: null };
  }
  if (model === 'corporation') {
    return { columnType: 'single', contentModelCode: null, rootBasePath: '/about/' };
  }
  throw new Error(`unsupported model: ${model}`);
}

function getRootCategoryContext(rootColumnId, languageCode = null) {
  const rootColumn = getColumnById(rootColumnId, { languageCode, includeTranslations: true });
  if (!rootColumn) {
    throw new Error('栏目不存在');
  }

  const renderDriver = String(rootColumn?.column_semantics?.render_driver || '').trim();
  if (!['managed_category', 'section', 'page_tree'].includes(renderDriver)) {
    throw new Error('当前栏目不支持分类管理');
  }

  const columnType = String(rootColumn?.column_type || '').trim();
  if (columnType !== 'list' && columnType !== 'single') {
    throw new Error('当前栏目形态不支持分类管理');
  }

  return {
    rootColumn,
    rootColumnId: toInteger(rootColumn.id, 0),
    renderDriver,
    columnType,
    contentModelCode: toNullableString(rootColumn.model_code),
    contentModelId: toInteger(rootColumn.content_model_id, 0) || null,
    rootRoutePath: toNullableString(rootColumn.route_path) || '/'
  };
}

function isModelColumn(column, model) {
  const config = getCategoryConfig(model);
  return String(column?.column_type || '') === config.columnType
    && String(column?.model_code || '') === (config.contentModelCode || 'corporation');
}

function isColumnInRootCategoryTree(column, rootContext) {
  const columnId = toInteger(column?.id, 0);
  if (columnId === rootContext.rootColumnId) {
    return true;
  }

  return toInteger(column?.column_semantics?.root_column_id, 0) === rootContext.rootColumnId
    && String(column?.column_type || '') === rootContext.columnType;
}

function mapColumnToCategory(column, rootColumn = null) {
  const parentId = toInteger(column.parent_id, 0);
  const translations = column.translations || {};
  return {
    id: toInteger(column.id, 0),
    column_id: toInteger(column.id, 0),
    name: column.name || '',
    parent_id: rootColumn && parentId === toInteger(rootColumn.id, 0)
      ? 0
      : parentId,
    sort_order: toInteger(column.sort_order, 0),
    dir_name: column.dir_name || null,
    images: Array.isArray(column.images) ? column.images : [],
    route_path: column.route_path || null,
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
}

function resolveCategoryColumnById(model, id, languageCode = null) {
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    isModelColumn(item, model)
    && toInteger(item.id, 0) === toInteger(id, 0)
  )) || null;
}

function resolveCategoryColumnByIdInRoot(rootColumnId, id, languageCode = null) {
  const rootContext = getRootCategoryContext(rootColumnId, languageCode);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    isColumnInRootCategoryTree(item, rootContext)
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

function resolveParentColumnIdInRoot(rootContext, parentCategoryId, currentColumnId = 0, languageCode = null) {
  const safeParentId = toInteger(parentCategoryId, 0);
  const safeCurrentColumnId = toInteger(currentColumnId, 0);

  if (safeCurrentColumnId > 0 && safeCurrentColumnId === rootContext.rootColumnId) {
    return 0;
  }

  if (safeParentId <= 0) {
    return rootContext.rootColumnId;
  }

  if (safeParentId === rootContext.rootColumnId) {
    return rootContext.rootColumnId;
  }

  return toInteger(resolveCategoryColumnByIdInRoot(rootContext.rootColumnId, safeParentId, languageCode)?.id, 0) || null;
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

export function listColumnCategoriesByRoot(rootColumnId, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const rootContext = getRootCategoryContext(rootColumnId, languageCode);
  return listColumns({ languageCode, includeTranslations: true })
    .filter((item) => isColumnInRootCategoryTree(item, rootContext))
    .map((item) => mapColumnToCategory(item, rootContext.rootColumn));
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

export function listColumnCategoryOptionsByRoot(rootColumnId, { languageCode = null } = {}) {
  return buildCategoryOptions(listColumnCategoriesByRoot(rootColumnId, { languageCode }));
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

export function getColumnCategoryByIdInRoot(rootColumnId, id, { languageCode = null, includeTranslations = false } = {}) {
  const rootContext = getRootCategoryContext(rootColumnId, languageCode);
  const column = resolveCategoryColumnByIdInRoot(rootContext.rootColumnId, id, languageCode);
  if (!column) {
    return null;
  }
  const item = mapColumnToCategory(column, rootContext.rootColumn);
  if (!includeTranslations) {
    delete item.translations;
  }
  return item;
}

export function createColumnCategory(model, input) {
  ensureColumnsSchema();
  const config = getCategoryConfig(model);
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
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
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0] || {};
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name) || slugifyName(defaultTranslation?.name, `${model}-${Date.now()}`);
  const initialRoutePath = buildCategoryRoutePath({
    model,
    dirName,
    parentColumn,
    columnType: config.columnType,
    fallbackName: defaultTranslation?.name || model
  });

  const column = createManualColumn({
    base: {
      name: String(defaultTranslation?.name || '').trim(),
      parent_id: parentColumnId,
      column_type: config.columnType,
      content_model_id: contentModelId,
      route_path: initialRoutePath,
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      dir_name: dirName,
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule),
      legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? null
    },
    translations
  });

  const finalRoutePath = buildCategoryRoutePath({
    model,
    dirName,
    parentColumn: parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null,
    currentColumnId: column.id,
    columnType: config.columnType,
    fallbackName: defaultTranslation?.name || model
  });

  if (config.columnType === 'single') {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        column_type: config.columnType,
        content_model_id: contentModelId,
        route_path: finalRoutePath,
        dir_name: dirName,
        detail_rule: null,
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? null,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
        is_visible: 1,
        custom_url: null
      },
      translations
    });
  } else {
    updateColumnRecord(column.id, {
      parent_id: parentColumnId,
      content_model_id: contentModelId,
      dir_name: dirName,
      route_path: finalRoutePath,
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule),
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      translations
    });
  }

  return getColumnCategoryById(model, column.id, { includeTranslations: true });
}

export function createColumnCategoryByRoot(rootColumnId, input) {
  ensureColumnsSchema();
  const rootContext = getRootCategoryContext(rootColumnId);
  const parentColumnId = resolveParentColumnIdInRoot(rootContext, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
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
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0] || {};
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name) || slugifyName(defaultTranslation?.name, `column-${Date.now()}`);
  const initialRoutePath = buildCategoryRoutePath({
    rootContext,
    dirName,
    parentColumn,
    columnType: rootContext.columnType,
    fallbackName: defaultTranslation?.name || rootContext.rootColumn?.name || 'column'
  });

  const column = createManualColumn({
    base: {
      name: String(defaultTranslation?.name || '').trim(),
      parent_id: parentColumnId,
      column_type: rootContext.columnType,
      content_model_id: rootContext.contentModelId,
      route_path: initialRoutePath,
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      dir_name: dirName,
      detail_rule: rootContext.columnType === 'list'
        ? toNullableString(input?.base?.detail_rule ?? input?.detail_rule)
        : null,
      legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? null
    },
    translations
  });

  const finalRoutePath = buildCategoryRoutePath({
    rootContext,
    dirName,
    parentColumn: parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null,
    currentColumnId: column.id,
    columnType: rootContext.columnType,
    fallbackName: defaultTranslation?.name || rootContext.rootColumn?.name || 'column'
  });

  if (rootContext.columnType === 'single') {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        column_type: rootContext.columnType,
        content_model_id: rootContext.contentModelId,
        route_path: finalRoutePath,
        dir_name: dirName,
        detail_rule: null,
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? null,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
        is_visible: 1,
        custom_url: null
      },
      translations
    });
  } else {
    updateColumnRecord(column.id, {
      parent_id: parentColumnId,
      content_model_id: rootContext.contentModelId,
      dir_name: dirName,
      route_path: finalRoutePath,
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule),
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order, 0),
      is_visible: 1,
      translations
    });
  }

  return getColumnCategoryByIdInRoot(rootContext.rootColumnId, column.id, { includeTranslations: true });
}

export function updateColumnCategory(model, id, input) {
  const column = resolveCategoryColumnById(model, id);
  if (!column) {
    return null;
  }
  const config = getCategoryConfig(model);
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
  const existingTranslations = column.translations || {};
  const translations = normalizeCategoryTranslations(input, existingTranslations, column);
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name)
    || normalizeDirName(column.dir_name)
    || slugifyName(column.name, `${model}-${column.id}`);
  const routePath = buildCategoryRoutePath({
    model,
    dirName,
    parentColumn,
    currentColumnId: column.id,
    columnType: config.columnType,
    fallbackName: column.name || model
  });

  if (config.columnType === 'single') {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        column_type: config.columnType,
        content_model_id: contentModelId,
        route_path: routePath,
        dir_name: dirName,
        detail_rule: null,
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? column.legacy_extra ?? null,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
        is_visible: toInteger(input?.base?.is_visible ?? column.is_visible, 1),
        custom_url: null
      },
      translations
    });
  } else {
    updateColumnRecord(column.id, {
      parent_id: parentColumnId,
      content_model_id: contentModelId,
      dir_name: dirName,
      route_path: routePath,
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule ?? column.detail_rule),
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
      is_visible: toInteger(input?.base?.is_visible ?? column.is_visible, 1),
      translations
    });
  }

  return getColumnCategoryById(model, id, { includeTranslations: true });
}

export function updateColumnCategoryInRoot(rootColumnId, id, input) {
  const rootContext = getRootCategoryContext(rootColumnId);
  const column = resolveCategoryColumnByIdInRoot(rootContext.rootColumnId, id);
  if (!column) {
    return null;
  }
  const parentColumnId = resolveParentColumnIdInRoot(
    rootContext,
    input?.base?.parent_id ?? input?.parent_id,
    column.id
  );
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
  const existingTranslations = column.translations || {};
  const translations = normalizeCategoryTranslations(input, existingTranslations, column);
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name)
    || normalizeDirName(column.dir_name)
    || slugifyName(column.name, `column-${column.id}`);
  const routePath = buildCategoryRoutePath({
    rootContext,
    dirName,
    parentColumn,
    currentColumnId: column.id,
    columnType: rootContext.columnType,
    fallbackName: column.name || rootContext.rootColumn?.name || 'column'
  });

  if (rootContext.columnType === 'single') {
    updateManualColumn(column.id, {
      base: {
        parent_id: parentColumnId,
        column_type: rootContext.columnType,
        content_model_id: rootContext.contentModelId,
        route_path: routePath,
        dir_name: dirName,
        detail_rule: null,
        legacy_extra: input?.base?.legacy_extra ?? input?.legacy_extra ?? column.legacy_extra ?? null,
        sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
        is_visible: toInteger(input?.base?.is_visible ?? column.is_visible, 1),
        custom_url: null
      },
      translations
    });
  } else {
    updateColumnRecord(column.id, {
      parent_id: parentColumnId,
      content_model_id: rootContext.contentModelId,
      dir_name: dirName,
      route_path: routePath,
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule ?? column.detail_rule),
      sort_order: toInteger(input?.base?.sort_order ?? input?.sort_order ?? column.sort_order, 0),
      is_visible: toInteger(input?.base?.is_visible ?? column.is_visible, 1),
      translations
    });
  }

  return getColumnCategoryByIdInRoot(rootContext.rootColumnId, id, { includeTranslations: true });
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

export function deleteColumnCategoryInRoot(rootColumnId, id) {
  const rootContext = getRootCategoryContext(rootColumnId);
  const column = resolveCategoryColumnByIdInRoot(rootContext.rootColumnId, id);
  if (!column) {
    return null;
  }
  if (toInteger(column.id, 0) === rootContext.rootColumnId) {
    throw new Error('根栏目不允许通过分类接口删除');
  }

  const childCount = queryOne('SELECT COUNT(*) AS value FROM columns WHERE parent_id = ?', [column.id])?.value || 0;
  if (toInteger(childCount, 0) > 0) {
    throw new Error('请先删除或移动子分类');
  }

  deleteManualColumn(column.id);
  return mapColumnToCategory(column, rootContext.rootColumn);
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

function buildCategoryRoutePath({
  model,
  rootContext = null,
  dirName,
  parentColumn,
  currentColumnId = 0,
  columnType,
  fallbackName
}) {
  const config = rootContext || getCategoryConfig(model);
  const fallbackKey = rootContext?.rootColumnId
    ? `column-${rootContext.rootColumnId}`
    : model;
  const normalizedDirName = dirName || slugifyName(fallbackName, currentColumnId > 0 ? `${fallbackKey}-${currentColumnId}` : `${fallbackKey}-column`);

  if (rootContext && currentColumnId > 0 && currentColumnId === rootContext.rootColumnId) {
    return rootContext.rootRoutePath;
  }

  if ((rootContext?.columnType || columnType) === 'single') {
    if (parentColumn?.route_path) {
      const parentDir = String(parentColumn.route_path || '').replace(/[^/]+\.html$/i, '').replace(/\/?$/, '/');
      return resolveRelativePublicPath(`${normalizedDirName}.html`, parentDir) || `/${normalizedDirName}.html`;
    }

    const basePath = String(rootContext?.rootRoutePath || config.rootBasePath || '/')
      .replace(/[^/]+\.html$/i, '')
      .replace(/\/?$/, '/');
    return resolveRelativePublicPath(`${normalizedDirName}.html`, basePath) || `/${normalizedDirName}.html`;
  }

  if (parentColumn?.route_path) {
    return resolveRelativePublicPath(`${normalizedDirName}/`, parentColumn.route_path) || `/${normalizedDirName}/`;
  }

  if (rootContext?.rootRoutePath) {
    return resolveRelativePublicPath(`${normalizedDirName}/`, rootContext.rootRoutePath) || `/${normalizedDirName}/`;
  }

  if (config.rootBasePath && model === 'product') {
    return currentColumnId > 0 && parentColumn
      ? resolveRelativePublicPath(`${normalizedDirName}/`, parentColumn.route_path || config.rootBasePath) || `/products/${normalizedDirName}/`
      : config.rootBasePath;
  }

  return `/${normalizedDirName}/`;
}
