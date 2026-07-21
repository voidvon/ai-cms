import { listSearchableFieldNames } from './content-model-fields.mjs';
import {
  listContentEntriesPaged,
  resolveContentEntryCoverImage,
  resolveContentEntryDisplayName
} from './content-entries.mjs';
import { ensureContentModelStorageSchema } from './content-model-storage.mjs';
import { listContentModels } from './content-models.mjs';
import { listColumns } from './columns.mjs';
import { buildColumnSlugPath, buildContentDetailUrlFromColumn } from './column-paths.mjs';
import { resolvePublicSectionContext } from './public-sections.mjs';

export function searchContentEntriesPaged(modelCode, rawQuery, {
  page = 1,
  limit = 20,
  languageCode = null,
  visibleOnly = true,
  sortItems = null
} = {}) {
  ensureContentModelStorageSchema();
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const searchableFields = listSearchableFieldNames(modelCode);
  const result = listContentEntriesPaged(modelCode, {
    page,
    limit: 10000,
    visibleOnly,
    languageCode
  });

  const scoredItems = normalizedQuery
    ? result.items
      .map((item) => scoreSearchItem(modelCode, item, searchableFields, normalizedQuery))
      .filter((item) => item.score > 0)
    : result.items.map((item) => ({ item, score: 0, excerpt: String(item.summary || '').trim() }));

  const items = (typeof sortItems === 'function'
    ? [...scoredItems].sort((left, right) => {
      const scoreDiff = Number(right.score || 0) - Number(left.score || 0);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return sortItems(left.item, right.item);
    })
    : scoredItems
  ).map((entry) => ({
    ...entry.item,
    search_excerpt: entry.excerpt,
    search_score: entry.score
  }));
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

export function searchAllContentPaged(rawQuery, {
  page = 1,
  limit = 20,
  languageCode = null,
  models = null
} = {}) {
  ensureContentModelStorageSchema();
  const normalizedQuery = normalizeSearchQuery(rawQuery);
  const modelList = normalizeSearchModelCodes(models);
  const columns = listColumns({ languageCode, includeTranslations: true });
  const columnMap = new Map(columns.map((item) => [Number(item.id || 0), item]));
  const publicSections = resolvePublicSectionContext(columns);

  const resultItems = [];
  for (const modelCode of modelList) {
    const result = searchContentEntriesPaged(modelCode, rawQuery, {
      page: 1,
      limit: 10000,
      languageCode,
      visibleOnly: true
    });
    for (const item of result.items) {
      resultItems.push({
        model_code: modelCode,
        entry_id: Number(item.id || 0),
        language_code: item.current_language_code || languageCode || null,
        requested_language_code: item.requested_language_code || languageCode || null,
        resolved_language_code: item.resolved_language_code || item.current_language_code || languageCode || null,
        fallback_language_code: item.fallback_language_code || null,
        is_language_fallback: Boolean(item.is_language_fallback),
        title: resolveResultTitle(modelCode, item),
        summary: String(item.summary || '').trim(),
        excerpt: String(item.search_excerpt || item.summary || '').trim(),
        score: Number(item.search_score || 0),
        url: buildSearchResultUrl(item, { columnMap, publicSections }),
        cover_image: resolveResultCoverImage(item),
        column_name: item.column_name || '',
        created_at: item.created_at || '',
        updated_at: item.updated_at || ''
      });
    }
  }

  resultItems.sort(compareSearchResultItems);
  const safeLimit = clampLimit(limit);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  return {
    items: resultItems.slice(offset, offset + safeLimit),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: resultItems.length,
      totalPages: Math.max(Math.ceil(resultItems.length / safeLimit), 1)
    }
  };
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

export function listSearchableModelCodes() {
  ensureContentModelStorageSchema();
  return listContentModels()
    .map((item) => String(item?.code || '').trim())
    .filter(Boolean)
    .filter((modelCode) => listSearchableFieldNames(modelCode).length > 0);
}

export function normalizeSearchModelCodes(models) {
  const allowedModelCodes = new Set(listSearchableModelCodes());
  const requestedModelCodes = Array.isArray(models) ? models : [models];
  const normalizedModelCodes = Array.from(new Set(
    requestedModelCodes
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .filter((item) => allowedModelCodes.has(item))
  ));

  return normalizedModelCodes.length > 0
    ? normalizedModelCodes
    : Array.from(allowedModelCodes);
}

function resolveResultTitle(modelCode, item) {
  return resolveContentEntryDisplayName(item);
}

function resolveResultCoverImage(item) {
  return resolveContentEntryCoverImage(item);
}

function buildSearchResultUrl(item, context) {
  const column = context.columnMap.get(Number(item.column_id || 0));
  if (!column) {
    return '/';
  }
  const section = context.publicSections.getSectionByColumnId(Number(item.column_id || 0));
  if (section?.rootColumn) {
    return buildContentDetailUrlFromColumn(item, section.rootColumn);
  }
  const columnPath = buildColumnSlugPath(column, context.columnMap);
  if (columnPath && columnPath.length > 0) {
    return buildContentDetailUrlFromColumn(item, column, columnPath);
  }
  if (column.route_path) {
    return buildContentDetailUrlFromColumn(item, column);
  }
  return '/';
}

function compareSearchResultItems(left, right) {
  const scoreDiff = Number(right?.score || 0) - Number(left?.score || 0);
  if (scoreDiff !== 0) {
    return scoreDiff;
  }
  const updatedDiff = String(right?.updated_at || '').localeCompare(String(left?.updated_at || ''));
  if (updatedDiff !== 0) {
    return updatedDiff;
  }
  const createdDiff = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
  if (createdDiff !== 0) {
    return createdDiff;
  }
  return Number(right?.entry_id || 0) - Number(left?.entry_id || 0);
}

function normalizeSearchQuery(rawQuery) {
  return String(rawQuery ?? '').trim().toLowerCase();
}

function scoreSearchItem(modelCode, item, searchableFields, normalizedQuery) {
  let score = 0;
  let bestExcerpt = '';
  const title = resolveResultTitle(modelCode, item);
  const weightedFields = buildWeightedSearchFields(item, title);

  for (const field of weightedFields) {
    if (!searchableFields.includes(field.name)) {
      continue;
    }
    const rawValue = String(field.value || '').trim();
    if (!rawValue) {
      continue;
    }
    const normalizedValue = rawValue.toLowerCase();
    const index = normalizedValue.indexOf(normalizedQuery);
    if (index === -1) {
      continue;
    }

    score += resolveFieldScore(field.name, normalizedValue, normalizedQuery, index);

    if (!bestExcerpt || field.name === 'content_html' || field.name === 'summary') {
      bestExcerpt = buildSearchExcerpt(rawValue, normalizedQuery, index);
    }
  }

  return {
    item,
    score,
    excerpt: bestExcerpt || String(item.summary || '').trim() || title
  };
}

function buildWeightedSearchFields(item, title) {
  const fields = [
    { name: 'name', value: title },
    { name: 'summary', value: item.summary },
    { name: 'content_html', value: stripHtml(item.content_html) },
    { name: 'seo_title', value: item.seo_title },
    { name: 'seo_description', value: item.seo_description },
    { name: 'code', value: item.code },
    { name: 'column_name', value: item.column_name }
  ];
  return fields;
}

function resolveFieldScore(fieldName, normalizedValue, normalizedQuery, index) {
  const exactMatch = normalizedValue === normalizedQuery;
  const startsWith = normalizedValue.startsWith(normalizedQuery);
  const weight = getFieldWeight(fieldName);

  if (exactMatch) {
    return weight + 120;
  }
  if (startsWith) {
    return weight + 60;
  }
  if (index >= 0) {
    return Math.max(weight - Math.min(index, 40), 1);
  }
  return 0;
}

function getFieldWeight(fieldName) {
  if (fieldName === 'code') return 260;
  if (fieldName === 'name' || fieldName === 'title') return 220;
  if (fieldName === 'summary') return 120;
  if (fieldName === 'column_name') return 80;
  if (fieldName === 'seo_title') return 70;
  if (fieldName === 'seo_description') return 50;
  if (fieldName === 'content_html') return 40;
  return 10;
}

function buildSearchExcerpt(rawValue, normalizedQuery, matchedIndex = -1) {
  const plainText = stripHtml(rawValue).replace(/\s+/g, ' ').trim();
  if (!plainText) {
    return '';
  }
  const normalizedText = plainText.toLowerCase();
  const index = matchedIndex >= 0 ? matchedIndex : normalizedText.indexOf(normalizedQuery);
  if (index < 0) {
    return plainText.slice(0, 120);
  }

  const start = Math.max(index - 40, 0);
  const end = Math.min(index + normalizedQuery.length + 60, plainText.length);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < plainText.length ? '...' : '';
  return prefix + plainText.slice(start, end).trim() + suffix;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
