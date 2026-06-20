import {
  createManualColumn,
  deleteManualColumn,
  ensureColumnsSchema,
  getModelRootColumn,
  getColumnById,
  listModelColumns,
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

function getModelColumnConfig(model) {
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

function getRootColumnNodeContext(rootColumnId, languageCode = null) {
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
  const config = getModelColumnConfig(model);
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

function mapColumnToNode(column, rootColumn = null) {
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
    template_data_json: column.template_data_json ?? null,
    template_data: column.template_data ?? null,
    seo_title: column.seo_title ?? null,
    seo_description: column.seo_description ?? null,
    publish_status: column.publish_status ?? 'published',
    is_visible: toInteger(column.is_visible, 1),
    is_featured_home: toInteger(column.is_featured_home, 0),
    current_language_code: column.current_language_code,
    translations
  };
}

function resolveColumnNodeById(model, id, languageCode = null) {
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    isModelColumn(item, model)
    && toInteger(item.id, 0) === toInteger(id, 0)
  )) || null;
}

function resolveColumnNodeByIdInRoot(rootColumnId, id, languageCode = null) {
  const rootContext = getRootColumnNodeContext(rootColumnId, languageCode);
  return listColumns({ languageCode, includeTranslations: true }).find((item) => (
    isColumnInRootCategoryTree(item, rootContext)
    && toInteger(item.id, 0) === toInteger(id, 0)
  )) || null;
}

function resolveParentColumnId(model, parentCategoryId, languageCode = null) {
  const safeParentId = toInteger(parentCategoryId, 0);
  if (safeParentId <= 0) {
    return toInteger(getModelRootColumn(model, { languageCode })?.id, 0) || null;
  }
  return toInteger(resolveColumnNodeById(model, safeParentId, languageCode)?.id, 0) || null;
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

  return toInteger(resolveColumnNodeByIdInRoot(rootContext.rootColumnId, safeParentId, languageCode)?.id, 0) || null;
}

function buildColumnNodeOptions(items) {
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

export function listColumnNodes(model, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const rootColumn = getModelRootColumn(model, { languageCode });
  return listModelColumns(model, { languageCode }).map((item) => mapColumnToNode(item, rootColumn));
}

export function listColumnNodesByRoot(rootColumnId, { languageCode = null } = {}) {
  ensureColumnsSchema();
  const rootContext = getRootColumnNodeContext(rootColumnId, languageCode);
  return listColumns({ languageCode, includeTranslations: true })
    .filter((item) => isColumnInRootCategoryTree(item, rootContext))
    .map((item) => mapColumnToNode(item, rootContext.rootColumn));
}

export function listColumnCategoriesAdmin(model, { parentId = 0, page = 1, limit = 50, languageCode = null } = {}) {
  const items = listColumnNodes(model, { languageCode }).filter((item) => toInteger(item.parent_id, 0) === toInteger(parentId, 0));
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

export function listColumnNodeOptions(model, { languageCode = null } = {}) {
  return buildColumnNodeOptions(listColumnNodes(model, { languageCode }));
}

export function listColumnNodeOptionsByRoot(rootColumnId, { languageCode = null } = {}) {
  return buildColumnNodeOptions(listColumnNodesByRoot(rootColumnId, { languageCode }));
}

export function getColumnNodeById(model, id, { languageCode = null, includeTranslations = false } = {}) {
  const rootColumn = getModelRootColumn(model, { languageCode });
  const column = resolveColumnNodeById(model, id, languageCode);
  if (!column) {
    return null;
  }
  const item = mapColumnToNode(column, rootColumn);
  if (!includeTranslations) {
    delete item.translations;
  }
  return item;
}

export function getColumnNodeByIdInRoot(rootColumnId, id, { languageCode = null, includeTranslations = false } = {}) {
  const rootContext = getRootColumnNodeContext(rootColumnId, languageCode);
  const column = resolveColumnNodeByIdInRoot(rootContext.rootColumnId, id, languageCode);
  if (!column) {
    return null;
  }
  const item = mapColumnToNode(column, rootContext.rootColumn);
  if (!includeTranslations) {
    delete item.translations;
  }
  return item;
}

export function createColumnNode(model, input) {
  ensureColumnsSchema();
  const config = getModelColumnConfig(model);
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const translations = input?.translations || {
    [defaultLanguageCode]: {
      name: String(input?.name || '').trim(),
      summary: String(input?.summary || ''),
      seo_title: toNullableString(input?.seo_title),
      seo_description: toNullableString(input?.seo_description),
      content_html: String(input?.content_html || ''),
      publish_status: String(input?.publish_status || 'published') === 'draft' ? 'draft' : 'published'
    }
  };
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0] || {};
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name) || slugifyName(defaultTranslation?.name, `${model}-${Date.now()}`);
  const initialRoutePath = buildColumnNodeRoutePath({
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
      detail_rule: toNullableString(input?.base?.detail_rule ?? input?.detail_rule)
    },
    translations
  });

  const finalRoutePath = buildColumnNodeRoutePath({
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

  return getColumnNodeById(model, column.id, { includeTranslations: true });
}

export function createColumnNodeByRoot(rootColumnId, input) {
  ensureColumnsSchema();
  const rootContext = getRootColumnNodeContext(rootColumnId);
  const parentColumnId = resolveParentColumnIdInRoot(rootContext, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
  const translations = input?.translations || {
    [defaultLanguageCode]: {
      name: String(input?.name || '').trim(),
      summary: String(input?.summary || ''),
      seo_title: toNullableString(input?.seo_title),
      seo_description: toNullableString(input?.seo_description),
      content_html: String(input?.content_html || ''),
      publish_status: String(input?.publish_status || 'published') === 'draft' ? 'draft' : 'published'
    }
  };
  const defaultTranslation = translations[defaultLanguageCode] || Object.values(translations)[0] || {};
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name) || slugifyName(defaultTranslation?.name, `column-${Date.now()}`);
  const initialRoutePath = buildColumnNodeRoutePath({
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
        : null
    },
    translations
  });

  const finalRoutePath = buildColumnNodeRoutePath({
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

  return getColumnNodeByIdInRoot(rootContext.rootColumnId, column.id, { includeTranslations: true });
}

export function updateColumnNode(model, id, input) {
  const column = resolveColumnNodeById(model, id);
  if (!column) {
    return null;
  }
  const config = getModelColumnConfig(model);
  const parentColumnId = resolveParentColumnId(model, input?.base?.parent_id ?? input?.parent_id);
  const parentColumn = parentColumnId ? getColumnById(parentColumnId, { includeTranslations: true }) : null;
  const existingTranslations = column.translations || {};
  const translations = normalizeColumnNodeTranslations(input, existingTranslations, column);
  const contentModelId = config.contentModelCode
    ? Number(getContentModelByCode(config.contentModelCode)?.id || 0) || null
    : null;
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name)
    || normalizeDirName(column.dir_name)
    || slugifyName(column.name, `${model}-${column.id}`);
  const routePath = buildColumnNodeRoutePath({
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

  return getColumnNodeById(model, id, { includeTranslations: true });
}

export function updateColumnNodeInRoot(rootColumnId, id, input) {
  const rootContext = getRootColumnNodeContext(rootColumnId);
  const column = resolveColumnNodeByIdInRoot(rootContext.rootColumnId, id);
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
  const translations = normalizeColumnNodeTranslations(input, existingTranslations, column);
  const dirName = normalizeDirName(input?.base?.dir_name ?? input?.dir_name ?? column.dir_name)
    || normalizeDirName(column.dir_name)
    || slugifyName(column.name, `column-${column.id}`);
  const routePath = buildColumnNodeRoutePath({
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

  return getColumnNodeByIdInRoot(rootContext.rootColumnId, id, { includeTranslations: true });
}

export function deleteColumnNode(model, id) {
  const column = resolveColumnNodeById(model, id);
  if (!column) {
    return null;
  }

  const childCount = queryOne('SELECT COUNT(*) AS value FROM columns WHERE parent_id = ?', [column.id])?.value || 0;
  if (toInteger(childCount, 0) > 0) {
    throw new Error('请先删除或移动子分类');
  }

  deleteManualColumn(column.id);
  return mapColumnToNode(column, getModelRootColumn(model));
}

export function deleteColumnNodeInRoot(rootColumnId, id) {
  const rootContext = getRootColumnNodeContext(rootColumnId);
  const column = resolveColumnNodeByIdInRoot(rootContext.rootColumnId, id);
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
  return mapColumnToNode(column, rootContext.rootColumn);
}

function normalizeColumnNodeTranslations(input, existingTranslations, column) {
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
      seo_title: toNullableString(input?.seo_title ?? fallbackTranslation.seo_title ?? column?.seo_title),
      seo_description: toNullableString(input?.seo_description ?? fallbackTranslation.seo_description ?? column?.seo_description),
      publish_status: String(input?.publish_status ?? fallbackTranslation.publish_status ?? column?.publish_status ?? 'published') === 'draft'
        ? 'draft'
        : 'published'
    }
  };
}

function buildColumnNodeRoutePath({
  model,
  rootContext = null,
  dirName,
  parentColumn,
  currentColumnId = 0,
  columnType,
  fallbackName
}) {
  const config = rootContext || getModelColumnConfig(model);
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
