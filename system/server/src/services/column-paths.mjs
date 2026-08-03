import path from 'node:path';

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function buildColumnSlugPath(column, columnMap) {
  const dirNames = [];
  let current = column;
  const visited = new Set();

  while (current) {
    const currentId = toInteger(current.id, 0);
    if (currentId > 0 && visited.has(currentId)) {
      break;
    }
    if (currentId > 0) {
      visited.add(currentId);
    }

    const dirName = String(current.dir_name || '').trim().replace(/^\/+|\/+$/g, '');
    if (!dirName || String(current.column_type || '').trim() === 'link') {
      break;
    }
    dirNames.unshift(...dirName.split('/').filter(Boolean));
    const parentId = toInteger(current.parent_id, 0);
    if (parentId === 0) {
      break;
    }
    current = columnMap.get(parentId);
  }

  return dirNames;
}

export function buildColumnSlugPathFromColumnIdMap(columnId, rowById) {
  const safeColumnId = toInteger(columnId, 0);
  if (safeColumnId <= 0) {
    return [];
  }

  const segments = [];
  const visited = new Set();
  let currentId = safeColumnId;

  while (currentId > 0 && !visited.has(currentId)) {
    visited.add(currentId);
    const current = rowById.get(currentId);
    if (!current) {
      break;
    }

    const dirName = String(current.dir_name || '').trim().replace(/^\/+|\/+$/g, '');
    if (!dirName || String(current.column_type || '').trim() === 'link') {
      break;
    }
    segments.unshift(...dirName.split('/').filter(Boolean));
    currentId = toInteger(current.parent_id, 0);
  }

  return segments;
}

export function buildColumnPublicPath(column, columnMap = null) {
  if (!column || String(column.column_type || '').trim() === 'link') {
    return '';
  }

  const rowsById = columnMap instanceof Map ? columnMap : new Map();
  const columnId = toInteger(column.id, 0);
  if (columnId > 0) {
    rowsById.set(columnId, column);
  }
  const segments = buildColumnSlugPath(column, rowsById);
  if (segments.length === 0) {
    return '';
  }
  return normalizePublicCustomUrl(`/${segments.join('/')}/`);
}

export function buildManagedColumnPublicUrl(column, columnMap = null) {
  const calculatedPath = buildColumnPublicPath(column, columnMap);
  if (calculatedPath) {
    return calculatedPath;
  }

  const id = toInteger(column?.id, 0);
  const rootColumn = resolveManagedColumnRoot(column, columnMap);
  const rootRoutePath = String(rootColumn?.route_path || '').trim();
  const baseRoutePath = ensureTrailingSlash(rootRoutePath || '/');

  if (column?.dir_name && columnMap) {
    let slugPath = buildColumnSlugPath(column, columnMap);
    const rootDirName = String(rootColumn?.dir_name || '').trim();
    if (rootDirName && slugPath[0] === rootDirName) {
      slugPath = slugPath.slice(1);
    }
    if (slugPath.length > 0) {
      return normalizePublicCustomUrl(`${baseRoutePath}${slugPath.join('/')}/`);
    }
  }

  return id === 0
    ? normalizePublicCustomUrl(baseRoutePath)
    : normalizePublicCustomUrl(`${baseRoutePath}${id}.html`);
}

function buildContentDetailPublicUrl({ entry, columnPath = null, detailRule = null, sectionRoot = '/', legacyFallback = '' }) {
  const customUrl = normalizeEntryCustomUrl(entry?.custom_url);
  if (customUrl) {
    return resolveEntryCustomPublicUrl(customUrl, columnPath, sectionRoot);
  }

  if (Array.isArray(columnPath)) {
    columnPath = columnPath.join('/');
  }

  const normalizedColumnPath = normalizeColumnPathForSectionRoot(columnPath, sectionRoot);
  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return `${ensureTrailingSlash(sectionRoot)}${id}.html`;
  }
  if (normalizedRule === '{id}/index.html') {
    if (normalizedColumnPath) {
      return `${ensureTrailingSlash(sectionRoot)}${normalizedColumnPath}/${id}/`;
    }
    return `${ensureTrailingSlash(sectionRoot)}${id}/`;
  }
  if (normalizedRule === 'detail/{id}.html') {
    return `${ensureTrailingSlash(sectionRoot)}detail/${id}.html`;
  }
  if (normalizedRule === '{id}.html' && normalizedColumnPath) {
    return `${ensureTrailingSlash(sectionRoot)}${normalizedColumnPath}/${id}.html`;
  }
  if (normalizedRule === '{id}/index.html' && normalizedColumnPath) {
    return `${ensureTrailingSlash(sectionRoot)}${normalizedColumnPath}/${id}/`;
  }
  if (normalizedRule && !normalizedRule.includes('{')) {
    if (normalizedColumnPath) {
      return normalizePublicCustomUrl(`/${trimSlashes(sectionRoot)}/${normalizedColumnPath}/${trimSlashes(normalizedRule)}`);
    }
    return normalizePublicCustomUrl(`/${trimSlashes(sectionRoot)}/${trimSlashes(normalizedRule)}`);
  }
  return legacyFallback || `${ensureTrailingSlash(sectionRoot)}${id}.html`;
}

/**
 * @deprecated 使用 buildContentDetailPathFromColumn(product, column, columnPath) 代替
 * 此函数硬编码了 products 目录，不支持栏目配置驱动
 */
function buildContentDetailOutputPath({ entry, columnPath = null, detailRule = null, sectionRoot = '', legacyFallback = '' }) {
  const customUrl = normalizeEntryCustomUrl(entry?.custom_url);
  if (customUrl) {
    return resolveEntryCustomOutputPath(customUrl, columnPath, sectionRoot);
  }

  columnPath = normalizeColumnPathForSectionRoot(columnPath, sectionRoot)
    .split('/')
    .filter(Boolean);

  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return path.join(sectionRoot, `${id}.html`);
  }
  if (normalizedRule === '{id}/index.html') {
    if (columnPath.length > 0) {
      return path.join(sectionRoot, ...columnPath, String(id), 'index.html');
    }
    return path.join(sectionRoot, String(id), 'index.html');
  }
  if (normalizedRule === 'detail/{id}.html') {
    return path.join(sectionRoot, 'detail', `${id}.html`);
  }
  if (normalizedRule && !normalizedRule.includes('{')) {
    if (columnPath.length > 0) {
      return path.join(sectionRoot, ...columnPath, ...trimSlashes(normalizedRule).split('/'));
    }
    return path.join(sectionRoot, ...trimSlashes(normalizedRule).split('/'));
  }
  return legacyFallback || path.join(sectionRoot, `${id}.html`);
}

export function resolveColumnRouteOutputPath(routePath) {
  const rawValue = String(routePath || '').trim();
  const normalized = rawValue.replace(/^\/+/, '');

  if (!normalized) {
    return 'index.html';
  }
  if (rawValue.endsWith('/')) {
    return path.join(normalized, 'index.html');
  }
  return normalized;
}

export function resolveColumnPageOutputPath(column, columnMap = null, pageNumber = 1) {
  const publicUrl = buildManagedColumnPublicUrl(column, columnMap);
  return resolvePublicPageOutputPath(publicUrl, pageNumber);
}

export function resolvePublicPageOutputPath(publicUrl, pageNumber = 1) {
  const outputPath = resolveColumnRouteOutputPath(publicUrl);
  const normalizedPageNumber = Math.max(1, toInteger(pageNumber, 1));
  if (normalizedPageNumber === 1) {
    return outputPath;
  }

  const extension = path.extname(outputPath);
  if (!extension) {
    return path.join(outputPath, `index-${normalizedPageNumber}.html`);
  }

  const directory = path.dirname(outputPath);
  const filename = path.basename(outputPath, extension);
  return path.join(directory, `${filename}-${normalizedPageNumber}${extension}`);
}

export function resolveRelativePublicPath(value, parentPath = '/') {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }
  if (normalizedValue.startsWith('/')) {
    return normalizePublicCustomUrl(normalizedValue);
  }

  const basePath = ensureTrailingSlash(parentPath || '/');
  return normalizePublicCustomUrl(`${basePath}${normalizedValue}`);
}

export function resolveRelativeOutputPath(value, parentPath = '') {
  const normalizedValue = String(value || '').trim();
  if (!normalizedValue) {
    return '';
  }
  if (normalizedValue.startsWith('/')) {
    return normalizeOutputCustomUrl(normalizedValue);
  }

  const parentSegments = trimSlashes(parentPath).split('/').filter(Boolean);
  const childSegments = normalizedValue.split('/').map((segment) => segment.trim()).filter(Boolean);
  return normalizeOutputCustomUrl(path.join(...parentSegments, ...childSegments));
}

export function buildRelativeCategoryPathFromRoutePath(routePath, sectionRoot = '/') {
  const normalizedRoutePath = String(routePath || '').trim();
  const normalizedSectionRoot = ensureTrailingSlash(sectionRoot || '/');
  if (!normalizedRoutePath) {
    return '';
  }
  if (!normalizedRoutePath.startsWith(normalizedSectionRoot)) {
    return '';
  }

  const remainder = normalizedRoutePath.slice(normalizedSectionRoot.length).replace(/^\/+|\/+$/g, '');
  return remainder || '';
}

function normalizeColumnPathForSectionRoot(columnPath, sectionRoot) {
  const normalizedColumnPath = trimSlashes(
    Array.isArray(columnPath)
      ? columnPath.map((segment) => String(segment || '').trim()).filter(Boolean).join('/')
      : columnPath
  );
  if (!normalizedColumnPath) {
    return '';
  }

  const normalizedSectionRoot = trimSlashes(sectionRoot);
  if (
    normalizedSectionRoot === normalizedColumnPath
    || normalizedSectionRoot.endsWith(`/${normalizedColumnPath}`)
  ) {
    return '';
  }
  return normalizedColumnPath;
}

function ensureTrailingSlash(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '/';
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function resolveManagedColumnRoot(columnNode, columnMap = null) {
  if (!columnNode) {
    return null;
  }

  const currentId = toInteger(columnNode?.id, 0);
  const rootColumnId = toInteger(columnNode?.column_semantics?.root_column_id, 0);
  if (currentId > 0 && rootColumnId > 0 && currentId === rootColumnId) {
    return columnNode;
  }

  if (columnMap && rootColumnId > 0) {
    return columnMap.get(rootColumnId) || null;
  }

  if (!columnMap) {
    return null;
  }

  let current = columnNode;
  const visited = new Set();
  while (current) {
    const id = toInteger(current?.id, 0);
    if (visited.has(id)) {
      break;
    }
    visited.add(id);
    const parentId = toInteger(current?.parent_id, 0);
    if (parentId <= 0) {
      return current;
    }
    current = columnMap.get(parentId) || null;
  }

  return null;
}

function normalizeEntryCustomUrl(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveEntryCustomPublicUrl(customUrl, columnPath, sectionRoot) {
  const parentPath = buildColumnBasePublicPath(columnPath, sectionRoot);
  return resolveRelativePublicPath(customUrl, parentPath);
}

function resolveEntryCustomOutputPath(customUrl, columnPath, sectionRoot) {
  const parentPath = buildColumnBaseOutputPath(columnPath, sectionRoot);
  return resolveRelativeOutputPath(customUrl, parentPath);
}

function buildColumnBasePublicPath(columnPath, sectionRoot) {
  const normalizedSectionRoot = ensureTrailingSlash(sectionRoot);
  if (Array.isArray(columnPath)) {
    const normalizedSegments = columnPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      const normalizedColumnPath = normalizedSegments.join('/');
      if (trimSlashes(normalizedSectionRoot).endsWith(normalizedColumnPath)) {
        return normalizedSectionRoot;
      }
      return `${normalizedSectionRoot}${normalizedColumnPath}/`;
    }
  } else {
    const normalizedColumnPath = trimSlashes(columnPath);
    if (normalizedColumnPath) {
      if (trimSlashes(normalizedSectionRoot).endsWith(normalizedColumnPath)) {
        return normalizedSectionRoot;
      }
      return `${normalizedSectionRoot}${normalizedColumnPath}/`;
    }
  }

  return normalizedSectionRoot;
}

function buildColumnBaseOutputPath(columnPath, sectionRoot) {
  const normalizedSectionRoot = trimSlashes(sectionRoot);
  if (Array.isArray(columnPath)) {
    const normalizedSegments = columnPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      const normalizedColumnPath = normalizedSegments.join('/');
      if (normalizedSectionRoot.endsWith(normalizedColumnPath)) {
        return normalizedSectionRoot;
      }
      return path.join(normalizedSectionRoot, ...normalizedSegments);
    }
  } else {
    const normalizedColumnPath = trimSlashes(columnPath);
    if (normalizedColumnPath) {
      if (normalizedSectionRoot.endsWith(normalizedColumnPath)) {
        return normalizedSectionRoot;
      }
      return path.join(normalizedSectionRoot, ...normalizedColumnPath.split('/'));
    }
  }

  return normalizedSectionRoot;
}

function normalizePublicCustomUrl(value) {
  const normalized = value.startsWith('/') ? value : `/${value}`;
  const collapsed = normalized.replace(/\/{2,}/g, '/');
  if (/\/index\.html$/i.test(collapsed)) {
    return collapsed.replace(/\/index\.html$/i, '/');
  }
  return collapsed;
}

function normalizeOutputCustomUrl(value) {
  return value
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function trimSlashes(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 从栏目配置构建内容详情页公开URL（统一函数，替代按模型的硬编码函数）
 * @param {Object} entry - 内容条目（包含 id, custom_url 等）
 * @param {Object} column - 栏目配置（包含 route_path, detail_rule 等）
 * @param {Array|null} columnPath - 分类路径（可选）
 * @returns {string} 公开URL
 */
export function buildContentDetailUrlFromColumn(entry, column, columnPath = null) {
  const sectionRoot = String(column?.route_path || '').trim() || '/';
  const detailRule = String(column?.detail_rule || '').trim();
  const entryId = toInteger(entry?.id, 0);

  return buildContentDetailPublicUrl({
    entry,
    columnPath,
    detailRule,
    sectionRoot,
    legacyFallback: `${sectionRoot}detail/${entryId}.html`
  });
}

/**
 * 从栏目配置构建内容详情页输出路径（统一函数，替代按模型的硬编码函数）
 * @param {Object} entry - 内容条目
 * @param {Object} column - 栏目配置
 * @param {Array|null} columnPath - 分类路径（可选）
 * @returns {string} 文件系统路径
 */
export function buildContentDetailPathFromColumn(entry, column, columnPath = null) {
  const routePath = String(column?.route_path || '').trim() || '/';
  const sectionRoot = trimSlashes(routePath);
  const detailRule = String(column?.detail_rule || '').trim();
  const entryId = toInteger(entry?.id, 0);

  return buildContentDetailOutputPath({
    entry,
    columnPath,
    detailRule,
    sectionRoot,
    legacyFallback: path.join(sectionRoot, 'detail', `${entryId}.html`)
  });
}
