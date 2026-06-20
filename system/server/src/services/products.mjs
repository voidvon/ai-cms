import {
  ensureColumnsSchema
} from './columns.mjs';
import {
  createContentEntry,
  deleteContentEntry,
  getContentEntryById,
  listContentEntries,
  listContentEntriesPaged,
  updateContentEntry
} from './content-entries.mjs';
import { searchContentEntriesPaged } from './content-search.mjs';
import { ensureContentModelStorageSchema } from './content-model-storage.mjs';

let schemaEnsured = false;

export function ensureProductsSchema() {
  if (schemaEnsured) {
    return;
  }
  ensureColumnsSchema();
  ensureContentModelStorageSchema();
  schemaEnsured = true;
}

export function listProducts({ featured = false, visibleOnly = true, limit = 20, languageCode = null } = {}) {
  ensureProductsSchema();
  return listContentEntries('product', {
    featured,
    visibleOnly,
    limit,
    languageCode
  }).sort(compareBySortAndId);
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
  return listContentEntriesPaged('product', {
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
  return getContentEntryById('product', id, {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  });
}

export function searchProducts(rawQuery, limit = 20, { languageCode = null } = {}) {
  ensureProductsSchema();
  return searchProductsPaged(rawQuery, { page: 1, limit, languageCode }).items;
}

export function searchProductsPaged(rawQuery, { page = 1, limit = 20, languageCode = null } = {}) {
  ensureProductsSchema();
  return searchContentEntriesPaged('product', rawQuery, {
    page,
    limit,
    languageCode,
    visibleOnly: true,
    sortItems: compareBySortAndId
  });
}

export function createProduct(input) {
  ensureProductsSchema();
  return createContentEntry('product', input);
}

export function getNextProductSortOrder() {
  ensureProductsSchema();
  const products = listContentEntries('product', { visibleOnly: false, limit: 10000 });
  const maxValue = products.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
  return maxValue + 1;
}

export function updateProduct(id, input) {
  ensureProductsSchema();
  return updateContentEntry('product', id, input);
}

export function deleteProduct(id) {
  ensureProductsSchema();
  return deleteContentEntry('product', id);
}

function compareBySortAndId(left, right) {
  const sortDiff = Number(left?.sort_order || 0) - Number(right?.sort_order || 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}
