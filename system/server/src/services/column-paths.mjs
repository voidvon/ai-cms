import path from 'node:path';

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export function buildCategorySlugPath(category, categoryMap) {
  const dirNames = [];
  let current = category;

  while (current && current.dir_name) {
    dirNames.unshift(current.dir_name);
    const parentId = toInteger(current.parent_id, 0);
    if (parentId === 0) {
      break;
    }
    current = categoryMap.get(parentId);
  }

  return dirNames;
}

export function buildCategorySlugPathFromColumnIdMap(columnId, rowById) {
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

    const dirName = String(current.dir_name || '').trim();
    if (dirName) {
      segments.unshift(dirName);
    }
    currentId = toInteger(current.parent_id, 0);
  }

  return segments;
}

export function buildProductCategoryPublicUrl(category, categoryMap = null) {
  const explicitRoutePath = String(category?.route_path || '').trim();
  const id = toInteger(category?.id, 0);
  const rootCategory = resolveManagedCategoryRoot(category, categoryMap);
  const rootRoutePath = String(rootCategory?.route_path || '').trim();
  const baseRoutePath = ensureTrailingSlash(rootRoutePath || '/');

  if (explicitRoutePath) {
    return explicitRoutePath;
  }

  if (category?.dir_name && categoryMap) {
    let slugPath = buildCategorySlugPath(category, categoryMap);
    const rootDirName = String(rootCategory?.dir_name || '').trim();
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

function buildContentDetailPublicUrl({ entry, categoryPath = null, detailRule = null, sectionRoot = '/', legacyFallback = '' }) {
  const customUrl = normalizeEntryCustomUrl(entry?.custom_url);
  if (customUrl) {
    return resolveEntryCustomPublicUrl(customUrl, categoryPath, sectionRoot);
  }

  if (Array.isArray(categoryPath)) {
    categoryPath = categoryPath.join('/');
  }

  const normalizedCategoryPath = String(categoryPath || '').trim().replace(/^\/+|\/+$/g, '');
  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return `${ensureTrailingSlash(sectionRoot)}${id}.html`;
  }
  if (normalizedRule === '{id}/index.html') {
    if (normalizedCategoryPath) {
      return `${ensureTrailingSlash(sectionRoot)}${normalizedCategoryPath}/${id}/`;
    }
    return `${ensureTrailingSlash(sectionRoot)}${id}/`;
  }
  if (normalizedRule === 'detail/{id}.html') {
    return `${ensureTrailingSlash(sectionRoot)}detail/${id}.html`;
  }
  if (normalizedRule === '{id}.html' && normalizedCategoryPath) {
    return `${ensureTrailingSlash(sectionRoot)}${normalizedCategoryPath}/${id}.html`;
  }
  if (normalizedRule === '{id}/index.html' && normalizedCategoryPath) {
    return `${ensureTrailingSlash(sectionRoot)}${normalizedCategoryPath}/${id}/`;
  }
  if (normalizedRule && !normalizedRule.includes('{')) {
    if (normalizedCategoryPath) {
      return normalizePublicCustomUrl(`/${trimSlashes(sectionRoot)}/${normalizedCategoryPath}/${trimSlashes(normalizedRule)}`);
    }
    return normalizePublicCustomUrl(`/${trimSlashes(sectionRoot)}/${trimSlashes(normalizedRule)}`);
  }
  return legacyFallback || `${ensureTrailingSlash(sectionRoot)}${id}.html`;
}

/**
 * @deprecated 使用 buildContentDetailPathFromColumn(product, column, categoryPath) 代替
 * 此函数硬编码了 products 目录，不支持栏目配置驱动
 */
function buildContentDetailOutputPath({ entry, categoryPath = null, detailRule = null, sectionRoot = '', legacyFallback = '' }) {
  const customUrl = normalizeEntryCustomUrl(entry?.custom_url);
  if (customUrl) {
    return resolveEntryCustomOutputPath(customUrl, categoryPath, sectionRoot);
  }

  if (Array.isArray(categoryPath)) {
    categoryPath = categoryPath.filter(Boolean);
  } else {
    categoryPath = String(categoryPath || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return path.join(sectionRoot, `${id}.html`);
  }
  if (normalizedRule === '{id}/index.html') {
    if (categoryPath.length > 0) {
      return path.join(sectionRoot, ...categoryPath, String(id), 'index.html');
    }
    return path.join(sectionRoot, String(id), 'index.html');
  }
  if (normalizedRule === 'detail/{id}.html') {
    return path.join(sectionRoot, 'detail', `${id}.html`);
  }
  if (normalizedRule && !normalizedRule.includes('{')) {
    if (categoryPath.length > 0) {
      return path.join(sectionRoot, ...categoryPath, ...trimSlashes(normalizedRule).split('/'));
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

function ensureTrailingSlash(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '/';
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function resolveManagedCategoryRoot(category, categoryMap = null) {
  if (!category) {
    return null;
  }

  const currentId = toInteger(category?.id, 0);
  const rootColumnId = toInteger(category?.column_semantics?.root_column_id, 0);
  if (currentId > 0 && rootColumnId > 0 && currentId === rootColumnId) {
    return category;
  }

  if (categoryMap && rootColumnId > 0) {
    return categoryMap.get(rootColumnId) || null;
  }

  if (!categoryMap) {
    return null;
  }

  let current = category;
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
    current = categoryMap.get(parentId) || null;
  }

  return null;
}

function normalizeEntryCustomUrl(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function resolveEntryCustomPublicUrl(customUrl, categoryPath, sectionRoot) {
  const parentPath = buildCategoryBasePublicPath(categoryPath, sectionRoot);
  return resolveRelativePublicPath(customUrl, parentPath);
}

function resolveEntryCustomOutputPath(customUrl, categoryPath, sectionRoot) {
  const parentPath = buildCategoryBaseOutputPath(categoryPath, sectionRoot);
  return resolveRelativeOutputPath(customUrl, parentPath);
}

function buildCategoryBasePublicPath(categoryPath, sectionRoot) {
  const normalizedSectionRoot = ensureTrailingSlash(sectionRoot);
  if (Array.isArray(categoryPath)) {
    const normalizedSegments = categoryPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      const normalizedCategoryPath = normalizedSegments.join('/');
      if (trimSlashes(normalizedSectionRoot).endsWith(normalizedCategoryPath)) {
        return normalizedSectionRoot;
      }
      return `${normalizedSectionRoot}${normalizedCategoryPath}/`;
    }
  } else {
    const normalizedCategoryPath = trimSlashes(categoryPath);
    if (normalizedCategoryPath) {
      if (trimSlashes(normalizedSectionRoot).endsWith(normalizedCategoryPath)) {
        return normalizedSectionRoot;
      }
      return `${normalizedSectionRoot}${normalizedCategoryPath}/`;
    }
  }

  return normalizedSectionRoot;
}

function buildCategoryBaseOutputPath(categoryPath, sectionRoot) {
  const normalizedSectionRoot = trimSlashes(sectionRoot);
  if (Array.isArray(categoryPath)) {
    const normalizedSegments = categoryPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      const normalizedCategoryPath = normalizedSegments.join('/');
      if (normalizedSectionRoot.endsWith(normalizedCategoryPath)) {
        return normalizedSectionRoot;
      }
      return path.join(normalizedSectionRoot, ...normalizedSegments);
    }
  } else {
    const normalizedCategoryPath = trimSlashes(categoryPath);
    if (normalizedCategoryPath) {
      if (normalizedSectionRoot.endsWith(normalizedCategoryPath)) {
        return normalizedSectionRoot;
      }
      return path.join(normalizedSectionRoot, ...normalizedCategoryPath.split('/'));
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
 * @param {Array|null} categoryPath - 分类路径（可选）
 * @returns {string} 公开URL
 */
export function buildContentDetailUrlFromColumn(entry, column, categoryPath = null) {
  const sectionRoot = String(column?.route_path || '').trim() || '/';
  const detailRule = String(column?.detail_rule || '').trim();
  const entryId = toInteger(entry?.id, 0);

  return buildContentDetailPublicUrl({
    entry,
    categoryPath,
    detailRule,
    sectionRoot,
    legacyFallback: `${sectionRoot}detail/${entryId}.html`
  });
}

/**
 * 从栏目配置构建内容详情页输出路径（统一函数，替代按模型的硬编码函数）
 * @param {Object} entry - 内容条目
 * @param {Object} column - 栏目配置
 * @param {Array|null} categoryPath - 分类路径（可选）
 * @returns {string} 文件系统路径
 */
export function buildContentDetailPathFromColumn(entry, column, categoryPath = null) {
  const routePath = String(column?.route_path || '').trim() || '/';
  const sectionRoot = trimSlashes(routePath);
  const detailRule = String(column?.detail_rule || '').trim();
  const entryId = toInteger(entry?.id, 0);

  return buildContentDetailOutputPath({
    entry,
    categoryPath,
    detailRule,
    sectionRoot,
    legacyFallback: path.join(sectionRoot, 'detail', `${entryId}.html`)
  });
}
