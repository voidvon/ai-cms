import {
  createTemplate,
  ensureTemplatesSchema,
  listTemplates,
  publishTemplate,
  updateTemplate
} from '../src/services/templates.mjs';
import {
  createTemplateVariant,
  ensureTemplateVariantsSchema,
  listTemplateVariants,
  updateTemplateVariant
} from '../src/services/template-variants.mjs';

const DEFAULT_THEME_NAME = '默认模板';

const basePageScss = String.raw`
:root {
  color-scheme: light;
  --page-bg: #f3f6fb;
  --surface: #ffffff;
  --surface-soft: #f8fbff;
  --text: #0f172a;
  --muted: #64748b;
  --line: #dbe5f0;
  --brand: #0f5bd8;
  --brand-deep: #0f2d6b;
  --shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
  --radius-lg: 24px;
  --radius-md: 18px;
  --radius-sm: 12px;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  padding: 0;
}

body {
  font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  background: linear-gradient(180deg, #f8fbff 0%, var(--page-bg) 100%);
  color: var(--text);
  line-height: 1.7;
}

a {
  color: var(--brand);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
}

img {
  max-width: 100%;
  display: block;
}

.page-shell {
  width: min(1120px, calc(100% - 32px));
  margin: 0 auto;
  padding: 28px 0 72px;
}

.page-header {
  display: grid;
  gap: 8px;
  padding: 24px 28px;
  border: 1px solid var(--line);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.page-eyebrow {
  color: var(--muted);
  font-size: 13px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.page-title {
  margin: 0;
  font-size: clamp(30px, 4vw, 42px);
  line-height: 1.15;
}

.breadcrumb {
  color: var(--muted);
  font-size: 14px;

  a {
    color: inherit;
  }
}

.panel {
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

@media (max-width: 768px) {
  .page-shell {
    width: min(100% - 24px, 1120px);
    padding-top: 20px;
  }

  .page-header {
    padding: 20px;
  }
}
`;

function buildScss(extra) {
  return String(extra || '').trim();
}

function withScss(scss, componentSource) {
  return `export const scss = String.raw\`${scss}\`;\n\n${componentSource.trim()}\n`;
}

const templateDefinitions = [
  {
    name: '默认模板-页面壳组件',
    code: 'default_page_shell_component',
    type: 'component',
    sort_order: 140,
    content: withScss(basePageScss, String.raw`export default function DefaultPageShellComponent({ pageTitle = '', lang = 'zh-CN', children, slots = {}, head = null, bodyEnd = null }) {
  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>{pageTitle || ''}</title>
        {head}
      </head>
      <body>
        <main className="page-shell">
          {slots.header}
          {children}
          {slots.footer}
        </main>
        {bodyEnd}
      </body>
    </html>
  );
}
`)
  },
  {
    name: '默认模板-页面头组件',
    code: 'default_page_header_component',
    type: 'component',
    sort_order: 150,
    content: withScss(String.raw`
.page-primary-menu,
.page-secondary-menu {
  margin-top: 18px;
}

.page-secondary-menu {
  border-top: 1px solid rgba(15, 23, 42, 0.08);
  padding-top: 16px;
}

.page-primary-menu__toggle,
.page-secondary-menu__toggle {
  display: none;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: #ffffff;
  color: var(--text);
  padding: 12px 14px;
  font: inherit;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.06);
  transition: border-color 180ms ease, box-shadow 180ms ease;

  &:hover {
    border-color: rgba(37, 99, 235, 0.24);
    box-shadow: 0 12px 22px rgba(37, 99, 235, 0.12);
  }
}

.page-primary-menu__toggle-label,
.page-secondary-menu__toggle-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-primary-menu__toggle-icon,
.page-secondary-menu__toggle-icon {
  flex: 0 0 auto;
  color: var(--muted);
  transition: transform 180ms ease, color 180ms ease;
}

.page-primary-menu.is-open .page-primary-menu__toggle-icon,
.page-secondary-menu.is-open .page-secondary-menu__toggle-icon {
  transform: rotate(180deg);
  color: var(--brand);
}

.page-primary-menu__panel,
.page-secondary-menu__panel {
  position: relative;
  overflow: hidden;
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(248, 250, 252, 0.96));
  box-shadow:
    inset 0 0 0 1px rgba(148, 163, 184, 0.18),
    0 12px 32px rgba(15, 23, 42, 0.08);
}

.page-primary-menu__track,
.page-secondary-menu__track {
  position: relative;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0 12px;
  scrollbar-width: thin;
  scrollbar-color: rgba(148, 163, 184, 0.5) transparent;

  &::-webkit-scrollbar {
    height: 7px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.42);
    border-radius: 999px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.page-primary-menu__indicator,
.page-secondary-menu__indicator {
  position: absolute;
  left: 0;
  bottom: 0;
  width: 0;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, var(--brand-deep), var(--brand));
  opacity: 0;
  transform: translateX(0);
  box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.06);
  transition: transform 180ms ease, width 180ms ease, opacity 180ms ease;
}

.page-primary-menu__link,
.page-secondary-menu__link {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  min-height: 56px;
  padding: 0 20px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
  transition: color 180ms ease, background-color 180ms ease;

  &::before {
    content: '';
    position: absolute;
    inset: 8px 4px;
    border-radius: 10px;
    background: rgba(37, 99, 235, 0);
    transition: background-color 180ms ease;
    z-index: 0;
  }

  span {
    position: relative;
    z-index: 1;
  }

  &:hover {
    color: var(--brand);
    text-decoration: none;

    &::before {
      background: rgba(37, 99, 235, 0.08);
    }
  }
}

.page-primary-menu__link.is-active,
.page-secondary-menu__link.is-active {
  color: var(--brand-deep);

  &::before {
    background: rgba(37, 99, 235, 0.1);
  }
}

@media (max-width: 860px) {
  .page-primary-menu__toggle,
  .page-secondary-menu__toggle {
    display: flex;
  }

  .page-primary-menu__panel,
  .page-secondary-menu__panel {
    display: none;
    margin-top: 12px;
    border-radius: 16px;
  }

  .page-primary-menu.is-open .page-primary-menu__panel,
  .page-secondary-menu.is-open .page-secondary-menu__panel {
    display: block;
  }

  .page-primary-menu__track,
  .page-secondary-menu__track {
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    overflow: visible;
    padding: 12px;
  }

  .page-primary-menu__link,
  .page-secondary-menu__link {
    min-height: auto;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: var(--radius-sm);
    justify-content: flex-start;
    background: var(--surface-soft);

    &::before {
      inset: 0;
    }
  }

  .page-primary-menu__indicator,
  .page-secondary-menu__indicator {
    display: none;
  }
}
`, String.raw`function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

function renderMenu(items = [], options = {}) {
  const normalizedItems = Array.isArray(items)
    ? items.filter((item) => item && item.label && item.url)
    : [];

  if (normalizedItems.length === 0) {
    return null;
  }

  const activeItem = normalizedItems.find((item) => item.active) || normalizedItems[0];
  const menuClass = options.menuClass || 'page-primary-menu';
  const toggleLabel = options.toggleLabel || activeItem?.label || '栏目导航';
  const attrPrefix = options.attrPrefix || 'primary';

  return (
    <div className={menuClass} data-default-menu="">
      <button
        type="button"
        className={menuClass + '__toggle'}
        data-default-menu-toggle=""
        aria-expanded="false"
      >
        <span className={menuClass + '__toggle-label'}>{toggleLabel}</span>
        <span className={menuClass + '__toggle-icon'} aria-hidden="true">▾</span>
      </button>
      <div className={menuClass + '__panel'} data-default-menu-panel="">
        <div className={menuClass + '__track'}>
          {normalizedItems.map((item) => (
            <a
              key={attrPrefix + ':' + item.url + ':' + item.label}
              href={item.url}
              className={item.active ? menuClass + '__link is-active' : menuClass + '__link'}
              data-default-menu-link=""
              aria-current={item.active ? 'page' : undefined}
            >
              <span>{item.label}</span>
            </a>
          ))}
          <span className={menuClass + '__indicator'} data-default-menu-indicator="" />
        </div>
      </div>
    </div>
  );
}

function renderPrimaryMenu(items = []) {
  return renderMenu(items, {
    menuClass: 'page-primary-menu',
    toggleLabel: '站点导航',
    attrPrefix: 'primary'
  });
}

function renderSecondaryMenu(items = []) {
  const activeItem = Array.isArray(items)
    ? items.find((item) => item && item.active)
    : null;
  return renderMenu(items, {
    menuClass: 'page-secondary-menu',
    toggleLabel: activeItem?.label || '站点导航',
    attrPrefix: 'secondary'
  });
}

function resolveRootColumnActive(column, currentPage = {}, currentSection = {}) {
  const pageType = String(currentPage?.type || '');
  const sectionType = String(currentSection?.type || '');
  const sourceType = String(column?.sourceType || '');
  const sourceId = Number(column?.sourceId || 0);

  if (sourceType === 'product_root') {
    return sectionType === 'product';
  }
  if (sourceType === 'corporation_root') {
    return sectionType === 'corporation';
  }
  if (sourceType === 'contact_page') {
    return pageType === 'contact';
  }
  if (sourceType === 'message_page') {
    return pageType === 'message';
  }
  if (sourceType === 'news_category' && sourceId === 4) {
    return sectionType === 'news';
  }
  if (sourceType === 'news_category' && sourceId === 12) {
    return sectionType === 'service';
  }

  return false;
}

function buildRootColumnMenuItems(siteColumns = [], currentPage = {}, currentSection = {}) {
  return (Array.isArray(siteColumns) ? siteColumns : [])
    .filter((item) => item && Number(item.parentId || 0) === 0 && item.url)
    .filter((item) => !['contact_page', 'message_page'].includes(String(item?.sourceType || '')))
    .map((item) => ({
      label: item.name || '',
      url: item.url,
      active: Boolean(item.active) || resolveRootColumnActive(item, currentPage, currentSection)
    }));
}

export function client() {
  const menus = Array.from(document.querySelectorAll('[data-default-menu]'));
  for (const nav of menus) {
    if (nav.dataset.bound === '1') {
      continue;
    }
    nav.dataset.bound = '1';
    const toggle = nav.querySelector('[data-default-menu-toggle]');
    const panel = nav.querySelector('[data-default-menu-panel]');
    const indicator = nav.querySelector('[data-default-menu-indicator]');
    const links = Array.from(nav.querySelectorAll('[data-default-menu-link]'));
    const mobileMedia = window.matchMedia('(max-width: 860px)');

    function setOpen(nextOpen) {
      nav.classList.toggle('is-open', nextOpen);
      if (toggle) {
        toggle.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
      }
      if (panel && mobileMedia.matches) {
        panel.style.display = nextOpen ? 'block' : 'none';
      } else if (panel) {
        panel.style.display = '';
      }
    }

    function setIndicator(target) {
      if (!indicator || !target || mobileMedia.matches) {
        if (indicator) {
          indicator.style.opacity = '0';
        }
        return;
      }
      const track = indicator.parentElement;
      const trackRect = track?.getBoundingClientRect();
      const linkRect = target.getBoundingClientRect();
      if (!trackRect || !linkRect) {
        indicator.style.opacity = '0';
        return;
      }
      const scrollLeft = track?.scrollLeft || 0;
      indicator.style.width = linkRect.width + 'px';
      indicator.style.transform = 'translateX(' + (linkRect.left - trackRect.left + scrollLeft) + 'px)';
      indicator.style.opacity = '1';
    }

    function scrollIntoView(target) {
      if (!target || mobileMedia.matches || typeof target.scrollIntoView !== 'function') {
        return;
      }
      target.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest'
      });
    }

    const activeLink = links.find((item) => item.classList.contains('is-active')) || links[0] || null;

    toggle?.addEventListener('click', () => {
      setOpen(!nav.classList.contains('is-open'));
    });

    for (const link of links) {
      link.addEventListener('mouseenter', () => setIndicator(link));
      link.addEventListener('focus', () => setIndicator(link));
      link.addEventListener('click', () => {
        if (mobileMedia.matches) {
          setOpen(false);
        }
      });
    }

    nav.addEventListener('mouseleave', () => setIndicator(activeLink));
    panel?.addEventListener('scroll', () => setIndicator(activeLink), { passive: true });
    document.addEventListener('click', (event) => {
      if (!nav.contains(event.target)) {
        setOpen(false);
      }
    });

    mobileMedia.addEventListener('change', () => {
      setOpen(false);
      scrollIntoView(activeLink);
      setIndicator(activeLink);
    });

    window.addEventListener('resize', () => setIndicator(activeLink));
    setOpen(false);
    scrollIntoView(activeLink);
    setIndicator(activeLink);
  }
}

export default function DefaultPageHeaderComponent({ eyebrow = '', title = '', breadcrumbItems = [], secondaryMenuItems = [], siteColumns = [], currentPage = {}, currentSection = {} }) {
  const menuItems = buildRootColumnMenuItems(siteColumns, currentPage, currentSection);

  return (
    <header className="page-header">
      <div className="page-eyebrow">{eyebrow || '页面标题'}</div>
      <h1 className="page-title">{title || '标题'}</h1>
      {renderSecondaryMenu(menuItems.length > 0 ? menuItems : secondaryMenuItems)}
      {renderBreadcrumb(Array.isArray(breadcrumbItems) ? breadcrumbItems : [])}
    </header>
  );
}
`)
  },
  {
    name: '默认模板-面板组件',
    code: 'default_panel_component',
    type: 'component',
    sort_order: 160,
    content: String.raw`export default function DefaultPanelComponent({ title = '', children, className = '' }) {
  const classes = ['panel', className].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
`
  },
  {
    name: '默认模板-首页',
    code: 'default_home_tsx',
    type: 'home',
    sort_order: 200,
    content: withScss(buildScss(String.raw`
.home-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
  margin-top: 24px;
}

.home-card {
  padding: 22px;

  h2 {
    margin: 0 0 14px;
    font-size: 18px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }
}

.home-meta {
  margin-top: 24px;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 900px) {
  .home-grid {
    grid-template-columns: 1fr;
  }
}
`), String.raw`
export default function DefaultHomeTemplate({ site = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], newsIndexHtml = '', featuredProductLinksHtml = '', serviceIndexHtml = '', Raw, component }) {
  const title = site.web_name || '网站首页';

  return (
    component('default_page_shell_component', {
      pageTitle: title,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: site.company_name || 'Default Theme',
          title,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: (
        <>
          <section className="home-grid">
            {component('default_panel_component', {
              title: '推荐产品',
              className: 'home-card',
              children: <ul><Raw html={featuredProductLinksHtml || '<li>暂无内容</li>'} /></ul>
            })}
            {component('default_panel_component', {
              title: '新闻资讯',
              className: 'home-card',
              children: <ul><Raw html={newsIndexHtml || '<li>暂无内容</li>'} /></ul>
            })}
            {component('default_panel_component', {
              title: '阀门知识',
              className: 'home-card',
              children: <ul><Raw html={serviceIndexHtml || '<li>暂无内容</li>'} /></ul>
            })}
          </section>

          <div className="home-meta">
            联系电话：{site.company_phone || '-'} ｜ 邮箱：{site.company_email || '-'} ｜ 地址：{site.company_address || '-'}
          </div>
        </>
      )
    })
  );
}
`)
  },
  {
    name: '默认模板-公司内容',
    code: 'default_content_tsx',
    type: 'content',
    sort_order: 210,
    content: withScss(buildScss(String.raw`
.content-body {
  margin-top: 20px;
  padding: 28px;
  line-height: 1.9;
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultContentTemplate({ site = {}, title = '', contentHtml = '', breadcrumb = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], Raw, component }) {
  const items = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = title ? title + ' - ' + (site.web_name || '') : site.web_name || '';

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: currentSection?.name || '公司栏目',
          title: title || site.web_name || '',
          breadcrumbItems: items,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: component('default_panel_component', {
        className: 'content-body',
        children: <Raw html={contentHtml || '<p>暂无内容</p>'} />
      })
    })
  );
}
`)
  },
  {
    name: '默认模板-产品列表',
    code: 'default_product_list_tsx',
    type: 'list',
    sort_order: 220,
    content: withScss(buildScss(String.raw`
.list-toolbar,
.list-pager {
  margin-top: 20px;
  padding: 18px 20px;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-top: 20px;
}

.product-card {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr);
  gap: 16px;
  padding: 18px;

  img {
    width: 148px;
    height: 112px;
    border-radius: 14px;
    object-fit: cover;
    background: #e2e8f0;
  }

  h2 {
    margin: 0 0 10px;
    font-size: 18px;
  }

  p {
    margin: 0;
    color: var(--muted);
  }
}

@media (max-width: 800px) {
  .product-grid {
    grid-template-columns: 1fr;
  }

  .product-card {
    grid-template-columns: 1fr;

    img {
      width: 100%;
      height: auto;
      aspect-ratio: 4 / 3;
    }
  }
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultProductListTemplate({ site = {}, title = '', items = [], pagerHtml = '', productsSmallCatHtml = '', breadcrumb = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], Raw, component }) {
  const breadcrumbItems = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = title ? title + ' - ' + (site.web_name || '') : site.web_name || '';

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: '产品展示',
          title: title || '产品列表',
          breadcrumbItems,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: (
        <>
          {component('default_panel_component', {
            className: 'list-toolbar',
            children: <Raw html={productsSmallCatHtml || ''} />
          })}

          <section className="product-grid">
            {items.length > 0 ? items.map((item) => (
              <article className="product-card panel" key={item.id || item.url || item.name}>
                <a href={item.url || '#'}>
                  <img src={item.image || '/skin/dfpic.gif'} alt={item.name || ''} />
                </a>
                <div>
                  <h2><a href={item.url || '#'}>{item.name || '未命名产品'}</a></h2>
                  <p>{item.summary || '暂无简介'}</p>
                </div>
              </article>
            )) : <article className="product-card panel"><div>暂无产品</div></article>}
          </section>

          {component('default_panel_component', {
            className: 'list-pager',
            children: <Raw html={pagerHtml || ''} />
          })}
        </>
      )
    })
  );
}
`)
  },
  {
    name: '默认模板-产品详情',
    code: 'default_product_detail_tsx',
    type: 'content',
    sort_order: 230,
    content: withScss(buildScss(String.raw`
.product-hero {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 24px;
  margin-top: 20px;
  padding: 24px;

  img {
    width: 100%;
    border-radius: 16px;
    background: #e2e8f0;
  }
}

.product-meta {
  color: var(--muted);
}

.product-section {
  margin-top: 20px;
  padding: 24px;
}

@media (max-width: 900px) {
  .product-hero {
    grid-template-columns: 1fr;
  }
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultProductDetailTemplate({ site = {}, title = '', image = '', code = '', bodyHtml = '', relatedProductsHtml = '', breadcrumb = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], Raw, component }) {
  const items = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = title ? title + ' - ' + (site.web_name || '') : site.web_name || '';

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: '产品详情',
          title: title || '产品详情',
          breadcrumbItems: items,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: (
        <>
          <section className="product-hero panel">
            <div>
              <img src={image || '/skin/dfpic.gif'} alt={title || ''} />
            </div>
            <div className="product-meta">
              <div>产品编号：{code || '-'}</div>
              <div>站点名称：{site.web_name || '-'}</div>
              <div>联系电话：{site.company_phone || '-'}</div>
            </div>
          </section>

          {component('default_panel_component', {
            title: '产品介绍',
            className: 'product-section',
            children: <Raw html={bodyHtml || '<p>暂无内容</p>'} />
          })}

          {component('default_panel_component', {
            title: '相关产品',
            className: 'product-section',
            children: <Raw html={relatedProductsHtml || '<p>暂无相关产品</p>'} />
          })}
        </>
      )
    })
  );
}
`)
  },
  {
    name: '默认模板-文章列表',
    code: 'default_article_list_tsx',
    type: 'list',
    sort_order: 240,
    content: withScss(buildScss(String.raw`
.article-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  margin-top: 20px;
}

.article-nav,
.article-list,
.article-pager {
  padding: 22px;
}

.article-item {
  padding: 18px 0;
  border-bottom: 1px solid var(--line);

  &:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  h2 {
    margin: 0 0 8px;
    font-size: 20px;
  }
}

.article-meta {
  color: var(--muted);
  font-size: 13px;
}

.article-summary {
  margin: 8px 0 0;
  color: var(--muted);
}

@media (max-width: 900px) {
  .article-layout {
    grid-template-columns: 1fr;
  }
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultArticleListTemplate({ site = {}, title = '', items = [], pagerHtml = '', sectionCategoryHtml = '', siteColumns = [], currentPage = {}, currentSection = {}, breadcrumb = {}, secondaryMenuItems = [], Raw, component }) {
  const breadcrumbItems = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = title ? title + ' - ' + (site.web_name || '') : site.web_name || '';

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: currentSection?.name || '文章列表',
          title: title || '分类',
          breadcrumbItems,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: (
        <div className="article-layout">
          {component('default_panel_component', {
            className: 'article-nav',
            title: '栏目导航',
            children: <Raw html={sectionCategoryHtml || '<p>暂无分类</p>'} />
          })}

          <div>
            {component('default_panel_component', {
              className: 'article-list',
              children: items.length > 0 ? items.map((item) => (
                <article className="article-item" key={item.id || item.url || item.title}>
                  <h2><a href={item.url || '#'}>{item.title || '未命名文章'}</a></h2>
                  <div className="article-meta">{item.date || ''}</div>
                  <p className="article-summary">{item.summary || '暂无摘要'}</p>
                </article>
              )) : <article className="article-item"><div>暂无内容</div></article>
            })}
            {component('default_panel_component', {
              className: 'article-pager',
              children: <Raw html={pagerHtml || ''} />
            })}
          </div>
        </div>
      )
    })
  );
}
`)
  },
  {
    name: '默认模板-文章详情',
    code: 'default_article_detail_tsx',
    type: 'content',
    sort_order: 250,
    content: withScss(buildScss(String.raw`
.article-body,
.article-links {
  margin-top: 20px;
  padding: 24px;
}

.article-body {
  line-height: 1.9;
}

.article-links {
  display: grid;
  gap: 10px;
  color: var(--muted);
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultArticleDetailTemplate({ site = {}, title = '', bodyHtml = '', previousHtml = '', nextHtml = '', siteColumns = [], currentPage = {}, currentSection = {}, breadcrumb = {}, secondaryMenuItems = [], Raw, component }) {
  const breadcrumbItems = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = title ? title + ' - ' + (site.web_name || '') : site.web_name || '';

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: currentSection?.name || '文章详情',
          title: title || '文章详情',
          breadcrumbItems,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: (
        <>
          {component('default_panel_component', {
            className: 'article-body',
            children: <Raw html={bodyHtml || '<p>暂无内容</p>'} />
          })}

          {component('default_panel_component', {
            className: 'article-links',
            children: (
              <>
                <div><strong>上一篇：</strong><Raw html={previousHtml || '<span>没有上一篇</span>'} /></div>
                <div><strong>下一篇：</strong><Raw html={nextHtml || '<span>没有下一篇</span>'} /></div>
              </>
            )
          })}
        </>
      )
    })
  );
}
`)
  },
  {
    name: '默认模板-联系页',
    code: 'default_contact_tsx',
    type: 'content',
    sort_order: 260,
    content: withScss(buildScss(String.raw`
.contact-card {
  margin-top: 20px;
  padding: 28px;
}

.contact-row {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--line);

  &:last-child {
    border-bottom: 0;
  }
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultContactTemplate({ site = {}, breadcrumb = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], component }) {
  const items = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = '联系我们 - ' + (site.web_name || '');

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: 'Contact',
          title: '联系我们',
          breadcrumbItems: items,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      children: component('default_panel_component', {
        className: 'contact-card',
        children: (
          <>
            <div className="contact-row"><strong>公司名称</strong><span>{site.company_name || site.web_name || '-'}</span></div>
            <div className="contact-row"><strong>联系电话</strong><span>{site.company_phone || '-'}</span></div>
            <div className="contact-row"><strong>传真</strong><span>{site.company_fax || '-'}</span></div>
            <div className="contact-row"><strong>电子邮箱</strong><span>{site.company_email || '-'}</span></div>
            <div className="contact-row"><strong>联系人</strong><span>{site.contact_person || '-'}</span></div>
            <div className="contact-row"><strong>联系地址</strong><span>{site.company_address || '-'}</span></div>
          </>
        )
      })
    })
  );
}
`)
  },
  {
    name: '默认模板-留言页',
    code: 'default_message_tsx',
    type: 'content',
    sort_order: 270,
    content: withScss(buildScss(String.raw`
.message-form {
  margin-top: 20px;
  padding: 28px;
}

.message-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.message-field {
  label {
    display: block;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: 14px;
  }
}

input,
textarea {
  width: 100%;
  border: 1px solid #cbd5e1;
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  font: inherit;
  background: #ffffff;
}

textarea {
  min-height: 160px;
  resize: vertical;
}

.message-submit {
  margin-top: 18px;
  border: 0;
  border-radius: var(--radius-sm);
  padding: 12px 20px;
  background: linear-gradient(135deg, var(--brand-deep), var(--brand));
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}

.message-tips {
  margin-top: 16px;
  color: var(--muted);
  font-size: 14px;
}

@media (max-width: 700px) {
  .message-grid {
    grid-template-columns: 1fr;
  }
}
`), String.raw`
function renderBreadcrumb(items = []) {
  return (
    <nav className="breadcrumb">
      {items.map((item, index) => (
        <span key={index}>
          {index > 0 ? ' / ' : ''}
          {item.url ? <a href={item.url}>{item.label}</a> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

export default function DefaultMessageTemplate({ site = {}, breadcrumb = {}, siteColumns = [], currentPage = {}, currentSection = {}, secondaryMenuItems = [], raw, component }) {
  const script = "document.addEventListener('DOMContentLoaded',function(){var form=document.getElementById('default-message-form');if(!form)return;form.addEventListener('submit',async function(event){event.preventDefault();var body=new URLSearchParams(new FormData(form)).toString();var response=await fetch('/ajaxcode/msg?action=msgadd',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},body:body});if(response.ok){alert('留言提交成功');form.reset();}else{var text=await response.text();alert(text||'留言提交失败');}});});";
  const items = Array.isArray(breadcrumb?.items) ? breadcrumb.items : [];
  const pageTitle = '在线留言 - ' + (site.web_name || '');

  return (
    component('default_page_shell_component', {
      pageTitle,
      slots: {
        header: component('default_page_header_component', {
          eyebrow: 'Message',
          title: '在线留言',
          breadcrumbItems: items,
          siteColumns,
          currentPage,
          currentSection,
          secondaryMenuItems
        })
      },
      bodyEnd: <script dangerouslySetInnerHTML={raw(script)} />,
      children: component('default_panel_component', {
        className: 'message-form',
        children: (
          <form id="default-message-form">
            <div className="message-grid">
              <div className="message-field">
                <label htmlFor="contact_name">姓名</label>
                <input id="contact_name" name="contact_name" required />
              </div>
              <div className="message-field">
                <label htmlFor="phone">电话</label>
                <input id="phone" name="phone" required />
              </div>
              <div className="message-field">
                <label htmlFor="email">邮箱</label>
                <input id="email" name="email" type="email" />
              </div>
              <div className="message-field">
                <label htmlFor="title">主题</label>
                <input id="title" name="title" required />
              </div>
            </div>

            <div className="message-field" style={{ marginTop: '16px' }}>
              <label htmlFor="content">内容</label>
              <textarea id="content" name="content" />
            </div>

            <button type="submit" className="message-submit">提交留言</button>
            <div className="message-tips">联系电话：{site.company_phone || '-'} ｜ 邮箱：{site.company_email || '-'}</div>
          </form>
        )
      })
    })
  );
}
`)
  }
];

async function main() {
  ensureTemplatesSchema();
  ensureTemplateVariantsSchema();

  const currentTemplates = listTemplates();
  const byCode = new Map(currentTemplates.map((item) => [item.code, item]));

  for (const definition of templateDefinitions) {
    const existing = byCode.get(definition.code);
    if (existing) {
      updateTemplate(existing.id, {
        ...existing,
        name: definition.name,
        type: definition.type,
        engine: 'tsx',
        content: definition.content,
        sort_order: definition.sort_order
      });
      publishTemplate(existing.id, '重写为默认模板 TSX + SCSS 版本');
      continue;
    }

    createTemplate({
      name: definition.name,
      code: definition.code,
      type: definition.type,
      engine: 'tsx',
      content: definition.content,
      status: 'published',
      sort_order: definition.sort_order
    });
  }

  const updatedTemplates = listTemplates();
  const defaultThemeComponentIds = updatedTemplates
    .filter((item) => item.type === 'component' && item.code.startsWith('default_'))
    .map((item) => item.id);

  const variants = listTemplateVariants();
  const existingTheme = variants.find((item) => item.template_name === DEFAULT_THEME_NAME) || null;
  const payload = {
    template_name: DEFAULT_THEME_NAME,
    is_selected: 1,
    home_index: 'default_home_tsx',
    co_index: 'default_content_tsx',
    produts_index: null,
    produts_sort1: 'default_product_list_tsx',
    produts_sort2: null,
    produts_detail: 'default_product_detail_tsx',
    news_index: null,
    news_sort1: 'default_article_list_tsx',
    news_detail: 'default_article_detail_tsx',
    service_sort1: 'default_article_list_tsx',
    service_detail: 'default_article_detail_tsx',
    msg_index: 'default_message_tsx',
    contact: 'default_contact_tsx',
    component_template_ids: defaultThemeComponentIds
  };

  if (existingTheme) {
    updateTemplateVariant(existingTheme.id, payload);
  } else {
    createTemplateVariant(payload);
  }

  console.log(`Seeded theme "${DEFAULT_THEME_NAME}" with ${templateDefinitions.length} TSX templates.`);
}

main();
