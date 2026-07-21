import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site.mjs';
import { ensureColumnsSchema, listColumns } from './columns.mjs';
import { listColumnNodesByRoot } from './column-nodes.mjs';
import { ensureContentItemsSchema, listContentItems } from './content-items.mjs';
import {
  buildSectionColumnPublicUrl,
  resolvePublicSectionContext
} from './public-sections.mjs';
import {
  buildSectionContentContext,
  getSectionTopLevelCategories
} from './section-content.mjs';
import {
  buildColumnSlugPath,
  buildManagedColumnPublicUrl,
  buildContentDetailUrlFromColumn
} from './column-paths.mjs';

const MAX_FULL_TEXT_PAGES = 500;
const MAX_LIST_SAMPLE_ITEMS = 12;
const MAX_RECENT_PAGES = 20;
const LLMS_GROUP_LIMITS = {
  '核心页面': 8,
  '单页栏目': 8,
  '公司栏目': 8,
  '托管栏目': 18,
  '托管内容': 12,
  '新闻栏目': 8,
  '新闻详情': 10,
  '服务栏目': 8,
  '服务详情': 10
};

function getRootColumnByDriver(columns, renderDriver) {
  return columns.find((item) => (
    item?.column_semantics?.is_root
    && String(item?.column_semantics?.render_driver || '') === String(renderDriver || '')
  )) || null;
}

function resolveManagedColumnModelCode(rootColumn) {
  const modelCode = String(rootColumn?.model_code || '').trim();
  if (!modelCode) {
    throw new Error(`托管栏目根 ${rootColumn?.id || ''} 缺少 model_code 配置`);
  }
  return modelCode;
}

function listManagedColumnItems(rootColumn, { languageCode = null, visibleOnly = true, limit = 10000 } = {}) {
  if (!rootColumn) {
    return [];
  }
  return listContentItems(resolveManagedColumnModelCode(rootColumn), {
    visibleOnly,
    limit,
    languageCode
  });
}

function resolveManagedColumnDisplayName(site = null, rootColumn = null) {
  return toConfiguredText(
    rootColumn?.name,
    site?.template_data?.ui?.text?.managedRoot,
    '托管内容'
  );
}

function getLlmsText(site = null) {
  const llmsUi = site?.template_data?.ui?.llms || {};
  const managedColumnLabel = resolveManagedColumnDisplayName(site, null);
  const languageCode = String(site?.requested_language_code || site?.current_language_code || '').trim();
  const isEnglish = /^en(?:-|$)/i.test(languageCode);
  const defaults = isEnglish ? {
    homeSection: 'Core pages',
    singleSection: 'Single pages',
    companySection: 'Company pages',
    managedSection: 'Managed categories',
    managedDetailSection: 'Managed details',
    newsSection: 'News categories',
    newsDetailSection: 'News details',
    serviceSection: 'Service categories',
    serviceDetailSection: 'Service details',
    siteIndexTitle: 'Site content guide',
    siteFullTitle: 'Site full-text context',
    siteHome: 'Website home',
    singleTreeHome: 'Page tree home.',
    singleTreePage: 'Page tree page.',
    managedHub: managedColumnLabel,
    managedHubSummary: `${managedColumnLabel} category navigation and listing entry.`,
    managedCategoryPrefix: `${managedColumnLabel} category: `,
    managedDetailPrefix: `${managedColumnLabel} detail: `,
    sectionCategorySuffix: ' categories',
    sectionCategoryEntrySuffix: ' category and article entry.',
    sectionCategoryPrefix: '',
    sectionDetailSuffix: ' details',
    sampleCategories: 'Sample categories',
    sampleItems: 'Sample items',
    itemModel: 'Model',
    itemCategory: 'Category',
    seoTitle: 'SEO title',
    sourceUrl: 'Source URL',
    generatedAt: 'Generated at',
    siteUrl: 'Site URL',
    company: 'Company',
    contact: 'Contact',
    phone: 'Phone',
    email: 'Email',
    contactPerson: 'Contact person',
    address: 'Address',
    icp: 'ICP',
    aiCrawlerSection: 'AI crawler guidance',
    aiCrawlerIntro: 'AI search crawlers may use this public content for discovery, summarization and citation when they respect robots.txt, canonical URLs and normal rate limits.',
    aiCrawlerAgents: 'Preferred AI search user agents: GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot and PerplexityBot.',
    aiCrawlerCanonical: 'Use the markdown links here as machine-readable mirrors. For attribution, indexing and deduplication, use each page\'s canonical HTML URL or the HTML source URL noted with the entry.',
    usageSection: 'Usage and attribution',
    usageSummary: 'Public page content may be referenced by AI assistants for answer generation, summaries and source discovery with clear attribution.',
    usageAttribution: 'Attribute cited information to Spirax Sarco and link to the source URL shown for each page.',
    usageRestriction: 'Do not present generated summaries as official product documentation, safety instructions or engineering specifications without linking to the original source.',
    groupOrder: [
      'Core pages',
      'Single pages',
      'Company pages',
      'Managed categories',
      'Managed details',
      'News categories',
      'News details',
      'Service categories',
      'Service details'
    ],
    listSections: ['Managed categories', 'News categories', 'Service categories'],
    detailSections: ['Managed details', 'News details', 'Service details'],
    siteSummary: (baseName) => baseName
      ? `${baseName} public site guide covering company information, products, news and services.`
      : 'Public site guide covering company information, products, news and services.'
  } : {
    homeSection: '核心页面',
    singleSection: '单页栏目',
    companySection: '公司栏目',
    managedSection: '托管栏目',
    managedDetailSection: '托管内容',
    newsSection: '新闻栏目',
    newsDetailSection: '新闻详情',
    serviceSection: '服务栏目',
    serviceDetailSection: '服务详情',
    siteIndexTitle: '站点内容导览',
    siteFullTitle: '站点全文上下文',
    siteHome: '网站首页',
    singleTreeHome: '单页栏目树首页。',
    singleTreePage: '单页栏目树页面。',
    managedHub: managedColumnLabel,
    managedHubSummary: `${managedColumnLabel}分类导航与列表入口。`,
    managedCategoryPrefix: `${managedColumnLabel}分类：`,
    managedDetailPrefix: `${managedColumnLabel}详情：`,
    sectionCategorySuffix: '栏目',
    sectionCategoryEntrySuffix: '分类与文章入口。',
    sectionCategoryPrefix: '',
    sectionDetailSuffix: '详情',
    sampleCategories: '示例分类',
    sampleItems: '示例内容',
    itemModel: '型号',
    itemCategory: '分类',
    seoTitle: 'SEO 标题',
    sourceUrl: 'Source URL',
    generatedAt: '生成时间',
    siteUrl: '站点地址',
    company: '公司',
    contact: '联系方式',
    phone: '电话',
    email: '邮箱',
    contactPerson: '联系人',
    address: '地址',
    icp: 'ICP备案',
    aiCrawlerSection: 'AI crawler 说明',
    aiCrawlerIntro: 'AI 搜索爬虫可在遵守 robots.txt、canonical URL 和正常抓取频率的前提下，用公开内容进行发现、摘要和引用。',
    aiCrawlerAgents: '建议支持的 AI 搜索 User-Agent：GPTBot、OAI-SearchBot、ChatGPT-User、ClaudeBot、PerplexityBot。',
    aiCrawlerCanonical: '本文件中的 markdown 链接用于机器读取；做引用、归因和去重时，应优先使用页面 canonical HTML URL，或条目旁标注的 HTML Source URL。',
    usageSection: '使用与署名',
    usageSummary: '公开页面内容可供 AI 助手用于答案生成、摘要和来源发现，但应保留清晰署名。',
    usageAttribution: '引用信息时请署名站点主体，并链接到每个页面标注的 Source URL。',
    usageRestriction: '不要在未链接原始来源的情况下，将生成摘要表述为官方产品文档、安全说明或工程规格。',
    groupOrder: [
      '核心页面',
      '单页栏目',
      '公司栏目',
      '托管栏目',
      '托管内容',
      '新闻栏目',
      '新闻详情',
      '服务栏目',
      '服务详情'
    ],
    listSections: ['托管栏目', '新闻栏目', '服务栏目'],
    detailSections: ['托管内容', '新闻详情', '服务详情'],
    siteSummary: (baseName) => baseName
      ? `${baseName} 的公开站点内容导览，包含公司介绍、托管内容、新闻与服务信息。`
      : '公开站点内容导览，包含公司介绍、托管内容、新闻与服务信息。'
  };

  return {
    languageCode,
    homeSection: toConfiguredText(llmsUi.homeSection, defaults.homeSection),
    singleSection: toConfiguredText(llmsUi.singleSection, defaults.singleSection),
    companySection: toConfiguredText(llmsUi.companySection, defaults.companySection),
    managedSection: toConfiguredText(llmsUi.managedSection, defaults.managedSection),
    managedDetailSection: toConfiguredText(llmsUi.managedDetailSection, defaults.managedDetailSection),
    newsSection: toConfiguredText(llmsUi.newsSection, defaults.newsSection),
    newsDetailSection: toConfiguredText(llmsUi.newsDetailSection, defaults.newsDetailSection),
    serviceSection: toConfiguredText(llmsUi.serviceSection, defaults.serviceSection),
    serviceDetailSection: toConfiguredText(llmsUi.serviceDetailSection, defaults.serviceDetailSection),
    siteIndexTitle: toConfiguredText(llmsUi.siteIndexTitle, defaults.siteIndexTitle),
    siteFullTitle: toConfiguredText(llmsUi.siteFullTitle, defaults.siteFullTitle),
    siteHome: toConfiguredText(llmsUi.siteHome, defaults.siteHome),
    singleTreeHome: toConfiguredText(llmsUi.singleTreeHome, defaults.singleTreeHome),
    singleTreePage: toConfiguredText(llmsUi.singleTreePage, defaults.singleTreePage),
    managedHub: toConfiguredText(llmsUi.managedHub, defaults.managedHub),
    managedHubSummary: toConfiguredText(llmsUi.managedHubSummary, defaults.managedHubSummary),
    managedCategoryPrefix: toConfiguredText(llmsUi.managedCategoryPrefix, defaults.managedCategoryPrefix),
    managedDetailPrefix: toConfiguredText(llmsUi.managedDetailPrefix, defaults.managedDetailPrefix),
    sectionCategorySuffix: toConfiguredText(llmsUi.sectionCategorySuffix, defaults.sectionCategorySuffix),
    sectionCategoryEntrySuffix: toConfiguredText(llmsUi.sectionCategoryEntrySuffix, defaults.sectionCategoryEntrySuffix),
    sectionCategoryPrefix: toConfiguredText(llmsUi.sectionCategoryPrefix, defaults.sectionCategoryPrefix),
    sectionDetailSuffix: toConfiguredText(llmsUi.sectionDetailSuffix, defaults.sectionDetailSuffix),
    sampleCategories: toConfiguredText(llmsUi.sampleCategories, defaults.sampleCategories),
    sampleItems: toConfiguredText(llmsUi.sampleItems, defaults.sampleItems),
    itemModel: toConfiguredText(llmsUi.itemModel, defaults.itemModel),
    itemCategory: toConfiguredText(llmsUi.itemCategory, defaults.itemCategory),
    seoTitle: toConfiguredText(llmsUi.seoTitle, defaults.seoTitle),
    sourceUrl: toConfiguredText(llmsUi.sourceUrl, defaults.sourceUrl),
    generatedAt: toConfiguredText(llmsUi.generatedAt, defaults.generatedAt),
    siteUrl: toConfiguredText(llmsUi.siteUrl, defaults.siteUrl),
    company: toConfiguredText(llmsUi.company, defaults.company),
    contact: toConfiguredText(llmsUi.contact, defaults.contact),
    phone: toConfiguredText(llmsUi.phone, defaults.phone),
    email: toConfiguredText(llmsUi.email, defaults.email),
    contactPerson: toConfiguredText(llmsUi.contactPerson, defaults.contactPerson),
    address: toConfiguredText(llmsUi.address, defaults.address),
    icp: toConfiguredText(llmsUi.icp, defaults.icp),
    aiCrawlerSection: toConfiguredText(llmsUi.aiCrawlerSection, defaults.aiCrawlerSection),
    aiCrawlerIntro: toConfiguredText(llmsUi.aiCrawlerIntro, defaults.aiCrawlerIntro),
    aiCrawlerAgents: toConfiguredText(llmsUi.aiCrawlerAgents, defaults.aiCrawlerAgents),
    aiCrawlerCanonical: toConfiguredText(llmsUi.aiCrawlerCanonical, defaults.aiCrawlerCanonical),
    usageSection: toConfiguredText(llmsUi.usageSection, defaults.usageSection),
    usageSummary: toConfiguredText(llmsUi.usageSummary, defaults.usageSummary),
    usageAttribution: toConfiguredText(llmsUi.usageAttribution, defaults.usageAttribution),
    usageRestriction: toConfiguredText(llmsUi.usageRestriction, defaults.usageRestriction),
    groupOrder: normalizeConfiguredTextArray(llmsUi.groupOrder, defaults.groupOrder),
    listSections: normalizeConfiguredTextArray(llmsUi.listSections, defaults.listSections),
    detailSections: normalizeConfiguredTextArray(llmsUi.detailSections, defaults.detailSections),
    siteSummary: (baseName) => {
      const template = toConfiguredText(llmsUi.siteSummaryTemplate, '');
      if (template) {
        return template.replaceAll('{siteName}', baseName || '');
      }
      return defaults.siteSummary(baseName);
    }
  };
}

function toConfiguredText(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || String(fallback || '');
}

function normalizeConfiguredTextArray(value, fallback = []) {
  if (Array.isArray(value)) {
    const items = value
      .map((item) => String(item || '').trim())
      .filter(Boolean);
    if (items.length > 0) {
      return items;
    }
  }
  return Array.isArray(fallback) ? fallback.slice() : [];
}

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

  cleanupExistingLlmsFiles(outputRoot, diagnostics.public_sections);

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
  const text = getLlmsText(site);
  const siteUrl = normalizeSiteUrl(site.resolved_web_url || site.web_url);
  const result = siteUrl ? collectMarkdownPages({ site, siteUrl, languageCode, text }) : { pages: [], publicSections: null };
  const pages = result.pages || [];
  const publicSections = result.publicSections;
  const llmsGroups = buildLlmsGroups(pages, text);
  const llmsIndexGroups = buildLlmsIndexGroups(llmsGroups, text);
  const llmsTxt = siteUrl ? renderLlmsTxt({ site, siteUrl, groups: llmsIndexGroups, text }) : '';
  const llmsFullTxt = siteUrl ? renderLlmsFullTxt({ site, siteUrl, pages, generatedAt, text }) : '';
  const warnings = buildWarnings({ site, siteUrl, pages });

  return {
    generated_at: generatedAt,
    site_url: site.resolved_web_url || site.web_url || '',
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
    llms_full_txt: llmsFullTxt,
    public_sections: publicSections
  };
}

function collectMarkdownPages({ site, siteUrl, languageCode = null, text }) {
  ensureContentItemsSchema();
  ensureColumnsSchema();

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
  const pageTreeRoot = getRootColumnByDriver(columns, 'page_tree');
  const managedColumns = managedColumnRoot ? listColumnNodesByRoot(managedColumnRoot.id, { languageCode }) : [];
  const managedItems = listManagedColumnItems(managedColumnRoot, { visibleOnly: true, limit: 10000, languageCode });
  const sectionEntries = sectionContent.sectionEntries;
  const pageTreeCategories = pageTreeRoot ? listColumnNodesByRoot(pageTreeRoot.id, { languageCode }) : [];
  const managedColumnLabel = resolveManagedColumnDisplayName(site, managedColumnRoot);
  const managedHubTitle = toConfiguredText(text.managedHub, managedColumnLabel);
  const managedHubSummary = toConfiguredText(text.managedHubSummary, `${managedColumnLabel} category navigation and listing entry.`);
  const managedCategoryPrefix = toConfiguredText(text.managedCategoryPrefix, `${managedColumnLabel} category: `);
  const managedDetailPrefix = toConfiguredText(text.managedDetailPrefix, `${managedColumnLabel} detail: `);

  const managedColumnsById = new Map(managedColumns.map((item) => [toInteger(item.id, 0), item]));
  const sectionCategoriesById = sectionContent.sectionCategoryById;
  const columnMap = new Map(columns.map((col) => [toInteger(col.id, 0), col]));
  const pages = [];

  pages.push(createPage({
    title: site.web_name || site.company_name || text.siteHome,
    routePath: '/',
    section: text.homeSection,
    summary: buildSiteSummary(site, text),
    contentLines: [
      buildContactFact(site, text),
      buildAddressFact(site, text),
      buildCompanyFact(site, text)
    ].filter(Boolean)
  }));

  for (const column of columns) {
    const routePath = String(column.route_path || '').trim();
    if (
      String(column.column_type || '') === 'single'
      && String(column.column_semantics?.render_driver || '') !== 'page_tree'
      && routePath
    ) {
      pages.push(createPage({
        title: column.name,
        routePath: normalizeRoutePathForPublic(routePath),
        section: text.singleSection,
        summary: column.seo_description || extractPlainText(column.content_html),
        contentLines: [
          column.seo_title ? formatFact(text.seoTitle, column.seo_title) : '',
          extractPlainText(column.content_html)
        ].filter(Boolean)
      }));
    }
  }

  const pageTreeIndex = pageTreeCategories.find((item) => toInteger(item.parent_id, 0) === 0)
    ?? pageTreeCategories[0];
  if (pageTreeIndex) {
    pages.push(createPage({
      title: pageTreeIndex.name,
      routePath: '/about/',
      section: text.companySection,
      summary: extractPlainText(pageTreeIndex.content_html) || text.singleTreeHome,
      contentLines: [extractPlainText(pageTreeIndex.content_html)].filter(Boolean)
    }));
  }

  for (const item of pageTreeCategories) {
    if (toInteger(item.id, 0) <= 0) {
      continue;
    }
    pages.push(createPage({
      title: item.name,
      routePath: `/about/about-${item.id}.html`,
      section: text.companySection,
      summary: extractPlainText(item.content_html) || text.singleTreePage,
      contentLines: [extractPlainText(item.content_html)].filter(Boolean)
    }));
  }

  const managedRootRoutePath = managedColumnRoot
    ? buildManagedColumnPublicUrl(managedColumnRoot, managedColumnsById)
    : '/';

  pages.push(createPage({
    title: managedHubTitle,
    routePath: managedRootRoutePath,
    section: text.managedSection,
    summary: managedHubSummary,
    contentLines: buildColumnSampleLines(managedColumns, text)
  }));

  for (const columnNode of managedColumns) {
    const columnNodeId = toInteger(columnNode.id, 0);
    const childColumns = managedColumns.filter((item) => toInteger(item.parent_id, 0) === columnNodeId);
    const columnItems = managedItems.filter((item) => toInteger(item.column_id, 0) === columnNodeId).slice(0, MAX_LIST_SAMPLE_ITEMS);
    pages.push(createPage({
      title: columnNode.name,
      routePath: buildManagedColumnPublicUrl(columnNode, managedColumnsById),
      section: text.managedSection,
      summary: columnNode.seo_description || formatPrefixedText(managedCategoryPrefix, columnNode.name),
      contentLines: [
        childColumns.length > 0 ? formatFact(text.sampleCategories, joinNames(childColumns.map((item) => item.name), text)) : '',
        columnItems.length > 0 ? formatFact(text.sampleItems, joinNames(columnItems.map((item) => item.name), text)) : ''
      ].filter(Boolean)
    }));
  }

  for (const managedItem of managedItems) {
    const columnNode = managedColumnsById.get(toInteger(managedItem.column_id, 0));
    const columnPath = columnNode ? buildColumnSlugPath(columnNode, managedColumnsById) : null;
    const column = columnMap.get(toInteger(managedItem.column_id, 0));
    if (!column) continue;

    pages.push(createPage({
      title: managedItem.name,
      routePath: buildContentDetailUrlFromColumn(managedItem, column, columnPath),
      section: text.managedDetailSection,
      summary: managedItem.summary || formatPrefixedText(managedDetailPrefix, managedItem.name),
      contentLines: [
        managedItem.code ? formatFact(text.itemModel, managedItem.code) : '',
        columnNode?.name ? formatFact(text.itemCategory, columnNode.name) : '',
        extractPlainText(managedItem.content_html)
      ].filter(Boolean)
    }));
  }

  // 为每个新闻类栏目生成列表页
  for (const section of publicSections.sections) {
    const rootColumns = getSectionTopLevelCategories(sectionContent, section);
    const sectionRootUrl = buildSectionColumnPublicUrl(section, section.rootColumn) || `/${section.dirName}/`;

    pages.push(createPage({
      title: section.sectionLabel,
      routePath: sectionRootUrl,
      section: formatLabelWithSuffix(section.sectionLabel, text.sectionCategorySuffix, text),
      summary: formatLabelWithSuffix(section.sectionLabel, text.sectionCategoryEntrySuffix, text),
      contentLines: buildColumnSampleLines(rootColumns, text)
    }));

    for (const columnNode of rootColumns) {
      const items = sectionEntries
        .filter((item) => toInteger(item.column_id, 0) === toInteger(columnNode.id, 0))
        .slice(0, MAX_LIST_SAMPLE_ITEMS);
      pages.push(createPage({
        title: columnNode.name,
        routePath: buildSectionColumnPublicUrl(section, columnNode),
        section: formatLabelWithSuffix(section.sectionLabel, text.sectionCategorySuffix, text),
        summary: formatSectionCategorySummary(section.sectionLabel, text.sectionCategoryPrefix, columnNode.name, text),
        contentLines: items.length > 0 ? [formatFact(text.sampleItems, joinNames(items.map((item) => item.name), text))] : []
      }));
    }
  }

  for (const item of sectionEntries) {
    const columnNode = sectionCategoriesById.get(toInteger(item.column_id, 0));
    const columnId = toInteger(item.column_id, 0);
    const section = publicSections.getSectionByColumnId(columnId);
    if (!section?.rootColumn) {
      continue;
    }

    pages.push(createPage({
      title: item.name,
      routePath: buildContentDetailUrlFromColumn(item, section.rootColumn),
      section: formatLabelWithSuffix(section.sectionLabel, text.sectionDetailSuffix, text),
      summary: item.summary || item.name,
      contentLines: [
        columnNode?.name ? formatFact(text.itemCategory, columnNode.name) : '',
        extractPlainText(item.content_html)
      ].filter(Boolean)
    }));
  }

  return {
    pages: dedupePages(pages).map((page) => finalizePage({ page, siteUrl })),
    publicSections
  };
}

function buildLlmsGroups(pages, text) {
  const sectionOrder = Array.isArray(text?.groupOrder) ? text.groupOrder : [];
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

function renderLlmsTxt({ site, siteUrl, groups, text }) {
  const lines = [
    `# ${site.web_name || site.company_name || text.siteIndexTitle}`,
    `> ${buildSiteSummary(site, text)}`
  ];

  const facts = buildSiteFactLines(site, text);
  if (facts.length > 0) {
    lines.push('', ...facts.map((item) => `- ${item}`));
  }

  const guidance = buildAiCrawlerGuidanceLines(text);
  if (guidance.length > 0) {
    lines.push('', `## ${text.aiCrawlerSection}`, ...guidance.map((item) => `- ${item}`));
  }

  const usage = buildUsageGuidanceLines(text);
  if (usage.length > 0) {
    lines.push('', `## ${text.usageSection}`, ...usage.map((item) => `- ${item}`));
  }

  for (const group of groups) {
    lines.push('', `## ${group.title}`);
    for (const item of group.items) {
      lines.push(`- [${item.title}](${siteUrl}${item.markdown_path}): ${item.summary} HTML Source: ${item.public_url}`);
    }
  }

  return lines.join('\n');
}

function renderLlmsFullTxt({ site, siteUrl, pages, generatedAt, text }) {
  const limitedPages = pages.slice(0, MAX_FULL_TEXT_PAGES);
  const lines = [
    `# ${site.web_name || site.company_name || text.siteFullTitle}`,
    `> ${formatFact(text.generatedAt, generatedAt)}`,
    `> ${formatFact(text.siteUrl, siteUrl)}`,
    ''
  ];

  const guidance = buildAiCrawlerGuidanceLines(text);
  if (guidance.length > 0) {
    lines.push(`## ${text.aiCrawlerSection}`, ...guidance.map((item) => `- ${item}`), '');
  }

  const usage = buildUsageGuidanceLines(text);
  if (usage.length > 0) {
    lines.push(`## ${text.usageSection}`, ...usage.map((item) => `- ${item}`), '');
  }

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

function buildSiteSummary(site, text) {
  const webName = toNullableString(site.web_name);
  const companyName = toNullableString(site.company_name);
  const baseName = webName || companyName;
  return text.siteSummary(baseName);
}

function buildSiteFactLines(site, text) {
  return [
    buildCompanyFact(site, text),
    buildContactFact(site, text),
    buildAddressFact(site, text),
    site.icp_number ? formatFact(text.icp, site.icp_number) : ''
  ].filter(Boolean);
}

function buildAiCrawlerGuidanceLines(text) {
  return [
    text.aiCrawlerIntro,
    text.aiCrawlerAgents,
    text.aiCrawlerCanonical
  ].map((item) => String(item || '').trim()).filter(Boolean);
}

function buildUsageGuidanceLines(text) {
  return [
    text.usageSummary,
    text.usageAttribution,
    text.usageRestriction
  ].map((item) => String(item || '').trim()).filter(Boolean);
}

function buildCompanyFact(site, text) {
  return site.company_name ? formatFact(text.company, site.company_name) : '';
}

function buildContactFact(site, text) {
  const contactParts = [
    site.company_phone ? formatFact(text.phone, site.company_phone) : '',
    site.company_email ? formatFact(text.email, site.company_email) : '',
    site.contact_person ? formatFact(text.contactPerson, site.contact_person) : ''
  ].filter(Boolean);
  return contactParts.length > 0 ? formatFact(text.contact, contactParts.join(resolveListDelimiter(text))) : '';
}

function buildAddressFact(site, text) {
  return site.company_address ? formatFact(text.address, site.company_address) : '';
}

function buildColumnSampleLines(columns, text) {
  const names = columns.slice(0, MAX_LIST_SAMPLE_ITEMS).map((item) => item.name).filter(Boolean);
  return names.length > 0 ? [formatFact(text.sampleCategories, joinNames(names, text))] : [];
}

function formatFact(label, value) {
  const normalizedLabel = String(label || '').trim().replace(/[：:]\s*$/g, '');
  const normalizedValue = String(value || '').trim();
  if (!normalizedLabel || !normalizedValue) {
    return normalizedValue || normalizedLabel;
  }
  return `${normalizedLabel}: ${normalizedValue}`;
}

function formatPrefixedText(prefix, value) {
  const normalizedPrefix = String(prefix || '').trim();
  const normalizedValue = String(value || '').trim();
  if (!normalizedPrefix || !normalizedValue) {
    return normalizedValue || normalizedPrefix;
  }
  if (/[：:]\s*$/.test(normalizedPrefix)) {
    return `${normalizedPrefix.replace(/\s*$/g, '')} ${normalizedValue}`;
  }
  return `${normalizedPrefix.replace(/\s+$/g, '')} ${normalizedValue}`;
}

function formatLabelWithSuffix(label, suffix, text) {
  const normalizedLabel = String(label || '').trim();
  const normalizedSuffix = String(suffix || '').trim();
  if (!normalizedLabel || !normalizedSuffix) {
    return normalizedLabel || normalizedSuffix;
  }
  if (isEnglishLlmsText(text) && /^[a-z]/i.test(normalizedSuffix)) {
    return `${normalizedLabel} ${normalizedSuffix}`;
  }
  return `${normalizedLabel}${normalizedSuffix}`;
}

function formatSectionCategorySummary(sectionLabel, prefix, columnName, text) {
  const label = String(sectionLabel || '').trim();
  const normalizedPrefix = String(prefix || '').trim();
  const name = String(columnName || '').trim();
  if (!label && !name) {
    return '';
  }
  if (!normalizedPrefix) {
    return isEnglishLlmsText(text) ? [label, name].filter(Boolean).join(' ') : `${label}${name}`;
  }
  return `${label}${formatPrefixedText(normalizedPrefix, name)}`;
}

function joinNames(items, text) {
  return items
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(resolveListDelimiter(text));
}

function resolveListDelimiter(text) {
  return isEnglishLlmsText(text) ? ', ' : '、';
}

function isEnglishLlmsText(text) {
  return /^en(?:-|$)/i.test(String(text?.languageCode || '').trim());
}

function buildLlmsIndexGroups(groups, text) {
  return groups
    .map((group) => ({
      title: group.title,
      items: selectLlmsGroupItems(group.title, group.items, text)
    }))
    .filter((group) => group.items.length > 0);
}

function selectLlmsGroupItems(title, items, text) {
  const limit = LLMS_GROUP_LIMITS[title] || 8;
  if (items.length <= limit) {
    return items;
  }

  if ((text?.listSections || []).includes(title)) {
    return prioritizeListPages(items, limit);
  }

  if ((text?.detailSections || []).includes(title)) {
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
      || /^\/(?:products|news|services)\/\d+\.html$/i.test(item.route_path)
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

function cleanupExistingLlmsFiles(outputRoot, publicSections) {
  const rootFiles = ['llms.txt', 'llms-full.txt', 'index.md', 'contact.md'];
  const newsSectionDirs = publicSections?.sections?.map((section) => section.dirName) || [];
  const managedDirs = ['about', ...newsSectionDirs];
  const managedRootDir = publicSections?.managedRootColumnId
    ? String(publicSections.allById?.get(publicSections.managedRootColumnId)?.route_path || '').replace(/^\/+|\/+$/g, '')
    : '';
  if (managedRootDir) {
    managedDirs.push(managedRootDir);
  }

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
  if (String(publicPath || '').endsWith('/')) {
    return `${publicPath}index.md`;
  }
  return publicPath.replace(/\.html?$/i, '.md');
}

function normalizeRoutePathForPublic(routePath) {
  const trimmed = String(routePath || '').trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed === '/') {
    return '/';
  }
  if (/\/index\.html$/i.test(trimmed) || trimmed === '/index.html') {
    return normalizePublicPath(trimmed.replace(/\/index\.html$/i, '/') || '/');
  }
  if (/\.html?$/i.test(trimmed)) {
    return normalizePublicPath(trimmed);
  }
  return normalizePublicPath(`${trimmed.replace(/\/+$/, '')}.html`);
}

function normalizePublicPath(value) {
  const normalized = `/${String(value || '').trim().replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
  if (normalized === '/index' || normalized === '/index.html') {
    return '/';
  }
  if (/\/index\.html$/i.test(normalized)) {
    return normalized.replace(/\/index\.html$/i, '/');
  }
  return normalized;
}

function extractPlainText(value) {
  const plainText = String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
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
    .replace(/&times;/gi, '×')
    .replace(/&amp;/gi, '&')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  return truncateText(cleanExtractedText(plainText), 4000);
}

function cleanExtractedText(value) {
  const lines = String(value || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const cleaned = [];

  for (const line of lines) {
    if (isUiNoiseLine(line)) {
      continue;
    }
    if (cleaned[cleaned.length - 1] === line) {
      continue;
    }
    cleaned.push(line);
  }

  return cleaned.join('\n');
}

function isUiNoiseLine(line) {
  const normalized = String(line || '').trim();
  if (!normalized) {
    return true;
  }

  if (/^(Close|Copy)$/i.test(normalized)) {
    return true;
  }

  if (/^(Open|Copy Open)\s+(WhatsApp|Messenger|Telegram)$/i.test(normalized)) {
    return true;
  }

  if (/^(WhatsApp|WeCom|Messenger|Telegram)\s+×$/i.test(normalized)) {
    return true;
  }

  if (/^(WhatsApp|WeCom|Messenger|Telegram)$/i.test(normalized)) {
    return true;
  }

  if (/^@\w[\w.-]*$/i.test(normalized)) {
    return true;
  }

  if (/^\+[\d\s().-]{6,}$/i.test(normalized)) {
    return true;
  }

  return false;
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
