import {
  getColumnCategoryById,
  listColumnCategories,
  createColumnCategory,
  updateColumnCategory,
  deleteColumnCategory
} from './column-categories.mjs';
import { ensureColumnsSchema } from './columns.mjs';

export function ensureCorporationCategoriesSchema() {
  ensureColumnsSchema();
}

export function listCorporationCategoriesAdmin({ parentId = 0 } = {}) {
  ensureCorporationCategoriesSchema();
  return listColumnCategories('corporation').filter((item) => Number(item.parent_id || 0) === Number(parentId || 0));
}

export function listRootCorporationCategories() {
  ensureCorporationCategoriesSchema();
  return listColumnCategories('corporation').filter((item) => Number(item.parent_id || 0) === 0);
}

export function getCorporationCategoryById(id) {
  ensureCorporationCategoriesSchema();
  return getColumnCategoryById('corporation', id, { includeTranslations: true });
}

export function getNextCorporationCategorySortOrder(parentId = 0) {
  ensureCorporationCategoriesSchema();
  const items = listCorporationCategoriesAdmin({ parentId });
  const maxValue = items.reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0);
  return maxValue + 1;
}

export function createCorporationCategory(input) {
  ensureCorporationCategoriesSchema();
  return createColumnCategory('corporation', input);
}

export function updateCorporationCategory(id, input) {
  ensureCorporationCategoriesSchema();
  return updateColumnCategory('corporation', id, input);
}

export function deleteCorporationCategory(id) {
  ensureCorporationCategoriesSchema();
  return deleteColumnCategory('corporation', id);
}
