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
    detailRule: product?.detail_rule,
    sectionRoot: '/products/',
    legacyFallback: `/product/${toInteger(product?.id, 0)}.html`
  });
}

export function buildNewsDetailPublicUrl(entry, options = {}) {
  const sectionDir = String(options.sectionDir || '').trim().replace(/^\/+|\/+$/g, '');
  if (!sectionDir) {
    return `/news/detail/${toInteger(entry?.id, 0)}.html`;
  }
  return buildContentDetailPublicUrl({
    entry,
    categoryPath: sectionDir,
    detailRule: options.detail_rule,
    sectionRoot: `/${sectionDir}/`,
    legacyFallback: `/${sectionDir}/detail/${toInteger(entry?.id, 0)}.html`
  });
}

function buildContentDetailPublicUrl({ entry, categoryPath = null, detailRule = null, sectionRoot = '/', legacyFallback = '' }) {
  if (Array.isArray(categoryPath)) {
    categoryPath = categoryPath.join('/');
  }

  const normalizedCategoryPath = String(categoryPath || '').trim().replace(/^\/+|\/+$/g, '');
  const slug = String(entry?.slug || '').trim();
  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return `${ensureTrailingSlash(sectionRoot)}${id}.html`;
  }
  if (normalizedRule === '{slug}.html' && slug) {
    return `${ensureTrailingSlash(sectionRoot)}${slug}.html`;
  }
  if (normalizedRule === '{slug}/index.html' && slug) {
    if (normalizedCategoryPath) {
      return `${ensureTrailingSlash(sectionRoot)}${normalizedCategoryPath}/${slug}/`;
    }
    return `${ensureTrailingSlash(sectionRoot)}${slug}/`;
  }
  return legacyFallback || `${ensureTrailingSlash(sectionRoot)}${id}.html`;
}

export function buildProductDetailOutputPath(product, categorySlugPath = null) {
  return buildContentDetailOutputPath({
    entry: product,
    categoryPath: categorySlugPath,
    detailRule: product?.detail_rule,
    sectionRoot: 'products',
    legacyFallback: path.join('product', `${toInteger(product?.id, 0)}.html`)
  });
}

export function buildNewsDetailOutputPath(entry, options = {}) {
  const sectionDir = String(options.sectionDir || '').trim().replace(/^\/+|\/+$/g, '');
  if (!sectionDir) {
    return path.join('news', 'detail', `${toInteger(entry?.id, 0)}.html`);
  }
  return buildContentDetailOutputPath({
    entry,
    categoryPath: sectionDir,
    detailRule: options.detail_rule,
    sectionRoot: sectionDir,
    legacyFallback: path.join(sectionDir, 'detail', `${toInteger(entry?.id, 0)}.html`)
  });
}

function buildContentDetailOutputPath({ entry, categoryPath = null, detailRule = null, sectionRoot = '', legacyFallback = '' }) {
  if (Array.isArray(categoryPath)) {
    categoryPath = categoryPath.filter(Boolean);
  } else {
    categoryPath = String(categoryPath || '')
      .split('/')
      .map((segment) => segment.trim())
      .filter(Boolean);
  }

  const slug = String(entry?.slug || '').trim();
  const id = toInteger(entry?.id, 0);
  const normalizedRule = String(detailRule || '').trim();

  if (normalizedRule === '{id}.html') {
    return path.join(sectionRoot, `${id}.html`);
  }
  if (normalizedRule === '{slug}.html' && slug) {
    return path.join(sectionRoot, `${slug}.html`);
  }
  if (normalizedRule === '{slug}/index.html' && slug) {
    if (categoryPath.length > 0) {
      return path.join(sectionRoot, ...categoryPath, slug, 'index.html');
    }
    return path.join(sectionRoot, slug, 'index.html');
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

function ensureTrailingSlash(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '/';
  }
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}
