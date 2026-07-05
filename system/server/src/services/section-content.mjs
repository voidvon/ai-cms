import { listContentEntriesPaged } from './content-entries.mjs';
import { listColumnNodesByRoot } from './column-nodes.mjs';
import { listColumns } from './columns.mjs';
import { resolvePublicSectionContext } from './public-sections.mjs';

export function buildSectionContentContext({
  languageCode = null,
  columns = null,
  publicSections = null,
  limit = 10000,
  visibleOnly = true
} = {}) {
  const resolvedColumns = Array.isArray(columns)
    ? columns
    : listColumns({ languageCode });
  const resolvedPublicSections = publicSections || resolvePublicSectionContext(resolvedColumns);
  const sectionCategories = [];
  const sectionEntries = [];
  const sectionCategoriesByRootId = new Map();
  const sectionEntriesByRootId = new Map();
  const sectionCategoryById = new Map();

  for (const section of resolvedPublicSections.sections) {
    const rootColumnId = toInteger(section?.rootColumnId, 0);
    if (rootColumnId <= 0) {
      sectionCategoriesByRootId.set(rootColumnId, []);
      sectionEntriesByRootId.set(rootColumnId, []);
      continue;
    }

    const categories = listColumnNodesByRoot(rootColumnId, { languageCode }).slice();
    const entries = listSectionEntries(section, {
      languageCode,
      limit,
      visibleOnly,
      columns: resolvedColumns,
      publicSections: resolvedPublicSections
    });

    sectionCategoriesByRootId.set(rootColumnId, categories);
    sectionEntriesByRootId.set(rootColumnId, entries);

    for (const item of categories) {
      sectionCategoryById.set(toInteger(item?.id, 0), item);
    }

    sectionCategories.push(...categories);
    sectionEntries.push(...entries);
  }

  return {
    columns: resolvedColumns,
    publicSections: resolvedPublicSections,
    sectionCategories,
    sectionEntries,
    sectionCategoriesByRootId,
    sectionEntriesByRootId,
    sectionCategoryById
  };
}

export function getSectionTopLevelCategories(sectionContentContext, section) {
  const rootColumnId = toInteger(section?.rootColumnId, 0);
  if (rootColumnId <= 0) {
    return [];
  }
  const categories = sectionContentContext?.sectionCategoriesByRootId?.get(rootColumnId) || [];
  return categories.filter((item) => (
    toInteger(item?.parent_id, 0) === 0
    && toInteger(item?.id, 0) !== rootColumnId
    && toInteger(item?.column_id, 0) !== rootColumnId
  ));
}

export function listSectionEntries(section, {
  languageCode = null,
  limit = 10000,
  visibleOnly = true,
  columns = null,
  publicSections = null
} = {}) {
  const resolvedColumns = Array.isArray(columns)
    ? columns
    : listColumns({ languageCode });
  const resolvedPublicSections = publicSections || resolvePublicSectionContext(resolvedColumns);
  const resolvedSection = normalizeSection(section, resolvedPublicSections);
  const rootColumnId = toInteger(resolvedSection?.rootColumnId, 0);
  const modelCode = resolveSectionModelCode(resolvedSection, resolvedColumns, resolvedPublicSections);

  if (rootColumnId <= 0 || !modelCode) {
    return [];
  }

  return listContentEntriesPaged(modelCode, {
    page: 1,
    limit,
    columnId: rootColumnId,
    includeDescendants: true,
    visibleOnly,
    languageCode
  }).items;
}

export function shouldRenderSectionRootAsList(section) {
  const templateData = section?.rootColumn?.template_data && typeof section.rootColumn.template_data === 'object'
    ? section.rootColumn.template_data
    : {};
  const pageKind = String(templateData.pageKind || '').trim().toLowerCase();
  if (templateData.renderFullSectionTree === true || pageKind === 'series-tree') {
    return true;
  }
  return pageKind === 'section-list-root';
}

export function resolveSectionListPageSize(section, { fallback = 6, max = 100 } = {}) {
  const configuredSize = toInteger(section?.rootColumn?.template_data?.listPageSize, 0);
  if (configuredSize > 0) {
    return Math.min(Math.max(configuredSize, 1), Math.max(toInteger(max, 100), 1));
  }
  return Math.max(toInteger(fallback, 6), 1);
}

export function resolveSectionModelCode(section, columns = null, publicSections = null) {
  const rootColumn = section?.rootColumn || null;
  const directCode = String(rootColumn?.model_code || '').trim();
  if (directCode) {
    return directCode;
  }

  const rootColumnId = toInteger(section?.rootColumnId, 0);
  if (rootColumnId <= 0) {
    return '';
  }

  const rows = Array.isArray(columns) ? columns : [];
  const resolvedPublicSections = publicSections || (rows.length > 0 ? resolvePublicSectionContext(rows) : null);
  const rootId = toInteger(section?.rootColumnId, 0);

  for (const item of rows) {
    const columnId = toInteger(item?.id, 0);
    if (columnId <= 0) {
      continue;
    }
    const matchedSection = resolvedPublicSections?.getSectionByColumnId?.(columnId);
    if (toInteger(matchedSection?.rootColumnId, 0) !== rootId) {
      continue;
    }
    const modelCode = String(item?.model_code || '').trim();
    if (modelCode) {
      return modelCode;
    }
  }

  return '';
}

function normalizeSection(section, publicSections) {
  if (section && typeof section === 'object') {
    return section;
  }

  const normalized = String(section || '').trim();
  if (!normalized) {
    return null;
  }

  return publicSections?.getSectionByDirName?.(normalized)
    || publicSections?.getSectionByType?.(normalized)
    || null;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
