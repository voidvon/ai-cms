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

  if (explicitRoutePath) {
    return explicitRoutePath;
  }

  if (category?.dir_name && categoryMap) {
    const slugPath = buildCategorySlugPath(category, categoryMap);
    if (slugPath.length > 0) {
      return `/products/${slugPath.join('/')}/`;
    }
  }

  return id === 0 ? '/products/index.html' : `/products/${id}.html`;
}

export function buildProductDetailPublicUrl(product, categorySlugPath = null) {
  return buildContentDetailPublicUrl({
    entry: product,
    categoryPath: categorySlugPath,
    detailRule: product?.detail_rule || product?.column_detail_rule,
    sectionRoot: '/products/',
    legacyFallback: `/product/${toInteger(product?.id, 0)}.html`
  });
}

export function buildNewsDetailPublicUrl(entry, options = {}) {
  const sectionDir = String(options.sectionDir || '').trim().replace(/^\/+|\/+$/g, '');
  const categoryPath = options.categoryPath ?? null;
  if (!sectionDir) {
    return `/news/detail/${toInteger(entry?.id, 0)}.html`;
  }
  return buildContentDetailPublicUrl({
    entry,
    categoryPath,
    detailRule: options.detail_rule,
    sectionRoot: `/${sectionDir}/`,
    legacyFallback: `/${sectionDir}/detail/${toInteger(entry?.id, 0)}.html`
  });
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

export function buildProductDetailOutputPath(product, categorySlugPath = null) {
  return buildContentDetailOutputPath({
    entry: product,
    categoryPath: categorySlugPath,
    detailRule: product?.detail_rule || product?.column_detail_rule,
    sectionRoot: 'products',
    legacyFallback: path.join('product', `${toInteger(product?.id, 0)}.html`)
  });
}

export function buildNewsDetailOutputPath(entry, options = {}) {
  const sectionDir = String(options.sectionDir || '').trim().replace(/^\/+|\/+$/g, '');
  const categoryPath = options.categoryPath ?? null;
  if (!sectionDir) {
    return path.join('news', 'detail', `${toInteger(entry?.id, 0)}.html`);
  }
  return buildContentDetailOutputPath({
    entry,
    categoryPath,
    detailRule: options.detail_rule,
    sectionRoot: sectionDir,
    legacyFallback: path.join(sectionDir, 'detail', `${toInteger(entry?.id, 0)}.html`)
  });
}

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
  if (Array.isArray(categoryPath)) {
    const normalizedSegments = categoryPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      return `${ensureTrailingSlash(sectionRoot)}${normalizedSegments.join('/')}/`;
    }
  } else {
    const normalizedCategoryPath = trimSlashes(categoryPath);
    if (normalizedCategoryPath) {
      return `${ensureTrailingSlash(sectionRoot)}${normalizedCategoryPath}/`;
    }
  }

  return ensureTrailingSlash(sectionRoot);
}

function buildCategoryBaseOutputPath(categoryPath, sectionRoot) {
  if (Array.isArray(categoryPath)) {
    const normalizedSegments = categoryPath.map((segment) => String(segment || '').trim()).filter(Boolean);
    if (normalizedSegments.length > 0) {
      return path.join(sectionRoot, ...normalizedSegments);
    }
  } else {
    const normalizedCategoryPath = trimSlashes(categoryPath);
    if (normalizedCategoryPath) {
      return path.join(sectionRoot, ...normalizedCategoryPath.split('/'));
    }
  }

  return sectionRoot;
}

function normalizePublicCustomUrl(value) {
  const normalized = value.startsWith('/') ? value : `/${value}`;
  return normalized.replace(/\/{2,}/g, '/');
}

function normalizeOutputCustomUrl(value) {
  return value
    .replace(/^\/+/, '')
    .replace(/\/{2,}/g, '/');
}

function trimSlashes(value) {
  return String(value || '').trim().replace(/^\/+|\/+$/g, '');
}
