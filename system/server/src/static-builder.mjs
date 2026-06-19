import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, PUBLIC_ROOT } from './config.mjs';
import { getDb, queryAll } from './db.mjs';
import { createCmsTemplateRuntime } from './cms-template-runtime.mjs';
import { listColumns } from './services/columns.mjs';
import { listColumnCategories, listColumnCategoriesByRoot } from './services/column-categories.mjs';
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
  buildProductCategoryPublicUrl,
  resolveColumnRouteOutputPath,
  buildContentDetailUrlFromColumn,
  buildContentDetailPathFromColumn
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
let globalCategoryMap = new Map(); // 产品分类映射
let globalColumnMap = new Map(); // 栏目映射

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
  // 从 product.column_id 获取栏目
  const column = globalColumnMap.get(normalizeInteger(product.column_id, 0));
  if (!column) {
    throw new Error(`产品 ${product.id} 的栏目 ${product.column_id} 不存在`);
  }
  return buildContentDetailUrlFromColumn(product, column, categorySlugPath);
}

function buildArticleUrl(entry, templateContext, sectionOverride = null) {
  const publicSections = templateContext?.publicSections;
  const section = sectionOverride
    || publicSections?.getNewsSectionByColumnId?.(normalizeInteger(entry?.column_id, 0))
    || null;

  if (!section?.rootColumn) {
    throw new Error(`内容 ${entry.id} 的栏目 ${entry.column_id} 未找到或缺少根栏目配置`);
  }

  return buildContentDetailUrlFromColumn(entry, section.rootColumn);
}

function filterManagedRootCategory(categories, rootColumn) {
  const rootColumnId = normalizeInteger(rootColumn?.id, 0);
  if (rootColumnId <= 0) {
    return Array.isArray(categories) ? categories : [];
  }
  return (Array.isArray(categories) ? categories : []).filter((item) => (
    normalizeInteger(item?.id, 0) !== rootColumnId
  ));
}

function getManagedCategoryRootPath(rootColumn) {
  const routePath = String(rootColumn?.route_path || '').trim();
  if (!routePath) {
    throw new Error('缺少产品根栏目 route_path 配置');
  }
  return routePath.endsWith('/') ? routePath : `${routePath}/`;
}

function getManagedCategoryRootOutputDir(rootColumn) {
  return String(getManagedCategoryRootPath(rootColumn)).replace(/^\/+|\/+$/g, '');
}

function listNewsCategories({ languageCode = null } = {}) {
  return listColumnCategories('news', { languageCode });
}

function getSectionTopLevelCategories(templateContext, section) {
  if (!section?.rootColumn) {
    return [];
  }
  return templateContext.newsCategories.filter((item) => {
    return normalizeInteger(item.parent_id, 0) === 0
      && normalizeInteger(item.id, 0) !== normalizeInteger(section.rootColumnId, 0)
      && normalizeInteger(item.column_id, 0) !== normalizeInteger(section.rootColumnId, 0);
  });
}

function buildLegacyNewsCategoryUrl(dirName, category) {
  if (
    category?.column_semantics?.is_root
    && String(category?.column_semantics?.render_driver || '') === 'section'
  ) {
    return `/${dirName}/`;
  }
  const categoryDirName = String(category.dir_name || '').trim();
  if (categoryDirName) {
    return `/${dirName}/${categoryDirName}/`;
  }
  return `/${dirName}/${resolveLegacyCategoryPublicId(category)}.html`;
}

function prefixRelativeHrefPaths(html, prefix) {
  const normalizedPrefix = String(prefix || '').trim().replace(/^\/+|\/+$/g, '');
  if (!normalizedPrefix) {
    return String(html || '');
  }
  return String(html || '').replace(/href="(?![a-z]+:|\/|#|mailto:|tel:|javascript:)([^"]+)"/gi, (_, hrefValue) => {
    const normalizedHref = String(hrefValue || '').trim();
    if (!normalizedHref || normalizedHref.startsWith(`${normalizedPrefix}/`)) {
      return `href="${normalizedHref}"`;
    }
    return `href="${normalizedPrefix}/${normalizedHref.replace(/^\/+/, '')}"`;
  });
}

const MANAGED_STATIC_ROOT_FILES = ['index.html', 'contact.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'index.md'];
const LEGACY_MANAGED_STATIC_DIRS = ['about', 'product'];
const SHARED_STATIC_DIRS = ['css', 'uploads'];
const SHARED_STATIC_ROOT_FILES = ['logo.svg'];
const OBSOLETE_SHARED_STATIC_DIRS = ['js', 'JS', 'images', 'skin', 'img', 'Images', 'Skin'];
const SHARED_UPLOAD_ASSET_DIRS = [
  ['images', path.join('uploads', 'images')],
  ['skin', path.join('uploads', 'skin')]
];
const STATIC_BUILD_GROUP_ORDER = ['网站页面', '栏目页', '内容页', '系统文件'];
const CMS_TEMPLATE_BY_PAGE = {
  'legacy-home': 'spirax_home',
  'legacy-contact': 'spirax_contact_page',
  'legacy-content': 'spirax_content_page',
  'legacy-section-root': 'spirax_content_page',
  'legacy-product-list': 'spirax_product_list',
  'legacy-product-detail': 'spirax_product_detail',
  'legacy-article-list': 'spirax_article_list',
  'legacy-article-detail': 'spirax_article_detail'
};
const CMS_TEMPLATE_TYPE_BY_PAGE = {
  'legacy-home': 'home',
  'legacy-contact': 'content',
  'legacy-content': 'content',
  'legacy-section-root': 'content',
  'legacy-product-list': 'list',
  'legacy-product-detail': 'content',
  'legacy-article-list': 'list',
  'legacy-article-detail': 'content'
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
  const targetLanguages = resolveStaticBuildLanguages(languageCode);

  // 先获取 columns 用于动态生成 section 列表
  const columns = listColumns({ languageCode: targetLanguages[0]?.code || null });
  const requestedSections = normalizeSections(sections, columns);
  const targetDefinitions = listStaticBuildTargetDefinitions({ columns });
  const targetMap = new Map(targetDefinitions.map((definition) => [definition.value, definition]));
  const resolvedTargets = Array.from(requestedSections)
    .map((section) => targetMap.get(section))
    .filter(Boolean);

  const requiresTemplateRuntime = resolvedTargets.some((definition) => definition.requiresTemplateRuntime !== false);
  const sharedAssetRoot = path.resolve(outputRoot);

  if (requiresTemplateRuntime) {
    ensureTemplatesSchema();
  }

  const languageBuilds = [];
  let totalFiles = 0;
  let totalRecords = 0;

  for (const language of targetLanguages) {
    const normalizedOutputRoot = resolveLanguageOutputRoot(outputRoot, language);
    const results = [];

    // 初始化全局分类目录映射和栏目映射
    const templateContext = getLegacyTemplateContext(language.code);
    setGlobalCategorySlugMap(templateContext.productCategories);
    globalColumnMap = new Map(
      templateContext.columns.map(col => [normalizeInteger(col.id, 0), col])
    );

    fs.mkdirSync(normalizedOutputRoot, { recursive: true });
    if (cleanExisting) {
      cleanupManagedStaticFiles(normalizedOutputRoot, { columns: templateContext.columns });
      cleanupTemplateClientBundles(normalizedOutputRoot);
    }

    for (const target of resolvedTargets) {
      results.push(target.execute({
        outputRoot: normalizedOutputRoot,
        languageCode: language.code,
        templateContext
      }));
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

function listStaticBuildTargetDefinitions({ columns = null } = {}) {
  const resolvedColumns = Array.isArray(columns) ? columns : listColumns();
  const publicSections = resolvePublicSectionContext(resolvedColumns);
  const rootColumns = resolvedColumns.filter((item) => item?.column_semantics?.is_root);
  const managedCategoryRoots = rootColumns.filter((item) => item?.column_semantics?.render_driver === 'managed_category');
  const pageTreeRoots = rootColumns.filter((item) => item?.column_semantics?.render_driver === 'page_tree');
  const baseTargets = [
    createStaticBuildTargetDefinition({
      group: '网站页面',
      label: '生成首页',
      value: 'index',
      execute: ({ outputRoot, languageCode }) => buildIndexPage({ outputRoot, languageCode })
    }),
    createStaticBuildTargetDefinition({
      group: '栏目页',
      label: '生成单页栏目',
      value: 'column-pages',
      execute: ({ outputRoot, languageCode }) => buildManualSinglePageColumns({ outputRoot, languageCode })
    }),
    createStaticBuildTargetDefinition({
      group: '系统文件',
      label: '生成 robots.txt',
      value: 'robots',
      requiresTemplateRuntime: false,
      execute: ({ outputRoot, languageCode }) => buildRobotsTxt({ outputRoot, languageCode })
    }),
    createStaticBuildTargetDefinition({
      group: '系统文件',
      label: '生成 sitemap.xml',
      value: 'sitemap',
      requiresTemplateRuntime: false,
      execute: ({ outputRoot, languageCode }) => buildSitemap({ outputRoot, languageCode })
    }),
    createStaticBuildTargetDefinition({
      group: '系统文件',
      label: '生成 LLMS 文件',
      value: 'llms',
      requiresTemplateRuntime: false,
      execute: ({ outputRoot, languageCode }) => buildLlmsFiles({ outputRoot, languageCode })
    })
  ];
  const rootColumnTargets = [];

  for (const rootColumn of pageTreeRoots) {
    rootColumnTargets.push(createStaticBuildTargetDefinition({
      group: '栏目页',
      label: `生成栏目页: ${rootColumn.name || '栏目'}`,
      value: `column:${rootColumn.id}:page`,
      execute: ({ outputRoot, languageCode }) => buildPageTreeColumnPages({
        outputRoot,
        languageCode,
        rootColumn
      })
    }));
  }

  for (const rootColumn of managedCategoryRoots) {
    rootColumnTargets.push(
      createStaticBuildTargetDefinition({
        group: '栏目页',
        label: `生成栏目列表: ${rootColumn.name || '栏目'}`,
        value: `column:${rootColumn.id}:list`,
        execute: ({ outputRoot, languageCode }) => buildManagedCategoryColumnListPages({
          outputRoot,
          languageCode,
          rootColumn
        })
      }),
      createStaticBuildTargetDefinition({
        group: '内容页',
        label: `生成内容页: ${rootColumn.name || '栏目'}`,
        value: `column:${rootColumn.id}:detail`,
        execute: ({ outputRoot, languageCode }) => buildManagedCategoryContentPages({
          outputRoot,
          languageCode,
          rootColumn
        })
      })
    );
  }

  const sectionTargets = publicSections.newsSections.flatMap((section) => ([
    createStaticBuildTargetDefinition({
      group: '栏目页',
      label: `生成栏目列表: ${section.sectionLabel}`,
      value: `column:${section.rootColumnId}:list`,
      aliases: [`${section.dirName}-lists`],
      execute: ({ outputRoot, languageCode }) => buildSectionColumnListPages({ outputRoot, languageCode, section })
    }),
    createStaticBuildTargetDefinition({
      group: '内容页',
      label: `生成内容页: ${section.sectionLabel}`,
      value: `column:${section.rootColumnId}:detail`,
      aliases: [`${section.dirName}-details`],
      execute: ({ outputRoot, languageCode }) => buildSectionContentPages({ outputRoot, languageCode, section })
    })
  ]));

  return [...baseTargets, ...rootColumnTargets, ...sectionTargets];
}

function createStaticBuildTargetDefinition({
  group,
  label,
  value,
  execute,
  aliases = [],
  requiresTemplateRuntime = true
}) {
  return {
    group,
    label,
    value,
    aliases,
    execute,
    requiresTemplateRuntime
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

export function buildManualSinglePageColumns({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const items = templateContext.columns.filter((item) => (
    item?.column_semantics?.render_driver === 'single_page'
    && String(item.route_path || '').trim()
  ));
  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('legacy-content', buildLegacySingleColumnPageProps(templateContext, item), templateContext, {
      templateType: 'single',
      targets: [{ target_type: 'column', target_id: item.id }]
    });

    writeTextFile(outputRoot, resolveColumnRouteOutputPath(item.route_path), html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult('column-pages', '单页栏目', items.length, filesWritten);
}

export function buildPageTreeColumnPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, rootColumn = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : templateContext.columns.find((item) => item?.column_semantics?.is_root && item?.column_semantics?.render_driver === 'page_tree') || null;
  const items = templateContext.corporationCategories
    .filter((item) => normalizeInteger(item.id, 0) !== 0);
  const indexItemId = items.find((item) => normalizeInteger(item.parent_id, 0) === 0)?.id ?? items[0]?.id;

  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('legacy-content', buildLegacyContentPageProps(templateContext, item), templateContext, {
      targets: [{ target_type: 'column', target_id: item.id }]
    });

    writeTextFile(outputRoot, path.join('about', `about-${item.id}.html`), html, templateContext.site);
    filesWritten += 1;

    if (normalizeInteger(item.id, 0) === normalizeInteger(indexItemId, 0)) {
      writeTextFile(outputRoot, path.join('about', 'index.html'), html, templateContext.site);
      filesWritten += 1;
    }
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:page` : 'column:page-tree:page', `${targetRootColumn?.name || '栏目'}列表页`, items.length, filesWritten);
}

export function buildSectionColumnListPages({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  languageCode = null,
  section
} = {}) {
  return buildLegacyNewsSectionCategoryPagesByDir({
    outputRoot,
    languageCode,
    section,
    sectionKey: `${section.dirName}-lists`,
    defaultSectionLabel: `${section.sectionLabel}分类页`,
    summaryClassName: section.sectionType === 'service' ? '0a' : 'Font_000000_a'
  });
}

export function buildSectionContentPages({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  idRange,
  languageCode = null,
  section
} = {}) {
  return buildLegacyNewsSectionDetailPagesByDir({
    outputRoot,
    idRange,
    languageCode,
    section,
    sectionKey: `${section.dirName}-details`,
    defaultSectionLabel: `${section.sectionLabel}详情页`
  });
}

export function buildManagedCategoryColumnListPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, rootColumn = null } = {}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : templateContext.columns.find((item) => item?.column_semantics?.is_root && item?.column_semantics?.render_driver === 'managed_category') || null;
  if (!targetRootColumn) {
    throw new Error('缺少产品根栏目配置');
  }
  const categories = templateContext.productCategories;
  const products = listProducts({ visibleOnly: false, limit: 10000, languageCode });
  const categoryMap = new Map(categories.map((item) => [item.id, item]));
  const childrenByParent = groupBy(categories, (item) => normalizeInteger(item.parent_id, 0));
  const productsByCategory = groupBy(products, (item) => normalizeInteger(item.column_id, 0));
  const topLevelCategories = childrenByParent.get(0) || [];
  let filesWritten = 0;

  filesWritten += writeProductCategoryPageSet({
    outputRoot,
    templateContext,
    rootColumn: targetRootColumn,
    category: targetRootColumn,
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
      rootColumn: targetRootColumn,
      category,
      parent,
      children,
      items,
      fileStem: String(categoryId),
      categoryMap
    });
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:list` : 'column:managed-category:list', `${targetRootColumn?.name || '栏目'}列表页`, categories.filter((item) => normalizeInteger(item.id, 0) !== 0).length, filesWritten);
}

export function buildManagedCategoryContentPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange, languageCode = null, rootColumn = null } = {}) {
  const products = filterByIdRange(listProducts({ visibleOnly: false, limit: 10000, languageCode }), idRange);
  const templateContext = getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : templateContext.columns.find((item) => item?.column_semantics?.is_root && item?.column_semantics?.render_driver === 'managed_category') || null;

  // 初始化全局栏目映射
  globalColumnMap = new Map(
    templateContext.columns.map(col => [normalizeInteger(col.id, 0), col])
  );

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
      targets: [{ target_type: 'column', target_id: normalizeInteger(product.column_id, 0) }]
    });

    const categorySlugPath = category ? buildCategorySlugPath(category, categoryMap) : null;
    const outputPath = buildContentDetailPathFromColumn(product, category, categorySlugPath);

    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:detail` : 'column:managed-category:detail', `${targetRootColumn?.name || '栏目'}内容页`, products.length, filesWritten);
}

function buildLegacyNewsSectionCategoryPagesByDir({
  outputRoot,
  languageCode = null,
  section,
  sectionKey,
  defaultSectionLabel,
  summaryClassName
}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const dirName = section.dirName;
  const categoryList = getSectionTopLevelCategories(templateContext, section);
  const items = listNews({ limit: 10000, languageCode });
  const categoryBuckets = groupBy(items, (item) => normalizeInteger(item.column_id, 0));
  const directRootItems = (categoryBuckets.get(section.rootColumnId) || []).slice();
  const hasSectionRootLanding = shouldRenderSectionRootLanding(section?.rootColumn);
  const effectiveCategoryList = categoryList.length > 0
    ? categoryList
    : section?.rootColumn
      ? [section.rootColumn]
      : [];
  let filesWritten = 0;

  if (hasSectionRootLanding) {
    const rootPublicUrl = buildColumnPublicUrl(section.rootColumn, templateContext.publicSections) || `/${dirName}/`;
    const rootHtml = renderCmsSitePage('legacy-section-root', buildLegacySectionRootPageProps({
      templateContext,
      section,
      allItems: items,
      categoryBuckets,
      categoryList
    }), templateContext, {
      targets: []
    });
    writeTextFile(outputRoot, resolveColumnRouteOutputPath(rootPublicUrl), rootHtml, templateContext.site);
    filesWritten += 1;
  }

  for (const [categoryIndex, category] of effectiveCategoryList.entries()) {
    const isRootCategory = normalizeInteger(category.id, 0) === normalizeInteger(section.rootColumnId, 0);
    if (hasSectionRootLanding && isRootCategory) {
      continue;
    }

    const categoryId = normalizeInteger(category.id, 0);
    const pageItems = (categoryBuckets.get(categoryId) || []).slice();
    const pages = paginate(pageItems, NEWS_LIST_PAGE_SIZE);
    const pageList = pages.length > 0 ? pages : [[]];

    for (let pageIndex = 0; pageIndex < pageList.length; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const currentItems = pageList[pageIndex];
      const html = renderCmsSitePage('legacy-article-list', buildLegacyArticleListPageProps({
        templateContext,
        section,
        category,
        pageItems: currentItems,
        pageNumber,
        pageCount: pageList.length,
        totalRecords: pageItems.length,
        summaryClassName
      }), templateContext, {
        targets: [
          { target_type: 'column', target_id: category.id },
          { target_type: 'column', target_id: section.rootColumnId }
        ]
      });

      const categoryDirName = String(category.dir_name || '').trim();
      // 子栏目使用目录结构: /services/introduction/index.html
      // 根栏目使用根目录: /services/index.html, /services/index-2.html
      if (!isRootCategory && categoryDirName) {
        // 子栏目有目录名，使用目录结构
        const fileName = pageNumber === 1 ? 'index.html' : `index-${pageNumber}.html`;
        const relativePath = path.join(dirName, categoryDirName, fileName);
        writeTextFile(outputRoot, relativePath, html, templateContext.site);
        filesWritten += 1;
      } else {
        // 根栏目，直接在section目录下
        if (categoryIndex === 0) {
          // 第一个分类（根分类）生成 index.html
          const fileName = pageNumber === 1 ? 'index.html' : `index-${pageNumber}.html`;
          writeTextFile(outputRoot, path.join(dirName, fileName), html, templateContext.site);
          filesWritten += 1;
        }
        // 其他非根栏目分类但没有dir_name的，暂不处理（未来可扩展）
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
  section,
  sectionKey,
  defaultSectionLabel
}) {
  const templateContext = getLegacyTemplateContext(languageCode);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const dirName = section.dirName;
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
        { target_type: 'column', target_id: section.rootColumnId }
      ]
    });

    const categoryPath = buildRelativeCategoryPathFromRoutePath(category?.route_path, `/${dirName}/`);
    const outputPath = buildContentDetailPathFromColumn(item, category, categoryPath);
    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  buildRegisteredTsxAssets(outputRoot);
  return createBuildResult(sectionKey, defaultSectionLabel, items.length, filesWritten);
}


function getLegacyTemplateContext(languageCode = null) {
  const site = getSiteConfig(languageCode);
  const columns = listColumns({ languageCode });
  const publicSections = resolvePublicSectionContext(columns);
  const managedCategoryRoot = columns.find((item) => item?.column_semantics?.is_root && String(item?.column_semantics?.render_driver || '') === 'managed_category') || null;
  const pageTreeRoot = columns.find((item) => item?.column_semantics?.is_root && String(item?.column_semantics?.render_driver || '') === 'page_tree') || null;
  const rawProductCategories = managedCategoryRoot
    ? listColumnCategoriesByRoot(managedCategoryRoot.id, { languageCode }).slice().sort(compareCategoryOrder)
    : listColumnCategories('product', { languageCode }).slice().sort(compareCategoryOrder);
  const productCategories = filterManagedRootCategory(rawProductCategories, managedCategoryRoot);
  const newsCategories = publicSections.newsSections
    .flatMap((section) => listColumnCategoriesByRoot(section.rootColumnId, { languageCode }))
    .slice()
    .sort(compareCategoryOrder);
  const pageTreeCategories = pageTreeRoot
    ? listColumnCategoriesByRoot(pageTreeRoot.id, { languageCode }).slice().sort(compareCategoryOrder)
    : listColumnCategories('corporation', { languageCode }).slice().sort(compareCategoryOrder);

  return {
    site,
    languageCode,
    columns,
    publicSections,
    newsEntries: listNews({ limit: 10000, languageCode }),
    corporationCategories: pageTreeCategories,
    productCategories,
    newsCategories
  };
}

function buildLegacyCommonProps(templateContext) {
  const newsEntries = Array.isArray(templateContext.newsEntries)
    ? templateContext.newsEntries.map((item) => ({
      ...item,
      url: buildArticleUrl(item, templateContext)
    }))
    : [];

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
    newsEntries,
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
    columns: templateContext.columns,
    newsEntries,
    newsCategories: templateContext.newsCategories,
    productCategories: templateContext.productCategories,
    corporationCategories: templateContext.corporationCategories,
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
    const dirName = normalizeInteger(dirCode, 1) === 2 ? 'services' : 'news';
    if (normalizeInteger(id, 0) > 0) {
      const explicitSection = templateContext.publicSections.getNewsSectionByColumnId(normalizeInteger(id, 0));
      return buildLegacyNewsCategoryList(templateContext, explicitSection?.dirName || dirName);
    }
    return buildLegacyNewsCategoryList(templateContext, dirName);
  });

  return normalizeLegacyTemplateMarkup(html, site);
}

function buildLegacyHomePageProps(templateContext) {
  const homeColumn = templateContext.columns.find((item) => normalizeInteger(item?.id, 0) === 117) || null;
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
  const newsColumns = templateContext.columns.filter((entry) => String(entry.column_type || '') === 'list' && String(entry.model_code || '') === 'news');
  const newsColumnById = new Map(newsColumns.map((entry) => [normalizeInteger(entry.id, 0), entry]));
  const newsSection = templateContext.publicSections.getNewsSectionByDirName('news');
  const serviceSection = templateContext.publicSections.getNewsSectionByDirName('services');
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
    siteColumns: buildLegacySiteColumns(templateContext.columns, {
      activeColumnId: normalizeInteger(homeColumn?.id, 0),
      productCategories: templateContext.productCategories,
      newsEntries: templateContext.newsEntries,
      templateContext
    }),
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
    sourceType: item?.column_type || '',
    sourceId: normalizeInteger(item?.id, 0),
    modelCode: item?.model_code || '',
    showInNav: normalizeInteger(item?.is_visible, 1),
    sortOrder: normalizeInteger(item?.sort_order, 0),
    url: buildLegacyColumnUrl(item, publicSections)
  })).filter((item) => item.id !== 0);

  const visibleRows = normalizedRows
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.url);

  const findByUrl = (url) => visibleRows.find((item) => item.url === url) || null;
  const findByModelRoot = (modelCode) => visibleRows.find((item) => item.modelCode === modelCode && item.sourceType === 'list' && item.parentId === 0) || null;
  const newsSection = publicSections.getNewsSectionByDirName('news');
  const serviceSection = publicSections.getNewsSectionByDirName('services');
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
        sourceType: 'list',
        sourceId: normalizeInteger(cat.id, 0),
        active: false,
        showInNav: 1,
        url: buildLegacyProductCategoryUrl(cat, productCategoryMap)
      }))
    : [];

  return [
    buildHeaderNavItem(findByUrl('/'), {
      name: '首页',
      active: activeColumnId !== 0 && normalizeInteger(findByUrl('/')?.id, 0) === activeColumnId,
      children: []
    }),
    buildHeaderNavItem(findByUrl('/your-goals/'), {
      name: '您的目标',
      children: buildHeaderPrefixChildren(normalizedRows, '/your-goals/', activeColumnId)
    }),
    buildHeaderNavItem(findByModelRoot('product'), {
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
  const contactColumn = templateContext.columns.find((item) => String(item.route_path || '') === '/contact.html') || null;
  const contactPage = contactColumn
    ? resolveDedicatedColumnPageContent(contactColumn, templateContext.languageCode)
    : null;
  const contactUrl = contactColumn ? buildLegacyColumnUrl(contactColumn, templateContext.publicSections) || '/contact.html' : '/contact.html';
  const pageTitleBase = templateContext.site.seo_organization_name || templateContext.site.company_name || templateContext.site.web_name || '';
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'contact',
      title: '联系我们',
      url: contactUrl,
      section: { type: 'content', name: '联系我们', url: contactUrl },
      breadcrumbItems: [{ label: '联系我们' }],
      breadcrumbOptions: { separatorHtml: ' &gt;&gt; ' }
    }),
    contactTableHtml: normalizeLegacyRichTextHtml(contactPage?.content_html, templateContext.site) || '',
    seoMeta: buildSeoMeta({
      title: contactPage?.seo_title || (pageTitleBase ? `联系我们 | ${pageTitleBase}` : '联系我们'),
      description: contactPage?.seo_description || contactPage?.summary || templateContext.site.seo_default_description || templateContext.site.company_address || templateContext.site.company_phone || pageTitleBase || '联系我们',
      url: contactUrl,
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
      section: { type: 'page-tree', name: '单页栏目', url: '/about/' },
      categoryChain: buildTemplateCategoryChain({
        category: item,
        categories: templateContext.corporationCategories,
        type: 'page-tree',
        urlBuilder: (categoryItem) => `/about/about-${normalizeInteger(categoryItem.id, 0)}.html`
      }),
      categoryType: 'page-tree',
      categoryUrl: pageUrl,
      parentCategory,
      parentCategoryType: 'page-tree',
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
  const columnPrimaryImage = getPrimaryTemplateImage(column);
  const categoryChain = buildTemplateCategoryChain({
    category: column,
    categories: templateContext.columns.filter((item) => String(item.column_type || '') === 'single' && String(item.model_code || '') !== 'corporation'),
    type: 'content',
    urlBuilder: (columnItem) => buildLegacyColumnUrl(columnItem)
  });
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'column',
      title: column.name || '',
      url,
      section: {
        id: normalizeInteger(column.id, 0),
        type: 'content',
        name: column.name || '',
        url,
        images: Array.isArray(column?.images) ? column.images : [],
        image: columnPrimaryImage,
        seoDescription: pageContent?.seo_description || '',
        description: pageContent?.seo_description || pageContent?.summary || ''
      },
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
    templateData: pageContent?.template_data || null,
    templateDataJson: pageContent?.template_data_json || null,
    currentCategoryPageData: columnPageData,
    currentCategoryHeroImage: columnPageData?.mastheadImage || columnPageData?.heroImage || columnPrimaryImage,
    contentHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    bodyHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    newsDescription: pageContent?.seo_description || '',
    description: pageContent?.seo_description || '',
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || buildSectionSeoTitle(column.name, templateContext.site),
      description: pageContent?.seo_description || pageContent?.summary || columnPageData?.summary || templateContext.site.seo_default_description || column.name || '',
      url,
      image: columnPageData?.mastheadImage || columnPageData?.heroImage || columnPrimaryImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacySectionRootPageProps({ templateContext, section, allItems, categoryBuckets, categoryList }) {
  const sectionUrl = `/${String(section?.dirName || '').trim().replace(/^\/+|\/+$/g, '')}/`;
  const rootColumn = section?.rootColumn || null;
  const pageContent = resolveDedicatedColumnPageContent(rootColumn, templateContext.languageCode);
  const rootPageData = normalizeLegacyCategoryPageData(rootColumn?.page_data);
  const rootColumnPrimaryImage = getPrimaryTemplateImage(rootColumn);
  const topLevelCategories = Array.isArray(categoryList) ? categoryList : getSectionTopLevelCategories(templateContext, section);
  const buckets = categoryBuckets instanceof Map ? categoryBuckets : groupBy(allItems || [], (item) => normalizeInteger(item.column_id, 0));
  const directRootItems = (buckets.get(normalizeInteger(section?.rootColumnId, 0)) || []).slice().sort(compareByCreatedDesc);
  const generatedPageData = buildLegacySectionRootPageData({
    templateContext,
    section,
    topLevelCategories,
    directRootItems,
    categoryBuckets: buckets
  });
  const pageData = {
    ...(rootPageData || {}),
    ...generatedPageData,
    cards: Array.isArray(rootPageData?.cards) && rootPageData.cards.length > 0 ? rootPageData.cards : generatedPageData.cards,
    sections: Array.isArray(rootPageData?.sections) && rootPageData.sections.length > 0 ? rootPageData.sections : generatedPageData.sections
  };
  const pageTitle = pageData?.title || rootColumn?.name || section?.sectionLabel || '';
  const pageSummary = pageContent?.seo_description || pageContent?.summary || pageData?.summary || templateContext.site.seo_default_description || pageTitle;

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-root',
      title: pageTitle,
      url: sectionUrl,
      section: {
        id: normalizeInteger(rootColumn?.id, 0),
        type: section.sectionType || 'section',
        name: section.sectionLabel || pageTitle,
        url: sectionUrl,
        images: Array.isArray(rootColumn?.images) ? rootColumn.images : [],
        image: rootColumnPrimaryImage,
        seoDescription: pageContent?.seo_description || '',
        description: pageContent?.seo_description || pageContent?.summary || pageData?.summary || ''
      },
      categoryChain: rootColumn ? [{
        raw: rootColumn,
        type: 'section',
        url: sectionUrl
      }] : [],
      categoryType: 'section',
      categoryUrl: sectionUrl,
      breadcrumbItems: [{ label: section.sectionLabel || pageTitle }],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    title: pageTitle,
    section: section.sectionType || 'section',
    sectionDir: section.dirName,
    sectionLabel: section.sectionLabel || pageTitle,
    pageData,
    currentCategoryPageData: pageData,
    currentCategoryHeroImage: pageData?.mastheadImage || pageData?.heroImage || rootColumnPrimaryImage,
    contentHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    bodyHtml: normalizeLegacyRichTextHtml(pageContent?.content_html, templateContext.site) || '',
    newsDescription: pageContent?.seo_description || pageData?.summary || '',
    description: pageContent?.seo_description || pageData?.summary || '',
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext, section.dirName, 0),
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || buildSectionSeoTitle(pageTitle, templateContext.site),
      description: pageSummary,
      url: sectionUrl,
      image: pageData?.mastheadImage || pageData?.heroImage || rootColumnPrimaryImage,
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
  // 如果没有传入 categoryMap，则创建一个
  if (!categoryMap) {
    categoryMap = new Map(templateContext.productCategories.map((item) => [normalizeInteger(item.id, 0), item]));
  }
  const categoryUrl = buildLegacyProductCategoryUrl(category, categoryMap);
  const rootCategory = categoryMap.get(normalizeInteger(category?.column_semantics?.root_column_id, 0))
    || templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(category?.column_semantics?.root_column_id, 0))
    || null;
  const rootCategoryUrl = buildLegacyProductCategoryUrl(rootCategory || category, categoryMap);
  const rootCategoryName = String(rootCategory?.name || '').trim() || '产品';

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
      pageType: 'category-list',
      title: category.name || '',
      url: categoryUrl,
      section: { type: 'managed-category', name: rootCategoryName, url: rootCategoryUrl },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'managed-category',
        urlBuilder: (cat) => buildLegacyProductCategoryUrl(cat, categoryMap)
      }),
      categoryType: 'managed-category',
      categoryUrl,
      parentCategory: parent,
      parentCategoryType: 'managed-category',
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
    productCardItems: pageItems.map((item) => ({
      id: normalizeInteger(item.id, 0),
      name: item.name || '',
      title: item.name || '',
      url: buildProductUrl(item),
      image: item.primary_image || '/skin/dfpic.gif',
      summary: item.summary || '',
      code: item.code || ''
    })),
    pagerHtml: buildLegacyProductPager(categoryUrl, pageNumber, pageCount, totalRecords),
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
  const rootCategory = categoryMap.get(normalizeInteger(category?.column_semantics?.root_column_id, 0))
    || templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(category?.column_semantics?.root_column_id, 0))
    || null;
  const rootCategoryUrl = buildLegacyProductCategoryUrl(rootCategory || category, categoryMap);
  const rootCategoryName = String(rootCategory?.name || '').trim() || '产品';
  const rootCategoryPathPrefix = String(rootCategoryUrl || '').trim();

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

          const matchingCategory = templateContext.productCategories.find((cat) =>
            cat.dir_name && (
              card.href.endsWith(`/${cat.dir_name}`)
              || card.href.includes(`/${cat.dir_name}/`)
            )
          );
          if (matchingCategory) {
            return {
              ...card,
              href: buildLegacyProductCategoryUrl(matchingCategory, categoryMap)
            };
          }

          if (rootCategoryPathPrefix && card.href.startsWith(rootCategoryPathPrefix) && !card.href.endsWith('/') && !card.href.endsWith('.html')) {
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
      pageType: 'content-detail',
      title: product.name || '',
      url: productUrl,
      section: { type: 'managed-category', name: rootCategoryName, url: rootCategoryUrl },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.productCategories,
        type: 'managed-category',
        urlBuilder: (cat) => buildLegacyProductCategoryUrl(cat, categoryMap)
      }),
      categoryType: 'managed-category',
      categoryUrl: category ? buildLegacyProductCategoryUrl(category, categoryMap) : '',
      parentCategory: parent,
      parentCategoryType: 'managed-category',
      parentCategoryUrl: parent ? buildLegacyProductCategoryUrl(parent, categoryMap) : '',
      content: product,
      contentType: 'structured-content',
      contentUrl: productUrl,
      breadcrumbItems: [
        { label: rootCategoryName, href: rootCategoryUrl },
        ...buildLegacyProductCategoryBreadcrumbItems(category, parent, categoryMap),
        { label: product.name || '' }
      ]
    }),
    title: product.name || '',
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
  const resolvedSectionConfig = typeof section === 'object' && section
    ? section
    : templateContext.publicSections.getNewsSectionByType(String(section || '').trim().toLowerCase())
      || { dirName: 'news', sectionLabel: '公司新闻', sectionType: 'news' };
  const sectionDir = resolvedSectionConfig.dirName;
  const sectionLabel = resolvedSectionConfig.sectionLabel;
  const sectionPrimaryImage = getPrimaryTemplateImage(resolvedSectionConfig.rootColumn);
  const categoryPageData = normalizeLegacyCategoryPageData(category?.page_data);
  const categoryPrimaryImage = getPrimaryTemplateImage(category);
  const categoryHeroImage = categoryPageData?.mastheadImage
    || categoryPageData?.heroImage
    || categoryPrimaryImage
    || sectionPrimaryImage;
  const categorySummary = categoryPageData?.hero?.summary
    || categoryPageData?.summary
    || category?.summary
    || category?.seo_description
    || resolvedSectionConfig.rootColumn?.summary
    || resolvedSectionConfig.rootColumn?.seo_description
    || '';
  const categoryPublicId = resolveLegacyCategoryPublicId(category);
  const categoryUrl = buildLegacyNewsCategoryUrl(sectionDir, category);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-list',
      title: category.name || '',
      url: categoryUrl,
      section: {
        id: normalizeInteger(resolvedSectionConfig.rootColumn?.id, 0),
        type: resolvedSectionConfig.sectionType || 'section',
        name: sectionLabel,
        url: `/${sectionDir}/`,
        images: Array.isArray(resolvedSectionConfig.rootColumn?.images) ? resolvedSectionConfig.rootColumn.images : [],
        image: categoryHeroImage,
        seoDescription: categorySummary,
        description: categorySummary
      },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: 'section',
        urlBuilder: (categoryItem) => buildLegacyNewsCategoryUrl(sectionDir, categoryItem)
      }),
      categoryType: 'section',
      categoryUrl,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section: resolvedSectionConfig.sectionType || 'section',
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildLegacyNewsCategoryList(templateContext, sectionDir),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext, sectionDir, normalizeInteger(category.id, 0)),
    currentSectionHeroImage: sectionPrimaryImage,
    currentCategoryDescription: normalizeRenderableLegacyText(categorySummary),
    currentCategoryPageData: categoryPageData,
    currentCategoryHeroImage: categoryHeroImage,
    categoryId: categoryPublicId,
    title: category.name || '',
    items: buildLegacyArticleListItems({
      pageItems,
      summaryClassName,
      column: category
    }),
    articleCardItems: pageItems.map((item) => ({
      id: item.id,
      title: item.title || '',
      url: buildContentDetailUrlFromColumn(item, category),
      image: item.picture || '',
      summary: resolveRenderableNewsSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    })),
    pagerHtml: buildLegacyArticlePager({
      categoryUrl,
      pageNumber,
      pageCount,
      totalRecords
    }),
    seoMeta: buildSeoMeta({
      title: category.seo_title || buildSectionSeoTitle(category.name || sectionLabel, templateContext.site),
      description: category.seo_description || templateContext.site.seo_default_description || category.name || sectionLabel,
      url: categoryUrl,
      image: sectionPrimaryImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site)
  };
}

function buildLegacyArticleDetailPageProps({ templateContext, section, sectionConfig = null, item, category, previous, next }) {
  const resolvedSectionConfig = sectionConfig
    || (typeof section === 'object' && section)
    || templateContext.publicSections.getNewsSectionByType(String(section || '').trim().toLowerCase())
    || { dirName: 'news', sectionLabel: '公司新闻', sectionType: 'news', rootColumn: null };
  const sectionDir = resolvedSectionConfig.dirName;
  const sectionLabel = resolvedSectionConfig.sectionLabel;
  const sectionPrimaryImage = getPrimaryTemplateImage(resolvedSectionConfig.rootColumn);
  const articleUrl = resolvedSectionConfig.rootColumn
    ? buildContentDetailUrlFromColumn(item, resolvedSectionConfig.rootColumn)
    : `/news/detail/${normalizeInteger(item.id, 0)}.html`;
  const relatedArticles = listNews({ limit: 10000, languageCode: templateContext.languageCode })
    .filter((entry) => normalizeInteger(entry.column_id, 0) === normalizeInteger(item.column_id, 0) && normalizeInteger(entry.id, 0) !== normalizeInteger(item.id, 0))
    .slice(0, 3);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-detail',
      title: item.title || '',
      url: articleUrl,
      section: {
        id: normalizeInteger(resolvedSectionConfig.rootColumn?.id, 0),
        type: resolvedSectionConfig.sectionType || 'section',
        name: sectionLabel,
        url: `/${sectionDir}/`,
        images: Array.isArray(resolvedSectionConfig.rootColumn?.images) ? resolvedSectionConfig.rootColumn.images : [],
        image: sectionPrimaryImage,
        seoDescription: resolvedSectionConfig.rootColumn?.seo_description || '',
        description: resolvedSectionConfig.rootColumn?.seo_description || resolvedSectionConfig.rootColumn?.summary || ''
      },
      categoryChain: buildTemplateCategoryChain({
        category,
        categories: templateContext.newsCategories,
        type: 'section',
        urlBuilder: (categoryItem) => buildLegacyNewsCategoryUrl(sectionDir, categoryItem)
      }),
      categoryType: 'section',
      categoryUrl: category ? buildLegacyNewsCategoryUrl(sectionDir, category) : '',
      content: item,
      contentType: 'structured-content',
      contentUrl: articleUrl,
      breadcrumbItems: [
        { label: sectionLabel, href: `/${sectionDir}/` },
        { label: category?.name || '' }
      ],
      breadcrumbOptions: { homeHref: '/', homeLabel: '首页', prefixHtml: '' }
    }),
    section: resolvedSectionConfig.sectionType || 'section',
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildLegacyNewsCategoryList(templateContext, sectionDir),
    secondaryMenuItems: buildLegacyNewsMenuItems(templateContext, sectionDir, normalizeInteger(category?.id, 0)),
    currentSectionHeroImage: sectionPrimaryImage,
    title: item.title || '',
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
      url: resolvedSectionConfig.rootColumn
        ? buildContentDetailUrlFromColumn(entry, resolvedSectionConfig.rootColumn)
        : `/news/detail/${normalizeInteger(entry.id, 0)}.html`,
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

function getPrimaryTemplateImage(record) {
  if (!record) {
    return '';
  }
  const images = Array.isArray(record?.images)
    ? record.images.filter((item) => typeof item === 'string' && item.trim())
    : [];
  return normalizeUploadedRelativePath(String(record?.image || images[0] || '').trim());
}

function normalizeTemplateSection(section) {
  if (!section) {
    return null;
  }
  const images = Array.isArray(section.images)
    ? section.images.filter((item) => typeof item === 'string' && item.trim())
    : [];
  return {
    id: normalizeInteger(section.id, 0),
    type: section.type || '',
    name: section.name || '',
    url: section.url || '',
    images,
    image: normalizeUploadedRelativePath(String(section.image || images[0] || '').trim()),
    seoDescription: section.seoDescription || '',
    description: section.description || section.summary || ''
  };
}

function normalizeTemplateCategory(category, options = {}) {
  if (!category) {
    return null;
  }
  const images = Array.isArray(category.images)
    ? category.images.filter((item) => typeof item === 'string' && item.trim())
    : [];
  return {
    id: normalizeInteger(category.id, 0),
    type: options.type || '',
    name: category.name || '',
    url: options.url || '',
    parentId: normalizeInteger(category.parent_id, 0),
    parentName: options.parent?.name || '',
    images,
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
  const rootCategory = categoryMap?.get(normalizeInteger(category?.column_semantics?.root_column_id, 0)) || null;
  const rootLabel = String(rootCategory?.name || '').trim() || '产品';
  const rootHref = rootCategory ? buildLegacyProductCategoryUrl(rootCategory, categoryMap) : '';
  const items = [{ label: rootLabel, href: rootHref }];
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
    ? getSectionTopLevelCategories(templateContext, section)
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
  return getSectionTopLevelCategories(templateContext, section).map((item) => ({
      label: item.name || '',
      url: buildLegacyNewsCategoryUrl(dirName, item),
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function shouldRenderSectionRootLanding(rootColumn) {
  if (!rootColumn) {
    return false;
  }
  return true;
}

function buildLegacySectionRootPageData({
  templateContext,
  section,
  topLevelCategories,
  directRootItems,
  categoryBuckets
}) {
  const rootColumn = section?.rootColumn || null;
  const existing = normalizeLegacyCategoryPageData(rootColumn?.page_data) || {};
  const safeCategoryBuckets = categoryBuckets instanceof Map ? categoryBuckets : new Map();
  const generatedCards = (directRootItems || []).map((item) => ({
    title: item.title || '',
    description: resolveRenderableNewsSummary(item),
    href: buildArticleUrl(item, templateContext, section),
    image: item.picture || '',
    imageAlt: item.title || '',
    cta: ''
  }));
  const generatedSections = (topLevelCategories || []).map((category) => {
    const categoryLinks = buildLegacySectionRootCategoryLinks({
      templateContext,
      section,
      category,
      categoryBuckets: safeCategoryBuckets
    });
    return {
      title: category.name || '',
      description: category.seo_description || category.summary || '',
      links: categoryLinks
    };
  }).filter((item) => Array.isArray(item.links) && item.links.length > 0);
  const generatedCategoryCards = (topLevelCategories || []).map((category) => ({
    title: category.name || '',
    description: category.seo_description || category.summary || '',
    href: buildLegacyNewsCategoryUrl(section.dirName, category),
    image: '',
    imageAlt: category.name || '',
    cta: ''
  }));

  return {
    ...existing,
    cards: generatedCards.length > 0 ? generatedCards : generatedCategoryCards,
    sections: generatedSections,
    summary: existing.summary || rootColumn?.summary || section?.sectionLabel || '',
    introBlock: existing.introBlock || (
      rootColumn?.summary
        ? { body: rootColumn.summary }
        : null
    )
  };
}

function buildLegacySectionRootCategoryLinks({ templateContext, section, category, categoryBuckets }) {
  const allowedIds = Array.from(new Set(getDescendantColumnIds(
    templateContext.publicSections.newsTree.childrenByParentId,
    normalizeInteger(category?.id, 0)
  )));
  const links = allowedIds
    .flatMap((columnId) => (categoryBuckets.get(normalizeInteger(columnId, 0)) || []).slice())
    .slice()
    .sort(compareByCreatedDesc)
    .map((item) => ({
      title: item.title || '',
      href: buildArticleUrl(item, templateContext, section),
      description: resolveRenderableNewsSummary(item)
    }));

  if (links.length > 0) {
    return links;
  }

  return [{
    title: category?.name || '',
    href: buildLegacyNewsCategoryUrl(section.dirName, category),
    description: category?.seo_description || category?.summary || ''
  }];
}

function compareByCreatedDesc(left, right) {
  const timeDiff = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
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
      const images = Array.isArray(item?.images) ? item.images : [];
      const image = normalizeUploadedRelativePath(
        String(
          images[0]
          || ''
        ).trim()
      );
      return {
        id: itemId,
        label: item.name || '',
        title: item.name || '',
        url: buildLegacyProductCategoryUrl(item, categoryMap),
        active: itemId === normalizeInteger(activeId, 0),
        description,
        ctaLabel: description ? 'Explore more' : '',
        image: image || '',
        imageAlt: item.name || ''
      };
    });
}

function buildLegacyProductNavigation({ categories, currentCategory, currentParent, fallbackCategories = [], categoryMap = null }) {
  const safeCategories = Array.isArray(categories) ? categories : [];
  const activeId = normalizeInteger(currentCategory?.id, 0);
  const parentId = normalizeInteger(currentCategory?.parent_id, 0);
  const directChildren = activeId > 0
    ? safeCategories
      .filter((item) => normalizeInteger(item.parent_id, 0) === activeId)
      .sort(compareCategoryOrder)
    : (Array.isArray(fallbackCategories) ? fallbackCategories.slice().sort(compareCategoryOrder) : []);
  const siblingCategories = parentId > 0
    ? safeCategories
      .filter((item) => normalizeInteger(item.parent_id, 0) === parentId)
      .sort(compareCategoryOrder)
    : [];

  if (directChildren.length > 0 || activeId === 0) {
    return {
      title: currentCategory?.name || 'Browse categories',
      parentUrl: currentCategory ? buildLegacyProductCategoryUrl(currentCategory, categoryMap) : '',
      items: buildLegacyProductMenuItems(directChildren, activeId, categoryMap)
    };
  }

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
  const hero = value.hero && typeof value.hero === 'object' && !Array.isArray(value.hero)
    ? {
        ...value.hero,
        title: String(value.hero.title || value.title || '').trim(),
        summary: String(value.hero.summary || value.summary || '').trim(),
        image: String(value.hero.image || value.mastheadImage || value.heroImage || '').trim()
      }
    : null;

  return {
    title: String(value.title || '').trim(),
    summary: String(value.summary || '').trim(),
    pageKind,
    heroImage: String(value.heroImage || '').trim(),
    mastheadImage: String(value.mastheadImage || value.heroImage || '').trim(),
    hero,
    categoryNavTitle: String(value.categoryNavTitle || '').trim(),
    intro: normalizeLegacyLooseParagraphs(value.intro),
    overview: Array.isArray(value.overview) ? value.overview.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [],
    benefits: Array.isArray(value.benefits) ? value.benefits.filter(Boolean) : [],
    cards: Array.isArray(value.cards) ? value.cards.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    models: Array.isArray(value.models) ? value.models.filter(Boolean) : [],
    downloads: Array.isArray(value.downloads) ? value.downloads.filter(Boolean) : [],
    supplementalSections: Array.isArray(value.supplementalSections) ? value.supplementalSections.filter(Boolean) : [],
    brandPathSection: value.brandPathSection && typeof value.brandPathSection === 'object' ? value.brandPathSection : null,
    browseByTopicSection: value.browseByTopicSection && typeof value.browseByTopicSection === 'object' ? value.browseByTopicSection : null,
    topPanel: value.topPanel && typeof value.topPanel === 'object' ? value.topPanel : null,
    seo: value.seo && typeof value.seo === 'object' ? value.seo : null,
    items: Array.isArray(value.items) ? value.items.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    sections: Array.isArray(value.sections) ? value.sections.filter(Boolean).map(normalizeLegacySectionLinkFields) : [],
    resources: Array.isArray(value.resources) ? value.resources.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    products: Array.isArray(value.products) ? value.products.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    features: Array.isArray(value.features) ? value.features.filter(Boolean) : [],
    calloutCards: Array.isArray(value.calloutCards) ? value.calloutCards.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    promoCards: Array.isArray(value.promoCards) ? value.promoCards.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    filterGroups: Array.isArray(value.filterGroups) ? value.filterGroups.filter(Boolean) : [],
    jobs: Array.isArray(value.jobs) ? value.jobs.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
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
    slides: Array.isArray(value.slides) ? value.slides.filter(Boolean).map(normalizeLegacyPageLinkFields) : [],
    featureHeading: value.featureHeading && typeof value.featureHeading === 'object' ? value.featureHeading : null,
    introBlock: value.introBlock && typeof value.introBlock === 'object' ? value.introBlock : (value.intro && typeof value.intro === 'object' && !Array.isArray(value.intro) ? value.intro : null),
    partnerHeading: value.partnerHeading && typeof value.partnerHeading === 'object' ? value.partnerHeading : null,
    advice: value.advice && typeof value.advice === 'object' ? value.advice : null,
    supportList: value.supportList && typeof value.supportList === 'object' ? value.supportList : null,
    frame: value.frame && typeof value.frame === 'object' ? value.frame : null,
    promo: value.promo && typeof value.promo === 'object' ? normalizeLegacyPageLinkFields(value.promo) : null,
    spotlight: value.spotlight && typeof value.spotlight === 'object' ? value.spotlight : null
  };
}

function normalizeLegacySectionLinkFields(section) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return section;
  }
  return {
    ...section,
    links: Array.isArray(section.links) ? section.links.filter(Boolean).map(normalizeLegacyPageLinkFields) : section.links
  };
}

function normalizeLegacyPageLinkFields(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }

  const normalized = { ...item };
  for (const key of ['href', 'link', 'url']) {
    if (key in normalized) {
      normalized[key] = normalizeLegacyInternalHref(normalized[key]);
    }
  }
  return normalized;
}

function normalizeLegacyInternalHref(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }
  if (!normalized.startsWith('/')) {
    return normalized;
  }
  if (normalized.endsWith('/') || normalized.endsWith('.html')) {
    return normalized;
  }
  return `${normalized}/`;
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

function buildLegacyProductPager(categoryUrl, pageNumber, pageCount, totalRecords) {
  const normalizedCategoryUrl = String(categoryUrl || '').trim();
  if (!normalizedCategoryUrl) {
    throw new Error('缺少产品栏目分页 URL');
  }
  const firstPageUrl = normalizedCategoryUrl;
  const buildPagedUrl = (targetPageNumber) => (
    targetPageNumber <= 1
      ? firstPageUrl
      : `${normalizedCategoryUrl}index-${targetPageNumber}.html`
  );
  const previousPageUrl = pageNumber <= 2
    ? firstPageUrl
    : buildPagedUrl(pageNumber - 1);
  const nextPageUrl = buildPagedUrl(pageNumber + 1);
  const lastPageUrl = pageCount <= 1
    ? firstPageUrl
    : buildPagedUrl(pageCount);

  let html = '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
  html += `共 <strong>${totalRecords}</strong> 条信息 `;
  html += ` <a href="${firstPageUrl}">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${previousPageUrl}">上一页</a>` : ' <span>上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${nextPageUrl}">下一页</a>` : ' <span>下一页</span>';
  html += ` <a href="${lastPageUrl}">末页</a>`;
  html += ` 页次：<strong> ${pageNumber}/${pageCount} </strong>页 <strong>${PRODUCT_LIST_PAGE_SIZE}</strong>条信息/页</td></tr></table>`;
  return html;
}

function writeProductCategoryPageSet({
  outputRoot,
  templateContext,
  rootColumn,
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

  const categoryId = normalizeInteger(category.id, 0);
  const rootOutputDir = getManagedCategoryRootOutputDir(rootColumn);
  const isRootCategory = normalizeInteger(rootColumn?.id, 0) === categoryId;
  let categorySlugPath = categoryId > 0 && category.dir_name && categoryMap
    ? buildCategorySlugPath(category, categoryMap)
    : [];
  const rootDirName = String(rootColumn?.dir_name || '').trim();
  if (rootDirName && categorySlugPath[0] === rootDirName) {
    categorySlugPath = categorySlugPath.slice(1);
  }
  const useSlugPath = categorySlugPath.length > 0 || isRootCategory;

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
      targets: [{ target_type: 'column', target_id: normalizeInteger(category.id, 0) || normalizeInteger(rootColumn?.id, 0) }]
    });

    let outputDir, fileName;

    if (useSlugPath) {
      outputDir = categorySlugPath.length > 0
        ? path.join(rootOutputDir, ...categorySlugPath)
        : rootOutputDir;
      fileName = pageNumber === 1 ? 'index.html' : `index-${pageNumber}.html`;
    } else {
      continue;
    }

    writeTextFile(outputRoot, path.join(outputDir, fileName), legacyHtml, templateContext.site);
    filesWritten += 1;
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

function buildLegacyArticleListItems({ pageItems, summaryClassName, column }) {
  return pageItems.map((item) => {
    const summary = resolveRenderableNewsSummary(item);
    const fullUrl = buildContentDetailUrlFromColumn(item, column);

    return {
      id: item.id,
      title: item.title || '',
      url: fullUrl,
      date: formatLegacyDateOnly(item.created_at) || '',
      summary: gotTopicLegacy(summary || '', 230),
      summaryClassName: summaryClassName || ''
    };
  });
}

function buildLegacyArticlePager({ categoryUrl, pageNumber, pageCount, totalRecords }) {
  const normalizedCategoryUrl = String(categoryUrl || '').trim();
  const isDirStyle = normalizedCategoryUrl.endsWith('/');
  const buildPageHref = (targetPage) => {
    if (isDirStyle) {
      return targetPage <= 1 ? 'index.html' : `index-${targetPage}.html`;
    }
    const base = normalizedCategoryUrl.split('/').pop() || '';
    const baseName = base.replace(/\.html$/i, '');
    return `${baseName}-${targetPage}.html`;
  };
  let html = '<table width="90%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td height="45" align="center">';
  html += `共 <strong>${totalRecords}</strong> 条信息 `;
  html += `<a href="${buildPageHref(1)}" class="0a">首页</a>`;
  html += pageNumber > 1 ? ` <a href="${buildPageHref(pageNumber - 1)}" class="0a">上一页</a>` : ' <span class="0a">上一页</span>';
  html += pageNumber < pageCount ? ` <a href="${buildPageHref(pageNumber + 1)}" class="0a">下一页</a>` : ' <span class="0a">下一页</span>';
  html += ` <a href="${buildPageHref(pageCount)}" class="0a">尾页</a> `;
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
  const serviceSection = publicSections.getNewsSectionByDirName('services');
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

export function resolveStaticBuildSectionKey(section, { languageCode = null, columns = null } = {}) {
  const normalized = String(section || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === 'all') {
    return 'all';
  }

  const resolvedColumns = columns || listColumns({ languageCode });
  const target = listStaticBuildTargetDefinitions({ columns: resolvedColumns }).find((definition) => (
    definition.value === normalized || definition.aliases.includes(normalized)
  ));

  return target?.value || normalized;
}

export function listStaticBuildTargetGroups({ languageCode = null, columns = null } = {}) {
  const resolvedColumns = columns || listColumns({ languageCode });
  const definitions = listStaticBuildTargetDefinitions({ columns: resolvedColumns });
  const grouped = new Map();

  for (const groupTitle of STATIC_BUILD_GROUP_ORDER) {
    grouped.set(groupTitle, []);
  }

  for (const definition of definitions) {
    if (!grouped.has(definition.group)) {
      grouped.set(definition.group, []);
    }
    grouped.get(definition.group).push({
      label: definition.label,
      value: definition.value
    });
  }

  return Array.from(grouped.entries())
    .map(([title, items]) => ({ title, items }))
    .filter((group) => group.items.length > 0);
}

export function listStaticBuildSectionKeys({ languageCode = null, columns = null } = {}) {
  const resolvedColumns = columns || listColumns({ languageCode });
  return listStaticBuildTargetDefinitions({ columns: resolvedColumns }).map((item) => item.value);
}

export function isSupportedStaticBuildSection(section, { languageCode = null, columns = null } = {}) {
  const normalized = resolveStaticBuildSectionKey(section, { languageCode, columns });
  if (!normalized) {
    return false;
  }

  return new Set(listStaticBuildSectionKeys({ languageCode, columns })).has(normalized);
}

function normalizeSections(sections, columns = null) {
  const defaults = listStaticBuildSectionKeys({ columns });
  if (!sections) {
    return new Set(defaults);
  }
  const targetDefinitions = listStaticBuildTargetDefinitions({ columns });
  const aliasMap = new Map();
  for (const target of targetDefinitions) {
    aliasMap.set(target.value, target.value);
    for (const alias of target.aliases) {
      aliasMap.set(alias, target.value);
    }
  }
  const requestedSections = Array.isArray(sections) ? sections : [sections];
  return new Set(
    requestedSections
      .map((section) => aliasMap.get(String(section || '').trim()) || String(section || '').trim())
      .filter(Boolean)
  );
}

function cleanupManagedStaticFiles(outputRoot, { columns = null } = {}) {
  const managedDirs = collectManagedStaticDirs(columns);
  for (const relativePath of MANAGED_STATIC_ROOT_FILES) {
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
    cleanupHtmlFilesRecursive(dirPath);
  }

  cleanupStaleTopLevelStaticDirs(outputRoot, managedDirs);
  cleanupManagedSitemapChunks(outputRoot);
}

function collectManagedStaticDirs(columns = null) {
  const resolvedColumns = Array.isArray(columns) ? columns : listColumns();
  const publicSections = resolvePublicSectionContext(resolvedColumns);
  const dirs = new Set(LEGACY_MANAGED_STATIC_DIRS);

  for (const column of resolvedColumns) {
    addManagedStaticDirFromPath(dirs, column?.route_path);
    addManagedStaticDirFromPath(dirs, column?.custom_url);
    addManagedStaticDirFromPath(dirs, buildColumnPublicUrl(column, publicSections));
  }

  return Array.from(dirs).filter(Boolean).sort();
}

function addManagedStaticDirFromPath(target, pathValue) {
  const normalized = String(pathValue || '').trim();
  if (!normalized || /^https?:\/\//i.test(normalized)) {
    return;
  }

  const firstSegment = normalized
    .split(/[?#]/, 1)[0]
    .split('/')
    .filter(Boolean)[0] || '';
  if (!firstSegment) {
    return;
  }

  const reservedRoots = new Set([
    'admin',
    'api',
    'assets',
    'css',
    'images',
    'img',
    'skin',
    'upload',
    'uploadfile',
    'uploads'
  ]);
  if (reservedRoots.has(firstSegment.toLowerCase())) {
    return;
  }

  target.add(firstSegment);
}

function cleanupStaleTopLevelStaticDirs(outputRoot, managedDirs = []) {
  const protectedDirs = new Set([
    ...managedDirs,
    ...SHARED_STATIC_DIRS,
    'assets',
    'img',
    'admin',
    'api',
    'upload',
    'uploadfile'
  ].map((item) => String(item || '').trim()).filter(Boolean));

  for (const entry of fs.readdirSync(outputRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    if (protectedDirs.has(entry.name)) {
      continue;
    }
    const dirPath = path.join(outputRoot, entry.name);
    cleanupHtmlFilesRecursive(dirPath);
    removeDirectoryIfEmpty(dirPath);
  }
}

function cleanupHtmlFilesRecursive(currentPath) {
  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      cleanupHtmlFilesRecursive(fullPath);
      removeDirectoryIfEmpty(fullPath);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (extension === '.html' || extension === '.htm' || extension === '.md' || entry.name === '.DS_Store') {
      fs.unlinkSync(fullPath);
    }
  }
}

function removeDirectoryIfEmpty(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return;
  }
  if (fs.readdirSync(dirPath).length === 0) {
    fs.rmdirSync(dirPath);
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
  syncSharedUploadAssetDirs(resolvedSharedRoot, resolvedOutputRoot);
  syncSharedStaticRootFiles(resolvedSharedRoot, resolvedOutputRoot);
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

function syncSharedUploadAssetDirs(sharedRoot, outputRoot) {
  for (const [sourceName, targetRelativeDir] of SHARED_UPLOAD_ASSET_DIRS) {
    const targetDir = path.join(outputRoot, targetRelativeDir);
    const sourceDir = [
      path.join(sharedRoot, targetRelativeDir),
      path.join(PUBLIC_ROOT, sourceName)
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
  return html
    .replace(/<meta\s+name="keywords"\s+content="[^"]*"\s*\/?>/gi, '')
    .replace(/<meta\s+name="description"\s+content="([^"]*)"/gi, (_, content) => {
      const sanitized = sanitizeLegacyMetaContent(content, 'description');
      return `<meta name="description" content="${escapeHtmlAttribute(sanitized)}"`;
    });
}

function sanitizeLegacyMetaContent(value, type) {
  const normalized = normalizeRenderableLegacyText(value);
  if (!normalized) {
    return '';
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
