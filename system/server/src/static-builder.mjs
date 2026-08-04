import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, PROJECT_ROOT, PUBLIC_ROOT } from './config.mjs';
import { getDb, queryAll } from './db.mjs';
import { createCmsTemplateRuntime } from './cms-template-runtime.mjs';
import { listColumns } from './services/columns.mjs';
import { listColumnNodes, mapColumnNodesByRoot } from './services/column-nodes.mjs';
import { getDescendantColumnIds } from './services/column-tree.mjs';
import { getContentItemById, listContentItems, resolveContentItemComparator } from './services/content-items.mjs';
import { buildRobotsTxt } from './services/robots.mjs';
import { buildSitemap } from './services/sitemap.mjs';
import { buildLlmsFiles } from './services/llms.mjs';
import {
  buildColumnPublicUrl,
  buildSectionColumnPublicUrl,
  filterPublicSectionColumns,
  resolveLegacyColumnPublicId,
  resolvePublicSectionContext
} from './services/public-sections.mjs';
import {
  buildSectionContentContext,
  getSectionTopLevelCategories,
  listSectionEntries,
  resolveSectionListPageSize,
  shouldRenderSectionRootAsList
} from './services/section-content.mjs';
import {
  buildRelativeCategoryPathFromRoutePath,
  buildColumnSlugPath,
  buildManagedColumnPublicUrl,
  resolveColumnPageOutputPath,
  resolvePublicPageOutputPath,
  resolveColumnRouteOutputPath,
  buildContentDetailUrlFromColumn,
  buildContentDetailPathFromColumn
} from './services/column-paths.mjs';
import {
  getSiteConfig,
  normalizeLanguageSitePathPrefix,
  prefixLanguageSitePath,
  resolveLanguageSitePublicBaseUrl
} from './services/site.mjs';
import { ensureTemplatesSchema } from './services/templates.mjs';
import { getTopicProfileByColumnId, listTopicProfiles } from './services/topic-profiles.mjs';
import { listLanguages } from './services/languages.mjs';
import { ensureMediaAssetsSchema } from './services/media-assets.mjs';
import { resolveNormalizedTemplateImagePath } from './services/template-data-assets.mjs';
import { escapeHtml } from './utils/html.mjs';
import { looksLikeLegacyMojibake } from './utils/legacy-text.mjs';
import { normalizeLegacyAssetText, normalizeUploadedRelativePath, resolvePublicAssetUrl, resolveUploadedFilePath } from './services/uploads.mjs';
import {
  buildSeoMeta,
  buildHreflangLinks,
  buildJsonLdOrganization,
  buildJsonLdPageGraph,
  buildJsonLdStructuredContent,
  buildJsonLdSectionEntry,
  buildStructuredContentSeoMeta,
  buildSectionEntrySeoMeta,
  generateFaviconLinks,
  generateThemeColorMetas
} from './services/seo-meta.mjs';

const DEFAULT_OUTPUT_ROOT = CONTENT_ROOT;
const MANAGED_LIST_PAGE_SIZE = 18;
const DEFAULT_NEWS_LIST_PAGE_SIZE = 6;

// 全局分类目录映射，在静态生成时填充
let globalColumnSlugMap = new Map();
let globalManagedColumnMap = new Map(); // 托管内容栏目映射
let globalColumnMap = new Map(); // 栏目映射
const imageDimensionCache = new Map();
let productPdfAssetCache = null;
let globalStaticBuildProgressReporter = null;
let globalStaticBuildProgressState = {
  languageCode: null,
  outputRoot: null,
  currentTarget: null
};

/**
 * 设置全局分类目录映射
 */
function setGlobalColumnSlugMap(columns, rootColumn = null) {
  globalManagedColumnMap = buildManagedColumnPathMap(columns, rootColumn);

  // 为每个分类构建完整的目录路径
  globalColumnSlugMap = new Map(
    columns.map((columnNode) => {
      const slugPath = buildColumnSlugPath(columnNode, globalManagedColumnMap);
      return [normalizeInteger(columnNode.id, 0), slugPath.join('/')];
    })
  );
}

function buildManagedColumnPathMap(categories, rootColumn = null) {
  const rows = Array.isArray(categories) ? categories : [];
  const map = new Map(rows.map((column) => [normalizeInteger(column.id, 0), column]));
  const rootId = normalizeInteger(rootColumn?.id, 0);
  if (rootId > 0 && !map.has(rootId)) {
    map.set(rootId, rootColumn);
  }
  if (rootId > 0) {
    for (const [id, column] of map) {
      if (id !== rootId && normalizeInteger(column?.parent_id, 0) === 0) {
        map.set(id, { ...column, parent_id: rootId });
      }
    }
  }
  return map;
}

function buildManagedContentUrl(contentItem, columnSlugPath = null) {
  // 从内容的 column_id 获取栏目
  const column = globalColumnMap.get(normalizeInteger(contentItem.column_id, 0));
  if (!column) {
    throw new Error(`内容 ${contentItem.id} 的栏目 ${contentItem.column_id} 不存在`);
  }
  return buildContentDetailUrlFromColumn(contentItem, column, columnSlugPath);
}

function buildArticleUrl(entry, templateContext, sectionOverride = null) {
  const publicSections = templateContext?.publicSections;
  const section = sectionOverride
    || publicSections?.getSectionByColumnId?.(normalizeInteger(entry?.column_id, 0))
    || null;

  if (!section?.rootColumn) {
    throw new Error(`内容 ${entry.id} 的栏目 ${entry.column_id} 未找到或缺少根栏目配置`);
  }

  const entryColumnId = normalizeInteger(entry?.column_id, 0);
  const entryColumn = templateContext?.sectionCategoryById?.get?.(entryColumnId)
    || (normalizeInteger(section.rootColumn?.id, 0) === entryColumnId ? section.rootColumn : null)
    || section.rootColumn;
  return buildContentDetailUrlFromColumn(entry, entryColumn);
}

function prefixSitePathForContext(url, site = null, options = {}) {
  return prefixLanguageSitePath(url, site?.language_site_path_prefix || '/', options);
}

function buildSiteScopedManagedContentUrl(contentItem, site = null, columnSlugPath = null) {
  return prefixSitePathForContext(buildManagedContentUrl(contentItem, columnSlugPath), site, {
    allowApi: false,
    allowAssets: false
  });
}

function buildSiteScopedArticleUrl(entry, templateContext, sectionOverride = null) {
  return prefixSitePathForContext(buildArticleUrl(entry, templateContext, sectionOverride), templateContext?.site, {
    allowApi: false,
    allowAssets: false
  });
}

function filterManagedRootColumn(columns, rootColumn) {
  const rootColumnId = normalizeInteger(rootColumn?.id, 0);
  if (rootColumnId <= 0) {
    return Array.isArray(columns) ? columns : [];
  }
  return (Array.isArray(columns) ? columns : []).filter((item) => (
    normalizeInteger(item?.id, 0) !== rootColumnId
  ));
}

function findManagedColumnRoot(columns = []) {
  return (Array.isArray(columns) ? columns : []).find((item) => (
    item?.column_semantics?.is_root
    && String(item?.column_semantics?.render_driver || '') === 'managed_column'
  )) || null;
}

function resolveManagedColumnModelCode(rootColumn) {
  const modelCode = String(rootColumn?.model_code || '').trim();
  if (!modelCode) {
    throw new Error(`托管栏目根 ${rootColumn?.id || ''} 缺少 model_code 配置`);
  }
  return modelCode;
}

function listManagedColumnItems(rootColumn, { languageCode = null, visibleOnly = false, publishedOnly = true, limit = 10000, featured = false, includeLanguageFallback = false } = {}) {
  const items = listContentItems(resolveManagedColumnModelCode(rootColumn), {
    featured,
    visibleOnly,
    publishedOnly,
    limit,
    languageCode
  });
  return includeLanguageFallback
    ? items
    : items.filter(isCurrentLanguageContentItem);
}

function resolveManagedColumnDisplayName(templateContextOrSite = null) {
  const templateContext = templateContextOrSite?.site ? templateContextOrSite : null;
  const site = templateContext?.site || templateContextOrSite || {};
  return coerceConfiguredText(
    templateContext?.managedColumnRoot?.name,
    site?.template_data?.ui?.text?.managedRoot,
    '内容'
  );
}

function resolveManagedColumnRootPublicUrl(templateContext = null) {
  if (!templateContext?.managedColumnRoot) {
    return '';
  }
  return buildLegacyColumnUrl(templateContext.managedColumnRoot, templateContext.publicSections, templateContext.site) || '';
}

function getSectionEntries(templateContext, section, { includeLanguageFallback = false } = {}) {
  const rootColumnId = normalizeInteger(section?.rootColumnId, 0);
  if (rootColumnId <= 0) {
    return [];
  }
  const entries = templateContext.sectionEntriesByRootId?.get(rootColumnId) || [];
  return includeLanguageFallback
    ? entries.slice()
    : entries.filter(isCurrentLanguageContentItem);
}

function isCurrentLanguageContentItem(item) {
  return !Boolean(item?.is_language_fallback);
}

function isPublishedCurrentLanguageContentItem(item) {
  return isCurrentLanguageContentItem(item)
    && String(item?.publish_status || '').trim() === 'published';
}

function buildSectionCategoryUrl(dirName, columnNode) {
  return buildSectionColumnPublicUrl({ dirName }, columnNode);
}

function buildSiteScopedSectionCategoryUrl(dirName, columnNode, site = null) {
  return prefixSitePathForContext(buildSectionCategoryUrl(dirName, columnNode), site, {
    allowApi: false,
    allowAssets: false
  });
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

const MANAGED_STATIC_ROOT_FILES = ['index.html', 'sitemap.xml', 'robots.txt', 'llms.txt', 'llms-full.txt', 'index.md'];
const LEGACY_MANAGED_STATIC_DIRS = ['about'];
const SHARED_STATIC_DIRS = ['css'];
const SHARED_STATIC_ROOT_FILES = [
  'logo.svg',
  'favicon.ico',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'apple-touch-icon.png'
];
const OBSOLETE_SHARED_STATIC_DIRS = ['js', 'JS', 'images', 'skin', 'img', 'Images', 'Skin', 'uploads'];
const STATIC_BUILD_GROUP_ORDER = ['网站页面', '栏目页', '内容页', '系统文件'];
const TEMPLATE_CLIENT_ASSET_DIR = path.join('assets', 'cms-templates');
const {
  renderCmsSitePage: renderCmsTemplatePage,
  resolveCmsSitePageListComparator,
  cleanupTemplateClientBundles,
  buildRegisteredTsxAssets
} = createCmsTemplateRuntime({
  templateClientAssetDir: TEMPLATE_CLIENT_ASSET_DIR,
  expandLegacyCommonPlaceholders
});

function renderCmsSitePage(templateCode, props, templateContext, options = {}) {
  return renderCmsTemplatePage(templateCode, withStructuredDataGraph(props, templateContext), templateContext, options);
}

function withStructuredDataGraph(props, templateContext) {
  if (!props || typeof props !== 'object') {
    return props;
  }
  const page = props.currentPage || {
    type: props.pageType || '',
    title: props.title || props.seoMeta?.openGraph?.title || '',
    url: props.seoMeta?.basic?.canonical || '/'
  };
  const schemaType = resolveStructuredDataSchemaType(props, templateContext, page);
  return {
    ...props,
    jsonLd: buildJsonLdPageGraph({
      site: templateContext?.site || props.site,
      page: {
        ...page,
        schemaType
      },
      schemaType,
      seoMeta: props.seoMeta,
      existingJsonLd: props.jsonLd,
      breadcrumbs: buildStructuredDataBreadcrumbs(props),
      image: props.currentColumnHeroImage || props.currentSectionHeroImage || props.image || '',
      description: props.description || props.itemDescription || props.currentColumnDescription || ''
    })
  };
}

function resolveStructuredDataSchemaType(props, templateContext, page) {
  const site = templateContext?.site || props?.site || {};
  const schemaConfig = site?.template_data?.seo?.schema || {};
  const pageType = String(page?.type || props?.pageType || '').trim();
  const sectionType = String(props?.currentSection?.type || '').trim();
  const columnType = String(props?.currentColumnItem?.type || props?.currentColumn?.type || '').trim();
  const contentType = String(props?.currentContent?.type || '').trim();

  return firstNonEmpty(
    props?.schemaType,
    props?.schema_type,
    props?.jsonLdType,
    props?.json_ld_type,
    page?.schemaType,
    page?.schema_type,
    page?.jsonLdType,
    page?.json_ld_type,
    resolveTemplateDataSchemaType(props?.currentColumnItem?.templateData || props?.currentColumnItem?.template_data),
    resolveTemplateDataSchemaType(props?.currentColumn?.templateData || props?.currentColumn?.template_data),
    resolveTemplateDataSchemaType(props?.currentContent?.templateData || props?.currentContent?.template_data),
    lookupConfiguredSchemaType(schemaConfig?.pageTypes || schemaConfig?.page_types, pageType),
    lookupConfiguredSchemaType(schemaConfig?.sectionTypes || schemaConfig?.section_types, sectionType),
    lookupConfiguredSchemaType(schemaConfig?.columnTypes || schemaConfig?.column_types, columnType),
    lookupConfiguredSchemaType(schemaConfig?.contentTypes || schemaConfig?.content_types, contentType),
    schemaConfig?.defaultPageType,
    schemaConfig?.default_page_type,
    'WebPage'
  );
}

function resolveTemplateDataSchemaType(templateData) {
  if (!templateData || typeof templateData !== 'object' || Array.isArray(templateData)) {
    return '';
  }
  return firstNonEmpty(
    templateData.schemaType,
    templateData.schema_type,
    templateData.jsonLdType,
    templateData.json_ld_type,
    templateData.seo?.schemaType,
    templateData.seo?.schema_type,
    templateData.seo?.jsonLdType,
    templateData.seo?.json_ld_type,
    templateData.seo?.schema?.type,
    templateData.seo?.schema?.pageType,
    templateData.seo?.schema?.page_type,
    templateData.schema?.type,
    templateData.schema?.pageType,
    templateData.schema?.page_type
  );
}

function lookupConfiguredSchemaType(configMap, key) {
  if (!configMap || typeof configMap !== 'object' || Array.isArray(configMap)) {
    return '';
  }
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) {
    return '';
  }
  return configMap[normalizedKey] || configMap[normalizedKey.toLowerCase()] || '';
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function buildStructuredDataBreadcrumbs(props) {
  const items = [];
  const addItem = (item) => {
    const name = String(item?.name || item?.title || '').trim();
    const url = String(item?.url || '').trim();
    if (!name || !url) {
      return;
    }
    items.push({ name, url });
  };

  addItem(props.currentSection);
  for (const item of Array.isArray(props.currentColumn) ? props.currentColumn : []) {
    addItem(item);
  }
  addItem(props.parentColumn);
  addItem(props.currentContent);

  return items;
}

function buildRenderGroup({ key, pageKind, columnKind, familyKey }) {
  return {
    key: sanitizeRenderGroupPart(key),
    pageKind: sanitizeRenderGroupPart(pageKind),
    columnKind: sanitizeRenderGroupPart(columnKind),
    familyKey: sanitizeRenderGroupPart(familyKey)
  };
}

function buildHomeRenderGroup() {
  return buildRenderGroup({
    key: 'site-home',
    pageKind: 'home',
    columnKind: 'site',
    familyKey: 'site-home'
  });
}

function buildNotFoundRenderGroup() {
  return buildRenderGroup({
    key: 'site-not-found',
    pageKind: 'not-found',
    columnKind: 'site',
    familyKey: 'site-not-found'
  });
}

function buildSinglePageRenderGroup(column) {
  const columnId = normalizeInteger(column?.id, 0);
  return buildRenderGroup({
    key: `single-page-column-${columnId || 'default'}`,
    pageKind: 'single-page',
    columnKind: resolveColumnKind(column),
    familyKey: 'single-page'
  });
}

function buildColumnRenderGroup({ rootColumn = null, pageKind, fallbackKey }) {
  const columnId = normalizeInteger(rootColumn?.id, 0);
  const baseKey = columnId > 0 ? `column-${columnId}-${pageKind}` : fallbackKey;
  return buildRenderGroup({
    key: baseKey,
    pageKind,
    columnKind: resolveColumnKind(rootColumn),
    familyKey: columnId > 0 ? `column-${columnId}-${pageKind}` : `${resolveColumnKind(rootColumn)}-${pageKind}`
  });
}

function resolveColumnKind(column) {
  const renderDriver = sanitizeRenderGroupPart(column?.column_semantics?.render_driver);
  if (renderDriver) {
    return renderDriver;
  }
  if (column?.column_semantics?.is_root) {
    return 'root';
  }
  return 'generic';
}

function sanitizeRenderGroupPart(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildStaticSite({ outputRoot = DEFAULT_OUTPUT_ROOT, sections, cleanExisting = false, languageCode = null, contentItemId = null, onProgress = null } = {}) {
  const previousReporter = globalStaticBuildProgressReporter;
  const previousState = globalStaticBuildProgressState;
  globalStaticBuildProgressReporter = typeof onProgress === 'function' ? onProgress : null;
  globalStaticBuildProgressState = {
    languageCode: null,
    outputRoot: null,
    currentTarget: null
  };

  try {
  getDb();
  const targetLanguages = resolveStaticBuildLanguages(languageCode);
  console.log(`[static-builder] Starting static build for ${targetLanguages.length} language(s)`);
  reportStaticBuildProgress('build_started', {
    requestedLanguageCode: languageCode || null,
    languageCodes: targetLanguages.map((item) => item.code)
  });

  // 先获取 columns 用于动态生成 section 列表
  const columns = filterPublicSectionColumns(listColumns({ languageCode: targetLanguages[0]?.code || null }));
  const requestedSections = normalizeSections(sections, columns);
  const requestedTargetDefinitions = listStaticBuildTargetDefinitions({ columns });
  const requestedTargetMap = new Map(requestedTargetDefinitions.map((definition) => [definition.value, definition]));
  const requestedTargets = Array.from(requestedSections)
    .map((section) => requestedTargetMap.get(section))
    .filter(Boolean);

  const requiresTemplateRuntime = requestedTargets.some((definition) => definition.requiresTemplateRuntime !== false);
  const sharedAssetRoot = path.resolve(outputRoot);

  if (requiresTemplateRuntime) {
    ensureTemplatesSchema();
  }

  const languageBuilds = [];
  let totalFiles = 0;
  let totalRecords = 0;

  for (const language of targetLanguages) {
    const normalizedOutputRoot = resolveLanguageOutputRoot(outputRoot, language);
    const publicAssetOutputRoot = String(language?.site?.site_mode || '').trim() === 'subdir'
      ? sharedAssetRoot
      : normalizedOutputRoot;
    const results = [];
    console.log(`[static-builder] Language ${language.code}: output -> ${normalizedOutputRoot}`);
    globalStaticBuildProgressState = {
      ...globalStaticBuildProgressState,
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      currentTarget: null
    };
    reportStaticBuildProgress('language_started', {
      languageCode: language.code,
      outputRoot: normalizedOutputRoot
    });

    // 初始化全局栏目目录映射和栏目映射
    const templateContext = getLegacyTemplateContext(language.code);
    const languageTargetMap = new Map(
      listStaticBuildTargetDefinitions({ columns: templateContext.columns })
        .map((definition) => [definition.value, definition])
    );
    const resolvedTargets = Array.from(requestedSections)
      .map((section) => languageTargetMap.get(section))
      .filter(Boolean)
      .sort((left, right) => Number(left.group === '系统文件') - Number(right.group === '系统文件'));
    setGlobalColumnSlugMap(templateContext.managedColumnCategories, templateContext.managedColumnRoot);
    globalColumnMap = new Map(
      templateContext.columns.map(col => [normalizeInteger(col.id, 0), col])
    );

    fs.mkdirSync(normalizedOutputRoot, { recursive: true });
    if (cleanExisting) {
      cleanupManagedStaticFiles(normalizedOutputRoot, { columns: templateContext.columns });
      cleanupTemplateClientBundles(normalizedOutputRoot);
    }

    for (const target of resolvedTargets) {
      const startedAt = Date.now();
      console.log(`[static-builder] ${language.code}: start -> ${target.label}`);
      globalStaticBuildProgressState = {
        ...globalStaticBuildProgressState,
        currentTarget: {
          key: target.value,
          label: target.label,
          group: target.group
        }
      };
      reportStaticBuildProgress('target_started', {
        languageCode: language.code,
        outputRoot: normalizedOutputRoot,
        target: globalStaticBuildProgressState.currentTarget
      });
      const buildResult = target.execute({
        outputRoot: normalizedOutputRoot,
        languageCode: language.code,
        templateContext,
        idRange: normalizeContentItemIdRange(contentItemId),
        finalizeAssets: false
      });
      const elapsedMs = Date.now() - startedAt;
      console.log(
        `[static-builder] ${language.code}: done -> ${target.label} `
        + `(${buildResult.filesWritten} files, ${buildResult.recordsProcessed} records, ${elapsedMs}ms)`
      );
      reportStaticBuildProgress('target_completed', {
        languageCode: language.code,
        outputRoot: normalizedOutputRoot,
        target: globalStaticBuildProgressState.currentTarget,
        filesWritten: buildResult.filesWritten,
        recordsProcessed: buildResult.recordsProcessed,
        elapsedMs
      });
      globalStaticBuildProgressState = {
        ...globalStaticBuildProgressState,
        currentTarget: null
      };
      results.push(buildResult);
    }
    if (requiresTemplateRuntime) {
      console.log(`[static-builder] ${language.code}: building shared TSX assets`);
      reportStaticBuildProgress('assets_started', {
        languageCode: language.code,
        outputRoot: normalizedOutputRoot,
        assetType: 'tsx'
      });
      buildRegisteredTsxAssets(publicAssetOutputRoot);
      reportStaticBuildProgress('assets_completed', {
        languageCode: language.code,
        outputRoot: normalizedOutputRoot,
        assetType: 'tsx'
      });
    }
    console.log(`[static-builder] ${language.code}: syncing shared static assets`);
    reportStaticBuildProgress('assets_started', {
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      assetType: 'shared-static'
    });
    syncStaticSupportAssets(sharedAssetRoot, publicAssetOutputRoot);
    reportStaticBuildProgress('assets_completed', {
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      assetType: 'shared-static'
    });

    const languageTotalFiles = results.reduce((sum, item) => sum + item.filesWritten, 0);
    const languageTotalRecords = results.reduce((sum, item) => sum + item.recordsProcessed, 0);
    console.log(
      `[static-builder] ${language.code}: completed `
      + `(${languageTotalFiles} files, ${languageTotalRecords} records)`
    );
    totalFiles += languageTotalFiles;
    totalRecords += languageTotalRecords;
    reportStaticBuildProgress('language_completed', {
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      totalFiles: languageTotalFiles,
      totalRecords: languageTotalRecords
    });
    languageBuilds.push({
      languageCode: language.code,
      outputRoot: normalizedOutputRoot,
      results,
      totalFiles: languageTotalFiles,
      totalRecords: languageTotalRecords
    });
  }

  const buildResult = {
    outputRoot: languageBuilds[0]?.outputRoot || path.resolve(outputRoot),
    results: languageBuilds.flatMap((item) => item.results),
    languageBuilds,
    totalFiles,
    totalRecords
  };
  reportStaticBuildProgress('build_completed', {
    totalFiles,
    totalRecords,
    languageCodes: languageBuilds.map((item) => item.languageCode)
  });

  return buildResult;
  } finally {
    globalStaticBuildProgressReporter = previousReporter;
    globalStaticBuildProgressState = previousState;
  }
}

function reportStaticBuildProgress(type, payload = {}) {
  if (typeof globalStaticBuildProgressReporter !== 'function') {
    return;
  }

  try {
    globalStaticBuildProgressReporter({
      type,
      timestamp: new Date().toISOString(),
      languageCode: globalStaticBuildProgressState.languageCode,
      outputRoot: globalStaticBuildProgressState.outputRoot,
      target: globalStaticBuildProgressState.currentTarget,
      ...payload
    });
  } catch {
    // 进度上报失败不影响静态生成主链路。
  }
}

function listStaticBuildTargetDefinitions({ columns = null } = {}) {
  const resolvedColumns = filterPublicSectionColumns(Array.isArray(columns) ? columns : listColumns());
  const publicSections = resolvePublicSectionContext(resolvedColumns);
  const rootColumns = resolvedColumns.filter((item) => item?.column_semantics?.is_root);
  const managedColumnRoots = rootColumns.filter((item) => item?.column_semantics?.render_driver === 'managed_column');
  const pageTreeRoots = rootColumns.filter((item) => item?.column_semantics?.render_driver === 'page_tree');
  const baseTargets = [
    createStaticBuildTargetDefinition({
      group: '网站页面',
      label: '生成首页',
      value: 'index',
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildIndexPage({ outputRoot, languageCode, templateContext, finalizeAssets })
    }),
    createStaticBuildTargetDefinition({
      group: '网站页面',
      label: '生成 404 页面',
      value: '404',
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildNotFoundPage({ outputRoot, languageCode, templateContext, finalizeAssets })
    }),
    createStaticBuildTargetDefinition({
      group: '栏目页',
      label: '生成单页栏目',
      value: 'column-pages',
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildManualSinglePageColumns({ outputRoot, languageCode, templateContext, finalizeAssets })
    }),
    createStaticBuildTargetDefinition({
      group: '栏目页',
      label: '生成专题栏目',
      value: 'topic-pages',
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildPublishedTopicColumnPages({ outputRoot, languageCode, templateContext, finalizeAssets })
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
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildPageTreeColumnPages({
        outputRoot,
        languageCode,
        templateContext,
        rootColumn,
        finalizeAssets
      })
    }));
  }

  for (const rootColumn of managedColumnRoots) {
    rootColumnTargets.push(
      createStaticBuildTargetDefinition({
        group: '栏目页',
        label: `生成栏目列表: ${rootColumn.name || '栏目'}`,
        value: `column:${rootColumn.id}:list`,
        execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildManagedColumnListPages({
          outputRoot,
          languageCode,
          templateContext,
          rootColumn,
          finalizeAssets
        })
      }),
      createStaticBuildTargetDefinition({
        group: '内容页',
        label: `生成内容页: ${rootColumn.name || '栏目'}`,
        value: `column:${rootColumn.id}:detail`,
        execute: ({ outputRoot, languageCode, templateContext, idRange, finalizeAssets }) => buildManagedColumnContentPages({
          outputRoot,
          languageCode,
          templateContext,
          idRange,
          rootColumn,
          finalizeAssets
        })
      })
    );
  }

  const sectionTargets = publicSections.sections
    .filter((section) => !isTopicSection(section))
    .flatMap((section) => ([
    createStaticBuildTargetDefinition({
      group: '栏目页',
      label: `生成栏目列表: ${section.sectionLabel}`,
      value: `column:${section.rootColumnId}:list`,
      aliases: [`${section.dirName}-lists`],
      execute: ({ outputRoot, languageCode, templateContext, finalizeAssets }) => buildSectionColumnListPages({ outputRoot, languageCode, templateContext, section, finalizeAssets })
    }),
    createStaticBuildTargetDefinition({
      group: '内容页',
      label: `生成内容页: ${section.sectionLabel}`,
      value: `column:${section.rootColumnId}:detail`,
      aliases: [`${section.dirName}-details`],
      execute: ({ outputRoot, languageCode, templateContext, idRange, finalizeAssets }) => buildSectionContentPages({ outputRoot, languageCode, templateContext, idRange, section, finalizeAssets })
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

export function buildIndexPage({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const html = renderCmsSitePage('site-home', buildLegacyHomePageProps(templateContext), templateContext, {
    templateType: 'home',
    fallbackCode: 'home',
    targets: [{ target_type: 'site', target_id: null }],
    renderGroup: buildHomeRenderGroup()
  });

  writeTextFile(outputRoot, 'index.html', html, templateContext.site);
  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult('index', '首页', 1, 1);
}

export function buildNotFoundPage({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const html = renderCmsSitePage('site-not-found', buildLegacyNotFoundPageProps(templateContext), templateContext, {
    templateType: 'not_found',
    fallbackCode: 'not_found',
    targets: [{ target_type: 'site', target_id: null }],
    renderGroup: buildNotFoundRenderGroup()
  });

  writeTextFile(outputRoot, '404.html', html, templateContext.site);
  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult('404', '404 页面', 1, 1);
}

export function buildManualSinglePageColumns({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const items = templateContext.columns.filter((item) => (
    item?.column_semantics?.render_driver === 'single_page'
    && String(item.route_path || '').trim()
  ));
  let filesWritten = 0;

  for (const item of items) {
    const html = renderCmsSitePage('single-page-column', buildLegacySingleColumnPageProps(templateContext, item), templateContext, {
      templateType: 'single',
      fallbackCode: 'content_page',
      targets: [{ target_type: 'column', target_id: item.id }],
      renderGroup: buildSinglePageRenderGroup(item)
    });

    writeTextFile(outputRoot, resolveColumnRouteOutputPath(item.route_path), html, templateContext.site);
    filesWritten += 1;
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult('column-pages', '单页栏目', items.length, filesWritten);
}

export function buildPublishedTopicColumnPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const publishedProfiles = listTopicProfiles({ languageCode: templateContext.languageCode })
    .filter((profile) => String(profile.publish_status || '').trim() === 'published');
  const topicColumns = collectTopicColumns(templateContext.columns);
  const topicColumnIds = new Set(topicColumns.map((item) => normalizeInteger(item.id, 0)).filter((id) => id > 0));
  let filesWritten = 0;
  let recordsProcessed = 0;

  for (const profile of publishedProfiles) {
    const columnId = normalizeInteger(profile.column_id, 0);
    if (!topicColumnIds.has(columnId)) {
      continue;
    }
    const result = buildTopicColumnPage({
      outputRoot,
      columnId,
      languageCode: templateContext.languageCode,
      templateContext,
      finalizeAssets: false
    });
    filesWritten += result.filesWritten;
    recordsProcessed += result.recordsProcessed;
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult('topic-pages', '专题栏目', recordsProcessed, filesWritten);
}

export function buildTopicColumnPage({ outputRoot = DEFAULT_OUTPUT_ROOT, columnId, languageCode = null, templateContext: providedTemplateContext = null, finalizeAssets = true } = {}) {
  const normalizedColumnId = normalizeInteger(columnId, 0);
  if (normalizedColumnId <= 0) {
    throw new Error('专题栏目 ID 无效');
  }

  ensureTemplatesSchema();
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const column = templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizedColumnId) || null;
  if (!column) {
    throw new Error('专题栏目不存在');
  }

  const routePath = String(column.route_path || '').trim();
  if (!routePath) {
    throw new Error('专题栏目缺少访问路径');
  }

  const profile = getTopicProfileByColumnId(normalizedColumnId, { languageCode: templateContext.languageCode });
  if (!profile) {
    throw new Error('专题配置不存在');
  }
  if (String(profile.publish_status || '').trim() !== 'published') {
    throw new Error('当前专题为草稿状态，发布后才能生成页面');
  }
  const topicColumns = collectTopicColumns(templateContext.columns);
  const topicColumnIds = new Set(topicColumns.map((item) => normalizeInteger(item.id, 0)));
  if (!topicColumnIds.has(normalizedColumnId)) {
    throw new Error('当前栏目不在 /topics/ 专题栏目树内');
  }
  const topicProfiles = listTopicProfiles({ languageCode: templateContext.languageCode });
  const publishedTopicColumnIds = new Set(
    topicProfiles
      .filter((item) => String(item.publish_status || '').trim() === 'published')
      .map((item) => normalizeInteger(item.column_id, 0))
      .filter((id) => id > 0)
  );
  const topicProfilesByColumnId = new Map(topicProfiles.map((item) => [normalizeInteger(item.column_id, 0), item]));
  const topicChildrenByParent = groupBy(topicColumns, (item) => normalizeInteger(item.parent_id, 0));
  const descendantTopicIds = collectDescendantTopicColumnIds(topicChildrenByParent, normalizedColumnId);
  const aggregateColumnIds = [normalizedColumnId, ...descendantTopicIds.filter((id) => publishedTopicColumnIds.has(id))];
  const aggregateProfiles = aggregateColumnIds
    .map((id) => topicProfilesByColumnId.get(id) || null)
    .filter(Boolean);
  const parent = templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(column.parent_id, 0)) || null;
  const topicUrl = prefixSitePathForContext(routePath, templateContext.site, {
    allowApi: false,
    allowAssets: false
  });
  const relatedCards = buildTopicRelatedContentCards(aggregateProfiles, templateContext);
  const topicNavigationItems = buildTopicNavigationItems({
    column,
    parent,
    topicChildrenByParent,
    publishedTopicColumnIds,
    templateContext
  });
  const columnPageContent = resolveDedicatedColumnPageContent(column, templateContext.languageCode);
  const normalizedTopicIntroHtml = normalizeLegacyBodyHtml(profile?.intro_html, templateContext.site, { fallbackAlt: column.name || profile?.column_name || 'Topics' }) || '';
  const topicIntroHtml = buildLegacyContentSectionNavigation(normalizedTopicIntroHtml, {
    matchInPageLinksByHeadingNumber: true
  }).html;
  const topicIntroText = extractRenderableContentBodySummary(profile?.intro_html) || '';
  const description = normalizeRenderableLegacyText(columnPageContent?.seo_description || columnPageContent?.summary || topicIntroText || profile?.topic_keyword || '');
  const title = column.name || profile?.column_name || 'Topics';
  const seoTitle = String(profile?.seo_title || '').trim() || columnPageContent?.seo_title || title;
  const mastheadImage = getPrimaryTemplateImage(column);
  const html = renderCmsSitePage('topic-column-page', {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'topic',
      title,
      url: topicUrl,
      section: {
        type: 'topic',
        name: parent?.name || 'Topics',
        url: parent ? prefixSitePathForContext(parent.route_path || '/topics/', templateContext.site, { allowApi: false, allowAssets: false }) : prefixSitePathForContext('/topics/', templateContext.site, { allowApi: false, allowAssets: false })
      },
      columnChain: buildTemplateColumnChain({
        column,
        columns: templateContext.columns,
        type: 'topic',
        urlBuilder: (item) => prefixSitePathForContext(item.route_path || '/', templateContext.site, { allowApi: false, allowAssets: false })
      }),
      columnType: 'topic',
      columnUrl: topicUrl,
      parentColumn: parent,
      parentColumnType: 'topic',
      parentColumnUrl: parent ? prefixSitePathForContext(parent.route_path || '/', templateContext.site, { allowApi: false, allowAssets: false }) : ''
    }),
    title,
    itemDescription: description,
    description,
    currentColumnDescription: description,
    topicIntroHtml,
    introHtml: topicIntroHtml,
    contentHtml: topicIntroHtml,
    bodyHtml: topicIntroHtml,
    currentColumnHeroImage: mastheadImage,
    topicProfile: profile,
    relatedContentRefs: aggregateProfiles.flatMap((item) => parseTopicRelatedContentRefs(item?.related_content_json)),
    secondaryMenuItems: topicNavigationItems,
    secondaryMenuTitle: resolveTopicNavigationTitle({ column, parent, topicChildrenByParent }),
    secondaryMenuParentUrl: parent ? prefixSitePathForContext(parent.route_path || '/', templateContext.site, { allowApi: false, allowAssets: false }) : '',
    items: relatedCards,
    articleCardItems: relatedCards,
    managedCardItems: relatedCards,
    pagination: { page: 1, pageCount: 1, totalRecords: relatedCards.length },
    sectionLabel: parent?.name || 'Topics',
    seoMeta: buildSeoMeta({
      title: seoTitle,
      description: columnPageContent?.seo_description || topicIntroText || templateContext.site.seo_default_description || title,
      url: topicUrl,
      image: mastheadImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: topicUrl })
  }, templateContext, {
    templateType: 'topic',
    fallbackCode: 'topic',
    targets: [{ target_type: 'column', target_id: normalizedColumnId }],
    renderGroup: buildColumnRenderGroup({
      rootColumn: column,
      pageKind: 'topic',
      fallbackKey: `topic-column-${normalizedColumnId}`
    })
  });

  const outputPath = resolveColumnRouteOutputPath(routePath);
  writeTextFile(outputRoot, outputPath, html, templateContext.site);

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }

  return {
    ...createBuildResult(`topic:${normalizedColumnId}`, title, 1, 1),
    columnId: normalizedColumnId,
    url: topicUrl,
    outputPath
  };
}

function collectTopicColumns(columns) {
  const rows = Array.isArray(columns) ? columns : [];
  const root = rows.find((column) => (
    normalizeInteger(column.parent_id, 0) <= 0
    && isTopicManagedColumn(column)
    && String(column.route_path || '').trim() === '/topics/'
  ));
  if (!root) {
    return [];
  }
  const rowsById = new Map(rows.map((column) => [normalizeInteger(column.id, 0), column]));
  return rows.filter((column) => {
    let current = column;
    while (current) {
      if (normalizeInteger(current.id, 0) === normalizeInteger(root.id, 0)) {
        return true;
      }
      const parentId = normalizeInteger(current.parent_id, 0);
      current = parentId > 0 ? rowsById.get(parentId) : null;
    }
    return false;
  });
}

function isTopicManagedColumn(column) {
  const dirName = String(column?.dir_name || '').trim();
  const routePath = String(column?.route_path || '').trim();
  return dirName === 'topics' || routePath === '/topics/' || routePath.startsWith('/topics/');
}

function isTopicSection(section) {
  return isTopicManagedColumn(section?.rootColumn) || String(section?.dirName || '').trim() === 'topics';
}

function collectDescendantTopicColumnIds(childrenByParent, columnId) {
  const output = [];
  const queue = [...(childrenByParent.get(normalizeInteger(columnId, 0)) || [])];
  while (queue.length > 0) {
    const item = queue.shift();
    const id = normalizeInteger(item?.id, 0);
    if (!id) {
      continue;
    }
    output.push(id);
    queue.push(...(childrenByParent.get(id) || []));
  }
  return output;
}

function buildTopicNavigationItems({ column, parent, topicChildrenByParent, publishedTopicColumnIds, templateContext }) {
  const columnId = normalizeInteger(column?.id, 0);
  const directChildren = (topicChildrenByParent.get(columnId) || []).filter((item) => normalizeInteger(item.id, 0) !== columnId);
  const siblingItems = parent
    ? (topicChildrenByParent.get(normalizeInteger(parent.id, 0)) || [])
    : [column].filter(Boolean);
  const sourceItems = (directChildren.length > 0 ? directChildren : siblingItems)
    .filter((item) => (
      normalizeInteger(item.id, 0) === columnId
      || publishedTopicColumnIds.has(normalizeInteger(item.id, 0))
    ));
  return sourceItems.map((item) => {
    const url = prefixSitePathForContext(item.route_path || '/', templateContext.site, {
      allowApi: false,
      allowAssets: false
    });
    return {
      id: normalizeInteger(item.id, 0),
      label: item.name || '',
      title: item.name || '',
      url,
      href: url,
      active: normalizeInteger(item.id, 0) === columnId
    };
  });
}

function resolveTopicNavigationTitle({ column, parent, topicChildrenByParent }) {
  const hasChildren = (topicChildrenByParent.get(normalizeInteger(column?.id, 0)) || []).length > 0;
  if (hasChildren) {
    return column?.name || '专题列表';
  }
  return parent?.name || '专题列表';
}

function buildTopicRelatedContentCards(profiles, templateContext) {
  const refs = uniqueTopicRelatedContentRefs((Array.isArray(profiles) ? profiles : [profiles])
    .flatMap((profile) => parseTopicRelatedContentRefs(profile?.related_content_json)));
  const allColumns = [
    ...(Array.isArray(templateContext.columns) ? templateContext.columns : []),
    ...(Array.isArray(templateContext.managedColumnCategories) ? templateContext.managedColumnCategories : []),
    ...(Array.isArray(templateContext.sectionCategories) ? templateContext.sectionCategories : [])
  ];
  const columnsById = new Map(allColumns.map((column) => [normalizeInteger(column.id, 0), column]));

  return refs
    .map((ref) => {
      let item = null;
      try {
        item = getContentItemById(ref.model, ref.id, {
          languageCode: templateContext.languageCode
        });
      } catch {
        return null;
      }
      if (!item || normalizeInteger(item.is_visible, 1) === 0) {
        return null;
      }
      const column = columnsById.get(normalizeInteger(item.column_id, 0)) || null;
      if (!column) {
        return null;
      }

      const columnPath = buildTopicContentColumnPath(column, templateContext);
      const url = prefixSitePathForContext(buildContentDetailUrlFromColumn(item, column, columnPath), templateContext.site, {
        allowApi: false,
        allowAssets: false
      });
      const title = String(item.name || item.code || `#${item.id}`).trim();
      return {
        id: normalizeInteger(item.id, 0),
        model: ref.model,
        name: title,
        title,
        url,
        href: url,
        link: url,
        summary: item.summary || item.description || '',
        image: normalizeUploadedRelativePath(String(item.primary_image || item.image || '').trim()),
        code: item.code || ''
      };
    })
    .filter(Boolean);
}

function uniqueTopicRelatedContentRefs(refs) {
  const seen = new Set();
  return (Array.isArray(refs) ? refs : []).filter((ref) => {
    const key = `${ref.model}:${ref.id}`;
    if (!ref.model || !ref.id || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildTopicContentColumnPath(column, templateContext) {
  const columnId = normalizeInteger(column?.id, 0);
  const managedColumnMap = buildManagedColumnPathMap(
    templateContext.managedColumnCategories,
    templateContext.managedColumnRoot
  );
  if (managedColumnMap.has(columnId)) {
    return buildColumnSlugPath(column, managedColumnMap);
  }
  return null;
}

function parseTopicRelatedContentRefs(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((item) => ({
        model: String(item?.model || '').trim(),
        id: normalizeInteger(item?.id, 0)
      }))
      .filter((item) => item.model && item.id > 0);
  } catch {
    return [];
  }
}

export function buildPageTreeColumnPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, rootColumn = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : templateContext.columns.find((item) => item?.column_semantics?.is_root && item?.column_semantics?.render_driver === 'page_tree') || null;
  const items = templateContext.corporationCategories
    .filter((item) => normalizeInteger(item.id, 0) !== 0);
  const indexItemId = items.find((item) => normalizeInteger(item.parent_id, 0) === 0)?.id ?? items[0]?.id;

  let filesWritten = 0;
  const renderGroup = buildColumnRenderGroup({
    rootColumn: targetRootColumn,
    pageKind: 'single-page',
    fallbackKey: 'page-tree-page'
  });

  for (const item of items) {
    const html = renderCmsSitePage('page-tree-content', buildLegacyContentPageProps(templateContext, item), templateContext, {
      templateType: 'content',
      fallbackCode: 'content_page',
      targets: [{ target_type: 'column', target_id: item.id }],
      renderGroup
    });

    writeTextFile(outputRoot, path.join('about', `about-${item.id}.html`), html, templateContext.site);
    filesWritten += 1;

    if (normalizeInteger(item.id, 0) === normalizeInteger(indexItemId, 0)) {
      writeTextFile(outputRoot, path.join('about', 'index.html'), html, templateContext.site);
      filesWritten += 1;
    }
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:page` : 'column:page-tree:page', `${targetRootColumn?.name || '栏目'}列表页`, items.length, filesWritten);
}

export function buildSectionColumnListPages({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  languageCode = null,
  templateContext = null,
  section,
  finalizeAssets = true
} = {}) {
  if (isTopicSection(section)) {
    return createBuildResult(`${section?.dirName || 'section'}-lists`, `${section?.sectionLabel || '栏目'}分类页`, 0, 0);
  }
  return buildSectionCategoryPagesByDir({
    outputRoot,
    languageCode,
    templateContext,
    section,
    sectionKey: `${section.dirName}-lists`,
    defaultSectionLabel: `${section.sectionLabel}分类页`,
    summaryClassName: section.sectionType === 'service' ? '0a' : 'Font_000000_a',
    finalizeAssets
  });
}

export function buildSectionContentPages({
  outputRoot = DEFAULT_OUTPUT_ROOT,
  idRange,
  languageCode = null,
  templateContext = null,
  section,
  finalizeAssets = true
} = {}) {
  if (isTopicSection(section)) {
    return createBuildResult(`${section?.dirName || 'section'}-details`, `${section?.sectionLabel || '栏目'}详情页`, 0, 0);
  }
  return buildSectionDetailPagesByDir({
    outputRoot,
    idRange,
    languageCode,
    templateContext,
    section,
    sectionKey: `${section.dirName}-details`,
    defaultSectionLabel: `${section.sectionLabel}详情页`,
    finalizeAssets
  });
}

export function buildManagedColumnListPages({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null, templateContext: providedTemplateContext = null, rootColumn = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : findManagedColumnRoot(templateContext.columns);
  if (!targetRootColumn) {
    throw new Error('缺少托管根栏目配置');
  }
  if (isTopicManagedColumn(targetRootColumn)) {
    return createBuildResult(`column:${targetRootColumn.id}:list`, `${targetRootColumn?.name || '栏目'}列表页`, 0, 0);
  }
  const categories = templateContext.managedColumnCategories;
  const managedItems = listManagedColumnItems(targetRootColumn, { visibleOnly: false, limit: 10000, languageCode });
  const fallbackComparator = resolveContentItemComparator(resolveManagedColumnModelCode(targetRootColumn));
  const columnMap = buildManagedColumnPathMap(categories, targetRootColumn);
  const childrenByParent = groupBy(categories, (item) => normalizeInteger(item.parent_id, 0));
  const managedItemsByColumn = groupBy(managedItems, (item) => normalizeInteger(item.column_id, 0));
  const topLevelColumns = childrenByParent.get(0) || [];
  let filesWritten = 0;
  const renderGroup = buildColumnRenderGroup({
    rootColumn: targetRootColumn,
    pageKind: 'list',
    fallbackKey: 'managed-column-list'
  });

  filesWritten += writeManagedColumnPageSet({
    outputRoot,
    templateContext,
    rootColumn: targetRootColumn,
    columnNode: targetRootColumn,
    parent: null,
    children: topLevelColumns.filter((item) => !isTopicManagedColumn(item)),
    items: managedItems.slice().sort(resolveCmsSitePageListComparator('managed-column-list', {
      templateType: 'list',
      fallbackCode: 'managed_list',
      targets: [{ target_type: 'column', target_id: normalizeInteger(targetRootColumn.id, 0) }]
    }, fallbackComparator)),
    fileStem: 'index',
    columnMap,
    renderGroup
  });

  for (const columnNode of categories) {
    const columnId = normalizeInteger(columnNode.id, 0);
    if (columnId === 0) {
      continue;
    }
    if (isTopicManagedColumn(columnNode)) {
      continue;
    }

    const descendantColumnIds = getDescendantManagedColumnIds(childrenByParent, columnId);
    const compareManagedItems = resolveCmsSitePageListComparator('managed-column-list', {
      templateType: 'list',
      fallbackCode: 'managed_list',
      targets: [{ target_type: 'column', target_id: columnId }]
    }, fallbackComparator);
    const items = descendantColumnIds
      .flatMap((id) => managedItemsByColumn.get(id) || [])
      .slice()
      .sort(compareManagedItems);
    const parent = columnMap.get(normalizeInteger(columnNode.parent_id, 0));
    const children = (childrenByParent.get(columnId) || []).filter((item) => !isTopicManagedColumn(item));
    filesWritten += writeManagedColumnPageSet({
      outputRoot,
      templateContext,
      rootColumn: targetRootColumn,
      columnNode,
      parent,
      children,
      items,
      fileStem: String(columnId),
      columnMap,
      renderGroup
    });
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:list` : 'column:managed-column:list', `${targetRootColumn?.name || '栏目'}列表页`, categories.filter((item) => normalizeInteger(item.id, 0) !== 0).length, filesWritten);
}

export function buildManagedColumnContentPages({ outputRoot = DEFAULT_OUTPUT_ROOT, idRange, languageCode = null, templateContext: providedTemplateContext = null, rootColumn = null, finalizeAssets = true } = {}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  const targetRootColumn = rootColumn
    ? templateContext.columns.find((item) => normalizeInteger(item.id, 0) === normalizeInteger(rootColumn.id, 0)) || null
    : findManagedColumnRoot(templateContext.columns);
  if (targetRootColumn && isTopicManagedColumn(targetRootColumn)) {
    return createBuildResult(`column:${targetRootColumn.id}:detail`, `${targetRootColumn?.name || '栏目'}内容页`, 0, 0);
  }
  const queriedManagedItems = listManagedColumnItems(targetRootColumn, {
    visibleOnly: false,
    publishedOnly: false,
    limit: 10000,
    languageCode,
    includeLanguageFallback: true
  });
  const allManagedItems = queriedManagedItems.filter(isPublishedCurrentLanguageContentItem);
  const managedItems = filterByIdRange(allManagedItems, idRange);
  const fallbackManagedItems = filterByIdRange(
    queriedManagedItems.filter((item) => !isPublishedCurrentLanguageContentItem(item)),
    idRange
  );

  // 初始化全局栏目映射
  globalColumnMap = new Map(
    templateContext.columns.map(col => [normalizeInteger(col.id, 0), col])
  );

  const managedItemsByColumn = groupBy(allManagedItems, (item) => normalizeInteger(item.column_id, 0));
  const compareManagedItems = resolveContentItemComparator(resolveManagedColumnModelCode(targetRootColumn));
  const columnMap = buildManagedColumnPathMap(templateContext.managedColumnCategories, targetRootColumn);
  let filesWritten = 0;
  const renderGroup = buildColumnRenderGroup({
    rootColumn: targetRootColumn,
    pageKind: 'detail',
    fallbackKey: 'managed-column-detail'
  });

  for (const fallbackItem of fallbackManagedItems) {
    const columnNode = columnMap.get(normalizeInteger(fallbackItem.column_id, 0)) || null;
    const columnSlugPath = columnNode ? buildColumnSlugPath(columnNode, columnMap) : null;
    removeStaticOutputFile(
      outputRoot,
      buildContentDetailPathFromColumn(fallbackItem, columnNode, columnSlugPath)
    );
  }

  for (const managedItem of managedItems) {
    const siblingManagedItems = (managedItemsByColumn.get(normalizeInteger(managedItem.column_id, 0)) || []).filter((item) => item.id !== managedItem.id);
    const relatedManagedItems = siblingManagedItems.slice().sort(compareManagedItems).slice(0, 4);
    const columnNode = columnMap.get(normalizeInteger(managedItem.column_id, 0)) || null;
    const parent = columnNode ? columnMap.get(normalizeInteger(columnNode.parent_id, 0)) || null : null;
    const html = renderCmsSitePage('managed-column-detail', buildLegacyManagedColumnDetailPageProps({
      templateContext,
      rootColumn: targetRootColumn,
      managedItem,
      relatedManagedItems,
      columnNode,
      parent
    }), templateContext, {
      templateType: 'content',
      fallbackCode: 'managed_detail',
      targets: [{ target_type: 'column', target_id: normalizeInteger(managedItem.column_id, 0) }],
      renderGroup
    });

    const columnSlugPath = columnNode ? buildColumnSlugPath(columnNode, columnMap) : null;
    const outputPath = buildContentDetailPathFromColumn(managedItem, columnNode, columnSlugPath);

    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult(targetRootColumn ? `column:${targetRootColumn.id}:detail` : 'column:managed-column:detail', `${targetRootColumn?.name || '栏目'}内容页`, managedItems.length, filesWritten);
}

function buildSectionCategoryPagesByDir({
  outputRoot,
  languageCode = null,
  templateContext: providedTemplateContext = null,
  section,
  sectionKey,
  defaultSectionLabel,
  summaryClassName,
  finalizeAssets = true
}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const dirName = section.dirName;
  const columnList = getSectionListColumns(templateContext, section);
  const items = getSectionEntries(templateContext, section);
  const columnBuckets = groupBy(items, (item) => normalizeInteger(item.column_id, 0));
  const hasSectionRootLanding = shouldRenderSectionRootLanding(section?.rootColumn);
  const renderRootAsList = shouldRenderSectionRootAsList(section);
  const pageSize = resolveSectionListPageSize(section, { fallback: DEFAULT_NEWS_LIST_PAGE_SIZE });
  const effectiveColumnList = columnList.length > 0
    ? columnList
    : section?.rootColumn
      ? [section.rootColumn]
      : [];
  let filesWritten = 0;
  const renderGroup = buildColumnRenderGroup({
    rootColumn: section?.rootColumn,
    pageKind: 'list',
    fallbackKey: `${section?.dirName || 'section'}-list`
  });

  if (hasSectionRootLanding) {
    const rootPublicUrl = buildColumnPublicUrl(section.rootColumn, templateContext.publicSections) || `/${dirName}/`;
    if (renderRootAsList) {
      const allowedColumnIds = new Set(getDescendantColumnIds(
        templateContext.publicSections.sectionTree.childrenByParentId,
        section.rootColumnId
      ));
      const rootListItems = items
        .filter((item) => allowedColumnIds.has(normalizeInteger(item.column_id, 0)))
        .slice()
        .sort(compareByCreatedDesc);
      const pages = paginate(rootListItems, pageSize);
      const pageList = pages.length > 0 ? pages : [[]];

      for (let pageIndex = 0; pageIndex < pageList.length; pageIndex += 1) {
        const pageNumber = pageIndex + 1;
        const rootHtml = renderCmsSitePage('section-root-list', buildLegacySectionRootListPageProps({
          templateContext,
          section,
          pageItems: pageList[pageIndex],
          pageNumber,
          pageCount: pageList.length,
          totalRecords: rootListItems.length,
          summaryClassName,
          pageSize
        }), templateContext, {
          templateType: 'list',
          fallbackCode: 'article_list',
          targets: [{ target_type: 'column', target_id: section.rootColumnId }],
          renderGroup
        });
        const outputPath = buildSectionListOutputPath(section, section.rootColumn, pageNumber);
        writeTextFile(outputRoot, outputPath, rootHtml, templateContext.site);
        filesWritten += 1;
      }
    } else {
      const rootHtml = renderCmsSitePage('section-root-content', buildLegacySectionRootPageProps({
        templateContext,
        section,
        allItems: items,
        columnBuckets,
        columnList
      }), templateContext, {
        templateType: 'content',
        fallbackCode: 'content_page',
        targets: [],
        renderGroup
      });
      writeTextFile(outputRoot, resolveColumnRouteOutputPath(rootPublicUrl), rootHtml, templateContext.site);
      filesWritten += 1;
    }
  }

  for (const columnNode of effectiveColumnList) {
    const isRootCategory = normalizeInteger(columnNode.id, 0) === normalizeInteger(section.rootColumnId, 0);
    if (hasSectionRootLanding && isRootCategory) {
      continue;
    }

    const columnId = normalizeInteger(columnNode.id, 0);
    const pageItems = (columnBuckets.get(columnId) || []).slice();
    const pages = paginate(pageItems, pageSize);
    const pageList = pages.length > 0 ? pages : [[]];

    for (let pageIndex = 0; pageIndex < pageList.length; pageIndex += 1) {
      const pageNumber = pageIndex + 1;
      const currentItems = pageList[pageIndex];
      const html = renderCmsSitePage('section-content-list', buildLegacySectionContentListPageProps({
        templateContext,
        section,
        columnNode,
        pageItems: currentItems,
        pageNumber,
        pageCount: pageList.length,
        totalRecords: pageItems.length,
        summaryClassName,
        pageSize
      }), templateContext, {
        templateType: 'list',
        fallbackCode: 'article_list',
        targets: [
          { target_type: 'column', target_id: columnNode.id },
          { target_type: 'column', target_id: section.rootColumnId }
        ],
        renderGroup
      });

      const outputPath = buildSectionListOutputPath(section, columnNode, pageNumber);
      writeTextFile(outputRoot, outputPath, html, templateContext.site);
      filesWritten += 1;
    }
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult(sectionKey, defaultSectionLabel, effectiveColumnList.length, filesWritten);
}

function getSectionListColumns(templateContext, section) {
  if (!shouldRenderFullSectionColumnTree(section)) {
    return getSectionTopLevelCategories(templateContext, section);
  }

  const rootColumnId = normalizeInteger(section?.rootColumnId, 0);
  return (templateContext.sectionCategoriesByRootId?.get(rootColumnId) || [])
    .filter((item) => normalizeInteger(item?.id, 0) !== rootColumnId)
    .slice()
    .sort(compareCategoryOrder);
}

function shouldRenderFullSectionColumnTree(section) {
  const templateData = section?.rootColumn?.template_data && typeof section.rootColumn.template_data === 'object'
    ? section.rootColumn.template_data
    : {};
  const pageKind = String(templateData.pageKind || '').trim().toLowerCase();
  return templateData.renderFullSectionTree === true
    || pageKind === 'series-tree';
}

function buildSectionListOutputPath(section, columnNode, pageNumber) {
  const publicUrl = buildSectionColumnPublicUrl(section, columnNode);
  return resolvePublicPageOutputPath(publicUrl, pageNumber);
}

function buildSectionDetailPagesByDir({
  outputRoot,
  idRange,
  languageCode = null,
  templateContext: providedTemplateContext = null,
  section,
  sectionKey,
  defaultSectionLabel,
  finalizeAssets = true
}) {
  const templateContext = providedTemplateContext || getLegacyTemplateContext(languageCode);
  if (!section) {
    return createBuildResult(sectionKey, defaultSectionLabel, 0, 0);
  }
  const dirName = section.dirName;
  const allowedColumnIds = new Set(getDescendantColumnIds(
    templateContext.publicSections.sectionTree.childrenByParentId,
    section.rootColumnId
  ));
  const columnMap = new Map(templateContext.sectionCategories.map((item) => [item.id, item]));
  const queriedItems = listSectionEntries(section, {
    languageCode: templateContext.languageCode,
    limit: 10000,
    visibleOnly: true,
    publishedOnly: false,
    columns: templateContext.columns,
    publicSections: templateContext.publicSections
  })
    .filter((item) => allowedColumnIds.has(normalizeInteger(item.column_id, 0)))
    .slice()
    .sort((left, right) => left.id - right.id);
  const allItems = queriedItems.filter(isPublishedCurrentLanguageContentItem);
  const items = filterByIdRange(allItems, idRange);
  const fallbackItems = filterByIdRange(
    queriedItems.filter((item) => !isPublishedCurrentLanguageContentItem(item)),
    idRange
  );
  const columnBuckets = groupBy(allItems, (item) => normalizeInteger(item.column_id, 0));
  let filesWritten = 0;
  const renderGroup = buildColumnRenderGroup({
    rootColumn: section?.rootColumn,
    pageKind: 'detail',
    fallbackKey: `${section?.dirName || 'section'}-detail`
  });

  for (const fallbackItem of fallbackItems) {
    const columnNode = columnMap.get(normalizeInteger(fallbackItem.column_id, 0));
    const columnPath = buildRelativeCategoryPathFromRoutePath(columnNode?.route_path, `/${dirName}/`);
    removeStaticOutputFile(
      outputRoot,
      buildContentDetailPathFromColumn(fallbackItem, columnNode, columnPath)
    );
  }

  for (const item of items) {
    const siblings = (columnBuckets.get(normalizeInteger(item.column_id, 0)) || []).slice().sort((left, right) => left.id - right.id);
    const currentIndex = siblings.findIndex((entry) => entry.id === item.id);
    const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null;
    const next = currentIndex >= 0 && currentIndex < siblings.length - 1 ? siblings[currentIndex + 1] : null;
    const columnNode = columnMap.get(normalizeInteger(item.column_id, 0));
    const html = renderCmsSitePage('section-content-detail', buildLegacySectionContentDetailPageProps({
      templateContext,
      section: section.sectionType,
      sectionConfig: section,
      item,
      columnNode,
      previous,
      next
    }), templateContext, {
      templateType: 'content',
      fallbackCode: 'article_detail',
      targets: [
        { target_type: 'column', target_id: normalizeInteger(item.column_id, 0) },
        { target_type: 'column', target_id: section.rootColumnId }
      ],
      renderGroup
    });

    const columnPath = buildRelativeCategoryPathFromRoutePath(columnNode?.route_path, `/${dirName}/`);
    const outputPath = buildContentDetailPathFromColumn(item, columnNode, columnPath);
    writeTextFile(outputRoot, outputPath, html, templateContext.site);
    filesWritten += 1;
  }

  if (finalizeAssets) {
    buildRegisteredTsxAssets(outputRoot);
  }
  return createBuildResult(sectionKey, defaultSectionLabel, items.length, filesWritten);
}


function getLegacyTemplateContext(languageCode = null) {
  const site = getSiteConfig(languageCode);
  const columns = filterPublicSectionColumns(listColumns({ languageCode }));
  const publicSections = resolvePublicSectionContext(columns);
  const sectionContent = buildSectionContentContext({
    languageCode,
    columns,
    publicSections,
    limit: 10000,
    visibleOnly: true
  });
  const managedColumnRoot = findManagedColumnRoot(columns);
  const pageTreeRoot = columns.find((item) => item?.column_semantics?.is_root && String(item?.column_semantics?.render_driver || '') === 'page_tree') || null;
  const rawManagedColumnCategories = managedColumnRoot
    ? mapColumnNodesByRoot(columns, managedColumnRoot.id).sort(compareCategoryOrder)
    : [];
  const managedColumnCategories = filterManagedRootColumn(rawManagedColumnCategories, managedColumnRoot);
  const sectionCategories = sectionContent.sectionCategories
    .slice()
    .sort(compareCategoryOrder);
  const pageTreeCategories = pageTreeRoot
    ? mapColumnNodesByRoot(columns, pageTreeRoot.id).sort(compareCategoryOrder)
    : listColumnNodes('corporation', { languageCode }).slice().sort(compareCategoryOrder);

  return {
    site,
    languageCode,
    columns,
    publicSections,
    sectionEntries: sectionContent.sectionEntries,
    sectionCategoriesByRootId: sectionContent.sectionCategoriesByRootId,
    sectionEntriesByRootId: sectionContent.sectionEntriesByRootId,
    sectionCategoryById: sectionContent.sectionCategoryById,
    corporationCategories: pageTreeCategories,
    managedColumnRoot,
    managedColumnCategories,
    sectionCategories
  };
}

function getLegacyUiText(templateContextOrSite = null) {
  const site = templateContextOrSite?.site || templateContextOrSite || {};
  const siteUi = site?.template_data?.ui || {};
  const textUi = siteUi.text || {};
  return {
    contactUs: coerceConfiguredText(textUi.contactUs, siteUi.nav?.contactLabel, '联系我们'),
    pageTree: coerceConfiguredText(textUi.pageTree, '单页栏目'),
    managedRoot: coerceConfiguredText(textUi.managedRoot, resolveManagedColumnDisplayName(templateContextOrSite), '内容'),
    newsSection: coerceConfiguredText(textUi.newsSection, siteUi.nav?.mainLabels?.news, '公司新闻'),
    categoryDirectory: coerceConfiguredText(textUi.categoryDirectory, '分类目录'),
    noPreviousArticle: coerceConfiguredText(textUi.noPreviousArticle, '没有上一篇'),
    noNextArticle: coerceConfiguredText(textUi.noNextArticle, '没有下一篇'),
    pagerFirst: coerceConfiguredText(textUi.pagerFirst, '首页'),
    pagerPrevious: coerceConfiguredText(textUi.pagerPrevious, '上一页'),
    pagerNext: coerceConfiguredText(textUi.pagerNext, '下一页'),
    pagerLast: coerceConfiguredText(textUi.pagerLast, '末页'),
    pagerLastAlt: coerceConfiguredText(textUi.pagerLastAlt, textUi.pagerLast, '尾页'),
    pagerRecordsPrefix: coerceConfiguredText(textUi.pagerRecordsPrefix, '共'),
    pagerRecordsSuffix: coerceConfiguredText(textUi.pagerRecordsSuffix, '条信息'),
    pagerPageLabel: coerceConfiguredText(textUi.pagerPageLabel, '页次：'),
    pagerPerPageSuffix: coerceConfiguredText(textUi.pagerPerPageSuffix, '条信息/页'),
    noRelatedItems: coerceConfiguredText(textUi.noRelatedItems, '暂无相关内容'),
    relatedItems: coerceConfiguredText(textUi.relatedItems, '相关内容')
  };
}

function coerceConfiguredText(...candidates) {
  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function buildLegacyCommonProps(templateContext) {
  const sectionEntries = Array.isArray(templateContext.sectionEntries)
    ? templateContext.sectionEntries.map((item) => ({
      ...item,
      url: buildSiteScopedArticleUrl(item, templateContext)
    }))
    : [];

  // 为 footer 准备托管栏目分类数据：一级分类及其二级分类
  const level1Categories = templateContext.managedColumnCategories
    .filter(cat => normalizeInteger(cat.parent_id, 0) === 0 && normalizeInteger(cat.id, 0) !== 0)
    .slice(0, 11); // 取前11个一级分类

  // 创建栏目映射表，用于构建完整 URL
  const columnMap = buildManagedColumnPathMap(templateContext.managedColumnCategories, templateContext.managedColumnRoot);

  const footerManagedColumnCategories = level1Categories.map(cat => {
    // 获取该一级分类下的所有二级分类
    const catId = normalizeInteger(cat.id, 0);
    const children = templateContext.managedColumnCategories
      .filter(subCat => normalizeInteger(subCat.parent_id, 0) === catId)
      .map(subCat => ({
        id: subCat.id,
        name: subCat.name,
        dir_name: subCat.dir_name,
        url: buildLegacyManagedColumnUrl(subCat, columnMap, templateContext.site)
      }));

    return {
      id: cat.id,
      name: cat.name,
      dir_name: cat.dir_name,
      url: buildLegacyManagedColumnUrl(cat, columnMap, templateContext.site),
      children // 添加二级分类
    };
  });

  // header 主导航直接来自现有栏目树，不再维护单独的导航配置根节点
  const siteColumns = buildLegacySiteColumns(templateContext.columns, {
    managedColumnCategories: templateContext.managedColumnCategories,
    sectionEntries,
    templateContext
  });
  
  // 构建 footer 专用的栏目结构（展开托管栏目分类）
  const footerColumns = [];
  const footerLabels = templateContext.site?.template_data?.ui?.footer?.sections || {};
  for (const col of siteColumns) {
    if (templateContext.managedColumnRoot && normalizeInteger(col.id, 0) === normalizeInteger(templateContext.managedColumnRoot.id, 0)) {
      // 为每个一级托管分类创建独立的栏目用于 footer
      for (const cat of footerManagedColumnCategories.slice(0, 11)) {
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

  const normalizedFooterColumns = [
    buildFooterSectionColumn({
      title: footerLabels.homeLinks,
      url: prefixSitePathForContext('/', templateContext.site, { allowApi: false, allowAssets: false }),
      children: buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.homeLinks, templateContext.site)
    }),
    buildFooterSectionColumn({
      title: footerLabels.managedRoot,
      url: resolveManagedColumnRootPublicUrl(templateContext) || prefixSitePathForContext('/', templateContext.site, { allowApi: false, allowAssets: false }),
      children: buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.managedRoot, templateContext.site).length > 0
        ? buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.managedRoot, templateContext.site)
        : footerManagedColumnCategories
    }),
    buildFooterSectionColumn({
      title: footerLabels.industries,
      url: prefixSitePathForContext('/industries/', templateContext.site, { allowApi: false, allowAssets: false }),
      children: buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.industries, templateContext.site)
    }),
    buildFooterSectionColumn({
      title: footerLabels.services,
      url: prefixSitePathForContext('/services/', templateContext.site, { allowApi: false, allowAssets: false }),
      children: buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.services, templateContext.site)
    }),
    buildFooterSectionColumn({
      title: footerLabels.about,
      url: prefixSitePathForContext('/about-us/', templateContext.site, { allowApi: false, allowAssets: false }),
      children: buildConfiguredFooterLinks(templateContext.site?.template_data?.ui?.footer?.about, templateContext.site)
    })
  ].filter(Boolean);

  return {
    site: templateContext.site,
    uiText: getLegacyUiText(templateContext),
    columns: templateContext.columns,
    columnTag: createTemplateColumnTag(templateContext),
    sectionEntries,
    sectionCategories: templateContext.sectionCategories,
    managedColumnCategories: templateContext.managedColumnCategories,
    corporationCategories: templateContext.corporationCategories,
    siteColumns,
    utilityColumns: buildHeaderUtilityColumns(templateContext.columns),
    languageSwitcher: buildLanguageSwitcherData(templateContext),
    footerMeta: buildFooterMetaData(templateContext),
    footerColumns: normalizedFooterColumns.length > 0 ? normalizedFooterColumns : footerColumns,
    footerManagedColumnCategories,
    fragments: {
      indextopHtml: '',
      topHtml: '',
      bottomHtml: '',
      indexFootHtml: '',
      aboutHtml: '',
      managedMenuHtml: buildLegacyManagedColumnMenu(templateContext.managedColumnCategories, templateContext.site, templateContext.managedColumnRoot),
      managedMenuCompactHtml: buildLegacyManagedColumnMenuCompact(templateContext.managedColumnCategories, templateContext.site, templateContext.managedColumnRoot),
      aboutCategoryHtml: buildLegacyAboutCategoryList(templateContext.corporationCategories, templateContext.site),
      newsCategoryHtml: buildSectionCategoryListHtml(templateContext, 'news'),
      serviceCategoryHtml: buildSectionCategoryListHtml(templateContext, 'service')
    }
  };
}

function createTemplateColumnTag(templateContext) {
  const safeLanguageCode = String(
    templateContext?.site?.requested_language_code
    || templateContext?.site?.current_language_code
    || templateContext?.languageCode
    || ''
  ).trim() || null;

  return ({ id, columnId, limit = 20, visibleOnly = true } = {}) => {
    const targetColumnId = normalizeInteger(columnId ?? id, 0);
    if (targetColumnId <= 0) {
      return [];
    }

    const column = templateContext?.columns.find((item) => normalizeInteger(item?.id, 0) === targetColumnId) || null;
    const modelCode = String(column?.model_code || '').trim();
    if (!modelCode) {
      return [];
    }

    return listContentItems(modelCode, {
      visibleOnly,
      publishedOnly: true,
      limit: Math.min(Math.max(normalizeInteger(limit, 20), 1), 200),
      columnId: targetColumnId,
      languageCode: safeLanguageCode
    })
      .map((item) => {
        const templateData = item?.template_data && typeof item.template_data === 'object'
          ? item.template_data
          : null;
        const title = String(item?.name || '').trim();
        const summary = normalizeRenderableLegacyText(item?.summary || '');
        const image = resolveLegacyContentPreviewImage(item);
        return {
          id: normalizeInteger(item?.id, 0),
          columnId: normalizeInteger(item?.column_id, 0),
          name: title,
          title,
          summary,
          description: summary,
          image: image || '',
          imageAlt: title,
          url: buildSiteScopedManagedContentUrl(item, templateContext.site),
          templateData
        };
      });
  };
}

function buildConfiguredFooterLinks(items = [], site = null) {
  return Array.isArray(items)
    ? items
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        name: String(item.name || '').trim(),
        url: prefixSitePathForContext(String(item.url || '').trim(), site, {
          allowApi: false,
          allowAssets: false
        }),
        openInNewTab: item.openInNewTab === true
      }))
      .filter((item) => item.name && item.url)
    : [];
}

function buildFooterSectionColumn({ title = '', url = '', children = [] }) {
  const normalizedTitle = String(title || '').trim();
  const normalizedUrl = String(url || '').trim();
  const normalizedChildren = Array.isArray(children)
    ? children
      .map((item) => ({
        name: String(item?.name || '').trim(),
        url: String(item?.url || '').trim(),
        openInNewTab: item?.openInNewTab === true
      }))
      .filter((item) => item.name && item.url)
    : [];
  if (!normalizedTitle || !normalizedUrl || normalizedChildren.length === 0) {
    return null;
  }
  return {
    name: normalizedTitle,
    url: normalizedUrl,
    children: normalizedChildren
  };
}

function buildLanguageSwitcherData(templateContext) {
  const currentLanguageCode = String(
    templateContext?.site?.requested_language_code
    || templateContext?.site?.current_language_code
    || templateContext?.languageCode
    || ''
  ).trim();
  const configuredTriggerLabel = String(
    templateContext?.site?.template_data?.ui?.languageSwitcher?.triggerLabel
    || ''
  ).trim();
  const currentPageUrl = String(templateContext?.currentPage?.url || '/').trim() || '/';
  const currentPathPrefix = String(templateContext?.site?.language_site_path_prefix || '/').trim() || '/';
  const pagePath = normalizeLanguageSwitcherPagePath(currentPageUrl, currentPathPrefix);
  const items = listLanguages()
    .filter((language) => Number(language?.is_enabled || 0) === 1)
    .sort((left, right) => {
      const leftOrder = normalizeInteger(left?.sort_order, 0);
      const rightOrder = normalizeInteger(right?.sort_order, 0);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }
      return normalizeInteger(left?.id, 0) - normalizeInteger(right?.id, 0);
    })
    .map((language) => {
      const baseUrl = resolveLanguageSitePublicBaseUrl(language.code);
      const href = buildLanguageSwitcherHref(baseUrl, pagePath, language);
      return {
        code: language.code,
        name: language.native_name || language.name || language.code,
        href,
        isCurrent: language.code === currentLanguageCode
      };
    })
    .filter((language) => language.href);

  const currentLanguage = items.find((language) => language.isCurrent) || null;
  return {
    currentLabel: currentLanguage?.name || currentLanguageCode || '',
    triggerLabel: configuredTriggerLabel || '切换语言',
    items
  };
}

function buildFooterMetaData(templateContext) {
  const configuredRecords = templateContext?.site?.template_data?.ui?.footer?.meta?.records;
  const normalizedConfiguredRecords = normalizeFooterMetaRecords(configuredRecords);
  if (normalizedConfiguredRecords.length > 0) {
    return {
      records: normalizedConfiguredRecords
    };
  }

  const fallbackRecords = [
    templateContext?.site?.icp_number,
    templateContext?.site?.company_phone,
    templateContext?.site?.company_address
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return {
    records: fallbackRecords
  };
}

function normalizeFooterMetaRecords(records) {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .map((item) => {
      if (typeof item === 'string') {
        return item.trim();
      }
      if (item && typeof item === 'object') {
        return String(item.text || '').trim();
      }
      return '';
    })
    .filter(Boolean);
}

function buildLanguageSwitcherHref(baseUrl, pagePath, language) {
  const normalizedBaseUrl = String(baseUrl || '').trim();
  if (!normalizedBaseUrl) {
    return '';
  }

  const normalizedPagePath = String(pagePath || '/').trim() || '/';
  if (normalizedPagePath !== '/') {
    return `${normalizedBaseUrl}${normalizedPagePath}`;
  }

  if (String(language?.site?.site_mode || '').trim().toLowerCase() === 'subdir') {
    return normalizedBaseUrl.endsWith('/') ? normalizedBaseUrl : `${normalizedBaseUrl}/`;
  }

  return `${normalizedBaseUrl}/`;
}

function normalizeLanguageSwitcherPagePath(url, currentPathPrefix = '/') {
  const value = String(url || '/').trim();
  if (!value) {
    return '/';
  }
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, '');
  let normalized = withoutOrigin.startsWith('/') ? withoutOrigin : `/${withoutOrigin}`;
  const normalizedPrefix = normalizeLanguageSitePathPrefix(currentPathPrefix);
  if (normalizedPrefix !== '/' && (normalized === normalizedPrefix || normalized.startsWith(`${normalizedPrefix}/`))) {
    normalized = normalized.slice(normalizedPrefix.length) || '/';
  }
  normalized = normalized.replace(/\/index\.html$/i, '/');
  if (!normalized.includes('?') && !normalized.includes('#') && !normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }
  return normalized || '/';
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
    .replaceAll('#HOPE_ManagedCat()#', buildLegacyManagedColumnMenu(templateContext.managedColumnCategories, site, templateContext.managedColumnRoot))
    .replaceAll('#HOPE_ManagedCat2()#', buildLegacyManagedColumnMenuCompact(templateContext.managedColumnCategories, site, templateContext.managedColumnRoot));

  html = html.replace(/#HOPE_aboutCat\((\d+)\)#/gi, () => buildLegacyAboutCategoryList(templateContext.corporationCategories, site));
  html = html.replace(/#HOPE_NewsCat\((\d+)\s*,\s*(\d+)\)#/gi, (_, id, dirCode) => {
    const dirName = normalizeInteger(dirCode, 1) === 2 ? 'services' : 'news';
    if (normalizeInteger(id, 0) > 0) {
      const explicitSection = templateContext.publicSections.getSectionByColumnId(normalizeInteger(id, 0));
      return buildSectionCategoryListHtml(templateContext, explicitSection?.dirName || dirName);
    }
    return buildSectionCategoryListHtml(templateContext, dirName);
  });

  return normalizeLegacyTemplateMarkup(html, site);
}

function buildLegacyHomePageProps(templateContext) {
  const homeColumn = templateContext.columns.find((item) => normalizeInteger(item?.id, 0) === 117) || null;
  const homePageData = normalizeLegacyColumnPageData(homeColumn?.template_data, templateContext.site);
  const homePrimaryImage = getPrimaryTemplateImage(homeColumn);
  const featuredManagedItems = (templateContext.managedColumnRoot
    ? listManagedColumnItems(templateContext.managedColumnRoot, {
      featured: true,
      visibleOnly: true,
      limit: 10000,
      languageCode: templateContext.languageCode
    })
    : [])
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
        url: buildSiteScopedManagedContentUrl(item, templateContext.site),
        image: normalizeUploadedRelativePath(String(images[0] || '').trim()),
        images: images.map((entry) => normalizeUploadedRelativePath(String(entry || '').trim())).filter(Boolean),
        summary: item.summary || ''
      };
    });
  const newsSection = templateContext.publicSections.getSectionByDirName('news');
  const serviceSection = templateContext.publicSections.getSectionByDirName('services');
  const homeNewsItems = getSectionEntries(templateContext, newsSection)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.name || '',
      url: buildSiteScopedArticleUrl(item, templateContext, newsSection),
      image: resolveLegacyContentPreviewImage(item),
      summary: resolveRenderableContentSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    }));
  const homeServiceItems = getSectionEntries(templateContext, serviceSection)
    .slice(0, 6)
    .map((item) => ({
      id: item.id,
      title: item.name || '',
      url: buildSiteScopedArticleUrl(item, templateContext, serviceSection),
      image: resolveLegacyContentPreviewImage(item),
      summary: resolveRenderableContentSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    }));
  return {
    ...buildLegacyCommonProps(templateContext),
    siteColumns: buildTemplateContextSiteColumns(templateContext, {
      activeColumnId: normalizeInteger(homeColumn?.id, 0)
    }),
    secondaryMenuItems: buildLegacyRootColumnMenuItems(templateContext.columns, templateContext),
    newsIndexHtml: buildLegacyIndexNews(templateContext),
    featuredManagedItemsHtml: buildLegacyIndexFeaturedManagedItems(templateContext),
    featuredManagedItemLinksHtml: buildLegacyIndexFeaturedManagedItemLinks(templateContext),
    serviceIndexHtml: buildLegacyServiceIndex(templateContext),
    homeFeaturedManagedItems: featuredManagedItems,
    homeNewsItems,
    homeServiceItems,
    title: homePageData?.title || templateContext.site.web_name || '',
    pageData: homePageData,
    currentColumnPageData: homePageData,
    currentColumnHeroImage: homePageData?.mastheadImage || homePageData?.heroImage || homePrimaryImage,
    currentColumnDescription: homePageData?.summary || '',
    contentHtml: normalizeLegacyBodyHtml(homeColumn?.content_html, templateContext.site, { fallbackAlt: homePageData?.title || templateContext.site.web_name }) || '',
    bodyHtml: normalizeLegacyBodyHtml(homeColumn?.content_html, templateContext.site, { fallbackAlt: homePageData?.title || templateContext.site.web_name }) || '',
    seoMeta: buildSeoMeta({
      title: templateContext.site.seo_home_title || templateContext.site.seo_default_title || templateContext.site.web_name || '',
      description: templateContext.site.seo_home_description || templateContext.site.seo_default_description || templateContext.site.company_name || templateContext.site.web_name || '',
      url: prefixSitePathForContext('/', templateContext.site, { allowApi: false, allowAssets: false }),
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: '/' })
  };
}

function buildLegacyNotFoundPageProps(templateContext) {
  const notFoundUrl = prefixSitePathForContext('/404.html', templateContext.site, {
    allowApi: false,
    allowAssets: false
  });

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'not_found',
      title: '404',
      url: notFoundUrl,
      section: { type: 'system', name: '404', url: notFoundUrl },
      columnChain: [],
      content: null
    }),
    siteColumns: buildTemplateContextSiteColumns(templateContext),
    primaryMenuItems: buildLegacyRootColumnMenuItems(templateContext.columns, templateContext),
    secondaryMenuItems: buildLegacyRootColumnMenuItems(templateContext.columns, templateContext),
    title: '404',
    itemDescription: '',
    bodyHtml: '',
    contentHtml: '',
    seoMeta: {
      basic: {
        robots: 'noindex, nofollow'
      }
    },
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: []
  };
}

function buildLegacyRootColumnMenuItems(columns, templateContext = null) {
  return buildLegacySiteColumns(columns, { templateContext }).map((item) => ({
    label: item.name || '',
    url: item.url || '',
    active: false
  })).filter((item) => item.url);
}

function buildTemplateContextSiteColumns(templateContext, overrides = {}) {
  return buildLegacySiteColumns(templateContext.columns, {
    managedColumnCategories: templateContext.managedColumnCategories,
    sectionEntries: templateContext.sectionEntries,
    templateContext,
    ...overrides
  });
}

function mapHeaderChildEntry(item, activeColumnId) {
  return {
    id: normalizeInteger(item?.id, 0),
    name: item?.name || '',
    parentId: normalizeInteger(item?.parentId ?? item?.parent_id, 0),
    modelCode: item?.modelCode ?? item?.model_code ?? '',
    sourceType: item?.sourceType ?? item?.column_type ?? '',
    sourceId: normalizeInteger(item?.sourceId ?? item?.id, 0),
    active: activeColumnId !== 0 && normalizeInteger(item?.id, 0) === activeColumnId,
    showInNav: normalizeInteger(item?.showInNav ?? item?.is_visible, 1),
    url: item?.url || ''
  };
}

function resolveColumnDisplayLabel(item, keys = []) {
  const templateData = item?.template_data && typeof item.template_data === 'object'
    ? item.template_data
    : null;
  if (!templateData) {
    return '';
  }

  for (const key of keys) {
    const value = String(templateData?.[key] || '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function buildHeaderUtilityColumns(rows) {
  const publicSections = resolvePublicSectionContext(rows);
  const normalizedRows = rows.map((item) => ({
    ...item,
    id: normalizeInteger(item?.id, 0),
    parent_id: normalizeInteger(item?.parent_id, 0),
    sort_order: normalizeInteger(item?.sort_order, 0),
    is_visible: normalizeInteger(item?.is_visible, 1),
    url: buildLegacyColumnUrl(item, publicSections)
  }));

  const utilityRoot = normalizedRows.find((item) => String(item?.custom_url || '').trim() === '#top-menu') || null;
  if (!utilityRoot) {
    return [];
  }

  return normalizedRows
    .filter((item) => item.parent_id === utilityRoot.id)
    .filter((item) => item.is_visible !== 0)
    .filter((item) => item.url)
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.name || '',
      url: item.url,
      openInNewTab: false
    }));
}

function buildHeaderGroupedNavColumns(rows, activeColumnId) {
  const publicSections = resolvePublicSectionContext(rows);
  const normalizedRows = rows.map((item) => ({
    ...item,
    id: normalizeInteger(item?.id, 0),
    parent_id: normalizeInteger(item?.parent_id, 0),
    sort_order: normalizeInteger(item?.sort_order, 0),
    is_visible: normalizeInteger(item?.is_visible, 1),
    custom_url: String(item?.custom_url || '').trim(),
    url: buildLegacyColumnUrl(item, publicSections)
  }));

  const utilityRoot = normalizedRows.find((item) => item.custom_url === '#top-menu') || null;
  if (!utilityRoot) {
    return [];
  }

  const utilityUrls = new Set(
    normalizedRows
      .filter((item) => item.parent_id === utilityRoot.id)
      .filter((item) => item.is_visible !== 0)
      .map((item) => item.custom_url || item.url)
      .filter(Boolean)
  );

  return normalizedRows
    .filter((item) => item.parent_id === utilityRoot.id)
    .filter((item) => item.url)
    .filter((item) => !String(item.custom_url || '').startsWith('#'))
    .filter((item) => !utilityUrls.has(item.url))
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.name || '',
      parentId: item.parent_id,
      modelCode: item.model_code || '',
      sourceType: item.column_type || '',
      sourceId: item.id,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: 1,
      sortOrder: item.sort_order,
      url: item.url,
      customUrl: item.custom_url,
      renderDriver: String(item?.column_semantics?.render_driver || '').trim(),
      template_data: item?.template_data || null
    }));
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
    .filter((item) => item.renderDriver === 'single_page')
    .filter((item) => item.url && item.url !== rootPath)
    .filter((item) => isImmediateChildPath(rootPath, item.url))
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: resolveColumnDisplayLabel(item, ['navLabel', 'menuLabel', 'shortLabel']) || item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: item.showInNav,
      url: item.url
    }));
}

function buildHeaderSectionChildren(rows, section, activeColumnId, { sectionEntries = [], templateContext = null } = {}) {
  if (!section) {
    return [];
  }

  const serviceRootId = normalizeInteger(section.rootColumnId, 0);
  const visibleRows = section.sectionType === 'service'
    ? rows
    : rows.filter((item) => item.showInNav !== 0 && item.url);

  const columnChildren = rows
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.parentId === serviceRootId)
    .filter((item) => item.renderDriver === 'section')
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: resolveColumnDisplayLabel(item, ['navLabel', 'menuLabel', 'shortLabel']) || item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: item.showInNav,
      url: item.url
    }));

  if (columnChildren.length > 0) {
    return columnChildren;
  }

  return sectionEntries
    .filter((item) => normalizeInteger(item?.column_id, 0) === serviceRootId)
    .sort(compareHeaderNavEntries)
    .map((item) => ({
      id: item.id,
      name: item.name || '',
      parentId: normalizeInteger(item.column_id, 0),
      modelCode: 'news',
      sourceType: 'news_item',
      sourceId: item.id,
      active: false,
      showInNav: 1,
      sortOrder: normalizeInteger(item.sort_order, 0),
      url: buildSiteScopedArticleUrl(item, templateContext || { publicSections: { getSectionByColumnId: () => section }, site: null }, section)
    }));
}

function buildLegacySiteColumns(columns, options = {}) {
  const rows = Array.isArray(columns) ? columns : [];
  const publicSections = resolvePublicSectionContext(rows);
  const activeColumnId = normalizeInteger(options.activeColumnId, 0);
  const currentSite = options.templateContext?.site || null;
  const managedRootColumnId = normalizeInteger(options.templateContext?.managedColumnRoot?.id, 0);
  const managedRootModelCode = String(options.templateContext?.managedColumnRoot?.model_code || '').trim();
  const managedCategoryMap = buildManagedColumnPathMap(
    options.managedColumnCategories,
    options.templateContext?.managedColumnRoot
  );
  const normalizedRows = rows.map((item) => ({
    id: normalizeInteger(item?.id, 0),
    name: item?.name || '',
    template_data: item?.template_data || null,
    parentId: normalizeInteger(item?.parent_id, 0),
    sourceType: item?.column_type || '',
    sourceId: normalizeInteger(item?.id, 0),
    modelCode: item?.model_code || '',
    renderDriver: String(item?.column_semantics?.render_driver || '').trim(),
    showInNav: normalizeInteger(item?.is_visible, 1),
    sortOrder: normalizeInteger(item?.sort_order, 0),
    customUrl: String(item?.custom_url || '').trim(),
    url: buildLegacyColumnUrl(item, publicSections, options.templateContext?.site || null)
  })).filter((item) => item.id !== 0);

  const topLevelNavRows = normalizedRows
    .filter((item) => item.parentId === 0)
    .filter((item) => item.showInNav !== 0)
    .filter((item) => item.url)
    .filter((item) => !item.customUrl.startsWith('#'))
    .sort(compareHeaderNavEntries);
  const groupedNavRows = buildHeaderGroupedNavColumns(rows, activeColumnId);
  const navLabels = options.templateContext?.site?.template_data?.ui?.nav?.mainLabels || {};
  const configuredMainItems = Array.isArray(options.templateContext?.site?.template_data?.ui?.nav?.mainItems)
    ? options.templateContext.site.template_data.ui.nav.mainItems
    : [];
  const candidateNavRows = normalizedRows
    .concat(groupedNavRows)
    .filter((item) => item?.url && !String(item?.customUrl || '').startsWith('#'));
  const candidateNavRowByUrl = new Map();
  for (const item of candidateNavRows) {
    const normalizedCandidateUrl = normalizeSiteNavigationMatchPath(item.url, currentSite);
    if (!normalizedCandidateUrl || candidateNavRowByUrl.has(normalizedCandidateUrl)) {
      continue;
    }
    candidateNavRowByUrl.set(normalizedCandidateUrl, item);
  }
  const navRows = configuredMainItems.length > 0
    ? configuredMainItems
      .map((item, index) => {
        const url = String(item?.url || '').trim();
        if (!url) {
          return null;
        }
        const base = candidateNavRowByUrl.get(normalizeSiteNavigationMatchPath(url, currentSite)) || null;
        return {
          ...(base || {
            id: 0,
            name: '',
            template_data: null,
            parentId: 0,
            sourceType: '',
            sourceId: 0,
            modelCode: '',
            renderDriver: '',
            showInNav: 1,
            sortOrder: index,
            customUrl: '',
            url
          }),
          name: String(item?.name || '').trim() || base?.name || '',
          url: url || base?.url || '',
          sortOrder: index
        };
      })
      .filter(Boolean)
    : topLevelNavRows
      .concat(groupedNavRows)
      .sort(compareHeaderNavEntries);

  const topicRootColumn = collectTopicColumns(rows)
    .find((item) => normalizeInteger(item?.parent_id, 0) === 0) || null;
  const topicNavRow = topicRootColumn
    ? normalizedRows.find((item) => item.id === normalizeInteger(topicRootColumn.id, 0)) || null
    : null;
  if (topicNavRow && topicNavRow.showInNav !== 0 && !navRows.some((item) => item.id === topicNavRow.id)) {
    const managedRootIndex = navRows.findIndex((item) => item.id === managedRootColumnId);
    navRows.splice(managedRootIndex >= 0 ? managedRootIndex + 1 : navRows.length, 0, {
      ...topicNavRow,
      name: resolveColumnDisplayLabel(topicRootColumn, ['navLabel', 'menuLabel', 'shortLabel']) || topicRootColumn.name
    });
  }

  return navRows.map((item) => {
    let children = [];

    if (item.renderDriver === 'managed_column') {
      children = Array.isArray(options.managedColumnCategories)
        ? options.managedColumnCategories
          .filter((cat) => normalizeInteger(cat.parent_id, 0) === 0 && normalizeInteger(cat.id, 0) !== 0)
          .slice(0, 11)
          .map((cat) => ({
            id: cat.id,
            name: resolveColumnDisplayLabel(cat, ['navLabel', 'menuLabel', 'shortLabel']) || cat.name,
            parentId: normalizeInteger(cat.parent_id, 0),
            modelCode: managedRootModelCode || item.modelCode,
            sourceType: 'list',
            sourceId: normalizeInteger(cat.id, 0),
            active: false,
            showInNav: 1,
            url: buildLegacyManagedColumnUrl(cat, managedCategoryMap, options.templateContext?.site || null)
          }))
        : [];
    } else if (item.renderDriver === 'section') {
      const section = publicSections.getSectionByColumnId(item.id);
      children = buildHeaderSectionChildren(normalizedRows, section, activeColumnId, {
        sectionEntries: options.sectionEntries,
        templateContext: options.templateContext || null
      });
    } else if (item.renderDriver === 'single_page') {
      children = buildHeaderPrefixChildren(normalizedRows, item.url, activeColumnId);
    }

    return {
      id: item.id,
      name: String(item.name || '').trim() || resolveConfiguredNavLabel(item, navLabels, {
        managedRootColumnId,
        managedRootModelCode
      }) || resolveColumnDisplayLabel(item, ['navLabel', 'menuLabel', 'shortLabel']) || item.name,
      parentId: item.parentId,
      modelCode: item.modelCode,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      active: activeColumnId !== 0 && item.id === activeColumnId,
      showInNav: item.showInNav,
      url: item.url,
      children
    };
  });
}

function normalizeUrlPath(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/index.html') {
    return '/';
  }
  if (normalized.endsWith('/index.html')) {
    return normalized.slice(0, -10) || '/';
  }
  return normalized;
}

function normalizeSiteNavigationMatchPath(value = '', site = null) {
  const normalized = normalizeUrlPath(value);
  if (!normalized.startsWith('/')) {
    return normalized;
  }

  const prefixed = prefixSitePathForContext(normalized, site, {
    allowApi: false,
    allowAssets: false
  });
  const normalizedPrefixed = normalizeUrlPath(prefixed);
  if (!normalizedPrefixed.startsWith('/')) {
    return normalizedPrefixed;
  }

  const normalizedPrefix = normalizeLanguageSitePathPrefix(site?.language_site_path_prefix || '/');
  if (normalizedPrefix === '/' || normalizedPrefixed === normalizedPrefix) {
    return normalizedPrefixed;
  }

  return normalizedPrefixed.startsWith(`${normalizedPrefix}/`)
    ? normalizedPrefixed.slice(normalizedPrefix.length) || '/'
    : normalizedPrefixed;
}

function resolveConfiguredNavLabel(item, navLabels = {}, managedContext = {}) {
  if (!item || !navLabels || typeof navLabels !== 'object') {
    return '';
  }
  const routeUrl = String(item.url || '').trim();
  const customUrl = String(item.customUrl || '').trim();
  const modelCode = String(item.modelCode || '').trim();
  const renderDriver = String(item.renderDriver || '').trim();
  const managedRootColumnId = normalizeInteger(managedContext.managedRootColumnId, 0);
  const managedRootModelCode = String(managedContext.managedRootModelCode || '').trim();
  const managedRootRoutePath = resolveManagedRootRoutePath(managedContext);

  if (routeUrl === '/') {
    return String(navLabels.home || '').trim();
  }
  if (
    renderDriver === 'managed_column'
    || (managedRootRoutePath && routeUrl === managedRootRoutePath)
    || (managedRootColumnId > 0 && normalizeInteger(item.id, 0) === managedRootColumnId)
    || (managedRootModelCode && modelCode === managedRootModelCode)
  ) {
    return String(navLabels.managedRoot || '').trim();
  }
  if (routeUrl === '/industries/') {
    return String(navLabels.industries || '').trim();
  }
  if (routeUrl === '/services/') {
    return String(navLabels.services || '').trim();
  }
  if (routeUrl === '/training/') {
    return String(navLabels.training || '').trim();
  }
  if (routeUrl === '/news/') {
    return String(navLabels.news || '').trim();
  }
  if (routeUrl === '/your-goals/' || customUrl === '/your-goals/' || routeUrl.startsWith('/your-goals/')) {
    return String(navLabels.yourGoals || '').trim();
  }
  return '';
}

function resolveManagedRootRoutePath(managedContext = {}) {
  const routePath = String(managedContext.managedRootRoutePath || '').trim();
  if (!routePath) {
    return '';
  }
  return routePath.endsWith('/') ? routePath : `${routePath}/`;
}

function buildLegacyColumnUrl(column, rowsById = new Map(), site = null) {
  return prefixSitePathForContext(buildColumnPublicUrl(column, rowsById), site, {
    allowApi: false,
    allowAssets: false
  });
}

function buildLegacyContactPageProps(templateContext) {
  const uiText = getLegacyUiText(templateContext);
  const contactColumn = templateContext.columns.find((item) => String(item.dir_name || '') === 'contact-us') || null;
  const contactPage = contactColumn
    ? resolveDedicatedColumnPageContent(contactColumn, templateContext.languageCode)
    : null;
  const contactUrl = contactColumn
    ? buildLegacyColumnUrl(contactColumn, templateContext.publicSections, templateContext.site) || prefixSitePathForContext('/contact-us/', templateContext.site, { allowApi: false, allowAssets: false })
    : prefixSitePathForContext('/contact-us/', templateContext.site, { allowApi: false, allowAssets: false });
  const pageTitleBase = templateContext.site.company_name || templateContext.site.web_name || '';
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'contact',
      title: uiText.contactUs,
      url: contactUrl,
      section: { type: 'content', name: uiText.contactUs, url: contactUrl }
    }),
    contactTableHtml: normalizeLegacyRichTextHtml(contactPage?.content_html, templateContext.site) || '',
    seoMeta: buildSeoMeta({
      title: contactPage?.seo_title || (pageTitleBase ? `${uiText.contactUs} | ${pageTitleBase}` : uiText.contactUs),
      description: contactPage?.seo_description || contactPage?.summary || templateContext.site.seo_default_description || templateContext.site.company_address || templateContext.site.company_phone || pageTitleBase || uiText.contactUs,
      url: contactUrl,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: contactUrl })
  };
}

function buildLegacyContentPageProps(templateContext, item) {
  const uiText = getLegacyUiText(templateContext);
  const parentColumn = templateContext.corporationCategories.find((entry) => normalizeInteger(entry.id, 0) === normalizeInteger(item.parent_id, 0)) || null;
  const pageUrl = prefixSitePathForContext(`/about/about-${normalizeInteger(item.id, 0)}.html`, templateContext.site, { allowApi: false, allowAssets: false });
  const sectionUrl = prefixSitePathForContext('/about/', templateContext.site, { allowApi: false, allowAssets: false });
  const pageTitleBase = templateContext.site.company_name || templateContext.site.web_name || '';
  const pageContent = resolveDedicatedColumnPageContent(item, templateContext.languageCode);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'content',
      title: item.name || '',
      url: pageUrl,
      section: { type: 'page-tree', name: uiText.pageTree, url: sectionUrl },
      columnChain: buildTemplateColumnChain({
        column: item,
        columns: templateContext.corporationCategories,
        type: 'page-tree',
        urlBuilder: (columnItem) => prefixSitePathForContext(`/about/about-${normalizeInteger(columnItem.id, 0)}.html`, templateContext.site, { allowApi: false, allowAssets: false })
      }),
      columnType: 'page-tree',
      columnUrl: pageUrl,
      parentColumn,
      parentColumnType: 'page-tree',
      parentColumnUrl: parentColumn ? prefixSitePathForContext(`/about/about-${normalizeInteger(parentColumn.id, 0)}.html`, templateContext.site, { allowApi: false, allowAssets: false }) : ''
    }),
    title: item.name || '',
    contentHtml: normalizeLegacyBodyHtml(pageContent?.content_html, templateContext.site, { fallbackAlt: item.name }) || '',
    secondaryMenuItems: buildLegacyCorporationMenuItems(templateContext.corporationCategories, normalizeInteger(item.id, 0), templateContext.site),
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || (item.name && pageTitleBase ? `${item.name} | ${pageTitleBase}` : item.name || pageTitleBase),
      description: pageContent?.seo_description || pageContent?.summary || templateContext.site.seo_default_description || item.name || '',
      url: pageUrl,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: pageUrl })
  };
}

function buildLegacySingleColumnPageProps(templateContext, column) {
  const url = buildLegacyColumnUrl(column, templateContext.publicSections, templateContext.site);
  const columnPageData = normalizeLegacyColumnPageData(column?.template_data, templateContext.site);
  const pageContent = resolveDedicatedColumnPageContent(column, templateContext.languageCode);
  const columnPrimaryImage = getPrimaryTemplateImage(column);
  const columnChain = buildTemplateColumnChain({
    column,
    columns: templateContext.columns.filter((item) => String(item.column_type || '') === 'single' && String(item.model_code || '') !== 'corporation'),
    type: 'content',
    urlBuilder: (columnItem) => buildLegacyColumnUrl(columnItem, templateContext.publicSections, templateContext.site)
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
      columnChain,
      columnType: 'content',
      columnUrl: url
    }),
    siteColumns: buildTemplateContextSiteColumns(templateContext, {
      activeColumnId: normalizeInteger(column.id, 0)
    }),
    title: column.name || '',
    pageData: columnPageData,
    templateData: pageContent?.template_data || null,
    templateDataJson: pageContent?.template_data_json || null,
    currentColumnPageData: columnPageData,
    currentColumnHeroImage: columnPageData?.mastheadImage || columnPageData?.heroImage || columnPrimaryImage,
    contentHtml: normalizeLegacyBodyHtml(pageContent?.content_html, templateContext.site, { fallbackAlt: column.name }) || '',
    bodyHtml: normalizeLegacyBodyHtml(pageContent?.content_html, templateContext.site, { fallbackAlt: column.name }) || '',
    itemDescription: pageContent?.seo_description || '',
    description: pageContent?.seo_description || '',
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || buildSectionSeoTitle(column.name, templateContext.site),
      description: pageContent?.seo_description || pageContent?.summary || columnPageData?.summary || templateContext.site.seo_default_description || column.name || '',
      url,
      image: columnPageData?.mastheadImage || columnPageData?.heroImage || columnPrimaryImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url })
  };
}

function buildLegacySectionRootPageProps({ templateContext, section, allItems, columnBuckets, columnList }) {
  const sectionUrl = `/${String(section?.dirName || '').trim().replace(/^\/+|\/+$/g, '')}/`;
  const rootColumn = section?.rootColumn || null;
  const pageContent = resolveDedicatedColumnPageContent(rootColumn, templateContext.languageCode);
  const rootPageData = normalizeLegacyColumnPageData(rootColumn?.template_data, templateContext.site);
  const rootColumnPrimaryImage = getPrimaryTemplateImage(rootColumn);
  const topLevelColumns = Array.isArray(columnList) ? columnList : getSectionTopLevelCategories(templateContext, section);
  const buckets = columnBuckets instanceof Map ? columnBuckets : groupBy(allItems || [], (item) => normalizeInteger(item.column_id, 0));
  const directRootItems = (buckets.get(normalizeInteger(section?.rootColumnId, 0)) || []).slice().sort(compareByCreatedDesc);
  const generatedPageData = buildLegacySectionRootPageData({
    templateContext,
    section,
    topLevelColumns,
    directRootItems,
    columnBuckets: buckets
  });
  const pageData = {
    ...(rootPageData || {}),
    ...generatedPageData,
    cards: Array.isArray(rootPageData?.cards) && rootPageData.cards.length > 0 ? rootPageData.cards : generatedPageData.cards,
    sections: Array.isArray(rootPageData?.sections) && rootPageData.sections.length > 0 ? rootPageData.sections : generatedPageData.sections
  };
  const pageTitle = pageData?.title || rootColumn?.name || section?.sectionLabel || '';
  const pageSummary = pageContent?.seo_description || pageContent?.summary || pageData?.summary || templateContext.site.seo_default_description || pageTitle;
  const robots = shouldNoindexEmptySectionRootList(section, Array.isArray(allItems) ? allItems.length : 0)
    ? 'noindex, follow'
    : 'index, follow';

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
      columnChain: rootColumn ? [{
        raw: rootColumn,
        type: 'section',
        url: sectionUrl
      }] : [],
      columnType: 'section',
      columnUrl: sectionUrl
    }),
    title: pageTitle,
    section: section.sectionType || 'section',
    sectionDir: section.dirName,
    sectionLabel: section.sectionLabel || pageTitle,
    pageData,
    currentColumnPageData: pageData,
    currentColumnHeroImage: pageData?.mastheadImage || pageData?.heroImage || rootColumnPrimaryImage,
    contentHtml: normalizeLegacyBodyHtml(pageContent?.content_html, templateContext.site, { fallbackAlt: pageTitle }) || '',
    bodyHtml: normalizeLegacyBodyHtml(pageContent?.content_html, templateContext.site, { fallbackAlt: pageTitle }) || '',
    itemDescription: pageContent?.seo_description || pageData?.summary || '',
    description: pageContent?.seo_description || pageData?.summary || '',
    secondaryMenuItems: buildSectionMenuItems(templateContext, section.dirName, 0),
    seoMeta: buildSeoMeta({
      title: pageContent?.seo_title || buildSectionSeoTitle(pageTitle, templateContext.site),
      description: pageSummary,
      url: sectionUrl,
      image: pageData?.mastheadImage || pageData?.heroImage || rootColumnPrimaryImage,
      robots,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: sectionUrl })
  };
}

function buildLegacyManagedColumnListPageProps({ templateContext, rootColumn = null, columnNode, parent, children, pageItems, pageNumber, pageCount, totalRecords, columnMap = null }) {
  const uiText = getLegacyUiText(templateContext);
  const columnPageContent = resolveDedicatedColumnPageContent(columnNode, templateContext.languageCode);
  const rootLevelCategories = templateContext.managedColumnCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);
  // 如果没有传入 columnMap，则创建一个
  if (!columnMap) {
    columnMap = buildManagedColumnPathMap(templateContext.managedColumnCategories, rootColumn);
  }
  const columnUrl = buildLegacyManagedColumnUrl(columnNode, columnMap, templateContext.site);
  const rootManagedColumn = rootColumn || null;
  const rootManagedColumnUrl = rootManagedColumn
    ? buildLegacyColumnUrl(rootManagedColumn, templateContext.publicSections, templateContext.site)
    : buildLegacyManagedColumnUrl(columnNode, columnMap, templateContext.site);
  const rootManagedColumnName = String(rootManagedColumn?.name || '').trim() || uiText.managedRoot;
  const rootManagedColumnPrimaryImage = getPrimaryTemplateImage(rootManagedColumn);
  const columnPrimaryImage = getPrimaryTemplateImage(columnNode);

  const columnNavigation = buildLegacyManagedColumnNavigation({
    columns: templateContext.managedColumnCategories,
    currentColumn: columnNode,
    currentParent: parent,
    fallbackColumns: rootLevelCategories.length > 0 ? rootLevelCategories : [columnNode].filter(Boolean),
    columnMap,
    site: templateContext.site
  });
  let columnPageData = normalizeLegacyColumnPageData(columnNode?.template_data, templateContext.site);

  // 修正 pageData.cards 中的子分类 URL，使用完整的层级路径
  if (columnPageData && Array.isArray(columnPageData.cards) && columnPageData.cards.length > 0) {
    // 当前栏目已经能拿到内容时，右侧主区域固定展示内容，不再回退成子栏目卡片。
    if (pageItems.length > 0) {
      columnPageData = {
        ...columnPageData,
        cards: []
      };
    } else {
      columnPageData = {
        ...columnPageData,
        cards: columnPageData.cards.map((card) => {
          // 尝试从 children 中找到匹配的分类
          const matchingChild = (children || []).find((child) =>
            card.title === child.name ||
            card.link?.includes(`/${child.id}.html`) ||
            (child.dir_name && card.link?.includes(`/${child.dir_name}`))
          );
          if (matchingChild) {
            return {
              ...card,
              href: buildLegacyManagedColumnUrl(matchingChild, columnMap, templateContext.site),
              link: buildLegacyManagedColumnUrl(matchingChild, columnMap, templateContext.site)
            };
          }
          return card;
        })
      };
    }
  }

  // 修正 pageData.models 中的内容 URL，使用完整的层级路径并添加尾部斜杠
  if (columnPageData && Array.isArray(columnPageData.models) && columnPageData.models.length > 0) {
    // 如果 pageItems 中已经有内容，清空 models 避免重复显示
    // models 的作用是为那些只有 page_data 但没有实际内容的分类提供内容
    if (pageItems.length > 0) {
      columnPageData = {
        ...columnPageData,
        models: []
      };
    } else {
      // 如果没有实际内容，则修正 models 中的 URL
      columnPageData = {
        ...columnPageData,
        models: columnPageData.models.map((model) => {
          // 尝试从 pageItems 中找到匹配的内容
          const matchingManagedItem = pageItems.find((contentItem) =>
            model.title === contentItem.name ||
            (contentItem.slug && model.link?.includes(`/${contentItem.slug}`))
          );
          if (matchingManagedItem) {
            return {
              ...model,
              href: buildSiteScopedManagedContentUrl(matchingManagedItem, templateContext.site),
              link: buildSiteScopedManagedContentUrl(matchingManagedItem, templateContext.site),
              url: buildSiteScopedManagedContentUrl(matchingManagedItem, templateContext.site)
            };
          }
          return model;
        })
      };
    }
  }

  const normalizedColumnBodyHtml = normalizeLegacyBodyHtml(columnPageContent?.content_html, templateContext.site, { fallbackAlt: columnNode.name }) || '';
  const enrichedColumnBody = buildLegacyContentSectionNavigation(normalizedColumnBodyHtml);
  const columnHeroImage = columnPageData?.mastheadImage
    || columnPageData?.heroImage
    || columnPrimaryImage
    || rootManagedColumnPrimaryImage;

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'column-list',
      title: columnNode.name || '',
      url: columnUrl,
      section: { type: 'managed-column', name: rootManagedColumnName, url: rootManagedColumnUrl },
      columnChain: prependTemplateColumnChainRoot(
        buildTemplateColumnChain({
          column: columnNode,
          columns: templateContext.managedColumnCategories,
          type: 'managed-column',
          urlBuilder: (item) => buildLegacyManagedColumnUrl(item, columnMap, templateContext.site)
        }),
        rootManagedColumn,
        {
          type: 'managed-column-root',
          url: rootManagedColumnUrl
        }
      ),
      columnType: 'managed-column',
      columnUrl,
      parentColumn: parent,
      parentColumnType: 'managed-column',
      parentColumnUrl: parent ? buildLegacyManagedColumnUrl(parent, columnMap, templateContext.site) : ''
    }),
    smallName: columnNode.name || '',
    bigId: normalizeInteger(parent?.id, columnNode.id),
    bigName: parent?.name || columnNode.name || '',
    collectionCategoryHtml: buildLegacyManagedColumnSmallCategories(rootLevelCategories.length > 0 ? rootLevelCategories : [columnNode], templateContext.site),
    secondaryMenuItems: columnNavigation.items,
    secondaryMenuTitle: columnNavigation.title,
    secondaryMenuParentUrl: columnNavigation.parentUrl,
    currentColumnDescription: normalizeRenderableLegacyText(columnPageContent?.seo_description),
    currentColumnPageData: columnPageData,
    currentColumnHeroImage: columnHeroImage,
    pageData: columnPageData,
    bodyHtml: enrichedColumnBody.html,
    sectionNavItems: enrichedColumnBody.items,
    items: buildLegacyManagedColumnListItems(pageItems, templateContext.site),
    managedCardItems: pageItems.map((item) => ({
      id: normalizeInteger(item.id, 0),
      name: item.name || '',
      title: item.name || '',
      url: buildSiteScopedManagedContentUrl(item, templateContext.site),
      image: normalizeUploadedRelativePath(String(item.primary_image || '').trim()),
      summary: item.summary || '',
      code: item.code || ''
    })),
    ...buildLegacyManagedColumnPager(columnUrl, pageNumber, pageCount, totalRecords, templateContext),
    seoMeta: buildSeoMeta({
      title: columnPageContent?.seo_title || buildSectionSeoTitle(columnNode.name || uiText.managedRoot, templateContext.site),
      description: columnPageContent?.seo_description || columnPageContent?.summary || templateContext.site.seo_default_description || columnNode.name || '',
      url: columnUrl,
      image: columnHeroImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: columnUrl })
  };
}

function buildLegacyManagedColumnDetailPageProps({ templateContext, rootColumn = null, managedItem, relatedManagedItems, columnNode, parent }) {
  const uiText = getLegacyUiText(templateContext);
  const rootLevelCategories = templateContext.managedColumnCategories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);

  // 构建 columnMap 用于生成完整的栏目目录 URL
  const columnMap = buildManagedColumnPathMap(templateContext.managedColumnCategories, rootColumn);
  const rootManagedColumn = rootColumn || null;
  const rootManagedColumnUrl = rootManagedColumn
    ? buildLegacyColumnUrl(rootManagedColumn, templateContext.publicSections, templateContext.site)
    : buildLegacyManagedColumnUrl(columnNode, columnMap, templateContext.site);
  const rootManagedColumnName = String(rootManagedColumn?.name || '').trim() || uiText.managedRoot;
  const rootManagedColumnPathPrefix = String(rootManagedColumnUrl || '').trim();

  const columnNavigation = buildLegacyManagedColumnNavigation({
    columns: templateContext.managedColumnCategories,
    currentColumn: columnNode,
    currentParent: parent,
    fallbackColumns: rootLevelCategories.length > 0 ? rootLevelCategories : [columnNode].filter(Boolean),
    columnMap,
    site: templateContext.site
  });
  const normalizedBodyHtml = normalizeLegacyBodyHtml(managedItem.content_html, templateContext.site, { fallbackAlt: managedItem.name }) || '';
  const enrichedBody = buildLegacyContentSectionNavigation(normalizedBodyHtml);
  const contentImages = normalizeManagedContentImages(managedItem);
  const columnPageData = normalizeLegacyColumnPageData(columnNode?.template_data, templateContext.site);
  let managedContentPageData = normalizeLegacyColumnPageData(managedItem?.template_data, templateContext.site);
  const attachmentDownloads = buildProductAttachmentDownloads({
    entryId: managedItem.id,
    languageCode: templateContext.languageCode,
    site: templateContext.site
  });
  managedContentPageData = {
    ...(managedContentPageData || {}),
    downloads: attachmentDownloads
  };
  const sharedSpecOptions = buildSharedSpecOptions(managedItem?.spec_options);

  if (sharedSpecOptions.length > 0) {
    managedContentPageData = {
      ...(managedContentPageData || {}),
      topPanel: {
        ...((managedContentPageData?.topPanel && typeof managedContentPageData.topPanel === 'object') ? managedContentPageData.topPanel : {}),
        specOptions: sharedSpecOptions
      }
    };
  }

  const managedContentUrl = buildSiteScopedManagedContentUrl(managedItem, templateContext.site);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'content-detail',
      title: managedItem.name || '',
      url: managedContentUrl,
      section: { type: 'managed-column', name: rootManagedColumnName, url: rootManagedColumnUrl },
      columnChain: prependTemplateColumnChainRoot(
        buildTemplateColumnChain({
          column: columnNode,
          columns: templateContext.managedColumnCategories,
          type: 'managed-column',
          urlBuilder: (item) => buildLegacyManagedColumnUrl(item, columnMap, templateContext.site)
        }),
        rootManagedColumn,
        {
          type: 'managed-column-root',
          url: rootManagedColumnUrl
        }
      ),
      columnType: 'managed-column',
      columnUrl: columnNode ? buildLegacyManagedColumnUrl(columnNode, columnMap, templateContext.site) : '',
      parentColumn: parent,
      parentColumnType: 'managed-column',
      parentColumnUrl: parent ? buildLegacyManagedColumnUrl(parent, columnMap, templateContext.site) : '',
      content: managedItem,
      contentType: 'structured-content',
      contentUrl: managedContentUrl
    }),
    title: managedItem.name || '',
    itemDescription: managedItem.summary || '',
    image: normalizeUploadedRelativePath(String(managedItem.primary_image || '').trim()),
    code: managedItem.code || '',
    relatedItemsHtml: buildLegacyRelatedManagedItems(relatedManagedItems, templateContext),
    bodyHtml: enrichedBody.html,
    currentManagedItem: {
      id: normalizeInteger(managedItem.id, 0),
      name: managedItem.name || '',
      code: managedItem.code || '',
      summary: managedItem.summary || '',
      primaryImage: normalizeUploadedRelativePath(String(managedItem.primary_image || '').trim()),
      images: contentImages,
      bodyHtml: enrichedBody.html,
      pageData: managedContentPageData,
      topPanel: managedContentPageData?.topPanel || null,
      url: managedContentUrl
    },
    relatedManagedItems: relatedManagedItems.map((item) => ({
      id: item.id,
      name: item.name || '',
      url: buildSiteScopedManagedContentUrl(item, templateContext.site),
      image: normalizeUploadedRelativePath(String(item.primary_image || '').trim()),
      summary: item.summary || ''
    })),
    secondaryMenuItems: columnNavigation.items,
    secondaryMenuTitle: columnNavigation.title,
    secondaryMenuParentUrl: columnNavigation.parentUrl,
    sectionNavItems: enrichedBody.items,
    currentColumnPageData: columnPageData,
    currentManagedItemPageData: managedContentPageData,
    seoMeta: buildStructuredContentSeoMeta(managedItem, templateContext.site, { url: managedContentUrl }),
    jsonLd: buildJsonLdStructuredContent(managedItem, templateContext.site, { url: managedContentUrl }),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: managedContentUrl })
  };
}

function buildProductAttachmentDownloads({ entryId, languageCode, site }) {
  const requestedLanguageCode = String(languageCode || '').trim();
  const attachmentPaths = loadProductAttachmentPaths(entryId, requestedLanguageCode);
  const englishAttachmentPaths = requestedLanguageCode.toLowerCase() === 'en'
    ? []
    : loadProductAttachmentPaths(entryId, 'en');
  if (attachmentPaths.length === 0 && englishAttachmentPaths.length === 0) return [];

  const assetByPath = getProductPdfAssetMap();
  const resolvedAttachmentPaths = resolveProductAttachmentPathsByType({
    attachmentPaths,
    englishAttachmentPaths,
    assetByPath
  });
  const groupedEntries = new Map();

  for (const relativePath of resolvedAttachmentPaths) {
    const asset = assetByPath.get(relativePath);
    if (!asset) continue;
    const groupType = getProductPdfType(asset);
    if (!groupedEntries.has(groupType)) groupedEntries.set(groupType, []);
    groupedEntries.get(groupType).push({
      name: String(asset.pdf_title || asset.original_name || relativePath).trim(),
      reference: String(asset.pdf_document_code || '').trim() || '-',
      language: String(asset.language_name || asset.language_code || '').trim() || '-',
      href: relativePath
    });
  }

  return Array.from(groupedEntries.entries())
    .map(([groupType, entries]) => {
      const asset = assetByPath.get(entries[0]?.href);
      return {
        title: resolveMediaCategoryName(asset, requestedLanguageCode),
        entries,
        sortOrder: normalizeInteger(asset?.category_sort_order, 0),
        groupType
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder || left.groupType.localeCompare(right.groupType))
    .map(({ title, entries }) => ({ title, entries }));
}

function resolveProductAttachmentPathsByType({ attachmentPaths, englishAttachmentPaths, assetByPath }) {
  const localPaths = uniqueKnownProductPdfPaths(attachmentPaths, assetByPath);
  const localTypes = new Set(localPaths.map((relativePath) => getProductPdfType(assetByPath.get(relativePath))));
  const fallbackPaths = uniqueKnownProductPdfPaths(englishAttachmentPaths, assetByPath)
    .filter((relativePath) => !localTypes.has(getProductPdfType(assetByPath.get(relativePath))));
  return [...localPaths, ...fallbackPaths];
}

function uniqueKnownProductPdfPaths(paths, assetByPath) {
  return Array.from(new Set((Array.isArray(paths) ? paths : [])
    .map((item) => String(item || '').trim())
    .filter((relativePath) => relativePath && assetByPath.has(relativePath))));
}

function getProductPdfType(asset) {
  return String(asset?.category_code || asset?.pdf_document_type || 'other_documents').trim() || 'other_documents';
}

function resolveMediaCategoryName(asset, languageCode) {
  const translations = asset?.category_translations || {};
  const requestedCode = String(languageCode || '').trim().toLowerCase();
  const requestedName = Object.entries(translations)
    .find(([code]) => String(code).toLowerCase() === requestedCode)?.[1];
  const englishName = Object.entries(translations)
    .find(([code]) => String(code).toLowerCase() === 'en')?.[1];
  return String(requestedName || englishName || asset?.category_code || 'Documents').trim();
}

function loadProductAttachmentPaths(entryId, languageCode) {
  const row = queryAll(
    `SELECT t.attachments_json
     FROM content_product_translations t
     JOIN languages l ON l.id = t.language_id
     WHERE t.entry_id = ? AND lower(l.code) = lower(?)
     LIMIT 1`,
    [normalizeInteger(entryId, 0), String(languageCode || '').trim()]
  )[0];
  if (!row?.attachments_json) return [];
  try {
    const parsed = JSON.parse(row.attachments_json);
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map((item) => String(item || '').trim()).filter(Boolean)))
      : [];
  } catch {
    return [];
  }
}

function getProductPdfAssetMap() {
  if (productPdfAssetCache) return productPdfAssetCache;
  ensureMediaAssetsSchema();
  const assets = queryAll(
    `SELECT
       m.relative_path,
       m.original_name,
       m.category_id,
       m.pdf_document_type,
       m.pdf_title,
       m.pdf_document_code,
       c.code AS category_code,
       c.sort_order AS category_sort_order,
       l.code AS language_code,
       COALESCE(NULLIF(l.native_name, ''), NULLIF(l.name, ''), l.code) AS language_name
     FROM media_assets m
     LEFT JOIN languages l ON l.id = m.language_id
     LEFT JOIN media_categories c ON c.id = m.category_id
     WHERE m.purpose = 'pdf_document'`
  );
  const translationsByCategory = new Map();
  for (const translation of queryAll(`
    SELECT t.category_id, l.code AS language_code, t.name
    FROM media_category_translations t
    JOIN languages l ON l.id = t.language_id
  `)) {
    const categoryId = Number(translation.category_id);
    if (!translationsByCategory.has(categoryId)) translationsByCategory.set(categoryId, {});
    translationsByCategory.get(categoryId)[translation.language_code] = translation.name;
  }
  productPdfAssetCache = new Map(assets.map((asset) => [String(asset.relative_path), {
    ...asset,
    category_translations: translationsByCategory.get(Number(asset.category_id)) || {}
  }]));
  return productPdfAssetCache;
}

function buildLegacySectionContentListPageProps({
  templateContext,
  section,
  columnNode,
  pageItems,
  pageNumber,
  pageCount,
  totalRecords,
  pageSize = DEFAULT_NEWS_LIST_PAGE_SIZE,
  summaryClassName
}) {
  const uiText = getLegacyUiText(templateContext);
  const resolvedSectionConfig = typeof section === 'object' && section
    ? section
    : templateContext.publicSections.getSectionByType(String(section || '').trim().toLowerCase())
      || { dirName: 'news', sectionLabel: uiText.newsSection, sectionType: 'news' };
  const sectionDir = resolvedSectionConfig.dirName;
  const sectionLabel = resolvedSectionConfig.sectionLabel;
  const sectionPrimaryImage = getPrimaryTemplateImage(resolvedSectionConfig.rootColumn);
  const columnPageData = normalizeLegacyColumnPageData(columnNode?.template_data, templateContext.site);
  const columnPrimaryImage = getPrimaryTemplateImage(columnNode);
  const columnHeroImage = columnPageData?.mastheadImage
    || columnPageData?.heroImage
    || columnPrimaryImage
    || sectionPrimaryImage;
  const columnSummary = columnPageData?.hero?.summary
    || columnPageData?.summary
    || columnNode?.summary
    || columnNode?.seo_description
    || resolvedSectionConfig.rootColumn?.summary
    || resolvedSectionConfig.rootColumn?.seo_description
    || '';
  const columnUrl = buildSiteScopedSectionCategoryUrl(sectionDir, columnNode, templateContext.site);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-list',
      title: columnNode?.name || '',
      url: columnUrl,
      section: {
        id: normalizeInteger(resolvedSectionConfig.rootColumn?.id, 0),
        type: resolvedSectionConfig.sectionType || 'section',
        name: sectionLabel,
        url: `/${sectionDir}/`,
        images: Array.isArray(resolvedSectionConfig.rootColumn?.images) ? resolvedSectionConfig.rootColumn.images : [],
        image: columnHeroImage,
        seoDescription: columnSummary,
        description: columnSummary
      },
      columnChain: buildTemplateColumnChain({
        column: columnNode,
        columns: templateContext.sectionCategories,
        type: 'section',
        urlBuilder: (columnItem) => buildSiteScopedSectionCategoryUrl(sectionDir, columnItem, templateContext.site)
      }),
      columnType: 'section',
      columnUrl
    }),
    section: resolvedSectionConfig.sectionType || 'section',
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildSectionCategoryListHtml(templateContext, sectionDir),
    secondaryMenuItems: buildSectionMenuItems(templateContext, sectionDir, normalizeInteger(columnNode?.id, 0)),
    secondaryMenuTitle: resolvedSectionConfig.rootColumn?.name || sectionLabel || uiText.categoryDirectory,
    secondaryMenuParentUrl: prefixSitePathForContext(`/${sectionDir}/`, templateContext.site, { allowApi: false, allowAssets: false }),
    currentSectionHeroImage: sectionPrimaryImage,
    currentColumnDescription: normalizeRenderableLegacyText(columnSummary),
    currentColumnPageData: columnPageData,
    currentColumnHeroImage: columnHeroImage,
    columnId: resolveLegacyColumnPublicId(columnNode),
    title: columnNode?.name || '',
    items: buildLegacySectionContentListItems({
      pageItems,
      summaryClassName,
      column: columnNode
    }),
    articleCardItems: pageItems.map((item) => ({
      id: item.id,
      title: item.name || '',
      url: prefixSitePathForContext(buildContentDetailUrlFromColumn(item, columnNode), templateContext.site, { allowApi: false, allowAssets: false }),
      image: resolveLegacyContentPreviewImage(item),
      summary: resolveRenderableContentSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    })),
    ...buildLegacySectionContentPager({
      columnUrl,
      pageNumber,
      pageCount,
      totalRecords,
      pageSize,
      templateContext
    }),
    listTotalRecords: totalRecords,
    seoMeta: buildSeoMeta({
      title: columnNode?.seo_title || buildSectionSeoTitle(columnNode?.name || sectionLabel, templateContext.site),
      description: columnNode?.seo_description || templateContext.site.seo_default_description || columnNode?.name || sectionLabel,
      url: columnUrl,
      image: sectionPrimaryImage,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: columnUrl })
  };
}

function buildLegacySectionContentDetailPageProps({ templateContext, section, sectionConfig = null, item, columnNode, previous, next }) {
  const uiText = getLegacyUiText(templateContext);
  const resolvedSectionConfig = sectionConfig
    || (typeof section === 'object' && section)
    || templateContext.publicSections.getSectionByType(String(section || '').trim().toLowerCase())
    || { dirName: 'news', sectionLabel: uiText.newsSection, sectionType: 'news', rootColumn: null };
  const sectionDir = resolvedSectionConfig.dirName;
  const sectionLabel = resolvedSectionConfig.sectionLabel;
  const sectionPrimaryImage = getPrimaryTemplateImage(resolvedSectionConfig.rootColumn);
  const articleUrl = resolvedSectionConfig.rootColumn
    ? buildSiteScopedArticleUrl(item, templateContext, resolvedSectionConfig)
    : prefixSitePathForContext(`/news/detail/${normalizeInteger(item.id, 0)}.html`, templateContext.site, { allowApi: false, allowAssets: false });
  const sectionUrl = prefixSitePathForContext(`/${sectionDir}/`, templateContext.site, { allowApi: false, allowAssets: false });
  const relatedArticles = getSectionEntries(templateContext, resolvedSectionConfig)
    .filter((entry) => normalizeInteger(entry.column_id, 0) === normalizeInteger(item.column_id, 0) && normalizeInteger(entry.id, 0) !== normalizeInteger(item.id, 0))
    .slice(0, 3);
  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-detail',
      title: item.name || '',
      url: articleUrl,
      section: {
        id: normalizeInteger(resolvedSectionConfig.rootColumn?.id, 0),
        type: resolvedSectionConfig.sectionType || 'section',
        name: sectionLabel,
        url: sectionUrl,
        images: Array.isArray(resolvedSectionConfig.rootColumn?.images) ? resolvedSectionConfig.rootColumn.images : [],
        image: sectionPrimaryImage,
        seoDescription: resolvedSectionConfig.rootColumn?.seo_description || '',
        description: resolvedSectionConfig.rootColumn?.seo_description || resolvedSectionConfig.rootColumn?.summary || ''
      },
      columnChain: buildTemplateColumnChain({
        column: columnNode,
        columns: templateContext.sectionCategories,
        type: 'section',
        urlBuilder: (columnItem) => buildSiteScopedSectionCategoryUrl(sectionDir, columnItem, templateContext.site)
      }),
      columnType: 'section',
      columnUrl: columnNode ? buildSiteScopedSectionCategoryUrl(sectionDir, columnNode, templateContext.site) : '',
      content: item,
      contentType: 'structured-content',
      contentUrl: articleUrl
    }),
    section: resolvedSectionConfig.sectionType || 'section',
    sectionDir,
    sectionLabel,
    sectionCategoryHtml: buildSectionCategoryListHtml(templateContext, sectionDir),
    secondaryMenuItems: buildSectionMenuItems(templateContext, sectionDir, normalizeInteger(columnNode?.id, 0)),
    currentSectionHeroImage: sectionPrimaryImage,
    title: item.name || '',
    itemDescription: resolveRenderableContentSummary(item) || '',
    columnId: normalizeInteger(item.column_id, 0),
    columnName: columnNode?.name || '',
    bodyHtml: normalizeLegacyBodyHtml(item.content_html, templateContext.site, { fallbackAlt: item.name }) || '',
    currentArticle: {
      ...item,
      id: normalizeInteger(item.id, 0),
      title: item.name || '',
      summary: resolveRenderableContentSummary(item),
      bodyHtml: normalizeLegacyBodyHtml(item.content_html, templateContext.site, { fallbackAlt: item.name }) || '',
      image: resolveLegacyContentPreviewImage(item),
      date: formatLegacyDateOnly(item.created_at),
      url: articleUrl
    },
    relatedArticleItems: relatedArticles.map((entry) => ({
      id: entry.id,
      title: entry.name || '',
      url: resolvedSectionConfig.rootColumn
        ? prefixSitePathForContext(buildContentDetailUrlFromColumn(entry, resolvedSectionConfig.rootColumn), templateContext.site, { allowApi: false, allowAssets: false })
        : prefixSitePathForContext(`/news/detail/${normalizeInteger(entry.id, 0)}.html`, templateContext.site, { allowApi: false, allowAssets: false }),
      image: resolveLegacyContentPreviewImage(entry),
      summary: resolveRenderableContentSummary(entry),
      date: formatLegacyDateOnly(entry.created_at)
    })),
    previousHtml: previous ? `<a href="${previous.id}.html" class="Font_2e4690_a ">${escapeHtml(previous.name || '')}</a>` : `<span class="Font_2e4690_a">${escapeHtml(uiText.noPreviousArticle)}</span>`,
    nextHtml: next ? `<a href="${next.id}.html" class="Font_2e4690_a ">${escapeHtml(next.name || '')}</a>` : `<span class="Font_2e4690_a">${escapeHtml(uiText.noNextArticle)}</span>`,
    seoMeta: buildSectionEntrySeoMeta(item, templateContext.site, { url: articleUrl }),
    jsonLd: buildJsonLdSectionEntry(item, templateContext.site, { url: articleUrl }),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: articleUrl })
  };
}

function buildLegacyPageContextProps({
  pageType,
  title,
  url,
  section,
  columnChain,
  columnType,
  columnUrl,
  parentColumn,
  parentColumnType,
  parentColumnUrl,
  content,
  contentType,
  contentUrl
}) {
  return {
    currentPage: {
      type: pageType || '',
      title: title || '',
      url: url || ''
    },
    currentSection: normalizeTemplateSection(section),
    currentColumn: normalizeTemplateColumnChain(columnChain),
    currentColumnItem: getCurrentTemplateColumnItem(columnChain),
    parentColumn: normalizeTemplateColumn(parentColumn, {
      type: parentColumnType,
      url: parentColumnUrl
    }),
    currentContent: normalizeTemplateContent(content, {
      type: contentType,
      url: contentUrl
    })
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
    description: section.description || section.summary || '',
    template_data: section.template_data || null,
    templateData: section.template_data || null
  };
}

function normalizeTemplateColumn(columnNode, options = {}) {
  if (!columnNode) {
    return null;
  }
  const images = Array.isArray(columnNode.images)
    ? columnNode.images.filter((item) => typeof item === 'string' && item.trim())
    : [];
  return {
    id: normalizeInteger(columnNode.id, 0),
    type: options.type || '',
    name: columnNode.name || '',
    url: options.url || '',
    parentId: normalizeInteger(columnNode.parent_id, 0),
    parentName: options.parent?.name || '',
    images,
    seoDescription: columnNode.seo_description || '',
    template_data: columnNode.template_data || null,
    templateData: columnNode.template_data || null
  };
}

function normalizeTemplateColumnChain(chain) {
  if (!Array.isArray(chain)) {
    return [];
  }
  return chain.filter(Boolean).map((item) => normalizeTemplateColumn(item.raw || item, item));
}

function getCurrentTemplateColumnItem(chain) {
  const normalizedChain = normalizeTemplateColumnChain(chain);
  return normalizedChain.at(-1) || null;
}

function buildTemplateColumnChain({ column, columns, type, urlBuilder }) {
  if (!column) {
    return [];
  }

  const columnMap = new Map((columns || []).map((item) => [normalizeInteger(item.id, 0), item]));
  const chain = [];
  const visited = new Set();
  let current = column;

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
    current = columnMap.get(parentId) || null;
  }

  return chain;
}

function prependTemplateColumnChainRoot(chain, rootColumn, { type = '', url = '' } = {}) {
  const normalizedRootId = normalizeInteger(rootColumn?.id, 0);
  if (!normalizedRootId) {
    return Array.isArray(chain) ? chain : [];
  }

  const nextChain = Array.isArray(chain) ? chain.slice() : [];
  const firstId = normalizeInteger(nextChain[0]?.raw?.id ?? nextChain[0]?.id, 0);
  if (firstId === normalizedRootId) {
    if (nextChain[0]?.raw) {
      nextChain[0] = {
        ...nextChain[0],
        type: nextChain[0].type || type,
        url: nextChain[0].url || url
      };
    }
    return nextChain;
  }

  return [
    {
      raw: rootColumn,
      type,
      url
    },
    ...nextChain
  ];
}

function normalizeTemplateContent(content, options = {}) {
  if (!content) {
    return null;
  }
  const name = content.name || '';
  return {
    id: normalizeInteger(content.id, 0),
    type: options.type || '',
    name,
    url: options.url || '',
    template_data: content.template_data || null,
    templateData: content.template_data || null
  };
}

function buildSectionSeoTitle(title, site) {
  const normalizedTitle = String(title || '').trim();
  const siteTitleBase = String(site?.company_name || site?.web_name || '').trim();
  if (!normalizedTitle) {
    return siteTitleBase;
  }
  if (!siteTitleBase || normalizedTitle === siteTitleBase) {
    return normalizedTitle;
  }
  return `${normalizedTitle} | ${siteTitleBase}`;
}

function buildLegacyManagedColumnUrl(columnNode, columnMap = null, site = null) {
  return prefixSitePathForContext(buildManagedColumnPublicUrl(columnNode, columnMap), site, {
    allowApi: false,
    allowAssets: false
  });
}

function normalizeLegacyTemplateMarkup(value, site) {
  return String(value || '')
    .replace(/\baction=(["'])\/(?:Search|search)(?:\.asp(?:\?action=search)?)?\1/gi, 'action="#" data-search-open-form="true"')
    .replace(/\bhref=(["'])\/(?:Search|search)(?:\.asp(?:\?action=search)?)?\1/gi, 'href="#" data-search-open="true"');
}

function buildLegacyManagedColumnMenu(categories, site = null, rootColumn = null) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  const columnMap = buildManagedColumnPathMap(categories, rootColumn);
  return `<table width="100%" border="0" align="center" cellpadding="0" cellspacing="0">${roots.map((item) => `<li><a href="${escapeHtml(buildLegacyManagedColumnUrl(item, columnMap, site))}"><span>${escapeHtml(item.name || '')}</span></a></li>`).join('')}</table>`;
}

function buildLegacyManagedColumnMenuCompact(categories, site = null, rootColumn = null) {
  const roots = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0 && normalizeInteger(item.id, 0) !== 0);
  const columnMap = buildManagedColumnPathMap(categories, rootColumn);
  return roots.map((item, index) => `${index > 0 ? '&nbsp;' : ''}<a href="${escapeHtml(buildLegacyManagedColumnUrl(item, columnMap, site))}">${escapeHtml(item.name || '')}</a> |`).join('');
}

function buildLegacyAboutCategoryList(categories, site = null) {
  const items = categories.filter((item) => normalizeInteger(item.parent_id, 0) === 0);
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    const href = prefixSitePathForContext(`/about/about-${item.id}.html`, site, { allowApi: false, allowAssets: false });
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="${escapeHtml(href)}" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildLegacyCorporationMenuItems(categories, activeId = 0, site = null) {
  return categories
    .filter((item) => normalizeInteger(item.parent_id, 0) === 0)
    .map((item) => ({
      label: item.name || '',
      url: prefixSitePathForContext(`/about/about-${normalizeInteger(item.id, 0)}.html`, site, { allowApi: false, allowAssets: false }),
      active: normalizeInteger(item.id, 0) === normalizeInteger(activeId, 0)
    }));
}

function buildSectionCategoryListHtml(templateContext, dirName) {
  const section = templateContext.publicSections.getSectionByDirName(dirName);
  const items = section
    ? getSectionTopLevelCategories(templateContext, section)
    : [];
  let html = '<table width="80%" border="0" align="center" cellpadding="0" cellspacing="0">';
  items.forEach((item, index) => {
    const isLast = index === items.length - 1;
    html += '<tr>';
    html += `<td width="15%" height="25" align="center"${isLast ? '' : ' class="p1"'}><img src="/Skin/blue/Images/Co_left_ico.gif" width="15" height="13" /></td>`;
    html += `<td width="85%"${isLast ? '' : ' class="p1"'}>&nbsp;<a href="${buildSiteScopedSectionCategoryUrl(dirName, item, templateContext.site)}" class="0a">${escapeHtml(item.name || '')}</a></td>`;
    html += '</tr>';
  });
  html += '</table>';
  return html;
}

function buildSectionMenuItems(templateContext, dirName, activeId = 0) {
  const section = templateContext.publicSections.getSectionByDirName(dirName);
  if (!section) {
    return [];
  }
  return getSectionTopLevelCategories(templateContext, section).map((item) => ({
      label: item.name || '',
      url: buildSiteScopedSectionCategoryUrl(dirName, item, templateContext.site),
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
  topLevelColumns,
  directRootItems,
  columnBuckets
}) {
  const rootColumn = section?.rootColumn || null;
  const existing = normalizeLegacyColumnPageData(rootColumn?.template_data, templateContext.site) || {};
  const safeColumnBuckets = columnBuckets instanceof Map ? columnBuckets : new Map();
  const generatedCards = (directRootItems || []).map((item) => ({
    title: item.name || '',
    description: resolveRenderableContentSummary(item),
      href: buildSiteScopedArticleUrl(item, templateContext, section),
    image: resolveLegacyContentPreviewImage(item),
    imageAlt: item.name || '',
    cta: ''
  }));
  const generatedSections = (topLevelColumns || []).map((columnNode) => {
    const columnLinks = buildLegacySectionRootColumnLinks({
      templateContext,
      section,
      columnNode,
      columnBuckets: safeColumnBuckets
    });
    return {
      title: columnNode.name || '',
      description: columnNode.seo_description || columnNode.summary || '',
      links: columnLinks
    };
  }).filter((item) => Array.isArray(item.links) && item.links.length > 0);
  const generatedColumnCards = (topLevelColumns || []).map((columnNode) => ({
    title: columnNode.name || '',
    description: columnNode.seo_description || columnNode.summary || '',
    href: buildSiteScopedSectionCategoryUrl(section.dirName, columnNode, templateContext.site),
    image: '',
    imageAlt: columnNode.name || '',
    cta: ''
  }));

  return {
    ...existing,
    cards: generatedCards.length > 0 ? generatedCards : generatedColumnCards,
    sections: generatedSections,
    summary: existing.summary || rootColumn?.summary || section?.sectionLabel || '',
    introBlock: existing.introBlock || (
      rootColumn?.summary
        ? { body: rootColumn.summary }
        : null
    )
  };
}

function buildLegacySectionRootListPageProps({
  templateContext,
  section,
  pageItems,
  pageNumber,
  pageCount,
  totalRecords,
  pageSize = DEFAULT_NEWS_LIST_PAGE_SIZE,
  summaryClassName
}) {
  const uiText = getLegacyUiText(templateContext);
  const rootColumn = section?.rootColumn || null;
  const sectionDir = String(section?.dirName || '').trim();
  const sectionUrl = prefixSitePathForContext(`/${sectionDir.replace(/^\/+|\/+$/g, '')}/`, templateContext.site, { allowApi: false, allowAssets: false });
  const rootPageData = normalizeLegacyColumnPageData(rootColumn?.template_data, templateContext.site);
  const rootPrimaryImage = getPrimaryTemplateImage(rootColumn);
  const rootHeroImage = rootPageData?.mastheadImage
    || rootPageData?.heroImage
    || rootPrimaryImage;
  const rootSummary = rootPageData?.hero?.summary
    || rootPageData?.summary
    || rootColumn?.summary
    || rootColumn?.seo_description
    || '';
  const pageTitle = rootPageData?.title || rootColumn?.name || section?.sectionLabel || '';
  const robots = shouldNoindexEmptySectionRootList(section, totalRecords)
    ? 'noindex, follow'
    : 'index, follow';

  return {
    ...buildLegacyCommonProps(templateContext),
    ...buildLegacyPageContextProps({
      pageType: 'section-root-list',
      title: pageTitle,
      url: sectionUrl,
      section: {
        id: normalizeInteger(rootColumn?.id, 0),
        type: section.sectionType || 'section',
        name: section.sectionLabel || pageTitle,
        url: sectionUrl,
        images: Array.isArray(rootColumn?.images) ? rootColumn.images : [],
        image: rootHeroImage,
        seoDescription: rootSummary,
        description: rootSummary
      },
      columnChain: rootColumn ? [{
        raw: rootColumn,
        type: 'section',
        url: sectionUrl
      }] : [],
      columnType: 'section',
      columnUrl: sectionUrl
    }),
    section: section.sectionType || 'section',
    sectionDir,
    sectionLabel: section.sectionLabel || pageTitle,
    sectionCategoryHtml: buildSectionCategoryListHtml(templateContext, sectionDir),
    secondaryMenuItems: buildSectionMenuItems(templateContext, sectionDir, 0),
    secondaryMenuTitle: rootColumn?.name || section.sectionLabel || uiText.categoryDirectory,
    secondaryMenuParentUrl: sectionUrl,
    currentSectionHeroImage: rootPrimaryImage,
    currentColumnDescription: normalizeRenderableLegacyText(rootSummary),
    currentColumnPageData: rootPageData,
    currentColumnHeroImage: rootHeroImage,
    columnId: resolveLegacyColumnPublicId(rootColumn),
    title: pageTitle,
    items: buildLegacySectionContentListItems({
      pageItems,
      summaryClassName,
      column: rootColumn
    }),
    articleCardItems: pageItems.map((item) => ({
      id: item.id,
      title: item.name || '',
      url: buildSiteScopedArticleUrl(item, templateContext, section),
      image: resolveLegacyContentPreviewImage(item),
      summary: resolveRenderableContentSummary(item),
      date: formatLegacyDateOnly(item.created_at)
    })),
    ...buildLegacySectionContentPager({
      columnUrl: sectionUrl,
      pageNumber,
      pageCount,
      totalRecords,
      pageSize,
      templateContext
    }),
    listTotalRecords: totalRecords,
    itemDescription: rootSummary,
    description: rootSummary,
    seoMeta: buildSeoMeta({
      title: rootColumn?.seo_title || buildSectionSeoTitle(pageTitle, templateContext.site),
      description: rootColumn?.seo_description || rootSummary || templateContext.site.seo_default_description || pageTitle,
      url: sectionUrl,
      image: rootHeroImage,
      robots,
      site: templateContext.site
    }),
    jsonLd: buildJsonLdOrganization(templateContext.site),
    faviconLinks: generateFaviconLinks(templateContext.site),
    themeColorMetas: generateThemeColorMetas(),
    hreflangLinks: buildHreflangLinks(templateContext.site, { url: sectionUrl })
  };
}

function shouldNoindexEmptySectionRootList(section, totalRecords) {
  return Number(totalRecords || 0) <= 0;
}

function buildLegacySectionRootColumnLinks({ templateContext, section, columnNode, columnBuckets }) {
  const allowedIds = Array.from(new Set(getDescendantColumnIds(
    templateContext.publicSections.sectionTree.childrenByParentId,
    normalizeInteger(columnNode?.id, 0)
  )));
  const links = allowedIds
    .flatMap((columnId) => (columnBuckets.get(normalizeInteger(columnId, 0)) || []).slice())
    .slice()
    .sort(compareByCreatedDesc)
    .map((item) => ({
      title: item.name || '',
      href: buildSiteScopedArticleUrl(item, templateContext, section),
      description: resolveRenderableContentSummary(item)
    }));

  if (links.length > 0) {
    return links;
  }

  return [{
    title: columnNode?.name || '',
    href: buildSiteScopedSectionCategoryUrl(section.dirName, columnNode, templateContext.site),
    description: columnNode?.seo_description || columnNode?.summary || ''
  }];
}

function resolveLegacyContentPreviewImage(item) {
  const explicitImage = normalizeUploadedRelativePath(String(item?.picture || '').trim());
  if (explicitImage && !isDecorativeLegacyPreviewImage(explicitImage)) {
    return explicitImage;
  }

  const bodyHeroImage = extractFirstImageSrcFromHtml(item?.content_html || '');
  const normalizedBodyHeroImage = normalizeUploadedRelativePath(String(bodyHeroImage || '').trim());
  return isDecorativeLegacyPreviewImage(normalizedBodyHeroImage) ? '' : normalizedBodyHeroImage;
}

function extractFirstImageSrcFromHtml(html = '') {
  return String(html || '').match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] || '';
}

function isDecorativeLegacyPreviewImage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized.includes('/uploads/images/site-wide/reduced-header/')
    || normalized.includes('masthead-pattern-');
}

function compareByCreatedDesc(left, right) {
  const timeDiff = String(right?.created_at || '').localeCompare(String(left?.created_at || ''));
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return Number(right?.id || 0) - Number(left?.id || 0);
}

function buildLegacyManagedColumnSmallCategories(categories, site = null) {
  const columnMap = new Map(categories.map((item) => [normalizeInteger(item.id, 0), item]));
  let html = '<table width="95%" border="0" align="center" cellpadding="0" cellspacing="0"><tr><td><span class=abv>';
  categories.forEach((item) => {
    html += `&nbsp;【<A href="${escapeHtml(buildLegacyManagedColumnUrl(item, columnMap, site))}" class="0a">${escapeHtml(item.name || '')}</a>】`;
  });
  html += '</span></td></tr></table>';
  return html;
}

function buildLegacyManagedColumnMenuItems(columns, activeId = 0, columnMap = null, site = null) {
  return (columns || [])
    .filter(Boolean)
    .map((item) => {
      const description = resolveManagedColumnDescription(item);
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
        url: buildLegacyManagedColumnUrl(item, columnMap, site),
        active: itemId === normalizeInteger(activeId, 0),
        description,
        ctaLabel: description ? 'Explore more' : '',
        image: image || '',
        imageAlt: item.name || ''
      };
    });
}

function buildLegacyManagedColumnNavigation({ columns, currentColumn, currentParent, fallbackColumns = [], columnMap = null, site = null }) {
  const safeColumns = Array.isArray(columns) ? columns : [];
  const activeId = normalizeInteger(currentColumn?.id, 0);
  const parentId = normalizeInteger(currentColumn?.parent_id, 0);
  const directChildren = activeId > 0
    ? safeColumns
      .filter((item) => normalizeInteger(item.parent_id, 0) === activeId)
      .sort(compareCategoryOrder)
    : (Array.isArray(fallbackColumns) ? fallbackColumns.slice().sort(compareCategoryOrder) : []);
  const siblingColumns = parentId > 0
    ? safeColumns
      .filter((item) => normalizeInteger(item.parent_id, 0) === parentId)
      .sort(compareCategoryOrder)
    : [];

  if (directChildren.length > 0 || activeId === 0) {
    return {
      title: currentColumn?.name || 'Browse categories',
      parentUrl: currentColumn ? buildLegacyManagedColumnUrl(currentColumn, columnMap, site) : '',
      items: buildLegacyManagedColumnMenuItems(directChildren, activeId, columnMap, site)
    };
  }

  if (siblingColumns.length > 0) {
    return {
      title: currentParent?.name || 'Browse categories',
      parentUrl: currentParent ? buildLegacyManagedColumnUrl(currentParent, columnMap, site) : '',
      items: buildLegacyManagedColumnMenuItems(siblingColumns, activeId, columnMap, site)
    };
  }

  return {
    title: 'Browse categories',
    parentUrl: '',
    items: buildLegacyManagedColumnMenuItems(fallbackColumns, activeId, columnMap, site)
  };
}

function resolveManagedColumnDescription(columnNode) {
  const seoDescription = normalizeRenderableLegacyText(columnNode?.seo_description);
  if (seoDescription && !looksLikeLegacyMojibake(seoDescription)) {
    return truncateRenderableContentSummary(seoDescription, 96);
  }

  return '';
}

function normalizeManagedContentImages(managedItem) {
  const images = Array.isArray(managedItem?.images)
    ? managedItem.images
      .map((item) => normalizeUploadedRelativePath(String(item || '').trim()))
      .filter(Boolean)
    : [];
  const primaryImage = normalizeUploadedRelativePath(String(managedItem?.primary_image || '').trim());
  if (primaryImage && !images.includes(primaryImage)) {
    return [primaryImage, ...images];
  }
  return images.length > 0 ? images : [primaryImage].filter(Boolean);
}

function buildLegacyContentSectionNavigation(html, options = {}) {
  const rawHtml = String(html || '').trim();
  if (!rawHtml) {
    return { html: '', items: [] };
  }

  const inPageLinks = collectLegacyInPageLinks(rawHtml);
  const usedIds = new Set();
  const items = [];
  let index = 0;
  const output = rawHtml.replace(/<h([2-3])([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, level, attributes, innerHtml) => {
    const plainText = normalizeRenderableLegacyText(innerHtml.replace(/<[^>]+>/g, ' '));
    if (!plainText) {
      return match;
    }

    const existingIdMatch = String(attributes || '').match(/\sid=(["'])([^"']+)\1/i);
    let headingId = existingIdMatch?.[2]
      || resolveLegacyInPageHeadingId(plainText, inPageLinks, usedIds, options)
      || createLegacyAnchorSlug(plainText, `section-${index + 1}`);
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
    html: normalizeLegacyInPageLinkAttributes(output),
    items: items.slice(0, 12)
  };
}

function collectLegacyInPageLinks(html) {
  const links = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = anchorPattern.exec(String(html || '')))) {
    const hrefMatch = String(match[1] || '').match(/\bhref\s*=\s*(["'])#([^"']+)\1/i);
    if (!hrefMatch) {
      continue;
    }
    const id = decodeLegacyAnchorFragment(hrefMatch[2]);
    const label = normalizeRenderableLegacyText(String(match[2] || '').replace(/<[^>]+>/g, ' '));
    if (id && label) {
      links.push({ id, matchText: normalizeLegacyAnchorMatchText(label) });
    }
  }
  return links;
}

function resolveLegacyInPageHeadingId(headingText, links, usedIds, options = {}) {
  const matchText = normalizeLegacyAnchorMatchText(headingText);
  if (!matchText) {
    return '';
  }
  const matched = links.find((link) => link.matchText === matchText && !usedIds.has(link.id));
  if (matched) {
    return matched.id;
  }
  if (options.matchInPageLinksByHeadingNumber) {
    const headingNumber = Number.parseInt(String(headingText || '').match(/^\s*(\d+)\s*[.、:：-]/)?.[1] || '', 10);
    const orderedMatch = Number.isInteger(headingNumber) ? links[headingNumber] : null;
    if (orderedMatch && !usedIds.has(orderedMatch.id)) {
      return orderedMatch.id;
    }
  }
  return '';
}

function normalizeLegacyAnchorMatchText(value) {
  return normalizeRenderableLegacyText(value)
    .toLowerCase()
    .replace(/^\s*\p{N}+\s*[.、:：-]\s*/u, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

function decodeLegacyAnchorFragment(value) {
  const normalized = String(value || '').trim().replace(/&amp;/gi, '&');
  if (!normalized) {
    return '';
  }
  try {
    return decodeURIComponent(normalized);
  } catch {
    return normalized;
  }
}

function normalizeLegacyInPageLinkAttributes(html) {
  return String(html || '').replace(/<a\b[^>]*>/gi, (tag) => {
    if (!/\bhref\s*=\s*(["'])#[^"']+\1/i.test(tag)) {
      return tag;
    }
    return tag
      .replace(/\s+target\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/\s+rel\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  });
}

function createLegacyAnchorSlug(value, fallback = 'section') {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/&[a-z0-9#]+;/gi, ' ')
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || fallback;
}

function normalizeLegacyColumnPageData(value, site = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const base = { ...value };
  const pageKind = String(value.pageKind || value.kind || '').trim().toLowerCase();
  const hero = value.hero && typeof value.hero === 'object' && !Array.isArray(value.hero)
    ? {
        ...value.hero,
        title: String(value.hero.title || value.title || '').trim(),
        summary: String(value.hero.summary || value.summary || '').trim(),
        image: resolveNormalizedLegacyImagePath(value.hero.image || value.mastheadImage || value.heroImage || '')
      }
    : null;

  return {
    ...base,
    title: String(value.title || '').trim(),
    summary: String(value.summary || '').trim(),
    pageKind,
    listPageSize: normalizeInteger(value.listPageSize, 0),
    heroImage: resolveNormalizedLegacyImagePath(value.heroImage || ''),
    mastheadImage: resolveNormalizedLegacyImagePath(value.mastheadImage || value.heroImage || ''),
    hero,
    columnNavTitle: String(value.columnNavTitle || '').trim(),
    intro: normalizeLegacyLooseParagraphs(value.intro),
    overview: Array.isArray(value.overview) ? value.overview.filter(Boolean).map((item) => String(item).trim()).filter(Boolean) : [],
    benefits: Array.isArray(value.benefits) ? value.benefits.filter(Boolean) : [],
    cards: Array.isArray(value.cards) ? value.cards.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    featuredCards: Array.isArray(value.featuredCards) ? value.featuredCards.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    heroActions: Array.isArray(value.heroActions) ? value.heroActions.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    models: Array.isArray(value.models) ? value.models.filter(Boolean) : [],
    downloads: Array.isArray(value.downloads) ? value.downloads.filter(Boolean) : [],
    supplementalSections: Array.isArray(value.supplementalSections) ? value.supplementalSections.filter(Boolean) : [],
    brandPathSection: value.brandPathSection && typeof value.brandPathSection === 'object' ? value.brandPathSection : null,
    browseByTopicSection: value.browseByTopicSection && typeof value.browseByTopicSection === 'object' ? value.browseByTopicSection : null,
    topPanel: value.topPanel && typeof value.topPanel === 'object' ? value.topPanel : null,
    seo: value.seo && typeof value.seo === 'object' ? value.seo : null,
    items: Array.isArray(value.items) ? value.items.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    sections: Array.isArray(value.sections) ? value.sections.filter(Boolean).map((item) => normalizeLegacySectionLinkFields(item, site)) : [],
    resources: Array.isArray(value.resources) ? value.resources.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    managedItems: Array.isArray(value.managedItems) ? value.managedItems.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    features: Array.isArray(value.features) ? value.features.filter(Boolean) : [],
    calloutCards: Array.isArray(value.calloutCards) ? value.calloutCards.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    promoCards: Array.isArray(value.promoCards) ? value.promoCards.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    valuePoints: Array.isArray(value.valuePoints) ? value.valuePoints.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    industries: Array.isArray(value.industries) ? value.industries.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    brandProofItems: Array.isArray(value.brandProofItems) ? value.brandProofItems.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    resultsStripItems: Array.isArray(value.resultsStripItems) ? value.resultsStripItems.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    faqItems: Array.isArray(value.faqItems) ? value.faqItems.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    filterGroups: Array.isArray(value.filterGroups) ? value.filterGroups.filter(Boolean) : [],
    jobs: Array.isArray(value.jobs) ? value.jobs.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
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
    featureImage: resolveNormalizedLegacyImagePath(value.featureImage || ''),
    slides: Array.isArray(value.slides) ? value.slides.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : [],
    featureHeading: value.featureHeading && typeof value.featureHeading === 'object' ? value.featureHeading : null,
    introBlock: value.introBlock && typeof value.introBlock === 'object'
      ? value.introBlock
      : (value.intro && typeof value.intro === 'object' && !Array.isArray(value.intro) ? value.intro : null),
    partnerHeading: value.partnerHeading && typeof value.partnerHeading === 'object' ? value.partnerHeading : null,
    advice: value.advice && typeof value.advice === 'object' ? value.advice : null,
    supportList: value.supportList && typeof value.supportList === 'object' ? value.supportList : null,
    frame: value.frame && typeof value.frame === 'object' ? value.frame : null,
    promo: value.promo && typeof value.promo === 'object' ? normalizeLegacyPageLinkFields(value.promo, site) : null,
    spotlight: value.spotlight && typeof value.spotlight === 'object' ? value.spotlight : null,
    aboutCta: value.aboutCta && typeof value.aboutCta === 'object' ? normalizeLegacyPageLinkFields(value.aboutCta, site) : null,
    latestProducts: value.latestProducts && typeof value.latestProducts === 'object' ? normalizeLegacyPageLinkFields(value.latestProducts, site) : null,
    contactCallout: value.contactCallout && typeof value.contactCallout === 'object' ? normalizeLegacyPageLinkFields(value.contactCallout, site) : null
  };
}

function normalizeLegacySectionLinkFields(section, site = null) {
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return section;
  }
  return {
    ...section,
    links: Array.isArray(section.links) ? section.links.filter(Boolean).map((item) => normalizeLegacyPageLinkFields(item, site)) : section.links
  };
}

function normalizeLegacyPageLinkFields(item, site = null) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return item;
  }

  const normalized = { ...item };
  for (const key of ['href', 'link', 'url']) {
    if (key in normalized) {
      normalized[key] = prefixSitePathForContext(normalizeLegacyInternalHref(normalized[key]), site, {
        allowApi: false,
        allowAssets: false
      });
    }
  }
  for (const key of ['image', 'imageSrc', 'imageUrl', 'heroImage', 'mastheadImage', 'backgroundImage', 'featureImage']) {
    if (key in normalized) {
      normalized[key] = normalizeUploadedRelativePath(normalized[key]) || normalized[key];
    }
  }
  return normalized;
}

function resolveNormalizedLegacyImagePath(value) {
  return resolveNormalizedTemplateImagePath(value);
}

function normalizeLegacyInternalHref(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }
  if (/^(?:[a-z]+:|#|mailto:|tel:|javascript:)/i.test(normalized)) {
    return normalized;
  }
  if (!normalized.startsWith('/')) {
    return normalized;
  }
  return normalizeCmsInternalPath(normalized);
}

function normalizeCmsInternalPath(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }

  const [pathnamePart, suffix = ''] = normalized.split(/([?#].*)/s, 2);
  let pathname = pathnamePart || '';
  if (!pathname.startsWith('/')) {
    return normalized;
  }

  pathname = pathname.replace(/\/{2,}/g, '/');

  const sitePrefixMatch = pathname.match(/^\/(?:zh-cn|ru|es|id|pt|fr|tr|th|vi|ar(?:-[a-z]{2})?)(?=\/|$)/i);
  const sitePrefix = sitePrefixMatch ? sitePrefixMatch[0] : '';
  let rewrittenPath = sitePrefix ? pathname.slice(sitePrefix.length) || '/' : pathname;

  if (!rewrittenPath.endsWith('/') && !rewrittenPath.endsWith('.html') && !path.posix.extname(rewrittenPath)) {
    rewrittenPath = `${rewrittenPath}/`;
  }

  return `${sitePrefix}${rewrittenPath}${suffix}`;
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

function buildLegacyManagedColumnListItems(pageItems, site = null) {
  return pageItems.map((item, index) => ({
    id: item.id,
    name: item.name || '',
    url: buildSiteScopedManagedContentUrl(item, site),
    image: item.primary_image || '/skin/dfpic.gif',
    summary: gotTopicLegacy(item.summary || '', 90),
    rowOpenHtml: index === 0 ? '<tr>' : '',
    rowCloseHtml: (index + 1) % 2 === 0 ? '</tr><tr>' : '',
    placeholderHtml: pageItems.length === 1 && index === 0 ? '<td width="50%" valign="top" class="in6" height="100">&nbsp;</td>' : ''
  }));
}

function buildLegacyManagedColumnPager(columnUrl, pageNumber, pageCount, totalRecords, templateContext = null) {
  const uiText = getLegacyUiText(templateContext);
  const normalizedColumnUrl = String(columnUrl || '').trim();
  if (!normalizedColumnUrl) {
    throw new Error('缺少托管栏目分页 URL');
  }
  const firstPageUrl = normalizedColumnUrl;
  const buildPagedUrl = (targetPageNumber) => (
    targetPageNumber <= 1
      ? firstPageUrl
      : `${normalizedColumnUrl}index-${targetPageNumber}.html`
  );
  const previousPageUrl = pageNumber <= 2
    ? firstPageUrl
    : buildPagedUrl(pageNumber - 1);
  const nextPageUrl = buildPagedUrl(pageNumber + 1);
  const lastPageUrl = pageCount <= 1
    ? firstPageUrl
    : buildPagedUrl(pageCount);
  return {
    pagination: {
      pageNumber,
      pageCount,
      totalRecords,
      pageSize: MANAGED_LIST_PAGE_SIZE,
      firstHref: firstPageUrl,
      previousHref: pageNumber > 1 ? previousPageUrl : '',
      nextHref: pageNumber < pageCount ? nextPageUrl : '',
      lastHref: lastPageUrl
    },
    pagerText: {
      first: uiText.pagerFirst,
      previous: uiText.pagerPrevious,
      next: uiText.pagerNext,
      last: uiText.pagerLast,
      recordsPrefix: uiText.pagerRecordsPrefix,
      recordsSuffix: uiText.pagerRecordsSuffix,
      pageLabel: uiText.pagerPageLabel,
      perPageSuffix: uiText.pagerPerPageSuffix
    }
  };
}

function writeManagedColumnPageSet({
  outputRoot,
  templateContext,
  rootColumn,
  columnNode,
  parent,
  children,
  items,
  fileStem,
  columnMap,
  renderGroup
}) {
  const pages = paginate(items, MANAGED_LIST_PAGE_SIZE);
  const pageList = pages.length > 0 ? pages : [[]];
  const legacyColumnMap = new Map(
    templateContext.managedColumnCategories.map((column) => [normalizeInteger(column.id, 0), column])
  );
  let filesWritten = 0;

  for (let index = 0; index < pageList.length; index += 1) {
    const pageNumber = index + 1;
    const pageItems = pageList[index];
    const legacyHtml = renderCmsSitePage('managed-column-list', buildLegacyManagedColumnListPageProps({
      templateContext,
      rootColumn,
      columnNode,
      parent,
      children,
      pageItems,
      pageNumber,
      pageCount: pageList.length,
      totalRecords: items.length,
      columnMap
    }), templateContext, {
      templateType: 'list',
      fallbackCode: 'managed_list',
      targets: [{ target_type: 'column', target_id: normalizeInteger(columnNode.id, 0) || normalizeInteger(rootColumn?.id, 0) }],
      renderGroup
    });

    const outputPath = resolveColumnPageOutputPath(columnNode, columnMap, pageNumber);
    writeTextFile(outputRoot, outputPath, legacyHtml, templateContext.site);
    filesWritten += 1;

    const legacyOutputPath = resolveColumnPageOutputPath(columnNode, legacyColumnMap, pageNumber);
    if (legacyOutputPath !== outputPath) {
      writeTextFile(outputRoot, legacyOutputPath, legacyHtml, templateContext.site);
      filesWritten += 1;
    }
  }

  return filesWritten;
}

function getDescendantManagedColumnIds(childrenByParent, rootId) {
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

function buildLegacySectionContentListItems({ pageItems, summaryClassName, column }) {
  return pageItems.map((item) => {
    const summary = resolveRenderableContentSummary(item);
    const fullUrl = buildContentDetailUrlFromColumn(item, column);

    return {
      id: item.id,
      title: item.name || '',
      url: fullUrl,
      date: formatLegacyDateOnly(item.created_at) || '',
      summary: gotTopicLegacy(summary || '', 230),
      summaryClassName: summaryClassName || ''
    };
  });
}

function buildLegacySectionContentPager({
  columnUrl,
  pageNumber,
  pageCount,
  totalRecords,
  pageSize = DEFAULT_NEWS_LIST_PAGE_SIZE,
  templateContext = null
}) {
  const uiText = getLegacyUiText(templateContext);
  const normalizedColumnUrl = String(columnUrl || '').trim();
  const isDirStyle = normalizedColumnUrl.endsWith('/');
  const buildPageHref = (targetPage) => {
    if (isDirStyle) {
      return targetPage <= 1 ? 'index.html' : `index-${targetPage}.html`;
    }
    const base = normalizedColumnUrl.split('/').pop() || '';
    const baseName = base.replace(/\.html$/i, '');
      return `${baseName}-${targetPage}.html`;
  };
  return {
    pagination: {
      pageNumber,
      pageCount,
      totalRecords,
      pageSize,
      firstHref: buildPageHref(1),
      previousHref: pageNumber > 1 ? buildPageHref(pageNumber - 1) : '',
      nextHref: pageNumber < pageCount ? buildPageHref(pageNumber + 1) : '',
      lastHref: buildPageHref(pageCount)
    },
    pagerText: {
      first: uiText.pagerFirst,
      previous: uiText.pagerPrevious,
      next: uiText.pagerNext,
      last: uiText.pagerLastAlt,
      recordsPrefix: uiText.pagerRecordsPrefix,
      recordsSuffix: uiText.pagerRecordsSuffix,
      pageLabel: uiText.pagerPageLabel,
      perPageSuffix: uiText.pagerPerPageSuffix
    }
  };
}

function buildLegacyRelatedManagedItems(items, templateContext = null) {
  const uiText = getLegacyUiText(templateContext);
  if (items.length === 0) {
    return `<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr><td align="center">${escapeHtml(uiText.noRelatedItems)}</td></tr></table>`;
  }

  let html = '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>';
  let index = 0;
  for (const item of items) {
    index += 1;
    const className = index % 4 !== 0 ? 'class="in5"' : '';
    html += `<td width="50%" height="90" align="center" valign="middle" ${className}>`;
    html += '<table width="100%" border="0" cellpadding="0" cellspacing="0"><tr>';
    html += `<td width="100%" height="47" align="center" valign="middle" ${className}><img src="${escapeHtml(item.primary_image || '/skin/dfpic.gif')}" alt="${escapeHtml(item.name || '')}" width="95" height="70" /></td>`;
    html += `</tr><tr><td align="center" height="20">&nbsp;<a href="${escapeHtml(buildSiteScopedManagedContentUrl(item, templateContext?.site || null))}" class="Font_2E4690_a Font-Weight">${escapeHtml(item.name || '')}</a></td></tr></table>`;
    html += '</td>';
    if (index % 2 === 0) {
      html += '</tr><tr>';
    }
  }
  html += '</tr></table>';
  return html;
}

function buildLegacyIndexFeaturedManagedItems(templateContext = null) {
  const site = templateContext?.site || null;
  const languageCode = templateContext?.languageCode || null;
  const managedColumnRoot = templateContext?.managedColumnRoot || null;
  const items = managedColumnRoot
    ? listManagedColumnItems(managedColumnRoot, { featured: true, visibleOnly: true, limit: 10000, languageCode }).slice(0, 8)
    : [];

  let html = '';
  for (const item of items) {
    html += '<li>';
    html += `<img src="${escapeHtml(item.primary_image || '/skin/dfpic.gif')}" width="120" height="120" border="0" alt="${escapeHtml(item.name || '')}">`;
    html += `<li><a href="${buildSiteScopedManagedContentUrl(item, site)}" target="_blank">${escapeHtml(item.name || '')}</a></li><li class="tvjpnr">${gotTopicLegacy(item.summary || '', 118)}</li>`;
    html += '</li>';
  }
  return html;
}

function buildLegacyIndexFeaturedManagedItemLinks(templateContext = null) {
  const site = templateContext?.site || null;
  const languageCode = templateContext?.languageCode || null;
  const managedColumnRoot = templateContext?.managedColumnRoot || null;
  const items = managedColumnRoot
    ? listManagedColumnItems(managedColumnRoot, { featured: true, visibleOnly: true, limit: 10000, languageCode })
      .slice()
      .sort((left, right) => normalizeInteger(left.id, 0) - normalizeInteger(right.id, 0))
      .slice(0, 32)
    : [];

  return items.map((item) => `<li><a href="${buildSiteScopedManagedContentUrl(item, site)}">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildLegacyIndexNews(templateContext) {
  const newsSection = templateContext.publicSections.getSectionByDirName('news');
  const items = newsSection
    ? getSectionEntries(templateContext, newsSection)
    : [];
  return items.map((item) => `<li><a href="${buildSiteScopedArticleUrl(item, templateContext, newsSection)}" class="Ba">${escapeHtml(item.name || '')}</a></li>`).join('');
}

function buildLegacyServiceIndex(templateContext) {
  const serviceSection = templateContext.publicSections.getSectionByDirName('services');
  const items = serviceSection
    ? getSectionEntries(templateContext, serviceSection)
    : [];
  return items.map((item) => `<li><a href="${buildSiteScopedArticleUrl(item, templateContext, serviceSection)}">${escapeHtml(item.name || '')}</a></li>`).join('');
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

  const resolvedColumns = filterPublicSectionColumns(columns || listColumns({ languageCode }));
  const target = listStaticBuildTargetDefinitions({ columns: resolvedColumns }).find((definition) => (
    definition.value === normalized || definition.aliases.includes(normalized)
  ));

  return target?.value || normalized;
}

export function listStaticBuildTargetGroups({ languageCode = null, columns = null } = {}) {
  const resolvedColumns = filterPublicSectionColumns(columns || listColumns({ languageCode }));
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
  const resolvedColumns = filterPublicSectionColumns(columns || listColumns({ languageCode }));
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
  const protectedSiteDirs = collectProtectedLanguageOutputDirs(outputRoot);
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

  cleanupStaleTopLevelStaticDirs(outputRoot, [...managedDirs, ...protectedSiteDirs]);
  cleanupManagedSitemapChunks(outputRoot);
}

function collectManagedStaticDirs(columns = null) {
  const resolvedColumns = filterPublicSectionColumns(Array.isArray(columns) ? columns : listColumns());
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
    'api'
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

export function resolveStaticBuildOutputRoot({ outputRoot = DEFAULT_OUTPUT_ROOT, languageCode = null } = {}) {
  const [language] = resolveStaticBuildLanguages(languageCode);
  return resolveLanguageOutputRoot(outputRoot, language);
}

function collectProtectedLanguageOutputDirs(outputRoot) {
  const resolvedOutputRoot = path.resolve(outputRoot);
  const protectedDirs = new Set();

  for (const language of listLanguages().filter((item) => Number(item.is_enabled || 0) === 1)) {
    const languageOutputRoot = resolveLanguageOutputRoot(resolvedOutputRoot, language);
    const relativeDir = path.relative(resolvedOutputRoot, languageOutputRoot);
    if (!relativeDir || relativeDir.startsWith('..') || path.isAbsolute(relativeDir)) {
      continue;
    }

    const topLevelDir = normalizeStaticBuildRelativePath(relativeDir).split('/').filter(Boolean)[0] || '';
    if (topLevelDir) {
      protectedDirs.add(topLevelDir);
    }
  }

  return Array.from(protectedDirs);
}

function resolveLanguageOutputRoot(baseOutputRoot, language) {
  const requestedRoot = path.resolve(baseOutputRoot);
  const configuredOutputDir = String(language?.site?.output_dir || '').trim();
  if (!configuredOutputDir) {
    return requestedRoot;
  }

  const defaultRootName = path.basename(DEFAULT_OUTPUT_ROOT);
  if (String(language?.site?.site_mode || '').trim() === 'standalone') {
    if (configuredOutputDir === defaultRootName || configuredOutputDir === 'html') {
      return requestedRoot;
    }
    return path.resolve(PROJECT_ROOT, configuredOutputDir);
  }

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
  const normalizedContent = normalizeLegacyRichTextHtml(content, site);
  fs.writeFileSync(filePath, finalizeSiteHtmlOutput(normalizedContent, site), 'utf8');
  reportStaticBuildProgress('file_written', {
    fileType: 'html',
    relativePath: normalizeStaticBuildRelativePath(relativePath),
    absolutePath: filePath
  });
}

function removeStaticOutputFile(outputRoot, relativePath) {
  const filePath = path.resolve(outputRoot, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  fs.unlinkSync(filePath);
  reportStaticBuildProgress('file_removed', {
    fileType: 'html',
    relativePath: normalizeStaticBuildRelativePath(relativePath),
    absolutePath: filePath
  });
  return true;
}

function syncStaticSupportAssets(sharedRoot, outputRoot) {
  const resolvedSharedRoot = path.resolve(sharedRoot);
  const resolvedOutputRoot = path.resolve(outputRoot);

  cleanupObsoleteSharedStaticDirs(resolvedOutputRoot);
  syncSharedStaticDirs(resolvedSharedRoot, resolvedOutputRoot);
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
    reportStaticBuildProgress('file_written', {
      fileType: 'static-root',
      relativePath: normalizeStaticBuildRelativePath(path.relative(outputRoot, targetFile)),
      absolutePath: targetFile
    });
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
    reportStaticBuildProgress('file_written', {
      fileType: 'static-asset',
      relativePath: normalizeStaticBuildRelativePath(path.relative(globalStaticBuildProgressState.outputRoot || targetDir, targetPath)),
      absolutePath: targetPath
    });
  }
}

function normalizeStaticBuildRelativePath(relativePath) {
  return String(relativePath || '').replace(/\\/g, '/');
}

function directoryHasFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return false;
  }

  const stack = [dirPath];
  while (stack.length > 0) {
    const currentDir = stack.pop();
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isFile()) {
        return true;
      }
      if (entry.isDirectory()) {
        stack.push(fullPath);
      }
    }
  }

  return false;
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

function filterByIdRange(items, idRange) {
  if (!idRange || (idRange.start == null && idRange.end == null)) {
    return items;
  }
  const start = idRange.start == null ? Number.MIN_SAFE_INTEGER : normalizeInteger(idRange.start, Number.MIN_SAFE_INTEGER);
  const end = idRange.end == null ? Number.MAX_SAFE_INTEGER : normalizeInteger(idRange.end, Number.MAX_SAFE_INTEGER);
  return items.filter((item) => item.id >= start && item.id <= end);
}

function normalizeContentItemIdRange(contentItemId) {
  const normalizedId = Number.parseInt(contentItemId, 10);
  return Number.isInteger(normalizedId) && normalizedId > 0
    ? { start: normalizedId, end: normalizedId }
    : null;
}

function createBuildResult(key, label, recordsProcessed, filesWritten) {
  return { key, label, recordsProcessed, filesWritten };
}

function resolveRenderableContentSummary(item) {
  const summary = normalizeRenderableLegacyText(item?.summary);
  const seoDescription = normalizeRenderableLegacyText(item?.seo_description);
  if (summary && !looksLikeLegacyMojibake(summary)) {
    const shouldPreferSeoDescription = summary.length <= 12
      && seoDescription
      && !looksLikeLegacyMojibake(seoDescription)
      && seoDescription !== summary;
    if (shouldPreferSeoDescription) {
      return truncateRenderableContentSummary(seoDescription);
    }
    return truncateRenderableContentSummary(summary);
  }

  if (seoDescription && !looksLikeLegacyMojibake(seoDescription)) {
    return truncateRenderableContentSummary(seoDescription);
  }

  const contentSummary = extractRenderableContentBodySummary(item?.content_html);
  if (contentSummary) {
    return truncateRenderableContentSummary(contentSummary);
  }

  return truncateRenderableContentSummary(normalizeRenderableLegacyText(item?.name));
}

function extractRenderableContentBodySummary(value) {
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

function truncateRenderableContentSummary(value, maxLength = 230) {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function compareCategoryOrder(left, right) {
  return normalizeInteger(left.sort_order, 0) - normalizeInteger(right.sort_order, 0) || normalizeInteger(left.id, 0) - normalizeInteger(right.id, 0);
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
  const localPdfDownloadTokens = [];
  output = output.replace(/<a\b(?=[^>]*\bclass\s*=\s*["'][^"']*\bdownload-link\b[^"']*["'])[^>]*\bhref\s*=\s*(["'])(\/uploads\/pdfs\/[^"']+)\1[^>]*>/gi, (match, quote, relativePath) => {
    const token = `__LOCAL_PDF_DOWNLOAD_${localPdfDownloadTokens.length}__`;
    localPdfDownloadTokens.push({ token, relativePath });
    return match.replace(relativePath, token);
  });

  output = normalizeLegacyMetaAttributes(output);
  output = normalizeLegacyAssetText(output, siteConfig);

  output = output
    .replace(/href="https?:\/\/\/+"/gi, 'href="/"')
    .replace(/data-ke-src="https?:\/\/\/+"/gi, 'data-ke-src="/"')
    .replace(/https?:\/\/\/+(?=[^/"])/gi, '/')
    .replace(/(["'(=])(https?:\/\/[^/\s"'<>]+\/uploads\/(?:images|skin|pdfs|files)\/[^\s"'<>]+|\/uploads\/(?:images|skin|pdfs|files)\/[^\s"'<>]+)/gi, (_, prefix, relativePath) => {
      return `${prefix}${resolvePublicAssetUrl(relativePath, siteConfig)}`;
    })
    // 修正托管内容链接：确保详情链接都有尾部斜杠
    .replace(/href="(\/[a-z0-9-]+\/[a-z0-9/-]+[a-z0-9])"/gi, (match, url) => {
      // 如果不是以 .html 或 / 结尾，添加尾部斜杠
      if (!url.endsWith('.html') && !url.endsWith('/')) {
        return `href="${url}/"`;
      }
      return match;
    });

  for (const { token, relativePath } of localPdfDownloadTokens) {
    output = output.replaceAll(token, relativePath);
  }
  return output;
}

function normalizeLegacyBodyHtml(value, siteConfig = null, options = {}) {
  const normalized = normalizeLegacyRichTextHtml(value, siteConfig);
  if (!normalized) {
    return '';
  }
  return normalizeLegacyImageAltText(stripLegacyBodyChrome(normalized), options);
}

function stripLegacyBodyChrome(value) {
  let output = String(value || '').trim();
  if (!output) {
    return '';
  }

  output = unwrapLegacyBodyShell(output);

  let previous = '';
  while (output && output !== previous) {
    previous = output;
    output = stripLeadingLegacyBodyChromeBlock(output).trim();
    output = unwrapLegacyBodyShell(output).trim();
  }

  return output;
}

function unwrapLegacyBodyShell(value) {
  const html = String(value || '').trim();
  const shell = matchSingleRootElement(html);
  if (!shell || !isLegacyBodyShellOpeningTag(shell.openingTag)) {
    return html;
  }
  return shell.inner.trim();
}

function stripLeadingLegacyBodyChromeBlock(value) {
  const html = String(value || '').trim();
  if (!html) {
    return '';
  }

  const leadingComment = html.match(/^<!--[\s\S]*?-->\s*/);
  if (leadingComment) {
    return html.slice(leadingComment[0].length);
  }

  const match = matchLeadingHtmlElement(html);
  if (!match || !isLegacyBodyChromeOpeningTag(match.openingTag)) {
    return html;
  }
  return html.slice(match.endIndex);
}

function matchSingleRootElement(html, tagName) {
  const match = matchLeadingHtmlElement(html, tagName);
  if (!match) {
    return null;
  }
  if (html.slice(match.endIndex).trim()) {
    return null;
  }
  return match;
}

function matchLeadingHtmlElement(html, requiredTagName = null) {
  const value = String(html || '');
  const leading = value.match(/^\s*<([a-z][a-z0-9:-]*)(?:\s[^>]*)?>/i);
  if (!leading) {
    return null;
  }

  const tagName = leading[1].toLowerCase();
  if (requiredTagName && tagName !== String(requiredTagName).toLowerCase()) {
    return null;
  }
  if (isVoidHtmlElement(tagName)) {
    return {
      tagName,
      openingTag: leading[0],
      inner: '',
      endIndex: leading[0].length
    };
  }

  const tagPattern = new RegExp(`<\\/?${escapeRegExp(tagName)}\\b[^>]*>`, 'gi');
  let depth = 0;
  let current;
  while ((current = tagPattern.exec(value))) {
    const rawTag = current[0];
    const isClosing = /^<\//.test(rawTag);
    const isSelfClosing = /\/\s*>$/.test(rawTag);
    if (!isClosing) {
      depth += 1;
      if (isSelfClosing) {
        depth -= 1;
      }
    } else {
      depth -= 1;
    }
    if (depth === 0) {
      const endIndex = tagPattern.lastIndex;
      return {
        tagName,
        openingTag: leading[0],
        inner: value.slice(leading[0].length, current.index),
        endIndex
      };
    }
  }

  return null;
}

function isLegacyBodyShellOpeningTag(openingTag) {
  const tag = String(openingTag || '');
  return /\bclass\s*=\s*["'][^"']*\b(?:sg-page-shell|sg-content-shell|sg-generated-hub|sg-info-page|sg-service-page|sg-careers-page|sg-story-page|customer-story-page)\b/i.test(tag);
}

function isLegacyBodyChromeOpeningTag(openingTag) {
  const tag = String(openingTag || '');
  return /\bclass\s*=\s*["'][^"']*\b(?:banner-primary|breadcrumb|sg-digital-page__hero|sg-careers-hero|sg-story-page__hero|sg-story-page__hero-content|sg-resource-detail__hero)\b/i.test(tag)
    || /\bdata-component\s*=\s*["'][^"']*(?:masthead|breadcrumb)[^"']*["']/i.test(tag);
}

function isVoidHtmlElement(tagName) {
  return new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'])
    .has(String(tagName || '').toLowerCase());
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLegacyImageAltText(value, options = {}) {
  const html = String(value || '');
  if (!html || !/<img\b/i.test(html)) {
    return html;
  }
  return html.replace(/<img\b[^>]*>/gi, (tag) => normalizeLegacyImageAltTag(tag, options));
}

function normalizeLegacyImageAltTag(tag, options = {}) {
  const currentAlt = tag.match(/\s+alt(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/i);
  const currentAltText = currentAlt ? String(currentAlt[1] ?? currentAlt[2] ?? currentAlt[3] ?? '').trim() : '';
  if (currentAltText) {
    return tag;
  }

  const src = tag.match(/\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const generatedAlt = buildLegacyImageAltText(src ? (src[1] ?? src[2] ?? src[3]) : '', options);
  if (!generatedAlt) {
    return tag;
  }
  const escapedAlt = escapeHtmlAttribute(generatedAlt);

  if (currentAlt) {
    return `${tag.slice(0, currentAlt.index)} alt="${escapedAlt}"${tag.slice(currentAlt.index + currentAlt[0].length)}`;
  }
  return tag.replace(/\s*\/?>$/, (ending) => ` alt="${escapedAlt}"${ending}`);
}

function buildLegacyImageAltText(src, options = {}) {
  const fallback = normalizeImageAltPhrase(options?.fallbackAlt);
  const sourcePhrase = normalizeImageAltPhrase(resolveImageNameFromUrl(src));
  if (sourcePhrase && fallback && !phrasesOverlap(sourcePhrase, fallback)) {
    return `${sourcePhrase} - ${fallback}`;
  }
  return sourcePhrase || fallback;
}

function resolveImageNameFromUrl(src) {
  const value = String(src || '').trim();
  if (!value) {
    return '';
  }
  const withoutQuery = value.split(/[?#]/)[0] || '';
  const filename = decodeURIComponent((withoutQuery.split('/').pop() || '').trim());
  return filename.replace(/\.[a-z0-9]{2,5}$/i, '');
}

function normalizeImageAltPhrase(value) {
  let phrase = String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b[a-f0-9]{8,}\b/gi, ' ')
    .replace(/\b(?:jpg|jpeg|png|gif|webp|avif|svg)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!phrase) {
    return '';
  }
  phrase = phrase.replace(/\bfig\s+(\d+)\s+(\d+)\s+(\d+)\b/gi, 'Figure $1.$2.$3');
  phrase = phrase.replace(/\bequation\s+(\d+)\s+(\d+)\b/gi, 'Equation $1.$2');
  phrase = phrase.replace(/\bmod\s+(\d+)\b/gi, 'Module $1');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

function phrasesOverlap(left, right) {
  const normalize = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const leftValue = normalize(left);
  const rightValue = normalize(right);
  return Boolean(leftValue && rightValue && (leftValue.includes(rightValue) || rightValue.includes(leftValue)));
}

function finalizeSiteHtmlOutput(html, siteConfig = null) {
  let output = String(html || '');
  if (!output) {
    return '';
  }

  output = normalizeHtmlImageLoading(output);
  output = normalizeHtmlImageDimensions(output);

  output = output.replace(/(https?:\/\/[^/\s"'<>]+\/[A-Za-z0-9_-]+)https?:\/\/[^/\s"'<>]+(\/uploads\/(?:images|skin|pdfs|files)\/[^\s"'<>]+)/gi, (_, basePrefix, assetPath) => {
    const normalizedAssetUrl = resolvePublicAssetUrl(assetPath, siteConfig);
    return normalizedAssetUrl || `${basePrefix}${assetPath}`;
  });

  output = normalizeDuplicateHtmlIds(output);

  const pathPrefix = normalizeLanguageSitePathPrefix(siteConfig?.language_site_path_prefix);
  if (pathPrefix !== '/') {
    output = prefixSiteInternalRootPaths(output, pathPrefix);
  }

  return minifyHtmlInterTagWhitespace(output);
}

function normalizeDuplicateHtmlIds(value) {
  const html = String(value || '');
  if (!html || !/\sid\s*=/i.test(html)) {
    return html;
  }

  const protectedBlocks = [];
  const protectedHtml = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, (block) => {
    const token = `<html-id-protected-block data-index="${protectedBlocks.length}"></html-id-protected-block>`;
    protectedBlocks.push(block);
    return token;
  });
  const seenIds = new Set();
  const normalizedHtml = protectedHtml.replace(/<[a-z][^>]*>/gi, (tag) => {
    const idMatch = tag.match(/\s+id\s*=\s*(["'])([^"']+)\1/i);
    if (!idMatch) {
      return tag;
    }
    const id = String(idMatch[2] || '').trim();
    if (!id || !seenIds.has(id)) {
      if (id) {
        seenIds.add(id);
      }
      return tag;
    }
    return `${tag.slice(0, idMatch.index)}${tag.slice(idMatch.index + idMatch[0].length)}`;
  });

  return normalizedHtml.replace(/<html-id-protected-block data-index="(\d+)"><\/html-id-protected-block>/g, (_match, index) => (
    protectedBlocks[Number(index)] || ''
  ));
}

const HTML_INLINE_ELEMENTS = new Set([
  'a', 'abbr', 'b', 'bdi', 'bdo', 'br', 'button', 'cite', 'code', 'data', 'del',
  'dfn', 'em', 'i', 'img', 'input', 'ins', 'kbd', 'label', 'mark', 'meter',
  'output', 'picture', 'progress', 'q', 'ruby', 's', 'samp', 'select', 'small',
  'span', 'strong', 'sub', 'sup', 'svg', 'time', 'u', 'var', 'wbr'
]);

function minifyHtmlInterTagWhitespace(value) {
  const html = String(value || '');
  if (!html || !/>\s+</.test(html)) {
    return html;
  }

  const protectedBlocks = [];
  const protectedHtml = html.replace(
    /<(pre|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
    (block) => {
      const token = `<html-protected-block data-index="${protectedBlocks.length}"></html-protected-block>`;
      protectedBlocks.push(block);
      return token;
    }
  );

  const minified = protectedHtml.replace(
    /(<\/?([a-z][a-z0-9:-]*)\b[^>]*>)\s+(?=<\/?([a-z][a-z0-9:-]*)\b[^>]*>)/gi,
    (_match, leftTag, leftName, rightName) => {
      const separator = HTML_INLINE_ELEMENTS.has(String(leftName || '').toLowerCase())
        && HTML_INLINE_ELEMENTS.has(String(rightName || '').toLowerCase())
        ? ' '
        : '';
      return `${leftTag}${separator}`;
    }
  );

  return minified.replace(/<html-protected-block data-index="(\d+)"><\/html-protected-block>/g, (_match, index) => {
    return protectedBlocks[Number(index)] || '';
  });
}

function normalizeHtmlImageLoading(value) {
  const html = String(value || '');
  if (!html || !/<img\b/i.test(html)) {
    return html;
  }
  return html.replace(/<img\b[^>]*>/gi, (tag) => normalizeHtmlImageLoadingTag(tag));
}

function normalizeHtmlImageLoadingTag(tag) {
  if (/\s+loading\s*=/i.test(tag) || shouldKeepImageEager(tag)) {
    return tag;
  }
  return tag.replace(/\s*\/?>$/, (ending) => ` loading="lazy"${ending}`);
}

function shouldKeepImageEager(tag) {
  const src = tag.match(/\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const srcValue = String(src ? (src[1] ?? src[2] ?? src[3]) : '');
  return /logo\.svg|favicon|apple-touch-icon/i.test(srcValue)
    || /\b(?:sg-global-nav__brand-mark|sg-short-masthead__image|banner-primary__image)\b/i.test(tag)
    || /\s+fetchPriority\s*=\s*["']high["']/i.test(tag)
    || /\s+fetchpriority\s*=\s*["']high["']/i.test(tag);
}

function normalizeHtmlImageDimensions(value) {
  const html = String(value || '');
  if (!html || !/<img\b/i.test(html)) {
    return html;
  }
  return html.replace(/<img\b[^>]*>/gi, (tag) => normalizeHtmlImageDimensionTag(tag));
}

function normalizeHtmlImageDimensionTag(tag) {
  const hasWidth = /\s+width\s*=/i.test(tag);
  const hasHeight = /\s+height\s*=/i.test(tag);
  if (hasWidth && hasHeight) {
    return tag;
  }

  const src = tag.match(/\s+src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i);
  const dimensions = resolveImageDimensions(src ? (src[1] ?? src[2] ?? src[3]) : '', tag);
  if (!dimensions?.width || !dimensions?.height) {
    return tag;
  }

  let output = tag;
  if (!hasWidth) {
    output = output.replace(/\s*\/?>$/, (ending) => ` width="${dimensions.width}"${ending}`);
  }
  if (!hasHeight) {
    output = output.replace(/\s*\/?>$/, (ending) => ` height="${dimensions.height}"${ending}`);
  }
  return output;
}

function resolveImageDimensions(src, tag = '') {
  const value = String(src || '').trim();
  if (!value) {
    return inferImageDimensionsFromTag(tag);
  }

  const localPath = resolveStaticImageFilePath(value);
  if (localPath && fs.existsSync(localPath)) {
    const dimensions = readImageDimensions(localPath);
    if (dimensions) {
      return dimensions;
    }
  }

  return inferImageDimensionsFromTag(tag) || inferImageDimensionsFromUrl(value) || inferExternalImageDimensions(value, tag);
}

function resolveStaticImageFilePath(src) {
  const uploadedPath = resolveUploadedFilePath(src);
  if (uploadedPath) {
    return uploadedPath;
  }

  const value = String(src || '').trim();
  const legacySkin = value.match(/^(?:https?:\/\/[^/]+)?\/skin\/(.+)$/i);
  if (legacySkin) {
    return path.resolve(PROJECT_ROOT, 'uploads', 'skin', legacySkin[1].replace(/^\/+/, ''));
  }
  return null;
}

function readImageDimensions(filePath) {
  const cacheKey = path.resolve(filePath);
  if (imageDimensionCache.has(cacheKey)) {
    return imageDimensionCache.get(cacheKey);
  }

  let dimensions = null;
  try {
    const buffer = fs.readFileSync(cacheKey);
    dimensions = readRasterImageDimensions(buffer) || readSvgImageDimensions(buffer);
  } catch {
    dimensions = null;
  }

  imageDimensionCache.set(cacheKey, dimensions);
  return dimensions;
}

function readRasterImageDimensions(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  if (buffer.readUInt32BE(0) === 0x89504e47 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return normalizeImageDimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20));
  }

  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return readJpegImageDimensions(buffer);
  }

  if (buffer.toString('ascii', 0, 6) === 'GIF87a' || buffer.toString('ascii', 0, 6) === 'GIF89a') {
    return normalizeImageDimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8));
  }

  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return readWebpImageDimensions(buffer);
  }

  if (buffer.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(buffer.toString('ascii', 8, 32))) {
    return readIsoBmffImageDimensions(buffer);
  }

  return null;
}

function readJpegImageDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 0xd9 || marker === 0xda) {
      break;
    }
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2 || offset + 2 + length > buffer.length) {
      break;
    }
    if (
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf)
    ) {
      return normalizeImageDimensions(buffer.readUInt16BE(offset + 7), buffer.readUInt16BE(offset + 5));
    }
    offset += 2 + length;
  }
  return null;
}

function readWebpImageDimensions(buffer) {
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8 ' && buffer.length >= 30) {
    return normalizeImageDimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff);
  }
  if (chunkType === 'VP8L' && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return normalizeImageDimensions((bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1);
  }
  if (chunkType === 'VP8X' && buffer.length >= 30) {
    return normalizeImageDimensions(readUInt24LE(buffer, 24) + 1, readUInt24LE(buffer, 27) + 1);
  }
  return null;
}

function readIsoBmffImageDimensions(buffer) {
  const text = buffer.toString('latin1');
  const index = text.indexOf('ispe');
  if (index < 0 || index + 20 > buffer.length) {
    return null;
  }
  return normalizeImageDimensions(buffer.readUInt32BE(index + 12), buffer.readUInt32BE(index + 16));
}

function readSvgImageDimensions(buffer) {
  const text = buffer.toString('utf8', 0, Math.min(buffer.length, 4096));
  if (!/<svg\b/i.test(text)) {
    return null;
  }

  const width = parseSvgLength(text.match(/\bwidth\s*=\s*["']([^"']+)["']/i)?.[1]);
  const height = parseSvgLength(text.match(/\bheight\s*=\s*["']([^"']+)["']/i)?.[1]);
  if (width && height) {
    return normalizeImageDimensions(width, height);
  }

  const viewBox = text.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)?.[1];
  if (!viewBox) {
    return null;
  }
  const parts = viewBox.trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
  return parts.length === 4 ? normalizeImageDimensions(parts[2], parts[3]) : null;
}

function inferImageDimensionsFromTag(tag) {
  const ratio = String(tag || '').match(/\baspect-ratio\s*:\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i);
  if (!ratio) {
    return null;
  }
  const width = Number(ratio[1]);
  const height = Number(ratio[2]);
  return normalizeImageDimensions(width, height);
}

function inferImageDimensionsFromUrl(src) {
  const filename = resolveImageNameFromUrl(src);
  const match = filename.match(/(?:^|[^0-9])(\d{2,5})\s*x\s*(\d{2,5})(?:[^0-9]|$)/i);
  return match ? normalizeImageDimensions(Number(match[1]), Number(match[2])) : null;
}

function inferExternalImageDimensions(src, tag = '') {
  const value = String(src || '').trim();
  if (!/^https?:\/\//i.test(value)) {
    return null;
  }
  if (/\.svg(?:[?#]|$)/i.test(value)) {
    return normalizeImageDimensions(96, 96);
  }
  if (/\b(?:quote|quotes|case-studies)\b/i.test(value)) {
    return normalizeImageDimensions(1440, 810);
  }
  if (/\bicon\b/i.test(value) || /\bmetric-icon\b/i.test(tag)) {
    return normalizeImageDimensions(96, 96);
  }
  return null;
}

function normalizeImageDimensions(width, height) {
  const normalizedWidth = Math.round(Number(width));
  const normalizedHeight = Math.round(Number(height));
  if (!Number.isFinite(normalizedWidth) || !Number.isFinite(normalizedHeight) || normalizedWidth <= 0 || normalizedHeight <= 0) {
    return null;
  }
  return { width: normalizedWidth, height: normalizedHeight };
}

function readUInt24LE(buffer, offset) {
  return buffer[offset] + (buffer[offset + 1] << 8) + (buffer[offset + 2] << 16);
}

function parseSvgLength(value) {
  const match = String(value || '').trim().match(/^(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

function prefixSiteInternalRootPaths(html, pathPrefix) {
  const normalizedPrefix = normalizeLanguageSitePathPrefix(pathPrefix);
  if (normalizedPrefix === '/') {
    return String(html || '');
  }

  return String(html || '').replace(/(\b(?:href|action|content|data-search-api-url)=["'])(\/[^"']*)(["'])/gi, (match, prefix, url, suffix) => {
    const rewritten = prefixLanguageSitePath(url, normalizedPrefix, {
      allowApi: false,
      allowAssets: false
    });
    return `${prefix}${rewritten}${suffix}`;
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
  if (type === 'description' && !shouldSanitizeLegacyMetaDescription(normalized)) {
    return normalized;
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

function shouldSanitizeLegacyMetaDescription(value) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return false;
  }
  return /<\s*(?:!doctype|html|head|body|meta|title|link|script|style)\b/i.test(normalized)
    || /\b(?:name|property|content|charset|http-equiv)\s*=/i.test(normalized)
    || /width\s*=\s*device-width/i.test(normalized)
    || /&(?:quot|lt|gt|#34|#60|#62);/i.test(normalized);
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

function buildSharedSpecOptions(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .map((value) => ({
      label: value,
      value
    }));
}
