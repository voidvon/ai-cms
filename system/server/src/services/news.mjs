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

export function ensureNewsSchema() {
  if (schemaEnsured) {
    return;
  }
  ensureColumnsSchema();
  ensureContentModelStorageSchema();
  migrateLegacyContentNodesToModelTables('news');
  schemaEnsured = true;
}

export function listNews({ featured = false, limit = 20, languageCode = null } = {}) {
  ensureNewsSchema();
  return listContentEntries('news', {
    featured,
    visibleOnly: true,
    limit,
    languageCode
  }).sort(compareByCreatedDesc);
}

export function listNewsAdmin({
  page = 1,
  limit = 15,
  categoryId = null,
  columnId = null,
  includeDescendants = false,
  languageCode = null
} = {}) {
  ensureNewsSchema();
  const result = listContentEntriesPaged('news', {
    page,
    limit,
    columnId: columnId ?? categoryId,
    includeDescendants,
    visibleOnly: false,
    languageCode
  });
  result.items.sort(compareByCreatedDesc);
  return result;
}

export function getNewsById(id, { languageCode = null, includeTranslations = false, includeTranslationStatuses = false } = {}) {
  ensureNewsSchema();
  return getContentEntryById('news', id, {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  });
}

export function createNews(input) {
  ensureNewsSchema();
  return createContentEntry('news', input);
}

export function updateNews(id, input) {
  ensureNewsSchema();
  return updateContentEntry('news', id, input);
}

export function deleteNews(id) {
  ensureNewsSchema();
  return deleteContentEntry('news', id);
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

function compareByCreatedDesc(left, right) {
  const timeDiff = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}
