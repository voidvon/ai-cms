import { buildColumnTreeIndex } from './column-tree.mjs';

const SERVICE_SECTION_PATTERN = /(service|services|support|knowledge|learn|training|服务|知识|学习|培训)/i;
const NEWS_SECTION_PATTERN = /(news|article|articles|insight|updates|新闻|资讯|动态)/i;

export function resolveLegacyCategoryPublicId(category) {
  const sourceId = toInteger(category?.source_id, 0);
  if (sourceId > 0) {
    return String(sourceId);
  }
  return String(toInteger(category?.id, 0));
}

export function resolvePublicSectionContext(columns) {
  const rows = Array.isArray(columns) ? columns : [];
  const allById = new Map(rows.map((item) => [toInteger(item?.id, 0), item]));
  const newsRows = rows
    .filter((item) => (
      String(item?.model_code || '') === 'news'
      && String(item?.source_type || '') === 'news_category'
    ))
    .slice()
    .sort(compareBySortAndId);
  const newsTree = buildColumnTreeIndex(newsRows);
  const rootSections = [];
  const usedDirNames = new Set();

  for (const root of newsRows.filter((item) => toInteger(item?.parent_id, 0) === 0)) {
    const dirName = resolveNewsSectionDirName(root, rootSections.length, usedDirNames);
    usedDirNames.add(dirName);
    rootSections.push({
      rootColumnId: toInteger(root.id, 0),
      rootSourceId: toInteger(root.source_id, 0),
      publicRootId: resolveLegacyCategoryPublicId(root),
      dirName,
      sectionType: dirName === 'service' ? 'service' : 'news',
      sectionLabel: String(root.name || '').trim() || (dirName === 'service' ? '服务' : '公司新闻'),
      rootColumn: root
    });
  }

  const sectionsByRootId = new Map(rootSections.map((item) => [item.rootColumnId, item]));
  const sectionsByDirName = new Map(rootSections.map((item) => [item.dirName, item]));

  function getNewsSectionByColumnId(columnId) {
    let currentId = toInteger(columnId, 0);
    while (currentId > 0) {
      if (sectionsByRootId.has(currentId)) {
        return sectionsByRootId.get(currentId) || null;
      }
      currentId = toInteger(newsTree.byId.get(currentId)?.parent_id, 0);
    }
    return null;
  }

  return {
    allById,
    productRootColumnId: findRootColumnId(rows, 'product', 'product_root'),
    corporationRootColumnId: findRootColumnId(rows, 'corporation', 'corporation_root'),
    newsTree,
    newsSections: rootSections,
    newsSectionsByRootId: sectionsByRootId,
    newsSectionsByDirName: sectionsByDirName,
    getNewsSectionByColumnId,
    getNewsSectionByDirName(dirName) {
      return sectionsByDirName.get(String(dirName || '').trim()) || null;
    },
    getNewsSectionByType(sectionType) {
      const normalized = String(sectionType || '').trim().toLowerCase();
      return rootSections.find((item) => item.sectionType === normalized) || null;
    }
  };
}

export function buildColumnPublicUrl(column, publicSections) {
  if (!column) {
    return '';
  }

  const sourceType = String(column.source_type || '');
  if (sourceType === 'product_root') {
    return '/products/';
  }
  if (sourceType === 'product_category') {
    const publicId = resolveLegacyCategoryPublicId(column);
    return publicId ? `/products/${publicId}.html` : '';
  }
  if (sourceType === 'news_category') {
    const section = publicSections?.getNewsSectionByColumnId?.(column.id);
    if (!section) {
      return '';
    }
    if (toInteger(column.id, 0) === toInteger(section.rootColumnId, 0)) {
      return `/${section.dirName}/`;
    }
    return `/${section.dirName}/${resolveLegacyCategoryPublicId(column)}.html`;
  }
  if (sourceType === 'corporation_root') {
    return '/about/';
  }
  if (sourceType === 'corporation_category') {
    return `/about/about-${toInteger(column.id, 0)}.html`;
  }
  if (sourceType === 'contact_page') {
    return '/contact.html';
  }
  if (sourceType === 'custom_link') {
    return String(column.custom_url || '').trim();
  }
  if (sourceType === 'single_page') {
    return String(column.route_path || '').trim();
  }
  return '';
}

function findRootColumnId(columns, modelCode, sourceType) {
  return toInteger(
    columns.find((item) => (
      String(item?.model_code || '') === modelCode
      && String(item?.source_type || '') === sourceType
    ))?.id,
    0
  );
}

function resolveNewsSectionDirName(root, index, usedDirNames) {
  const normalizedHints = collectNewsRootHints(root);
  if (normalizedHints.some((value) => SERVICE_SECTION_PATTERN.test(value))) {
    return reserveDirName('service', usedDirNames, root);
  }
  if (normalizedHints.some((value) => NEWS_SECTION_PATTERN.test(value))) {
    return reserveDirName('news', usedDirNames, root);
  }
  if (!usedDirNames.has('news')) {
    return 'news';
  }
  if (!usedDirNames.has('service') && index === 1) {
    return 'service';
  }
  return reserveDirName(`news-${resolveLegacyCategoryPublicId(root)}`, usedDirNames, root);
}

function reserveDirName(candidate, usedDirNames, root) {
  const base = sanitizeDirName(candidate) || `news-${resolveLegacyCategoryPublicId(root)}`;
  if (!usedDirNames.has(base)) {
    return base;
  }
  let suffix = 2;
  while (usedDirNames.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function collectNewsRootHints(root) {
  const hints = [
    root?.name,
    root?.slug,
    root?.route_path
  ].filter(Boolean);
  const legacyExtra = parseLegacyExtra(root?.legacy_extra);
  if (legacyExtra.key) {
    hints.push(legacyExtra.key);
  }
  if (legacyExtra.import_key) {
    hints.push(legacyExtra.import_key);
  }
  return hints.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function sanitizeDirName(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^a-z0-9/_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/\/+/g, '/');
  return normalized || '';
}

function compareBySortAndId(left, right) {
  const sortDiff = toInteger(left?.sort_order, 0) - toInteger(right?.sort_order, 0);
  if (sortDiff !== 0) {
    return sortDiff;
  }
  return toInteger(left?.id, 0) - toInteger(right?.id, 0);
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
