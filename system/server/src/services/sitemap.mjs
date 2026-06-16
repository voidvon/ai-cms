import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site.mjs';
import { listColumns } from './columns.mjs';
import { listColumnCategories } from './column-categories.mjs';
import {
  buildColumnTreeIndex,
  getDescendantColumnIds,
  isColumnUnderRoot
} from './column-tree.mjs';
import {
  resolveLegacyCategoryPublicId,
  resolvePublicSectionContext
} from './public-sections.mjs';
import { ensureCorporationCategoriesSchema } from './corporation-categories.mjs';
import { ensureProductsSchema, listProducts } from './products.mjs';
import { ensureNewsSchema, listNews } from './news.mjs';
import { escapeHtml } from '../utils/html.mjs';

const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;
const SITEMAP_CHUNK_SIZE = 1000;

export function buildSitemap({ outputRoot, generatedAt = new Date().toISOString(), languageCode = null } = {}) {
  const site = getSiteConfig(languageCode);
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

  const urls = collectSitemapEntries({ siteUrl, generatedAt, languageCode });
  const chunks = chunkEntries(urls, SITEMAP_CHUNK_SIZE);
  const sitemapFiles = [];

  fs.mkdirSync(outputRoot, { recursive: true });
  cleanupExistingSitemapFiles(outputRoot);

  chunks.forEach((chunk, index) => {
    const fileName = `sitemap-${index + 1}.xml`;
    const filePath = path.resolve(outputRoot, fileName);
    fs.writeFileSync(filePath, renderSitemapXml(chunk), 'utf8');
    sitemapFiles.push({
      loc: `${siteUrl}/${fileName}`,
      lastmod: resolveChunkLastmod(chunk, generatedAt)
    });
  });

  const indexXml = renderSitemapIndexXml(sitemapFiles);
  const filePath = path.resolve(outputRoot, 'sitemap.xml');
  fs.writeFileSync(filePath, indexXml, 'utf8');

  return {
    key: 'sitemap',
    label: '站点地图',
    recordsProcessed: urls.length,
    filesWritten: sitemapFiles.length + 1
  };
}

export function getSitemapDiagnostics({ generatedAt = new Date().toISOString(), languageCode = null } = {}) {
  const site = getSiteConfig(languageCode);
  const siteUrl = normalizeSiteUrl(site.web_url);
  const urls = siteUrl ? collectSitemapEntries({ siteUrl, generatedAt, languageCode }) : [];
  const chunks = chunkEntries(urls, SITEMAP_CHUNK_SIZE);
  const products = listProducts({ visibleOnly: true, limit: 10000, languageCode });
  const corporationCategories = listColumnCategories('corporation', { languageCode })
    .filter((item) => toInteger(item.is_external, 0) === 0);

  return {
    generated_at: generatedAt,
    site_url: site.web_url || '',
    normalized_site_url: siteUrl,
    total_urls: urls.length,
    chunk_size: SITEMAP_CHUNK_SIZE,
    chunk_count: urls.length > 0 ? chunks.length : 0,
    sitemap_index_url: siteUrl ? `${siteUrl}/sitemap.xml` : '',
    page_type_counts: buildPageTypeCounts(urls),
    recent_urls: urls.slice(0, 20),
    warnings: buildDiagnosticWarnings({
      siteUrl,
      products,
      corporationCategories
    }),
    chunk_files: chunks.map((chunk, index) => ({
      file_name: `sitemap-${index + 1}.xml`,
      url_count: chunk.length,
      lastmod: resolveChunkLastmod(chunk, generatedAt)
    }))
  };
}

function collectSitemapEntries({ siteUrl, generatedAt, languageCode = null }) {
  ensureProductsSchema();
  ensureNewsSchema();
  ensureCorporationCategoriesSchema();

  const entries = new Map();
  const columns = listColumns({ languageCode });
  const publicSections = resolvePublicSectionContext(columns);
  const productCategories = listColumnCategories('product', { languageCode });
  const newsCategories = listColumnCategories('news', { languageCode });
  const products = listProducts({ visibleOnly: true, limit: 10000, languageCode });
  const newsItems = listNews({ limit: 10000, languageCode });
  const corporationCategories = listColumnCategories('corporation', { languageCode })
    .filter((item) => toInteger(item.is_external, 0) === 0);
  const productCountByCategory = buildDescendantProductCountMap(productCategories, products);
  const latestProductDateByCategory = buildDescendantLatestDateMap(productCategories, products, generatedAt);
  const newsCountByCategory = buildCountMap(newsItems, (item) => toInteger(item.column_id, 0));
  const latestNewsDateByCategory = buildLatestDateMap(newsItems, (item) => toInteger(item.column_id, 0), 'created_at', generatedAt);
  const corporationLatestDateById = buildCorporationLatestDateMap(corporationCategories, generatedAt);
  const corporationIndexId = corporationCategories.find((item) => toInteger(item.parent_id, 0) === 0)?.id
    ?? corporationCategories[0]?.id
    ?? null;

  addEntry(entries, siteUrl, '/', generatedAt);
  addEntry(entries, siteUrl, '/index.html', generatedAt);
  addEntry(entries, siteUrl, '/contact.html', generatedAt);

  for (const column of columns) {
    const routePath = String(column.route_path || '').trim();
    if (
      String(column.source_type || '') === 'single_page'
      && routePath
    ) {
      addEntry(entries, siteUrl, normalizeRoutePathForPublic(routePath), column.updated_at || generatedAt);
    }
  }

  if (corporationIndexId != null) {
    addEntry(entries, siteUrl, '/about/index.html', corporationLatestDateById.get(toInteger(corporationIndexId, 0)) || generatedAt);
  }
  for (const item of corporationCategories) {
    const id = toInteger(item.id, 0);
    if (id > 0) {
      addEntry(entries, siteUrl, `/about/about-${id}.html`, corporationLatestDateById.get(id) || item.updated_at || generatedAt);
    }
  }

  for (const section of publicSections.newsSections) {
    addSectionEntries({
      entries,
      siteUrl,
      categories: newsCategories.filter((item) => toInteger(item.parent_id, 0) === section.rootColumnId),
      itemsPerPage: NEWS_LIST_PAGE_SIZE,
      sectionDir: section.dirName,
      getCategoryPublicId: (category) => resolveLegacyCategoryPublicId(category),
      getItemCount: (categoryId) => newsCountByCategory.get(categoryId) || 0,
      getLastmod: (categoryId) => latestNewsDateByCategory.get(categoryId) || generatedAt
    });
  }

  for (const item of newsItems) {
    const columnId = toInteger(item.column_id, 0);
    const section = publicSections.getNewsSectionByColumnId(columnId);
    if (section) {
      addEntry(entries, siteUrl, `/${section.dirName}/detail/${item.id}.html`, item.created_at || generatedAt);
    }
  }

  addEntry(entries, siteUrl, '/valve/index.html', latestProductDateByCategory.get(0) || generatedAt);
  for (const category of productCategories) {
    const categoryId = toInteger(category.id, 0);
    if (categoryId <= 0) {
      continue;
    }
    const total = productCountByCategory.get(categoryId) || 0;
    const pageCount = Math.max(Math.ceil(total / PRODUCT_LIST_PAGE_SIZE), 1);
    const lastmod = latestProductDateByCategory.get(categoryId) || generatedAt;
    addEntry(entries, siteUrl, `/valve/${categoryId}.html`, lastmod);
    addEntry(entries, siteUrl, `/valve/${categoryId}-1.html`, lastmod);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      addEntry(entries, siteUrl, `/valve/${categoryId}-${pageNumber}.html`, lastmod);
    }
  }

  for (const product of products) {
    addEntry(entries, siteUrl, `/product/${product.id}.html`, product.updated_at || generatedAt);
  }

  return Array.from(entries.values());
}

function addSectionEntries({
  entries,
  siteUrl,
  categories,
  itemsPerPage,
  sectionDir,
  getCategoryPublicId = (category) => toInteger(category.id, 0),
  getItemCount,
  getLastmod
}) {
  if (categories.length > 0) {
    addEntry(entries, siteUrl, `/${sectionDir}/index.html`, getLastmod(toInteger(categories[0].id, 0)));
  }

  for (const [index, category] of categories.entries()) {
    const categoryId = toInteger(category.id, 0);
    const publicCategoryId = getCategoryPublicId(category);
    const total = getItemCount(categoryId);
    const pageCount = Math.max(Math.ceil(total / itemsPerPage), 1);
    const lastmod = getLastmod(categoryId);

    addEntry(entries, siteUrl, `/${sectionDir}/${publicCategoryId}.html`, lastmod);
    addEntry(entries, siteUrl, `/${sectionDir}/${publicCategoryId}-1.html`, lastmod);
    if (index === 0) {
      addEntry(entries, siteUrl, `/${sectionDir}/`, lastmod);
    }

    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      addEntry(entries, siteUrl, `/${sectionDir}/${publicCategoryId}-${pageNumber}.html`, lastmod);
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

  const directCount = buildCountMap(products, (item) => toInteger(item.column_id, 0));
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

function buildLatestDateMap(items, keyFn, dateField, fallbackDate) {
  const latest = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const current = toSitemapDate(item[dateField] || fallbackDate);
    const previous = latest.get(key);
    if (!previous || current > previous) {
      latest.set(key, current);
    }
  }
  return latest;
}

function buildDescendantLatestDateMap(categories, products, fallbackDate) {
  const childrenByParent = new Map();
  for (const category of categories) {
    const parentId = toInteger(category.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(category);
  }

  const directLatest = new Map();
  for (const product of products) {
    const categoryId = toInteger(product.column_id, 0);
    const current = toSitemapDate(product.updated_at || fallbackDate);
    const previous = directLatest.get(categoryId);
    if (!previous || current > previous) {
      directLatest.set(categoryId, current);
    }
  }

  const result = new Map();
  function resolveLatest(categoryId) {
    if (result.has(categoryId)) {
      return result.get(categoryId);
    }

    let latest = directLatest.get(categoryId) || null;
    for (const child of childrenByParent.get(categoryId) || []) {
      const childLatest = resolveLatest(toInteger(child.id, 0));
      if (childLatest && (!latest || childLatest > latest)) {
        latest = childLatest;
      }
    }

    result.set(categoryId, latest || toSitemapDate(fallbackDate));
    return result.get(categoryId);
  }

  resolveLatest(0);
  for (const category of categories) {
    resolveLatest(toInteger(category.id, 0));
  }
  return result;
}

function buildCorporationLatestDateMap(categories, fallbackDate) {
  const categoryMap = new Map(categories.map((item) => [toInteger(item.id, 0), item]));
  const childrenByParent = new Map();
  for (const category of categories) {
    const parentId = toInteger(category.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(category);
  }

  const result = new Map();
  function resolveLatest(categoryId) {
    if (result.has(categoryId)) {
      return result.get(categoryId);
    }

    const currentCategory = categoryMap.get(categoryId) || null;
    let latest = currentCategory ? toSitemapDate(currentCategory.updated_at || fallbackDate) : null;
    for (const child of childrenByParent.get(categoryId) || []) {
      const childLatest = resolveLatest(toInteger(child.id, 0));
      if (childLatest && (!latest || childLatest > latest)) {
        latest = childLatest;
      }
    }

    result.set(categoryId, latest || toSitemapDate(fallbackDate));
    return result.get(categoryId);
  }

  for (const category of categories) {
    resolveLatest(toInteger(category.id, 0));
  }
  return result;
}

function renderSitemapXml(entries) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.map((entry) => (
    `  <url>\n    <loc>${escapeHtml(entry.loc)}</loc>\n    <lastmod>${escapeHtml(entry.lastmod)}</lastmod>\n  </url>`
  )).join('\n')}\n</urlset>\n`;
}

function renderSitemapIndexXml(files) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${files.map((file) => (
    `  <sitemap>\n    <loc>${escapeHtml(file.loc)}</loc>\n    <lastmod>${escapeHtml(file.lastmod)}</lastmod>\n  </sitemap>`
  )).join('\n')}\n</sitemapindex>\n`;
}

function buildDiagnosticWarnings({ siteUrl, products, corporationCategories }) {
  const warnings = [];

  if (!siteUrl) {
    warnings.push({
      level: 'error',
      code: 'missing_site_url',
      message: '网站地址未配置或格式无效，无法生成可提交搜索引擎的 sitemap'
    });
  }

  const productsMissingUpdatedAt = products.filter((item) => !String(item.updated_at || '').trim());
  if (productsMissingUpdatedAt.length > 0) {
    warnings.push({
      level: 'warning',
      code: 'products_missing_updated_at',
      message: `有 ${productsMissingUpdatedAt.length} 条产品缺少 updated_at，lastmod 将回退到构建时间`,
      sample_ids: productsMissingUpdatedAt.slice(0, 10).map((item) => item.id)
    });
  }

  const corporationMissingUpdatedAt = corporationCategories.filter((item) => !String(item.updated_at || '').trim());
  if (corporationMissingUpdatedAt.length > 0) {
    warnings.push({
      level: 'warning',
      code: 'corporation_missing_updated_at',
      message: `有 ${corporationMissingUpdatedAt.length} 个公司栏目缺少 updated_at，lastmod 将回退到构建时间`,
      sample_ids: corporationMissingUpdatedAt.slice(0, 10).map((item) => item.id)
    });
  }

  return warnings;
}

function buildPageTypeCounts(urls) {
  const counts = {
    home: 0,
    contact: 0,
    corporation: 0,
    news_list: 0,
    news_detail: 0,
    service_list: 0,
    service_detail: 0,
    product_list: 0,
    product_detail: 0,
    single_page: 0,
    other: 0
  };

  for (const entry of urls) {
    const url = entry.loc || '';
    if (url.endsWith('/index.html') || url.endsWith('/')) {
      if (url.endsWith('/about/index.html')) {
        counts.corporation += 1;
      } else if (url.endsWith('/news/index.html') || url.endsWith('/news/')) {
        counts.news_list += 1;
      } else if (url.endsWith('/service/index.html') || url.endsWith('/service/')) {
        counts.service_list += 1;
      } else if (url.endsWith('/valve/index.html')) {
        counts.product_list += 1;
      } else if (url.endsWith('/index.html') || url.endsWith('/')) {
        counts.home += 1;
      }
      continue;
    }

    if (url.includes('/contact.html')) {
      counts.contact += 1;
    } else if (url.includes('/about/about-')) {
      counts.corporation += 1;
    } else if (url.includes('/news/detail/')) {
      counts.news_detail += 1;
    } else if (url.includes('/news/')) {
      counts.news_list += 1;
    } else if (url.includes('/service/detail/')) {
      counts.service_detail += 1;
    } else if (url.includes('/service/')) {
      counts.service_list += 1;
    } else if (url.includes('/product/')) {
      counts.product_detail += 1;
    } else if (url.includes('/valve/')) {
      counts.product_list += 1;
    } else {
      counts.single_page += 1;
    }
  }

  return counts;
}

function chunkEntries(entries, size) {
  const chunks = [];
  for (let index = 0; index < entries.length; index += size) {
    chunks.push(entries.slice(index, index + size));
  }
  return chunks.length > 0 ? chunks : [[]];
}

function resolveChunkLastmod(entries, fallbackDate) {
  let latest = toSitemapDate(fallbackDate);
  for (const entry of entries) {
    if (entry.lastmod && entry.lastmod > latest) {
      latest = entry.lastmod;
    }
  }
  return latest;
}

function cleanupExistingSitemapFiles(outputRoot) {
  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (entry.name === 'sitemap.xml' || /^sitemap-\d+\.xml$/i.test(entry.name)) {
      fs.unlinkSync(path.resolve(outputRoot, entry.name));
    }
  }
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}
