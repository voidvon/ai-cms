import fs from 'node:fs';
import path from 'node:path';
import { queryAll } from '../db.mjs';
import { getSiteConfig } from './site.mjs';
import { listColumns } from './columns.mjs';
import { listNewsCategories } from './news-categories.mjs';
import { listProductCategories } from './product-categories.mjs';
import { escapeHtml } from '../utils/html.mjs';

const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;
const CORPORATION_ROOT_ID = 32;
const NEWS_ROOT_ID = 4;
const SERVICE_ROOT_ID = 12;

export function buildSitemap({ outputRoot, generatedAt = new Date().toISOString() }) {
  const site = getSiteConfig();
  const siteUrl = normalizeSiteUrl(site.web_url);

  if (!siteUrl) {
    return {
      key: 'sitemap',
      label: '站点地图',
      recordsProcessed: 0,
      filesWritten: 0,
      skipped: true,
      message: '网站地址未配置，已跳过 sitemap.xml 生成'
    };
  }

  const urls = collectSitemapEntries({ siteUrl, generatedAt });
  const xml = renderSitemapXml(urls);
  const filePath = path.resolve(outputRoot, 'sitemap.xml');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, xml, 'utf8');

  return {
    key: 'sitemap',
    label: '站点地图',
    recordsProcessed: urls.length,
    filesWritten: 1
  };
}

function collectSitemapEntries({ siteUrl, generatedAt }) {
  const entries = new Map();
  const columns = listColumns();
  const productCategories = listProductCategories();
  const newsCategories = listNewsCategories();
  const products = queryAll(`
    SELECT id, category_id, is_visible
    FROM products
    WHERE is_visible = 1
    ORDER BY sort_order ASC, id DESC
  `);
  const newsItems = queryAll(`
    SELECT id, category_id, created_at
    FROM news
    ORDER BY coalesce(created_at, '') DESC, id DESC
  `);
  const corporationCategories = queryAll(`
    SELECT id, parent_id, is_external
    FROM corporation_categories
    WHERE coalesce(is_external, 0) = 0
    ORDER BY parent_id ASC, sort_order ASC, id ASC
  `);
  const productCountByCategory = buildDescendantProductCountMap(productCategories, products);
  const newsCountByCategory = buildCountMap(newsItems, (item) => toInteger(item.category_id, 0));
  const latestNewsDateByCategory = buildLatestDateMap(newsItems, (item) => toInteger(item.category_id, 0), generatedAt);
  const corporationIndexId = corporationCategories.find((item) => toInteger(item.parent_id, 0) === CORPORATION_ROOT_ID)?.id
    ?? corporationCategories[0]?.id
    ?? null;

  addEntry(entries, siteUrl, '/', generatedAt);
  addEntry(entries, siteUrl, '/index.html', generatedAt);
  addEntry(entries, siteUrl, '/contact.html', generatedAt);
  addEntry(entries, siteUrl, '/msg.html', generatedAt);

  for (const column of columns) {
    const routePath = String(column.route_path || '').trim();
    if (
      String(column.source_type || '') === 'single_page'
      && String(column.column_kind || '') === 'single'
      && routePath
    ) {
      addEntry(entries, siteUrl, normalizeRoutePathForPublic(routePath), column.updated_at || generatedAt);
    }
  }

  if (corporationIndexId != null) {
    addEntry(entries, siteUrl, '/about/index.html', generatedAt);
  }
  for (const item of corporationCategories) {
    const id = toInteger(item.id, 0);
    if (id > 0) {
      addEntry(entries, siteUrl, `/about/about-${id}.html`, generatedAt);
    }
  }

  addSectionEntries({
    entries,
    siteUrl,
    categories: newsCategories.filter((item) => toInteger(item.parent_id, 0) === NEWS_ROOT_ID),
    itemsPerPage: NEWS_LIST_PAGE_SIZE,
    sectionDir: 'news',
    getItemCount: (categoryId) => newsCountByCategory.get(categoryId) || 0,
    getLastmod: (categoryId) => latestNewsDateByCategory.get(categoryId) || generatedAt
  });

  addSectionEntries({
    entries,
    siteUrl,
    categories: newsCategories.filter((item) => toInteger(item.parent_id, 0) === SERVICE_ROOT_ID),
    itemsPerPage: NEWS_LIST_PAGE_SIZE,
    sectionDir: 'service',
    getItemCount: (categoryId) => newsCountByCategory.get(categoryId) || 0,
    getLastmod: (categoryId) => latestNewsDateByCategory.get(categoryId) || generatedAt
  });

  for (const item of newsItems) {
    const categoryId = toInteger(item.category_id, 0);
    const parentId = getNewsCategoryParentId(newsCategories, categoryId);
    if (parentId === NEWS_ROOT_ID) {
      addEntry(entries, siteUrl, `/news/detail/${item.id}.html`, item.created_at || generatedAt);
    }
    if (parentId === SERVICE_ROOT_ID) {
      addEntry(entries, siteUrl, `/service/detail/${item.id}.html`, item.created_at || generatedAt);
    }
  }

  addEntry(entries, siteUrl, '/valve/index.html', generatedAt);
  for (const category of productCategories) {
    const categoryId = toInteger(category.id, 0);
    if (categoryId <= 0) {
      continue;
    }
    const total = productCountByCategory.get(categoryId) || 0;
    const pageCount = Math.max(Math.ceil(total / PRODUCT_LIST_PAGE_SIZE), 1);
    addEntry(entries, siteUrl, `/valve/${categoryId}.html`, generatedAt);
    addEntry(entries, siteUrl, `/valve/${categoryId}-1.html`, generatedAt);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      addEntry(entries, siteUrl, `/valve/${categoryId}-${pageNumber}.html`, generatedAt);
    }
  }

  for (const product of products) {
    addEntry(entries, siteUrl, `/product/${product.id}.html`, generatedAt);
  }

  return Array.from(entries.values());
}

function addSectionEntries({
  entries,
  siteUrl,
  categories,
  itemsPerPage,
  sectionDir,
  getItemCount,
  getLastmod
}) {
  if (categories.length > 0) {
    addEntry(entries, siteUrl, `/${sectionDir}/index.html`, getLastmod(toInteger(categories[0].id, 0)));
  }

  for (const [index, category] of categories.entries()) {
    const categoryId = toInteger(category.id, 0);
    const total = getItemCount(categoryId);
    const pageCount = Math.max(Math.ceil(total / itemsPerPage), 1);
    const lastmod = getLastmod(categoryId);

    addEntry(entries, siteUrl, `/${sectionDir}/${categoryId}.html`, lastmod);
    addEntry(entries, siteUrl, `/${sectionDir}/${categoryId}-1.html`, lastmod);
    if (index === 0) {
      addEntry(entries, siteUrl, `/${sectionDir}/`, lastmod);
    }

    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      addEntry(entries, siteUrl, `/${sectionDir}/${categoryId}-${pageNumber}.html`, lastmod);
    }
  }
}

function addEntry(entries, siteUrl, publicPath, lastmod) {
  const normalizedPath = normalizePublicPath(publicPath);
  const key = normalizedPath.toLowerCase();
  if (!key) {
    return;
  }

  entries.set(key, {
    loc: `${siteUrl}${normalizedPath}`,
    lastmod: toSitemapDate(lastmod)
  });
}

function normalizeSiteUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizePublicPath(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function normalizeRoutePathForPublic(routePath) {
  const normalized = String(routePath || '').trim();
  if (!normalized) {
    return '/';
  }
  if (normalized === '/') {
    return '/';
  }
  if (normalized.endsWith('/')) {
    return normalized;
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function toSitemapDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
}

function buildDescendantProductCountMap(categories, products) {
  const childrenByParent = new Map();
  for (const category of categories) {
    const parentId = toInteger(category.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(category);
  }

  const directCount = buildCountMap(products, (item) => toInteger(item.category_id, 0));
  const result = new Map();

  function countCategory(categoryId) {
    if (result.has(categoryId)) {
      return result.get(categoryId);
    }

    let total = directCount.get(categoryId) || 0;
    for (const child of childrenByParent.get(categoryId) || []) {
      total += countCategory(toInteger(child.id, 0));
    }

    result.set(categoryId, total);
    return total;
  }

  result.set(0, products.length);
  for (const category of categories) {
    countCategory(toInteger(category.id, 0));
  }
  return result;
}

function buildCountMap(items, keyFn) {
  const counts = new Map();
  for (const item of items) {
    const key = keyFn(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function buildLatestDateMap(items, keyFn, fallbackDate) {
  const latest = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const current = toSitemapDate(item.created_at || fallbackDate);
    const previous = latest.get(key);
    if (!previous || current > previous) {
      latest.set(key, current);
    }
  }
  return latest;
}

function getNewsCategoryParentId(categories, categoryId) {
  const category = categories.find((item) => toInteger(item.id, 0) === categoryId);
  return toInteger(category?.parent_id, 0);
}

function renderSitemapXml(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((entry) => (
    `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>\n    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>\n  </url>`
  )).join('\n')}\n</urlset>\n`;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
