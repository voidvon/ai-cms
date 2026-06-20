import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureTemplateVariantsSchema, createTemplateVariant, getSelectedTemplateVariant, listTemplateVariants, setSelectedTemplateVariant } from '../src/services/template-variants.mjs';
import { ensureTemplatesSchema, createTemplate, publishTemplate, updateTemplate, upsertTemplateBinding } from '../src/services/templates.mjs';
import { listColumns } from '../src/services/columns.mjs';
import { resolvePublicSectionContext } from '../src/services/public-sections.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../../..');
const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const dryRun = process.argv.includes('--dry-run');
const selectTheme = process.argv.includes('--select');
const includeHomeTemplate = process.argv.includes('--include-home');
const includeShellTemplate = process.argv.includes('--include-shell');

const THEME_NAME = 'Spirax Global';
const CONTENT_TYPE_PRODUCT_ID = 1;
const CONTENT_TYPE_ARTICLE_ID = 2;
const CONTENT_TYPE_CONTACT_ID = 4;
const CONTENT_TYPE_CORPORATION_ID = 6;

ensureTemplateVariantsSchema();
ensureTemplatesSchema();

const themeId = ensureTheme();
const templates = buildTemplates();
const publicSections = resolvePublicSectionContext(listColumns());
const serviceSection = publicSections.getNewsSectionByDirName('services');

for (const template of templates) {
  upsertPublishedTemplate(template);
}

const bindings = [
  ...(includeHomeTemplate ? [{ target_type: 'site', target_id: null, template_type: 'home', template_code: 'spirax_home' }] : []),
  { target_type: 'content_type', target_id: CONTENT_TYPE_PRODUCT_ID, template_type: 'list', template_code: 'spirax_product_list' },
  { target_type: 'content_type', target_id: CONTENT_TYPE_PRODUCT_ID, template_type: 'content', template_code: 'spirax_product_detail' },
  { target_type: 'content_type', target_id: CONTENT_TYPE_ARTICLE_ID, template_type: 'list', template_code: 'spirax_article_list' },
  { target_type: 'content_type', target_id: CONTENT_TYPE_ARTICLE_ID, template_type: 'content', template_code: 'spirax_article_detail' },
  ...(serviceSection ? [
    { target_type: 'column', target_id: serviceSection.rootColumnId, template_type: 'list', template_code: 'spirax_service_list' },
    { target_type: 'column', target_id: serviceSection.rootColumnId, template_type: 'content', template_code: 'spirax_service_detail' }
  ] : []),
  { target_type: 'content_type', target_id: CONTENT_TYPE_CORPORATION_ID, template_type: 'content', template_code: 'spirax_content_page' },
  { target_type: 'content_type', target_id: CONTENT_TYPE_CONTACT_ID, template_type: 'content', template_code: 'spirax_contact_page' },
];

for (const binding of bindings) {
  upsertBinding(binding);
}

if (!dryRun && selectTheme) {
  setSelectedTemplateVariant(themeId);
}

console.log(JSON.stringify({
  dryRun,
  themeId,
  themeName: THEME_NAME,
  templates: templates.map((item) => item.code),
  bindings,
  selected: Boolean(selectTheme && !dryRun),
  includeHomeTemplate,
  includeShellTemplate,
  sourceRoot,
}, null, 2));

function ensureTheme() {
  const existing = listTemplateVariants().find((item) => item.template_name === THEME_NAME);
  if (existing?.id) {
    return existing.id;
  }

  if (dryRun) {
    return getSelectedTemplateVariant()?.id || 1;
  }

  const created = createTemplateVariant({
    template_name: THEME_NAME,
    is_selected: 0
  });
  return created.id;
}

function upsertPublishedTemplate(definition) {
  if (dryRun) {
    return;
  }

  if (definition.type === 'home' && !includeHomeTemplate) {
    return;
  }

  if (definition.code === 'spirax_shell' && !includeShellTemplate) {
    return;
  }

  const normalizedDefinition = normalizeTemplateDefinition(definition);
  const existing = findTemplateByCode(definition.code);
  const payload = {
    theme_id: themeId,
    name: normalizedDefinition.name,
    type: normalizedDefinition.type,
    code: normalizedDefinition.code,
    engine: 'tsx',
    ...(normalizedDefinition.tsx_source !== undefined ? { tsx_source: normalizedDefinition.tsx_source } : {}),
    ...(normalizedDefinition.css_source !== undefined ? { css_source: normalizedDefinition.css_source } : {}),
    sort_order: normalizedDefinition.sort_order || 0,
  };

  const record = existing
    ? updateTemplate(existing.id, payload)
    : createTemplate(payload);

  publishTemplate(record.id, '导入 Spirax Global 主题模板');
}

function upsertBinding(binding) {
  if (dryRun) {
    return;
  }

  const template = findTemplateByCode(binding.template_code);
  if (!template?.id) {
    throw new Error(`模板不存在，无法绑定: ${binding.template_code}`);
  }

  upsertTemplateBinding({
    theme_id: themeId,
    target_type: binding.target_type,
    target_id: binding.target_id,
    template_type: binding.template_type,
    template_id: template.id
  });
}

function findTemplateByCode(code) {
  return listTemplateVariants()
    .flatMap((item) => item.theme_templates || [])
    .find((item) => item.theme_id === themeId && item.code === code) || null;
}

function buildTemplates() {
  const productUiCss = readSourceCss([
    'src/components/shared/ui/ui.css',
  ]);
  const productPagesSourceCss = normalizeProductColumnCss(readSourceCss([
    'src/components/templates/ProductPages/ProductPages.css',
  ]));
  const productPageCssPartitions = partitionCssByTargets(productPagesSourceCss, {
    productTopPanel: [
      'product-top-panel__',
    ],
    productDownloadGroups: [
      'tabs__nav',
      'tabs__content',
      'tabs[data-group-count="1"]',
      'tabs[data-has-tab-nav="true"][data-tabs-ready="true"]',
      'download-group-accordion',
      'table--downloads',
      'table--striped tbody tr:nth-child(even)',
      'download-link',
      '.tab__header',
    ],
    productSideNav: [
      'product-column-sidebar',
    ],
    productOverview: [
      'product-overview__',
    ],
    promoBanner: [
      'promo-bg',
      'promo-banner',
      '.btn',
    ],
  });
  const shellCss = readSourceCss([
    'src/styles/global.css',
    'src/styles/utilities.css',
    'src/components/shared/primitives/PageShell.css',
    'src/components/shared/primitives/ContentShell.css',
    'src/styles/site-shell/Footer.css',
  ]);
  const siteNavCss = readSourceCss([
    'src/styles/site-shell/Nav.css',
  ]);
  const breadcrumbsCss = readSourceCss([
    'src/components/shared/business/Breadcrumbs.css',
  ]);
  const shortMastheadCss = readSourceCss([
    'src/components/shared/business/ShortMasthead.css',
  ]);
  const contentCardGridCss = [
    readSourceCss([
      'src/components/shared/primitives/ContentCardGrid.css',
    ]),
    `
.content-card-grid__grid--cols-fluid {
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr));
}

.content-card-grid__grid--cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.content-card-grid__grid--cols-4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

@media (max-width: 1024px) {
  .content-card-grid__grid--cols-fluid,
  .content-card-grid__grid--cols-3,
  .content-card-grid__grid--cols-4 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .content-card-grid__grid--cols-fluid,
  .content-card-grid__grid--cols-3,
  .content-card-grid__grid--cols-4 {
    grid-template-columns: minmax(0, 1fr);
  }
}
    `.trim()
  ].filter(Boolean).join('\n\n');
  const productCardGridCss = `
.product-card-grid {
  --product-card-min-height: 190px;
  --product-card-grey-bg: #eef1f3;
  --product-card-shadow: 0 8px 22px rgba(0, 45, 114, 0.1);
}

.product-card-grid__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.product-card-grid__item {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: var(--product-card-min-height);
  color: inherit;
  text-decoration: none;
  background: #fff;
  box-shadow: var(--product-card-shadow);
}

.product-card-grid__item--grey {
  background: var(--product-card-grey-bg);
}

.product-card-grid__item--light-blue {
  background: var(--sg-card-blue, #d9edf6);
  box-shadow: none;
}

.product-card-grid__image {
  flex: 0 0 auto;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
}

.product-card-grid__content {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: center;
  min-height: calc(var(--product-card-min-height) * 0.55);
  padding: 18px 24px;
}

.product-card-grid__link {
  display: flex;
  flex: 1;
  flex-direction: column;
  color: inherit;
  text-decoration: none;
}

.product-card-grid__title {
  margin: 0;
  color: var(--sg-blue);
  font-weight: 700;
  line-height: 1.24;
}

.product-card-grid__title--uppercase {
  text-transform: uppercase;
}

.product-card-grid__desc {
  margin-top: 14px;
  color: #41576d;
  font-size: 15px;
  line-height: 1.68;
}

.product-card-grid__desc p {
  margin: 0;
  white-space: pre-line;
}

.product-card-grid__cta {
  display: inline-flex;
  align-items: center;
  margin-top: 18px;
  color: var(--sg-blue);
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

@media (max-width: 1024px) {
  .product-card-grid__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 720px) {
  .product-card-grid__grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .product-card-grid__item {
    min-height: auto;
  }

  .product-card-grid__content {
    padding: 8px;
  }

  .product-card-grid--mobile-carousel .product-card-grid__grid {
    grid-template-columns: none;
    grid-auto-columns: minmax(78vw, 1fr);
    grid-auto-flow: column;
    overflow-x: auto;
    padding-bottom: 6px;
    scroll-snap-type: x proximity;
  }

  .product-card-grid--mobile-carousel .product-card-grid__item {
    scroll-snap-align: start;
  }
}
  `.trim();
  const productImageGalleryCss = readSourceCss([
    'src/components/shared/business/ProductImageGallery.css',
  ]);
  const brandPathSectionCss = readSourceCss([
    'src/components/shared/business/BrandPathSection.css',
  ]);
  const benefitBlocksCss = readSourceCss([
    'src/components/shared/business/IconBlockSection.css',
  ]);
  const globalSearchCss = readSourceCss([
    'src/styles/site-shell/GlobalSearch.css',
  ]);
  const productCss = readSourceCss([
    'src/components/shared/ui/ui.css',
  ]);
  const productTemplateCss = joinCssSources([
    productUiCss,
    normalizeProductColumnCss(productPageCssPartitions.localCss),
  ]);
  const newsSourceCss = readSourceCss([
    'src/components/templates/NewsPages/NewsPages.base.css',
    'src/components/templates/NewsPages/NewsPages.css',
  ]);
  const newsCssPartitions = partitionCssByTargets(newsSourceCss, {
    list: [
      'filters',
      'text-link',
      'article-results-section',
      'article-results__',
      '.article',
      'article__',
    ],
    detail: [
      'article-details',
      'article-details__',
      'article-intro',
      'article-intro__',
      'article-body',
      'article-body__',
      'inline-image',
      'inline-image__',
      'clip-outside__wrap--small',
      '.card',
      'card__',
      'card--',
    ],
  });
  const newsListCss = joinCssSources([
    newsCssPartitions.localCss,
    newsCssPartitions.list,
  ]);
  const newsDetailCss = joinCssSources([
    newsCssPartitions.localCss,
    newsCssPartitions.detail,
  ]);
  const serviceCss = readSourceCss([
    'src/components/templates/ServicePages/ServicePages.base.css',
    'src/components/templates/ServicePages/ServicePages.css',
  ]);
  const homeCss = readSourceCss([
    'src/components/templates/HomePage/HomePage.base.css',
    'src/components/templates/HomePage/HomePage.css',
  ]);

  return [
    {
      code: 'spirax_shell',
      name: 'Spirax 公共壳层',
      type: 'component',
      sort_order: 1,
      content: buildShellComponent(),
      tsx_source: buildShellComponent(),
      css_source: buildShellGlobalCss(shellCss),
    },
    {
      code: 'spirax_site_nav',
      name: 'Spirax 站点导航组件',
      type: 'component',
      sort_order: 2,
      content: buildSiteNavComponent(),
      tsx_source: buildSiteNavComponent(),
      css_source: siteNavCss,
    },
    {
      code: 'button',
      name: '按钮组件',
      type: 'component',
      sort_order: 3,
      content: buildButtonComponent(),
      tsx_source: buildButtonComponent(),
      css_source: buildButtonGlobalCss(),
    },
    {
      code: 'spirax_short_masthead',
      name: 'Spirax 短横幅组件',
      type: 'component',
      sort_order: 3,
      content: buildShortMastheadComponent(),
      tsx_source: extractTemplateSourceParts(buildShortMastheadComponent()).tsx_source,
      css_source: shortMastheadCss,
    },
    {
      code: 'spirax_breadcrumbs',
      name: 'Spirax 面包屑组件',
      type: 'component',
      sort_order: 4,
      content: buildBreadcrumbsComponent(),
      tsx_source: buildBreadcrumbsComponent(),
      css_source: breadcrumbsCss,
    },
    {
      code: 'spirax_global_search',
      name: 'Spirax 全局搜索组件',
      type: 'component',
      sort_order: 5,
      content: buildGlobalSearchComponent(),
      tsx_source: buildGlobalSearchComponent(),
      css_source: globalSearchCss,
    },
    {
      code: 'spirax_content_card_grid',
      name: 'Spirax 内容卡片网格组件',
      type: 'component',
      sort_order: 6,
      content: buildContentCardGridComponent(),
      tsx_source: buildContentCardGridComponent(),
      css_source: contentCardGridCss,
    },
    {
      code: 'product_card_grid',
      name: '产品卡片网格组件',
      type: 'component',
      sort_order: 7,
      content: buildProductCardGridComponent(),
      tsx_source: buildProductCardGridComponent(),
      css_source: productCardGridCss,
    },
    {
      code: 'spirax_product_image_gallery',
      name: 'Spirax 产品图库组件',
      type: 'component',
      sort_order: 7,
      content: buildProductImageGalleryComponent(),
      tsx_source: extractTemplateSourceParts(buildProductImageGalleryComponent()).tsx_source,
      css_source: productImageGalleryCss,
    },
    {
      code: 'spirax_product_top_panel',
      name: 'Spirax 产品顶部面板组件',
      type: 'component',
      sort_order: 8,
      content: buildProductTopPanelComponent(),
      tsx_source: buildProductTopPanelComponent(),
      css_source: normalizeProductColumnCss(productPageCssPartitions.productTopPanel),
    },
    {
      code: 'spirax_copy_section',
      name: 'Spirax 文本区块组件',
      type: 'component',
      sort_order: 9,
      content: buildCopySectionComponent(),
    },
    {
      code: 'spirax_brand_path_section',
      name: 'Spirax 品牌路径区块组件',
      type: 'component',
      sort_order: 10,
      content: buildBrandPathSectionComponent(),
      tsx_source: buildBrandPathSectionComponent(),
      css_source: brandPathSectionCss,
    },
    {
      code: 'spirax_product_download_groups',
      name: 'Spirax 产品下载区块组件',
      type: 'component',
      sort_order: 11,
      content: buildProductDownloadGroupsComponent(),
      tsx_source: buildProductDownloadGroupsComponent(),
      css_source: normalizeProductColumnCss(productPageCssPartitions.productDownloadGroups),
    },
    {
      code: 'spirax_feature_cards',
      name: 'Spirax 卡片网格组件',
      type: 'component',
      sort_order: 12,
      content: buildFeatureCardsComponent(),
    },
    {
      code: 'spirax_product_side_nav',
      name: 'Spirax 产品侧栏组件',
      type: 'component',
      sort_order: 13,
      content: buildProductSideNavComponent(),
      tsx_source: buildProductSideNavComponent(),
      css_source: normalizeProductColumnCss(productPageCssPartitions.productSideNav),
    },
    {
      code: 'spirax_product_overview',
      name: 'Spirax 产品概览组件',
      type: 'component',
      sort_order: 13,
      content: buildProductOverviewComponent(),
      tsx_source: buildProductOverviewComponent(),
      css_source: normalizeProductColumnCss(productPageCssPartitions.productOverview),
    },
    {
      code: 'spirax_benefit_blocks',
      name: 'Spirax 优势区块组件',
      type: 'component',
      sort_order: 14,
      content: buildBenefitBlocksComponent(),
      tsx_source: buildBenefitBlocksComponent(),
      css_source: benefitBlocksCss,
    },
    {
      code: 'spirax_supplemental_sections',
      name: 'Spirax 补充内容区块组件',
      type: 'component',
      sort_order: 15,
      content: buildSupplementalSectionsComponent(),
    },
    {
      code: 'spirax_promo_banner',
      name: 'Spirax 推广横幅组件',
      type: 'component',
      sort_order: 16,
      content: buildPromoBannerComponent(),
      tsx_source: buildPromoBannerComponent(),
      css_source: normalizeProductColumnCss(productPageCssPartitions.promoBanner),
    },
    {
      code: 'spirax_home',
      name: 'Spirax 首页模板',
      type: 'home',
      sort_order: 1,
      content: buildHomeTemplate(homeCss),
    },
    {
      code: 'spirax_product_list',
      name: 'Spirax 产品列表模板',
      type: 'list',
      sort_order: 10,
      content: buildProductListTemplate(productTemplateCss),
    },
    {
      code: 'spirax_product_detail',
      name: 'Spirax 产品详情模板',
      type: 'content',
      sort_order: 20,
      content: buildProductDetailTemplate(productTemplateCss),
    },
    {
      code: 'spirax_article_list',
      name: 'Spirax 新闻列表模板',
      type: 'list',
      sort_order: 30,
      content: buildArticleListTemplate(newsListCss, 'news'),
    },
    {
      code: 'spirax_article_detail',
      name: 'Spirax 新闻详情模板',
      type: 'content',
      sort_order: 40,
      content: buildArticleDetailTemplate(newsDetailCss, 'news'),
    },
    {
      code: 'spirax_service_list',
      name: 'Spirax 服务列表模板',
      type: 'list',
      sort_order: 50,
      content: buildArticleListTemplate(newsListCss, 'service'),
    },
    {
      code: 'spirax_service_detail',
      name: 'Spirax 服务详情模板',
      type: 'content',
      sort_order: 60,
      content: buildServiceDetailTemplate(serviceCss),
    },
    {
      code: 'spirax_content_page',
      name: 'Spirax 单页内容模板',
      type: 'content',
      sort_order: 70,
      content: buildContentPageTemplate(),
    },
    {
      code: 'spirax_contact_page',
      name: 'Spirax 联系页模板',
      type: 'content',
      sort_order: 80,
      content: buildContactPageTemplate(),
    },
  ].map(normalizeTemplateDefinition);
}

function normalizeTemplateDefinition(definition) {
  const templateSourceParts = extractTemplateSourceParts(definition.content ?? '');
  const tsxSource = definition.tsx_source !== undefined
    ? String(definition.tsx_source ?? '')
    : templateSourceParts.tsx_source;
  const cssSource = definition.css_source !== undefined
    ? String(definition.css_source ?? '')
    : templateSourceParts.css_source;
  return {
    ...definition,
    tsx_source: tsxSource,
    css_source: cssSource,
  };
}

function partitionCssByTargets(cssText, targetMap) {
  const css = String(cssText || '');
  const blocks = parseCssBlocks(css);
  const bucketEntries = Object.entries(targetMap || {});
  const bucketBlocks = new Map(bucketEntries.map(([name]) => [name, []]));
  const localBlocks = [];

  for (const block of blocks) {
    const assignedBuckets = collectMatchingBuckets(block, targetMap);
    if (assignedBuckets.length === 0) {
      localBlocks.push(block);
      continue;
    }

    for (const bucket of assignedBuckets) {
      bucketBlocks.get(bucket)?.push(filterCssBlockByTargets(block, targetMap[bucket]));
    }
  }

  return {
    localCss: stringifyCssBlocks(localBlocks),
    ...Object.fromEntries(
      bucketEntries.map(([name]) => [name, stringifyCssBlocks(bucketBlocks.get(name) || [])]),
    ),
  };
}

function collectMatchingBuckets(block, targetMap) {
  if (!block || !targetMap || typeof targetMap !== 'object') {
    return [];
  }

  return Object.entries(targetMap)
    .filter(([, targets]) => blockMatchesTargets(block, targets))
    .map(([name]) => name);
}

function blockMatchesTargets(block, targets) {
  if (!block || !Array.isArray(targets) || targets.length === 0) {
    return false;
  }

  if (block.type === 'rule') {
    return selectorMatchesTargets(block.selectorText, targets);
  }

  if (block.type === 'atrule') {
    return block.children.some((child) => blockMatchesTargets(child, targets));
  }

  return false;
}

function filterCssBlockByTargets(block, targets) {
  if (block.type === 'rule') {
    const matchedSelectorText = filterSelectorListByTargets(block.selectorText, targets);
    if (!matchedSelectorText) {
      return null;
    }
    if (matchedSelectorText === block.selectorText) {
      return block;
    }
    return {
      ...block,
      selectorText: matchedSelectorText,
    };
  }

  if (block.type === 'atrule') {
    const children = block.children
      .map((child) => filterCssBlockByTargets(child, targets))
      .filter(Boolean);
    if (children.length === 0) {
      return null;
    }
    return {
      ...block,
      children,
    };
  }

  return null;
}

function selectorMatchesTargets(selectorText, targets) {
  return splitCssSelectorList(selectorText)
    .some((selector) => targets.some((target) => selectorContainsTarget(selector, target)));
}

function filterSelectorListByTargets(selectorText, targets) {
  const matchedSelectors = splitCssSelectorList(selectorText)
    .filter((selector) => targets.some((target) => selectorContainsTarget(selector, target)));
  return matchedSelectors.join(',\n');
}

function selectorContainsTarget(selector, target) {
  const normalizedSelector = String(selector || '');
  const normalizedTarget = String(target || '').trim();
  if (!normalizedSelector || !normalizedTarget) {
    return false;
  }

  if (normalizedTarget.startsWith('.')) {
    const escapedTarget = escapeRegExp(normalizedTarget);
    const pattern = new RegExp(`(^|[^A-Za-z0-9_-])${escapedTarget}(?![A-Za-z0-9_-])`);
    return pattern.test(normalizedSelector);
  }

  return normalizedSelector.includes(normalizedTarget);
}

function splitCssSelectorList(selectorText) {
  const source = String(selectorText || '');
  const selectors = [];
  let current = '';
  let inString = false;
  let stringQuote = '';
  let parenDepth = 0;
  let bracketDepth = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const previousChar = index > 0 ? source[index - 1] : '';

    if (inString) {
      current += char;
      if (char === stringQuote && previousChar !== '\\') {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = true;
      stringQuote = char;
      current += char;
      continue;
    }

    if (char === '(') {
      parenDepth += 1;
      current += char;
      continue;
    }

    if (char === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += char;
      continue;
    }

    if (char === '[') {
      bracketDepth += 1;
      current += char;
      continue;
    }

    if (char === ']') {
      bracketDepth = Math.max(0, bracketDepth - 1);
      current += char;
      continue;
    }

    if (char === ',' && parenDepth === 0 && bracketDepth === 0) {
      const selector = current.trim();
      if (selector) {
        selectors.push(selector);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trailingSelector = current.trim();
  if (trailingSelector) {
    selectors.push(trailingSelector);
  }

  return selectors;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stringifyCssBlocks(blocks) {
  return joinCssSources(
    (Array.isArray(blocks) ? blocks : [])
      .map((block) => stringifyCssBlock(block))
      .filter(Boolean),
  );
}

function stringifyCssBlock(block) {
  if (!block) {
    return '';
  }

  if (block.type === 'rule') {
    return `${block.selectorText} {\n${block.body.trim()}\n}`;
  }

  if (block.type === 'atrule') {
    const children = stringifyCssBlocks(block.children || []);
    if (!children) {
      return '';
    }
    return `${block.prelude} {\n${indentCss(children)}\n}`;
  }

  return '';
}

function parseCssBlocks(cssText) {
  const css = String(cssText || '');
  const blocks = [];
  let cursor = 0;

  while (cursor < css.length) {
    const nextBraceIndex = css.indexOf('{', cursor);
    if (nextBraceIndex === -1) {
      break;
    }

    const selectorText = css.slice(cursor, nextBraceIndex).trim();
    if (!selectorText) {
      cursor = nextBraceIndex + 1;
      continue;
    }

    const closeBraceIndex = findMatchingBrace(css, nextBraceIndex);
    if (closeBraceIndex === -1) {
      break;
    }

    const body = css.slice(nextBraceIndex + 1, closeBraceIndex);
    if (selectorText.startsWith('@')) {
      blocks.push({
        type: 'atrule',
        prelude: selectorText,
        children: parseCssBlocks(body),
      });
    } else {
      blocks.push({
        type: 'rule',
        selectorText,
        body,
      });
    }

    cursor = closeBraceIndex + 1;
  }

  return blocks;
}

function findMatchingBrace(text, openBraceIndex) {
  let depth = 0;
  let inString = false;
  let stringQuote = '';

  for (let index = openBraceIndex; index < text.length; index += 1) {
    const char = text[index];
    const previousChar = index > 0 ? text[index - 1] : '';

    if (inString) {
      if (char === stringQuote && previousChar !== '\\') {
        inString = false;
        stringQuote = '';
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = true;
      stringQuote = char;
      continue;
    }

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function indentCss(cssText) {
  return String(cssText || '')
    .split('\n')
    .map((line) => (line ? `  ${line}` : line))
    .join('\n');
}

function joinCssSources(parts) {
  return (Array.isArray(parts) ? parts : [])
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join('\n\n');
}

function normalizeProductColumnCss(cssText) {
  return String(cssText || '')
    .replace(/product-[^-]+-layout/g, 'product-column-layout')
    .replace(/product-[^-]+-sidebar/g, 'product-column-sidebar');
}

function extractTemplateSourceParts(content) {
  const source = String(content ?? '');
  const match = source.match(/export const (?:scss|css)\s*=\s*String\.raw`([\s\S]*?)`;\s*/);
  if (!match) {
    return {
      tsx_source: source,
      css_source: '',
    };
  }

  const startIndex = match.index || 0;
  const endIndex = startIndex + match[0].length;
  return {
    tsx_source: `${source.slice(0, startIndex)}${source.slice(endIndex)}`.trim(),
    css_source: match[1] || '',
  };
}

function buildShellGlobalCss(cssText) {
  return `${cssText}

.sg-page-shell img,
.sg-content-shell img {
  max-width: 100%;
  height: auto;
}

@media (max-width: 1050px) {
  .sg-site-footer__title--desktop {
    display: block;
    margin: 0 0 18px;
  }

  .sg-site-footer__trigger--mobile {
    display: none !important;
  }

  .sg-site-footer__list {
    display: block;
    padding: 0 0 18px;
  }
}

.breadcrumb {
  width: min(var(--sg-page-max-width), 100% - 40px);
  margin: 0 auto;
}

.breadcrumb .wrapper {
  width: 100%;
}

@media (max-width: 1050px) {
  .breadcrumb {
    width: min(100% - 24px, var(--sg-page-max-width));
  }

  .breadcrumb .wrapper {
    width: 100%;
  }
}
`;
}

function buildSiteNavComponent() {
  return `
import React from 'react';

function normalizeUrl(value = '') {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/index.html') {
    return '/';
  }
  return normalized.endsWith('/index.html') ? normalized.slice(0, -10) || '/' : normalized;
}

function isCurrentUrlActive(itemUrl = '', currentUrl = '') {
  const normalizedItemUrl = normalizeUrl(itemUrl);
  const normalizedCurrentUrl = normalizeUrl(currentUrl);
  if (!normalizedItemUrl || !normalizedCurrentUrl) {
    return false;
  }
  if (normalizedItemUrl === '/') {
    return normalizedCurrentUrl === '/';
  }
  return normalizedCurrentUrl === normalizedItemUrl || normalizedCurrentUrl.startsWith(normalizedItemUrl.endsWith('/') ? normalizedItemUrl : normalizedItemUrl + '/');
}

function hasActiveChild(children = [], currentUrl = '') {
  return children.some((child) => isCurrentUrlActive(child?.url || '', currentUrl));
}

function renderNavItems(items = [], currentUrl = '') {
  return items.map((item, index) => {
    const children = Array.isArray(item.children) ? item.children.filter((child) => child?.url) : [];
    const isActive = Boolean(item?.active) || isCurrentUrlActive(item?.url || '', currentUrl) || hasActiveChild(children, currentUrl);

    if (children.length > 0) {
      return (
        <li className="sg-global-nav__main-item" data-nav-group="" key={item.url || item.name || index}>
          <button
            aria-controls={\`site-nav-flyout-\${index}\`}
            aria-expanded="false"
            aria-haspopup="true"
            className={['sg-global-nav__main-link', 'sg-global-nav__main-trigger', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
            data-nav-group-toggle=""
            type="button"
          >
            {item.name}
          </button>
          <div className="sg-global-nav__flyout" id={\`site-nav-flyout-\${index}\`}>
            <div className="sg-global-nav__flyout-panel">
              <div className="sg-global-nav__flyout-header">
                <a className="sg-global-nav__flyout-head-link" href={item.url || '#'}>{item.name}</a>
              </div>
              <ul className="sg-global-nav__flyout-list">
                {children.map((child, childIndex) => (
                  <li className="sg-global-nav__flyout-item" key={child.url || child.name || childIndex}>
                    <a
                      className={['sg-global-nav__flyout-link', isCurrentUrlActive(child?.url || '', currentUrl) ? 'is-active' : ''].filter(Boolean).join(' ')}
                      href={child.url || '#'}
                      rel={child.openInNewTab ? 'noreferrer' : undefined}
                      target={child.openInNewTab ? '_blank' : undefined}
                    >
                      {child.name}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </li>
      );
    }

    return (
      <li className="sg-global-nav__main-item" key={item.url || item.name || index}>
        <a
          className={['sg-global-nav__main-link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')}
          href={item.url || '#'}
          rel={item.openInNewTab ? 'noreferrer' : undefined}
          target={item.openInNewTab ? '_blank' : undefined}
        >
          {item.name}
        </a>
      </li>
    );
  });
}

function renderUtilityItems(items = [], currentUrl = '') {
  return items
    .filter((item) => item?.url)
    .map((item, index) => (
      <li key={item.url || item.name || index}>
        <a className={['sg-global-nav__utility-link', isCurrentUrlActive(item?.url || '', currentUrl) ? 'is-active' : ''].filter(Boolean).join(' ')} href={item.url || '#'}>
          {item.name}
        </a>
      </li>
    ));
}

export default function Component(props) {
  const { site, siteColumns = [], currentPage } = props || {};
  const currentUrl = currentPage?.url || '';
  const utilityItems = [
    { url: '/about-us/', name: '关于我们' },
    { url: '/learn-about-steam/', name: '了解蒸汽' },
    { url: '/resources-and-design-tools/', name: '资源和设计工具' },
    { url: '/knowledge-exchange/', name: '知识中心' }
  ];

  return (
    <div className="sg-site-nav-shell" data-site-nav="">
      <header className="sg-global-nav">
        <div className="sg-global-nav__topbar">
          <div className="sg-global-nav__inner">
            <a aria-label={site?.company_name || site?.web_name || 'Site'} className="sg-global-nav__brand" href="/">
              <img
                alt={site?.company_name || site?.web_name || 'Spirax Sarco'}
                className="sg-global-nav__brand-mark"
                height="50"
                src="/logo.svg"
                width="171"
              />
            </a>

            <div className="sg-global-nav__launchers">
              <nav aria-label="顶部导航" className="sg-global-nav__utility sg-global-nav__utility--inline">
                <ul className="sg-global-nav__utility-list">
                  {renderUtilityItems(utilityItems, currentUrl)}
                </ul>
              </nav>

              <div className="sg-global-nav__search">
                <button
                  aria-controls="sg-global-search-dialog"
                  aria-haspopup="dialog"
                  aria-label="打开搜索"
                  className="sg-search-button sg-global-nav__action-button sg-global-nav__action-button--search"
                  data-search-open=""
                  title="打开搜索"
                  type="button"
                >
                  <svg aria-hidden="true" className="sg-search-button__icon" fill="none" viewBox="0 0 24 24">
                    <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"></circle>
                    <path d="m16 16 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
                  </svg>
                </button>
              </div>

              <button
                aria-controls="site-main-nav"
                aria-expanded="false"
                aria-label="菜单"
                className="sg-nav-hamburger sg-global-nav__action-button sg-global-nav__action-button--menu sg-global-nav__menu-toggle"
                data-nav-toggle=""
                type="button"
              >
                <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div aria-hidden="true" className="sg-global-nav__drawer-backdrop" data-nav-backdrop=""></div>

      <div className="sg-global-nav__main sg-global-nav__main--desktop" data-nav-panel="" id="site-main-nav">
        <div className="sg-global-nav__main-inner">
          <nav aria-label="顶部导航" className="sg-global-nav__utility sg-global-nav__utility--panel">
            <ul className="sg-global-nav__utility-list">
              {renderUtilityItems(utilityItems, currentUrl)}
            </ul>
          </nav>

          <nav aria-label="主导航">
            <ul className="sg-global-nav__main-list">
              {renderNavItems(siteColumns, currentUrl)}
            </ul>
          </nav>

          <div className="sg-primary-cta sg-primary-cta--badge-left sg-primary-cta--badge-desktop-left sg-primary-cta--badge-mobile-right">
            {props.component('button', {
              href: '/contact-us/',
              children: <span>联系我们</span>
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
`;
}

function buildShellComponent() {
  return `
import React from 'react';

function renderFooterLinks(columns = []) {
  const groups = columns.filter((item) => Array.isArray(item.children) && item.children.length > 0).slice(0, 4);
  return groups.map((group, index) => {
    const links = group.children.slice(0, 8);
    return (
      <section className="sg-site-footer__section" data-footer-section="" key={group.url || group.name || index}>
        <h2 className="sg-site-footer__title sg-site-footer__title--desktop" id={\`site-footer-heading-\${index}\`}>{group.name}</h2>
        <button
          aria-controls={\`site-footer-section-\${index}\`}
          aria-expanded="false"
          className="sg-site-footer__trigger sg-site-footer__trigger--mobile"
          data-footer-toggle=""
          type="button"
        >
          <span className="sg-site-footer__title">{group.name}</span>
          <span aria-hidden="true" className="sg-site-footer__chevron"></span>
        </button>
        <ul className="sg-site-footer__list" id={\`site-footer-section-\${index}\`}>
          {links.map((link, linkIndex) => (
            <li className="sg-site-footer__item" key={link.url || link.name || linkIndex}>
              <a className="sg-site-footer__link" href={link.url || '#'} target={link.openInNewTab ? '_blank' : undefined} rel={link.openInNewTab ? 'noreferrer' : undefined}>
                {link.name}
              </a>
            </li>
          ))}
        </ul>
      </section>
    );
  });
}

export default function Template({ site, siteColumns = [], currentPage, currentContent, currentColumn, currentSection, children, slots = {}, component }) {
  const pageTitle = currentPage?.title ? \`\${currentPage.title} - \${site?.web_name || ''}\` : (site?.web_name || '');
  const isHomePage = currentPage?.type === 'home' || currentPage?.url === '/' || currentPage?.url === '/index.html';
  const breadcrumbs = !isHomePage && typeof component === 'function'
    ? component('spirax_breadcrumbs', {
        ariaLabel: '面包屑导航',
        currentContent,
        currentColumn,
        currentSection,
        homeHref: '/',
        includeItemsWrapper: false,
        tag: 'nav'
      })
    : null;
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
      </head>
      <body>
        {typeof component === 'function' ? component('spirax_site_nav', { site, siteColumns, currentPage }) : null}
        {typeof component === 'function' ? component('spirax_global_search') : null}

        {slots?.masthead || null}
        {slots?.breadcrumbs || breadcrumbs || null}
        {children}

        <footer className="sg-site-footer" role="contentinfo">
          <div className="sg-site-footer__top">
            <div className="sg-site-footer__inner">
              <div className="sg-site-footer__grid">
                {renderFooterLinks(siteColumns)}
              </div>
            </div>
          </div>
          <div className="sg-site-footer__bottom">
            <div className="sg-site-footer__inner">
              <div className="sg-site-footer__meta">
                <div className="sg-site-footer__records">
                  <p>{site?.web_copyright || site?.company_name || site?.web_name || ''}</p>
                  {site?.icp_number ? <p>{site.icp_number}</p> : null}
                  {site?.company_phone ? <p>{site.company_phone}</p> : null}
                  {site?.company_address ? <p>{site.company_address}</p> : null}
                </div>
              </div>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
`;
}

function buildHomeTemplate(cssText) {
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const newsItems = Array.isArray(props.homeNewsItems) ? props.homeNewsItems : [];
  const productItems = Array.isArray(props.homeFeaturedProductItems) ? props.homeFeaturedProductItems : [];
  const serviceItems = Array.isArray(props.homeServiceItems) ? props.homeServiceItems : [];
  const productCards = props.component('spirax_feature_cards', { items: productItems, itemTitleKey: 'title' });
  const newsCards = props.component('spirax_feature_cards', { items: newsItems, itemTitleKey: 'title' });
  const serviceCards = props.component('spirax_feature_cards', { items: serviceItems, itemTitleKey: 'title' });
  const masthead = props.component('spirax_short_masthead', {
    className: 'home-hero bg--white',
    bodyClassName: 'home-hero__grid',
    bodyStyle: { maxWidth: 'none', width: '100%' },
    slots: {
      body: (
        <>
          <div className="home-hero__copy">
            <p className="home-hero__eyebrow">Spirax Sarco</p>
            <h1 className="display-heading">{props.site?.company_name || props.site?.web_name || 'Industrial Steam Solutions'}</h1>
            <p className="home-hero__summary">{props.site?.company_address || '蒸汽系统解决方案、产品与服务。'}</p>
            <div className="home-hero__actions">
              <a className="btn btn--primary" href="/valve/">查看产品</a>
              <a className="btn btn--secondary" href="/service/">服务</a>
            </div>
          </div>
          <div className="home-hero__panel">
            <div className="home-hero__metric">
              <span className="home-hero__metric-label">联系电话</span>
              <strong>{props.site?.company_phone || '-'}</strong>
            </div>
            <div className="home-hero__metric">
              <span className="home-hero__metric-label">联系邮箱</span>
              <strong>{props.site?.company_email || '-'}</strong>
            </div>
          </div>
        </>
      )
    }
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-page-shell sg-content-shell sg-home-page sg-home">
      <section className="bg--light-blue">
        <div className="wrapper wrapper--pad-l">
          <div className="section-header">
            <h2 className="section-header__title">精选产品</h2>
          </div>
          {productCards}
        </div>
      </section>

      <section className="bg--white">
        <div className="wrapper wrapper--pad-l">
          <div className="section-header">
            <h2 className="section-header__title">公司新闻</h2>
          </div>
          {newsCards}
        </div>
      </section>

      <section className="bg--light-blue">
        <div className="wrapper wrapper--pad-l">
          <div className="section-header">
            <h2 className="section-header__title">服务</h2>
          </div>
          {serviceCards}
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildProductListTemplate(cssText) {
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const pageData = props.currentColumnPageData || props.pageData || {};
  const normalizedPageKind = String(pageData?.pageKind || pageData?.kind || '').trim().toLowerCase();
  const productRoot = normalizedPageKind === 'root';
  const columnLandingPage = normalizedPageKind === 'column';
  const pageCards = Array.isArray(pageData?.cards) ? pageData.cards.filter(Boolean) : [];
  const pageModels = Array.isArray(pageData?.models) ? pageData.models.filter(Boolean) : [];
  const productItems = Array.isArray(props.productCardItems) ? props.productCardItems.filter(Boolean) : [];
  const listItems = Array.isArray(props.items) ? props.items.filter(Boolean) : [];
  const columnMainSource = pageCards.length > 0 ? pageCards : (productItems.length > 0 ? productItems : listItems);
  const hasTopPanel = Boolean(pageData?.topPanel && typeof pageData.topPanel === 'object');
  const terminalColumnPage = hasTopPanel || pageModels.length > 0;
  const siblingItems = Array.isArray(props.secondaryMenuItems) ? props.secondaryMenuItems.filter(Boolean) : [];
  const currentColumn = props.currentColumn || {};
  const parentColumn = props.parentColumn || null;
  const currentRouteUrl = currentColumn?.url || '';
  const hasParentColumn = Boolean(parentColumn?.url || parentColumn?.name);
  const normalizedColumnNavItems = siblingItems.map((item) => ({
    title: item?.title || item?.label || '',
    description: item?.description || item?.summary || '',
    image: item?.image || '',
    imageAlt: item?.imageAlt || item?.title || item?.label || '',
    href: item?.url || item?.href || '#',
    active: Boolean(item?.active) || (item?.url || item?.href || '') === currentRouteUrl,
    ctaLabel: item?.ctaLabel || ''
  }));
  const columnSidebar = normalizedColumnNavItems.length > 0 ? props.component('spirax_product_side_nav', {
    secondaryMenuItems: normalizedColumnNavItems,
    secondaryMenuTitle: props.secondaryMenuTitle,
    secondaryMenuParentUrl: props.secondaryMenuParentUrl
  }) : null;
  const modelsSidebar = normalizedColumnNavItems.length > 0 ? props.component('spirax_product_side_nav', {
    secondaryMenuItems: normalizedColumnNavItems,
    secondaryMenuTitle: hasParentColumn ? (parentColumn?.name || props.secondaryMenuTitle) : props.secondaryMenuTitle,
    secondaryMenuParentUrl: hasParentColumn ? (parentColumn?.url || '') : props.secondaryMenuParentUrl
  }) : null;
  const showLegacyPager = !columnLandingPage && !terminalColumnPage && Boolean(props.pagerHtml);
  const introSection = props.component('spirax_copy_section', {
    paragraphs: Array.isArray(pageData?.intro) ? pageData.intro : [],
    sectionClassName: 'intro-text-section bg--white',
    wrapperClassName: 'wrapper wrapper--pad-l',
    copyClassName: productRoot ? 'intro__copy copy' : 'intro__copy copy intro__copy--left',
    innerClassName: productRoot ? 'intro intro--large intro--blue' : ''
  });
  const benefitsSection = props.component('spirax_benefit_blocks', {
    title: '产品优势',
    items: Array.isArray(pageData?.benefits) ? pageData.benefits : []
  });
  const overviewSection = props.component('spirax_product_overview', {
    title: '概览',
    paragraphs: Array.isArray(pageData?.overview) ? pageData.overview : [],
    componentId: \`product-overview-\${props.bigId || props.currentColumn?.id || 'column'}\`,
    showAllLabel: '展开全部',
    collapseLabel: '收起'
  });
  const masthead = props.component('spirax_short_masthead', {
    title: pageData?.title || props.smallName || props.title,
    summary: pageData?.summary || props.currentColumnDescription || props.currentColumn?.seoDescription || '',
    image: pageData?.mastheadImage || props.currentColumnHeroImage || '',
    imageAlt: pageData?.title || props.smallName || props.title || '',
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const topPanel = hasTopPanel ? props.component('spirax_product_top_panel', {
    product: {
      title: pageData?.title || props.smallName || props.title || '',
      summary: pageData?.summary || props.currentColumnDescription || '',
      primaryImage: pageData?.mastheadImage || props.currentColumnHeroImage || '',
      images: Array.isArray(pageData?.topPanel?.images) ? pageData.topPanel.images : []
    },
    title: pageData?.title || props.smallName || props.title || '',
    image: pageData?.mastheadImage || props.currentColumnHeroImage || '',
    topPanel: pageData?.topPanel || null,
    quickFactsTitle: 'Quick facts'
  }) : null;
  const cards = props.component('product_card_grid', {
    cards: columnMainSource.map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || item?.description || '',
      image: item?.image || '',
      imageAlt: item?.imageAlt || item?.name || item?.title || '',
      href: item?.url || item?.link || item?.href || '',
      itemClassName: ['product-card-grid__item', item?.image ? 'product-card-grid__item--grey' : 'product-card-grid__item--light-blue'].filter(Boolean).join(' '),
      linkClassName: 'product-card-grid__link',
      titleClassName: 'product-card-grid__title product-card-grid__title--uppercase'
    })),
    wrapperClassName: 'product-card-grid--mobile-carousel'
  });
  const modelsSection = props.component('product_card_grid', {
    cards: pageModels.map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || item?.description || '',
      image: item?.image || '',
      imageAlt: item?.imageAlt || item?.name || item?.title || '',
      href: item?.url || item?.link || item?.href || '',
      itemClassName: 'product-card-grid__item',
      linkClassName: 'product-card-grid__link',
      titleClassName: 'product-card-grid__title product-card-grid__title--uppercase'
    }))
  });
  const downloadsSection = props.component('spirax_product_download_groups', {
    downloads: Array.isArray(pageData?.downloads) ? pageData.downloads : []
  });
  const brandPathSection = props.component('spirax_brand_path_section', {
    title: pageData?.brandPathSection?.title || '',
    intro: pageData?.brandPathSection?.intro || '',
    cards: Array.isArray(pageData?.brandPathSection?.cards) ? pageData.brandPathSection.cards : []
  });
  const supplementalSections = props.component('spirax_supplemental_sections', {
    sections: Array.isArray(pageData?.supplementalSections) ? pageData.supplementalSections : []
  });
  const sectionNavItems = Array.isArray(props.sectionNavItems) ? props.sectionNavItems.filter(Boolean) : [];
  const bodySection = !columnLandingPage && Boolean(props.bodyHtml)
    ? (
      terminalColumnPage ? (
        <section className="bg--white product-detail__body-section">
          <div className="wrapper wrapper--pad-l">
            <div className="product-detail__body-shell">
              <div className="product-detail__body-main">
                <div className="intro__copy copy intro__copy--left product-detail__body">
                  <div dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
                </div>
              </div>
              {sectionNavItems.length > 0 ? (
                <aside className="product-detail__body-rail">
                  <nav className="product-section-nav">
                    <p className="product-section-nav__eyebrow">On this page</p>
                    <div className="product-section-nav__list">
                      {sectionNavItems.map((item, index) => (
                        <a className="product-section-nav__link" href={item?.href || '#'} key={item?.href || item?.label || index}>
                          {item?.label || ''}
                        </a>
                      ))}
                    </div>
                  </nav>
                </aside>
              ) : null}
            </div>
          </div>
        </section>
      ) : (
        <section className="bg--white sg-product-page__supplemental-section">
          <div className="wrapper wrapper--pad-l">
            <div className="intro__copy copy intro__copy--left sg-info-page">
              <div dangerouslySetInnerHTML={{ __html: props.bodyHtml }} />
            </div>
          </div>
        </section>
      )
    )
    : null;
  const content = (
    <main className="sg-page-shell sg-product-page">
      {topPanel}
      {introSection}
      {benefitsSection}
      {overviewSection}
      {bodySection}

      {columnMainSource.length > 0 ? (
        <section className={(productRoot || columnMainSource.some((item) => item?.image)) ? 'bg--light-blue' : 'bg--white'}>
          <div className="wrapper wrapper--pad-l">
            <div className="product-column-layout__shell">
              {columnSidebar}
              <div className="product-column-layout__main">
                {cards}
                {showLegacyPager ? <div className="legacy-pager" dangerouslySetInnerHTML={{ __html: props.pagerHtml }} /> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {pageModels.length > 0 ? (
        <section className="bg--light-blue">
          <div className="wrapper wrapper--pad-l">
            <div className="product-column-layout__shell">
              {modelsSidebar}
              <div className="product-column-layout__main">
                {modelsSection}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {supplementalSections}
      {downloadsSection}
      {brandPathSection}
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildFeatureCardsComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const items = Array.isArray(props.items) ? props.items : [];
  const titleKey = props.itemTitleKey || 'title';
  const cards = items.map((item) => ({
    title: item?.[titleKey] || item?.title || item?.name || '',
    description: item?.summary || '',
    image: item?.image || (props.showImagePlaceholder ? '/skin/dfpic.gif' : ''),
    imageAlt: item?.[titleKey] || item?.title || item?.name || '',
    href: item?.url || '',
    itemClassName: 'content-card-grid__item content-card-grid__item--grey',
    linkClassName: 'content-card-grid__link',
    titleClassName: 'content-card-grid__title'
  }));

  return props.component('spirax_content_card_grid', {
    cards,
    gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
    wrapperClassName: 'content-card-grid content-card-grid--mobile-carousel'
  });
}
`;
}

function buildProductSideNavComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const items = Array.isArray(props.secondaryMenuItems) ? props.secondaryMenuItems : [];
  const eyebrow = props.secondaryMenuTitle || 'Browse columns';
  const eyebrowLink = props.secondaryMenuParentUrl || '';

  return (
    <aside className="product-column-sidebar">
      <div className="product-column-sidebar__inner">
        <p className="product-column-sidebar__eyebrow">
          {eyebrowLink ? <a className="product-column-sidebar__eyebrow-link" href={eyebrowLink}>{eyebrow}</a> : eyebrow}
        </p>
        <nav className="product-column-sidebar__nav">
          <ul className="product-column-sidebar__list">
            {items.map((item, index) => (
              <li className="product-column-sidebar__item" key={item?.url || item?.href || item?.title || item?.label || index}>
                <a
                  aria-current={item?.active ? 'page' : undefined}
                  className={[
                    'product-column-sidebar__link',
                    item?.image ? 'product-column-sidebar__link--with-image' : '',
                    item?.active ? 'is-active' : ''
                  ].filter(Boolean).join(' ')}
                  href={item?.url || item?.href || '#'}
                >
                  {item?.image ? (
                    <img
                      alt={item?.imageAlt || item?.title || item?.label || ''}
                      className="product-column-sidebar__image"
                      height="72"
                      loading="lazy"
                      src={item.image}
                      width="72"
                    />
                  ) : null}
                  <span className="product-column-sidebar__content">
                    <span className="product-column-sidebar__title">{item?.title || item?.label || ''}</span>
                    {item?.description ? <span className="product-column-sidebar__desc">{item.description}</span> : null}
                    {item?.ctaLabel ? <span className="product-column-sidebar__cta">{item.ctaLabel}</span> : null}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
`;
}

function buildProductOverviewComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    componentId = 'product-overview',
    paragraphs = [],
    title = 'Overview',
    wrapperClassName = 'wrapper wrapper--sml wrapper--pad-l'
  } = props || {};
  const items = Array.isArray(paragraphs) ? paragraphs.filter(Boolean) : [];
  const overviewText = items.join('\\n\\n');

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="intro-text-section bg--white product-overview" id={componentId}>
      <div className={wrapperClassName}>
        <h2 className="display-heading">{title}</h2>
        <div className="intro__copy copy intro__copy--left">
          <p className="product-overview__text">{overviewText}</p>
        </div>
      </div>
    </section>
  );
}
`;
}

function buildBenefitBlocksComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const items = Array.isArray(props?.items) ? props.items.filter((item) => item?.title) : [];
  const title = props?.title || 'Benefits';

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="sg-icon-block-section sg-icon-block-section--plain bg--white">
      <div className="wrapper">
        <div className="section-header">
          <h2 className="section-header__title">{title}</h2>
        </div>
        <div className="icon-blocks">
          <div className="grid icon-blocks__grid">
            {items.map((item, index) => (
              <article className="icon-block" key={item?.title || index}>
                <div className="icon-block__header">
                  <div aria-hidden="true" className="icon-block__icon">
                    <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 12.5 9.5 17 19 7.5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.25" />
                    </svg>
                  </div>
                  <h3 className="icon-block__heading">{item?.title || ''}</h3>
                </div>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
`;
}

function buildSupplementalSectionsComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const sections = Array.isArray(props?.sections) ? props.sections.filter(Boolean) : [];

  if (sections.length === 0) {
    return null;
  }

  return (
    <>
      {sections.map((section, index) => {
        const paragraphs = Array.isArray(section?.paragraphs) ? section.paragraphs.filter(Boolean) : [];
        const htmlBlocks = Array.isArray(section?.htmlBlocks) ? section.htmlBlocks.filter(Boolean) : [];

        if (!section?.title && paragraphs.length === 0 && htmlBlocks.length === 0) {
          return null;
        }

        return (
          <section className="bg--white sg-product-page__supplemental-section" key={section?.title || index}>
            <div className="wrapper wrapper--pad-l">
              {section?.title ? <h2 className="display-heading">{section.title}</h2> : null}
              <div className="intro__copy copy intro__copy--left sg-info-page">
                {htmlBlocks.length > 0
                  ? htmlBlocks.map((html, htmlIndex) => <div className="sg-info-page__html-block" dangerouslySetInnerHTML={{ __html: html }} key={htmlIndex} />)
                  : paragraphs.map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{paragraph}</p>)}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
`;
}

function buildPromoBannerComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    actions = [],
    actionsClassName = '',
    actionsPlacement = 'beside-copy',
    bannerClassName = '',
    copyClassName = 'promo-banner__copy',
    sectionClassName = 'promo-bg',
    sectionStyle,
    subtitle = '',
    title = '',
    titleClassName = 'promo-banner__heading',
    titleTag = 'h2'
  } = props || {};
  const items = Array.isArray(actions) ? actions.filter((item) => item?.label) : [];
  const TitleTag = titleTag === 'h3' ? 'h3' : 'h2';
  const actionNodes = items.length > 0 ? (
    <>
      {items.map((item, index) => props.component('button', {
        href: item?.href || '',
        target: item?.target,
        rel: item?.rel,
        variant: item?.variant || 'primary',
        className: item?.className || '',
        children: item?.label || '',
        key: item?.href || item?.label || index
      }))}
    </>
  ) : null;

  return (
    <section className={sectionClassName || undefined} style={sectionStyle}>
      <div className="wrapper">
        <div className={['promo-banner', bannerClassName].filter(Boolean).join(' ')}>
          <div className={copyClassName || undefined}>
            {title ? <TitleTag className={titleClassName || undefined}>{title}</TitleTag> : null}
            {subtitle ? <p>{subtitle}</p> : null}
            {actionNodes && actionsPlacement === 'inside-copy' ? (
              <div className={actionsClassName || undefined}>{actionNodes}</div>
            ) : null}
          </div>
          {actionNodes && actionsPlacement !== 'inside-copy' ? (
            <div className={actionsClassName || undefined}>{actionNodes}</div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
`;
}

function buildProductDetailTemplate(cssText) {
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const product = props.currentProduct || props.currentContent || {};
  const productPageData = product.pageData || props.currentProductPageData || {};
  const sectionNavItems = Array.isArray(props.sectionNavItems) ? props.sectionNavItems : [];
  const masthead = props.component('spirax_short_masthead', {
    title: product.title || props.title,
    image: product.primaryImage || props.image || '',
    imageAlt: product.title || props.title || '',
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const topPanel = props.component('spirax_product_top_panel', {
    product,
    image: product.primaryImage || props.image || '/skin/dfpic.gif',
    title: product.title || props.title,
    topPanel: productPageData?.topPanel || null,
    quickFactsTitle: 'Quick facts'
  });
  const downloadsSection = props.component('spirax_product_download_groups', {
    downloads: Array.isArray(productPageData?.downloads) ? productPageData.downloads : []
  });
  const brandPathSection = props.component('spirax_brand_path_section', {
    title: productPageData?.brandPathSection?.title || '',
    intro: productPageData?.brandPathSection?.intro || '',
    cards: Array.isArray(productPageData?.brandPathSection?.cards) ? productPageData.brandPathSection.cards : []
  });
  const supplementalSections = props.component('spirax_supplemental_sections', {
    sections: Array.isArray(productPageData?.supplementalSections) ? productPageData.supplementalSections : []
  });
  const relatedCards = props.component('product_card_grid', {
    cards: (props.relatedProductItems || []).map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || '',
      image: item?.image || '',
      imageAlt: item?.name || item?.title || '',
      href: item?.url || '',
      itemClassName: 'product-card-grid__item product-card-grid__item--grey',
      linkClassName: 'product-card-grid__link',
      titleClassName: 'product-card-grid__title'
    })),
    wrapperClassName: 'product-card-grid--mobile-carousel'
  });
  const content = (
    <main className="sg-page-shell sg-product-page">
      {topPanel}

      <section className="bg--white product-detail__body-section">
        <div className="wrapper wrapper--pad-l">
          <div className="product-detail__body-shell">
            <div className="product-detail__body-main">
              <div className="intro__copy copy intro__copy--left product-detail__body">
                <div dangerouslySetInnerHTML={{ __html: product.bodyHtml || props.bodyHtml || '' }} />
              </div>
            </div>
            {sectionNavItems.length > 0 ? (
              <aside className="product-detail__body-rail">
                <nav className="product-section-nav">
                  <p className="product-section-nav__eyebrow">On this page</p>
                  <div className="product-section-nav__list">
                    {sectionNavItems.map((item, index) => (
                      <a className="product-section-nav__link" href={item?.href || '#'} key={item?.href || item?.label || index}>
                        {item?.label || ''}
                      </a>
                    ))}
                  </div>
                </nav>
              </aside>
            ) : null}
          </div>
        </div>
      </section>

      {Array.isArray(props.relatedProductItems) && props.relatedProductItems.length > 0 ? (
        <section className="bg--light-blue clip-outside__wrap--small">
          <div className="wrapper wrapper--pad-l">
            <div className="section-header">
              <h2 className="section-header__title">相关产品</h2>
            </div>
            {relatedCards}
          </div>
        </section>
      ) : null}

      {supplementalSections}

      {downloadsSection}
      {brandPathSection}

      {props.component('spirax_promo_banner', {
        title: '联系我们获取技术支持',
        subtitle: '如需确认选型、资料或替换路径，可直接联系斯派莎克团队。',
        copyClassName: 'promo-banner__copy promo-banner__copy--centered',
        actionsClassName: 'promo-banner__actions',
        actions: [
          {
            href: '/contact-us/',
            label: '联系页面',
            className: 'btn btn--primary',
            variant: 'none',
            size: 'none'
          },
          ...(props.site?.company_phone ? [{
            href: \`tel:\${props.site.company_phone}\`,
            label: props.site.company_phone,
            className: 'btn btn--secondary',
            variant: 'none',
            size: 'none'
          }] : [])
        ]
      })}
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildButtonComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    href = '',
    children = null,
    className = '',
    variant = '',
    size = 'md',
    type = 'button',
    disabled = false,
    target,
    rel,
    ...rest
  } = props || {};
  const domProps = Object.fromEntries(
    Object.entries(rest).filter(([key]) => (
      key === 'id'
      || key === 'title'
      || key === 'role'
      || key === 'tabIndex'
      || key === 'name'
      || key === 'value'
      || key === 'download'
      || key.startsWith('data-')
      || key.startsWith('aria-')
    ))
  );
  const classes = [
    'sg-ui-button',
    size && size !== 'none' ? \`sg-ui-button--\${size}\` : '',
    variant && variant !== 'none' ? \`sg-ui-button--\${variant}\` : '',
    className || ''
  ].filter(Boolean).join(' ');

  if (href && !disabled) {
    return <a {...domProps} className={classes} href={href} rel={rel} target={target}>{children}</a>;
  }

  return <button {...domProps} className={classes} disabled={disabled} type={type}>{children}</button>;
}
`;
}

function buildButtonGlobalCss() {
  return `
.sg-ui-button,
.sg-ui-tag,
.sg-ui-dropdown__trigger,
.sg-ui-input,
.sg-ui-select__trigger,
.sg-ui-choice__control {
  --sg-ui-color-brand: var(--sg-color-brand, var(--rp-c-brand, #0050c7));
  --sg-ui-color-brand-dark: var(--sg-color-brand-dark, var(--rp-c-brand-dark, #002d72));
  --sg-ui-color-brand-tint: var(
    --sg-color-brand-tint,
    var(--rp-c-brand-tint, rgba(0, 45, 114, 0.12))
  );
  --sg-ui-color-text-1: var(--sg-color-text-1, var(--rp-c-text-1, #002d72));
  --sg-ui-color-text-2: var(--sg-color-text-2, var(--rp-c-text-2, #48648f));
  --sg-ui-color-text-3: var(--sg-color-text-3, var(--rp-c-text-3, #7b92b3));
  --sg-ui-focus-ring: 0 0 0 3px var(--sg-ui-color-brand-tint);
  box-sizing: border-box;
  font: inherit;
}

.sg-ui-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: max-content;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--sg-ui-color-brand-dark);
  color: #fff;
  font-size: 13px;
  font-weight: 400;
  line-height: 1;
  text-decoration: none;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease;
  cursor: pointer;
}

.sg-ui-button:hover,
.sg-ui-button:focus-visible {
  background: var(--sg-ui-color-brand);
  text-decoration: none;
}

.sg-ui-button:focus-visible {
  outline: 0;
  box-shadow: var(--sg-ui-focus-ring);
}

.sg-ui-button--sm {
  min-height: 38px;
  padding: 0 16px;
}

.sg-ui-button--md {
  min-height: 46px;
  padding: 0 22px;
}

.sg-ui-button--lg {
  min-height: 54px;
  padding: 0 28px;
}

.sg-ui-button--primary {
  background: var(--sg-ui-color-brand-dark);
  color: #fff;
}

.sg-ui-button--primary:hover,
.sg-ui-button--primary:focus-visible {
  background: var(--sg-ui-color-brand);
}

.sg-ui-button--secondary {
  background: var(--sg-color-primary-soft);
  color: var(--sg-color-primary-strong);
}

.sg-ui-button--secondary:hover,
.sg-ui-button--secondary:focus-visible {
  background: var(--sg-color-primary-soft-hover);
}

.sg-ui-button--warning {
  background: var(--sg-color-warning);
  color: var(--sg-color-warning-contrast);
}

.sg-ui-button--warning:hover,
.sg-ui-button--warning:focus-visible {
  background: var(--sg-color-warning-hover);
  color: var(--sg-color-warning-contrast);
}

.sg-ui-button--outline {
  border-color: var(--sg-ui-color-brand);
  background: transparent;
  color: var(--sg-ui-color-brand-dark);
}

.sg-ui-button--outline:hover,
.sg-ui-button--outline:focus-visible {
  background: var(--sg-ui-color-brand-tint);
}

.sg-ui-button--ghost,
.sg-ui-button--link {
  background: transparent;
  color: var(--sg-ui-color-brand-dark);
}

.sg-ui-button--ghost:hover,
.sg-ui-button--ghost:focus-visible {
  background: var(--sg-ui-color-brand-tint);
}

.sg-ui-button--link {
  min-height: auto;
  padding: 0;
  border-radius: var(--sg-radius-none);
  font-weight: 400;
}

.sg-ui-button--link:hover,
.sg-ui-button--link:focus-visible {
  color: var(--sg-ui-color-brand);
  text-decoration: underline;
  box-shadow: none;
}

.sg-ui-button--disabled,
.sg-ui-button:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}
`;
}

function buildShortMastheadComponent() {
  return `
import React from 'react';

export const scss = String.raw\`
.sg-short-masthead {
  --sg-short-masthead-min-height: 228px;
  --sg-short-masthead-mobile-min-height: 228px;
  --sg-short-masthead-content-max-width: 760px;
  --sg-short-masthead-content-padding: 38px 0;
  --sg-short-masthead-overlay:
    linear-gradient(
      90deg,
      rgba(0, 45, 114, 0.94) 0%,
      rgba(0, 79, 153, 0.78) 50%,
      rgba(0, 45, 114, 0.94) 100%
    );
  --sg-short-masthead-image-opacity: 0.34;
  position: relative;
  display: flex;
  min-height: var(--sg-short-masthead-min-height);
  overflow: hidden;
  color: #fff;
  background: var(--sg-blue);
}

.sg-short-masthead--hero {
  --sg-short-masthead-min-height: 400px;
  --sg-short-masthead-mobile-min-height: 320px;
  --sg-short-masthead-content-max-width: 650px;
  --sg-short-masthead-content-padding: 48px 0;
}

.sg-short-masthead__overlay {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 1;
  background: var(--sg-short-masthead-overlay);
  pointer-events: none;
}

.sg-short-masthead__text {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  width: min(var(--sg-page-max-width), 100% - 40px);
  min-height: var(--sg-short-masthead-min-height);
  margin: 0 auto;
  padding: var(--sg-short-masthead-content-padding);
}

.sg-short-masthead__body {
  max-width: var(--sg-short-masthead-content-max-width);
}

.sg-short-masthead__eyebrow {
  margin: 0 0 12px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.sg-short-masthead__heading {
  margin: 0;
  color: #fff;
}

.sg-short-masthead__summary {
  margin: 18px 0 0;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.4;
}

.sg-short-masthead__image {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  opacity: var(--sg-short-masthead-image-opacity);
}

.sg-short-masthead--with-image {
  --sg-short-masthead-overlay:
    linear-gradient(
      90deg,
      rgba(0, 45, 114, 0.82) 0%,
      rgba(0, 79, 153, 0.62) 50%,
      rgba(0, 45, 114, 0.82) 100%
    );
  --sg-short-masthead-image-opacity: 0.62;
}

@media (max-width: 1050px) {
  .sg-short-masthead,
  .sg-short-masthead__text {
    min-height: var(--sg-short-masthead-mobile-min-height);
  }

  .sg-short-masthead[data-mobile-align=center] .sg-short-masthead__text {
    justify-content: center;
  }

  .sg-short-masthead[data-mobile-align=center] .sg-short-masthead__heading,
  .sg-short-masthead[data-mobile-align=center] .sg-short-masthead__summary,
  .sg-short-masthead[data-mobile-align=center] .sg-short-masthead__eyebrow {
    text-align: center;
  }
}
\`;

export default function Component(props) {
  const {
    align = 'left',
    bodyClassName = '',
    bodyStyle,
    className = '',
    eyebrow = '',
    eyebrowClassName = '',
    headingClassName = '',
    image = '',
    imageAlt = '',
    mobileAlign = 'center',
    overlayStyle,
    size = 'short',
    slots = {},
    summary = '',
    summaryClassName = '',
    textClassName = '',
    title = ''
  } = props || {};
  const resolvedImage = typeof image === 'string' ? image.trim() : '';
  const hasImage = Boolean(resolvedImage);
  const customBody = props.children ?? slots?.body ?? null;

  return (
    <header
      className={['sg-short-masthead', \`sg-short-masthead--\${size}\`, hasImage ? 'sg-short-masthead--with-image' : '', className || ''].filter(Boolean).join(' ')}
      data-align={align}
      data-mobile-align={mobileAlign}
      data-size={size}
    >
      {hasImage ? (
        <img alt={imageAlt || title || ''} aria-hidden="true" className="sg-short-masthead__image" fetchPriority="high" loading="eager" src={resolvedImage} />
      ) : null}
      <div aria-hidden="true" className="sg-short-masthead__overlay" style={overlayStyle}></div>
      <div className={['sg-short-masthead__text', textClassName].filter(Boolean).join(' ')}>
        <div className={['sg-short-masthead__body', bodyClassName].filter(Boolean).join(' ')} style={bodyStyle}>
          {customBody ? customBody : (
            <>
              {eyebrow ? <p className={['sg-short-masthead__eyebrow', eyebrowClassName].filter(Boolean).join(' ')}>{eyebrow}</p> : null}
              {title ? <h1 className={['sg-short-masthead__heading', 'masthead__heading', headingClassName].filter(Boolean).join(' ')}>{title}</h1> : null}
              {summary ? <p className={['sg-short-masthead__summary', summaryClassName].filter(Boolean).join(' ')}>{summary}</p> : null}
            </>
          )}
        </div>
      </div>
    </header>
  );
}
`;
}

function buildBreadcrumbsComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    ariaLabel = 'Breadcrumb',
    homeHref = '/',
    homeLabel = '首页',
    includeHome = true,
    includeItemsWrapper = true,
    items = [],
    currentContent = null,
    currentColumn = [],
    currentSection = null,
    tag = 'div'
  } = props || {};

  const normalizedItems = Array.isArray(items)
    ? items
        .filter((item) => item && String(item?.label || item?.name || '').trim())
        .map((item) => ({
          current: Boolean(item?.current),
          href: String(item?.href || item?.url || '').trim(),
          label: String(item?.label || item?.name || '').trim()
        }))
    : [];

  const sectionName = String(currentSection?.name || '').trim();
  const sectionUrl = String(currentSection?.url || '').trim();
  const sectionType = String(currentSection?.type || '').trim().toLowerCase();
  const columnItems = Array.isArray(currentColumn)
    ? currentColumn
        .filter((item) => item && String(item?.name || item?.label || '').trim())
        .map((item) => ({
          href: String(item?.url || item?.href || '').trim(),
          label: String(item?.name || item?.label || '').trim()
        }))
    : [];
  const contentTitle = String(currentContent?.title || currentContent?.name || '').trim();

  const shouldIncludeSection = Boolean(sectionName)
    && (
      columnItems.length === 0
      || !['content', 'page-tree'].includes(sectionType)
    );
  const derivedItems = [
    ...(shouldIncludeSection ? [{ label: sectionName, href: sectionUrl }] : []),
    ...columnItems,
    ...(contentTitle ? [{ label: contentTitle, href: '', current: true }] : [])
  ];

  const sourceItems = normalizedItems.length > 0 ? normalizedItems : derivedItems;
  if (sourceItems.length === 0) {
    return null;
  }

  const firstItem = sourceItems[0] || null;
  const normalizedHomeHref = String(homeHref || '').trim();
  const firstHref = String(firstItem?.href || firstItem?.url || '').trim();
  const firstLabel = String(firstItem?.label || '').trim();
  const firstItemIsHome = Boolean(firstItem)
    && firstLabel === homeLabel
    && (firstHref === normalizedHomeHref || firstHref === '/index.html' || firstHref === '/');
  const homePrependedItems = includeHome
    ? [
        { label: homeLabel, href: normalizedHomeHref || '/' },
        ...(firstItemIsHome ? sourceItems.slice(1) : sourceItems)
      ]
    : sourceItems;
  const resolvedItems = homePrependedItems.reduce((acc, item) => {
    const previous = acc[acc.length - 1] || null;
    if (previous && previous.label === item.label && previous.href === item.href) {
      return acc;
    }
    acc.push(item);
    return acc;
  }, []);
  const hasExplicitCurrent = resolvedItems.some((item) => Boolean(item?.current));
  const finalizedItems = resolvedItems.map((item, index) => {
    const isLast = index === resolvedItems.length - 1;
    if (Boolean(item?.current) || (!hasExplicitCurrent && isLast)) {
      return {
        ...item,
        current: true,
        href: ''
      };
    }
    return item;
  });
  const Tag = tag === 'nav' ? 'nav' : 'div';
  const content = finalizedItems.map((item, index) => {
    const isCurrent = Boolean(item?.current);
    return (
      <React.Fragment key={\`\${item?.label || ''}-\${index}\`}>
        {isCurrent ? (
          <span className="breadcrumb__link is-current">{item?.label || ''}</span>
        ) : (
          <a className="breadcrumb__link" href={item?.href || '#'}>{item?.label || ''}</a>
        )}
        {index < finalizedItems.length - 1 ? <span aria-hidden="true" className="breadcrumb__sep">/</span> : null}
      </React.Fragment>
    );
  });

  return (
    <Tag aria-label={ariaLabel} className="breadcrumb">
      <div className="wrapper" style={{ display: 'flex', minHeight: '42px', alignItems: 'center' }}>
        {includeItemsWrapper ? (
          <div className="breadcrumb__items">
            <div className="breadcrumb__items-wrap">{content}</div>
          </div>
        ) : (
          <div className="breadcrumb__items-wrap">{content}</div>
        )}
      </div>
    </Tag>
  );
}
`;
}

function buildGlobalSearchComponent(cssText) {
  return `
import React from 'react';

export default function Component(props) {
  const messages = {
    cancelLabel: '取消',
    clearLabel: '清除搜索内容',
    closeLabel: '关闭搜索',
    emptyBody: '未找到相关内容，请尝试其他关键词。',
    emptyTitle: '没有搜索结果',
    loadingLabel: '搜索中...',
    placeholder: '搜索产品、文章或解决方案',
    resultsLabel: '站内搜索结果',
    unavailableBody: '当前无法加载搜索，请稍后重试。',
    unavailableTitle: '搜索暂不可用',
    ...(props?.messages && typeof props.messages === 'object' ? props.messages : {})
  };
  const searchApiUrl = String(props?.searchApiUrl || '/api/search').trim() || '/api/search';

  return (
    <div
      className="sg-global-search"
      data-global-search=""
      data-search-api-url={searchApiUrl}
      data-search-messages={JSON.stringify(messages)}
      hidden
    >
      <button
        aria-label={messages.closeLabel}
        className="sg-global-search__backdrop"
        data-global-search-close=""
        type="button"
      ></button>

      <section
        aria-label={messages.resultsLabel}
        aria-modal="true"
        className="sg-global-search__panel"
        id="sg-global-search-dialog"
        role="dialog"
      >
        <div className="sg-global-search__topbar">
          <div className="sg-global-search__field-shell">
            <svg aria-hidden="true" className="sg-global-search__icon" fill="none" viewBox="0 0 24 24">
              <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8"></circle>
              <path d="m16 16 4.5 4.5" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8"></path>
            </svg>
            <input
              autoComplete="off"
              className="sg-global-search__input"
              data-global-search-input=""
              name="q"
              placeholder={messages.placeholder}
              spellCheck="false"
              type="search"
            />
            <button
              aria-label={messages.clearLabel}
              className="sg-global-search__clear"
              data-global-search-clear=""
              hidden
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <button
            aria-label={messages.closeLabel}
            className="sg-global-search__close"
            data-global-search-close=""
            type="button"
          >
            {messages.cancelLabel}
          </button>
        </div>

        <div className="sg-global-search__results-shell">
          <div className="sg-global-search__state" data-global-search-state="" hidden></div>
          <div className="sg-global-search__results" data-global-search-results="" hidden></div>
        </div>
      </section>
    </div>
  );
}
`;
}

function buildContentCardGridComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    cards = [],
    contentClassName = 'content-card-grid__content',
    ctaClassName = 'content-card-grid__cta',
    descriptionClassName = 'content-card-grid__desc',
    gridClassName = 'content-card-grid__grid',
    imageClassName = 'content-card-grid__image',
    imageHeight,
    imageLoading = 'lazy',
    imageStyle,
    imageWidth,
    itemClassName = 'content-card-grid__item',
    linkClassName = 'content-card-grid__link',
    titleClassName = 'content-card-grid__title',
    titleTag = 'h3',
    wrapperClassName = ''
  } = props || {};
  const TitleTag = titleTag === 'h2' ? 'h2' : 'h3';
  const grid = (
    <div className={gridClassName}>
      {(Array.isArray(cards) ? cards : []).map((card, index) => {
        const href = card?.href || card?.link || '';
        const body = (
          <>
            {card?.image ? (
              <img
                alt={card?.imageAlt || card?.title || ''}
                className={imageClassName}
                height={imageHeight}
                loading={imageLoading}
                src={card.image}
                style={imageStyle}
                width={imageWidth}
              />
            ) : null}
            <div className={contentClassName}>
              <TitleTag className={[titleClassName, card?.titleClassName || ''].filter(Boolean).join(' ')}>{card?.title || ''}</TitleTag>
              {card?.description ? (
                <div className={descriptionClassName}>
                  <p>{card.description}</p>
                </div>
              ) : null}
              {card?.cta ? <span className={ctaClassName}>{card.cta}</span> : null}
            </div>
          </>
        );

        return (
          <article className={[itemClassName, card?.itemClassName || ''].filter(Boolean).join(' ')} key={href || card?.title || index}>
            {href ? (
              <a className={[linkClassName, card?.linkClassName || ''].filter(Boolean).join(' ')} href={href}>
                {body}
              </a>
            ) : body}
          </article>
        );
      })}
    </div>
  );

  return wrapperClassName ? <div className={wrapperClassName}>{grid}</div> : grid;
}
`;
}

function buildProductCardGridComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    cards = [],
    contentClassName = 'product-card-grid__content',
    ctaClassName = 'product-card-grid__cta',
    descriptionClassName = 'product-card-grid__desc',
    gridClassName = 'product-card-grid__grid',
    imageClassName = 'product-card-grid__image',
    imageHeight,
    imageLoading = 'lazy',
    imageStyle,
    imageWidth,
    itemClassName = 'product-card-grid__item',
    linkClassName = 'product-card-grid__link',
    titleClassName = 'product-card-grid__title',
    titleTag = 'h3',
    wrapperClassName = ''
  } = props || {};
  const TitleTag = titleTag === 'h2' ? 'h2' : 'h3';

  return (
    <div className={['product-card-grid', wrapperClassName].filter(Boolean).join(' ')}>
      <div className={gridClassName}>
        {(Array.isArray(cards) ? cards : []).map((card, index) => {
          const href = card?.href || card?.link || '';
          const body = (
            <>
              {card?.image ? (
                <img
                  alt={card?.imageAlt || card?.title || ''}
                  className={imageClassName}
                  height={imageHeight}
                  loading={imageLoading}
                  src={card.image}
                  style={imageStyle}
                  width={imageWidth}
                />
              ) : null}
              <div className={contentClassName}>
                <TitleTag className={[titleClassName, card?.titleClassName || ''].filter(Boolean).join(' ')}>{card?.title || ''}</TitleTag>
                {card?.description ? (
                  <div className={descriptionClassName}>
                    <p>{card.description}</p>
                  </div>
                ) : null}
                {card?.cta ? <span className={ctaClassName}>{card.cta}</span> : null}
              </div>
            </>
          );

          return (
            <article className={[itemClassName, card?.itemClassName || ''].filter(Boolean).join(' ')} key={href || card?.title || index}>
              {href ? (
                <a className={[linkClassName, card?.linkClassName || ''].filter(Boolean).join(' ')} href={href}>
                  {body}
                </a>
              ) : body}
            </article>
          );
        })}
      </div>
    </div>
  );
}
`;
}

function buildProductImageGalleryComponent() {
  return `
import React from 'react';

const PRODUCT_IMAGE_GALLERY_INLINE_SCRIPT = String.raw\`(() => {
  if (typeof document === 'undefined') {
    return;
  }

  function initProductImageGallery(root) {
    if (!(root instanceof HTMLElement) || root.dataset.galleryInitialized === 'true') {
      return;
    }

    const main = root.querySelector('[data-product-gallery-main]');
    const mainTrack = main?.querySelector('.splide__track');
    const mainList = main?.querySelector('.splide__list');
    const slides = Array.from(main?.querySelectorAll('.splide__slide') || []);
    const prevBtn = main?.querySelector('.splide__arrow--prev');
    const nextBtn = main?.querySelector('.splide__arrow--next');
    const thumbSlides = Array.from(root.querySelectorAll('[data-product-gallery-thumbs] .splide__slide'));
    const thumbButtons = Array.from(root.querySelectorAll('[data-gallery-thumb-index]'));

    if (!(main instanceof HTMLElement) || !(mainTrack instanceof HTMLElement) || !(mainList instanceof HTMLElement) || slides.length === 0) {
      return;
    }

    root.dataset.galleryInitialized = 'true';

    const slideWidth = 100 / slides.length;
    let currentIndex = 0;
    let touchStartX = 0;

    mainList.style.width = String(slides.length * 100) + '%';
    mainList.style.transition = 'transform 0.42s ease';

    slides.forEach((slide) => {
      if (!(slide instanceof HTMLElement)) {
        return;
      }
      slide.style.flex = '0 0 ' + slideWidth + '%';
      slide.style.maxWidth = slideWidth + '%';
    });

    function updateControls() {
      const disabled = slides.length <= 1;
      if (prevBtn instanceof HTMLButtonElement) {
        prevBtn.disabled = disabled;
      }
      if (nextBtn instanceof HTMLButtonElement) {
        nextBtn.disabled = disabled;
      }
    }

    function syncThumbs(index) {
      thumbSlides.forEach((slide, slideIndex) => {
        if (!(slide instanceof HTMLElement)) {
          return;
        }
        slide.classList.toggle('is-active', slideIndex === index);
      });

      thumbButtons.forEach((button, buttonIndex) => {
        if (!(button instanceof HTMLButtonElement)) {
          return;
        }
        const active = buttonIndex === index;
        button.setAttribute('aria-pressed', String(active));
        button.tabIndex = active ? 0 : -1;
      });

      const activeThumb = thumbSlides[index];
      if (activeThumb instanceof HTMLElement) {
        activeThumb.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }

    function setActive(index) {
      if (index < 0 || index >= slides.length) {
        return;
      }

      currentIndex = index;
      mainList.style.transform = 'translateX(-' + (index * slideWidth) + '%)';

      slides.forEach((slide, slideIndex) => {
        if (!(slide instanceof HTMLElement)) {
          return;
        }
        const active = slideIndex === index;
        slide.setAttribute('aria-hidden', String(!active));
      });

      syncThumbs(index);
      updateControls();
    }

    function goNext() {
      setActive((currentIndex + 1) % slides.length);
    }

    function goPrev() {
      setActive((currentIndex - 1 + slides.length) % slides.length);
    }

    thumbButtons.forEach((button, index) => {
      if (!(button instanceof HTMLButtonElement)) {
        return;
      }

      button.addEventListener('click', () => {
        setActive(index);
      });
    });

    if (prevBtn instanceof HTMLButtonElement) {
      prevBtn.addEventListener('click', goPrev);
    }
    if (nextBtn instanceof HTMLButtonElement) {
      nextBtn.addEventListener('click', goNext);
    }

    mainTrack.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches[0]?.screenX || 0;
    }, { passive: true });

    mainTrack.addEventListener('touchend', (event) => {
      const touchEndX = event.changedTouches[0]?.screenX || 0;
      const deltaX = touchStartX - touchEndX;

      if (Math.abs(deltaX) <= 50) {
        return;
      }

      if (deltaX > 0) {
        goNext();
      } else {
        goPrev();
      }
    }, { passive: true });

    main.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    });

    if (!main.hasAttribute('tabindex')) {
      main.setAttribute('tabindex', '0');
    }

    setActive(0);
  }

  const init = () => {
    document.querySelectorAll('[data-product-image-gallery]').forEach(initProductImageGallery);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();\`;

export const scss = String.raw\`
.product-image-gallery__main {
  position: relative;
}

.product-image-gallery__main .splide__track,
.product-image-gallery__thumbs .splide__track {
  overflow: hidden;
}

.product-image-gallery__main .splide__list,
.product-image-gallery__thumbs .splide__list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.product-image-gallery__main .splide__list {
  display: flex;
  will-change: transform;
}

.product-image-gallery__main .splide__slide {
  min-width: 0;
}

.product-image-gallery__main .splide__arrows {
  pointer-events: none;
}

.product-image-gallery__main .splide__arrow {
  position: absolute;
  top: 50%;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  transform: translateY(-50%);
  cursor: pointer;
  pointer-events: auto;
}

.product-image-gallery__main .splide__arrow:disabled {
  opacity: 0.48;
  cursor: default;
}

.product-image-gallery__main .splide__arrow svg {
  width: 20px;
  height: 20px;
}

.product-image-gallery__thumbs .splide__track {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: thin;
}

.product-image-gallery__thumbs .splide__list {
  display: flex;
  gap: 0.75rem;
  min-width: max-content;
}

.product-image-gallery__thumbs .splide__slide {
  flex: 0 0 5rem;
  width: 5rem;
}

.product-image-gallery__thumb-button:focus-visible {
  outline: 2px solid var(--sg-mid-blue, #477d94);
  outline-offset: 2px;
}

@media (max-width: 640px) {
  .product-image-gallery__thumbs .splide__list {
    gap: 0.5rem;
  }

  .product-image-gallery__thumbs .splide__slide {
    flex-basis: 4.25rem;
    width: 4.25rem;
  }
}
\`;

export default function Component(props) {
  const images = Array.isArray(props?.images) ? props.images.filter((image) => image?.src) : [];
  const label = props?.label || 'Product image gallery';
  const title = props?.title || '';
  const hasMultipleImages = images.length > 1;

  if (images.length === 0) {
    return null;
  }

  if (!hasMultipleImages) {
    const firstImage = images[0];
    return (
      <div aria-label={label} className="product-image-gallery" data-product-image-gallery="">
        <div className="product-image-gallery__single">
          <div className="product-image-gallery__image-shell">
            <img alt={firstImage?.alt || title || ''} className="product-image-gallery__image" src={firstImage?.src} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={label}
      className="product-image-gallery product-image-gallery--interactive"
      data-product-image-gallery=""
    >
      <section aria-label={label} className="product-image-gallery__main splide" data-product-gallery-main="">
        <div className="splide__track">
          <ul className="splide__list">
            {images.map((image, index) => (
              <li className="splide__slide" key={image?.src || index}>
                <div className="product-image-gallery__image-shell">
                  <img alt={image?.alt || title || ''} className="product-image-gallery__image" loading={index === 0 ? 'eager' : 'lazy'} src={image?.src} />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="splide__arrows">
          <button aria-label="Previous image" className="splide__arrow splide__arrow--prev" type="button">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
          <button aria-label="Next image" className="splide__arrow splide__arrow--next" type="button">
            <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
              <path d="M9 6l6 6-6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
            </svg>
          </button>
        </div>
      </section>
      <section aria-label={\`\${label} thumbnails\`} className="product-image-gallery__thumbs splide" data-product-gallery-thumbs="">
        <div className="splide__track">
          <ul className="splide__list">
            {images.map((image, index) => (
              <li className={['splide__slide', index === 0 ? 'is-active' : ''].filter(Boolean).join(' ')} key={\`\${image?.src || ''}-thumb-\${index}\`}>
                <button
                  aria-label={\`View image \${index + 1}\`}
                  aria-pressed={index === 0 ? 'true' : 'false'}
                  className="product-image-gallery__thumb-button"
                  data-gallery-thumb-index={index}
                  type="button"
                >
                  <img alt={image?.alt || title || ''} className="product-image-gallery__thumb-image" loading="lazy" src={image?.src} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <script dangerouslySetInnerHTML={{ __html: PRODUCT_IMAGE_GALLERY_INLINE_SCRIPT }} />
    </div>
  );
}
`;
}

function buildProductTopPanelComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const product = props?.product || {};
  const title = props?.title || product?.title || '';
  const topPanel = props?.topPanel && typeof props.topPanel === 'object' ? props.topPanel : {};
  const quickFactsTitle = props?.quickFactsTitle || 'Quick facts';
  const images = Array.isArray(product?.images) && product.images.length > 0
    ? product.images.map((src) => ({ src, alt: title }))
    : [{ src: product?.primaryImage || props?.image || '/skin/dfpic.gif', alt: title }];
  const highlights = Array.isArray(topPanel?.highlights) ? topPanel.highlights.filter(Boolean) : [];
  const quickFacts = Array.isArray(topPanel?.quickFacts) ? topPanel.quickFacts.filter((item) => item?.label || item?.value) : [];
  const specOptions = Array.isArray(topPanel?.specOptions) ? topPanel.specOptions.filter((item) => item?.label || item?.value) : [];
  const hasForm = Boolean(topPanel?.ctaHref && topPanel?.ctaLabel);
  const hasDetails = highlights.length > 0 || quickFacts.length > 0;
  const defaultSpecOption = specOptions[0];
  const fieldIdPrefix = props?.fieldIdPrefix || 'product';
  const specificationFieldId = \`\${fieldIdPrefix}-specification\`;
  const quantityFieldId = \`\${fieldIdPrefix}-quantity\`;
  const gallery = props.component('spirax_product_image_gallery', {
    images,
    label: \`\${title || 'Product'} gallery\`,
    title
  });

  return (
    <section className="product-top-panel bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="product-top-panel__layout">
          <div className="product-top-panel__media">
            <div className="product-top-panel__carousel">
              {gallery}
            </div>
          </div>
          <div className="product-top-panel__content">
            <div className="product-top-panel__card">
              {topPanel?.eyebrow || product?.code ? <p className="product-top-panel__eyebrow">{topPanel?.eyebrow || product.code}</p> : null}
              <h2 className="product-top-panel__title">{title}</h2>
              {topPanel?.description || product?.summary ? <p className="product-top-panel__description">{topPanel?.description || product.summary}</p> : null}
              {hasForm ? (
                <form action={topPanel.ctaHref} className="product-top-panel__form" method="get">
                  <input name="product" type="hidden" value={title || ''} />
                  <div className="product-top-panel__form-fields">
                    {specOptions.length > 0 ? (
                      <fieldset className="sg-ui-field product-top-panel__spec">
                        <legend className="sg-ui-field__label">{topPanel.specLabel || 'Specification'}</legend>
                        <div className="product-top-panel__spec-options" id={specificationFieldId} role="radiogroup">
                          {specOptions.map((option, index) => {
                            const optionId = \`\${specificationFieldId}-\${index}\`;
                            return (
                              <label className="product-top-panel__spec-option" htmlFor={optionId} key={option?.value || option?.label || index}>
                                <input
                                  className="product-top-panel__spec-input"
                                  defaultChecked={option?.value === defaultSpecOption?.value}
                                  id={optionId}
                                  name="spec"
                                  type="radio"
                                  value={option?.value || option?.label || ''}
                                />
                                <span className="product-top-panel__spec-tag">{option?.label || option?.value || ''}</span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    ) : null}
                    <div className="sg-ui-field">
                      <label className="sg-ui-field__label" htmlFor={quantityFieldId}>{topPanel.quantityLabel || 'Quantity'}</label>
                      <input
                        className="sg-ui-input"
                        defaultValue={String(topPanel.quantityDefault ?? 1)}
                        id={quantityFieldId}
                        min="1"
                        name="quantity"
                        step="1"
                        type="number"
                      />
                    </div>
                  </div>
                  <div className="product-top-panel__actions">
                    {props.component('button', {
                      href: topPanel.ctaHref,
                      className: 'product-top-panel__cta',
                      children: topPanel.ctaLabel
                    })}
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        </div>
        {hasDetails ? (
          <div className={[
            'product-top-panel__details',
            highlights.length > 0 && quickFacts.length > 0
              ? 'product-top-panel__details--split'
              : 'product-top-panel__details--single'
          ].filter(Boolean).join(' ')}>
            {highlights.length > 0 ? (
              <div className="product-top-panel__details-item product-top-panel__summary">
                <div className="product-top-panel__highlights" role="list">
                  {highlights.map((highlight, index) => (
                    <span className="product-top-panel__highlight" key={index} role="listitem">{highlight}</span>
                  ))}
                </div>
              </div>
            ) : null}
            {quickFacts.length > 0 ? (
              <div className="product-top-panel__details-item product-top-panel__facts-shell">
                <p className="product-top-panel__facts-title">{quickFactsTitle}</p>
                <div className="product-top-panel__facts">
                  {quickFacts.map((fact, index) => (
                    <div className="product-top-panel__fact" key={fact?.label || index}>
                      <span>{fact?.label || ''}</span>
                      <strong>{fact?.value || ''}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
`;
}

function buildCopySectionComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    copyClassName = 'intro__copy copy intro__copy--left',
    innerClassName = '',
    paragraphClassName = '',
    paragraphs = [],
    sectionClassName = 'bg--white intro-text-section',
    title = '',
    titleClassName = 'display-heading',
    wrapperClassName = 'wrapper wrapper--sml wrapper--pad-l'
  } = props || {};
  const items = Array.isArray(paragraphs) ? paragraphs.filter(Boolean) : [];

  if (!title && items.length === 0) {
    return null;
  }

  return (
    <section className={sectionClassName}>
      <div className={wrapperClassName}>
        <div className={innerClassName || undefined}>
          {title ? <h2 className={titleClassName}>{title}</h2> : null}
          <div className={copyClassName}>
            {items.map((paragraph, index) => (
              <p className={paragraphClassName || undefined} key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
`;
}

function buildBrandPathSectionComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    cardTitleTag = 'h3',
    cards = [],
    className = '',
    ctaFallbackToTitle = false,
    intro = '',
    sectionClassName = 'bg--white',
    title = ''
  } = props || {};
  const items = Array.isArray(cards) ? cards.filter(Boolean) : [];
  const CardTitleTag = cardTitleTag === 'h2' ? 'h2' : 'h3';

  if (!title || items.length === 0) {
    return null;
  }

  return (
    <section className={['content-card-grid', 'content-card-grid--compact', sectionClassName, 'brand-path-section', className].filter(Boolean).join(' ')}>
      <div className="wrapper">
        <div className="section-header">
          <h2 className="section-header__title">{title}</h2>
          {intro ? <p className="sg-brand-path-section__intro">{intro}</p> : null}
        </div>
      </div>
      <div className="wrapper wrapper--pad-l">
        <div className="content-card-grid__grid content-card-grid__grid--cols-fluid">
          {items.map((card, index) => (
            <article className="content-card-grid__item content-card-grid__item--grey" key={card?.href || card?.title || index}>
              <a className="content-card-grid__link" href={card?.href || '#'}>
                <div className="content-card-grid__content">
                  <CardTitleTag className="content-card-grid__title">{card?.title || ''}</CardTitleTag>
                  {card?.description ? (
                    <div className="content-card-grid__desc">
                      <p>{card.description}</p>
                    </div>
                  ) : null}
                  {(card?.label || ctaFallbackToTitle) ? (
                    <span className="content-card-grid__cta">{card?.label || card?.title || ''}</span>
                  ) : null}
                </div>
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function buildProductDownloadGroupsComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const downloads = Array.isArray(props?.downloads) ? props.downloads.filter(Boolean) : [];
  const visibleGroups = downloads
    .map((group) => ({
      ...group,
      entries: Array.isArray(group?.entries) ? group.entries.filter((entry) => entry?.href && entry?.name) : []
    }))
    .filter((group) => group.entries.length > 0);

  if (visibleGroups.length === 0) {
    return null;
  }

  return (
    <section className="bg--light-blue" id="tabbedDownloadSection">
      <div className="tabs bg--white pull-out@s">
        <nav aria-label="Downloads" className="tabs__nav">
          <ul className="tabs__nav-list bare-list" role="tablist">
            {visibleGroups.map((group, index) => (
              <li className="tabs__nav-item" role="presentation" key={group?.title || index}>
                <button
                  aria-controls={\`download-group-\${index}\`}
                  aria-selected={index === 0 ? 'true' : 'false'}
                  className={['tabs__nav-link', index === 0 ? 'is-active' : ''].filter(Boolean).join(' ')}
                  role="tab"
                  type="button"
                >
                  <span className="tabs__nav-text">{group?.title || ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <div className="tabs__content">
          {visibleGroups.map((group, index) => (
            <details className="download-group-accordion tab" id={\`download-group-\${index}\`} key={group?.title || index} open={index === 0}>
              <summary className="tab__header">
                <h3>{group?.title || ''}</h3>
                <span aria-hidden="true" className="download-group-accordion__indicator"></span>
              </summary>
              <div className="download-group-accordion__panel">
                <div className="wrapper">
                  <table className="table--light table--striped table--reduced-padding table--collapse table--downloads no-responsive">
                    <thead>
                      <tr>
                        <th>Document</th>
                        <th>Reference</th>
                        <th>Language</th>
                        <th>Download</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.entries.map((entry, entryIndex) => (
                        <tr key={entry?.href || entryIndex}>
                          <td data-label="Document">{entry?.name || ''}</td>
                          <td data-label="Reference">{entry?.reference || '-'}</td>
                          <td data-label="Language">{entry?.language || 'Default'}</td>
                          <td data-label="Download">
                            <a className="download-link" href={entry?.href || '#'}>Download</a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
`;
}

function buildArticleListTemplate(cssText, mode) {
  const sectionTitle = mode === 'service' ? '服务' : '公司新闻';
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const items = Array.isArray(props.items) ? props.items : [];
  const masthead = props.component('spirax_short_masthead', {
    eyebrow: '${sectionTitle}',
    title: props.title,
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-content-shell sg-news-page">
      <section className="article-results-section bg--white">
        <div className="article-results__shell">
          <div className="article-results">
            <div className="article-results__top">
              <div className="article-results__info">
                <div className="article-results__count">${sectionTitle} (<span>{items.length}</span>)</div>
              </div>
            </div>
            <div className="article-results__container">
              <div className="article-results__list">
                {items.map((item, index) => (
                  <article className="article" key={item.url || item.title || index}>
                    {item.image ? (
                      <div className="article__image-wrap">
                        <a href={item.url || '#'}><img alt={item.title || ''} className="article__image" src={item.image} /></a>
                      </div>
                    ) : null}
                    <div className="article__content">
                      <div className="article__info">
                        {item.date ? <span className="article__posted">{item.date}</span> : null}
                      </div>
                      <div className="article__desc">
                        <div className="article__text">
                          <h2 className="article__title"><a href={item.url || '#'}>{item.title}</a></h2>
                          {item.summary ? <p className="article__summary">{item.summary}</p> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {props.pagerHtml ? <div className="legacy-pager" dangerouslySetInnerHTML={{ __html: props.pagerHtml }} /> : null}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildArticleDetailTemplate(cssText) {
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const article = props.currentArticle || props.currentContent || {};
  const relatedItems = Array.isArray(props.relatedArticleItems) ? props.relatedArticleItems : [];
  const masthead = props.component('spirax_short_masthead', {
    eyebrow: props.currentColumn?.name || 'News',
    title: article.title || props.title,
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-content-shell sg-news-page">
      {article.date ? (
        <section className="bg--industrial-blue-light">
          <div className="article-details__shell">
            <div className="article-details">
              <h2 className="article-details__title">{article.date}</h2>
            </div>
          </div>
        </section>
      ) : null}

      <section className="bg--white">
        <div className="article-body__shell">
          <div className="article-body">
            <div className="article-body__copy">
              <div dangerouslySetInnerHTML={{ __html: article.bodyHtml || props.bodyHtml || '' }} />
            </div>
          </div>
        </div>
      </section>

      {relatedItems.length > 0 ? (
        <section className="bg--white clip-outside__wrap--small">
          <div className="wrapper wrapper--pad-l">
            <div className="content-card-grid">
              {relatedItems.map((item, index) => (
                <article className="content-card-grid__item content-card-grid__item--grey" key={item.url || item.title || index}>
                  {item.image ? <a className="content-card-grid__media" href={item.url || '#'}><img alt={item.title || ''} className="content-card-grid__image" src={item.image} /></a> : null}
                  <div className="content-card-grid__copy">
                    <h3 className="content-card-grid__title"><a href={item.url || '#'}>{item.title}</a></h3>
                    {item.summary ? <p className="content-card-grid__description">{item.summary}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildServiceDetailTemplate(cssText) {
  return `
import React from 'react';

export const scss = String.raw\`${cssText.replace(/`/g, '\\`')}\`;

export default function Template(props) {
  const article = props.currentArticle || props.currentContent || {};
  const relatedItems = Array.isArray(props.relatedArticleItems) ? props.relatedArticleItems : [];
  const masthead = props.component('spirax_short_masthead', {
    eyebrow: 'Service',
    title: article.title || props.title,
    summary: article.summary || '',
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-page-shell sg-service-page">
      <section className="bg--white">
        <div className="wrapper wrapper--sml wrapper--pad-l">
          <div className="copy">
            <div dangerouslySetInnerHTML={{ __html: article.bodyHtml || props.bodyHtml || '' }} />
          </div>
        </div>
      </section>

      {relatedItems.length > 0 ? (
        <section className="content-card-grid content-card-grid--compact bg--white clip-outside__wrap--small">
          <div className="wrapper wrapper--pad-l">
            <div className="section-header">
              <h2 className="section-header__title">相关内容</h2>
            </div>
            <div className="content-card-grid">
              {relatedItems.map((item, index) => (
                <article className="content-card-grid__item content-card-grid__item--grey" key={item.url || item.title || index}>
                  {item.image ? <a className="content-card-grid__media" href={item.url || '#'}><img alt={item.title || ''} className="content-card-grid__image" src={item.image} /></a> : null}
                  <div className="content-card-grid__copy">
                    <h3 className="content-card-grid__title"><a href={item.url || '#'}>{item.title}</a></h3>
                    {item.summary ? <p className="content-card-grid__description">{item.summary}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildContentPageTemplate() {
  return `
import React from 'react';

export default function Template(props) {
  const pageData = props.currentColumnPageData || props.pageData || {};
  const pageKind = String(pageData?.pageKind || '').trim().toLowerCase();
  const cards = Array.isArray(pageData.cards) ? pageData.cards : [];
  const items = Array.isArray(pageData.items) ? pageData.items : [];
  const resources = Array.isArray(pageData.resources) ? pageData.resources : [];
  const products = Array.isArray(pageData.products) ? pageData.products : [];
  const features = Array.isArray(pageData.features) ? pageData.features : [];
  const calloutCards = Array.isArray(pageData.calloutCards) ? pageData.calloutCards : [];
  const promoCards = Array.isArray(pageData.promoCards) ? pageData.promoCards : [];
  const goalItems = Array.isArray(pageData?.goals?.items) ? pageData.goals.items : [];
  const slides = Array.isArray(pageData?.slides) ? pageData.slides : [];
  const relatedCards = Array.isArray(pageData?.related?.cards) ? pageData.related.cards : [];
  const caseStudyItems = Array.isArray(pageData?.caseStudy?.items) ? pageData.caseStudy.items : [];
  const proofItems = Array.isArray(pageData?.proof?.items) ? pageData.proof.items : [];
  const sectionGroups = Array.isArray(pageData.sections) ? pageData.sections : [];
  const jobs = Array.isArray(pageData.jobs) ? pageData.jobs : [];
  const filterGroups = Array.isArray(pageData.filterGroups) ? pageData.filterGroups : [];
  const introParagraphs = Array.isArray(pageData.intro) ? pageData.intro : (Array.isArray(pageData?.introBlock?.paragraphs) ? pageData.introBlock.paragraphs : []);
  const introTitle = pageData?.introBlock?.title || pageData?.hero?.title || '';
  const introAction = pageData?.introBlock?.action && typeof pageData.introBlock.action === 'object' ? pageData.introBlock.action : null;
  const heroTitle = pageData?.hero?.title || props.title;
  const heroImage = pageData?.hero?.image || pageData.heroImage || pageData.mastheadImage || props.currentColumnHeroImage || '';
  const summary = pageData?.hero?.summary || pageData.summary || props.newsDescription || '';
  const featureImage = pageData?.featureImage || '';
  const promo = pageData?.promo && typeof pageData.promo === 'object' ? pageData.promo : null;
  const isGoalLanding = goalItems.length > 0;
  const isGoalDetail = !isGoalLanding && (
    Boolean(pageData?.secondary?.title)
    || Boolean(pageData?.focus?.title)
    || Boolean(pageData?.closing?.title)
    || Boolean(pageData?.caseStudy?.title)
    || slides.length > 0
    || relatedCards.length > 0
  );
  const brandPathSection = pageData?.brandPathSection && Array.isArray(pageData?.brandPathSection?.cards) && pageData.brandPathSection.cards.length > 0
    ? props.component('spirax_brand_path_section', pageData.brandPathSection)
    : null;
  const masthead = props.component('spirax_short_masthead', {
    title: heroTitle,
    summary,
    image: heroImage,
    imageAlt: heroTitle || props.title || '',
    size: 'short'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const gridCards = cards.length > 0 ? cards : (resources.length > 0 ? resources : (products.length > 0 ? products : (calloutCards.length > 0 ? calloutCards : promoCards)));
  const cardGrid = gridCards.length > 0 ? props.component('spirax_content_card_grid', {
    cards: gridCards.map((card) => ({
      title: card?.title || '',
      description: card?.description || '',
      href: card?.href || card?.link || '',
      image: card?.image || '',
      imageAlt: card?.imageAlt || card?.title || '',
      cta: card?.label || card?.cta || ''
    })),
    gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
    wrapperClassName: 'wrapper wrapper--pad-l'
  }) : null;
  const featureGrid = features.length > 0 ? props.component('spirax_content_card_grid', {
    cards: features.map((feature) => ({
      title: feature?.title || '',
      description: feature?.description || '',
      href: feature?.href || '',
      image: feature?.icon || '',
      imageAlt: feature?.title || '',
      cta: feature?.label || ''
    })),
    gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
    wrapperClassName: 'wrapper wrapper--pad-l'
  }) : null;
  const introSection = (introParagraphs.length > 0 || pageData?.introBlock?.body || pageData?.introBlock?.statement || introAction) ? (
    <section className="bg--white">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        <div className="copy">
          {introTitle ? <h2>{introTitle}</h2> : null}
          {introParagraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
          {!introParagraphs.length && pageData?.introBlock?.body ? <p>{pageData.introBlock.body}</p> : null}
          {pageData?.introBlock?.statement ? <p><strong>{pageData.introBlock.statement}</strong></p> : null}
          {introAction?.href && introAction?.label ? (
            <p>
              {props.component('button', {
                href: introAction.href,
                target: String(introAction.href).startsWith('http') ? '_blank' : undefined,
                rel: String(introAction.href).startsWith('http') ? 'noreferrer' : undefined,
                children: introAction.label
              })}
            </p>
          ) : null}
          {pageData?.introBlock?.image ? <p><img alt={introTitle || heroTitle || props.title || ''} src={pageData.introBlock.image} /></p> : null}
        </div>
      </div>
    </section>
  ) : null;
  const featureHeadingSection = pageData?.featureHeading ? (
    <section className="bg--white">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        <div className="copy">
          {pageData.featureHeading.title ? <h2>{pageData.featureHeading.title}</h2> : null}
          {pageData.featureHeading.body ? <p>{pageData.featureHeading.body}</p> : null}
        </div>
      </div>
    </section>
  ) : null;
  const adviceSection = pageData?.advice ? (
    <section className="bg--light-blue">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        <div className="copy">
          {pageData.advice.title ? <h2>{pageData.advice.title}</h2> : null}
          {pageData.advice.body ? <p>{pageData.advice.body}</p> : null}
        </div>
      </div>
    </section>
  ) : null;
  const supportSection = pageData?.supportList?.items?.length ? (
    <section className="bg--white">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        <div className="copy">
          {pageData?.supportList?.title ? <h2>{pageData.supportList.title}</h2> : null}
          <ul>
            {pageData.supportList.items.map((item, index) => <li key={index}>{item}</li>)}
          </ul>
        </div>
      </div>
    </section>
  ) : null;
  const partnerSection = pageData?.partnerHeading ? (
    <section className="bg--white">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        <div className="copy">
          {pageData.partnerHeading.title ? <h2>{pageData.partnerHeading.title}</h2> : null}
          {pageData.partnerHeading.body ? <p>{pageData.partnerHeading.body}</p> : null}
        </div>
      </div>
    </section>
  ) : null;
  const spotlightSection = pageData?.spotlight ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {pageData?.spotlight?.caption ? <h2>{pageData.spotlight.caption}</h2> : null}
          {pageData?.spotlight?.description ? <p>{pageData.spotlight.description}</p> : null}
          {pageData?.spotlight?.posterImage ? <p><img alt={pageData.spotlight.caption || heroTitle || props.title || ''} src={pageData.spotlight.posterImage} /></p> : null}
          {pageData?.spotlight?.videoUrl ? <p><a href={pageData.spotlight.videoUrl} rel="noreferrer" target="_blank">观看视频</a></p> : null}
        </div>
      </div>
    </section>
  ) : null;
  const linkSections = sectionGroups.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {sectionGroups.map((section, index) => (
            <section key={section?.title || index} style={{ marginBottom: '2rem' }}>
              {section?.title ? <h2>{section.title}</h2> : null}
              {section?.description ? <p>{section.description}</p> : null}
              {Array.isArray(section?.links) && section.links.length > 0 ? (
                <ul>
                  {section.links.map((link, linkIndex) => (
                    <li key={link?.href || link?.title || linkIndex}>
                      <a href={link?.href || '#'}>{link?.title || link?.label || link?.href || ''}</a>
                      {link?.description ? <> - {link.description}</> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const directorySections = pageKind === 'section-directory' && sectionGroups.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {sectionGroups.map((section, index) => (
            <section key={section?.title || index} style={{ marginBottom: '2.5rem' }}>
              {section?.title ? <h2>{section.title}</h2> : null}
              {section?.description ? <p>{section.description}</p> : null}
              {Array.isArray(section?.links) && section.links.length > 0 ? (
                <ul>
                  {section.links.map((link, linkIndex) => (
                    <li key={link?.href || link?.title || linkIndex}>
                      <a href={link?.href || '#'}>{link?.title || link?.label || link?.href || ''}</a>
                      {link?.description ? <> - {link.description}</> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const promoSection = promo?.href && promo?.label ? (
    <section className="bg--light-blue">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {promo?.kicker ? <p><strong>{promo.kicker}</strong></p> : null}
          {promo?.title ? <h2>{promo.title}</h2> : null}
          {promo?.body ? <p>{promo.body}</p> : null}
          <p>
            {props.component('button', {
              href: promo.href,
              children: promo.label
            })}
          </p>
        </div>
      </div>
    </section>
  ) : null;
  const simpleItems = items.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          <ul>
            {items.map((item, index) => (
              <li key={item?.href || item?.title || index}>
                {item?.href ? <a href={item.href}>{item?.title || item?.href}</a> : <strong>{item?.title || ''}</strong>}
                {item?.description ? <> - {item.description}</> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  ) : null;
  const frameSection = pageData?.frame?.src ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <iframe
          src={pageData.frame.src}
          title={props.title || 'embedded content'}
          style={{ width: '100%', minHeight: Number(pageData?.frame?.height || 700), border: 0 }}
        />
      </div>
    </section>
  ) : null;
  const jobsSection = jobs.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {pageData.jobsSummary ? <p>{pageData.jobsSummary}</p> : null}
          <ul>
            {jobs.map((job, index) => (
              <li key={job?.href || job?.title || index}>
                {job?.href ? <a href={job.href}>{job?.title || ''}</a> : <strong>{job?.title || ''}</strong>}
                {job?.location ? <> · {job.location}</> : null}
                {job?.businessArea ? <> · {job.businessArea}</> : null}
                {job?.summary ? <div>{job.summary}</div> : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  ) : null;
  const filtersSection = filterGroups.length > 0 ? (
    <section className="bg--light-blue">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          {filterGroups.map((group, index) => (
            <section key={group?.title || index} style={{ marginBottom: '1.5rem' }}>
              {group?.title ? <h2>{group.title}</h2> : null}
              {Array.isArray(group?.items) && group.items.length > 0 ? <p>{group.items.join(' / ')}</p> : null}
            </section>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const goalsSection = goalItems.length > 0 ? props.component('spirax_content_card_grid', {
    cards: goalItems.map((item) => ({
      title: item?.title || '',
      description: item?.description || '',
      href: item?.href || '',
      image: item?.image || '',
      cta: item?.cta || ''
    })),
    gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
    wrapperClassName: 'wrapper wrapper--pad-l'
  }) : null;
  const proofSection = proofItems.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="section-header">
          {pageData?.proof?.title ? <h2 className="section-header__title">{pageData.proof.title}</h2> : null}
        </div>
        <div className="content-card-grid__grid content-card-grid__grid--cols-fluid">
          {proofItems.map((item, index) => (
            <article className="content-card-grid__item content-card-grid__item--grey" key={item?.title || index}>
              <div className="content-card-grid__content">
                {item?.title ? <h3 className="content-card-grid__title">{item.title}</h3> : null}
                {item?.description ? <div className="content-card-grid__desc"><p>{item.description}</p></div> : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const featureImageSection = featureImage ? (
    <section className="bg--light-blue">
      <div className="wrapper wrapper--pad-l">
        <div className="copy">
          <p><img alt={heroTitle || props.title || ''} src={featureImage} /></p>
        </div>
      </div>
    </section>
  ) : null;
  const secondarySection = pageData?.secondary ? (
    <section className="bg--light-blue intro-text-section">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        {pageData.secondary.title ? <h2 className="display-heading">{pageData.secondary.title}</h2> : null}
        <div className="intro__copy copy intro__copy--left copy--2-col">
          {(Array.isArray(pageData.secondary.paragraphs) ? pageData.secondary.paragraphs : []).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const caseStudySection = pageData?.caseStudy?.title && caseStudyItems.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="section-header">
          <h2 className="section-header__title">{pageData.caseStudy.title}</h2>
        </div>
        {pageData?.caseStudy?.image ? <p><img alt={pageData.caseStudy.title || ''} src={pageData.caseStudy.image} /></p> : null}
        <div className="content-card-grid__grid content-card-grid__grid--cols-fluid">
          {caseStudyItems.map((item, index) => (
            <article className="content-card-grid__item content-card-grid__item--grey" key={item?.label || index}>
              <div className="content-card-grid__content">
                {item?.label ? <h3 className="content-card-grid__title">{item.label}</h3> : null}
                {item?.value ? <div className="content-card-grid__desc"><p>{item.value}</p></div> : null}
              </div>
            </article>
          ))}
        </div>
        {pageData?.caseStudy?.href && pageData?.caseStudy?.cta ? (
          <p style={{ marginTop: '1.5rem' }}>
            {props.component('button', {
              href: pageData.caseStudy.href,
              children: pageData.caseStudy.cta
            })}
          </p>
        ) : null}
      </div>
    </section>
  ) : null;
  const slidesSection = slides.length > 0 ? props.component('spirax_content_card_grid', {
    cards: slides.map((slide) => ({
      title: slide?.title || '',
      description: slide?.description || '',
      href: slide?.href || '',
      image: slide?.image || '',
      imageAlt: slide?.title || '',
      cta: slide?.cta || ''
    })),
    gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
    wrapperClassName: 'wrapper wrapper--pad-l'
  }) : null;
  const focusSection = pageData?.focus ? (
    <section className="bg--white intro-text-section">
      <div className="wrapper wrapper--sml wrapper--pad-l">
        {pageData.focus.title ? <h2 className="display-heading">{pageData.focus.title}</h2> : null}
        <div className="intro__copy copy intro__copy--left">
          {(Array.isArray(pageData.focus.paragraphs) ? pageData.focus.paragraphs : []).map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </div>
    </section>
  ) : null;
  const closingSection = pageData?.closing ? (
    <section className="bg--blue intro-text-section">
      <div className="wrapper wrapper--sml wrapper--pad-m">
        <div className="intro intro--white intro--large">
          {pageData.closing.title ? <h2 className="display-heading">{pageData.closing.title}</h2> : null}
          <div className="intro__copy copy intro__copy--full-width">
            {(Array.isArray(pageData.closing.paragraphs) ? pageData.closing.paragraphs : []).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>
    </section>
  ) : null;
  const relatedSection = relatedCards.length > 0 ? (
    <section className="content-card-grid content-card-grid--compact bg--white clip-outside__wrap--small">
      <div className="wrapper wrapper--pad-l wrapper--flush-b">
        {pageData?.related?.title ? <h2 className="display-heading">{pageData.related.title}</h2> : null}
      </div>
      {props.component('spirax_content_card_grid', {
        cards: relatedCards.map((card) => ({
          title: card?.title || '',
          description: card?.description || '',
          href: card?.href || '',
          image: card?.image || '',
          imageAlt: card?.title || '',
          cta: card?.cta || ''
        })),
        itemClassName: 'content-card-grid__item content-card-grid__item--grey',
        gridClassName: 'content-card-grid__grid content-card-grid__grid--cols-fluid',
        wrapperClassName: 'wrapper wrapper--pad-l'
      })}
    </section>
  ) : null;
  const content = (
    <main className="sg-page-shell sg-content-shell">
      {introSection}
      {isGoalDetail ? featureImageSection : null}
      {isGoalDetail ? secondarySection : null}
      {isGoalDetail ? proofSection : null}
      {isGoalDetail ? caseStudySection : null}
      {isGoalDetail ? slidesSection : null}
      {isGoalDetail ? focusSection : null}
      {featureHeadingSection}
      {featureGrid}
      {adviceSection}
      {cardGrid}
      {directorySections}
      {partnerSection}
      {supportSection}
      {goalsSection}
      {brandPathSection}
      {isGoalDetail ? closingSection : null}
      {isGoalDetail ? relatedSection : null}
      {pageKind === 'section-directory' ? null : linkSections}
      {simpleItems}
      {jobsSection}
      {filtersSection}
      {spotlightSection}
      {promoSection}
      {frameSection}
      <section className="bg--white">
        <div className="wrapper wrapper--sml wrapper--pad-l">
          <div className="copy">
            <div dangerouslySetInnerHTML={{ __html: props.contentHtml || props.bodyHtml || '' }} />
          </div>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function buildContactPageTemplate() {
  return `
import React from 'react';

export default function Template(props) {
  const masthead = props.component('spirax_short_masthead', {
    title: '联系我们',
    className: 'short-masthead'
  });
  const shell = props.component('spirax_shell', {
    ...props,
    slots: {
      ...(props.slots || {}),
      masthead
    }
  });
  const content = (
    <main className="sg-page-shell sg-content-shell sg-contact-page">
      <section className="bg--white">
        <div className="wrapper wrapper--sml wrapper--pad-l">
          <div className="copy">
            <p>{props.site?.company_name || props.site?.web_name}</p>
            {props.site?.company_phone ? <p>电话：{props.site.company_phone}</p> : null}
            {props.site?.company_email ? <p>邮箱：{props.site.company_email}</p> : null}
            {props.site?.company_address ? <p>地址：{props.site.company_address}</p> : null}
          </div>
        </div>
      </section>
    </main>
  );
  return shell ? React.cloneElement(shell, {}, content) : content;
}
`;
}

function readSourceCss(relativePaths) {
  const seenFiles = new Set();
  return relativePaths
    .map((relativePath) => path.join(sourceRoot, relativePath))
    .filter((absolutePath) => fs.existsSync(absolutePath))
    .map((absolutePath) => readSourceCssFile(absolutePath, seenFiles))
    .filter(Boolean)
    .join('\n\n');
}

function readSourceCssFile(absolutePath, seenFiles) {
  const normalizedPath = path.normalize(absolutePath);
  if (seenFiles.has(normalizedPath)) {
    return '';
  }
  seenFiles.add(normalizedPath);

  const source = fs.readFileSync(normalizedPath, 'utf8');
  return source.replace(/^\s*@import\s+(?:url\()?['"]([^'")]+)['"]\)?\s*;?\s*$/gm, (statement, importPath) => {
    if (!importPath.startsWith('.')) {
      return statement;
    }

    const resolvedPath = path.resolve(path.dirname(normalizedPath), importPath);
    if (!fs.existsSync(resolvedPath)) {
      return '';
    }

    return `${readSourceCssFile(resolvedPath, seenFiles)}\n`;
  });
}
