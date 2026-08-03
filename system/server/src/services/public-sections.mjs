import { buildColumnTreeIndex } from './column-tree.mjs';
import { buildColumnPublicPath, resolveRelativePublicPath } from './column-paths.mjs';

const SERVICE_SECTION_PATTERN = /(service|services|support|knowledge|learn|training|服务|知识|学习|培训)/i;
const NON_PUBLIC_SECTION_MODEL_CODES = new Set(['multidimensional_table']);

export function resolveLegacyColumnPublicId(columnNode) {
  // 公共栏目标识统一直接使用栏目 ID
  return String(toInteger(columnNode?.id, 0));
}

export function resolvePublicSectionContext(columns) {
  const rows = filterPublicSectionColumns(Array.isArray(columns) ? columns : []);
  const allById = new Map(rows.map((item) => [toInteger(item?.id, 0), item]));
  const sectionRows = rows
    .filter((item) => (
      String(item?.column_semantics?.render_driver || '') === 'section'
    ))
    .slice()
    .sort(compareBySortAndId);
  const sectionTree = buildColumnTreeIndex(sectionRows);
  const rootSections = [];
  const usedDirNames = new Set();

  for (const root of sectionRows.filter((item) => toInteger(item?.parent_id, 0) === 0)) {
    const dirName = resolveSectionDirName(root, rootSections.length, usedDirNames);
    usedDirNames.add(dirName);
    rootSections.push({
      rootColumnId: toInteger(root.id, 0),
      publicRootId: resolveLegacyColumnPublicId(root),
      dirName,
      sectionType: SERVICE_SECTION_PATTERN.test(dirName) ? 'service' : 'news',
      sectionLabel: String(root.name || '').trim() || (SERVICE_SECTION_PATTERN.test(dirName) ? '服务' : '公司新闻'),
      rootColumn: root
    });
  }

  const sectionsByRootId = new Map(rootSections.map((item) => [item.rootColumnId, item]));
  const sectionsByDirName = new Map(rootSections.map((item) => [item.dirName, item]));

  function getSectionByColumnId(columnId) {
    let currentId = toInteger(columnId, 0);
    while (currentId > 0) {
      if (sectionsByRootId.has(currentId)) {
        return sectionsByRootId.get(currentId) || null;
      }
      currentId = toInteger(sectionTree.byId.get(currentId)?.parent_id, 0);
    }
    return null;
  }

  return {
    allById,
    managedRootColumnId: findRootColumnId(rows, { renderDriver: 'managed_column' }),
    corporationRootColumnId: findRootColumnId(rows, { renderDriver: 'page_tree' }),
    sectionTree,
    sections: rootSections,
    sectionsByRootId,
    sectionsByDirName,
    getSectionByColumnId,
    getSectionByDirName(dirName) {
      return sectionsByDirName.get(String(dirName || '').trim()) || null;
    },
    getSectionByType(sectionType) {
      const normalized = String(sectionType || '').trim().toLowerCase();
      return rootSections.find((item) => item.sectionType === normalized) || null;
    }
  };
}

export function filterPublicSectionColumns(columns) {
  return (Array.isArray(columns) ? columns : []).filter((column) => (
    !NON_PUBLIC_SECTION_MODEL_CODES.has(String(column?.model_code || '').trim())
  ));
}

export function buildColumnPublicUrl(column, publicSections) {
  if (!column) {
    return '';
  }

  const relativeCustomUrl = String(column.custom_url || '').trim();
  const columnType = String(column.column_type || '');
  if (columnType === 'link') {
    if (!relativeCustomUrl && toInteger(column.parent_id, 0) <= 0) {
      return '/';
    }
    return resolveRelativePublicPath(relativeCustomUrl, resolveColumnParentPublicUrl(column, publicSections));
  }
  const rowsById = publicSections instanceof Map ? publicSections : publicSections?.allById;
  return column.public_path || buildColumnPublicPath(column, rowsById);
}

export function buildSectionColumnPublicUrl(section, columnNode) {
  const dirName = String(section?.dirName || '').trim().replace(/^\/+|\/+$/g, '');
  if (!dirName || !columnNode) {
    return '';
  }

  return columnNode.public_path || columnNode.route_path || `/${dirName}/`;
}

function resolveColumnParentPublicUrl(column, publicSections) {
  const parentId = toInteger(column?.parent_id, 0);
  if (parentId <= 0) {
    return '/';
  }
  const rowsById = publicSections instanceof Map ? publicSections : publicSections?.allById;
  const parent = rowsById?.get(parentId) || null;
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

function resolveSectionDirName(root, index, usedDirNames) {
  // 只使用数据库配置的 dir_name，不进行任何推断
  const explicitDirName = String(root?.dir_name || '').trim();
  if (explicitDirName) {
    return reserveDirName(explicitDirName, usedDirNames, root);
  }

  // 如果没有配置，抛出错误（强制要求手动配置）
  throw new Error(`栏目 ${root?.id} 缺少 dir_name 配置，请在数据库中设置`);
}

function reserveDirName(candidate, usedDirNames, root) {
  const base = sanitizeDirName(candidate) || `section-${resolveLegacyColumnPublicId(root)}`;
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
