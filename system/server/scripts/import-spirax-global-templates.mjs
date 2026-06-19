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
const serviceSection = publicSections.getNewsSectionByDirName('service');

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
    { target_type: 'news_category', target_id: serviceSection.rootColumnId, template_type: 'list', template_code: 'spirax_service_list' },
    { target_type: 'news_category', target_id: serviceSection.rootColumnId, template_type: 'content', template_code: 'spirax_service_detail' }
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

  const existing = findTemplateByCode(definition.code);
  const payload = {
    theme_id: themeId,
    name: definition.name,
    type: definition.type,
    code: definition.code,
    engine: 'tsx',
    content: definition.content,
    sort_order: definition.sort_order || 0,
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
  const shellCss = readSourceCss([
    'src/styles/global.css',
    'src/styles/utilities.css',
    'src/components/shared/primitives/PageShell.css',
    'src/components/shared/primitives/ContentShell.css',
    'src/styles/site-shell/Nav.css',
    'src/styles/site-shell/Footer.css',
  ]);
  const productCss = readSourceCss([
    'src/components/shared/business/Breadcrumbs.css',
    'src/components/shared/business/ShortMasthead.css',
    'src/components/shared/primitives/ContentCardGrid.css',
    'src/components/shared/ui/ui.css',
    'src/components/shared/business/ProductImageGallery.css',
    'src/components/templates/ProductPages/ProductPages.css',
  ]);
  const newsCss = readSourceCss([
    'src/components/templates/NewsPages/NewsPages.base.css',
    'src/components/templates/NewsPages/NewsPages.css',
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
      content: buildShellComponent(shellCss),
    },
    {
      code: 'spirax_button',
      name: 'Spirax 按钮组件',
      type: 'component',
      sort_order: 2,
      content: buildButtonComponent(),
    },
    {
      code: 'spirax_short_masthead',
      name: 'Spirax 短横幅组件',
      type: 'component',
      sort_order: 3,
      content: buildShortMastheadComponent(),
    },
    {
      code: 'spirax_breadcrumbs',
      name: 'Spirax 面包屑组件',
      type: 'component',
      sort_order: 4,
      content: buildBreadcrumbsComponent(),
    },
    {
      code: 'spirax_content_card_grid',
      name: 'Spirax 内容卡片网格组件',
      type: 'component',
      sort_order: 5,
      content: buildContentCardGridComponent(),
    },
    {
      code: 'spirax_product_image_gallery',
      name: 'Spirax 产品图库组件',
      type: 'component',
      sort_order: 6,
      content: buildProductImageGalleryComponent(),
    },
    {
      code: 'spirax_product_top_panel',
      name: 'Spirax 产品顶部面板组件',
      type: 'component',
      sort_order: 7,
      content: buildProductTopPanelComponent(),
    },
    {
      code: 'spirax_copy_section',
      name: 'Spirax 文本区块组件',
      type: 'component',
      sort_order: 8,
      content: buildCopySectionComponent(),
    },
    {
      code: 'spirax_brand_path_section',
      name: 'Spirax 品牌路径区块组件',
      type: 'component',
      sort_order: 9,
      content: buildBrandPathSectionComponent(),
    },
    {
      code: 'spirax_product_download_groups',
      name: 'Spirax 产品下载区块组件',
      type: 'component',
      sort_order: 10,
      content: buildProductDownloadGroupsComponent(),
    },
    {
      code: 'spirax_feature_cards',
      name: 'Spirax 卡片网格组件',
      type: 'component',
      sort_order: 11,
      content: buildFeatureCardsComponent(),
    },
    {
      code: 'spirax_product_side_nav',
      name: 'Spirax 产品侧栏组件',
      type: 'component',
      sort_order: 12,
      content: buildProductSideNavComponent(),
    },
    {
      code: 'spirax_product_overview',
      name: 'Spirax 产品概览组件',
      type: 'component',
      sort_order: 13,
      content: buildProductOverviewComponent(),
    },
    {
      code: 'spirax_benefit_blocks',
      name: 'Spirax 优势区块组件',
      type: 'component',
      sort_order: 14,
      content: buildBenefitBlocksComponent(),
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
      content: buildProductListTemplate(productCss),
    },
    {
      code: 'spirax_product_detail',
      name: 'Spirax 产品详情模板',
      type: 'content',
      sort_order: 20,
      content: buildProductDetailTemplate(productCss),
    },
    {
      code: 'spirax_article_list',
      name: 'Spirax 新闻列表模板',
      type: 'list',
      sort_order: 30,
      content: buildArticleListTemplate(newsCss, 'news'),
    },
    {
      code: 'spirax_article_detail',
      name: 'Spirax 新闻详情模板',
      type: 'content',
      sort_order: 40,
      content: buildArticleDetailTemplate(newsCss, 'news'),
    },
    {
      code: 'spirax_service_list',
      name: 'Spirax 服务列表模板',
      type: 'list',
      sort_order: 50,
      content: buildArticleListTemplate(serviceCss, 'service'),
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
  ];
}

function buildShellComponent(cssText) {
  const staticCss = `${cssText}

@media (max-width: 940px) {
  .sg-site-nav-shell {
    --sg-mobile-nav-offset: 54px;
  }

  .sg-global-nav__menu-toggle,
  .sg-global-nav__drawer-backdrop {
    display: none !important;
  }

  .sg-global-nav__main--desktop {
    position: static;
    top: auto;
    right: auto;
    bottom: auto;
    width: 100%;
    max-width: none;
    overflow: visible;
    background: rgba(255, 255, 255, 0.96);
    color: #002d72;
    box-shadow: none;
    transform: none;
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
  }

  .sg-global-nav__main-item .sg-global-nav__flyout {
    display: block;
  }
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
`;

  return `
import React from 'react';

export const scss = String.raw\`${staticCss.replace(/`/g, '\\`')}\`;

function renderNavItems(items = [], currentUrl = '') {
  return items.map((item, index) => {
    const children = Array.isArray(item.children) ? item.children : [];
    const isActive = item.active || (currentUrl && item.url && currentUrl.startsWith(item.url));
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
                    <a className={['sg-global-nav__flyout-link', child.active ? 'is-active' : ''].filter(Boolean).join(' ')} href={child.url || '#'} target={child.openInNewTab ? '_blank' : undefined} rel={child.openInNewTab ? 'noreferrer' : undefined}>
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
        <a className={['sg-global-nav__main-link', isActive ? 'is-active' : ''].filter(Boolean).join(' ')} href={item.url || '#'} target={item.openInNewTab ? '_blank' : undefined} rel={item.openInNewTab ? 'noreferrer' : undefined}>
          {item.name}
        </a>
      </li>
    );
  });
}

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

export default function Template({ site, siteColumns = [], currentPage, children }) {
  const pageTitle = currentPage?.title ? \`\${currentPage.title} - \${site?.web_name || ''}\` : (site?.web_name || '');
  return (
    <html lang="zh-CN">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle}</title>
      </head>
      <body>
        <div className="sg-site-nav-shell" data-site-nav="">
          <header className="sg-global-nav">
            <div className="sg-global-nav__topbar">
              <div className="sg-global-nav__inner">
                <a aria-label={site?.company_name || site?.web_name || 'Site'} className="sg-global-nav__brand" href="/">
                  <span className="sg-global-nav__brand-mark sg-global-nav__brand-mark--text">{site?.web_name || site?.company_name || 'Spirax'}</span>
                </a>
                <div className="sg-global-nav__launchers">
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
              <nav aria-label="主导航">
                <ul className="sg-global-nav__main-list">
                  {renderNavItems(siteColumns, currentPage?.url || '')}
                </ul>
              </nav>
            </div>
          </div>
        </div>

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
  const shell = props.component('spirax_shell', props);
  const newsItems = Array.isArray(props.homeNewsItems) ? props.homeNewsItems : [];
  const productItems = Array.isArray(props.homeFeaturedProductItems) ? props.homeFeaturedProductItems : [];
  const serviceItems = Array.isArray(props.homeServiceItems) ? props.homeServiceItems : [];
  const productCards = props.component('spirax_feature_cards', { items: productItems, itemTitleKey: 'title' });
  const newsCards = props.component('spirax_feature_cards', { items: newsItems, itemTitleKey: 'title' });
  const serviceCards = props.component('spirax_feature_cards', { items: serviceItems, itemTitleKey: 'title' });
  const content = (
    <main className="sg-page-shell sg-content-shell sg-home-page sg-home">
      <section className="home-hero bg--white">
        <div className="wrapper wrapper--pad-l">
          <div className="home-hero__grid">
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
          </div>
        </div>
      </section>

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
  const shell = props.component('spirax_shell', props);
  const pageData = props.currentCategoryPageData || props.pageData || {};
  const normalizedPageKind = String(pageData?.pageKind || pageData?.kind || '').trim().toLowerCase();
  const productRoot = normalizedPageKind === 'root';
  const categoryLandingPage = normalizedPageKind === 'category';
  const pageCards = Array.isArray(pageData?.cards) ? pageData.cards.filter(Boolean) : [];
  const pageModels = Array.isArray(pageData?.models) ? pageData.models.filter(Boolean) : [];
  const productItems = Array.isArray(props.productCardItems) ? props.productCardItems.filter(Boolean) : [];
  const listItems = Array.isArray(props.items) ? props.items.filter(Boolean) : [];
  const categoryMainSource = pageCards.length > 0 ? pageCards : (productItems.length > 0 ? productItems : listItems);
  const hasTopPanel = Boolean(pageData?.topPanel && typeof pageData.topPanel === 'object');
  const terminalCategoryPage = hasTopPanel || pageModels.length > 0;
  const siblingItems = Array.isArray(props.secondaryMenuItems) ? props.secondaryMenuItems.filter(Boolean) : [];
  const currentCategory = props.currentCategoryItem || {};
  const parentCategory = props.parentCategory || null;
  const currentRouteUrl = currentCategory?.url || '';
  const hasParentCategory = Boolean(parentCategory?.url || parentCategory?.name);
  const normalizedCategoryNavItems = siblingItems.map((item) => ({
    title: item?.title || item?.label || '',
    description: item?.description || item?.summary || '',
    image: item?.image || '',
    imageAlt: item?.imageAlt || item?.title || item?.label || '',
    href: item?.url || item?.href || '#',
    active: Boolean(item?.active) || (item?.url || item?.href || '') === currentRouteUrl,
    ctaLabel: item?.ctaLabel || ''
  }));
  const categorySidebar = normalizedCategoryNavItems.length > 0 ? props.component('spirax_product_side_nav', {
    secondaryMenuItems: normalizedCategoryNavItems,
    secondaryMenuTitle: props.secondaryMenuTitle,
    secondaryMenuParentUrl: props.secondaryMenuParentUrl
  }) : null;
  const modelsSidebar = normalizedCategoryNavItems.length > 0 ? props.component('spirax_product_side_nav', {
    secondaryMenuItems: normalizedCategoryNavItems,
    secondaryMenuTitle: hasParentCategory ? (parentCategory?.name || props.secondaryMenuTitle) : props.secondaryMenuTitle,
    secondaryMenuParentUrl: hasParentCategory ? (parentCategory?.url || '') : props.secondaryMenuParentUrl
  }) : null;
  const showLegacyPager = !categoryLandingPage && !terminalCategoryPage && Boolean(props.pagerHtml);
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
    componentId: \`product-overview-\${props.bigId || props.currentCategoryItem?.id || 'category'}\`,
    showAllLabel: '展开全部',
    collapseLabel: '收起'
  });
  const masthead = props.component('spirax_short_masthead', {
    title: pageData?.title || props.smallName || props.title,
    summary: pageData?.summary || props.currentCategoryDescription || props.currentCategoryItem?.seoDescription || '',
    image: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
    imageAlt: pageData?.title || props.smallName || props.title || '',
    className: 'short-masthead'
  });
  const topPanel = hasTopPanel ? props.component('spirax_product_top_panel', {
    product: {
      title: pageData?.title || props.smallName || props.title || '',
      summary: pageData?.summary || props.currentCategoryDescription || '',
      primaryImage: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
      images: Array.isArray(pageData?.topPanel?.images) ? pageData.topPanel.images : []
    },
    title: pageData?.title || props.smallName || props.title || '',
    image: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
    topPanel: pageData?.topPanel || null,
    quickFactsTitle: 'Quick facts'
  }) : null;
  const cards = props.component('spirax_content_card_grid', {
    cards: categoryMainSource.map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || item?.description || '',
      image: item?.image || '',
      imageAlt: item?.imageAlt || item?.name || item?.title || '',
      href: item?.url || item?.link || item?.href || '',
      itemClassName: ['content-card-grid__item', item?.image ? 'content-card-grid__item--grey' : 'content-card-grid__item--light-blue'].filter(Boolean).join(' '),
      linkClassName: 'content-card-grid__link',
      titleClassName: 'content-card-grid__title content-card-grid__title--uppercase'
    })),
    gridClassName: 'content-card-grid__grid',
    wrapperClassName: 'content-card-grid content-card-grid--compact content-card-grid--mobile-carousel product-card-grid-section product-card-grid-section--cols-3'
  });
  const modelsSection = props.component('spirax_content_card_grid', {
    cards: pageModels.map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || item?.description || '',
      image: item?.image || '',
      imageAlt: item?.imageAlt || item?.name || item?.title || '',
      href: item?.url || item?.link || item?.href || '',
      itemClassName: 'content-card-grid__item',
      linkClassName: 'content-card-grid__link',
      titleClassName: 'content-card-grid__title content-card-grid__title--uppercase'
    })),
    gridClassName: 'content-card-grid__grid',
    wrapperClassName: 'content-card-grid content-card-grid--compact product-card-grid-section product-card-grid-section--cols-3'
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
  const bodySection = !categoryLandingPage && Boolean(props.bodyHtml)
    ? (
      terminalCategoryPage ? (
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
      {masthead}
      {topPanel}
      {introSection}
      {benefitsSection}
      {overviewSection}
      {bodySection}

      {categoryMainSource.length > 0 ? (
        <section className={(productRoot || categoryMainSource.some((item) => item?.image)) ? 'bg--light-blue' : 'bg--white'}>
          <div className="wrapper wrapper--pad-l">
            <div className="product-category-layout__shell">
              {categorySidebar}
              <div className="product-category-layout__main">
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
            <div className="product-category-layout__shell">
              {modelsSidebar}
              <div className="product-category-layout__main">
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
    gridClassName: 'content-card-grid__grid',
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
  const eyebrow = props.secondaryMenuTitle || 'Browse categories';
  const eyebrowLink = props.secondaryMenuParentUrl || '';

  return (
    <aside className="product-category-sidebar">
      <div className="product-category-sidebar__inner">
        <p className="product-category-sidebar__eyebrow">
          {eyebrowLink ? <a className="product-category-sidebar__eyebrow-link" href={eyebrowLink}>{eyebrow}</a> : eyebrow}
        </p>
        <nav className="product-category-sidebar__nav">
          <ul className="product-category-sidebar__list">
            {items.map((item, index) => (
              <li className="product-category-sidebar__item" key={item?.url || item?.href || item?.title || item?.label || index}>
                <a
                  aria-current={item?.active ? 'page' : undefined}
                  className={[
                    'product-category-sidebar__link',
                    item?.image ? 'product-category-sidebar__link--with-image' : '',
                    item?.active ? 'is-active' : ''
                  ].filter(Boolean).join(' ')}
                  href={item?.url || item?.href || '#'}
                >
                  {item?.image ? (
                    <img
                      alt={item?.imageAlt || item?.title || item?.label || ''}
                      className="product-category-sidebar__image"
                      height="72"
                      loading="lazy"
                      src={item.image}
                      width="72"
                    />
                  ) : null}
                  <span className="product-category-sidebar__content">
                    <span className="product-category-sidebar__title">{item?.title || item?.label || ''}</span>
                    {item?.description ? <span className="product-category-sidebar__desc">{item.description}</span> : null}
                    {item?.ctaLabel ? <span className="product-category-sidebar__cta">{item.ctaLabel}</span> : null}
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
      {items.map((item, index) => props.component('spirax_button', {
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
  const shell = props.component('spirax_shell', props);
  const product = props.currentProduct || props.currentContent || {};
  const productPageData = product.pageData || props.currentProductPageData || {};
  const sectionNavItems = Array.isArray(props.sectionNavItems) ? props.sectionNavItems : [];
  const masthead = props.component('spirax_short_masthead', {
    title: product.title || props.title,
    image: product.primaryImage || props.image || '',
    imageAlt: product.title || props.title || '',
    className: 'short-masthead'
  });
  const breadcrumbs = props.component('spirax_breadcrumbs', {
    ariaLabel: 'Breadcrumb',
    includeItemsWrapper: false,
    items: Array.isArray(props.breadcrumb?.items) ? props.breadcrumb.items.map((item, index, all) => ({
      label: item?.label || '',
      href: item?.url || '',
      current: !item?.url && index === all.length - 1
    })) : [],
    tag: 'nav'
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
  const relatedCards = props.component('spirax_content_card_grid', {
    cards: (props.relatedProductItems || []).map((item) => ({
      title: item?.name || item?.title || '',
      description: item?.summary || '',
      image: item?.image || '',
      imageAlt: item?.name || item?.title || '',
      href: item?.url || '',
      itemClassName: 'content-card-grid__item content-card-grid__item--grey',
      linkClassName: 'content-card-grid__link',
      titleClassName: 'content-card-grid__title'
    })),
    gridClassName: 'content-card-grid__grid',
    wrapperClassName: 'content-card-grid content-card-grid--mobile-carousel'
  });
  const content = (
    <main className="sg-page-shell sg-product-page">
      {masthead}
      {breadcrumbs}
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
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    target,
    rel
  } = props || {};
  const classes = [
    'sg-ui-button',
    size && size !== 'none' ? \`sg-ui-button--\${size}\` : '',
    variant && variant !== 'none' ? \`sg-ui-button--\${variant}\` : '',
    className || ''
  ].filter(Boolean).join(' ');

  if (href && !disabled) {
    return <a className={classes} href={href} rel={rel} target={target}>{children}</a>;
  }

  return <button className={classes} disabled={disabled} type={type}>{children}</button>;
}
`;
}

function buildShortMastheadComponent() {
  return `
import React from 'react';

export default function Component(props) {
  const {
    align = 'left',
    className = '',
    headingClassName = '',
    image = '',
    imageAlt = '',
    mobileAlign = 'center',
    overlayStyle,
    size = 'short',
    summary = '',
    title = ''
  } = props || {};
  const hasImage = Boolean(image);

  return (
    <header
      className={['sg-short-masthead', \`sg-short-masthead--\${size}\`, hasImage ? 'sg-short-masthead--with-image' : '', className || ''].filter(Boolean).join(' ')}
      data-align={align}
      data-mobile-align={mobileAlign}
      data-size={size}
    >
      {hasImage ? (
        <img alt={imageAlt || ''} aria-hidden="true" className="sg-short-masthead__image" fetchPriority="high" loading="eager" src={image} />
      ) : null}
      <div aria-hidden="true" className="sg-short-masthead__overlay" style={overlayStyle}></div>
      <div className="sg-short-masthead__text">
        <div className="sg-short-masthead__body">
          {title ? <h1 className={['sg-short-masthead__heading', 'masthead__heading', headingClassName].filter(Boolean).join(' ')}>{title}</h1> : null}
          {summary ? <p className="sg-short-masthead__summary">{summary}</p> : null}
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
    includeItemsWrapper = true,
    items = [],
    tag = 'div'
  } = props || {};

  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  const Tag = tag === 'nav' ? 'nav' : 'div';
  const content = items.map((item, index) => {
    const isCurrent = Boolean(item?.current) || (!item?.href && index === items.length - 1);
    return (
      <React.Fragment key={\`\${item?.label || ''}-\${index}\`}>
        {isCurrent ? (
          <span className="breadcrumb__link is-current">{item?.label || ''}</span>
        ) : (
          <a className="breadcrumb__link" href={item?.href || '#'}>{item?.label || ''}</a>
        )}
        {index < items.length - 1 ? <span aria-hidden="true" className="breadcrumb__sep">/</span> : null}
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

function buildProductImageGalleryComponent() {
  return `
import React from 'react';

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
      className="product-image-gallery product-image-gallery--static"
    >
      <section aria-label={label} className="product-image-gallery__main" style={{ display: 'grid', gap: '12px' }}>
        {images.map((image, index) => (
          <div className="product-image-gallery__slide-shell" key={image?.src || index}>
            <div className="product-image-gallery__image-shell">
              <img alt={image?.alt || title || ''} className="product-image-gallery__image" loading={index === 0 ? 'eager' : 'lazy'} src={image?.src} />
            </div>
          </div>
        ))}
      </section>
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
                    {props.component('spirax_button', {
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
        <div className="content-card-grid__grid">
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
  const shell = props.component('spirax_shell', props);
  const items = Array.isArray(props.items) ? props.items : [];
  const content = (
    <main className="sg-content-shell sg-news-page">
      <section className="short-masthead">
        <div className="wrapper wrapper--pad-l">
          <div className="short-masthead__content">
            <p className="short-masthead__eyebrow">${sectionTitle}</p>
            <h1 className="short-masthead__title">{props.title}</h1>
          </div>
        </div>
      </section>

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
  const shell = props.component('spirax_shell', props);
  const article = props.currentArticle || props.currentContent || {};
  const relatedItems = Array.isArray(props.relatedArticleItems) ? props.relatedArticleItems : [];
  const content = (
    <main className="sg-content-shell sg-news-page">
      <section className="short-masthead">
        <div className="wrapper wrapper--pad-l">
          <div className="short-masthead__content">
            <p className="short-masthead__eyebrow">{props.currentCategoryItem?.name || 'News'}</p>
            <h1 className="short-masthead__title">{article.title || props.title}</h1>
          </div>
        </div>
      </section>

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
  const shell = props.component('spirax_shell', props);
  const article = props.currentArticle || props.currentContent || {};
  const relatedItems = Array.isArray(props.relatedArticleItems) ? props.relatedArticleItems : [];
  const content = (
    <main className="sg-page-shell sg-service-page">
      <section className="short-masthead">
        <div className="wrapper wrapper--pad-l">
          <div className="short-masthead__content">
            <p className="short-masthead__eyebrow">Service</p>
            <h1 className="short-masthead__title">{article.title || props.title}</h1>
            {article.summary ? <p className="short-masthead__summary">{article.summary}</p> : null}
          </div>
        </div>
      </section>

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
  const shell = props.component('spirax_shell', props);
  const pageData = props.currentCategoryPageData || props.pageData || {};
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
  const heroImage = pageData?.hero?.image || pageData.heroImage || pageData.mastheadImage || props.currentCategoryHeroImage || '';
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
              {props.component('spirax_button', {
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
            {props.component('spirax_button', {
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
    wrapperClassName: 'wrapper wrapper--pad-l'
  }) : null;
  const proofSection = proofItems.length > 0 ? (
    <section className="bg--white">
      <div className="wrapper wrapper--pad-l">
        <div className="section-header">
          {pageData?.proof?.title ? <h2 className="section-header__title">{pageData.proof.title}</h2> : null}
        </div>
        <div className="content-card-grid__grid">
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
        <div className="content-card-grid__grid">
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
            {props.component('spirax_button', {
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
        wrapperClassName: 'wrapper wrapper--pad-l'
      })}
    </section>
  ) : null;
  const content = (
    <main className="sg-page-shell sg-content-shell">
      {masthead}
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
  const shell = props.component('spirax_shell', props);
  const content = (
    <main className="sg-page-shell sg-content-shell sg-contact-page">
      <section className="short-masthead">
        <div className="wrapper wrapper--pad-l">
          <div className="short-masthead__content">
            <h1 className="short-masthead__title">联系我们</h1>
          </div>
        </div>
      </section>
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
