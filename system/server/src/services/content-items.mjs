import { ensureColumnsSchema } from './columns.mjs';
import {
  createContentEntry,
  deleteContentEntry,
  getContentEntryById,
  listContentEntries,
  listContentEntriesPaged,
  resolveContentEntryComparator,
  updateContentEntry
} from './content-entries.mjs';
import { getContentModelByCode, ensureContentModelsSchema } from './content-models.mjs';
import { searchContentEntriesPaged } from './content-search.mjs';
import { ensureContentModelStorageSchema } from './content-model-storage.mjs';

let schemaEnsured = false;

export function ensureContentItemsSchema() {
  if (schemaEnsured) {
    return;
  }
  ensureColumnsSchema();
  ensureContentModelsSchema();
  ensureContentModelStorageSchema();
  schemaEnsured = true;
}

export function listContentItems(modelCode, {
  featured = false,
  visibleOnly = true,
  limit = 20,
  languageCode = null
} = {}) {
  const normalizedModelCode = requireContentModelCode(modelCode);
  return listContentEntries(normalizedModelCode, {
    featured,
    visibleOnly,
    limit,
    languageCode
  }).sort(resolveContentItemComparator(normalizedModelCode));
}

export function listContentItemsAdmin(modelCode, {
  page = 1,
  limit = 20,
  columnId = null,
  includeDescendants = false,
  languageCode = null
} = {}) {
  const normalizedModelCode = requireContentModelCode(modelCode);
  const result = listContentEntriesPaged(normalizedModelCode, {
    page,
    limit,
    columnId,
    includeDescendants,
    visibleOnly: false,
    languageCode
  });
  result.items.sort(resolveContentItemComparator(normalizedModelCode));
  return result;
}

export function getContentItemById(modelCode, id, {
  languageCode = null,
  includeTranslations = false,
  includeTranslationStatuses = false
} = {}) {
  const normalizedModelCode = requireContentModelCode(modelCode);
  return getContentEntryById(normalizedModelCode, id, {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  });
}

export function searchContentItems(modelCode, rawQuery, limit = 20, {
  languageCode = null,
  visibleOnly = true
} = {}) {
  return searchContentItemsPaged(modelCode, rawQuery, {
    page: 1,
    limit,
    languageCode,
    visibleOnly
  }).items;
}

export function searchContentItemsPaged(modelCode, rawQuery, {
  page = 1,
  limit = 20,
  languageCode = null,
  visibleOnly = true
} = {}) {
  const normalizedModelCode = requireContentModelCode(modelCode);
  return searchContentEntriesPaged(normalizedModelCode, rawQuery, {
    page,
    limit,
    languageCode,
    visibleOnly,
    sortItems: resolveContentItemComparator(normalizedModelCode)
  });
}

export function createContentItem(modelCode, input) {
  return createContentEntry(requireContentModelCode(modelCode), input);
}

export function updateContentItem(modelCode, id, input) {
  return updateContentEntry(requireContentModelCode(modelCode), id, input);
}

export function deleteContentItem(modelCode, id) {
  return deleteContentEntry(requireContentModelCode(modelCode), id);
}

function requireContentModelCode(modelCode) {
  ensureContentItemsSchema();
  const normalizedModelCode = String(modelCode || '').trim();
  if (!normalizedModelCode) {
    throw new Error('缺少内容模型编码');
  }
  if (!getContentModelByCode(normalizedModelCode)) {
    throw new Error(`内容模型 ${normalizedModelCode} 不存在`);
  }
  return normalizedModelCode;
}

function resolveContentItemComparator(modelCode) {
  return resolveContentEntryComparator(modelCode);
}
