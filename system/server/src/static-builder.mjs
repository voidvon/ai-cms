import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, SYSTEM_ROOT, TEMPLATE_ROOT } from './config.mjs';
import { getDb, queryAll, queryOne } from './db.mjs';
import { listContacts } from './services/contacts.mjs';
import { listNewsCategories } from './services/news-categories.mjs';
import { listNews } from './services/news.mjs';
import { listProductCategories } from './services/product-categories.mjs';
import { listProducts } from './services/products.mjs';
import { getSiteConfig } from './services/site.mjs';
import { escapeHtml } from './utils/html.mjs';
import { looksLikeLegacyMojibake } from './utils/legacy-text.mjs';

const DEFAULT_OUTPUT_ROOT = CONTENT_ROOT;
const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;
const JOB_LIST_PAGE_SIZE = 8;
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
const MANAGED_STATIC_DIRS = ['about', 'job', 'news', 'product', 'products', 'service', 'valve'];

export function buildStaticSite({ outputRoot = DEFAULT_OUTPUT_ROOT, sections, cleanExisting = false } = {}) {
  getDb();

  const normalizedOutputRoot = path.resolve(outputRoot);
  const requestedSections = normalizeSections(sections);
  const results = [];

  fs.mkdirSync(normalizedOutputRoot, { recursive: true });
  if (cleanExisting) {
    cleanupManagedStaticFiles(normalizedOutputRoot);
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
  if (requestedSections.has('job-lists')) {
    results.push(buildJobIndexPages({ outputRoot: normalizedOutputRoot }));
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
  if (requestedSections.has('job-details')) {
    results.push(buildJobDetailPages({ outputRoot: normalizedOutputRoot }));
  }

  return {
    outputRoot: normalizedOutputRoot,
    results,
    totalFiles: results.reduce((sum, item) => sum + item.filesWritten, 0),
    totalRecords: results.reduce((sum, item) => sum + item.recordsProcessed, 0)
  };
}

export function buildIndexPage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.home_index, '首页模板');
  const html = renderLegacyIndexPage(template, templateContext);

  writeTextFile(outputRoot, 'index.html', html);
  return createBuildResult('index', '首页', 1, 1);
}

export function buildContactPage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const templatePath = templateContext.variant?.contact || guessSiblingTemplatePath(templateContext.variant?.home_index, 'contact.htm');
  const template = requireLegacyTemplate(templatePath, '联系页面模板');
  const html = renderLegacyContactPage(template, templateContext);

  writeTextFile(outputRoot, 'contact.html', html);
  return createBuildResult('contact', '联系页面', 1, 1);
}

export function buildMessagePage({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const templatePath = templateContext.variant?.msg_index || guessSiblingTemplatePath(templateContext.variant?.home_index, 'msg.htm');
  const template = requireLegacyTemplate(templatePath, '留言页面模板');
  const html = renderLegacyMessagePage(template, templateContext);

  writeTextFile(outputRoot, 'msg.html', html);
  return createBuildResult('msg', '留言页面', 1, 1);
}

export function buildCorporationPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.co_index, '公司栏目模板');
  const items = templateContext.corporationCategories
    .filter((item) => normalizeInteger(item.parent_id, 0) === CORPORATION_ROOT_ID && normalizeInteger(item.is_external, 0) === 0);

  let filesWritten = 0;

  for (const [index, item] of items.entries()) {
    const html = renderLegacyCorporationPage({ template, templateContext, item });

    writeTextFile(outputRoot, path.join('about', `about-${item.id}.html`), html);
    filesWritten += 1;

    if (index === 0) {
      writeTextFile(outputRoot, path.join('about', 'index.html'), html);
      filesWritten += 1;
    }
  }

  return createBuildResult('corporation-pages', '公司栏目页', items.length, filesWritten);
}

export function buildNewsCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  return buildLegacyNewsSectionCategoryPages({
    outputRoot,
    rootId: NEWS_ROOT_ID,
    dirName: 'news',
    sectionKey: 'news-lists',
    sectionLabel: '新闻分类页',
    templateField: 'news_sort1',
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
    templateField: 'service_sort1',
    summaryClassName: '0a'
  });
}

export function buildProductCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const categories = listProductCategories();
  const products = listProducts({ visibleOnly: false, limit: 10000 });
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.produts_sort2, '产品分类模板');
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
    template,
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
      template,
      templateContext,
      category,
      parent,
      children,
      items,
      fileStem: String(categoryId)
    });
  }

  return createBuildResult('product-lists', '产品分类页', categories.filter((item) => normalizeInteger(item.id, 0) !== 0).length, filesWritten);
}

export function buildJobIndexPages({ outputRoot = DEFAULT_OUTPUT_ROOT } = {}) {
  const items = queryAll(
    `
      SELECT
        id,
        name,
        address,
        openings,
        contact_person,
        phone,
        is_active,
        requirements_html,
        created_at
      FROM jobs
      WHERE is_active = 1
      ORDER BY coalesce(created_at, '') DESC, id DESC
    `
  );
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.job_index, '招聘列表模板');
  const pages = paginate(items, JOB_LIST_PAGE_SIZE);
  const pageList = pages.length > 0 ? pages : [[]];
  let filesWritten = 0;

  for (let index = 0; index < pageList.length; index += 1) {
    const pageNumber = index + 1;
    const pageItems = pageList[index];
    const html = renderLegacyJobIndexPage({
      template,
      templateContext,
      pageItems,
      pageNumber,
      pageCount: pageList.length,
      totalRecords: items.length
    });

    writeTextFile(outputRoot, path.join('job', `${pageNumber}.html`), html);
    filesWritten += 1;

    if (pageNumber === 1) {
      writeTextFile(outputRoot, path.join('job', 'index.html'), html);
      filesWritten += 1;
    }
  }

  return createBuildResult('job-lists', '招聘列表页', items.length, filesWritten);
}

export function buildProductDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  const products = filterByIdRange(listProducts({ visibleOnly: false, limit: 10000 }), idRange);
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.produts_detail, '产品详情模板');
  const productMap = groupBy(products, (item) => normalizeInteger(item.category_id, 0));
  let filesWritten = 0;

  for (const product of products) {
    const categoryProducts = (productMap.get(normalizeInteger(product.category_id, 0)) || []).filter((item) => item.id !== product.id);
    const relatedProducts = categoryProducts.slice().sort(compareBySortAndId).slice(0, 4);
    const html = renderLegacyProductDetailPage({
      template,
      templateContext,
      product,
      relatedProducts
    });

    writeTextFile(outputRoot, path.join('product', `${product.id}.html`), html);
    filesWritten += 1;
  }

  return createBuildResult('product-details', '产品详情页', products.length, filesWritten);
}

export function buildNewsDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  return buildLegacyNewsSectionDetailPages({
    outputRoot,
    idRange,
    rootId: NEWS_ROOT_ID,
    dirName: 'news',
    sectionKey: 'news-details',
    sectionLabel: '新闻详情页',
    templateField: 'news_detail'
  });
}

export function buildServiceDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  return buildLegacyNewsSectionDetailPages({
    outputRoot,
    idRange,
    rootId: SERVICE_ROOT_ID,
    dirName: 'service',
    sectionKey: 'service-details',
    sectionLabel: '服务详情页',
    templateField: 'service_detail'
  });
}

export function buildJobDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange } = {}) {
  const jobs = filterByIdRange(queryAll(
    `
      SELECT
        id,
        name,
        address,
        openings,
        contact_person,
        phone,
        is_active,
        requirements_html,
        created_at
      FROM jobs
      WHERE is_active = 1
      ORDER BY id ASC
    `
  ), idRange);
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.job_detail, '招聘详情模板');
  let filesWritten = 0;

  for (const job of jobs) {
    const html = renderLegacyJobDetailPage({ template, templateContext, job });

    writeTextFile(outputRoot, path.join('job', 'detail', `${job.id}.html`), html);
    filesWritten += 1;
  }

  return createBuildResult('job-details', '招聘详情页', jobs.length, filesWritten);
}

function buildLegacyNewsSectionCategoryPages({
  outputRoot,
  rootId,
  dirName,
  sectionKey,
  sectionLabel,
  templateField,
  summaryClassName
}) {
  const categories = listNewsCategories();
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.[templateField], `${sectionLabel}模板`);
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
      const html = renderLegacyNewsCategoryPage({
        template,
        templateContext,
        category,
        pageItems: currentItems,
        pageNumber,
        pageCount: pageList.length,
        totalRecords: pageItems.length,
        dirName,
        summaryClassName
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

  return createBuildResult(sectionKey, sectionLabel, categoryList.length, filesWritten);
}

function buildLegacyNewsSectionDetailPages({
  outputRoot,
  idRange,
  rootId,
  dirName,
  sectionKey,
  sectionLabel,
  templateField
}) {
  const categories = listNewsCategories();
  const templateContext = getLegacyTemplateContext();
  const template = requireLegacyTemplate(templateContext.variant?.[templateField], `${sectionLabel}模板`);
  const allowedCategoryIds = new Set(getDescendantNewsCategoryIds(categories, rootId));
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const items = filterByIdRange(
    listNews({ limit: 10000 })
      .filter((item) => allowedCategoryIds.has(normalizeInteger(item.category_id, 0)))
      .slice()
      .sort((left, right) => left.id - right.id),
    idRange
  );
  const categoryBuckets = groupBy(items, (item) => normalizeInteger(item.category_id, 0));
  let filesWritten = 0;

  for (const item of items) {
    const siblings = (categoryBuckets.get(normalizeInteger(item.category_id, 0)) || []).slice().sort((left, right) => left.id - right.id);
    const currentIndex = siblings.findIndex((entry) => entry.id === item.id);
    const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    const category = categoryMap.get(normalizeInteger(item.category_id, 0));
    const html = renderLegacyNewsDetailPage({
      template,
      templateContext,
      item,
      category,
      previous,
      next
    });

    writeTextFile(outputRoot, path.join(dirName, 'detail', `${item.id}.html`), html);
    filesWritten += 1;
  }

  return createBuildResult(sectionKey, sectionLabel, items.length, filesWritten);
}

function renderLegacyProductCategoryPage({ template, templateContext, category, parent, children, pageItems, pageNumber, pageCount, totalRecords }) {
  const siblingCategories = parent
    ? templateContext.productCategories.filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(parent.id, 0))
    : children;
  const fileStem = normalizeInteger(category.id, 0) === 0 ? 'index' : String(category.id);
  const pageBody = buildLegacyProductCategoryBody(pageItems, fileStem, pageNumber, pageCount, totalRecords);
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#Hope_SmallName#', category.name || '')
    .replaceAll('#Hope_BigID#', String(normalizeInteger(parent?.id, category.id)))
    .replaceAll('#Hope_BigName#', parent?.name || category.name || '')
    .replaceAll('#Hope_ProductsSmallCat#', buildLegacyProductSmallCategories(siblingCategories.length > 0 ? siblingCategories : [category]))
    .replaceAll('#Hope_body#', pageBody)
    .replaceAll('#HOPE_prodKeywords#', category.seo_keywords || category.name || '');
}

function renderLegacyCorporationPage({ template, templateContext, item }) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#HOPE_Title#', item.name || '')
    .replaceAll('#HOPE_TITLE#', item.name || '')
    .replaceAll('#HOPE_Co_Centern#', normalizeLegacyRichTextHtml(item.content_html) || '');
}

function renderLegacyIndexPage(template, templateContext) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#newsindex()#', buildLegacyIndexNews())
    .replaceAll('#prodIndex()#', buildLegacyIndexFeaturedProducts())
    .replaceAll('#prodIndex1()#', buildLegacyIndexFeaturedProductLinks())
    .replaceAll('#serviceindex()#', buildLegacyServiceIndex());
}

function renderLegacyContactPage(template, templateContext) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#HOPE_Contact()#', buildLegacyContactTable());
}

function renderLegacyMessagePage(template, templateContext) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#msgIndex()#', buildLegacyMessageSidebarProducts());
}

function renderLegacyProductDetailPage({ template, templateContext, product, relatedProducts }) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#HOPE_TITLE#', product.name || '')
    .replaceAll('#HOPE_prodKeywords#', product.keywords || '')
    .replaceAll('#HOPE_prodDescription#', product.summary || '')
    .replaceAll('#HOPE_IMG#', product.small_image || '/skin/dfpic.gif')
    .replaceAll('#HOPE_ProdCode#', product.code || '')
    .replaceAll('#Hope_Random#', buildLegacyRelatedProducts(relatedProducts))
    .replaceAll('#HOPE_BODY#', normalizeLegacyRichTextHtml(product.content_html) || '');
}

function renderLegacyNewsDetailPage({ template, templateContext, item, category, previous, next }) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#HOPE_TITLE#', item.title || '')
    .replaceAll('#HOPE_NewsKeywords#', item.keywords || '')
    .replaceAll('#HOPE_NewsDescription#', resolveRenderableNewsSummary(item) || '')
    .replaceAll('#Hope_TypeID#', String(normalizeInteger(item.category_id, 0)))
    .replaceAll('#Hope_Catname#', category?.name || '')
    .replaceAll('#Hope_body#', normalizeLegacyRichTextHtml(item.content_html) || '')
    .replaceAll('#Hope_Previous#', previous ? `<a href="${previous.id}.html" class="Font_2e4690_a ">${escapeHtml(previous.title || '')}</a>` : '<span class="Font_2e4690_a">没有上一篇</span>')
    .replaceAll('#Hope_Next#', next ? `<a href="${next.id}.html" class="Font_2e4690_a ">${escapeHtml(next.title || '')}</a>` : '<span class="Font_2e4690_a">没有下一篇</span>');
}

function renderLegacyNewsCategoryPage({
  template,
  templateContext,
  category,
  pageItems,
  pageNumber,
  pageCount,
  totalRecords,
  dirName,
  summaryClassName
}) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#HOPE_CatID#', String(normalizeInteger(category.id, 0)))
    .replaceAll('#Hope_CatID#', String(normalizeInteger(category.id, 0)))
    .replaceAll('#HOPE_Title#', category.name || '')
    .replaceAll('#HOPE_TITLE#', category.name || '')
    .replaceAll('#Hope_body#', buildLegacyNewsCategoryBody({
      pageItems,
      categoryId: normalizeInteger(category.id, 0),
      pageNumber,
      pageCount,
      totalRecords,
      summaryClassName
    }));
}

function renderLegacyJobIndexPage({ template, templateContext, pageItems, pageNumber, pageCount, totalRecords }) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#Hope_body#', buildLegacyJobListBody({ pageItems, pageNumber, pageCount, totalRecords }));
}

function renderLegacyJobDetailPage({ template, templateContext, job }) {
  return applyLegacyTemplateCommon(template, templateContext)
    .replaceAll('#Hope_TITLE#', job.name || '')
    .replaceAll('#Hope_address#', job.address || '')
    .replaceAll('#Hope_jobnob#', job.openings || '')
    .replaceAll('#Hope_jobneed#', normalizeLegacyRichTextHtml(job.requirements_html) || '')
    .replaceAll('#Hope_linkren#', job.contact_person || '')
    .replaceAll('#Hope_phone#', job.phone || '')
    .replaceAll('#Hope_date#', formatLegacyDateOnly(job.created_at) || '');
}

function applyLegacyTemplateCommon(template, templateContext) {
  const site = templateContext.site;
  let html = template;

  for (const [name, content] of templateContext.customLabels.entries()) {
    html = html.replaceAll(name, content || '');
  }

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
  html = html.replace(/#HOPE_Meta_Title\((\d+)\)#/g, (_, id) => templateContext.metaTypes.get(Number(id))?.title || '');
  html = html.replace(/#hope_meta_title\((\d+)\)#/gi, (_, id) => templateContext.metaTypes.get(Number(id))?.title || '');
  html = html.replace(/#HOPE_Meta_Keywords\((\d+)\)#/g, (_, id) => templateContext.metaTypes.get(Number(id))?.meta_keywords || '');
  html = html.replace(/#hope_meta_keywords\((\d+)\)#/gi, (_, id) => templateContext.metaTypes.get(Number(id))?.meta_keywords || '');
  html = html.replace(/#HOPE_Meta_Description\((\d+)\)#/g, (_, id) => templateContext.metaTypes.get(Number(id))?.meta_descriptions || '');
  html = html.replace(/#hope_meta_description\((\d+)\)#/gi, (_, id) => templateContext.metaTypes.get(Number(id))?.meta_descriptions || '');

  return normalizeLegacyTemplateMarkup(html, site);
}

function getLegacyTemplateContext() {
  const variant = queryOne('SELECT * FROM template_variants WHERE is_selected = 1 ORDER BY id ASC LIMIT 1') || null;
  const site = getSiteConfig();
  const customLabels = new Map(
    queryAll('SELECT name, content FROM custom_labels').map((row) => [
      row.name,
      normalizeLegacyTemplateMarkup(row.content || '', site)
    ])
  );
  const metaTypes = new Map(queryAll('SELECT id, title, meta_keywords, meta_descriptions FROM meta_types').map((row) => [row.id, row]));

  return {
    variant,
    customLabels,
    metaTypes,
    site,
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

function requireLegacyTemplate(templatePath, label) {
  const template = loadLegacyTemplate(templatePath);
  if (!template) {
    const displayPath = String(templatePath || '').trim() || '(未配置)';
    throw new Error(`${label}不存在或无法加载: ${displayPath}`);
  }
  return template;
}

function loadLegacyTemplate(templatePath) {
  if (!templatePath) {
    return null;
  }
  const filePath = resolveCaseInsensitivePath(String(templatePath));
  if (!filePath) {
    return null;
  }
  return fs.readFileSync(filePath, 'utf8');
}

function guessSiblingTemplatePath(sourcePath, fileName) {
  const cleanPath = String(sourcePath || '').trim();
  if (!cleanPath) {
    return null;
  }
  const normalized = cleanPath.replace(/\\/g, '/');
  const lastSlashIndex = normalized.lastIndexOf('/');
  if (lastSlashIndex < 0) {
    return null;
  }
  return `${normalized.slice(0, lastSlashIndex + 1)}${fileName}`;
}

function resolveCaseInsensitivePath(relativePath) {
  const cleanPath = String(relativePath || '').replace(/^[/\\]+/, '');
  if (!cleanPath) {
    return null;
  }

  const candidates = [cleanPath];
  const normalized = cleanPath.replace(/\\/g, '/');
  if (normalized.toLowerCase().startsWith('templates/')) {
    candidates.push(normalized.slice('templates/'.length));
  }
  if (normalized.toLowerCase().startsWith('templets/')) {
    candidates.push(normalized.slice('templets/'.length));
  }

  for (const candidate of candidates) {
    const resolved = resolveCaseInsensitiveWithinRoot(SYSTEM_ROOT, candidate);
    if (resolved) {
      return resolved;
    }
    const resolvedTemplate = resolveCaseInsensitiveWithinRoot(TEMPLATE_ROOT, candidate);
    if (resolvedTemplate) {
      return resolvedTemplate;
    }
  }

  return null;
}

function resolveCaseInsensitiveWithinRoot(rootDir, relativePath) {
  const directPath = path.join(rootDir, relativePath);
  if (fs.existsSync(directPath)) {
    return directPath;
  }

  let currentPath = rootDir;
  for (const segment of String(relativePath).split(/[\\/]+/).filter(Boolean)) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    const match = entries.find((entry) => entry.name.toLowerCase() === segment.toLowerCase());
    if (!match) {
      return null;
    }
    currentPath = path.join(currentPath, match.name);
  }

  return currentPath;
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

function buildLegacyProductSmallCategories(categories) {
  let html = '<table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td><span class=abv>';
  categories.forEach((item) => {
    html += `&nbsp;【<A href="/products/${item.id}.html" class="0a">${escapeHtml(item.name || '')}</a>】`;
  });
  html += '</span></td></tr></table>';
  return html;
}

function buildLegacyProductCategoryBody(pageItems, fileStem, pageNumber, pageCount, totalRecords) {
  let html = '<table width="98%" border="0" cellpadding="0" cellspacing="0" align="center"><tr>';
  let rowItemCount = 0;

  for (const item of pageItems) {
    rowItemCount += 1;
    html += '<td width="50%" valign="top" class="in6" height="100">';
    html += '<table width="100%" height="100" border="0" cellpadding="0" cellspacing="0"><tr>';
    html += `<td width="39%" rowspan="2"><img src="${escapeHtml(item.small_image || '/skin/dfpic.gif')}" alt="${escapeHtml(item.name || '')}" width="180" height="138" /></td>`;
    html += `<td width="61%" height="20"><a href="/Product/${item.id}.html" class="Font_2E4690_a in4">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr><tr>';
    html += `<td valign="top">${gotTopicLegacy(item.summary || '', 90)}</td>`;
    html += '</tr></table>';
    html += '</td>';
    if (rowItemCount % 2 === 0) {
      html += '</tr><tr>';
    }
  }

  if (pageItems.length === 1) {
    html += '<td width="50%" valign="top" class="in6" height="100">&nbsp;</td>';
  }

  html += '</tr></table>';
  html += '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
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
  template,
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
    const html = renderLegacyProductCategoryPage({
      template,
      templateContext,
      category,
      parent,
      children,
      pageItems,
      pageNumber,
      pageCount: pageList.length,
      totalRecords: items.length
    });

    const fileName = buildLegacyListFileName(fileStem, pageNumber);
    writeTextFile(outputRoot, path.join('products', fileName), html);
    filesWritten += 1;
    writeTextFile(outputRoot, path.join('valve', fileName), html);
    filesWritten += 1;

    if (pageNumber === 1) {
      const firstPageFileName = `${fileStem}.html`;
      writeTextFile(outputRoot, path.join('products', firstPageFileName), html);
      filesWritten += 1;
      writeTextFile(outputRoot, path.join('valve', firstPageFileName), html);
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

function buildLegacyNewsCategoryBody({ pageItems, categoryId, pageNumber, pageCount, totalRecords, summaryClassName }) {
  let html = '';

  for (const item of pageItems) {
    const summary = resolveRenderableNewsSummary(item);
    html += '<table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">';
    html += '<tr>';
    html += '<td width="19" height="20" align="center" valign="middle" class="news_bottom_line">&nbsp;<img src="../../Skin/blue/Images/triangle.jpg" width="3" height="5" /></td>';
    html += `<td width="726" valign="middle" class="news_bottom_line Font-Weight"><a href="detail/${item.id}.html" class="Font_2e4690_a ">${escapeHtml(item.title || '')}</a> | ${escapeHtml(formatLegacyDateOnly(item.created_at) || '')}  </td>`;
    html += '</tr><tr>';
    html += `<td height="50" colspan="2" valign="middle" class="news_bottom_line news_sp ${escapeHtml(summaryClassName)}" >${gotTopicLegacy(summary || '', 230)}</td>`;
    html += '</tr></table>';
  }

  html += '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
  html += `共 <strong>${totalRecords}</strong> 条信息 `;
  html += `<a href="${categoryId}-1.html" class="0a">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${categoryId}-${pageNumber - 1}.html" class="0a">上一页</a>` : ' <span class="0a">上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${categoryId}-${pageNumber + 1}.html" class="0a">下一页</a>` : ' <span class="0a">下一页</span>';
  html += ` <a href="${categoryId}-${pageCount}.html" class="0a">尾页</a> `;
  html += `页次：<strong> ${pageNumber}/${pageCount} </strong>页 <strong>${NEWS_LIST_PAGE_SIZE}</strong>条信息/页</td></tr></table>`;
  return html;
}

function buildLegacyJobListBody({ pageItems, pageNumber, pageCount, totalRecords }) {
  let html = '<table width="100%" border="1" cellpadding="0" cellspacing="0" bordercolor="#CCCCCC">';
  for (const item of pageItems) {
    html += '<tr>';
    html += `<td width="59%" height="30">&nbsp;&nbsp;◆&nbsp;&nbsp;<a href="detail/${item.id}.html" class="Font_000000_B_a">${escapeHtml(item.name || '')}</a></td>`;
    html += `<td width="13%" align="center">${escapeHtml(item.openings || '')}</td>`;
    html += `<td width="18%" align="center">${escapeHtml(item.address || '')}</td>`;
    html += `<td width="10%" align="center">${escapeHtml(formatLegacyDateOnly(item.created_at) || '')}</td>`;
    html += '</tr>';
  }
  html += '</table>';
  html += '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td height="50" align="center">';
  html += `共 ${totalRecords} 条信息 <a href="1.html" class="Font_000000_a">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${pageNumber - 1}.html" class="Font_000000_a">上一页</a>` : ' <span class="Font_000000_a">上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${pageNumber + 1}.html" class="Font_000000_a">下一页</a>` : ' <span class="Font_000000_a">下一页</span>';
  html += ` <a href="${pageCount}.html" class="Font_000000_a">尾页</a> 页次： ${pageNumber}/${pageCount} 页 ${JOB_LIST_PAGE_SIZE}条信息/页</td></tr></table>`;
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

function buildLegacyContactTable() {
  const contacts = listContacts();
  let html = '<table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"><tr>';
  let index = 0;

  for (const item of contacts) {
    index += 1;
    html += '<td width="50%"><DIV style="PADDING-TOP:8px"></div>';
    html += '<table width="100%" border="0" cellpadding="0" cellspacing="0">';
    html += `<tr><td height="20" colspan="2" class="Font-Weight Font_2E4690_a Font_Offices">&nbsp;${escapeHtml(item.office_name || '')}</td></tr>`;
    html += `<tr><td width="14%" height="20">&nbsp;地&nbsp;&nbsp;址：</td><td width="86%">&nbsp;${escapeHtml(item.address || '')}</td></tr>`;
    html += `<tr><td height="20">&nbsp;电&nbsp;&nbsp;话：</td><td>&nbsp;${escapeHtml(item.phone || '')}</td></tr>`;
    html += `<tr><td height="20">&nbsp;传&nbsp;&nbsp;真：</td><td>&nbsp;${escapeHtml(item.fax || '')}</td></tr>`;
    html += `<tr><td height="20">&nbsp;联系人：</td><td>&nbsp;${escapeHtml(item.contact_person || '')}</td></tr>`;
    html += `<tr><td height="20">&nbsp;邮&nbsp;&nbsp;箱：</td><td>&nbsp;${escapeHtml(item.email || '')}</td></tr>`;
    html += `<tr><td height="20">&nbsp;邮&nbsp;&nbsp;编：</td><td>&nbsp;${escapeHtml(item.postal_code || '')}</td></tr>`;
    html += '</table></td>';
    if (index % 2 === 0) {
      html += '</tr><tr>';
    }
  }

  html += '</tr></table>';
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
    'product-details',
    'job-lists',
    'job-details'
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
