import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site.mjs';
import { listColumns } from './columns.mjs';
import { listColumnCategories } from './column-categories.mjs';
import {
  buildColumnTreeIndex,
  isColumnUnderRoot
} from './column-tree.mjs';
import { listCorporationCategoriesAdmin, ensureCorporationCategoriesSchema } from './corporation-categories.mjs';
import { listNews } from './news.mjs';
import { listProducts, ensureProductsSchema } from './products.mjs';
import {
  resolvePublicSectionContext
} from './public-sections.mjs';

const MAX_FULL_TEXT_PAGES = 500;
const MAX_LIST_SAMPLE_ITEMS = 12;
const MAX_RECENT_PAGES = 20;
const LLMS_GROUP_LIMITS = {
  '核心页面': 8,
  '单页栏目': 8,
  '公司栏目': 8,
  '产品栏目': 18,
  '产品详情': 12,
  '新闻栏目': 8,
  '新闻详情': 10,
  '服务栏目': 8,
  '服务详情': 10
};

export function buildLlmsFiles({ outputRoot, generatedAt = new Date().toISOString(), languageCode = null } = {}) {
  const diagnostics = getLlmsDiagnostics({ generatedAt, languageCode });

  if (!diagnostics.normalized_site_url) {
    return {
      key: 'llms',
      label: 'LLMS 文本',
      recordsProcessed: 0,
      filesWritten: 0,
      skipped: true,
      message: '网站地址未配置，已跳过 llms.txt 生成'
    };
  }

  const files = [
    ['llms.txt', diagnostics.llms_txt],
    ['llms-full.txt', diagnostics.llms_full_txt]
  ];

  cleanupExistingLlmsFiles(outputRoot);

  for (const page of diagnostics.markdown_pages) {
    files.push([page.markdown_path.replace(/^\//, ''), page.markdown_content]);
  }

  for (const [relativePath, content] of files) {
    const filePath = path.resolve(outputRoot, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${String(content || '').replace(/\s+$/, '')}\n`, 'utf8');
  }

  return {
    key: 'llms',
    label: 'LLMS 文本',
    recordsProcessed: diagnostics.markdown_pages.length,
    filesWritten: files.length
  };
}

export function getLlmsDiagnostics({ generatedAt = new Date().toISOString(), languageCode = null } = {}) {
  const site = getSiteConfig(languageCode);
  const siteUrl = normalizeSiteUrl(site.web_url);
  const pages = siteUrl ? collectMarkdownPages({ site, siteUrl, languageCode }) : [];
  const llmsGroups = buildLlmsGroups(pages);
  const llmsIndexGroups = buildLlmsIndexGroups(llmsGroups);
  const llmsTxt = siteUrl ? renderLlmsTxt({ site, siteUrl, groups: llmsIndexGroups }) : '';
  const llmsFullTxt = siteUrl ? renderLlmsFullTxt({ site, siteUrl, pages, generatedAt }) : '';
  const warnings = buildWarnings({ site, siteUrl, pages });

  return {
    generated_at: generatedAt,
    site_url: site.web_url || '',
    normalized_site_url: siteUrl,
    total_pages: pages.length,
    llms_index_entry_count: llmsIndexGroups.reduce((sum, group) => sum + group.items.length, 0),
    llms_url: siteUrl ? `${siteUrl}/llms.txt` : '',
    llms_full_url: siteUrl ? `${siteUrl}/llms-full.txt` : '',
    warnings,
    groups: llmsGroups.map((group) => ({
      title: group.title,
      count: group.items.length
    })),
    llms_index_groups: llmsIndexGroups.map((group) => ({
      title: group.title,
      count: group.items.length,
      total_count: llmsGroups.find((item) => item.title === group.title)?.items.length || group.items.length
    })),
    recent_pages: pages.slice(0, MAX_RECENT_PAGES).map(toPagePreview),
    markdown_pages: pages,
    llms_txt: llmsTxt,
    llms_full_txt: llmsFullTxt
  };
}

function collectMarkdownPages({ site, siteUrl, languageCode = null }) {
  ensureProductsSchema();
  ensureCorporationCategoriesSchema();

  const columns = listColumns({ languageCode });
  const publicSections = resolvePublicSectionContext(columns);
  const productCategories = listColumnCategories('product', { languageCode });
  const newsCategories = listColumnCategories('news', { languageCode });
  const products = listProducts({ visibleOnly: true, limit: 10000, languageCode });
  const newsItems = listNews({ limit: 10000, languageCode });
  const corporationCategories = collectCorporationCategories();

  const productCategoriesById = new Map(productCategories.map((item) => [toInteger(item.id, 0), item]));
  const newsCategoriesById = new Map(newsCategories.map((item) => [toInteger(item.id, 0), item]));
  const corporationById = new Map(corporationCategories.map((item) => [toInteger(item.id, 0), item]));
  const pages = [];

  pages.push(createPage({
    title: site.web_name || site.company_name || '网站首页',
    routePath: '/index.html',
    section: '核心页面',
    summary: buildSiteSummary(site),
    contentLines: [
      buildContactFact(site),
      buildAddressFact(site),
      buildCompanyFact(site)
    ].filter(Boolean)
  }));

  pages.push(createPage({
    title: '联系我们',
    routePath: '/contact.html',
    section: '核心页面',
    summary: '联系页面，包含公司联系方式与沟通入口。',
    contentLines: buildSiteFactLines(site)
  }));

  for (const column of columns) {
    const routePath = String(column.route_path || '').trim();
    if (
      String(column.source_type || '') === 'single_page'
      && String(column.column_kind || '') === 'single'
      && routePath
    ) {
      pages.push(createPage({
        title: column.name,
        routePath: normalizeRoutePathForPublic(routePath),
        section: '单页栏目',
        summary: column.seo_description || extractPlainText(column.content_html),
        contentLines: [
          column.seo_title ? `SEO 标题：${column.seo_title}` : '',
          column.seo_keywords ? `SEO 关键词：${normalizeKeywords(column.seo_keywords)}` : '',
          extractPlainText(column.content_html)
        ].filter(Boolean)
      }));
    }
  }

  const corporationIndex = corporationCategories.find((item) => toInteger(item.parent_id, 0) === 0)
    ?? corporationCategories[0];
  if (corporationIndex) {
    pages.push(createPage({
      title: corporationIndex.name,
      routePath: '/about/index.html',
      section: '公司栏目',
      summary: extractPlainText(corporationIndex.content_html) || '公司介绍栏目首页。',
      contentLines: [extractPlainText(corporationIndex.content_html)].filter(Boolean)
    }));
  }

  for (const item of corporationCategories) {
    if (toInteger(item.id, 0) <= 0) {
      continue;
    }
    pages.push(createPage({
      title: item.name,
      routePath: `/about/about-${item.id}.html`,
      section: '公司栏目',
      summary: extractPlainText(item.content_html) || '公司相关介绍页面。',
      contentLines: [extractPlainText(item.content_html)].filter(Boolean)
    }));
  }

  pages.push(createPage({
    title: '产品中心',
    routePath: '/valve/index.html',
    section: '产品栏目',
    summary: '产品分类导航与产品列表入口。',
    contentLines: buildCategorySampleLines(productCategories)
  }));

  for (const category of productCategories) {
    const categoryId = toInteger(category.id, 0);
    const childCategories = productCategories.filter((item) => toInteger(item.parent_id, 0) === categoryId);
    const categoryProducts = products.filter((item) => toInteger(item.column_id, 0) === categoryId).slice(0, MAX_LIST_SAMPLE_ITEMS);
    pages.push(createPage({
      title: category.name,
      routePath: `/valve/${categoryId}.html`,
      section: '产品栏目',
      summary: category.seo_description || `产品分类：${category.name}`,
      contentLines: [
        category.seo_keywords ? `关键词：${normalizeKeywords(category.seo_keywords)}` : '',
        childCategories.length > 0 ? `下级分类：${childCategories.map((item) => item.name).join('、')}` : '',
        categoryProducts.length > 0 ? `示例产品：${categoryProducts.map((item) => item.name).join('、')}` : ''
      ].filter(Boolean)
    }));
  }

  for (const product of products) {
    const category = productCategoriesById.get(toInteger(product.column_id, 0));
    pages.push(createPage({
      title: product.name,
      routePath: `/product/${product.id}.html`,
      section: '产品详情',
      summary: product.summary || `产品详情：${product.name}`,
      contentLines: [
        product.code ? `型号：${product.code}` : '',
        category?.name ? `分类：${category.name}` : '',
        product.keywords ? `关键词：${normalizeKeywords(product.keywords)}` : '',
        extractPlainText(product.content_html)
      ].filter(Boolean)
    }));
  }

  const newsSection = publicSections.getNewsSectionByDirName('news');
  const serviceSection = publicSections.getNewsSectionByDirName('service');
  const newsRootCategories = newsSection
    ? newsCategories.filter((item) => toInteger(item.parent_id, 0) === newsSection.rootColumnId)
    : [];
  const serviceRootCategories = serviceSection
    ? newsCategories.filter((item) => toInteger(item.parent_id, 0) === serviceSection.rootColumnId)
    : [];

  pages.push(createPage({
    title: '新闻中心',
    routePath: '/news/index.html',
    section: '新闻栏目',
    summary: '公司新闻分类与文章入口。',
    contentLines: buildCategorySampleLines(newsRootCategories)
  }));

  pages.push(createPage({
    title: '服务',
    routePath: '/service/index.html',
    section: '服务栏目',
    summary: '服务分类与文章入口。',
    contentLines: buildCategorySampleLines(serviceRootCategories)
  }));

  for (const category of newsRootCategories) {
    const categoryId = toInteger(category.id, 0);
    const items = newsItems.filter((item) => toInteger(item.column_id, 0) === categoryId).slice(0, MAX_LIST_SAMPLE_ITEMS);
    pages.push(createPage({
      title: category.name,
      routePath: `/news/${categoryId}.html`,
      section: '新闻栏目',
      summary: `新闻分类：${category.name}`,
      contentLines: items.length > 0 ? [`示例文章：${items.map((item) => item.title).join('、')}`] : []
    }));
  }

  for (const category of serviceRootCategories) {
    const categoryId = toInteger(category.id, 0);
    const items = newsItems.filter((item) => toInteger(item.column_id, 0) === categoryId).slice(0, MAX_LIST_SAMPLE_ITEMS);
    pages.push(createPage({
      title: category.name,
      routePath: `/service/${categoryId}.html`,
      section: '服务栏目',
      summary: `服务分类：${category.name}`,
      contentLines: items.length > 0 ? [`示例内容：${items.map((item) => item.title).join('、')}`] : []
    }));
  }

  for (const item of newsItems) {
    const category = newsCategoriesById.get(toInteger(item.column_id, 0));
    const columnId = toInteger(item.column_id, 0);
    const section = publicSections.getNewsSectionByColumnId(columnId);
    if (!section) {
      continue;
    }

    pages.push(createPage({
      title: item.title,
      routePath: `/${section.dirName}/detail/${item.id}.html`,
      section: section.dirName === 'service' ? '服务详情' : '新闻详情',
      summary: item.summary || item.title,
      contentLines: [
        category?.name ? `分类：${category.name}` : '',
        item.keywords ? `关键词：${normalizeKeywords(item.keywords)}` : '',
        extractPlainText(item.content_html)
      ].filter(Boolean)
    }));
  }

  return dedupePages(pages).map((page) => finalizePage({ page, siteUrl, corporationById }));
}

function buildLlmsGroups(pages) {
  const sectionOrder = [
    '核心页面',
    '单页栏目',
    '公司栏目',
    '产品栏目',
    '产品详情',
    '新闻栏目',
    '新闻详情',
    '服务栏目',
    '服务详情'
  ];
  const groups = new Map();

  for (const section of sectionOrder) {
    groups.set(section, []);
  }

  for (const page of pages) {
    if (!groups.has(page.section)) {
      groups.set(page.section, []);
    }
    groups.get(page.section).push(page);
  }

  return Array.from(groups.entries())
    .map(([title, items]) => ({ title, items }))
    .filter((group) => group.items.length > 0);
}

function renderLlmsTxt({ site, siteUrl, groups }) {
  const lines = [
    `# ${site.web_name || site.company_name || '站点内容导览'}`,
    `> ${buildSiteSummary(site)}`
  ];

  const facts = buildSiteFactLines(site);
  if (facts.length > 0) {
    lines.push('', ...facts.map((item) => `- ${item}`));
  }

  for (const group of groups) {
    lines.push('', `## ${group.title}`);
    for (const item of group.items) {
      lines.push(`- [${item.title}](${siteUrl}${item.markdown_path}): ${item.summary}`);
    }
  }

  return lines.join('\n');
}

function renderLlmsFullTxt({ site, siteUrl, pages, generatedAt }) {
  const limitedPages = pages.slice(0, MAX_FULL_TEXT_PAGES);
  const lines = [
    `# ${site.web_name || site.company_name || '站点全文上下文'}`,
    `> 生成时间：${generatedAt}`,
    `> 站点地址：${siteUrl}`,
    ''
  ];

  for (const page of limitedPages) {
    lines.push(`## ${page.title}`);
    lines.push(`Source: ${page.public_url}`);
    lines.push('');
    lines.push(page.markdown_content.trim());
    lines.push('');
  }

  return lines.join('\n');
}

function buildWarnings({ site, siteUrl, pages }) {
  const warnings = [];

  if (!siteUrl) {
    warnings.push({
      level: 'error',
      code: 'missing_site_url',
      message: '网站地址未配置，无法生成 llms.txt / llms-full.txt。'
    });
  }

  if (!String(site.web_name || '').trim() && !String(site.company_name || '').trim()) {
    warnings.push({
      level: 'warning',
      code: 'missing_site_name',
      message: '站点名称为空，llms.txt 标题将退回默认值。'
    });
  }

  if (!site.company_phone && !site.company_email) {
    warnings.push({
      level: 'warning',
      code: 'missing_contact_info',
      message: '公司电话和邮箱都为空，AI 导览文件缺少有效联系方式。'
    });
  }

  if (pages.length === 0 && siteUrl) {
    warnings.push({
      level: 'warning',
      code: 'empty_llms_pages',
      message: '当前没有可导出的公开页面内容。'
    });
  }

  return warnings;
}

function createPage({ title, routePath, section, summary, contentLines }) {
  const normalizedTitle = String(title || '').trim() || '未命名页面';
  const normalizedSummary = truncateText(summary || normalizedTitle, 220);
  const bodyLines = contentLines
    .map((item) => truncateText(item, 2000))
    .filter(Boolean);

  return {
    title: normalizedTitle,
    route_path: normalizePublicPath(routePath),
    section,
    summary: normalizedSummary,
    body_lines: bodyLines
  };
}

function finalizePage({ page, siteUrl }) {
  const markdownPath = buildMarkdownPath(page.route_path);
  const publicUrl = `${siteUrl}${page.route_path}`;
  const markdownUrl = `${siteUrl}${markdownPath}`;
  const lines = [
    `# ${page.title}`,
    `> ${page.summary}`,
    ''
  ];

  if (page.body_lines.length > 0) {
    for (const line of page.body_lines) {
      lines.push(normalizeMarkdownParagraph(line), '');
    }
  }

  lines.push(`Source URL: ${publicUrl}`);

  return {
    ...page,
    public_url: publicUrl,
    markdown_path: markdownPath,
    markdown_url: markdownUrl,
    markdown_content: lines.join('\n').replace(/\n{3,}/g, '\n\n')
  };
}

function collectCorporationCategories() {
  const queue = [0];
  const collected = [];
  const seen = new Set();

  while (queue.length > 0) {
    const parentId = queue.shift();
    const children = listCorporationCategoriesAdmin({ parentId });
    for (const item of children) {
      const id = toInteger(item.id, 0);
      if (seen.has(id)) {
        continue;
      }
      seen.add(id);
      if (toInteger(item.is_external, 0) === 0) {
        collected.push(item);
      }
      queue.push(id);
    }
  }

  return collected;
}

function buildSiteSummary(site) {
  const webName = toNullableString(site.web_name);
  const companyName = toNullableString(site.company_name);
  const baseName = webName || companyName;
  if (baseName) {
    return `${baseName} 的公开站点内容导览，包含公司介绍、产品、新闻与服务信息。`;
  }
  return '公开站点内容导览，包含公司介绍、产品、新闻与服务信息。';
}

function buildSiteFactLines(site) {
  return [
    buildCompanyFact(site),
    buildContactFact(site),
    buildAddressFact(site),
    site.icp_number ? `ICP备案：${site.icp_number}` : ''
  ].filter(Boolean);
}

function buildCompanyFact(site) {
  return site.company_name ? `公司：${site.company_name}` : '';
}

function buildContactFact(site) {
  const contactParts = [
    site.company_phone ? `电话 ${site.company_phone}` : '',
    site.company_email ? `邮箱 ${site.company_email}` : '',
    site.contact_person ? `联系人 ${site.contact_person}` : ''
  ].filter(Boolean);
  return contactParts.length > 0 ? `联系方式：${contactParts.join('，')}` : '';
}

function buildAddressFact(site) {
  return site.company_address ? `地址：${site.company_address}` : '';
}

function buildCategorySampleLines(categories) {
  const names = categories.slice(0, MAX_LIST_SAMPLE_ITEMS).map((item) => item.name).filter(Boolean);
  return names.length > 0 ? [`示例分类：${names.join('、')}`] : [];
}

function buildLlmsIndexGroups(groups) {
  return groups
    .map((group) => ({
      title: group.title,
      items: selectLlmsGroupItems(group.title, group.items)
    }))
    .filter((group) => group.items.length > 0);
}

function selectLlmsGroupItems(title, items) {
  const limit = LLMS_GROUP_LIMITS[title] || 8;
  if (items.length <= limit) {
    return items;
  }

  if (title === '产品栏目' || title === '新闻栏目' || title === '服务栏目') {
    return prioritizeListPages(items, limit);
  }

  if (title === '产品详情' || title === '新闻详情' || title === '服务详情') {
    return prioritizeDetailPages(items, limit);
  }

  return items.slice(0, limit);
}

function prioritizeListPages(items, limit) {
  const topLevelEntries = [];
  const fallback = [];

  for (const item of items) {
    if (
      item.route_path.endsWith('/index.html')
      || /^\/(?:valve|news|service)\/\d+\.html$/i.test(item.route_path)
    ) {
      topLevelEntries.push(item);
    } else {
      fallback.push(item);
    }
  }

  return [...topLevelEntries, ...fallback].slice(0, limit);
}

function prioritizeDetailPages(items, limit) {
  return items
    .slice()
    .sort((left, right) => compareDetailPriority(left, right))
    .slice(0, limit);
}

function compareDetailPriority(left, right) {
  const leftScore = buildDetailPriorityScore(left);
  const rightScore = buildDetailPriorityScore(right);
  if (leftScore !== rightScore) {
    return rightScore - leftScore;
  }
  return right.title.localeCompare(left.title, 'zh-CN');
}

function buildDetailPriorityScore(item) {
  const title = String(item.title || '');
  const summary = String(item.summary || '');
  return (
    scoreContainsDigits(title)
    + scoreKeywordDensity(title)
    + scoreKeywordDensity(summary)
  );
}

function scoreContainsDigits(value) {
  return /\d/.test(value) ? 2 : 0;
}

function scoreKeywordDensity(value) {
  const normalized = String(value || '');
  let score = 0;
  if (/斯派莎克|Spirax|spirax/i.test(normalized)) {
    score += 3;
  }
  if (/阀|疏水|减压|控制|调节|执行器/i.test(normalized)) {
    score += 2;
  }
  if (/安装|选型|说明|指南|维修/i.test(normalized)) {
    score += 1;
  }
  return score;
}

function toPagePreview(page) {
  return {
    title: page.title,
    section: page.section,
    public_url: page.public_url,
    markdown_url: page.markdown_url,
    summary: page.summary
  };
}

function dedupePages(items) {
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = `${item.route_path}|${item.title}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function cleanupExistingLlmsFiles(outputRoot) {
  const rootFiles = ['llms.txt', 'llms-full.txt', 'index.md', 'contact.md'];
  const managedDirs = ['about', 'news', 'service', 'valve', 'product'];

  for (const relativePath of rootFiles) {
    const filePath = path.resolve(outputRoot, relativePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }

  for (const relativeDir of managedDirs) {
    const dirPath = path.resolve(outputRoot, relativeDir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      continue;
    }
    cleanupMarkdownFilesRecursive(dirPath);
  }
}

function cleanupMarkdownFilesRecursive(currentPath) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      cleanupMarkdownFilesRecursive(fullPath);
      continue;
    }
    if (entry.isFile() && path.extname(entry.name).toLowerCase() === '.md') {
      fs.unlinkSync(fullPath);
    }
  }
}

function buildMarkdownPath(publicPath) {
  if (publicPath === '/' || publicPath === '/index.html') {
    return '/index.md';
  }
  return publicPath.replace(/\.html?$/i, '.md');
}

function normalizeRoutePathForPublic(routePath) {
  const trimmed = String(routePath || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === '/') {
    return '/index.html';
  }
  if (/\.html?$/i.test(trimmed)) {
    return normalizePublicPath(trimmed);
  }
  return normalizePublicPath(`${trimmed.replace(/\/+$/, '')}.html`);
}

function normalizePublicPath(value) {
  const normalized = `/${String(value || '').trim().replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  return normalized === '/index' ? '/index.html' : normalized;
}

function extractPlainText(value) {
  return truncateText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
    4000
  );
}

function normalizeMarkdownParagraph(value) {
  return String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function normalizeKeywords(value) {
  return String(value || '')
    .split(/[|,，]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join('、');
}

function truncateText(value, maxLength) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function normalizeSiteUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function toInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function toNullableString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '';
}
