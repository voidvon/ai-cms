import {
  ensureColumnsSchema
} from './columns.mjs';
import {
  createContentEntry,
  deleteContentEntry,
  getContentEntryById,
  listContentEntries,
  listContentEntriesPaged,
  migrateLegacyContentNodesToModelTables,
  updateContentEntry
} from './content-entries.mjs';
import { ensureContentModelStorageSchema } from './content-model-storage.mjs';

let schemaEnsured = false;

export function ensureProductsSchema() {
  if (schemaEnsured) {
    return;
  }
  ensureColumnsSchema();
  ensureContentModelStorageSchema();
  migrateLegacyContentNodesToModelTables('product');
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
  const normalizedQuery = String(rawQuery ?? '').trim().toLowerCase();
  const result = listContentEntriesPaged('product', {
    page,
    limit: 10000,
    visibleOnly: true,
    languageCode
  });
  const items = normalizedQuery
    ? result.items.filter((item) => (
      String(item.name || '').toLowerCase().includes(normalizedQuery)
      || String(item.summary || '').toLowerCase().includes(normalizedQuery)
      || String(item.keywords || '').toLowerCase().includes(normalizedQuery)
      || String(item.code || '').toLowerCase().includes(normalizedQuery)
    ))
    : result.items;
  const safeLimit = clampLimit(limit);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
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
