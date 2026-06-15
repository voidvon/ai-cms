import {
  createContentColumn,
  deleteContentColumn,
  getContentColumnById,
  listContentColumns,
  listContentColumnsPaged,
  ensureColumnsSchema,
  updateContentColumn
} from './columns.mjs';

export function ensureNewsSchema() {
  ensureColumnsSchema();
}

export function listNews({ featured = false, limit = 20, languageCode = null } = {}) {
  ensureNewsSchema();
  return listContentColumns('news', { languageCode, visibleOnly: true })
    .filter((item) => (!featured || Number(item.is_featured_home || 0) === 1))
    .sort(compareByCreatedDesc)
    .slice(0, clampLimit(limit));
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
  const result = listContentColumnsPaged('news', {
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
  return getContentColumnById('news', id, {
    languageCode,
    includeTranslations,
    includeTranslationStatuses
  });
}

export function createNews(input) {
  ensureNewsSchema();
  return createContentColumn('news', input);
}

export function updateNews(id, input) {
  ensureNewsSchema();
  return updateContentColumn('news', id, input);
}

export function deleteNews(id) {
  ensureNewsSchema();
  return deleteContentColumn('news', id);
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
