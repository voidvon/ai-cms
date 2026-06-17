import { buildColumnTreeIndex } from './column-tree.mjs';
import { resolveRelativePublicPath } from './column-paths.mjs';

const SERVICE_SECTION_PATTERN = /(service|services|support|knowledge|learn|training|服务|知识|学习|培训)/i;
const NEWS_SECTION_PATTERN = /(news|article|articles|insight|updates|新闻|资讯|动态)/i;

export function resolveLegacyCategoryPublicId(category) {
  // 公共栏目标识统一直接使用栏目 ID
  return String(toInteger(category?.id, 0));
}

export function resolvePublicSectionContext(columns) {
  const rows = Array.isArray(columns) ? columns : [];
  const allById = new Map(rows.map((item) => [toInteger(item?.id, 0), item]));
  const newsRows = rows
    .filter((item) => (
      String(item?.column_semantics?.render_driver || '') === 'section'
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
      publicRootId: resolveLegacyCategoryPublicId(root),
      dirName,
      sectionType: SERVICE_SECTION_PATTERN.test(dirName) ? 'service' : 'news',
      sectionLabel: String(root.name || '').trim() || (SERVICE_SECTION_PATTERN.test(dirName) ? '服务' : '公司新闻'),
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
    productRootColumnId: findRootColumnId(rows, { renderDriver: 'managed_category' }),
    corporationRootColumnId: findRootColumnId(rows, { renderDriver: 'page_tree' }),
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

  const explicitRoutePath = String(column.route_path || '').trim();
  const relativeCustomUrl = String(column.custom_url || '').trim();
  const columnType = String(column.column_type || '');
  const renderDriver = String(column.column_semantics?.render_driver || '');
  if (renderDriver === 'managed_category' && toInteger(column.parent_id, 0) === 0) {
    return '/products/';
  }
  if (renderDriver === 'managed_category') {
    return '';
  }
  if (renderDriver === 'section') {
    const section = publicSections?.getNewsSectionByColumnId?.(column.id);
    if (!section) {
      return '';
    }
    if (toInteger(column.id, 0) === toInteger(section.rootColumnId, 0)) {
      return `/${section.dirName}/`;
    }
    return '';
  }
  if (renderDriver === 'page_tree' && toInteger(column.parent_id, 0) === 0) {
    return '/about/';
  }
  if (renderDriver === 'page_tree') {
    return `/about/about-${toInteger(column.id, 0)}.html`;
  }
  if (explicitRoutePath === '/contact.html') {
    return '/contact.html';
  }
  if (columnType !== 'link' && explicitRoutePath) {
    return explicitRoutePath;
  }
  if (columnType === 'link') {
    return resolveRelativePublicPath(relativeCustomUrl, resolveColumnParentPublicUrl(column, publicSections));
  }
  return '';
}

function resolveColumnParentPublicUrl(column, publicSections) {
  const parentId = toInteger(column?.parent_id, 0);
  if (parentId <= 0) {
    return '/';
  }
  const parent = publicSections?.allById?.get(parentId) || null;
  if (!parent) {
    return '/';
  }
  const parentUrl = buildColumnPublicUrl(parent, publicSections);
  return parentUrl || '/';
}

function findRootColumnId(columns, { renderDriver }) {
  return toInteger(
    columns.find((item) => (
      String(item?.column_semantics?.render_driver || '') === renderDriver
      && toInteger(item?.parent_id, 0) === 0
    ))?.id,
    0
  );
}

function resolveNewsSectionDirName(root, index, usedDirNames) {
  // 只使用数据库配置的 dir_name，不进行任何推断
  const explicitDirName = String(root?.dir_name || '').trim();
  if (explicitDirName) {
    return reserveDirName(explicitDirName, usedDirNames, root);
  }

  // 如果没有配置，抛出错误（强制要求手动配置）
  throw new Error(`栏目 ${root?.id} 缺少 dir_name 配置，请在数据库中设置`);
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
