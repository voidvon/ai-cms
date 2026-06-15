import {
  createContentColumn,
  deleteContentColumn,
  getContentColumnById,
  listContentColumns,
  listContentColumnsPaged,
  searchContentColumns,
  ensureColumnsSchema,
  updateContentColumn
} from './columns.mjs';

export function ensureProductsSchema() {
  ensureColumnsSchema();
}

export function listProducts({ featured = false, visibleOnly = true, limit = 20, languageCode = null } = {}) {
  ensureProductsSchema();
  return listContentColumns('product', { languageCode, visibleOnly })
    .filter((item) => (!featured || Number(item.is_featured_home || 0) === 1))
    .sort(compareBySortAndId)
    .slice(0, clampLimit(limit));
}

export function listProductsAdmin({
  page = 1,
  limit = 50,
  categoryId = null,
  columnId = null,
  includeDescendants = false,
  languageCode = null
} = {}) {
  ensureProductsSchema();
  return listContentColumnsPaged('product', {
    page,
    limit,
    columnId: columnId ?? categoryId,
    includeDescendants,
    visibleOnly: false,
    languageCode
  });
}

export function getProductById(id, { languageCode = null, includeTranslations = false, includeTranslationStatuses = false } = {}) {
  ensureProductsSchema();
  return getContentColumnById('product', id, {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  });
}

export function searchProducts(rawQuery, limit = 20, { languageCode = null } = {}) {
  ensureProductsSchema();
  return searchContentColumns('product', rawQuery, {
    page: 1,
    limit,
    visibleOnly: true,
    languageCode
  }).items;
}

export function searchProductsPaged(rawQuery, { page = 1, limit = 20, languageCode = null } = {}) {
  ensureProductsSchema();
  return searchContentColumns('product', rawQuery, {
    page,
    limit,
    visibleOnly: true,
    languageCode
  });
}

export function createProduct(input) {
  ensureProductsSchema();
  return createContentColumn('product', input);
}

export function getNextProductSortOrder() {
  ensureProductsSchema();
  const products = listContentColumns('product', { visibleOnly: false });
  const maxValue = products.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
  return maxValue + 1;
}

export function updateProduct(id, input) {
  ensureProductsSchema();
  return updateContentColumn('product', id, input);
}

export function deleteProduct(id) {
  ensureProductsSchema();
  return deleteContentColumn('product', id);
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

function compareBySortAndId(left, right) {
  const sortDiff = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}
