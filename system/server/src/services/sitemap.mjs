import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site.mjs';
import { ensureColumnsSchema, listColumns } from './columns.mjs';
import { listColumnNodesByRoot } from './column-nodes.mjs';
import {
  buildSectionColumnPublicUrl,
  resolvePublicSectionContext
} from './public-sections.mjs';
import {
  buildSectionContentContext,
  getSectionTopLevelCategories,
  resolveSectionListPageSize,
  shouldRenderSectionRootAsList
} from './section-content.mjs';
import {
  buildColumnSlugPath,
  buildProductColumnPublicUrl,
  buildContentDetailUrlFromColumn
} from './column-paths.mjs';
import { ensureContentItemsSchema, listContentItems } from './content-items.mjs';
import { escapeHtml } from '../utils/html.mjs';

const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;
const SITEMAP_CHUNK_SIZE = 1000;

export function buildSitemap({ outputRoot, generatedAt = new Date().toISOString(), languageCode = null } = {}) {
  const site = getSiteConfig(languageCode);
  const siteUrl = normalizeSiteUrl(site.resolved_web_url || site.web_url);

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
  const siteUrl = normalizeSiteUrl(site.resolved_web_url || site.web_url);
  const urls = siteUrl ? collectSitemapEntries({ siteUrl, generatedAt, languageCode }) : [];
  const chunks = chunkEntries(urls, SITEMAP_CHUNK_SIZE);
  const managedItems = listContentItems('product', { visibleOnly: true, limit: 10000, languageCode });
  const columns = listColumns({ languageCode });
  const pageTreeRoot = getRootColumnByDriver(columns, 'page_tree');
  const pageTreeColumns = pageTreeRoot ? listColumnNodesByRoot(pageTreeRoot.id, { languageCode }) : [];

  return {
    generated_at: generatedAt,
    site_url: site.resolved_web_url || site.web_url || '',
    normalized_site_url: siteUrl,
    total_urls: urls.length,
    chunk_size: SITEMAP_CHUNK_SIZE,
    chunk_count: urls.length > 0 ? chunks.length : 0,
    sitemap_index_url: siteUrl ? `${siteUrl}/sitemap.xml` : '',
    page_type_counts: buildPageTypeCounts(urls),
    recent_urls: urls.slice(0, 20),
    warnings: buildDiagnosticWarnings({
      siteUrl,
      managedItems,
      corporationColumns: pageTreeColumns
    }),
    chunk_files: chunks.map((chunk, index) => ({
      file_name: `sitemap-${index + 1}.xml`,
      url_count: chunk.length,
      lastmod: resolveChunkLastmod(chunk, generatedAt)
    }))
  };
}

function collectSitemapEntries({ siteUrl, generatedAt, languageCode = null }) {
  ensureContentItemsSchema();
  ensureColumnsSchema();

  const entries = new Map();
  const columns = listColumns({ languageCode });
  const publicSections = resolvePublicSectionContext(columns);
  const sectionContent = buildSectionContentContext({
    languageCode,
    columns,
    publicSections,
    limit: 10000,
    visibleOnly: true
  });
  const managedColumnRoot = getRootColumnByDriver(columns, 'managed_column');
  const managedColumns = managedColumnRoot ? listColumnNodesByRoot(managedColumnRoot.id, { languageCode }) : [];
  const managedItems = listContentItems('product', { visibleOnly: true, limit: 10000, languageCode });
  const sectionEntries = sectionContent.sectionEntries;
  const pageTreeRoot = getRootColumnByDriver(columns, 'page_tree');
  const pageTreeColumns = pageTreeRoot ? listColumnNodesByRoot(pageTreeRoot.id, { languageCode }) : [];
  const managedItemCountByColumn = buildDescendantManagedItemCountMap(managedColumns, managedItems);
  const latestManagedItemDateByColumn = buildDescendantManagedItemLatestDateMap(managedColumns, managedItems, generatedAt);
  const sectionCountByColumn = buildCountMap(sectionEntries, (item) => toInteger(item.column_id, 0));
  const latestSectionDateByColumn = buildLatestDateMap(sectionEntries, (item) => toInteger(item.column_id, 0), 'created_at', generatedAt);
  const corporationLatestDateById = buildCorporationLatestDateMap(pageTreeColumns, generatedAt);
  const managedColumnMap = new Map(managedColumns.map((item) => [toInteger(item.id, 0), item]));
  const columnMap = new Map(columns.map((col) => [toInteger(col.id, 0), col]));
  const corporationIndexId = pageTreeColumns.find((item) => toInteger(item.parent_id, 0) === 0)?.id
    ?? pageTreeColumns[0]?.id
    ?? null;

  addEntry(entries, siteUrl, '/', generatedAt);
  addEntry(entries, siteUrl, '/index.html', generatedAt);

  for (const column of columns) {
    const routePath = String(column.route_path || '').trim();
    if (
      String(column.column_type || '') === 'single'
      && String(column.column_semantics?.render_driver || '') !== 'page_tree'
      && routePath
    ) {
      addEntry(entries, siteUrl, normalizeRoutePathForPublic(routePath), column.updated_at || generatedAt);
    }
  }

  if (corporationIndexId != null) {
    addEntry(entries, siteUrl, '/about/index.html', corporationLatestDateById.get(toInteger(corporationIndexId, 0)) || generatedAt);
  }
  for (const item of pageTreeColumns) {
    const id = toInteger(item.id, 0);
    if (id > 0) {
      addEntry(entries, siteUrl, `/about/about-${id}.html`, corporationLatestDateById.get(id) || item.updated_at || generatedAt);
    }
  }

  for (const section of publicSections.sections) {
    const rootColumnId = toInteger(section.rootColumnId, 0);
    const rootColumns = getSectionTopLevelCategories(sectionContent, section);
    const rootEntries = sectionContent.sectionEntriesByRootId.get(rootColumnId) || [];
    addSectionEntries({
      entries,
      siteUrl,
      section,
      columns: rootColumns,
      itemsPerPage: resolveSectionListPageSize(section, { fallback: NEWS_LIST_PAGE_SIZE }),
      rootItemsPerPage: resolveSectionListPageSize(section, { fallback: NEWS_LIST_PAGE_SIZE }),
      rootTotalRecords: rootEntries.length,
      rootLastmod: resolveLatestDate(rootEntries, generatedAt),
      renderRootAsList: shouldRenderSectionRootAsList(section),
      getItemCount: (columnId) => sectionCountByColumn.get(columnId) || 0,
      getLastmod: (columnId) => latestSectionDateByColumn.get(columnId) || generatedAt
    });
  }

  for (const item of sectionEntries) {
    const columnId = toInteger(item.column_id, 0);
    const section = publicSections.getSectionByColumnId(columnId);
    if (section?.rootColumn) {
      addEntry(entries, siteUrl, buildContentDetailUrlFromColumn(item, section.rootColumn), item.created_at || generatedAt);
    }
  }

  for (const columnNode of managedColumns) {
    const columnNodeId = toInteger(columnNode.id, 0);
    if (columnNodeId <= 0) {
      continue;
    }
    const total = managedItemCountByColumn.get(columnNodeId) || 0;
    const pageCount = Math.max(Math.ceil(total / PRODUCT_LIST_PAGE_SIZE), 1);
    const lastmod = latestManagedItemDateByColumn.get(columnNodeId) || generatedAt;
    const publicColumnUrl = buildProductColumnPublicUrl(columnNode, managedColumnMap);
    addEntry(entries, siteUrl, publicColumnUrl, lastmod);
    for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
      addEntry(entries, siteUrl, `${publicColumnUrl}index-${pageNumber}.html`, lastmod);
    }
  }

  for (const managedItem of managedItems) {
    const columnNode = managedColumnMap.get(toInteger(managedItem.column_id, 0));
    const columnPath = columnNode ? buildColumnSlugPath(columnNode, managedColumnMap) : null;
    const column = columnMap.get(toInteger(managedItem.column_id, 0));
    if (column) {
      addEntry(entries, siteUrl, buildContentDetailUrlFromColumn(managedItem, column, columnPath), managedItem.updated_at || generatedAt);
    }
  }

  return Array.from(entries.values());
}

function getRootColumnByDriver(columns, renderDriver) {
  return columns.find((item) => (
    item?.column_semantics?.is_root
    && String(item?.column_semantics?.render_driver || '') === String(renderDriver || '')
  )) || null;
}

function addSectionEntries({
  entries,
  siteUrl,
  section,
  columns,
  itemsPerPage,
  rootItemsPerPage = itemsPerPage,
  rootTotalRecords = 0,
  rootLastmod,
  renderRootAsList = false,
  getItemCount,
  getLastmod
}) {
  const sectionRootUrl = buildSectionColumnPublicUrl(section, section?.rootColumn);
  if (sectionRootUrl) {
    const pageCount = renderRootAsList
      ? Math.max(Math.ceil(Number(rootTotalRecords || 0) / Math.max(toInteger(rootItemsPerPage, 1), 1)), 1)
      : 1;
    for (const publicPath of buildPaginatedSectionPaths(sectionRootUrl, pageCount, { includeIndexAlias: true })) {
      addEntry(entries, siteUrl, publicPath, rootLastmod || getLastmod?.(toInteger(section?.rootColumnId, 0)));
    }
  }

  for (const columnNode of columns) {
    const columnNodeId = toInteger(columnNode.id, 0);
    const total = getItemCount(columnNodeId);
    const pageCount = Math.max(Math.ceil(total / itemsPerPage), 1);
    const lastmod = getLastmod(columnNodeId);
    const columnUrl = buildSectionColumnPublicUrl(section, columnNode);
    for (const publicPath of buildPaginatedSectionPaths(columnUrl, pageCount)) {
      addEntry(entries, siteUrl, publicPath, lastmod);
    }
  }
}

function buildPaginatedSectionPaths(publicUrl, pageCount, { includeIndexAlias = false } = {}) {
  const normalizedUrl = normalizePublicPath(publicUrl);
  if (!normalizedUrl) {
    return [];
  }

  const paths = new Set([normalizedUrl]);
  const totalPages = Math.max(toInteger(pageCount, 1), 1);

  if (normalizedUrl.endsWith('/')) {
    if (includeIndexAlias) {
      paths.add(`${normalizedUrl}index.html`);
    }
    for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
      paths.add(`${normalizedUrl}index-${pageNumber}.html`);
    }
    return Array.from(paths);
  }

  const match = normalizedUrl.match(/^(.*?)(\.html?)$/i);
  if (!match) {
    return Array.from(paths);
  }

  const [, prefix, extension] = match;
  for (let pageNumber = 2; pageNumber <= totalPages; pageNumber += 1) {
    paths.add(`${prefix}-${pageNumber}${extension}`);
  }
  return Array.from(paths);
}

function resolveLatestDate(items, fallback) {
  const rows = Array.isArray(items) ? items : [];
  return rows.reduce((latest, item) => {
    const value = String(item?.created_at || item?.updated_at || '').trim();
    if (!value) {
      return latest;
    }
    return value > latest ? value : latest;
  }, String(fallback || '')) || fallback;
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

function buildDescendantManagedItemCountMap(columns, items) {
  const childrenByParent = new Map();
  for (const columnNode of columns) {
    const parentId = toInteger(columnNode.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(columnNode);
  }

  const directCount = buildCountMap(items, (item) => toInteger(item.column_id, 0));
  const result = new Map();

  function countColumn(columnNodeId) {
    if (result.has(columnNodeId)) {
      return result.get(columnNodeId);
    }

    let total = directCount.get(columnNodeId) || 0;
    for (const child of childrenByParent.get(columnNodeId) || []) {
      total += countColumn(toInteger(child.id, 0));
    }

    result.set(columnNodeId, total);
    return total;
  }

  result.set(0, items.length);
  for (const columnNode of columns) {
    countColumn(toInteger(columnNode.id, 0));
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

function buildDescendantManagedItemLatestDateMap(columns, items, fallbackDate) {
  const childrenByParent = new Map();
  for (const columnNode of columns) {
    const parentId = toInteger(columnNode.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(columnNode);
  }

  const directLatest = new Map();
  for (const item of items) {
    const columnId = toInteger(item.column_id, 0);
    const current = toSitemapDate(item.updated_at || fallbackDate);
    const previous = directLatest.get(columnId);
    if (!previous || current > previous) {
      directLatest.set(columnId, current);
    }
  }

  const result = new Map();
  function resolveLatest(columnNodeId) {
    if (result.has(columnNodeId)) {
      return result.get(columnNodeId);
    }

    let latest = directLatest.get(columnNodeId) || null;
    for (const child of childrenByParent.get(columnNodeId) || []) {
      const childLatest = resolveLatest(toInteger(child.id, 0));
      if (childLatest && (!latest || childLatest > latest)) {
        latest = childLatest;
      }
    }

    result.set(columnNodeId, latest || toSitemapDate(fallbackDate));
    return result.get(columnNodeId);
  }

  resolveLatest(0);
  for (const columnNode of columns) {
    resolveLatest(toInteger(columnNode.id, 0));
  }
  return result;
}

function buildCorporationLatestDateMap(columns, fallbackDate) {
  const columnMap = new Map(columns.map((item) => [toInteger(item.id, 0), item]));
  const childrenByParent = new Map();
  for (const columnNode of columns) {
    const parentId = toInteger(columnNode.parent_id, 0);
    if (!childrenByParent.has(parentId)) {
      childrenByParent.set(parentId, []);
    }
    childrenByParent.get(parentId).push(columnNode);
  }

  const result = new Map();
  function resolveLatest(columnId) {
    if (result.has(columnId)) {
      return result.get(columnId);
    }

    const currentColumn = columnMap.get(columnId) || null;
    let latest = currentColumn ? toSitemapDate(currentColumn.updated_at || fallbackDate) : null;
    for (const child of childrenByParent.get(columnId) || []) {
      const childLatest = resolveLatest(toInteger(child.id, 0));
      if (childLatest && (!latest || childLatest > latest)) {
        latest = childLatest;
      }
    }

    result.set(columnId, latest || toSitemapDate(fallbackDate));
    return result.get(columnId);
  }

  for (const columnNode of columns) {
    resolveLatest(toInteger(columnNode.id, 0));
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

function buildDiagnosticWarnings({ siteUrl, managedItems, corporationColumns }) {
  const warnings = [];

  if (!siteUrl) {
    warnings.push({
      level: 'error',
      code: 'missing_site_url',
      message: '网站地址未配置或格式无效，无法生成可提交搜索引擎的 sitemap'
    });
  }

  const managedItemsMissingUpdatedAt = managedItems.filter((item) => !String(item.updated_at || '').trim());
  if (managedItemsMissingUpdatedAt.length > 0) {
    warnings.push({
      level: 'warning',
      code: 'managed_items_missing_updated_at',
      message: `有 ${managedItemsMissingUpdatedAt.length} 条托管内容缺少 updated_at，lastmod 将回退到构建时间`,
      sample_ids: managedItemsMissingUpdatedAt.slice(0, 10).map((item) => item.id)
    });
  }

  const corporationMissingUpdatedAt = corporationColumns.filter((item) => !String(item.updated_at || '').trim());
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
    section_list: 0,
    section_detail: 0,
    service_list: 0,
    service_detail: 0,
    managed_content_list: 0,
    managed_content_detail: 0,
    single_page: 0,
    other: 0
  };

  for (const entry of urls) {
    const url = entry.loc || '';
    if (url.endsWith('/index.html') || url.endsWith('/')) {
      if (url.endsWith('/about/index.html')) {
        counts.corporation += 1;
      } else if (url.endsWith('/news/index.html') || url.endsWith('/news/')) {
        counts.section_list += 1;
      } else if (url.endsWith('/service/index.html') || url.endsWith('/service/')) {
        counts.service_list += 1;
      } else if (url.endsWith('/valve/index.html')) {
        counts.managed_content_list += 1;
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
      counts.section_detail += 1;
    } else if (url.includes('/news/')) {
      counts.section_list += 1;
    } else if (url.includes('/service/detail/')) {
      counts.service_detail += 1;
    } else if (url.includes('/service/')) {
      counts.service_list += 1;
    } else if (url.includes('/product/')) {
      counts.managed_content_detail += 1;
    } else if (url.includes('/valve/')) {
      counts.managed_content_list += 1;
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
