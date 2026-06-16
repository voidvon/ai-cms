import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, PUBLIC_ROOT } from './config.mjs';
import { getDb, queryAll } from './db.mjs';
import { createCmsTemplateRuntime } from './cms-template-runtime.mjs';
import { listColumns } from './services/columns.mjs';
import { listColumnCategories } from './services/column-categories.mjs';
import {
  buildColumnTreeIndex,
  getDescendantColumnIds,
  isColumnUnderRoot
} from './services/column-tree.mjs';
import { listNews } from './services/news.mjs';
import { listProducts } from './services/products.mjs';
import { buildRobotsTxt } from './services/robots.mjs';
import { buildSitemap } from './services/sitemap.mjs';
import { buildLlmsFiles } from './services/llms.mjs';
import {
  buildColumnPublicUrl,
  resolveLegacyCategoryPublicId,
  resolvePublicSectionContext
} from './services/public-sections.mjs';
import {
  buildRelativeCategoryPathFromRoutePath,
  buildCategorySlugPath,
  buildNewsDetailOutputPath,
  buildNewsDetailPublicUrl,
  buildProductCategoryPublicUrl,
  buildProductDetailOutputPath,
  buildProductDetailPublicUrl,
  resolveColumnRouteOutputPath
} from './services/column-paths.mjs';
import { getSiteConfig } from './services/site.mjs';
import { ensureTemplatesSchema } from './services/templates.mjs';
import { listLanguages } from './services/languages.mjs';
import { escapeHtml } from './utils/html.mjs';
import { looksLikeLegacyMojibake } from './utils/legacy-text.mjs';
import { normalizeUploadedRelativePath } from './services/uploads.mjs';
import {
  buildSeoMeta,
  buildHreflangLinks,
  buildJsonLdOrganization,
  buildJsonLdProduct,
  buildJsonLdArticle,
  buildProductSeoMeta,
  buildArticleSeoMeta,
  generateFaviconLinks,
  generateThemeColorMetas
} from './services/seo-meta.mjs';

const DEFAULT_OUTPUT_ROOT = CONTENT_ROOT;
const PRODUCT_LIST_PAGE_SIZE = 14;
const NEWS_LIST_PAGE_SIZE = 6;

// 全局分类目录映射，在静态生成时填充
let globalCategorySlugMap = new Map();
let globalCategoryMap = new Map(); // 新增：存储完整的分类对象映射

/**
 * 设置全局分类目录映射
 */
function setGlobalCategorySlugMap(categories) {
  globalCategoryMap = new Map(
    categories.map(cat => [normalizeInteger(cat.id, 0), cat])
  );

  // 为每个分类构建完整的目录路径
  globalCategorySlugMap = new Map(
    categories.map(cat => {
      const slugPath = buildCategorySlugPath(cat, globalCategoryMap);
      return [normalizeInteger(cat.id, 0), slugPath.join('/')];
    })
  );
}

function buildProductUrl(product, categorySlugPath = null) {
  if (!categorySlugPath && product.column_id) {
    categorySlugPath = globalCategorySlugMap.get(normalizeInteger(product.column_id, 0));
  }
  return buildProductDetailPublicUrl(product, categorySlugPath);
}

function buildArticleUrl(entry, templateContext, sectionOverride = null) {
  const publicSections = templateContext?.publicSections;
  const section = sectionOverride
    || publicSections?.getNewsSectionByColumnId?.(normalizeInteger(entry?.column_id, 0))
    || null;
  const sectionDir = String(section?.dirName || 'news').trim();
  const detailRule = section?.rootColumn?.detail_rule || null;
  return buildNewsDetailPublicUrl(entry, { sectionDir, detail_rule: detailRule });
}

function listNewsCategories({ languageCode = null } = {}) {
  return listColumnCategories('news', { languageCode });
}

function buildLegacyNewsCategoryUrl(dirName, category) {
  return `/${dirName}/${resolveLegacyCategoryPublicId(category)}.html`;
}

const MANAGED_STATIC_ROOT_FILES = ['index.html', 'contact.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'index.md'];
const MANAGED_STATIC_DIRS = ['about', 'news', 'product', 'products', 'service', 'products'];
const SHARED_STATIC_DIRS = ['css', 'images', 'skin', 'uploads'];
const SHARED_STATIC_ROOT_FILES = ['logo.svg'];
const OBSOLETE_SHARED_STATIC_DIRS = ['js', 'JS'];
const STATIC_COMPAT_ALIASES = [
  ['images', 'Images'],
  ['skin', 'Skin']
];
const CMS_TEMPLATE_BY_PAGE = {
  'legacy-home': 'spirax_home',
  'legacy-contact': 'spirax_contact_page',
  'legacy-content': 'spirax_content_page',
  'legacy-product-list': 'spirax_product_list',
  'legacy-product-detail': 'spirax_product_detail',
  'legacy-article-list': 'spirax_article_list',
  'legacy-article-detail': 'spirax_article_detail'
};
const CMS_TEMPLATE_TYPE_BY_PAGE = {
  'legacy-home': 'home',
  'legacy-contact': 'content',
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

export function buildStaticSite({ outputRoot = DEFAULT_OUTPUT_ROOT, sections, cleanExisting = false, languageCode = null } = {}) {
  getDb();
  const requestedSections = normalizeSections(sections);
  const requiresTemplateRuntime = Array.from(requestedSections).some((section) => !['robots', 'sitemap', 'llms'].includes(section));
  const sharedAssetRoot = path.resolve(outputRoot);

  if (requiresTemplateRuntime) {
    ensureTemplatesSchema();
  }

  const targetLanguages = resolveStaticBuildLanguages(languageCode);
  const languageBuilds = [];
  let totalFiles = 0;
  let totalRecords = 0;

  for (const language of targetLanguages) {
    const normalizedOutputRoot = resolveLanguageOutputRoot(outputRoot, language);
    const results = [];

    // 初始化全局分类目录映射
    const templateContext = getLegacyTemplateContext(language.code);
    setGlobalCategorySlugMap(templateContext.productCategories);

    fs.mkdirSync(normalizedOutputRoot, { recursive: true });
    if (cleanExisting) {
      cleanupManagedStaticFiles(normalizedOutputRoot);
      cleanupTemplateClientBundles(normalizedOutputRoot);
    }

    if (requestedSections.has('index')) {
      results.push(buildIndexPage({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('contact')) {
      results.push(buildContactPage({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('column-pages')) {
      results.push(buildManualSinglePageColumns({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('corporation-pages')) {
      results.push(buildCorporationPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('news-lists')) {
      results.push(buildNewsCategoryPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('service-lists')) {
      results.push(buildServiceCategoryPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('product-lists')) {
      results.push(buildProductCategoryPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('product-details')) {
      results.push(buildProductDetailPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('service-details')) {
      results.push(buildServiceDetailPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('news-details')) {
      results.push(buildNewsDetailPages({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('robots')) {
      results.push(buildRobotsTxt({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('sitemap')) {
      results.push(buildSitemap({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    if (requestedSections.has('llms')) {
      results.push(buildLlmsFiles({ outputRoot: normalizedOutputRoot, languageCode: language.code }));
    }
    syncStaticSupportAssets(sharedAssetRoot, normalizedOutputRoot);

    const languageTotalFiles = results.reduce((sum, item) => sum + item.filesWritten, 0);
    const languageTotalRecords = results.reduce((sum, item) => sum + item.recordsProcessed, 0);
    totalFiles += languageTotalFiles;
    totalRecords += languageTotalRecords;
    languageBuilds.push({
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      results,
      totalFiles: languageTotalFiles,
      totalRecords: languageTotalRecords
    });
  }

  return {
    outputRoot: languageBuilds[0]?.outputRoot || path.resolve(outputRoot),
    results: languageBuilds.flatMap((item) => item.results),
    languageBuilds,
    totalFiles,
    totalRecords
  };
}

export function buildIndexPage({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const html = renderCmsSitePage('legacy-home', buildLegacyHomePageProps(templateContext), templateContext, {
    targets: [{ target_type: 'site', target_id: null }]
  });

  writeTextFile(outputRoot, 'index.html', html, templateContext.site);
  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('index', '首页', 1, 1);
}

export function buildContactPage({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const html = renderCmsSitePage('legacy-contact', buildLegacyContactPageProps(templateContext), templateContext, {
    targets: [{ target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.contact }]
  });

  writeTextFile(outputRoot, 'contact.html', html, templateContext.site);
  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('contact', '联系页面', 1, 1);
}

export function buildManualSinglePageColumns({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const items = templateContext.columns.filter((item) => (
    String(item.source_type || '') === 'single_page'
    && String(item.route_path || '').trim()
  ));
  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('legacy-content', buildLegacySingleColumnPageProps(templateContext, item), templateContext, {
      targets: [
        { target_type: 'column', target_id: item.id },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.corporation }
      ]
    });

    writeTextFile(outputRoot, resolveColumnRouteOutputPath(item.route_path), html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('column-pages', '单页栏目', items.length, filesWritten);
}

export function buildCorporationPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const items = templateContext.corporationCategories
    .filter((item) => normalizeInteger(item.id, 0) !== 0);
  const indexItemId = items.find((item) => normalizeInteger(item.parent_id, 0) === 0)?.id ?? items[0]?.id;

  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('legacy-content', buildLegacyContentPageProps(templateContext, item), templateContext, {
      targets: [
        { target_type: 'column', target_id: item.id },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.corporation }
      ]
    });

    writeTextFile(outputRoot, path.join('about', `about-${item.id}.html`), html, templateContext.site);
    filesWritten += 1;

    if (normalizeInteger(item.id, 0) === normalizeInteger(indexItemId, 0)) {
      writeTextFile(outputRoot, path.join('about', 'index.html'), html, templateContext.site);
      filesWritten += 1;
    }
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('corporation-pages', '公司栏目页', items.length, filesWritten);
}

export function buildNewsCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  return buildLegacyNewsSectionCategoryPagesByDir({
    outputRoot,
    languageCode,
    dirName: 'news',
    sectionKey: 'news-lists',
    defaultSectionLabel: '新闻分类页',
    summaryClassName: 'Font_000000_a'
  });
}

export function buildServiceCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  return buildLegacyNewsSectionCategoryPagesByDir({
    outputRoot,
    languageCode,
    dirName: 'service',
    sectionKey: 'service-lists',
    defaultSectionLabel: '服务分类页',
    summaryClassName: '0a'
  });
}

export function buildProductCategoryPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const categories = templateContext.productCategories;
  const products = listProducts({ visibleOnly: false, limit: 10000, languageCode });
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const childrenByParent = groupBy(categories, (item) => normalizeInteger(item.parent_id, 0));
  const productsByCategory = groupBy(products, (item) => normalizeInteger(item.column_id, 0));
  const topLevelCategories = childrenByParent.get(0) || [];
  let filesWritten = 0;

  const rootCategory = {
    id: 0,
    name: '产品',
    parent_id: 0,
    seo_keywords: templateContext.site.web_name || '产品',
    seo_description: templateContext.site.web_name || '产品'
  };

  filesWritten += writeProductCategoryPageSet({
    outputRoot,
    templateContext,
    category: rootCategory,
    parent: null,
    children: topLevelCategories,
    items: products.slice().sort(compareBySortAndId),
    fileStem: 'index',
    categoryMap
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
      fileStem: String(categoryId),
      categoryMap
    });
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('product-lists', '产品分类页', categories.filter((item) => normalizeInteger(item.id, 0) !== 0).length, filesWritten);
}

export function buildProductDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange, languageCode = null } = {}) {
  const products = filterByIdRange(listProducts({ visibleOnly: false, limit: 10000, languageCode }), idRange);
  const templateContext = getLegacyTemplateContext(languageCode);
  const productMap = groupBy(products, (item) => normalizeInteger(item.column_id, 0));
  const categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));
  let filesWritten = 0;

  for (const product of products) {
    const categoryProducts = (productMap.get(normalizeInteger(product.column_id, 0)) || []).filter((item) => item.id !== product.id);
    const relatedProducts = categoryProducts.slice().sort(compareBySortAndId).slice(0, 4);
    const category = categoryMap.get(normalizeInteger(product.column_id, 0)) || null;
    const parent = category ? categoryMap.get(normalizeInteger(category.parent_id, 0)) || null : null;
    const html = renderCmsSitePage('legacy-product-detail', buildLegacyProductDetailPageProps({
      templateContext,
      product,
      relatedProducts,
      category,
      parent
    }), templateContext, {
      targets: [
        { target_type: 'column', target_id: normalizeInteger(product.column_id, 0) },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.product }
      ]
    });

    const categorySlugPath = category ? buildCategorySlugPath(category, categoryMap) : null;
    const outputPath = buildProductDetailOutputPath(product, categorySlugPath);

    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('product-details', '产品详情页', products.length, filesWritten);
}

export function buildNewsDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange, languageCode = null } = {}) {
  return buildLegacyNewsSectionDetailPagesByDir({
    outputRoot,
    idRange,
    languageCode,
    dirName: 'news',
    sectionKey: 'news-details',
    defaultSectionLabel: '新闻详情页'
  });
}

export function buildServiceDetailPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange, languageCode = null } = {}) {
  return buildLegacyNewsSectionDetailPagesByDir({
    outputRoot,
    idRange,
    languageCode,
    dirName: 'service',
    sectionKey: 'service-details',
    defaultSectionLabel: '服务详情页'
  });
}

function buildLegacyNewsSectionCategoryPagesByDir({
  outputRoot,
  languageCode = null,
  dirName,
  sectionKey,
  defaultSectionLabel,
  summaryClassName
}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const section = templateContext.publicSections.getNewsSectionByDirName(dirName);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const categoryList = templateContext.newsCategories.filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(section.rootColumnId, 0));
  const items = listNews({ limit: 10000, languageCode });
  const categoryBuckets = groupBy(items, (item) => normalizeInteger(item.column_id, 0));
  const directRootItems = (categoryBuckets.get(section.rootColumnId) || []).slice();
  const effectiveCategoryList = categoryList.length > 0
    ? categoryList
    : directRootItems.length > 0
      ? [section.rootColumn]
      : [];
  let filesWritten = 0;

  for (const [categoryIndex, category] of effectiveCategoryList.entries()) {
    const categoryId = normalizeInteger(category.id, 0);
    const pageItems = (categoryBuckets.get(categoryId) || []).slice();
    const pages = paginate(pageItems, NEWS_LIST_PAGE_SIZE);
    const pageList = pages.length > 0 ? pages : [[]];

    for (let pageIndex = 0; pageIndex < pageList.length; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const currentItems = pageList[pageIndex];
      const html = renderCmsSitePage('legacy-article-list', buildLegacyArticleListPageProps({
        templateContext,
        section: section.sectionType,
        category,
        pageItems: currentItems,
        pageNumber,
        pageCount: pageList.length,
        totalRecords: pageItems.length,
        summaryClassName
      }), templateContext, {
        targets: [
          { target_type: 'column', target_id: category.id },
          { target_type: 'column', target_id: section.rootColumnId },
          { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.article }
        ]
      });

      const publicCategoryId = resolveLegacyCategoryPublicId(category);
      const fileName = pageNumber === 1 ? `${publicCategoryId}.html` : `${publicCategoryId}-${pageNumber}.html`;
      writeTextFile(outputRoot, path.join(dirName, fileName), html, templateContext.site);
      filesWritten += 1;

      if (pageNumber === 1) {
        writeTextFile(outputRoot, path.join(dirName, `${publicCategoryId}-1.html`), html, templateContext.site);
        filesWritten += 1;
        if (categoryIndex === 0) {
          writeTextFile(outputRoot, path.join(dirName, 'index.html'), html, templateContext.site);
          filesWritten += 1;
        }
      }
    }
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(sectionKey, defaultSectionLabel, effectiveCategoryList.length, filesWritten);
}

function buildLegacyNewsSectionDetailPagesByDir({
  outputRoot,
  idRange,
  languageCode = null,
  dirName,
  sectionKey,
  defaultSectionLabel
}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const section = templateContext.publicSections.getNewsSectionByDirName(dirName);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const allowedColumnIds = new Set(getDescendantColumnIds(
    templateContext.publicSections.newsTree.childrenByParentId,
    section.rootColumnId
  ));
  const categoryMap = new Map(templateContext.newsCategories.map((item) => [item.id, item]));
  const allItems = listNews({ limit: 10000, languageCode })
    .filter((item) => allowedColumnIds.has(normalizeInteger(item.column_id, 0)))
    .slice()
    .sort((left, right) => left.id - right.id);
  const items = filterByIdRange(allItems, idRange);
  const categoryBuckets = groupBy(allItems, (item) => normalizeInteger(item.column_id, 0));
  let filesWritten = 0;

  for (const item of items) {
    const siblings = (categoryBuckets.get(normalizeInteger(item.column_id, 0)) || []).slice().sort((left, right) => left.id - right.id);
    const currentIndex = siblings.findIndex((entry) => entry.id === item.id);
    const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    const category = categoryMap.get(normalizeInteger(item.column_id, 0));
    const html = renderCmsSitePage('legacy-article-detail', buildLegacyArticleDetailPageProps({
      templateContext,
      section: section.sectionType,
      sectionConfig: section,
      item,
      category,
      previous,
      next
    }), templateContext, {
      targets: [
        { target_type: 'column', target_id: normalizeInteger(item.column_id, 0) },
        { target_type: 'column', target_id: section.rootColumnId },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.article }
      ]
    });

    const categoryPath = buildRelativeCategoryPathFromRoutePath(category?.route_path, `/${dirName}/`);
    const outputPath = buildNewsDetailOutputPath(item, {
      categoryPath,
      sectionDir: dirName,
      detail_rule: section.rootColumn?.detail_rule
    });
    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(sectionKey, defaultSectionLabel, items.length, filesWritten);
}


function getLegacyTemplateContext(languageCode = null) {
  const site = getSiteConfig(languageCode);
  const columns = listColumns({ languageCode });
  const productCategories = listColumnCategories('product', { languageCode }).slice().sort(compareCategoryOrder);
  const newsCategories = listColumnCategories('news', { languageCode }).slice().sort(compareCategoryOrder);
  const publicSections = resolvePublicSectionContext(columns);

  return {
    site,
    languageCode,
    columns,
    publicSections,
    newsEntries: listNews({ limit: 10000, languageCode }),
    corporationCategories: listColumnCategories('corporation', { languageCode }).slice().sort(compareCategoryOrder),
    productCategories,
    newsCategories
  };
}

function buildLegacyCommonProps(templateContext) {
  // 为 footer 准备产品分类数据：一级分类及其二级分类
  const level1Categories = templateContext.productCategories
    .filter(cat => normalizeInteger(cat.parent_id, 0) === 0 && normalizeInteger(cat.id, 0) !== 0)
    .slice(0, 11); // 取前11个一级分类

  // 创建分类映射表，用于构建完整URL
  const categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));

  const footerProductCategories = level1Categories.map(cat => {
    // 获取该一级分类下的所有二级分类
    const catId = normalizeInteger(cat.id, 0);
    const children = templateContext.productCategories
      .filter(subCat => normalizeInteger(subCat.parent_id, 0) === catId)
      .map(subCat => ({
        id: subCat.id,
        name: subCat.name,
        dir_name: subCat.dir_name,
        url: buildLegacyProductCategoryUrl(subCat, categoryMap)
      }));

    return {
      id: cat.id,
      name: cat.name,
      dir_name: cat.dir_name,
      url: buildLegacyProductCategoryUrl(cat, categoryMap),
      children // 添加二级分类
    };
  });

  // 构建siteColumns用于header导航（保留原始的顶级栏目结构）
  const siteColumns = buildLegacySiteColumns(templateContext.columns, {
    productCategories: templateContext.productCategories,
    newsEntries: templateContext.newsEntries,
    templateContext
  });
  
  // 构建footer专用的栏目结构（展开产品分类）
  const footerColumns = [];
  for (const col of siteColumns) {
    if (col.modelCode === 'product' && col.name === '产品') {
      // 为每个一级产品分类创建独立的栏目用于footer
      for (const cat of footerProductCategories.slice(0, 11)) {
        footerColumns.push({
          ...col,
          name: cat.name,
          url: cat.url,
          children: cat.children && cat.children.length > 0 ? cat.children : [cat]
        });
      }
    }
    // 不添加其他栏目到footer
  }

  return {
    site: templateContext.site,
    siteColumns,
    footerColumns,
    footerProductCategories,
    fragments: {
      indextopHtml: '',
      topHtml: '',
      bottomHtml: '',
      indexFootHtml: '',
      aboutHtml: '',
      productsMenuHtml: buildLegacyProductsMenu(templateContext.productCategories),
      productsMenuCompactHtml: buildLegacyProductsMenuCompact(templateContext.productCategories),
      aboutCategoryHtml: buildLegacyAboutCategoryList(templateContext.corporationCategories),
      newsCategoryHtml: buildLegacyNewsCategoryList(templateContext, 'news'),
      serviceCategoryHtml: buildLegacyNewsCategoryList(templateContext, 'service')
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

  html = html.replace(/#HOPE_aboutCat\((\d+)\)#/gi, () => buildLegacyAboutCategoryList(templateContext.corporationCategories));
  html = html.replace(/#HOPE_NewsCat\((\d+)\s*,\s*(\d+)\)#/gi, (_, id, dirCode) => {
    const dirName = normalizeInteger(dirCode, 1) === 2 ? 'service' : 'news';
    if (normalizeInteger(id, 0) > 0) {
      const explicitSection = templateContext.publicSections.getNewsSectionByColumnId(normalizeInteger(id, 0));
      return buildLegacyNewsCategoryList(templateContext, explicitSection?.dirName || dirName);
    }
    return buildLegacyNewsCategoryList(templateContext, dirName);
  });

  return normalizeLegacyTemplateMarkup(html, site);
}

function buildLegacyHomePageProps(templateContext) {
  const featuredProducts = listProducts({ featured: true, visibleOnly: true, limit: 8, languageCode: templateContext.languageCode })
    .slice(0, 8)
    .map((item) => {
      // 解析images字段（JSON数组）
      let images = [];

      try {
        // 如果已经是数组，直接使用
        if (Array.isArray(item.images)) {
          images = item.images;
        } else if (typeof item.images === 'string') {
          images = JSON.parse(item.images);
        } else {
          images = [];
        }
      } catch (e) {
        images = [];
      }

      return {
        id: item.id,
        name: item.name || '',
        title: item.name || '',
        url: buildProductUrl(item),
        image: images[0] || '/skin/dfpic.gif',
        images: images,
        summary: item.summary || ''
      };
    });
  const newsColumns = templateContext.columns.filter((entry) => String(entry.source_type || '') === 'news_category');
  const newsColumnById = new Map(newsColumns.map((entry) => [normalizeInteger(entry.id, 0), entry]));
  const newsSection = templateContext.publicSections.getNewsSectionByDirName('news');
  const serviceSection = templateContext.publicSections.getNewsSectionByDirName('service');
  const homeNewsItems = listNews({ limit: 6, languageCode: templateContext.languageCode })
    .filter((item) => newsSection
      ? isColumnUnderRoot(newsColumnById, normalizeInteger(item.column_id, 0), newsSection.rootColumnId)
      : false)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.title || '',
      url: buildArticleUrl(item, templateContext, newsSection),
      image: item.picture || '',
      summary: resolveRenderableNewsSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    }));
  const homeServiceItems = listNews({ limit: 1000, languageCode: templateContext.languageCode })
    .filter((item) => serviceSection
      ? isColumnUnderRoot(newsColumnById, normalizeInteger(item.column_id, 0), serviceSection.rootColumnId)
      : false)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.title || '',
      url: buildArticleUrl(item, templateContext, serviceSection),
      image: item.picture || '',
      summary: resolveRenderableNewsSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    }));

  return {
    ...buildLegacyCommonProps(templateContext),
    secondaryMenuItems: buildLegacyRootColumnMenuItems(templateContext.columns),
    newsIndexHtml: buildLegacyIndexNews(),
    featuredProductsHtml: buildLegacyIndexFeaturedProducts(),
    featuredProductLinksHtml: buildLegacyIndexFeaturedProductLinks(),
    serviceIndexHtml: buildLegacyServiceIndex(),
    homeFeaturedProductItems: featuredProducts,
    homeNewsItems,
    homeServiceItems,
    seoMeta: buildSeoMeta({
      title: templateContext.site.seo_home_title || templateContext.site.seo_default_title || templateContext.site.web_name || '',
      description: templateContext.site.seo_home_description || templateContext.site.seo_default_description || templateContext.site.company_name || templateContext.site.web_name || '',
      url: '/',
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyRootColumnMenuItems(columns) {
  return buildLegacySiteColumns(columns).map((item) => ({
    label: item.name || '',
    url: item.url || '',
    active: false
  })).filter((item) => item.url);
}

function buildHeaderNavItem(base, overrides = {}) {
  if (!base?.url) {
    return null;
  }
  const children = Array.isArray(overrides.children)
    ? overrides.children.filter((item) => item?.url && item?.showInNav !== 0)
    : Array.isArray(base.children)
      ? base.children.filter((item) => item?.url && item?.showInNav !== 0)
      : [];
  return {
    id: normalizeInteger(overrides.id ?? base.id, 0),
    name: overrides.name ?? base.name ?? '',
    parentId: normalizeInteger(overrides.parentId ?? base.parentId, 0),
    modelCode: overrides.modelCode ?? base.modelCode ?? '',
    sourceType: overrides.sourceType ?? base.sourceType ?? '',
    sourceId: normalizeInteger(overrides.sourceId ?? base.sourceId, 0),
    active: Boolean(overrides.active ?? base.active),
    showInNav: normalizeInteger(overrides.showInNav ?? base.showInNav, 1),
    url: overrides.url ?? base.url ?? '',
    children
  };
}

function normalizePathSegments(pathname) {
  return String(pathname || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean);
}

function isImmediateChildPath(parentPath, candidatePath) {
  const parentSegments = normalizePathSegments(parentPath);
  const candidateSegments = normalizePathSegments(candidatePath);
  if (parentSegments.length === 0 || candidateSegments.length !== parentSegments.length + 1) {
    return false;
  }
  return parentSegments.every((segment, index) => candidateSegments[index] === segment);
}

function compareHeaderNavEntries(a, b) {
  const sortOrderDiff = normalizeInteger(a?.sortOrder, 0) - normalizeInteger(b?.sortOrder, 0);
  if (sortOrderDiff !== 0) {
    return sortOrderDiff;
  }
  return normalizeInteger(a?.id, 0) - normalizeInteger(b?.id, 0);
}

function buildHeaderPrefixChildren(rows, rootPath, activeColumnId) {
  return rows
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.sourceType === 'single_page')
    .filter((item) => item.url && item.url !== rootPath)
    .filter((item) => isImmediateChildPath(rootPath, item.url))
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: item.showInNav,
      url: item.url
    }));
}

function buildHeaderSectionChildren(rows, section, activeColumnId, { newsEntries = [], templateContext = null } = {}) {
  if (!section) {
    return [];
  }

  const serviceRootId = normalizeInteger(section.rootColumnId, 0);
  const visibleRows = section.sectionType === 'service'
    ? rows
    : rows.filter((item) => item.showInNav !== 0 && item.url);

  const categoryChildren = rows
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.parentId === serviceRootId)
    .filter((item) => item.sourceType === 'news_category')
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: item.showInNav,
      url: item.url
    }));

  if (categoryChildren.length > 0) {
    return categoryChildren;
  }

  return newsEntries
    .filter((item) => normalizeInteger(item?.column_id, 0) === serviceRootId)
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.title || item.name || '',
      parentId: normalizeInteger(item.column_id, 0),
      modelCode: 'news',
      sourceType: 'news_item',
      sourceId: item.id,
      active: false,
      showInNav: 1,
      sortOrder: normalizeInteger(item.sort_order, 0),
      url: buildArticleUrl(item, templateContext || { publicSections: { getNewsSectionByColumnId: () => section } }, section)
    }));
}

function buildLegacySiteColumns(columns, options = {}) {
  const rows = Array.isArray(columns) ? columns : [];
  const publicSections = resolvePublicSectionContext(rows);
  const activeColumnId = normalizeInteger(options.activeColumnId, 0);
  const productCategoryMap = new Map(
    Array.isArray(options.productCategories)
      ? options.productCategories.map((item) => [normalizeInteger(item.id, 0), item])
      : []
  );
  const normalizedRows = rows.map((item) => ({
    id: normalizeInteger(item?.id, 0),
    name: item?.name || '',
    parentId: normalizeInteger(item?.parent_id, 0),
    sourceType: item?.source_type || '',
    sourceId: normalizeInteger(item?.source_id, 0),
    showInNav: normalizeInteger(item?.is_visible, 1),
    sortOrder: normalizeInteger(item?.sort_order, 0),
    url: buildLegacyColumnUrl(item, publicSections)
  })).filter((item) => item.id !== 0);

  const visibleRows = normalizedRows
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.url);

  const findByUrl = (url) => visibleRows.find((item) => item.url === url) || null;
  const findBySourceType = (sourceType) => visibleRows.find((item) => item.sourceType === sourceType) || null;
  const newsSection = publicSections.getNewsSectionByDirName('news');
  const serviceSection = publicSections.getNewsSectionByDirName('service');
  const newsRoot = newsSection
    ? visibleRows.find((item) => item.id === normalizeInteger(newsSection.rootColumnId, 0)) || null
    : null;
  const serviceRoot = serviceSection
    ? visibleRows.find((item) => item.id === normalizeInteger(serviceSection.rootColumnId, 0)) || null
    : null;

  const productChildren = Array.isArray(options.productCategories)
    ? options.productCategories
      .filter((cat) => normalizeInteger(cat.parent_id, 0) === 0 && normalizeInteger(cat.id, 0) !== 0)
      .slice(0, 11)
      .map((cat) => ({
        id: cat.id,
        name: cat.name,
        parentId: normalizeInteger(cat.parent_id, 0),
        modelCode: 'product',
        sourceType: 'product_category',
        sourceId: normalizeInteger(cat.source_id, 0),
        active: false,
        showInNav: 1,
        url: buildLegacyProductCategoryUrl(cat, productCategoryMap)
      }))
    : [];

  return [
    buildHeaderNavItem({
      id: 117,
      name: '首页',
      parentId: 0,
      modelCode: 'link',
      sourceType: 'custom_link',
      sourceId: 1,
      active: false,
      showInNav: 1,
      url: '/',
      children: []
    }),
    buildHeaderNavItem(findByUrl('/your-goals/'), {
      name: '您的目标',
      children: buildHeaderPrefixChildren(normalizedRows, '/your-goals/', activeColumnId)
    }),
    buildHeaderNavItem(findBySourceType('product_root'), {
      name: '产品',
      children: productChildren
    }),
    buildHeaderNavItem(findByUrl('/industries/'), {
      name: '行业',
      children: buildHeaderPrefixChildren(normalizedRows, '/industries/', activeColumnId)
    }),
    buildHeaderNavItem(serviceRoot, {
      name: '服务',
      children: buildHeaderSectionChildren(normalizedRows, serviceSection, activeColumnId, {
        newsEntries: options.newsEntries,
        templateContext: options.templateContext || null
      })
    }),
    buildHeaderNavItem(findByUrl('/training/'), {
      name: '培训',
      children: buildHeaderPrefixChildren(normalizedRows, '/training/', activeColumnId)
    }),
    buildHeaderNavItem(newsRoot, {
      name: '公司新闻',
      children: buildHeaderSectionChildren(normalizedRows, newsSection, activeColumnId, {
        newsEntries: options.newsEntries,
        templateContext: options.templateContext || null
      })
    })
  ].filter(Boolean);
}

function buildLegacyColumnUrl(column, rowsById = new Map()) {
  return buildColumnPublicUrl(column, rowsById);
}

function buildLegacyContactPageProps(templateContext) {
  const contactColumn = templateContext.columns.find((item) => String(item.source_type || '') === 'contact_page') || null;
  const contactPage = contactColumn
    ? resolveDedicatedColumnPageContent(contactColumn, templateContext.languageCode)
    : null;
  const pageTitleBase = templateContext.site.seo_organization_name || templateContext.site.company_name || templateContext.site.web_name || '';
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
    contactTableHtml: normalizeLegacyRichTextHtml(contactPage?.content_html, templateContext.site) || '',
    seoMeta: buildSeoMeta({
      title: contactPage?.seo_title || (pageTitleBase ? `联系我们 | ${pageTitleBase}` : '联系我们'),
      description: contactPage?.seo_description || contactPage?.summary || templateContext.site.seo_default_description || templateContext.site.company_address || templateContext.site.company_phone || pageTitleBase || '联系我们',
      url: '/contact.html',
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyContentPageProps(templateContext, item) {
  const parentCategory = templateContext.corporationCategories.find((entry) => normalizeInteger(entry.id, 0) === normalizeInteger(item.parent_id, 0)) || null;
  const pageUrl = `/about/about-${normalizeInteger(item.id, 0)}.html`;
  const pageTitleBase = templateContext.site.seo_organization_name || templateContext.site.company_name || templateContext.site.web_name || '';
  const pageContent = resolveDedicatedColumnPageContent(item, templateContext.languageCode);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'content',
      title: item.name || '',
      url: pageUrl,
      section: { type: 'corporation', name: '公司栏目', url: '/about/' },
      categoryChain: buildTemplateCategoryChain({
        category: item,
        categories: templateContext.corporationCategories,
        type: 'corporation',
        urlBuilder: (categoryItem) => `/about/about-${normalizeInteger(categoryItem.id, 0)}.html`
      }),
      categoryType: 'corporation',
      categoryUrl: pageUrl,
      parentCategory,
      parentCategoryType: 'corporation',
      parentCategoryUrl: parentCategory ? `/about/about-${normalizeInteger(parentCategory.id, 0)}.html` : '',
      breadcrumbItems: [{ label: item.name || '' }],
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    title: item.name || '',
    contentHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    secondaryMenuItems: buildLegacyCorporationMenuItems(templateContext.corporationCategories, normalizeInteger(item.id, 0)),
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || (item.name && pageTitleBase ? `${item.name} | ${pageTitleBase}` : item.name || pageTitleBase),
      description: pageContent?.seo_description || pageContent?.summary || templateContext.site.seo_default_description || item.name || '',
      url: pageUrl,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacySingleColumnPageProps(templateContext, column) {
  const url = buildLegacyColumnUrl(column, templateContext.publicSections);
  const columnPageData = normalizeLegacyCategoryPageData(column?.page_data);
  const pageContent = resolveDedicatedColumnPageContent(column, templateContext.languageCode);
  const categoryChain = buildTemplateCategoryChain({
    category: column,
    categories: templateContext.columns.filter((item) => String(item.source_type || '') === 'single_page'),
    type: 'content',
    urlBuilder: (columnItem) => buildLegacyColumnUrl(columnItem)
  });
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'column',
      title: column.name || '',
      url,
      section: { type: 'content', name: column.name || '', url },
      categoryChain,
      categoryType: 'content',
      categoryUrl: url,
      breadcrumbItems: buildLegacyManualColumnBreadcrumbItems(categoryChain),
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    siteColumns: buildLegacySiteColumns(templateContext.columns, {
      activeColumnId: normalizeInteger(column.id, 0),
      newsEntries: templateContext.newsEntries
    }),
    title: column.name || '',
    pageData: columnPageData,
    currentCategoryPageData: columnPageData,
    currentCategoryHeroImage: columnPageData?.mastheadImage || '',
    contentHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    bodyHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    newsDescription: pageContent?.seo_description || '',
    newsKeywords: pageContent?.seo_keywords || '',
    keywords: pageContent?.seo_keywords || '',
    description: pageContent?.seo_description || '',
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || buildSectionSeoTitle(column.name, templateContext.site),
      description: pageContent?.seo_description || pageContent?.summary || columnPageData?.summary || templateContext.site.seo_default_description || column.name || '',
      url,
      image: columnPageData?.mastheadImage || columnPageData?.heroImage || '',
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyProductListPageProps({ templateContext, category, parent, children, pageItems, pageNumber, pageCount, totalRecords, categoryMap = null }) {
  const categoryPageContent = resolveDedicatedColumnPageContent(category, templateContext.languageCode);
  const rootLevelCategories = templateContext.productCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);
  const fileStem = normalizeInteger(category.id, 0) === 0 ? 'index' : String(category.id);
  const categoryUrl = normalizeInteger(category?.id, 0) === 0
    ? '/products/'
    : buildLegacyProductCategoryUrl(category, categoryMap);

  // 如果没有传入 categoryMap，则创建一个
  if (!categoryMap) {
    categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));
  }

  const productNavigation = buildLegacyProductNavigation({
    categories: templateContext.productCategories,
    currentCategory: category,
    currentParent: parent,
    fallbackCategories: rootLevelCategories.length > 0 ? rootLevelCategories : [category].filter(Boolean),
    categoryMap
  });
  let categoryPageData = normalizeLegacyCategoryPageData(category?.page_data);

  // 修正 pageData.cards 中的子分类 URL，使用完整的层级路径
  if (categoryPageData && Array.isArray(categoryPageData.cards) && categoryPageData.cards.length > 0) {
    categoryPageData = {
      ...categoryPageData,
      cards: categoryPageData.cards.map((card) => {
        // 尝试从 children 中找到匹配的分类
        const matchingChild = (children || []).find((child) =>
          card.title === child.name ||
          card.link?.includes(`/${child.id}.html`) ||
          (child.dir_name && card.link?.includes(`/${child.dir_name}`))
        );
        if (matchingChild) {
          return {
            ...card,
            href: buildLegacyProductCategoryUrl(matchingChild, categoryMap),
            link: buildLegacyProductCategoryUrl(matchingChild, categoryMap)
          };
        }
        return card;
      })
    };
  }

  // 修正 pageData.models 中的产品 URL，使用完整的层级路径并添加尾部斜杠
  if (categoryPageData && Array.isArray(categoryPageData.models) && categoryPageData.models.length > 0) {
    // 如果 pageItems 中已经有产品，清空 models 避免重复显示
    // models 的作用是为那些只有 page_data 但没有实际产品的分类提供产品
    if (pageItems.length > 0) {
      categoryPageData = {
        ...categoryPageData,
        models: []
      };
    } else {
      // 如果没有实际产品，则修正 models 中的 URL
      categoryPageData = {
        ...categoryPageData,
        models: categoryPageData.models.map((model) => {
          // 尝试从 pageItems 中找到匹配的产品
          const matchingProduct = pageItems.find((product) =>
            model.title === product.name ||
            (product.slug && model.link?.includes(`/${product.slug}`))
          );
          if (matchingProduct) {
            return {
              ...model,
              href: buildProductUrl(matchingProduct),
              link: buildProductUrl(matchingProduct),
              url: buildProductUrl(matchingProduct)
            };
          }
          return model;
        })
      };
    }
  }

  const normalizedCategoryBodyHtml = normalizeLegacyRichTextHtml(categoryPageContent?.content_html, templateContext.site) || '';
  const enrichedCategoryBody = buildLegacyProductSectionNavigation(normalizedCategoryBodyHtml);

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'product-list',
      title: category.name || '',
      url: categoryUrl,
      section: { type: 'product', name: '产品', url: '/products/' },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'product',
        urlBuilder: (cat) => buildLegacyProductCategoryUrl(cat, categoryMap)
      }),
      categoryType: 'product',
      categoryUrl,
      parentCategory: parent,
      parentCategoryType: 'product',
      parentCategoryUrl: parent ? buildLegacyProductCategoryUrl(parent, categoryMap) : '',
      breadcrumbItems: buildLegacyProductBreadcrumbItems(category, parent, categoryMap)
    }),
    smallName: category.name || '',
    bigId: normalizeInteger(parent?.id, category.id),
    bigName: parent?.name || category.name || '',
    productsSmallCatHtml: buildLegacyProductSmallCategories(rootLevelCategories.length > 0 ? rootLevelCategories : [category]),
    secondaryMenuItems: productNavigation.items,
    secondaryMenuTitle: productNavigation.title,
    secondaryMenuParentUrl: productNavigation.parentUrl,
    currentCategoryDescription: normalizeRenderableLegacyText(categoryPageContent?.seo_description),
    currentCategoryPageData: categoryPageData,
    currentCategoryHeroImage: categoryPageData?.mastheadImage || '',
    pageData: categoryPageData,
    bodyHtml: enrichedCategoryBody.html,
    sectionNavItems: enrichedCategoryBody.items,
    items: buildLegacyProductListItems(pageItems),
    // 如果有产品，显示产品卡片；否则显示子分类卡片
    productCardItems: pageItems.length > 0
      ? pageItems.map((item) => ({
          id: item.id,
          name: item.name || '',
          title: item.name || '',
          url: buildProductUrl(item),
          image: item.primary_image || '/skin/dfpic.gif',
          summary: item.summary || ''
        }))
      : (children || []).map((child) => ({
          id: normalizeInteger(child.id, 0),
          name: child.name || '',
          title: child.name || '',
          url: buildLegacyProductCategoryUrl(child, categoryMap),
          image: child.primary_image || '',
          summary: child.seo_description || ''
        })),
    pagerHtml: buildLegacyProductPager(fileStem, pageNumber, pageCount, totalRecords),
    prodKeywords: categoryPageContent?.seo_keywords || category.name || '',
    seoMeta: buildSeoMeta({
      title: categoryPageContent?.seo_title || buildSectionSeoTitle(category.name || '产品', templateContext.site),
      description: categoryPageContent?.seo_description || categoryPageContent?.summary || templateContext.site.seo_default_description || category.name || '',
      url: categoryUrl,
      image: categoryPageData?.mastheadImage || categoryPageData?.heroImage || category.primary_image || '',
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyProductDetailPageProps({ templateContext, product, relatedProducts, category, parent }) {
  const rootLevelCategories = templateContext.productCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);

  // 构建 categoryMap 用于生成完整的栏目目录 URL
  const categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));

  const productNavigation = buildLegacyProductNavigation({
    categories: templateContext.productCategories,
    currentCategory: category,
    currentParent: parent,
    fallbackCategories: rootLevelCategories.length > 0 ? rootLevelCategories : [category].filter(Boolean),
    categoryMap
  });
  const normalizedBodyHtml = normalizeLegacyRichTextHtml(product.content_html, templateContext.site) || '';
  const enrichedBody = buildLegacyProductSectionNavigation(normalizedBodyHtml);
  const productImages = normalizeLegacyProductImages(product);
  const categoryPageData = normalizeLegacyCategoryPageData(category?.page_data);
  let productPageData = normalizeLegacyCategoryPageData(parseLegacyExtra(product?.legacy_extra)?.page_data);

  // 修正 productPageData.brandPathSection.cards 中的URL，确保使用完整路径并添加尾部斜杠
  if (productPageData?.brandPathSection?.cards && Array.isArray(productPageData.brandPathSection.cards)) {
    productPageData = {
      ...productPageData,
      brandPathSection: {
        ...productPageData.brandPathSection,
        cards: productPageData.brandPathSection.cards.map((card) => {
          if (!card.href) return card;

          // 如果是分类链接，尝试匹配并修正
          const categoryMatch = card.href.match(/\/products\/([^/]+(?:\/[^/]+)?)$/);
          if (categoryMatch) {
            const slugPath = categoryMatch[1];
            // 查找匹配的分类
            const matchingCategory = templateContext.productCategories.find((cat) =>
              cat.dir_name && (
                card.href.endsWith(`/${cat.dir_name}`) ||
                card.href.includes(`/${cat.dir_name}/`)
              )
            );
            if (matchingCategory) {
              return {
                ...card,
                href: buildLegacyProductCategoryUrl(matchingCategory, categoryMap)
              };
            }
          }

          // 确保所有产品链接都有尾部斜杠
          if (card.href.startsWith('/products/') && !card.href.endsWith('/') && !card.href.endsWith('.html')) {
            return {
              ...card,
              href: card.href + '/'
            };
          }

          return card;
        })
      }
    };
  }

  const productUrl = buildProductUrl({ id: normalizeInteger(product.id, 0), slug: product.slug, column_id: product.column_id });
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'product-detail',
      title: product.name || '',
      url: productUrl,
      section: { type: 'product', name: '产品', url: '/products/' },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'product',
        urlBuilder: (cat) => buildLegacyProductCategoryUrl(cat, categoryMap)
      }),
      categoryType: 'product',
      categoryUrl: category ? buildLegacyProductCategoryUrl(category, categoryMap) : '',
      parentCategory: parent,
      parentCategoryType: 'product',
      parentCategoryUrl: parent ? buildLegacyProductCategoryUrl(parent, categoryMap) : '',
      content: product,
      contentType: 'product',
      contentUrl: productUrl,
      breadcrumbItems: [
        { label: '产品', href: '/products/' },
        ...buildLegacyProductCategoryBreadcrumbItems(category, parent, categoryMap),
        { label: product.name || '' }
      ]
    }),
    title: product.name || '',
    prodKeywords: product.keywords || '',
    prodDescription: product.summary || '',
    image: product.primary_image || '/skin/dfpic.gif',
    code: product.code || '',
    relatedProductsHtml: buildLegacyRelatedProducts(relatedProducts),
    bodyHtml: enrichedBody.html,
    currentProduct: {
      id: normalizeInteger(product.id, 0),
      title: product.name || '',
      name: product.name || '',
      code: product.code || '',
      summary: product.summary || '',
      primaryImage: product.primary_image || '/skin/dfpic.gif',
      images: productImages,
      bodyHtml: enrichedBody.html,
      pageData: productPageData,
      topPanel: productPageData?.topPanel || null,
      url: productUrl
    },
    relatedProductItems: relatedProducts.map((item) => ({
      id: item.id,
      name: item.name || '',
      title: item.name || '',
      url: buildProductUrl(item),
      image: item.primary_image || '/skin/dfpic.gif',
      summary: item.summary || ''
    })),
    secondaryMenuItems: productNavigation.items,
    secondaryMenuTitle: productNavigation.title,
    secondaryMenuParentUrl: productNavigation.parentUrl,
    sectionNavItems: enrichedBody.items,
    currentCategoryPageData: categoryPageData,
    currentProductPageData: productPageData,
    seoMeta: buildProductSeoMeta(product, templateContext.site, { url: productUrl }),
    jsonLd: buildJsonLdProduct(product, templateContext.site, { url: productUrl }),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyArticleListPageProps({ templateContext, section, category, pageItems, pageNumber, pageCount, totalRecords, summaryClassName }) {
  const isService = section === 'service';
  const sectionConfig = templateContext.publicSections.getNewsSectionByType(isService ? 'service' : 'news')
    || { dirName: isService ? 'service' : 'news', sectionLabel: isService ? '服务' : '公司新闻', sectionType: isService ? 'service' : 'news' };
  const sectionDir = sectionConfig.dirName;
  const sectionLabel = sectionConfig.sectionLabel;
  const categoryPublicId = resolveLegacyCategoryPublicId(category);
  const categoryUrl = buildLegacyNewsCategoryUrl(sectionDir, category);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'article-list',
      title: category.name || '',
      url: categoryUrl,
      section: { type: isService ? 'service' : 'news', name: sectionLabel, url: `/${sectionDir}/` },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: isService ? 'service' : 'news',
        urlBuilder: (categoryItem) => buildLegacyNewsCategoryUrl(sectionDir, categoryItem)
      }),
      categoryType: isService ? 'service' : 'news',
      categoryUrl,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section,
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildLegacyNewsCategoryList(templateContext, sectionDir),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext, sectionDir, normalizeInteger(category.id, 0)),
    categoryId: categoryPublicId,
    title: category.name || '',
    items: buildLegacyArticleListItems({ pageItems, summaryClassName }),
    articleCardItems: pageItems.map((item) => ({
      id: item.id,
      title: item.title || '',
      url: `/${sectionDir}/detail/${item.id}.html`,
      image: item.picture || '',
      summary: resolveRenderableNewsSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    })),
    pagerHtml: buildLegacyArticlePager({
      categoryId: categoryPublicId,
      pageNumber,
      pageCount,
      totalRecords
    }),
    seoMeta: buildSeoMeta({
      title: category.seo_title || buildSectionSeoTitle(category.name || sectionLabel, templateContext.site),
      description: category.seo_description || templateContext.site.seo_default_description || category.name || sectionLabel,
      url: categoryUrl,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyArticleDetailPageProps({ templateContext, section, sectionConfig = null, item, category, previous, next }) {
  const isService = section === 'service';
  const resolvedSectionConfig = sectionConfig
    || templateContext.publicSections.getNewsSectionByType(isService ? 'service' : 'news')
    || { dirName: isService ? 'service' : 'news', sectionLabel: isService ? '服务' : '公司新闻', sectionType: isService ? 'service' : 'news', rootColumn: null };
  const sectionDir = resolvedSectionConfig.dirName;
  const sectionLabel = resolvedSectionConfig.sectionLabel;
  const articleUrl = buildNewsDetailPublicUrl(item, {
    sectionDir,
    detail_rule: resolvedSectionConfig.rootColumn?.detail_rule
  });
  const relatedArticles = listNews({ limit: 10000, languageCode: templateContext.languageCode })
    .filter((entry) => normalizeInteger(entry.column_id, 0) === normalizeInteger(item.column_id, 0) && normalizeInteger(entry.id, 0) !== normalizeInteger(item.id, 0))
    .slice(0, 3);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'article-detail',
      title: item.title || '',
      url: articleUrl,
      section: { type: isService ? 'service' : 'news', name: sectionLabel, url: `/${sectionDir}/` },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: isService ? 'service' : 'news',
        urlBuilder: (categoryItem) => buildLegacyNewsCategoryUrl(sectionDir, categoryItem)
      }),
      categoryType: isService ? 'service' : 'news',
      categoryUrl: category ? buildLegacyNewsCategoryUrl(sectionDir, category) : '',
      content: item,
      contentType: isService ? 'service-article' : 'news-article',
      contentUrl: articleUrl,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category?.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section,
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildLegacyNewsCategoryList(templateContext, sectionDir),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext, sectionDir, normalizeInteger(category?.id, 0)),
    title: item.title || '',
    newsKeywords: item.keywords || '',
    newsDescription: resolveRenderableNewsSummary(item) || '',
    typeId: normalizeInteger(item.column_id, 0),
    catName: category?.name || '',
    bodyHtml: normalizeLegacyRichTextHtml(item.content_html, templateContext.site) || '',
    currentArticle: {
      id: normalizeInteger(item.id, 0),
      title: item.title || '',
      summary: resolveRenderableNewsSummary(item),
      bodyHtml: normalizeLegacyRichTextHtml(item.content_html, templateContext.site) || '',
      image: item.picture || '',
      date: formatLegacyDateOnly(item.created_at),
      url: articleUrl
    },
    relatedArticleItems: relatedArticles.map((entry) => ({
      id: entry.id,
      title: entry.title || '',
      url: buildNewsDetailPublicUrl(entry, {
        sectionDir,
        detail_rule: resolvedSectionConfig.rootColumn?.detail_rule
      }),
      image: entry.picture || '',
      summary: resolveRenderableNewsSummary(entry),
      date: formatLegacyDateOnly(entry.created_at)
    })),
    previousHtml: previous ? `<a href="${previous.id}.html" class="Font_2e4690_a ">${escapeHtml(previous.title || '')}</a>` : '<span class="Font_2e4690_a">没有上一篇</span>',
    nextHtml: next ? `<a href="${next.id}.html" class="Font_2e4690_a ">${escapeHtml(next.title || '')}</a>` : '<span class="Font_2e4690_a">没有下一篇</span>',
    seoMeta: buildArticleSeoMeta(item, templateContext.site, { url: articleUrl }),
    jsonLd: buildJsonLdArticle(item, templateContext.site, { url: articleUrl }),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
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

function buildSectionSeoTitle(title, site) {
  const normalizedTitle = String(title || '').trim();
  const siteTitleBase = String(site?.seo_organization_name || site?.company_name || site?.web_name || '').trim();
  if (!normalizedTitle) {
    return siteTitleBase;
  }
  if (!siteTitleBase || normalizedTitle === siteTitleBase) {
    return normalizedTitle;
  }
  return `${normalizedTitle} | ${siteTitleBase}`;
}

function buildLegacyProductBreadcrumbItems(category, parent, categoryMap = null) {
  const items = [{ label: '产品', href: '/products/' }];
  items.push(...buildLegacyProductCategoryBreadcrumbItems(category, parent, categoryMap));
  return items;
}

function buildLegacyProductCategoryBreadcrumbItems(category, parent, categoryMap = null) {
  const items = [];
  const parentName = String(parent?.name || '').trim();
  const categoryName = String(category?.name || '').trim();

  if (parentName && parentName !== '产品') {
    items.push({ label: parentName, href: buildLegacyProductCategoryUrl(parent, categoryMap) });
  }
  if (categoryName && categoryName !== '产品' && categoryName !== parentName) {
    items.push({ label: categoryName, href: buildLegacyProductCategoryUrl(category, categoryMap) });
  }

  return items;
}

function buildLegacyProductCategoryUrl(category, categoryMap = null) {
  return buildProductCategoryPublicUrl(category, categoryMap);
}

function normalizeLegacyTemplateMarkup(value, site) {
  return String(value || '')
    .replace(/\/Search\.asp\?action=search/gi, '/search')
    .replace(/\/search\.asp\?action=search/gi, '/search')
    .replace(/\/Search\.asp\b/gi, '/search')
    .replace(/\/search\.asp\b/gi, '/search');
}

function buildLegacyProductsMenu(categories) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  return `<table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">${roots.map((item) => `<li><a href="/products/${item.id}.html"><span>${escapeHtml(item.name || '')}</span></a></li>`).join('')}</table>`;
}

function buildLegacyProductsMenuCompact(categories) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  return roots.map((item, index) => `${index > 0 ? '&nbsp;' : ''}<a href="/products/${item.id}.html">${escapeHtml(item.name || '')}</a> |`).join('');
}

function buildLegacyAboutCategoryList(categories) {
  const items = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const href = `about-${item.id}.html`;
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="${escapeHtml(href)}" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildLegacyCorporationMenuItems(categories, activeId = 0) {
  return categories
    .filter((item) => normalizeInteger(item.parent_id, 0) === 0)
    .map((item) => ({
      label: item.name || '',
      url: `/about/about-${normalizeInteger(item.id, 0)}.html`,
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function buildLegacyNewsCategoryList(templateContext, dirName) {
  const section = templateContext.publicSections.getNewsSectionByDirName(dirName);
  const items = section
    ? templateContext.newsCategories.filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(section.rootColumnId, 0))
    : [];
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}><img src="/Skin/blue/Images/Co_left_ico.gif" width="15" height="13" /></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="${buildLegacyNewsCategoryUrl(dirName, item)}" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildLegacyNewsMenuItems(templateContext, dirName, activeId = 0) {
  const section = templateContext.publicSections.getNewsSectionByDirName(dirName);
  if (!section) {
    return [];
  }
  return templateContext.newsCategories
    .filter((item) => normalizeInteger(item.parent_id, 0) === normalizeInteger(section.rootColumnId, 0))
    .map((item) => ({
      label: item.name || '',
      url: buildLegacyNewsCategoryUrl(dirName, item),
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

function buildLegacyProductMenuItems(categories, activeId = 0, categoryMap = null) {
  return (categories || [])
    .filter(Boolean)
    .map((item) => {
      const description = resolveLegacyProductCategoryDescription(item);
      const itemId = normalizeInteger(item.id, 0);
      return {
        id: itemId,
        label: item.name || '',
        title: item.name || '',
        url: buildLegacyProductCategoryUrl(item, categoryMap),
        active: itemId === normalizeInteger(activeId, 0),
        description,
        ctaLabel: description ? 'Explore more' : '',
        image: '',
        imageAlt: item.name || ''
      };
    });
}

function buildLegacyProductNavigation({ categories, currentCategory, currentParent, fallbackCategories = [], categoryMap = null }) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const activeId = normalizeInteger(currentCategory?.id, 0);
  const parentId = normalizeInteger(currentCategory?.parent_id, 0);
  const siblingCategories = parentId > 0
    ? safeCategories
      .filter((item) => normalizeInteger(item.parent_id, 0) === parentId)
      .sort(compareCategoryOrder)
    : [];

  if (siblingCategories.length > 0) {
    return {
      title: currentParent?.name || 'Browse categories',
      parentUrl: currentParent ? buildLegacyProductCategoryUrl(currentParent, categoryMap) : '',
      items: buildLegacyProductMenuItems(siblingCategories, activeId, categoryMap)
    };
  }

  return {
    title: 'Browse categories',
    parentUrl: '',
    items: buildLegacyProductMenuItems(fallbackCategories, activeId, categoryMap)
  };
}

function resolveLegacyProductCategoryDescription(category) {
  const seoDescription = normalizeRenderableLegacyText(category?.seo_description);
  if (seoDescription && !looksLikeLegacyMojibake(seoDescription)) {
    return truncateRenderableNewsSummary(seoDescription, 96);
  }

  const keywords = normalizeRenderableLegacyText(category?.seo_keywords);
  if (keywords && !looksLikeLegacyMojibake(keywords)) {
    return truncateRenderableNewsSummary(keywords.replace(/[|,，]+/g, ' '), 96);
  }

  return '';
}

function normalizeLegacyProductImages(product) {
  const images = Array.isArray(product?.images)
    ? product.images
      .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
      .filter(Boolean)
    : [];
  const primaryImage = normalizeUploadedRelativePath(String(product?.primary_image || '').trim());
  if (primaryImage && !images.includes(primaryImage)) {
    return [primaryImage, ...images];
  }
  return images.length > 0 ? images : [primaryImage || '/skin/dfpic.gif'];
}

function buildLegacyProductSectionNavigation(html) {
  const rawHtml = String(html || '').trim();
  if (!rawHtml) {
    return { html: '', items: [] };
  }

  const usedIds = new Set();
  const items = [];
  let index = 0;
  const output = rawHtml.replace(/<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attributes, innerHtml) => {
    const plainText = normalizeRenderableLegacyText(innerHtml.replace(/<[^>]+>/g, ' '));
    if (!plainText) {
      return match;
    }

    const existingIdMatch = String(attributes || '').match(/\sid=(["'])([^"']+)\1/i);
    let headingId = existingIdMatch?.[2] || createLegacyAnchorSlug(plainText, `section-${index + 1}`);
    while (usedIds.has(headingId)) {
      index += 1;
      headingId = `${headingId}-${index}`;
    }
    usedIds.add(headingId);
    items.push({
      id: headingId,
      label: plainText,
      href: `#${headingId}`,
      level: normalizeInteger(level, 2)
    });
    index += 1;

    if (existingIdMatch) {
      return `<h${level}${attributes}>${innerHtml}</h${level}>`;
    }

    return `<h${level}${attributes} id="${escapeHtmlAttribute(headingId)}">${innerHtml}</h${level}>`;
  });

  return {
    html: output,
    items: items.slice(0, 12)
  };
}

function createLegacyAnchorSlug(value, fallback = 'section') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function normalizeLegacyCategoryPageData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const normalizedPageKind = String(value.pageKind || value.kind || '').trim().toLowerCase();
  const pageKind = normalizedPageKind === 'collection' ? 'category' : normalizedPageKind;

  return {
    title: String(value.title || '').trim(),
    summary: String(value.summary || '').trim(),
    pageKind,
    heroImage: String(value.heroImage || '').trim(),
    mastheadImage: String(value.mastheadImage || value.heroImage || '').trim(),
    categoryNavTitle: String(value.categoryNavTitle || '').trim(),
    intro: normalizeLegacyLooseParagraphs(value.intro),
    overview: Array.isArray(value.overview) ? value.overview.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [],
    benefits: Array.isArray(value.benefits) ? value.benefits.filter(Boolean) : [],
    cards: Array.isArray(value.cards) ? value.cards.filter(Boolean) : [],
    models: Array.isArray(value.models) ? value.models.filter(Boolean) : [],
    downloads: Array.isArray(value.downloads) ? value.downloads.filter(Boolean) : [],
    supplementalSections: Array.isArray(value.supplementalSections) ? value.supplementalSections.filter(Boolean) : [],
    brandPathSection: value.brandPathSection && typeof value.brandPathSection === 'object' ? value.brandPathSection : null,
    browseByTopicSection: value.browseByTopicSection && typeof value.browseByTopicSection === 'object' ? value.browseByTopicSection : null,
    topPanel: value.topPanel && typeof value.topPanel === 'object' ? value.topPanel : null,
    seo: value.seo && typeof value.seo === 'object' ? value.seo : null,
    items: Array.isArray(value.items) ? value.items.filter(Boolean) : [],
    sections: Array.isArray(value.sections) ? value.sections.filter(Boolean) : [],
    resources: Array.isArray(value.resources) ? value.resources.filter(Boolean) : [],
    products: Array.isArray(value.products) ? value.products.filter(Boolean) : [],
    features: Array.isArray(value.features) ? value.features.filter(Boolean) : [],
    calloutCards: Array.isArray(value.calloutCards) ? value.calloutCards.filter(Boolean) : [],
    promoCards: Array.isArray(value.promoCards) ? value.promoCards.filter(Boolean) : [],
    filterGroups: Array.isArray(value.filterGroups) ? value.filterGroups.filter(Boolean) : [],
    jobs: Array.isArray(value.jobs) ? value.jobs.filter(Boolean) : [],
    jobsSummary: String(value.jobsSummary || '').trim(),
    goals: value.goals && typeof value.goals === 'object' ? value.goals : null,
    secondary: value.secondary && typeof value.secondary === 'object' ? value.secondary : null,
    focus: value.focus && typeof value.focus === 'object' ? value.focus : null,
    closing: value.closing && typeof value.closing === 'object' ? value.closing : null,
    caseStudy: value.caseStudy && typeof value.caseStudy === 'object' ? value.caseStudy : null,
    related: value.related && typeof value.related === 'object' ? value.related : null,
    proof: value.proof && typeof value.proof === 'object' ? value.proof : null,
    actions: value.actions && typeof value.actions === 'object' ? value.actions : null,
    faq: value.faq && typeof value.faq === 'object' ? value.faq : null,
    answerSummary: value.answerSummary && typeof value.answerSummary === 'object' ? value.answerSummary : null,
    technicalReview: value.technicalReview && typeof value.technicalReview === 'object' ? value.technicalReview : null,
    featureImage: String(value.featureImage || '').trim(),
    slides: Array.isArray(value.slides) ? value.slides.filter(Boolean) : [],
    featureHeading: value.featureHeading && typeof value.featureHeading === 'object' ? value.featureHeading : null,
    introBlock: value.introBlock && typeof value.introBlock === 'object' ? value.introBlock : (value.intro && typeof value.intro === 'object' && !Array.isArray(value.intro) ? value.intro : null),
    partnerHeading: value.partnerHeading && typeof value.partnerHeading === 'object' ? value.partnerHeading : null,
    advice: value.advice && typeof value.advice === 'object' ? value.advice : null,
    supportList: value.supportList && typeof value.supportList === 'object' ? value.supportList : null,
    frame: value.frame && typeof value.frame === 'object' ? value.frame : null,
    promo: value.promo && typeof value.promo === 'object' ? value.promo : null,
    spotlight: value.spotlight && typeof value.spotlight === 'object' ? value.spotlight : null
  };
}

function resolveDedicatedColumnPageContent(column, languageCode = null) {
  if (!column) {
    return null;
  }
  return column;
}

function normalizeLegacyLooseParagraphs(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') {
          return item.trim();
        }
        if (item && typeof item === 'object') {
          if (Array.isArray(item.paragraphs)) {
            return item.paragraphs.map((entry) => String(entry || '').trim()).filter(Boolean);
          }
          return String(item.body || item.statement || item.description || '').trim();
        }
        return '';
      })
      .flat()
      .filter(Boolean);
  }

  if (value && typeof value === 'object') {
    const paragraphs = Array.isArray(value.paragraphs)
      ? value.paragraphs.map((item) => String(item || '').trim()).filter(Boolean)
      : [];
    if (paragraphs.length > 0) {
      return paragraphs;
    }
    return [String(value.body || value.statement || value.description || '').trim()].filter(Boolean);
  }

  return String(value || '').trim() ? [String(value).trim()] : [];
}

function buildLegacyManualColumnBreadcrumbItems(categoryChain) {
  const normalizedChain = normalizeTemplateCategoryChain(categoryChain);
  if (normalizedChain.length === 0) {
    return [];
  }
  return normalizedChain.map((item, index) => ({
    label: item.name || '',
    href: index < normalizedChain.length - 1 ? item.url || '' : ''
  }));
}

function buildLegacyProductListItems(pageItems) {
  return pageItems.map((item, index) => ({
    id: item.id,
    name: item.name || '',
    url: buildProductUrl(item),
    image: item.primary_image || '/skin/dfpic.gif',
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
  fileStem,
  categoryMap
}) {
  const pages = paginate(items, PRODUCT_LIST_PAGE_SIZE);
  const pageList = pages.length > 0 ? pages : [[]];
  let filesWritten = 0;

  // 计算分类的完整栏目目录路径
  const categoryId = normalizeInteger(category.id, 0);
  const categorySlugPath = category.dir_name && categoryMap
    ? buildCategorySlugPath(category, categoryMap)
    : [];
  const useSlugPath = categorySlugPath.length > 0 || categoryId === 0; // 根分类也使用新路径格式

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
      totalRecords: items.length,
      categoryMap
    }), templateContext, {
      targets: [
        { target_type: 'column', target_id: normalizeInteger(category.id, 0) },
        { target_type: 'content_type', target_id: CONTENT_TYPE_TARGETS.product }
      ]
    });

    // 根据是否有栏目目录路径决定输出路径
    let outputDir, fileName;

    if (useSlugPath) {
      // 使用完整目录路径: /products/{parent-dir}/{category-dir}/
      // 或根目录: /products/
      outputDir = categorySlugPath.length > 0
        ? path.join('products', ...categorySlugPath)
        : 'products';
      fileName = pageNumber === 1 ? 'index.html' : `page-${pageNumber}.html`;
    } else {
      // 回退到数字ID: /products/{id}.html
      outputDir = 'products';
      fileName = buildLegacyListFileName(fileStem, pageNumber);
    }

    writeTextFile(outputRoot, path.join(outputDir, fileName), legacyHtml, templateContext.site);
    filesWritten += 1;

    // 兼容性：如果使用目录路径，也生成旧的数字ID路径
    if (useSlugPath && fileStem !== 'index') {
      const legacyFileName = buildLegacyListFileName(fileStem, pageNumber);
      writeTextFile(outputRoot, path.join('products', legacyFileName), legacyHtml, templateContext.site);
      filesWritten += 1;

      if (pageNumber === 1) {
        const firstPageFileName = `${fileStem}.html`;
        writeTextFile(outputRoot, path.join('products', firstPageFileName), legacyHtml, templateContext.site);
        filesWritten += 1;
      }
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
    html += `<td width="100%" height="47" align="center" valign="middle" ${className}><img src="${escapeHtml(item.primary_image || '/skin/dfpic.gif')}" alt="${escapeHtml(item.name || '')}" width="95" height="70" /></td>`;
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
  const items = listProducts({ featured: true, visibleOnly: true, limit: 8 }).slice(0, 8);

  let html = '';
  for (const item of items) {
    html += '<li>';
    html += `<img src="${escapeHtml(item.primary_image || '/skin/dfpic.gif')}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}">`;
    html += `<li><a href="${buildProductUrl(item)}" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${gotTopicLegacy(item.summary || '', 118)}</li>`;
    html += '</li>';
  }
  return html;
}

function buildLegacyIndexFeaturedProductLinks() {
  const items = listProducts({ featured: true, visibleOnly: true, limit: 32 })
    .slice()
    .sort((left, right) => normalizeInteger(left.id, 0) - normalizeInteger(right.id, 0))
    .slice(0, 32);

  return items.map((item) => `<li><a href="${buildProductUrl(item)}">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildLegacyIndexNews() {
  const columns = listColumns();
  const publicSections = resolvePublicSectionContext(columns);
  const newsSection = publicSections.getNewsSectionByDirName('news');
  const newsColumnById = new Map(publicSections.newsTree.rows.map((item) => [normalizeInteger(item.id, 0), item]));
  const templateContext = { publicSections };
  const items = listNews({ limit: 10000 })
    .filter((item) => newsSection && isColumnUnderRoot(newsColumnById, normalizeInteger(item.column_id, 0), newsSection.rootColumnId))
    .slice(0, 10);
  return items.map((item) => `<li><a href="${buildArticleUrl(item, templateContext, newsSection)}" class="Ba">${escapeHtml(item.title || '')}</a></li>`).join('');
}

function buildLegacyServiceIndex() {
  const columns = listColumns();
  const publicSections = resolvePublicSectionContext(columns);
  const serviceSection = publicSections.getNewsSectionByDirName('service');
  const newsColumnById = new Map(publicSections.newsTree.rows.map((item) => [normalizeInteger(item.id, 0), item]));
  const templateContext = { publicSections };
  const items = listNews({ limit: 10000 })
    .filter((item) => serviceSection && isColumnUnderRoot(newsColumnById, normalizeInteger(item.column_id, 0), serviceSection.rootColumnId))
    .slice(0, 16);
  return items.map((item) => `<li><a href="${buildArticleUrl(item, templateContext, serviceSection)}">${escapeHtml(item.title || '')}</a></li>`).join('');
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
    'column-pages',
    'corporation-pages',
    'news-lists',
    'news-details',
    'service-lists',
    'service-details',
    'product-lists',
    'product-details',
    'robots',
    'sitemap',
    'llms'
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

  cleanupManagedSitemapChunks(outputRoot);
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
    if (extension === '.html' || extension === '.htm' || extension === '.md') {
      fs.unlinkSync(fullPath);
    }
  }
}

function cleanupManagedSitemapChunks(outputRoot) {
  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }
    if (/^sitemap-\d+\.xml$/i.test(entry.name)) {
      fs.unlinkSync(path.resolve(outputRoot, entry.name));
    }
  }
}

function resolveStaticBuildLanguages(languageCode) {
  const enabledLanguages = listLanguages().filter((language) => Number(language.is_enabled || 0) === 1);
  if (languageCode) {
    const matched = enabledLanguages.find((language) => language.code === languageCode);
    return matched ? [matched] : enabledLanguages.slice(0, 1);
  }
  return enabledLanguages.length > 0 ? enabledLanguages : [{ code: 'zh-CN', site: { output_dir: 'html' } }];
}

function resolveLanguageOutputRoot(baseOutputRoot, language) {
  const requestedRoot = path.resolve(baseOutputRoot);
  const configuredOutputDir = String(language?.site?.output_dir || '').trim();
  if (!configuredOutputDir) {
    return requestedRoot;
  }

  const defaultRootName = path.basename(DEFAULT_OUTPUT_ROOT);
  if (configuredOutputDir === defaultRootName || configuredOutputDir === 'html') {
    return requestedRoot;
  }

  const relativeDir = configuredOutputDir.startsWith(`${defaultRootName}/`)
    ? configuredOutputDir.slice(defaultRootName.length + 1)
    : configuredOutputDir;
  return path.resolve(requestedRoot, relativeDir);
}

function writeTextFile(outputRoot, relativePath, content, site = null) {
  const filePath = path.resolve(outputRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, normalizeLegacyRichTextHtml(content, site), 'utf8');
}

function syncStaticSupportAssets(sharedRoot, outputRoot) {
  const resolvedSharedRoot = path.resolve(sharedRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);

  cleanupObsoleteSharedStaticDirs(resolvedOutputRoot);
  syncSharedStaticDirs(resolvedSharedRoot, resolvedOutputRoot);
  syncSharedStaticRootFiles(resolvedSharedRoot, resolvedOutputRoot);

  for (const [sourceName, targetName] of STATIC_COMPAT_ALIASES) {
    const sourceDir = path.join(resolvedOutputRoot, sourceName);
    const targetDir = path.join(resolvedOutputRoot, targetName);
    if (path.resolve(sourceDir).toLowerCase() === path.resolve(targetDir).toLowerCase()) {
      continue;
    }
    syncDirectory(sourceDir, targetDir);
  }

  syncLegacyImgAlias(resolvedOutputRoot);
}

function cleanupObsoleteSharedStaticDirs(outputRoot) {
  for (const dirName of OBSOLETE_SHARED_STATIC_DIRS) {
    fs.rmSync(path.join(outputRoot, dirName), { recursive: true, force: true });
  }
}

function syncSharedStaticDirs(sharedRoot, outputRoot) {
  for (const dirName of SHARED_STATIC_DIRS) {
    const targetDir = path.join(outputRoot, dirName);
    const sourceDir = [
      path.join(sharedRoot, dirName),
      path.join(PUBLIC_ROOT, dirName)
    ].find((candidate) => fs.existsSync(candidate) && path.resolve(candidate) !== path.resolve(targetDir));

    if (!sourceDir) {
      continue;
    }

    syncDirectory(sourceDir, targetDir);
  }
}

function syncSharedStaticRootFiles(sharedRoot, outputRoot) {
  for (const fileName of SHARED_STATIC_ROOT_FILES) {
    const targetFile = path.join(outputRoot, fileName);
    const sourceFile = [
      path.join(sharedRoot, fileName),
      path.join(PUBLIC_ROOT, fileName)
    ].find((candidate) => fs.existsSync(candidate));

    if (!sourceFile || path.resolve(sourceFile) === path.resolve(targetFile)) {
      continue;
    }

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(sourceFile, targetFile);
  }
}

function syncDirectory(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
  copyDirectoryContents(sourceDir, targetDir);
}

function syncLegacyImgAlias(outputRoot) {
  const targetDir = path.join(outputRoot, 'img');
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });

  copyDirectoryContents(path.join(outputRoot, 'images'), targetDir);
  copyDirectoryContents(path.join(outputRoot, 'skin'), targetDir);

  const legacyCssSource = path.join(outputRoot, 'skin', 'css.css');
  if (fs.existsSync(legacyCssSource)) {
    fs.copyFileSync(legacyCssSource, path.join(targetDir, 'css.css'));
  }
}

function copyDirectoryContents(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) {
    return;
  }

  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    fs.copyFileSync(sourcePath, targetPath);
  }
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
  return String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
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

function normalizeLegacyRichTextHtml(value, siteConfig = null) {
  const html = String(value || '').trim();
  if (!html) {
    return '';
  }
  let output = html.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');

  output = normalizeLegacyMetaAttributes(output);

  return output
    .replace(/href="https?:\/\/\/+"/gi, 'href="/"')
    .replace(/data-ke-src="https?:\/\/\/+"/gi, 'data-ke-src="/"')
    .replace(/https?:\/\/\/+(?=[^/"])/gi, '/')
    .replace(/(["'(=])(\/(?:UploadFile|uploadfile|upload)\/[^\s"'<>]+)/gi, (_, prefix, relativePath) => {
      return `${prefix}${normalizeUploadedRelativePath(relativePath)}`;
    })
    // 修正产品链接：确保所有 /products/.../slug 格式的链接都有尾部斜杠
    .replace(/href="(\/products\/[a-z0-9/-]+[a-z0-9])"/gi, (match, url) => {
      // 如果不是以 .html 或 / 结尾，添加尾部斜杠
      if (!url.endsWith('.html') && !url.endsWith('/')) {
        return `href="${url}/"`;
      }
      return match;
    });
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
