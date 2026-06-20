import fs from 'node:fs';
import path from 'node:path';
import { getSelectedTemplateVariant, listSelectedThemePublishedComponents, listThemeVariantTemplates } from './services/template-variants.mjs';
import { resolvePublishedTemplate } from './services/templates.mjs';
import { createTsxTemplateElement, renderTsxTemplate } from './tsx-template-renderer.mjs';
import { getTsxTemplateStyleAsset } from './tsx-template-styles.mjs';
import { escapeHtml } from './utils/html.mjs';

export function createCmsTemplateRuntime({
  templateByPage,
  templateTypeByPage,
  templateClientAssetDir,
  expandLegacyCommonPlaceholders
}) {
  const registeredStyleTemplates = new Map();
  const pageTemplateStyleUsage = new Map();

  function renderCmsSitePage(pageName, props, templateContext, options = {}) {
    const templateCode = templateByPage[pageName];
    const templateType = options.templateType || templateTypeByPage[pageName];
    const template = templateCode && templateType ? resolvePublishedTemplate({
      templateType,
      targets: options.targets || [],
      fallbackCode: templateCode,
      fallbackCodes: []
    }) : null;

    if (!template?.tsx_source) {
      throw new Error(`Published CMS template is missing: ${templateCode || pageName}`);
    }

    const styleTemplates = new Map();
    let html = '';

    if (template.engine === 'tsx') {
      registerTsxTemplateAssets(template, { styleTemplates });
      html = renderCmsTsxTemplate(template.tsx_source, props, templateContext, {
        styleTemplates,
        templateCode: template.code
      });
    } else {
      html = renderCmsTemplate(template.tsx_source, props, templateContext, {
        styleTemplates
      });
    }

    return injectPageAssets(html, {
      templateCode: template.code,
      styleTemplates,
      props
    });
  }

  function renderCmsTsxTemplate(content, props, templateContext, options = {}) {
    const components = buildCmsComponentMap(templateContext);
    return expandLegacyCommonPlaceholders(renderTsxTemplate(content, props, {
      templateCode: options.templateCode || '',
      componentResolver: ({ code, props: extraProps, helpers }) => {
        return renderCmsComponentElement(
          code,
          components,
          templateContext,
          mergeComponentProps(props, extraProps),
          0,
          options,
          helpers
        );
      }
    }), templateContext);
  }

  function registerTsxTemplateAssets(template, registries = {}) {
    registerTemplateStyleAsset(template, registries.styleTemplates);
  }

  function registerTemplateStyleAsset(template, styleTemplates = null) {
    const asset = buildStandaloneStyleAsset(template.css_source || '', template.code);
    if (!asset) {
      return;
    }
    registeredStyleTemplates.set(asset.code, asset);
    if (styleTemplates) {
      styleTemplates.set(asset.code, asset);
    }
  }

  function buildStandaloneStyleAsset(styleSource, templateCode) {
    const normalizedStyleSource = String(styleSource || '').trim();
    if (!normalizedStyleSource) {
      return null;
    }
    return getTsxTemplateStyleAsset(buildStyleCarrierSource(normalizedStyleSource), {
      templateCode
    });
  }

  function injectPageAssets(html, { templateCode, styleTemplates, props }) {
    const withSeoHead = injectSeoHead(html, props);
    const withStyles = injectStylesheetLinks(withSeoHead, templateCode, styleTemplates);
    return injectGlobalInteractionScript(withStyles);
  }

  function injectSeoHead(html, props = {}) {
    const headMarkup = buildSeoHeadMarkup(props);
    if (!headMarkup) {
      return html;
    }

    let output = String(html || '');
    const title = String(props?.seoMeta?.openGraph?.title || '').trim();
    if (title) {
      if (/<title>[\s\S]*?<\/title>/i.test(output)) {
        output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
      } else if (/<head[^>]*>/i.test(output)) {
        output = output.replace(/<head[^>]*>/i, (head) => `${head}<title>${escapeHtml(title)}</title>`);
      }
    }

    output = output
      .replace(/<meta\s+name="description"[\s\S]*?>/gi, '')
      .replace(/<meta\s+name="robots"[\s\S]*?>/gi, '')
      .replace(/<link\s+rel="canonical"[\s\S]*?>/gi, '')
      .replace(/<meta\s+property="og:[^"]+"[\s\S]*?>/gi, '')
      .replace(/<meta\s+name="twitter:[^"]+"[\s\S]*?>/gi, '')
      .replace(/<link\s+rel="alternate"[\s\S]*?hreflang[\s\S]*?>/gi, '')
      .replace(/<script\s+type="application\/ld\+json"[\s\S]*?<\/script>/gi, '');

    if (/<\/head>/i.test(output)) {
      return output.replace(/<\/head>/i, `${headMarkup}\n</head>`);
    }
    return `${headMarkup}\n${output}`;
  }

  function buildSeoHeadMarkup(props = {}) {
    const lines = [];
    const seoMeta = props?.seoMeta || {};
    const basic = seoMeta.basic || {};
    const openGraph = seoMeta.openGraph || {};
    const twitter = seoMeta.twitter || {};
    const hreflangLinks = Array.isArray(props?.hreflangLinks) ? props.hreflangLinks : [];
    const faviconLinks = Array.isArray(props?.faviconLinks) ? props.faviconLinks : [];
    const themeColorMetas = Array.isArray(props?.themeColorMetas) ? props.themeColorMetas : [];

    appendMeta(lines, 'name', 'description', basic.description);
    appendMeta(lines, 'name', 'robots', basic.robots);
    appendLink(lines, { rel: 'canonical', href: basic.canonical });

    appendMeta(lines, 'property', 'og:title', openGraph.title);
    appendMeta(lines, 'property', 'og:site_name', openGraph.site_name);
    appendMeta(lines, 'property', 'og:locale', openGraph.locale);
    for (const locale of Array.isArray(openGraph.localeAlternates) ? openGraph.localeAlternates : []) {
      appendMeta(lines, 'property', 'og:locale:alternate', locale);
    }
    appendMeta(lines, 'property', 'og:description', openGraph.description);
    appendMeta(lines, 'property', 'og:url', openGraph.url);
    appendMeta(lines, 'property', 'og:type', openGraph.type);
    appendMeta(lines, 'property', 'og:image', openGraph.image);
    appendMeta(lines, 'property', 'og:image:secure_url', openGraph.imageSecureUrl);
    appendMeta(lines, 'property', 'og:image:width', openGraph.imageWidth);
    appendMeta(lines, 'property', 'og:image:height', openGraph.imageHeight);
    appendMeta(lines, 'property', 'og:image:alt', openGraph.imageAlt);
    appendMeta(lines, 'property', 'og:image:type', openGraph.imageType);

    appendMeta(lines, 'name', 'twitter:card', twitter.card);
    appendMeta(lines, 'name', 'twitter:site', twitter.site);
    appendMeta(lines, 'name', 'twitter:title', twitter.title);
    appendMeta(lines, 'name', 'twitter:description', twitter.description);
    appendMeta(lines, 'name', 'twitter:image', twitter.image);
    appendMeta(lines, 'name', 'twitter:image:alt', twitter.imageAlt);

    for (const item of hreflangLinks) {
      appendLink(lines, {
        rel: 'alternate',
        hreflang: item?.lang,
        href: item?.url
      });
    }

    for (const item of faviconLinks) {
      appendLink(lines, item);
    }
    for (const item of themeColorMetas) {
      appendTag(lines, 'meta', item);
    }

    if (props?.jsonLd && typeof props.jsonLd === 'object') {
      lines.push(`<script type="application/ld+json">${escapeHtml(JSON.stringify(props.jsonLd))}</script>`);
    }

    return lines.join('\n');
  }

  function appendMeta(lines, attrName, attrValue, content) {
    if (content === undefined || content === null || content === '') {
      return;
    }
    lines.push(`<meta ${attrName}="${escapeHtml(String(attrValue))}" content="${escapeHtml(String(content))}" />`);
  }

  function appendLink(lines, attributes = {}) {
    const rendered = renderAttributes(attributes);
    if (!rendered) {
      return;
    }
    lines.push(`<link ${rendered} />`);
  }

  function appendTag(lines, tagName, attributes = {}) {
    const rendered = renderAttributes(attributes);
    if (!rendered) {
      return;
    }
    lines.push(`<${tagName} ${rendered} />`);
  }

  function renderAttributes(attributes = {}) {
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => `${key}="${escapeHtml(String(value))}"`)
      .join(' ');
  }

  function injectStylesheetLinks(html, templateCode, styleTemplates) {
    const normalizedTemplateCode = sanitizeTemplateCode(templateCode);
    if (!normalizedTemplateCode) {
      return html;
    }

    registerPageTemplateStyleUsage(normalizedTemplateCode, styleTemplates || new Map());
    const linkHtml = `<!--cms-tsx-styles:${encodeRuntimePlaceholder({
      pageTemplateCode: normalizedTemplateCode
    })}-->`;

    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${linkHtml}\n</head>`);
    }
    return `${linkHtml}\n${html}`;
  }

  function injectGlobalInteractionScript(html) {
    const scriptHtml = `<script>${GLOBAL_INTERACTION_SCRIPT}</script>`;
    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${scriptHtml}\n</body>`);
    }
    return `${html}\n${scriptHtml}`;
  }
  function renderCmsTemplate(content, props, templateContext, options = {}) {
    const components = buildCmsComponentMap(templateContext);
    return renderCmsTemplateContent(content, props, templateContext, components, 0, options);
  }

  function renderCmsTemplateContent(content, props, templateContext, components, depth, options = {}) {
    const loopsExpanded = expandCmsLoops(content, props, templateContext, components, depth, options);
    const componentExpanded = expandCmsComponents(loopsExpanded, components, templateContext, props, depth, options);
    const rawExpanded = componentExpanded.replace(/\{\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}\}/g, (_, pathName) => {
      return stringifyTemplateValue(resolveTemplateValue(props, pathName));
    });
    const htmlEscaped = rawExpanded.replace(/\{\{\s*([A-Za-z0-9_.-]+)\s*\}\}/g, (_, pathName) => {
      return escapeHtml(stringifyTemplateValue(resolveTemplateValue(props, pathName)));
    });
    return expandLegacyCommonPlaceholders(htmlEscaped, templateContext);
  }

  function buildCmsComponentMap(templateContext) {
    const components = new Map();

    for (const item of listSelectedThemePublishedComponents()) {
      components.set(String(item.code || '').toLowerCase(), {
        code: item.code || '',
        engine: item.engine || 'tsx',
        tsx_source: item.tsx_source || '',
        css_source: item.css_source || '',
        global_css_source: item.global_css_source || ''
      });
    }

    return components;
  }

  function expandCmsComponents(content, components, templateContext, props, depth, options = {}) {
    let html = String(content || '');
    for (let pass = 0; pass < 10; pass += 1) {
      let changed = false;
      html = html.replace(/#component\(\s*["']([A-Za-z0-9_-]+)["']\s*\)#/g, (_, code) => {
        changed = true;
        return renderCmsComponentMarkup(code, components, templateContext, props, depth + 1, options);
      });
      if (!changed) {
        break;
      }
    }
    return html;
  }

  function renderCmsComponentElement(code, components, templateContext, props, depth, options = {}, helpers) {
    if (depth > 10) {
      return null;
    }
    const component = components.get(String(code || '').toLowerCase());
    if (!component?.tsx_source) {
      return null;
    }

    if (component.engine === 'tsx') {
      registerTsxTemplateAssets(component, {
        styleTemplates: options.styleTemplates
      });
      return createTsxTemplateElement(component.tsx_source, props, {
        templateCode: component.code,
        componentResolver: ({ code: nestedCode, props: nestedProps, helpers: nestedHelpers }) => {
          return renderCmsComponentElement(
            nestedCode,
            components,
            templateContext,
            mergeComponentProps(props, nestedProps),
            depth + 1,
            options,
            nestedHelpers
          );
        }
      }, helpers?.runtimeContext);
    }

    const html = renderCmsTemplateContent(component.tsx_source, props, templateContext, components, depth + 1, options);
    return helpers?.renderHtml ? helpers.renderHtml(html) : html;
  }

  function renderCmsComponentMarkup(code, components, templateContext, props, depth, options = {}) {
    if (depth > 10) {
      return '';
    }
    const component = components.get(String(code || '').toLowerCase());
    if (!component?.tsx_source) {
      return '';
    }

    if (component.engine === 'tsx') {
      registerTsxTemplateAssets(component, {
        styleTemplates: options.styleTemplates
      });
      return expandLegacyCommonPlaceholders(renderTsxTemplate(component.tsx_source, props, {
        templateCode: component.code,
        componentResolver: ({ code: nestedCode, props: nestedProps, helpers }) => {
          return renderCmsComponentElement(
            nestedCode,
            components,
            templateContext,
            mergeComponentProps(props, nestedProps),
            depth + 1,
            options,
            helpers
          );
        }
      }), templateContext);
    }

    return renderCmsTemplateContent(component.tsx_source, props, templateContext, components, depth + 1, options);
  }

  function expandCmsLoops(content, props, templateContext, components, depth, options = {}) {
    return String(content || '').replace(/#loop\(([A-Za-z0-9_.-]+)\)#([\s\S]*?)#\/loop#/g, (_, pathName, rowTemplate) => {
      const items = resolveTemplateValue(props, pathName);
      if (!Array.isArray(items)) {
        return '';
      }
      return items.map((item) => {
        const rowProps = { ...props, item };
        return renderCmsTemplateContent(rowTemplate, rowProps, templateContext, components, depth + 1, options);
      }).join('');
    });
  }

  function cleanupTemplateClientBundles(outputRoot) {
    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  }

  function buildRegisteredTsxAssets(outputRoot) {
    buildRegisteredTsxStyleAssets(outputRoot);
  }

  function buildRegisteredTsxStyleAssets(outputRoot) {
    const globalStyleTemplates = buildPublishedGlobalStyleAssets();
    if (registeredStyleTemplates.size === 0 && globalStyleTemplates.size === 0 && pageTemplateStyleUsage.size === 0) {
      return;
    }

    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    fs.mkdirSync(dirPath, { recursive: true });

    const bundlePlan = buildStyleBundlePlan({
      pageTemplateStyleUsage,
      registeredStyleTemplates,
      globalStyleTemplates
    });

    try {
      writeBundledStyleAssets(dirPath, bundlePlan);
      replaceStyleRuntimePlaceholders(outputRoot, bundlePlan, templateClientAssetDir);
    } finally {
      registeredStyleTemplates.clear();
      pageTemplateStyleUsage.clear();
    }
  }

  function registerPageTemplateStyleUsage(templateCode, styleTemplates) {
    if (!pageTemplateStyleUsage.has(templateCode)) {
      pageTemplateStyleUsage.set(templateCode, new Set());
    }
    const usage = pageTemplateStyleUsage.get(templateCode);
    for (const code of styleTemplates.keys()) {
      const normalizedCode = sanitizeTemplateCode(code);
      if (normalizedCode) {
        usage.add(normalizedCode);
      }
    }
  }

  return {
    renderCmsSitePage,
    cleanupTemplateClientBundles,
    buildRegisteredTsxAssets
  };
}

function resolveTemplateValue(source, pathName) {
  const parts = String(pathName || '').split('.').filter(Boolean);
  let current = source;
  for (const part of parts) {
    if (current == null) {
      return '';
    }
    current = current[part];
  }
  return current ?? '';
}

const GLOBAL_INTERACTION_SCRIPT = String.raw`(() => {
  if (typeof document === 'undefined') {
    return;
  }

  const FOCUSABLE_SELECTOR = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function bindMediaQuery(mediaQuery, handler) {
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return;
    }
    mediaQuery.addListener(handler);
  }

  function initSiteNav(root) {
    if (!(root instanceof HTMLElement) || root.dataset.navReady === 'true') {
      return;
    }

    root.dataset.navReady = 'true';

    const header = root.querySelector('.sg-global-nav');
    const toggle = root.querySelector('[data-nav-toggle]');
    const backdrop = root.querySelector('[data-nav-backdrop]');
    const panel = root.querySelector('[data-nav-panel]');
    const groups = Array.from(root.querySelectorAll('[data-nav-group]'));
    const mobileQuery = window.matchMedia('(max-width: 940px)');
    const hoverQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    function syncNavOffset() {
      if (!(header instanceof HTMLElement)) {
        return;
      }
      const headerHeight = Math.ceil(header.getBoundingClientRect().height);
      root.style.setProperty('--sg-mobile-nav-offset', String(headerHeight) + 'px');
    }

    function setPanelOpen(open) {
      const wasOpen = root.classList.contains('is-panel-open');
      root.classList.toggle('is-panel-open', open);
      document.body.style.overflow = mobileQuery.matches && open ? 'hidden' : '';

      if (toggle instanceof HTMLButtonElement) {
        toggle.setAttribute('aria-expanded', String(open));
        toggle.classList.toggle('sg-nav-hamburger--active', open);
      }

      if (panel instanceof HTMLElement) {
        panel.setAttribute('aria-hidden', String(mobileQuery.matches ? !open : false));
      }

      if (backdrop instanceof HTMLElement) {
        backdrop.setAttribute('aria-hidden', String(!open));
      }

      if (mobileQuery.matches && open && panel instanceof HTMLElement) {
        window.requestAnimationFrame(() => {
          const firstFocusable = panel.querySelector(FOCUSABLE_SELECTOR);
          if (firstFocusable instanceof HTMLElement) {
            firstFocusable.focus();
          }
        });
      }

      if (mobileQuery.matches && !open && wasOpen && toggle instanceof HTMLButtonElement) {
        window.requestAnimationFrame(() => toggle.focus());
      }
    }

    function setGroupOpen(group, open) {
      if (!(group instanceof HTMLElement)) {
        return;
      }
      group.dataset.open = String(open);
      group.classList.toggle('is-dismissed', false);

      const groupToggle = group.querySelector('[data-nav-group-toggle]');
      if (groupToggle instanceof HTMLButtonElement) {
        groupToggle.setAttribute('aria-expanded', String(open));
      }
    }

    function closeOtherGroups(activeGroup) {
      groups.forEach((group) => {
        if (!(group instanceof HTMLElement) || group === activeGroup) {
          return;
        }
        setGroupOpen(group, false);
      });
    }

    function resetNavState() {
      setPanelOpen(false);
      groups.forEach((group) => {
        if (!(group instanceof HTMLElement)) {
          return;
        }
        group.classList.remove('is-dismissed');
        setGroupOpen(group, false);
      });
    }

    if (toggle instanceof HTMLButtonElement && panel instanceof HTMLElement) {
      toggle.addEventListener('click', () => {
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        setPanelOpen(!expanded);
      });
    }

    if (backdrop instanceof HTMLElement) {
      backdrop.addEventListener('click', () => {
        if (!mobileQuery.matches) {
          return;
        }
        setPanelOpen(false);
      });
    }

    if (panel instanceof HTMLElement) {
      panel.addEventListener('click', (event) => {
        if (!mobileQuery.matches) {
          return;
        }
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('a[href]')) {
          return;
        }
        setPanelOpen(false);
      });
    }

    groups.forEach((group) => {
      if (!(group instanceof HTMLElement)) {
        return;
      }

      const groupToggle = group.querySelector('[data-nav-group-toggle]');
      if (!(groupToggle instanceof HTMLButtonElement)) {
        return;
      }

      setGroupOpen(group, false);

      groupToggle.addEventListener('click', () => {
        const expanded = groupToggle.getAttribute('aria-expanded') === 'true';
        if (mobileQuery.matches || !hoverQuery.matches) {
          closeOtherGroups(group);
          setGroupOpen(group, !expanded);
        }
      });

      group.addEventListener('focusin', () => {
        if (mobileQuery.matches) {
          return;
        }
        closeOtherGroups(group);
        setGroupOpen(group, true);
      });

      group.addEventListener('focusout', (event) => {
        if (mobileQuery.matches) {
          return;
        }
        const nextTarget = event.relatedTarget;
        if (nextTarget instanceof Node && group.contains(nextTarget)) {
          return;
        }
        setGroupOpen(group, false);
      });

      group.addEventListener('pointerenter', (event) => {
        if (mobileQuery.matches || event.pointerType === 'touch') {
          return;
        }
        closeOtherGroups(group);
        setGroupOpen(group, true);
      });

      group.addEventListener('pointerleave', (event) => {
        if (mobileQuery.matches || event.pointerType === 'touch') {
          return;
        }
        setGroupOpen(group, false);
      });
    });

    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') {
        return;
      }
      resetNavState();
    });

    bindMediaQuery(mobileQuery, resetNavState);
    bindMediaQuery(hoverQuery, resetNavState);
    window.addEventListener('resize', syncNavOffset, { passive: true });

    syncNavOffset();
    resetNavState();
  }

  function initFooterSection(section) {
    if (!(section instanceof HTMLElement) || section.dataset.footerReady === 'true') {
      return;
    }

    section.dataset.footerReady = 'true';
    const toggle = section.querySelector('[data-footer-toggle]');
    const mobileQuery = window.matchMedia('(max-width: 1050px)');

    function setSectionOpen(open) {
      section.classList.toggle('is-open', open);
      if (toggle instanceof HTMLButtonElement) {
        toggle.setAttribute('aria-expanded', String(open));
      }
    }

    function resetFooterState() {
      setSectionOpen(false);
    }

    if (toggle instanceof HTMLButtonElement) {
      toggle.addEventListener('click', () => {
        if (!mobileQuery.matches) {
          return;
        }
        const expanded = toggle.getAttribute('aria-expanded') === 'true';
        setSectionOpen(!expanded);
      });
    }

    bindMediaQuery(mobileQuery, resetFooterState);
    resetFooterState();
  }

  function escapeText(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  (function initGlobalSearch() {
    const root = document.querySelector('[data-global-search]');
    const input = root?.querySelector('[data-global-search-input]');
    const clearButton = root?.querySelector('[data-global-search-clear]');
    const state = root?.querySelector('[data-global-search-state]');
    const resultsContainer = root?.querySelector('[data-global-search-results]');
    const closeButtons = Array.from(root?.querySelectorAll('[data-global-search-close]') ?? []);
    const messages = JSON.parse(root?.getAttribute('data-search-messages') || '{}');
    const searchApiUrl = root?.getAttribute('data-search-api-url') || '/api/search';
    let searchTimer = 0;
    let activeQuery = '';

    function applyQuery(query) {
      const normalizedQuery = String(query || '').trim();
      activeQuery = normalizedQuery;

      if (input instanceof HTMLInputElement) {
        input.value = normalizedQuery;
      }

      if (clearButton instanceof HTMLButtonElement) {
        clearButton.hidden = normalizedQuery.length === 0;
      }

      window.clearTimeout(searchTimer);

      if (!normalizedQuery) {
        setIdle();
        return;
      }

      runSearch(normalizedQuery);
    }

    function setOpen(open) {
      if (!(root instanceof HTMLElement)) {
        return;
      }

      root.hidden = !open;
      root.classList.toggle('is-open', open);
      document.body.classList.toggle('sg-search-open', open);

      if (!open) {
        return;
      }

      window.requestAnimationFrame(() => {
        if (input instanceof HTMLInputElement) {
          input.focus();
        }
      });
    }

    function setState(title, body) {
      if (!(state instanceof HTMLElement)) {
        return;
      }

      state.hidden = false;
      state.innerHTML = body
        ? '<h2>' + escapeText(title) + '</h2><p>' + escapeText(body) + '</p>'
        : '<h2>' + escapeText(title) + '</h2>';
    }

    function setLoading() {
      setState(messages.loadingLabel, '');
    }

    function hideState() {
      if (state instanceof HTMLElement) {
        state.hidden = true;
        state.innerHTML = '';
      }
    }

    function clearResults() {
      if (resultsContainer instanceof HTMLElement) {
        resultsContainer.hidden = true;
        resultsContainer.innerHTML = '';
      }
    }

    function setIdle() {
      clearResults();
      hideState();
    }

    function setUnavailable() {
      clearResults();
      setState(messages.unavailableTitle, messages.unavailableBody);
    }

    function formatPath(url) {
      return url.replace(/^https?:\/\/[^/]+/i, '').replace(/\/$/, '') || '/';
    }

    function renderResults(items) {
      if (!(resultsContainer instanceof HTMLElement)) {
        return;
      }

      resultsContainer.innerHTML = '';

      if (!items.length) {
        resultsContainer.hidden = true;
        setState(messages.emptyTitle, messages.emptyBody);
        return;
      }

      if (state instanceof HTMLElement) {
        state.hidden = true;
      }

      const fragment = document.createDocumentFragment();

      items.forEach((item) => {
        const link = document.createElement('a');
        const title = document.createElement('h3');
        const meta = document.createElement('p');
        const excerpt = document.createElement('p');

        link.className = 'sg-global-search__result';
        link.href = item.url;

        meta.className = 'sg-global-search__result-path';
        meta.textContent = formatPath(item.url);

        title.className = 'sg-global-search__result-title';
        title.textContent = item.title;

        excerpt.className = 'sg-global-search__result-excerpt';
        excerpt.textContent = item.excerpt;

        link.append(meta, title, excerpt);
        link.addEventListener('click', () => setOpen(false));
        fragment.append(link);
      });

      resultsContainer.append(fragment);
      resultsContainer.hidden = false;
    }

    async function runSearch(query) {
      if (query !== activeQuery) {
        return;
      }

      if (!query) {
        setIdle();
        return;
      }

      try {
        setLoading();

        const response = await fetch(searchApiUrl + '?q=' + encodeURIComponent(query) + '&page=1&pageSize=12', {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error('Search request failed with status ' + response.status);
        }

        const payload = await response.json();
        const items = Array.isArray(payload?.items)
          ? payload.items.map((item) => ({
            excerpt: String(item?.excerpt || item?.summary || '').trim() || formatPath(item?.url || ''),
            title: String(item?.title || '').trim() || formatPath(item?.url || ''),
            url: String(item?.url || '').trim() || '/',
          }))
          : [];

        if (query !== activeQuery) {
          return;
        }

        renderResults(items);
      } catch (error) {
        console.error('Global search is unavailable.', error);

        if (query === activeQuery) {
          setUnavailable();
        }
      }
    }

    function scheduleSearch() {
      if (!(input instanceof HTMLInputElement)) {
        return;
      }

      activeQuery = input.value.trim();

      if (clearButton instanceof HTMLButtonElement) {
        clearButton.hidden = activeQuery.length === 0;
      }

      window.clearTimeout(searchTimer);

      if (!activeQuery) {
        setIdle();
        return;
      }

      searchTimer = window.setTimeout(() => {
        runSearch(activeQuery);
      }, 180);
    }

    document.addEventListener('click', (event) => {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const trigger = target.closest('[data-search-open]');
      if (!(trigger instanceof HTMLElement)) {
        return;
      }

      event.preventDefault();
      setOpen(true);
    });

    document.addEventListener('submit', (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.dataset.searchOpenForm !== 'true') {
        return;
      }

      event.preventDefault();
      const source = form.querySelector('input[name="ProductsName"], input[name="q"], input[name="keyword"], textarea[name="q"], textarea[name="keyword"]');
      const query = source instanceof HTMLInputElement || source instanceof HTMLTextAreaElement
        ? source.value
        : '';

      setOpen(true);
      applyQuery(query);
    });

    closeButtons.forEach((button) => {
      button.addEventListener('click', () => setOpen(false));
    });

    if (clearButton instanceof HTMLButtonElement && input instanceof HTMLInputElement) {
      clearButton.addEventListener('click', () => {
        input.value = '';
        activeQuery = '';
        clearButton.hidden = true;
        setIdle();
        input.focus();
      });
    }

    if (input instanceof HTMLInputElement) {
      input.addEventListener('input', scheduleSearch);
    }

    setIdle();
  })();

  document.querySelectorAll('[data-site-nav]').forEach(initSiteNav);
  document.querySelectorAll('[data-footer-section]').forEach(initFooterSection);
})();`;

function stringifyTemplateValue(value) {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function mergeComponentProps(baseProps, extraProps) {
  const { children: _children, slots: _slots, ...restBaseProps } = baseProps || {};
  return {
    ...restBaseProps,
    ...(extraProps || {})
  };
}

function sanitizeTemplateCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function encodeRuntimePlaceholder(payload) {
  return encodeURIComponent(JSON.stringify(payload || {}));
}

function decodeRuntimePlaceholder(serialized) {
  try {
    return JSON.parse(decodeURIComponent(String(serialized || '')));
  } catch {
    return null;
  }
}

function buildStyleBundlePlan({ pageTemplateStyleUsage, registeredStyleTemplates, globalStyleTemplates }) {
  const sharedBundle = buildBundleStyleAssets(
    'shared',
    Array.from(globalStyleTemplates.keys()).sort(),
    globalStyleTemplates
  );

  const pageBundles = new Map();
  for (const [pageTemplateCode, styleCodes] of pageTemplateStyleUsage.entries()) {
    const bundle = buildBundleStyleAssets(
      `page-${pageTemplateCode}`,
      Array.from(styleCodes.values()),
      registeredStyleTemplates
    );
    if (bundle) {
      pageBundles.set(pageTemplateCode, bundle);
    }
  }

  return {
    sharedBundle,
    pageBundles
  };
}

function buildBundleStyleAssets(bundleCode, styleCodes, registeredStyleTemplates) {
  const assets = styleCodes
    .map((code) => registeredStyleTemplates.get(code))
    .filter(Boolean)
    .map((asset) => ({
      code: asset.code,
      cssText: asset.cssText
    }));

  if (assets.length === 0) {
    return null;
  }

  return {
    code: sanitizeTemplateCode(bundleCode),
    assets
  };
}

function writeBundledStyleAssets(dirPath, bundlePlan) {
  const bundles = [];
  if (bundlePlan.sharedBundle) {
    bundles.push(bundlePlan.sharedBundle);
  }
  for (const bundle of bundlePlan.pageBundles.values()) {
    bundles.push(bundle);
  }

  for (const bundle of bundles) {
    const cssText = bundle.assets
      .map((asset) => String(asset.cssText || '').trim())
      .filter(Boolean)
      .join('\n\n');
    fs.writeFileSync(path.join(dirPath, `${bundle.code}.css`), cssText ? `${cssText}\n` : '', 'utf8');
  }
}

function replaceStyleRuntimePlaceholders(outputRoot, bundlePlan, templateClientAssetDir) {
  for (const filePath of listHtmlFiles(outputRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const next = source.replace(/<!--cms-tsx-styles:([\s\S]*?)-->/g, (_, encodedPayload) => {
      const payload = decodeRuntimePlaceholder(encodedPayload);
      if (!payload?.pageTemplateCode) {
        return '';
      }

      const runtimeParts = [];
      const pageBundle = bundlePlan.pageBundles.get(payload.pageTemplateCode) || null;
      if (bundlePlan.sharedBundle) {
        runtimeParts.push(`<link rel="stylesheet" href="/${templateClientAssetDir}/${bundlePlan.sharedBundle.code}.css">`);
      }
      if (pageBundle) {
        runtimeParts.push(`<link rel="stylesheet" href="/${templateClientAssetDir}/${pageBundle.code}.css">`);
      }

      return runtimeParts.join('\n');
    });

    if (next !== source) {
      fs.writeFileSync(filePath, next, 'utf8');
    }
  }
}

function buildPublishedGlobalStyleAssets() {
  const selectedTheme = getSelectedTemplateVariant();
  if (!selectedTheme?.id) {
    return new Map();
  }

  const assets = new Map();
  for (const template of listThemeVariantTemplates(selectedTheme.id, { publishedOnly: true })) {
    const asset = buildStandaloneStyleAsset(
      template.published_global_css_source ?? template.global_css_source ?? '',
      `${template.code}_global`
    );
    if (asset) {
      assets.set(asset.code, asset);
    }
  }
  return assets;
}

function buildStandaloneStyleAsset(styleSource, templateCode) {
  const normalizedStyleSource = String(styleSource || '').trim();
  if (!normalizedStyleSource) {
    return null;
  }
  return getTsxTemplateStyleAsset(buildStyleCarrierSource(normalizedStyleSource), {
    templateCode
  });
}

function buildStyleCarrierSource(styleSource) {
  return [
    `export const scss = String.raw\`${escapeTemplateLiteral(styleSource)}\`;`,
    '',
    'export default function TemplateStyleCarrier() {',
    '  return null;',
    '}',
    ''
  ].join('\n');
}

function escapeTemplateLiteral(value) {
  return String(value || '')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function listHtmlFiles(rootDir) {
  const files = [];
  walkHtmlFiles(path.resolve(rootDir), files);
  return files;
}

function walkHtmlFiles(currentPath, files) {
  if (!fs.existsSync(currentPath)) {
    return;
  }
  const stat = fs.statSync(currentPath);
  if (!stat.isDirectory()) {
    if (currentPath.toLowerCase().endsWith('.html')) {
      files.push(currentPath);
    }
    return;
  }

  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    walkHtmlFiles(path.join(currentPath, entry.name), files);
  }
}
