import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT } from './config.mjs';
import { getDb, queryAll } from './db.mjs';
import { createCmsTemplateRuntime } from './cms-template-runtime.mjs';
import { listColumns } from './services/columns.mjs';
import { listNewsCategories } from './services/news-categories.mjs';
import { listNews } from './services/news.mjs';
import { listProductCategories } from './services/product-categories.mjs';
import { listProducts } from './services/products.mjs';
import { getSiteConfig } from './services/site.mjs';
import { ensureTemplatesSchema } from './services/templates.mjs';
import { escapeHtml } from './utils/html.mjs';
import { looksLikeLegacyMojibake } from './utils/legacy-text.mjs';

const DEFAULT_OUTPUT_ROOT = CONTENT_ROOT;
const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;
const CORPORATION_ROOT_ID = 32;
const NEWS_ROOT_ID = 4;
const SERVICE_ROOT_ID = 12;
const LEGACY_MARKETING_PATTERNS = [
  /以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?/gi,
  /[-,，\s]*上海彪维供应[-,，\s]*中国驰名商标/gi,
  /[-,，\s]*上海彪维疏水阀/gi,
  /[,，]?\s*上海彪维专业制造/gi,
  /彪维传热介绍[，,]*/gi,
  /[,，]?\s*彪维公司始终站在蒸汽利用的历史前沿[\s\S]*$/gi
];
const LEGACY_PRODUCT_BRAND_PATTERNS = [
  /(?:美国|进口)?彪维(?=[\u4E00-\u9FFFA-Za-z0-9])/gi,
  /[-,，\s]*中国驰名商标/gi,
  /【\s*彪维\s*】/gi,
  /我公司彪维/gi
];
const MANAGED_STATIC_ROOT_FILES = ['index.html', 'contact.html', 'msg.html'];
const MANAGED_STATIC_DIRS = ['about', 'news', 'product', 'products', 'service', 'valve'];
const CMS_TEMPLATE_BY_PAGE = {
  'legacy-home': 'home_default',
  'legacy-contact': 'content_contact',
  'legacy-message': 'content_message',
  'legacy-content': 'content_default',
  'legacy-product-list': 'list_product',
  'legacy-product-detail': 'content_product',
  'legacy-article-list': 'list_article',
  'legacy-article-detail': 'content_article'
};
const CMS_TEMPLATE_TYPE_BY_PAGE = {
  'legacy-home': 'home',
  'legacy-contact': 'content',
  'legacy-message': 'content',
  'legacy-content': 'content',
  'legacy-product-list': 'list',
  'legacy-product-detail': 'content',
  'legacy-article-list': 'list',
  'legacy-article-detail': 'content'
};
const CONTENT_TYPE_TARGETS = {
  product: 1,
  article: 2,
  contact: 4,
  message: 5,
  corporation: 6
};
const TEMPLATE_CLIENT_ASSET_DIR = path.join('assets', 'cms-templates');
const {
  renderCmsSitePage,
  cleanupTemplateClientBundles,
  buildRegisteredTsxAssets
} = createCmsTemplateRuntime({
  templateByPage: CMS_TEMPLATE_BY_PAGE,
  templateTypeByPage: CMS_TEMPLATE_TYPE_BY_PAGE,
  templateClientAssetDir: TEMPLATE_CLIENT_ASSET_DIR,
  expandLegacyCommonPlaceholders
});

export function buildStaticSite({ outputRoot = DEFAULT_OUTPUT_ROOT, sections, cleanExisting = false } = {}) {
  getDb();
  ensureTemplatesSchema();

  const normalizedOutputRoot = path.resolve(outputRoot);
  const requestedSections = normalizeSections(sections);
  const results = [];

  fs.mkdirSync(normalizedOutputRoot, { recursive: true });
  if (cleanExisting) {
    cleanupManagedStaticFiles(normalizedOutputRoot);
    cleanupTemplateClientBundles(normalizedOutputRoot);
  }

  if (requestedSections.has('index')) {
    results.push(buildIndexPage({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('contact')) {
    results.push(buildContactPage({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('msg')) {
    results.push(buildMessagePage({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('corporation-pages')) {
    results.push(buildCorporationPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('news-lists')) {
    results.push(buildNewsCategoryPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('service-lists')) {
    results.push(buildServiceCategoryPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('product-lists')) {
    results.push(buildProductCategoryPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('product-details')) {
    results.push(buildProductDetailPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('service-details')) {
    results.push(buildServiceDetailPages({ outputRoot: normalizedOutputRoot }));
  }
  if (requestedSections.has('news-details')) {
    results.push(buildNewsDetailPages({ outputRoot: normalizedOutputRoot }));
  }
  buildRegisteredTsxAssets(normalizedOutputRoot);

  return {
    outputRoot: normalizedOutputRoot,
    results,
    totalFiles: results.reduce((sum, item) => sum + item.filesWritten, 0),
    totalRecords: results.reduce((sum, item) => sum + item.recordsProcessed, 0)
  };
}

export function buildIndexPage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const html = renderCmsSitePage('legacy-home', buildLegacyHomePageProps(templateContext), templateContext, {
    themeSlot: 'home',
    targets: [{ target_type: 'site', target_id: null }]
  });

  writeTextFile(outputRoot, 'index.html', html);
  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('index', '首页', 1, 1);
}

export function buildContactPage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const html = renderCmsSitePage('legacy-contact', buildLegacyContactPageProps(templateContext), templateContext, {
    themeSlot: 'contact',
    targets: [{ target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.contact }]
  });

  writeTextFile(outputRoot, 'contact.html', html);
  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('contact', '联系页面', 1, 1);
}

export function buildMessagePage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const html = renderCmsSitePage('legacy-message', buildLegacyMessagePageProps(templateContext), templateContext, {
    themeSlot: 'message',
    targets: [{ target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.message }]
  });

  writeTextFile(outputRoot, 'msg.html', html);
  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('msg', '留言页面', 1, 1);
}

export function buildCorporationPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const items = templateContext.corporationCategories
    .filter((item) => normalizeInteger(item.id, 0) !== 0 && normalizeInteger(item.is_external, 0) === 0);
  const indexItemId = items.find((item) => normalizeInteger(item.parent_id, 0) === CORPORATION_ROOT_ID)?.id ?? items[0]?.id;

  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('legacy-content', buildLegacyContentPageProps(templateContext, item), templateContext, {
      themeSlot: 'corporation',
      targets: [
        { target_type: 'corporation_category', target_id: item.id },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.corporation }
      ]
    });

    writeTextFile(outputRoot, path.join('about', `about-${item.id}.html`), html);
    filesWritten += 1;

    if (normalizeInteger(item.id, 0) === normalizeInteger(indexItemId, 0)) {
      writeTextFile(outputRoot, path.join('about', 'index.html'), html);
      filesWritten += 1;
    }
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('corporation-pages', '公司栏目页', items.length, filesWritten);
}

export function buildNewsCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  return buildLegacyNewsSectionCategoryPages({
    outputRoot,
    rootId: NEWS_ROOT_ID,
    dirName: 'news',
    sectionKey: 'news-lists',
    sectionLabel: '新闻分类页',
    summaryClassName: 'Font_000000_a'
  });
}

export function buildServiceCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  return buildLegacyNewsSectionCategoryPages({
    outputRoot,
    rootId: SERVICE_ROOT_ID,
    dirName: 'service',
    sectionKey: 'service-lists',
    sectionLabel: '服务分类页',
    summaryClassName: '0a'
  });
}

export function buildProductCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const categories = listProductCategories();
  const products = listProducts({ visibleOnly: false, limit: 10000 });
  const templateContext = getLegacyTemplateContext();
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const childrenByParent = groupBy(categories, (item) => normalizeInteger(item.parent_id, 0));
  const productsByCategory = groupBy(products, (item) => normalizeInteger(item.category_id, 0));
  const topLevelCategories = childrenByParent.get(0) || [];
  let filesWritten = 0;

  const rootCategory = {
    id: 0,
    name: '产品展示',
    parent_id: 0,
    seo_keywords: templateContext.site.web_name || '产品展示',
    seo_description: templateContext.site.web_name || '产品展示'
  };

  filesWritten += writeProductCategoryPageSet({
    outputRoot,
    templateContext,
    category: rootCategory,
    parent: null,
    children: topLevelCategories,
    items: products.slice().sort(compareBySortAndId),
    fileStem: 'index'
  });

  for (const category of categories) {
    const categoryId = normalizeInteger(category.id, 0);
    if (categoryId === 0) {
      continue;
    }

    const descendantCategoryIds = getDescendantProductCategoryIds(childrenByParent, categoryId);
    const items = descendantCategoryIds
      .flatMap((id) => productsByCategory.get(id) || [])
      .slice()
      .sort(compareBySortAndId);
    const parent = categoryMap.get(normalizeInteger(category.parent_id, 0));
    const children = childrenByParent.get(categoryId) || [];
    filesWritten += writeProductCategoryPageSet({
      outputRoot,
      templateContext,
      category,
      parent,
      children,
      items,
      fileStem: String(categoryId)
    });
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('product-lists', '产品分类页', categories.filter((item) => normalizeInteger(item.id, 0) !== 0).length, filesWritten);
}

export function buildProductDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  const products = filterByIdRange(listProducts({ visibleOnly: false, limit: 10000 }), idRange);
  const templateContext = getLegacyTemplateContext();
  const productMap = groupBy(products, (item) => normalizeInteger(item.category_id, 0));
  const categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));
  let filesWritten = 0;

  for (const product of products) {
    const categoryProducts = (productMap.get(normalizeInteger(product.category_id, 0)) || []).filter((item) => item.id !== product.id);
    const relatedProducts = categoryProducts.slice().sort(compareBySortAndId).slice(0, 4);
    const category = categoryMap.get(normalizeInteger(product.category_id, 0)) || null;
    const parent = category ? categoryMap.get(normalizeInteger(category.parent_id, 0)) || null : null;
    const html = renderCmsSitePage('legacy-product-detail', buildLegacyProductDetailPageProps({
      templateContext,
      product,
      relatedProducts,
      category,
      parent
    }), templateContext, {
      themeSlot: 'product_detail',
      targets: [
        { target_type: 'product_category', target_id: normalizeInteger(product.category_id, 0) },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.product }
      ]
    });

    writeTextFile(outputRoot, path.join('product', `${product.id}.html`), html);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('product-details', '产品详情页', products.length, filesWritten);
}

export function buildNewsDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  return buildLegacyNewsSectionDetailPages({
    outputRoot,
    idRange,
    rootId: NEWS_ROOT_ID,
    dirName: 'news',
    sectionKey: 'news-details',
    sectionLabel: '新闻详情页'
  });
}

export function buildServiceDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  return buildLegacyNewsSectionDetailPages({
    outputRoot,
    idRange,
    rootId: SERVICE_ROOT_ID,
    dirName: 'service',
    sectionKey: 'service-details',
    sectionLabel: '服务详情页'
  });
}

function buildLegacyNewsSectionCategoryPages({
  outputRoot,
  rootId,
  dirName,
  sectionKey,
  sectionLabel,
  summaryClassName
}) {
  const categories = listNewsCategories();
  const templateContext = getLegacyTemplateContext();
  const categoryList = categories.filter((item) => normalizeInteger(item.parent_id, 0) === rootId);
  const items = listNews({ limit: 10000 });
  const categoryBuckets = groupBy(items, (item) => normalizeInteger(item.category_id, 0));
  let filesWritten = 0;

  for (const [categoryIndex, category] of categoryList.entries()) {
    const pageItems = (categoryBuckets.get(normalizeInteger(category.id, 0)) || []).slice();
    const pages = paginate(pageItems, NEWS_LIST_PAGE_SIZE);
    const pageList = pages.length > 0 ? pages : [[]];

    for (let pageIndex = 0; pageIndex < pageList.length; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const currentItems = pageList[pageIndex];
      const html = renderCmsSitePage('legacy-article-list', buildLegacyArticleListPageProps({
        templateContext,
        section: dirName === 'service' ? 'service' : 'news',
        category,
        pageItems: currentItems,
        pageNumber,
        pageCount: pageList.length,
        totalRecords: pageItems.length,
        dirName,
        summaryClassName
      }), templateContext, {
        themeSlot: dirName === 'service' ? 'service_list' : 'news_list',
        targets: [
          { target_type: 'news_category', target_id: category.id },
          { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.article }
        ]
      });

      const fileName = pageNumber === 1 ? `${category.id}.html` : `${category.id}-${pageNumber}.html`;
      writeTextFile(outputRoot, path.join(dirName, fileName), html);
      filesWritten += 1;

      if (pageNumber === 1) {
        writeTextFile(outputRoot, path.join(dirName, `${category.id}-1.html`), html);
        filesWritten += 1;
        if (categoryIndex === 0) {
          writeTextFile(outputRoot, path.join(dirName, 'index.html'), html);
          filesWritten += 1;
        }
      }
    }
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(sectionKey, sectionLabel, categoryList.length, filesWritten);
}

function buildLegacyNewsSectionDetailPages({
  outputRoot,
  idRange,
  rootId,
  dirName,
  sectionKey,
  sectionLabel
}) {
  const categories = listNewsCategories();
  const templateContext = getLegacyTemplateContext();
  const allowedCategoryIds = new Set(getDescendantNewsCategoryIds(categories, rootId));
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const allItems = listNews({ limit: 10000 })
    .filter((item) => allowedCategoryIds.has(normalizeInteger(item.category_id, 0)))
    .slice()
    .sort((left, right) => left.id - right.id);
  const items = filterByIdRange(allItems, idRange);
  const categoryBuckets = groupBy(allItems, (item) => normalizeInteger(item.category_id, 0));
  let filesWritten = 0;

  for (const item of items) {
    const siblings = (categoryBuckets.get(normalizeInteger(item.category_id, 0)) || []).slice().sort((left, right) => left.id - right.id);
    const currentIndex = siblings.findIndex((entry) => entry.id === item.id);
    const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    const category = categoryMap.get(normalizeInteger(item.category_id, 0));
    const html = renderCmsSitePage('legacy-article-detail', buildLegacyArticleDetailPageProps({
      templateContext,
      section: dirName === 'service' ? 'service' : 'news',
      item,
      category,
      previous,
      next
    }), templateContext, {
      themeSlot: dirName === 'service' ? 'service_detail' : 'news_detail',
      targets: [
        { target_type: 'news_category', target_id: normalizeInteger(item.category_id, 0) },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.article }
      ]
    });

    writeTextFile(outputRoot, path.join(dirName, 'detail', `${item.id}.html`), html);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(sectionKey, sectionLabel, items.length, filesWritten);
}


function getLegacyTemplateContext() {
  const site = getSiteConfig();

  return {
    site,
    columns: listColumns(),
    corporationCategories: queryAll(
      `
        SELECT id, name, parent_id, sort_order, is_external, external_url, legacy_extra
        FROM corporation_categories
        ORDER BY parent_id ASC, sort_order ASC, id ASC
      `
    ).map(normalizeCorporationCategoryRecord),
    productCategories: listProductCategories().slice().sort(compareCategoryOrder),
    newsCategories: listNewsCategories().slice().sort(compareCategoryOrder)
  };
}

function buildLegacyCommonProps(templateContext) {
  return {
    site: templateContext.site,
    siteColumns: buildLegacySiteColumns(templateContext.columns),
    fragments: {
      indextopHtml: '',
      topHtml: '',
      bottomHtml: '',
      indexFootHtml: '',
      aboutHtml: '',
      productsMenuHtml: buildLegacyProductsMenu(templateContext.productCategories),
      productsMenuCompactHtml: buildLegacyProductsMenuCompact(templateContext.productCategories),
      aboutCategoryHtml: buildLegacyAboutCategoryList(templateContext.corporationCategories, CORPORATION_ROOT_ID),
      newsCategoryHtml: buildLegacyNewsCategoryList(templateContext.newsCategories, NEWS_ROOT_ID, 'news'),
      serviceCategoryHtml: buildLegacyNewsCategoryList(templateContext.newsCategories, SERVICE_ROOT_ID, 'service')
    }
  };
}

function expandLegacyCommonPlaceholders(value, templateContext) {
  const site = templateContext.site;
  let html = String(value || '');

  html = html
    .replaceAll('#HOPE_Webname#', site.web_name || '')
    .replaceAll('#hope_webname#', site.web_name || '')
    .replaceAll('#HOPE_WebUrl#', site.web_url || '')
    .replaceAll('#HOPE_coname#', site.company_name || '')
    .replaceAll('#HOPE_address#', site.company_address || '')
    .replaceAll('#HOPE_post#', site.postal_code || '')
    .replaceAll('#HOPE_tel#', site.company_phone || '')
    .replaceAll('#HOPE_fax#', site.company_fax || '')
    .replaceAll('#HOPE_Ren#', site.contact_person || '')
    .replaceAll('#HOPE_Email#', site.company_email || '')
    .replaceAll('#HOPE_WebIcp#', site.icp_number || '')
    .replaceAll('#HOPE_WebQQ#', site.web_qq || '')
    .replaceAll('#HOPE_WebMsn#', site.web_mobile || '')
    .replaceAll('#HOPE_Webauthor#', site.web_author || '')
    .replaceAll('#HOPE_Copyright#', site.web_copyright || '')
    .replaceAll('#HOPE_ProductsCat()#', buildLegacyProductsMenu(templateContext.productCategories))
    .replaceAll('#HOPE_ProductsCat2()#', buildLegacyProductsMenuCompact(templateContext.productCategories));

  html = html.replace(/#HOPE_aboutCat\((\d+)\)#/gi, (_, id) => buildLegacyAboutCategoryList(templateContext.corporationCategories, Number(id)));
  html = html.replace(/#HOPE_NewsCat\((\d+)\s*,\s*(\d+)\)#/gi, (_, id, dirCode) => {
    const dirName = normalizeInteger(dirCode, 1) === 2 ? 'service' : 'news';
    return buildLegacyNewsCategoryList(templateContext.newsCategories, Number(id), dirName);
  });

  return normalizeLegacyTemplateMarkup(html, site);
}

function buildLegacyHomePageProps(templateContext) {
  return {
    ...buildLegacyCommonProps(templateContext),
    secondaryMenuItems: buildLegacyRootColumnMenuItems(templateContext.columns),
    newsIndexHtml: buildLegacyIndexNews(),
    featuredProductsHtml: buildLegacyIndexFeaturedProducts(),
    featuredProductLinksHtml: buildLegacyIndexFeaturedProductLinks(),
    serviceIndexHtml: buildLegacyServiceIndex()
  };
}

function buildLegacyRootColumnMenuItems(columns) {
  return buildLegacySiteColumns(columns).map((item) => ({
    label: item.name || '',
    url: item.url || '',
    active: false
  })).filter((item) => item.url);
}

function buildLegacySiteColumns(columns) {
  const rows = Array.isArray(columns) ? columns : [];
  const rowsById = new Map(rows.map((item) => [normalizeInteger(item?.id, 0), item]));
  const normalizedRows = rows.map((item) => ({
    id: normalizeInteger(item?.id, 0),
    name: item?.name || '',
    parentId: normalizeInteger(item?.parent_id, 0),
    modelCode: item?.model_code || '',
    sourceType: item?.source_type || '',
    sourceId: normalizeInteger(item?.source_id, 0),
    url: buildLegacyColumnUrl(item, rowsById)
  })).filter((item) => item.id !== 0);

  const childrenByParentId = new Map();
  for (const item of normalizedRows) {
    if (item.parentId === 0 || !item.url) {
      continue;
    }
    if (!childrenByParentId.has(item.parentId)) {
      childrenByParentId.set(item.parentId, []);
    }
    childrenByParentId.get(item.parentId).push({
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      url: item.url
    });
  }

  return normalizedRows
    .filter((item) => item.parentId === 0)
    .filter((item) => !['contact_page', 'message_page'].includes(String(item?.sourceType || '')))
    .map((item) => ({
      ...item,
      children: childrenByParentId.get(item.id) || []
    }))
    .filter((item) => item.url);
}

function buildLegacyColumnUrl(column, rowsById = new Map()) {
  if (!column) {
    return '';
  }
  const sourceType = String(column.source_type || '');
  const sourceId = normalizeInteger(column.source_id, 0);
  const parentColumn = rowsById.get(normalizeInteger(column.parent_id, 0)) || null;

  if (sourceType === 'product_root') {
    return '/valve/';
  }
  if (sourceType === 'product_category') {
    return sourceId > 0 ? `/valve/${sourceId}.html` : '';
  }
  if (sourceType === 'news_category') {
    if (sourceId === NEWS_ROOT_ID) {
      return '/news/';
    }
    if (sourceId === SERVICE_ROOT_ID) {
      return '/service/';
    }
    if (parentColumn && String(parentColumn.source_type || '') === 'news_category') {
      return normalizeInteger(parentColumn.source_id, 0) === SERVICE_ROOT_ID
        ? `/service/${sourceId}.html`
        : `/news/${sourceId}.html`;
    }
  }
  if (sourceType === 'corporation_root') {
    return '/about/';
  }
  if (sourceType === 'corporation_category') {
    return sourceId > 0 ? `/about/about-${sourceId}.html` : '';
  }
  if (sourceType === 'contact_page') {
    return '/contact.html';
  }
  if (sourceType === 'message_page') {
    return '/msg.html';
  }

  return '';
}

function buildLegacyContactPageProps(templateContext) {
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'contact',
      title: '联系我们',
      url: '/contact.html',
      section: { type: 'content', name: '联系我们', url: '/contact.html' },
      breadcrumbItems: [{ label: '联系我们' }],
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    contactTableHtml: ''
  };
}

function buildLegacyMessagePageProps(templateContext) {
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'message',
      title: '在线留言',
      url: '/msg.html',
      section: { type: 'content', name: '在线留言', url: '/msg.html' },
      breadcrumbItems: [{ label: '在线留言' }],
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    messageSidebarProductsHtml: buildLegacyMessageSidebarProducts()
  };
}

function buildLegacyContentPageProps(templateContext, item) {
  const parentCategory = templateContext.corporationCategories.find((entry) => normalizeInteger(entry.id, 0) === normalizeInteger(item.parent_id, 0)) || null;
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'content',
      title: item.name || '',
      url: `/about/about-${normalizeInteger(item.id, 0)}.html`,
      section: { type: 'corporation', name: '公司栏目', url: '/about/' },
      categoryChain: buildTemplateCategoryChain({
        category: item,
        categories: templateContext.corporationCategories,
        type: 'corporation',
        urlBuilder: (categoryItem) => `/about/about-${normalizeInteger(categoryItem.id, 0)}.html`
      }),
      categoryType: 'corporation',
      categoryUrl: `/about/about-${normalizeInteger(item.id, 0)}.html`,
      parentCategory,
      parentCategoryType: 'corporation',
      parentCategoryUrl: parentCategory ? `/about/about-${normalizeInteger(parentCategory.id, 0)}.html` : '',
      breadcrumbItems: [{ label: item.name || '' }],
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    title: item.name || '',
    contentHtml: normalizeLegacyRichTextHtml(item.content_html) || '',
    secondaryMenuItems: buildLegacyCorporationMenuItems(templateContext.corporationCategories, CORPORATION_ROOT_ID, normalizeInteger(item.id, 0))
  };
}

function buildLegacyProductListPageProps({ templateContext, category, parent, children, pageItems, pageNumber, pageCount, totalRecords }) {
  const rootLevelCategories = templateContext.productCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);
  const fileStem = normalizeInteger(category.id, 0) === 0 ? 'index' : String(category.id);

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'product-list',
      title: category.name || '',
      url: buildLegacyProductCategoryUrl(category),
      section: { type: 'product', name: '产品展示', url: '/valve/' },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'product',
        urlBuilder: buildLegacyProductCategoryUrl
      }),
      categoryType: 'product',
      categoryUrl: buildLegacyProductCategoryUrl(category),
      parentCategory: parent,
      parentCategoryType: 'product',
      parentCategoryUrl: parent ? buildLegacyProductCategoryUrl(parent) : '',
      breadcrumbItems: buildLegacyProductBreadcrumbItems(category, parent)
    }),
    smallName: category.name || '',
    bigId: normalizeInteger(parent?.id, category.id),
    bigName: parent?.name || category.name || '',
    productsSmallCatHtml: buildLegacyProductSmallCategories(rootLevelCategories.length > 0 ? rootLevelCategories : [category]),
    secondaryMenuItems: buildLegacyProductMenuItems(rootLevelCategories.length > 0 ? rootLevelCategories : [category], normalizeInteger(category.id, 0)),
    items: buildLegacyProductListItems(pageItems),
    pagerHtml: buildLegacyProductPager(fileStem, pageNumber, pageCount, totalRecords),
    prodKeywords: category.seo_keywords || category.name || ''
  };
}

function buildLegacyProductDetailPageProps({ templateContext, product, relatedProducts, category, parent }) {
  const rootLevelCategories = templateContext.productCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'product-detail',
      title: product.name || '',
      url: `/product/${normalizeInteger(product.id, 0)}.html`,
      section: { type: 'product', name: '产品展示', url: '/valve/' },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'product',
        urlBuilder: buildLegacyProductCategoryUrl
      }),
      categoryType: 'product',
      categoryUrl: category ? buildLegacyProductCategoryUrl(category) : '',
      parentCategory: parent,
      parentCategoryType: 'product',
      parentCategoryUrl: parent ? buildLegacyProductCategoryUrl(parent) : '',
      content: product,
      contentType: 'product',
      contentUrl: `/product/${normalizeInteger(product.id, 0)}.html`,
      breadcrumbItems: [
        { label: '产品展示', href: '/valve/' },
        ...buildLegacyProductCategoryBreadcrumbItems(category, parent),
        { label: product.name || '' }
      ]
    }),
    title: product.name || '',
    prodKeywords: product.keywords || '',
    prodDescription: product.summary || '',
    image: product.small_image || '/skin/dfpic.gif',
    code: product.code || '',
    relatedProductsHtml: buildLegacyRelatedProducts(relatedProducts),
    bodyHtml: normalizeLegacyRichTextHtml(product.content_html) || '',
    secondaryMenuItems: buildLegacyProductMenuItems(
      rootLevelCategories.length > 0 ? rootLevelCategories : [category].filter(Boolean),
      normalizeInteger(category?.id, 0)
    )
  };
}

function buildLegacyArticleListPageProps({ templateContext, section, category, pageItems, pageNumber, pageCount, totalRecords, summaryClassName }) {
  const isService = section === 'service';
  const sectionDir = isService ? 'service' : 'news';
  const sectionLabel = isService ? '阀门知识' : '新闻资讯';
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'article-list',
      title: category.name || '',
      url: `/${sectionDir}/${normalizeInteger(category.id, 0)}.html`,
      section: { type: isService ? 'service' : 'news', name: sectionLabel, url: `/${sectionDir}/` },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: isService ? 'service' : 'news',
        urlBuilder: (categoryItem) => `/${sectionDir}/${normalizeInteger(categoryItem.id, 0)}.html`
      }),
      categoryType: isService ? 'service' : 'news',
      categoryUrl: `/${sectionDir}/${normalizeInteger(category.id, 0)}.html`,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section,
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: isService ? buildLegacyNewsCategoryList(templateContext.newsCategories, SERVICE_ROOT_ID, 'service') : buildLegacyNewsCategoryList(templateContext.newsCategories, NEWS_ROOT_ID, 'news'),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext.newsCategories, isService ? SERVICE_ROOT_ID : NEWS_ROOT_ID, sectionDir, normalizeInteger(category.id, 0)),
    categoryId: normalizeInteger(category.id, 0),
    title: category.name || '',
    items: buildLegacyArticleListItems({ pageItems, summaryClassName }),
    pagerHtml: buildLegacyArticlePager({
      categoryId: normalizeInteger(category.id, 0),
      pageNumber,
      pageCount,
      totalRecords
    })
  };
}

function buildLegacyArticleDetailPageProps({ templateContext, section, item, category, previous, next }) {
  const isService = section === 'service';
  const sectionDir = isService ? 'service' : 'news';
  const sectionLabel = isService ? '阀门知识' : '新闻资讯';
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'article-detail',
      title: item.title || '',
      url: `/${sectionDir}/detail/${normalizeInteger(item.id, 0)}.html`,
      section: { type: isService ? 'service' : 'news', name: sectionLabel, url: `/${sectionDir}/` },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: isService ? 'service' : 'news',
        urlBuilder: (categoryItem) => `/${sectionDir}/${normalizeInteger(categoryItem.id, 0)}.html`
      }),
      categoryType: isService ? 'service' : 'news',
      categoryUrl: category ? `/${sectionDir}/${normalizeInteger(category.id, 0)}.html` : '',
      content: item,
      contentType: isService ? 'service-article' : 'news-article',
      contentUrl: `/${sectionDir}/detail/${normalizeInteger(item.id, 0)}.html`,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category?.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section,
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: isService ? buildLegacyNewsCategoryList(templateContext.newsCategories, SERVICE_ROOT_ID, 'service') : buildLegacyNewsCategoryList(templateContext.newsCategories, NEWS_ROOT_ID, 'news'),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext.newsCategories, isService ? SERVICE_ROOT_ID : NEWS_ROOT_ID, sectionDir, normalizeInteger(category?.id, 0)),
    title: item.title || '',
    newsKeywords: item.keywords || '',
    newsDescription: resolveRenderableNewsSummary(item) || '',
    typeId: normalizeInteger(item.category_id, 0),
    catName: category?.name || '',
    bodyHtml: normalizeLegacyRichTextHtml(item.content_html) || '',
    previousHtml: previous ? `<a href="${previous.id}.html" class="Font_2e4690_a ">${escapeHtml(previous.title || '')}</a>` : '<span class="Font_2e4690_a">没有上一篇</span>',
    nextHtml: next ? `<a href="${next.id}.html" class="Font_2e4690_a ">${escapeHtml(next.title || '')}</a>` : '<span class="Font_2e4690_a">没有下一篇</span>'
  };
}

function buildLegacyPageContextProps({
  pageType,
  title,
  url,
  section,
  categoryChain,
  categoryType,
  categoryUrl,
  parentCategory,
  parentCategoryType,
  parentCategoryUrl,
  content,
  contentType,
  contentUrl,
  breadcrumbItems,
  breadcrumbOptions
}) {
  return {
    currentPage: {
      type: pageType || '',
      title: title || '',
      url: url || ''
    },
    currentSection: normalizeTemplateSection(section),
    currentCategory: normalizeTemplateCategoryChain(categoryChain),
    currentCategoryItem: getCurrentTemplateCategoryItem(categoryChain),
    parentCategory: normalizeTemplateCategory(parentCategory, {
      type: parentCategoryType,
      url: parentCategoryUrl
    }),
    currentContent: normalizeTemplateContent(content, {
      type: contentType,
      url: contentUrl
    }),
    breadcrumb: buildLegacyBreadcrumbContext(breadcrumbItems, breadcrumbOptions)
  };
}

function normalizeTemplateSection(section) {
  if (!section) {
    return null;
  }
  return {
    type: section.type || '',
    name: section.name || '',
    url: section.url || ''
  };
}

function normalizeTemplateCategory(category, options = {}) {
  if (!category) {
    return null;
  }
  return {
    id: normalizeInteger(category.id, 0),
    type: options.type || '',
    name: category.name || '',
    url: options.url || '',
    parentId: normalizeInteger(category.parent_id, 0),
    parentName: options.parent?.name || '',
    seoKeywords: category.seo_keywords || '',
    seoDescription: category.seo_description || ''
  };
}

function normalizeTemplateCategoryChain(chain) {
  if (!Array.isArray(chain)) {
    return [];
  }
  return chain.filter(Boolean).map((item) => normalizeTemplateCategory(item.raw || item, item));
}

function getCurrentTemplateCategoryItem(chain) {
  const normalizedChain = normalizeTemplateCategoryChain(chain);
  return normalizedChain.at(-1) || null;
}

function buildTemplateCategoryChain({ category, categories, type, urlBuilder }) {
  if (!category) {
    return [];
  }

  const categoryMap = new Map((categories || []).map((item) => [normalizeInteger(item.id, 0), item]));
  const chain = [];
  const visited = new Set();
  let current = category;

  while (current) {
    const id = normalizeInteger(current.id, 0);
    if (visited.has(id)) {
      break;
    }
    visited.add(id);
    chain.unshift({
      raw: current,
      type,
      url: urlBuilder ? urlBuilder(current) : ''
    });

    const parentId = normalizeInteger(current.parent_id, 0);
    if (!parentId) {
      break;
    }
    current = categoryMap.get(parentId) || null;
  }

  return chain;
}

function normalizeTemplateContent(content, options = {}) {
  if (!content) {
    return null;
  }
  const title = content.title || content.name || '';
  return {
    id: normalizeInteger(content.id, 0),
    type: options.type || '',
    title,
    name: content.name || title,
    url: options.url || ''
  };
}

function buildLegacyBreadcrumbContext(items, options = {}) {
  const separatorHtml = options.separatorHtml ?? ' - ';
  const prefixHtml = options.prefixHtml ?? '<span>当前位置 : </span>';
  const normalizedItems = [
    {
      label: options.homeLabel ?? '公司主页',
      url: options.homeHref ?? '/index.html'
    }
  ];

  for (const item of items || []) {
    const label = String(item?.label || '').trim();
    if (!label) {
      continue;
    }
    normalizedItems.push({
      label,
      url: item.href || item.url || ''
    });
  }

  return {
    prefixHtml,
    separatorHtml,
    html: buildLegacyBreadcrumbHtml(normalizedItems, separatorHtml),
    items: normalizedItems
  };
}

function buildLegacyBreadcrumbHtml(items, separatorHtml) {
  return items.map((item) => {
    if (item.url) {
      return buildLegacyBreadcrumbLink(item.url, item.label);
    }
    return escapeHtml(item.label);
  }).join(separatorHtml);
}

function buildLegacyBreadcrumbLink(href, label) {
  return `<a href="${escapeHtmlAttribute(href)}">${escapeHtml(label)}</a>`;
}

function buildLegacyProductBreadcrumbItems(category, parent) {
  const items = [{ label: '产品展示', href: '/valve/' }];
  items.push(...buildLegacyProductCategoryBreadcrumbItems(category, parent));
  return items;
}

function buildLegacyProductCategoryBreadcrumbItems(category, parent) {
  const items = [];
  const parentName = String(parent?.name || '').trim();
  const categoryName = String(category?.name || '').trim();

  if (parentName && parentName !== '产品展示') {
    items.push({ label: parentName, href: buildLegacyProductCategoryUrl(parent) });
  }
  if (categoryName && categoryName !== '产品展示' && categoryName !== parentName) {
    items.push({ label: categoryName, href: buildLegacyProductCategoryUrl(category) });
  }

  return items;
}

function buildLegacyProductCategoryUrl(category) {
  const id = normalizeInteger(category?.id, 0);
  return id === 0 ? '/valve/index.html' : `/valve/${id}.html`;
}

function normalizeLegacyTemplateMarkup(value, site) {
  const companyName = site.company_name || site.web_name || '';
  const companyPhone = site.company_phone || '';
  const companyFax = site.company_fax || '';
  const companyMobile = site.web_mobile || '';
  const companyEmail = site.company_email || '';
  const siteUrl = site.web_url || '/';
  let output = String(value || '');

  output = output
    .replace(/\/Search\.asp\?action=search/gi, '/search')
    .replace(/\/search\.asp\?action=search/gi, '/search')
    .replace(/\/Search\.asp\b/gi, '/search')
    .replace(/\/search\.asp\b/gi, '/search')
    .replace(/\/ajaxcode\/prodMsg\.asp/gi, '/ajaxcode/prodmsg')
    .replace(/\/ajaxcode\/prodmsg\.asp/gi, '/ajaxcode/prodmsg')
    .replace(/\/ajaxcode\/msg\.asp/gi, '/ajaxcode/msg')
    .replace(/https?:\/\/(?:www\.)?bilvie\.com\/?/gi, siteUrl)
    .replace(/https?:\/\/(?:www\.)?bilwe\.com\/?/gi, siteUrl)
    .replace(/彪维阀门品牌/gi, '斯派莎克阀门品牌')
    .replace(/彪维流体设备/gi, companyName)
    .replace(/彪维流体设备（上海）有限公司|彪维流体设备\(上海\)有限公司|彪维阀门有限公司/gi, companyName)
    .replace(/alt="彪维流体设备"/gi, `alt="${escapeHtmlAttribute(companyName)}"`)
    .replace(/全国服务电话：\s*021-51602737/gi, companyPhone ? `全国服务电话：${companyPhone}` : '')
    .replace(/TEL:\s*021-51602737\s*18121314445/gi, buildLegacyTelText(companyPhone, companyMobile))
    .replace(/电话:\s*021-51602737/gi, companyPhone ? `电话:${companyPhone}` : '')
    .replace(/传真:\s*021-51062757/gi, companyFax ? `传真:${companyFax}` : '')
    .replace(/info@(?:<strong>)?spiraxsarcocn(?:<\/strong>)?\.com/gi, companyEmail);

  return output;
}

function buildLegacyTelText(companyPhone, companyMobile) {
  if (companyPhone && companyMobile) {
    return `TEL:${companyPhone} ${companyMobile}`;
  }
  if (companyPhone) {
    return `TEL:${companyPhone}`;
  }
  if (companyMobile) {
    return `TEL:${companyMobile}`;
  }
  return '';
}

function buildLegacyProductsMenu(categories) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  return `<table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">${roots.map((item) => `<li><a href="/valve/${item.id}.html"><span>${escapeHtml(item.name || '')}</span></a></li>`).join('')}</table>`;
}

function buildLegacyProductsMenuCompact(categories) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  return roots.map((item, index) => `${index > 0 ? '&nbsp;' : ''}<a href="/valve/${item.id}.html">${escapeHtml(item.name || '')}</a> |`).join('');
}

function buildLegacyAboutCategoryList(categories, rootId) {
  const items = categories.filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(rootId, 0));
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const href = normalizeInteger(item.is_external, 0) === 1 && item.external_url
      ? item.external_url
      : `about-${item.id}.html`;
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="${escapeHtml(href)}" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildLegacyCorporationMenuItems(categories, rootId, activeId = 0) {
  return categories
    .filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(rootId, 0))
    .map((item) => ({
      label: item.name || '',
      url: normalizeInteger(item.is_external, 0) === 1 && item.external_url
        ? item.external_url
        : `/about/about-${normalizeInteger(item.id, 0)}.html`,
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function buildLegacyNewsCategoryList(categories, rootId, dirName) {
  const items = categories.filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(rootId, 0));
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}><img src="/Skin/blue/Images/Co_left_ico.gif" width="15" height="13" /></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="/${dirName}/${item.id}.html" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildLegacyNewsMenuItems(categories, rootId, dirName, activeId = 0) {
  return categories
    .filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(rootId, 0))
    .map((item) => ({
      label: item.name || '',
      url: `/${dirName}/${normalizeInteger(item.id, 0)}.html`,
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function buildLegacyProductSmallCategories(categories) {
  let html = '<table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td><span class=abv>';
  categories.forEach((item) => {
    html += `&nbsp;【<A href="/products/${item.id}.html" class="0a">${escapeHtml(item.name || '')}</a>】`;
  });
  html += '</span></td></tr></table>';
  return html;
}

function buildLegacyProductMenuItems(categories, activeId = 0) {
  return (categories || [])
    .filter(Boolean)
    .map((item) => ({
      label: item.name || '',
      url: `/products/${normalizeInteger(item.id, 0)}.html`,
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function buildLegacyProductListItems(pageItems) {
  return pageItems.map((item, index) => ({
    id: item.id,
    name: item.name || '',
    url: `/Product/${item.id}.html`,
    image: item.small_image || '/skin/dfpic.gif',
    summary: gotTopicLegacy(item.summary || '', 90),
    rowOpenHtml: index === 0 ? '<tr>' : '',
    rowCloseHtml: (index + 1) % 2 === 0 ? '</tr><tr>' : '',
    placeholderHtml: pageItems.length === 1 && index === 0 ? '<td width="50%" valign="top" class="in6" height="100">&nbsp;</td>' : ''
  }));
}

function buildLegacyProductPager(fileStem, pageNumber, pageCount, totalRecords) {
  let html = '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
  html += `共 <strong>${totalRecords}</strong> 条信息 `;
  html += ` <a href="${fileStem}.html">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${fileStem}-${pageNumber - 1}.html">上一页</a>` : ' <span>上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${fileStem}-${pageNumber + 1}.html">下一页</a>` : ' <span>下一页</span>';
  html += ` <a href="${fileStem}-${pageCount}.html">末页</a>`;
  html += ` 页次：<strong> ${pageNumber}/${pageCount} </strong>页 <strong>${PRODUCT_LIST_PAGE_SIZE}</strong>条信息/页</td></tr></table>`;
  return html;
}

function writeProductCategoryPageSet({
  outputRoot,
  templateContext,
  category,
  parent,
  children,
  items,
  fileStem
}) {
  const pages = paginate(items, PRODUCT_LIST_PAGE_SIZE);
  const pageList = pages.length > 0 ? pages : [[]];
  let filesWritten = 0;

  for (let index = 0; index < pageList.length; index += 1) {
    const pageNumber = index + 1;
    const pageItems = pageList[index];
    const legacyHtml = renderCmsSitePage('legacy-product-list', buildLegacyProductListPageProps({
      templateContext,
      category,
      parent,
      children,
      pageItems,
      pageNumber,
      pageCount: pageList.length,
      totalRecords: items.length
    }), templateContext, {
      themeSlot: 'product_list',
      targets: [
        { target_type: 'product_category', target_id: normalizeInteger(category.id, 0) },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.product }
      ]
    });

    const fileName = buildLegacyListFileName(fileStem, pageNumber);
    writeTextFile(outputRoot, path.join('products', fileName), legacyHtml);
    filesWritten += 1;
    writeTextFile(outputRoot, path.join('valve', fileName), legacyHtml);
    filesWritten += 1;

    if (pageNumber === 1) {
      const firstPageFileName = `${fileStem}.html`;
      writeTextFile(outputRoot, path.join('products', firstPageFileName), legacyHtml);
      filesWritten += 1;
      writeTextFile(outputRoot, path.join('valve', firstPageFileName), legacyHtml);
      filesWritten += 1;
    }
  }

  return filesWritten;
}

function getDescendantProductCategoryIds(childrenByParent, rootId) {
  const pending = [normalizeInteger(rootId, 0)];
  const visited = new Set();

  while (pending.length > 0) {
    const currentId = pending.pop();
    if (visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const children = childrenByParent.get(currentId) || [];
    for (const child of children) {
      const childId = normalizeInteger(child.id, 0);
      if (childId !== 0 && !visited.has(childId)) {
        pending.push(childId);
      }
    }
  }

  return Array.from(visited);
}

function buildLegacyArticleListItems({ pageItems, summaryClassName }) {
  return pageItems.map((item) => {
    const summary = resolveRenderableNewsSummary(item);
    return {
      id: item.id,
      title: item.title || '',
      url: `detail/${item.id}.html`,
      date: formatLegacyDateOnly(item.created_at) || '',
      summary: gotTopicLegacy(summary || '', 230),
      summaryClassName: summaryClassName || ''
    };
  });
}

function buildLegacyArticlePager({ categoryId, pageNumber, pageCount, totalRecords }) {
  let html = '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
  html += `共 <strong>${totalRecords}</strong> 条信息 `;
  html += `<a href="${categoryId}-1.html" class="0a">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${categoryId}-${pageNumber - 1}.html" class="0a">上一页</a>` : ' <span class="0a">上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${categoryId}-${pageNumber + 1}.html" class="0a">下一页</a>` : ' <span class="0a">下一页</span>';
  html += ` <a href="${categoryId}-${pageCount}.html" class="0a">尾页</a> `;
  html += `页次：<strong> ${pageNumber}/${pageCount} </strong>页 <strong>${NEWS_LIST_PAGE_SIZE}</strong>条信息/页</td></tr></table>`;
  return html;
}

function buildLegacyRelatedProducts(products) {
  if (products.length === 0) {
    return '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td align="center">暂无相关产品</td></tr></table>';
  }

  let html = '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>';
  let index = 0;
  for (const item of products) {
    index += 1;
    const className = index % 4 !== 0 ? 'class="in5"' : '';
    html += `<td width="50%" height="90" align="center" valign="middle" ${className}>`;
    html += '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>';
    html += `<td width="100%" height="47" align="center" valign="middle" ${className}><img src="${escapeHtml(item.small_image || '/skin/dfpic.gif')}" alt="${escapeHtml(item.name || '')}" width="95" height="70" /></td>`;
    html += `</tr><tr><td align="center" height="20">&nbsp;<a href="${item.id}.html" class="Font_2E4690_a Font-Weight">${escapeHtml(item.name || '')}</a></td></tr></table>`;
    html += '</td>';
    if (index % 2 === 0) {
      html += '</tr><tr>';
    }
  }
  html += '</tr></table>';
  return html;
}

function buildLegacyIndexFeaturedProducts() {
  const items = queryAll(
    `
      SELECT id, name, summary, small_image
      FROM products
      WHERE is_featured_home = 1
      ORDER BY id DESC
      LIMIT 8
    `
  );

  let html = '';
  for (const item of items) {
    html += '<li>';
    html += `<img src="${escapeHtml(item.small_image || '/skin/dfpic.gif')}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}">`;
    html += `<li><a href="/Product/${item.id}.html" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${gotTopicLegacy(item.summary || '', 118)}</li>`;
    html += '</li>';
  }
  return html;
}

function buildLegacyIndexFeaturedProductLinks() {
  const items = queryAll(
    `
      SELECT id, name
      FROM products
      WHERE is_featured_home = 1
      ORDER BY id ASC
      LIMIT 32
    `
  );

  return items.map((item) => `<li><a href="/Product/${item.id}.html">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildLegacyIndexNews() {
  const items = queryAll(
    `
      SELECT id, title
      FROM news
      WHERE category_id IN (6, 17)
      ORDER BY id DESC
      LIMIT 10
    `
  );
  return items.map((item) => `<li><a href="/news/detail/${item.id}.html" class="Ba">${escapeHtml(item.title || '')}</a></li>`).join('');
}

function buildLegacyServiceIndex() {
  const items = queryAll(
    `
      SELECT id, title
      FROM news
      WHERE category_id IN (13, 14)
      ORDER BY id DESC
      LIMIT 16
    `
  );
  return items.map((item) => `<li><a href="/service/detail/${item.id}.html">${escapeHtml(item.title || '')}</a></li>`).join('');
}

function buildLegacyMessageSidebarProducts() {
  const items = queryAll(
    `
      SELECT id, name, small_image
      FROM products
      WHERE is_featured_home = 1
      ORDER BY id ASC
      LIMIT 3
    `
  );

  let html = '<table width="160" border="0" cellspacing="0">';
  for (const item of items) {
    html += '<tr>';
    html += `<td width="160" height="100" align="center"><img src="${escapeHtml(item.small_image || '/skin/dfpic.gif')}" alt="${escapeHtml(item.name || '')}" width="150" height="94" /></td>`;
    html += '</tr><tr>';
    html += `<td><a href="/Product/${item.id}.html" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  }
  html += '</table>';
  return html;
}

function getDescendantNewsCategoryIds(categories, rootId) {
  const childrenByParent = groupBy(categories, (item) => normalizeInteger(item.parent_id, 0));
  const collected = [normalizeInteger(rootId, 0)];

  function appendChildren(parentId) {
    for (const child of childrenByParent.get(parentId) || []) {
      const childId = normalizeInteger(child.id, 0);
      collected.push(childId);
      appendChildren(childId);
    }
  }

  appendChildren(normalizeInteger(rootId, 0));
  return collected;
}

function normalizeSections(sections) {
  const defaults = [
    'index',
    'contact',
    'msg',
    'corporation-pages',
    'news-lists',
    'news-details',
    'service-lists',
    'service-details',
    'product-lists',
    'product-details'
  ];
  if (!sections) {
    return new Set(defaults);
  }
  if (Array.isArray(sections)) {
    return new Set(sections);
  }
  return new Set([sections]);
}

function cleanupManagedStaticFiles(outputRoot) {
  for (const relativePath of MANAGED_STATIC_ROOT_FILES) {
    const filePath = path.resolve(outputRoot, relativePath);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
    }
  }

  for (const relativeDir of MANAGED_STATIC_DIRS) {
    const dirPath = path.resolve(outputRoot, relativeDir);
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      continue;
    }
    cleanupHtmlFilesRecursive(dirPath);
  }
}

function cleanupHtmlFilesRecursive(currentPath) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      cleanupHtmlFilesRecursive(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (extension === '.html' || extension === '.htm') {
      fs.unlinkSync(fullPath);
    }
  }
}

function writeTextFile(outputRoot, relativePath, content) {
  const filePath = path.resolve(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalizeLegacyRichTextHtml(content), 'utf8');
}

function groupBy(items, keyFn) {
  const buckets = new Map();
  for (const item of items) {
    const key = keyFn(item);
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key).push(item);
  }
  return buckets;
}

function paginate(items, pageSize) {
  if (items.length === 0) {
    return [];
  }
  const pages = [];
  for (let index = 0; index < items.length; index += pageSize) {
    pages.push(items.slice(index, index + pageSize));
  }
  return pages;
}

function compareBySortAndId(left, right) {
  return normalizeInteger(left.sort_order, 0) - normalizeInteger(right.sort_order, 0) || right.id - left.id;
}

function buildLegacyListFileName(categoryId, pageNumber) {
  return pageNumber > 1 ? `${categoryId}-${pageNumber}.html` : `${categoryId}-1.html`;
}

function filterByIdRange(items, idRange) {
  if (!idRange || (idRange.start == null && idRange.end == null)) {
    return items;
  }
  const start = idRange.start == null ? Number.MIN_SAFE_INTEGER : normalizeInteger(idRange.start, Number.MIN_SAFE_INTEGER);
  const end = idRange.end == null ? Number.MAX_SAFE_INTEGER : normalizeInteger(idRange.end, Number.MAX_SAFE_INTEGER);
  return items.filter((item) => item.id >= start && item.id <= end);
}

function createBuildResult(key, label, recordsProcessed, filesWritten) {
  return { key, label, recordsProcessed, filesWritten };
}

function resolveRenderableNewsSummary(item) {
  const summary = normalizeRenderableLegacyText(item?.summary);
  if (summary && !looksLikeLegacyMojibake(summary)) {
    return truncateRenderableNewsSummary(summary);
  }

  const keywords = normalizeRenderableLegacyText(item?.keywords);
  if (keywords && !looksLikeLegacyMojibake(keywords)) {
    return truncateRenderableNewsSummary(keywords);
  }

  const contentSummary = extractRenderableNewsContentSummary(item?.content_html);
  if (contentSummary) {
    return truncateRenderableNewsSummary(contentSummary);
  }

  return truncateRenderableNewsSummary(normalizeRenderableLegacyText(item?.title));
}

function extractRenderableNewsContentSummary(value) {
  const normalized = normalizeRenderableLegacyText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<\/div>/gi, ' ')
      .replace(/<\/li>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
  return normalized && !looksLikeLegacyMojibake(normalized) ? normalized : null;
}

function normalizeRenderableLegacyText(value) {
  let output = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  for (const pattern of LEGACY_MARKETING_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  for (const pattern of LEGACY_PRODUCT_BRAND_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  return output
    .replace(/^\s*[●•\-|,，、/]+\s*/g, '')
    .replace(/\s*[●•\-|,，、/]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateRenderableNewsSummary(value, maxLength = 230) {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function compareCategoryOrder(left, right) {
  return normalizeInteger(left.sort_order, 0) - normalizeInteger(right.sort_order, 0) || normalizeInteger(left.id, 0) - normalizeInteger(right.id, 0);
}

function normalizeCorporationCategoryRecord(row) {
  const legacyExtra = parseLegacyExtra(row.legacy_extra);
  return {
    ...row,
    content_html: String(legacyExtra.Centern ?? legacyExtra.content_html ?? '')
  };
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function gotTopicLegacy(value, maxLength) {
  let text = String(value || '')
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<');

  let length = 0;
  let output = '';
  for (const char of text) {
    const code = char.codePointAt(0) || 0;
    length += code > 255 ? 2 : 1;
    output += char;
    if (length >= maxLength) {
      break;
    }
  }

  return output
    .replaceAll(' ', '&nbsp;')
    .replaceAll('"', '&quot;')
    .replaceAll('>', '&gt;')
    .replaceAll('<', '&lt;');
}

function normalizeLegacyRichTextHtml(value) {
  const html = String(value || '').trim();
  if (!html) {
    return '';
  }
  const site = getSiteConfig();
  const companyName = site.company_name || site.web_name || '斯派莎克阀门制造有限公司';
  const siteUrl = site.web_url || '/';
  const companyEmail = site.company_email || '';

  let output = html
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<p[^>]*>\s*以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?\s*<\/p>/gi, '')
    .replace(/以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?/gi, '');

  for (const pattern of LEGACY_MARKETING_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  for (const pattern of LEGACY_PRODUCT_BRAND_PATTERNS) {
    output = output.replace(pattern, ' ');
  }

  output = normalizeLegacyMetaAttributes(output);

  return output
    .replaceAll('/service/detail/www.bilvie.com', siteUrl)
    .replaceAll('/service/detail/www.bilwe.com', siteUrl)
    .replaceAll('www.bilvie.com', siteUrl)
    .replaceAll('www.bilwe.com', siteUrl)
    .replace(/data-ke-src="[^"]*(?:bilvie|bilwe)\.com[^"]*"/gi, `data-ke-src="${escapeHtmlAttribute(siteUrl)}"`)
    .replace(/(?:https?:\/\/)?www\.(?:bilvie|bilwe)\.com/gi, siteUrl)
    .replace(/https?:\/\/(?:www\.)?bilvie\.com\/?/gi, siteUrl)
    .replace(/https?:\/\/(?:www\.)?bilwe\.com\/?/gi, siteUrl)
    .replace(/彪维阀门品牌/gi, '斯派莎克阀门品牌')
    .replace(/彪维流体设备（上海）有限公司|彪维流体设备\(上海\)有限公司|彪维阀门有限公司/gi, companyName)
    .replace(/彪维流体设备/gi, companyName)
    .replace(/<a[^>]*>\s*彪维\s*<\/a>\s*流体/gi, companyName)
    .replace(/彪维流体/gi, companyName)
    .replace(/彪维阀门集团/gi, companyName)
    .replace(/合资牌彪维/gi, '合资品牌')
    .replace(/彪维专业生产/gi, '专业生产')
    .replace(/彪维公司的/gi, '公司的')
    .replace(/彪维公司/gi, '公司')
    .replace(/<strong>\s*彪维\s*<\/strong>(\s*<a\b)/gi, '$1')
    .replace(/【\s*彪维\s*】/gi, '')
    .replace(/我公司彪维/gi, '我公司')
    .replace(/alt="彪维流体设备"/gi, `alt="${escapeHtmlAttribute(companyName)}"`)
    .replace(/info@(?:<strong>)?spiraxsarcocn(?:<\/strong>)?\.com/gi, companyEmail)
    .replace(/href="https?:\/\/\/+"/gi, 'href="/"')
    .replace(/data-ke-src="https?:\/\/\/+"/gi, 'data-ke-src="/"')
    .replace(/https?:\/\/\/+(?=[^/"])/gi, '/')
    .replace(/https?:\/\/(?:www\.)?spiraxsarcocn\.com(\/[^\s"'<>]*)?/gi, (_, relativePath = '/') => relativePath || '/')
    .replace(/https?:\/\/(?:www\.)?(?:bilvie\.com|bilwe\.com)(\/(?:Product|product|products|valve)\/\d+(?:-\d+)?\.html)/gi, '$1')
    .replace(/https?:\/\/(?:www\.)?(?:bilvie\.com|bilwe\.com)(\/(?:news|service)\/detail\/\d+\.html)/gi, '$1')
    .replace(/https?:\/\/(?:www\.)?(?:spiraxsarcocn\.com|bilvie\.com|bilwe\.com)(\/UploadFile\/[^\s"'<>]+)/gi, '$1')
    .replace(/https?:\/\/(?:www\.)?(?:spiraxsarcocn\.com|bilvie\.com|bilwe\.com)(\/uploadfile\/[^\s"'<>]+)/gi, (_, relativePath) => {
      return relativePath.replace(/^\/uploadfile\//i, '/UploadFile/');
    })
    .replace(/(["'(=])\/uploadfile\//gi, '$1/UploadFile/');
}

function normalizeLegacyMetaAttributes(html) {
  return html.replace(/<meta\s+name="(keywords|description)"\s+content="([^"]*)"/gi, (_, name, content) => {
    const sanitized = sanitizeLegacyMetaContent(content, name.toLowerCase());
    return `<meta name="${name}" content="${escapeHtmlAttribute(sanitized)}"`;
  });
}

function sanitizeLegacyMetaContent(value, type) {
  const normalized = normalizeRenderableLegacyText(value);
  if (!normalized) {
    return '';
  }
  if (type === 'keywords') {
    const parts = normalized
      .split(/[|,，]+/)
      .map((item) => normalizeRenderableLegacyText(item))
      .filter((item) => item && !looksLikeLegacyMojibake(item));
    return Array.from(new Set(parts)).join(',');
  }
  if (!looksLikeLegacyMojibake(normalized)) {
    return normalized;
  }

  const parts = normalized
    .split(/[|]+/)
    .map((item) => normalizeRenderableLegacyText(item))
    .filter((item) => item && !looksLikeLegacyMojibake(item));

  return Array.from(new Set(parts)).join(' ');
}

function escapeHtmlAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function formatLegacyDateOnly(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return '';
  }

  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (matched) {
    return matched[1];
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
