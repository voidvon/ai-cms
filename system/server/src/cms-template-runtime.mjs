import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getSelectedTemplateVariant, listSelectedThemePublishedComponents, listThemeVariantTemplates } from './services/template-variants.mjs';
import { resolvePublishedTemplate } from './services/templates.mjs';
import { compileBrowserCompatibleCss, compileBrowserCompatibleJs } from './template-browser-compat.mjs';
import { createTsxTemplateElement, renderTsxTemplate } from './tsx-template-renderer.mjs';
import { getTsxTemplateStyleAsset } from './tsx-template-styles.mjs';
import { escapeHtml } from './utils/html.mjs';

export function createCmsTemplateRuntime({
  templateByPage = {},
  templateTypeByPage = {},
  templateClientAssetDir,
  expandLegacyCommonPlaceholders
}) {
  const registeredStyleTemplates = new Map();
  const renderGroupStyleUsage = new Map();
  const entryTemplateDependencyUsage = new Map();
  const registeredScriptAssets = new Map();
  let publishedTemplateMapCache = null;

  function renderCmsSitePage(pageName, props, templateContext, options = {}) {
    const templateCode = options.fallbackCode || templateByPage[pageName];
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

    const renderGroup = resolveRenderGroup(options.renderGroup, {
      pageName,
      entryTemplateCode: template.code,
      templateType
    });
    ensureRenderGroupStyleUsage(template, renderGroup);

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
      renderGroup,
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
    const asset = buildTemplateStyleAsset(template);
    if (!asset) {
      return null;
    }
    if (!registeredStyleTemplates.has(asset.code)) {
      registeredStyleTemplates.set(asset.code, asset);
    }
    const registeredAsset = registeredStyleTemplates.get(asset.code);
    if (styleTemplates) {
      styleTemplates.set(registeredAsset.code, registeredAsset);
    }
    return registeredAsset;
  }

  function injectPageAssets(html, { templateCode, renderGroup, props }) {
    const withHtmlLang = injectHtmlLangAttribute(html, props);
    const withSeoHead = injectSeoHead(withHtmlLang, props);
    const withStyles = injectStylesheetLinks(withSeoHead, templateCode, renderGroup);
    return injectInlineScriptAssetPlaceholders(withStyles);
  }

  function injectHtmlLangAttribute(html, props = {}) {
    const languageCode = String(
      props?.site?.requested_language_code
      || props?.site?.current_language_code
      || ''
    ).trim();
    if (!languageCode) {
      return html;
    }

    return String(html || '').replace(/<html\b([^>]*)>/i, (match, attrs = '') => {
      if (/\slang\s*=/i.test(attrs)) {
        return match.replace(/\slang\s*=\s*(['"])(.*?)\1/i, ` lang="${escapeHtml(languageCode)}"`);
      }
      return `<html lang="${escapeHtml(languageCode)}"${attrs}>`;
    });
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

    const jsonLd = serializeJsonLd(props?.jsonLd);
    if (jsonLd) {
      lines.push(`<script type="application/ld+json">${jsonLd}</script>`);
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

  function injectStylesheetLinks(html, templateCode, renderGroup) {
    const normalizedTemplateCode = sanitizeTemplateCode(templateCode);
    if (!normalizedTemplateCode) {
      return html;
    }

    const linkHtml = `<!--cms-tsx-styles:${encodeRuntimePlaceholder({
      pageTemplateCode: normalizedTemplateCode,
      renderGroupKey: renderGroup?.key || ''
    })}-->`;

    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${linkHtml}\n</head>`);
    }
    return `${linkHtml}\n${html}`;
  }

  function injectInlineScriptAssetPlaceholders(html) {
    return String(html || '').replace(
      /<script\b(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi,
      (match, rawAttrs = '', scriptContent = '') => {
        const attrs = parseScriptAttributes(rawAttrs);
        const scriptType = String(attrs.type || '').trim().toLowerCase();
        if (scriptType === 'application/ld+json') {
          return match;
        }

        const normalizedScriptContent = String(scriptContent || '').trim();
        if (!normalizedScriptContent) {
          return '';
        }

        return buildExternalScriptPlaceholder({
          scriptSource: normalizedScriptContent,
          assetCode: attrs['data-asset-code'] || '',
          attrs
        });
      }
    );
  }

  function buildExternalScriptPlaceholder({ scriptSource, assetCode = '', attrs = {} }) {
    const asset = registerScriptAsset(scriptSource, assetCode, attrs);
    return `<!--cms-tsx-script:${encodeRuntimePlaceholder({
      assetCode: asset.code,
      attrs: asset.attrs
    })}-->`;
  }

  function registerScriptAsset(scriptSource, assetCode = '', attrs = {}) {
    const normalizedScriptSource = String(scriptSource || '').trim();
    if (!normalizedScriptSource) {
      return null;
    }

    const normalizedCodeBase = sanitizeTemplateCode(assetCode) || `script_${createHash('sha256').update(normalizedScriptSource).digest('hex').slice(0, 12)}`;
    const contentHash = createHash('sha256').update(normalizedScriptSource).digest('hex').slice(0, 12);
    const code = `${normalizedCodeBase}_${contentHash}`;
    const normalizedAttrs = normalizeScriptAttributes(attrs);

    if (!registeredScriptAssets.has(code)) {
      registeredScriptAssets.set(code, {
        code,
        attrs: normalizedAttrs,
        jsText: normalizedScriptSource
      });
    }

    return registeredScriptAssets.get(code);
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
        css_source: item.css_source || ''
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
    buildRegisteredTsxScriptAssets(outputRoot);
  }

  function buildRegisteredTsxStyleAssets(outputRoot) {
    if (registeredStyleTemplates.size === 0 && renderGroupStyleUsage.size === 0) {
      return;
    }

    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    fs.mkdirSync(dirPath, { recursive: true });

    const bundlePlan = buildStyleBundlePlan({
      renderGroupStyleUsage,
      registeredStyleTemplates
    });

    try {
      writeBundledStyleAssets(dirPath, bundlePlan);
      replaceStyleRuntimePlaceholders(outputRoot, bundlePlan, templateClientAssetDir);
    } finally {
      registeredStyleTemplates.clear();
      renderGroupStyleUsage.clear();
      entryTemplateDependencyUsage.clear();
      publishedTemplateMapCache = null;
    }
  }

  function buildRegisteredTsxScriptAssets(outputRoot) {
    if (registeredScriptAssets.size === 0) {
      return;
    }

    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    fs.mkdirSync(dirPath, { recursive: true });

    try {
      writeScriptAssets(dirPath, registeredScriptAssets);
      replaceScriptRuntimePlaceholders(outputRoot, templateClientAssetDir, registeredScriptAssets);
    } finally {
      registeredScriptAssets.clear();
    }
  }

  function ensureRenderGroupStyleUsage(entryTemplate, renderGroup) {
    if (!renderGroup?.key || renderGroupStyleUsage.has(renderGroup.key)) {
      return;
    }

    const styleCodes = analyzeEntryTemplateStyleCodes(entryTemplate);
    renderGroupStyleUsage.set(renderGroup.key, {
      ...renderGroup,
      styleCodes: new Set(styleCodes)
    });
  }

  function analyzeEntryTemplateStyleCodes(entryTemplate) {
    const cacheKey = sanitizeTemplateCode(entryTemplate?.code);
    if (!cacheKey) {
      return [];
    }
    if (entryTemplateDependencyUsage.has(cacheKey)) {
      return entryTemplateDependencyUsage.get(cacheKey);
    }

    const templatesByCode = getPublishedTemplateMap();
    const styleCodes = new Set();
    const visited = new Set();

    const visitTemplate = (template) => {
      const normalizedTemplateCode = sanitizeTemplateCode(template?.code);
      if (!normalizedTemplateCode || visited.has(normalizedTemplateCode)) {
        return;
      }
      visited.add(normalizedTemplateCode);

      const asset = registerTemplateStyleAsset(template);
      if (asset?.code) {
        styleCodes.add(asset.code);
      }

      for (const componentCode of extractLiteralComponentReferences(template?.tsx_source || '')) {
        const component = templatesByCode.get(componentCode);
        if (component?.tsx_source) {
          visitTemplate(component);
        }
      }
    };

    visitTemplate(entryTemplate);

    const resolvedCodes = Array.from(styleCodes.values()).sort();
    entryTemplateDependencyUsage.set(cacheKey, resolvedCodes);
    return resolvedCodes;
  }

  function getPublishedTemplateMap() {
    if (publishedTemplateMapCache) {
      return publishedTemplateMapCache;
    }

    const selectedTheme = getSelectedTemplateVariant();
    const nextMap = new Map();
    if (selectedTheme?.id) {
      for (const item of listThemeVariantTemplates(selectedTheme.id, { publishedOnly: true })) {
        nextMap.set(sanitizeTemplateCode(item.code), {
          code: item.code || '',
          type: item.type || '',
          engine: item.engine || 'tsx',
          tsx_source: item.published_tsx_source ?? item.tsx_source ?? '',
          css_source: item.published_css_source ?? item.css_source ?? ''
        });
      }
    }

    publishedTemplateMapCache = nextMap;
    return publishedTemplateMapCache;
  }

  function resolveRenderGroup(input, context = {}) {
    const pageKind = sanitizeTemplateCode(input?.pageKind) || inferPageKind(context.pageName, context.templateType);
    const columnKind = sanitizeTemplateCode(input?.columnKind) || 'generic';
    const entryTemplateCode = sanitizeTemplateCode(context.entryTemplateCode);
    const familyKey = sanitizeTemplateCode(input?.familyKey) || sanitizeTemplateCode([pageKind, columnKind].filter(Boolean).join('-')) || pageKind || entryTemplateCode || 'default';
    const key = sanitizeTemplateCode(input?.key) || sanitizeTemplateCode([familyKey, entryTemplateCode].filter(Boolean).join('-')) || entryTemplateCode || pageKind || 'default';

    return {
      key,
      pageKind,
      columnKind,
      familyKey,
      entryTemplateCode
    };
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

function serializeJsonLd(value) {
  if (!value || typeof value !== 'object') {
    return '';
  }

  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function mergeComponentProps(baseProps, extraProps) {
  const componentContext = pickComponentContextProps(baseProps);
  return {
    ...componentContext,
    ...(extraProps || {})
  };
}

function pickComponentContextProps(source) {
  if (!source || typeof source !== 'object') {
    return {};
  }

  const keys = [
    'site',
    'siteColumns',
    'utilityColumns',
    'footerColumns',
    'footerMeta',
    'footerManagedColumnCategories',
    'columnTag',
    'fragments',
    'currentPage',
    'currentSection',
    'currentColumn',
    'currentColumnItem',
    'parentColumn',
    'currentContent',
    'currentManagedItem',
    'currentArticle',
    'currentColumnDescription',
    'currentColumnPageData',
    'currentColumnHeroImage',
    'currentManagedItemPageData',
    'sectionNavItems',
    'seoMeta',
    'jsonLd',
    'faviconLinks',
    'themeColorMetas',
    'hreflangLinks',
    'component',
    'raw',
    'Raw'
  ];

  const next = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      next[key] = source[key];
    }
  }
  return next;
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

function parseScriptAttributes(rawAttrs = '') {
  const attributes = {};
  const source = String(rawAttrs || '');
  const attrPattern = /([:@A-Za-z0-9_-]+)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match = null;
  while ((match = attrPattern.exec(source))) {
    const key = String(match[1] || '').trim();
    if (!key) {
      continue;
    }
    const value = match[3] ?? match[4] ?? match[5] ?? true;
    attributes[key] = value;
  }
  return attributes;
}

function normalizeScriptAttributes(attrs = {}) {
  const next = {};
  for (const [key, rawValue] of Object.entries(attrs || {})) {
    const normalizedKey = String(key || '').trim().toLowerCase();
    if (!normalizedKey || normalizedKey === 'src' || normalizedKey === 'data-asset-code') {
      continue;
    }
    if (normalizedKey === 'type' && String(rawValue || '').trim().toLowerCase() === 'text/javascript') {
      continue;
    }
    next[normalizedKey] = rawValue;
  }
  return next;
}

function renderScriptTagAttributes(attrs = {}) {
  return Object.entries(attrs)
    .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => (
      value === true
        ? key
        : `${key}="${escapeHtml(String(value))}"`
    ))
    .join(' ');
}

function decodeRuntimePlaceholder(serialized) {
  try {
    return JSON.parse(decodeURIComponent(String(serialized || '')));
  } catch {
    return null;
  }
}

function buildStyleBundlePlan({ renderGroupStyleUsage, registeredStyleTemplates }) {
  const styleUsageStats = buildStyleUsageStats(renderGroupStyleUsage);
  const styleAssignments = assignStyleBundles(styleUsageStats);
  const bundles = buildStyleBundlesFromAssignments(styleAssignments, registeredStyleTemplates);
  const renderGroupBundles = new Map();

  for (const [renderGroupKey, usage] of renderGroupStyleUsage.entries()) {
    const orderedBundleCodes = [];
    const pushBundleCode = (bundleCode) => {
      const normalizedCode = sanitizeTemplateCode(bundleCode);
      if (!normalizedCode || orderedBundleCodes.includes(normalizedCode) || !bundles.has(normalizedCode)) {
        return;
      }
      orderedBundleCodes.push(normalizedCode);
    };

    for (const styleCode of usage.styleCodes.values()) {
      const assignment = styleAssignments.get(styleCode);
      if (!assignment) {
        continue;
      }
      pushBundleCode(assignment.bundleCode);
    }

    renderGroupBundles.set(renderGroupKey, orderedBundleCodes);
  }

  return {
    bundles,
    renderGroupBundles
  };
}

function buildBundleStyleAssets(bundleCode, styleCodes, registeredStyleTemplates) {
  const assets = styleCodes
    .map((code) => registeredStyleTemplates.get(code))
    .filter(Boolean)
    .map((asset) => ({
      code: asset.code,
      cssText: minifyStyleAssetCss(asset.cssText, bundleCode, asset.code)
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
  for (const bundle of bundlePlan.bundles.values()) {
    const cssText = bundle.assets
      .map((asset) => String(asset.cssText || '').trim())
      .filter(Boolean)
      .join('');
    fs.writeFileSync(path.join(dirPath, `${bundle.code}.css`), cssText, 'utf8');
  }
}

function writeScriptAssets(dirPath, scriptAssets) {
  for (const asset of scriptAssets.values()) {
    const outputText = minifyScriptAssetJs(asset.jsText, asset.code);
    fs.writeFileSync(path.join(dirPath, `${asset.code}.js`), outputText, 'utf8');
  }
}

function minifyStyleAssetCss(cssText, bundleCode, assetCode) {
  const normalizedCssText = String(cssText || '').trim();
  if (!normalizedCssText) {
    return '';
  }

  try {
    return compileBrowserCompatibleCss(normalizedCssText, {
      filename: `${sanitizeTemplateCode(bundleCode) || 'bundle'}-${sanitizeTemplateCode(assetCode) || 'asset'}.css`,
      minify: true
    });
  } catch (error) {
    console.warn(
      `[cms-template-runtime] Failed to minify CSS asset "${assetCode}" in bundle "${bundleCode}", using original CSS:`,
      error.message || error
    );
    return normalizedCssText;
  }
}

function minifyScriptAssetJs(jsText, assetCode) {
  const normalizedJsText = String(jsText || '').trim();
  if (!normalizedJsText) {
    return '';
  }

  try {
    return compileBrowserCompatibleJs(normalizedJsText, {
      minify: true
    });
  } catch (error) {
    console.warn(
      `[cms-template-runtime] Failed to minify JS asset "${assetCode}", using original JS:`,
      error.message || error
    );
    return normalizedJsText;
  }
}

function replaceStyleRuntimePlaceholders(outputRoot, bundlePlan, templateClientAssetDir) {
  for (const filePath of listHtmlFiles(outputRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const next = source.replace(/<!--cms-tsx-styles:([\s\S]*?)-->/g, (_, encodedPayload) => {
      const payload = decodeRuntimePlaceholder(encodedPayload);
      if (!payload?.renderGroupKey) {
        return '';
      }

      const bundleCodes = bundlePlan.renderGroupBundles.get(payload.renderGroupKey) || [];
      const runtimeParts = bundleCodes.map((bundleCode) => `<link rel="stylesheet" href="/${templateClientAssetDir}/${bundleCode}.css">`);

      return runtimeParts.join('\n');
    });

    if (next !== source) {
      fs.writeFileSync(filePath, next, 'utf8');
    }
  }
}

function replaceScriptRuntimePlaceholders(outputRoot, templateClientAssetDir, scriptAssets) {
  for (const filePath of listHtmlFiles(outputRoot)) {
    const source = fs.readFileSync(filePath, 'utf8');
    const next = source.replace(/<!--cms-tsx-script:([\s\S]*?)-->/g, (_, encodedPayload) => {
      const payload = decodeRuntimePlaceholder(encodedPayload);
      const assetCode = sanitizeTemplateCode(payload?.assetCode);
      if (!assetCode || !scriptAssets.has(assetCode)) {
        return '';
      }

      const asset = scriptAssets.get(assetCode);
      const attrs = renderScriptTagAttributes({
        ...asset.attrs,
        src: `/${templateClientAssetDir}/${asset.code}.js`
      });
      return attrs ? `<script ${attrs}></script>` : `<script src="/${templateClientAssetDir}/${asset.code}.js"></script>`;
    });

    if (next !== source) {
      fs.writeFileSync(filePath, next, 'utf8');
    }
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

function buildTemplateStyleAsset(template) {
  if (!template) {
    return null;
  }
  const styleSource = String(template?.css_source || '').trim();
  if (!styleSource) {
    return null;
  }
  return buildStandaloneStyleAsset(styleSource, template.code);
}

function inferPageKind(pageName, templateType) {
  const normalizedPageName = String(pageName || '').trim().toLowerCase();
  if (normalizedPageName.includes('home')) {
    return 'home';
  }
  if (normalizedPageName.includes('list')) {
    return 'list';
  }
  if (normalizedPageName.includes('detail')) {
    return 'detail';
  }
  if (String(templateType || '').trim().toLowerCase() === 'single') {
    return 'single-page';
  }
  return sanitizeTemplateCode(templateType) || 'generic';
}

function buildStyleUsageStats(renderGroupStyleUsage) {
  const stats = new Map();
  const allRenderGroups = Array.from(renderGroupStyleUsage.values());
  const totalRenderGroupCount = allRenderGroups.length;

  for (const usage of allRenderGroups) {
    for (const styleCode of usage.styleCodes.values()) {
      if (!stats.has(styleCode)) {
        stats.set(styleCode, {
          styleCode,
          totalRenderGroupCount: 0,
          renderGroupKeys: new Set(),
          entryTemplateCodes: new Set(),
          familyKeys: new Set()
        });
      }

      const item = stats.get(styleCode);
      item.renderGroupKeys.add(usage.key);
      item.totalRenderGroupCount += 1;
      if (usage.entryTemplateCode) {
        item.entryTemplateCodes.add(usage.entryTemplateCode);
      }
      if (usage.familyKey) {
        item.familyKeys.add(usage.familyKey);
      }
    }
  }

  for (const item of stats.values()) {
    item.allRenderGroupCount = totalRenderGroupCount;
  }

  return stats;
}

function assignStyleBundles(styleUsageStats) {
  const assignments = new Map();

  for (const stat of styleUsageStats.values()) {
    const renderGroupCount = stat.renderGroupKeys.size;
    const totalRenderGroupCount = stat.allRenderGroupCount || 0;
    const entryTemplateCount = stat.entryTemplateCodes.size;
    const familyCount = stat.familyKeys.size;

    let layer = 'group-only';
    let bundleCode = `group-${Array.from(stat.renderGroupKeys.values()).sort()[0] || 'default'}`;

    if (totalRenderGroupCount > 0 && renderGroupCount === totalRenderGroupCount) {
      layer = 'site-shared';
      bundleCode = 'site-shared';
    } else if (entryTemplateCount === 1 && renderGroupCount >= 2) {
      layer = 'template-shared';
      bundleCode = `template-${Array.from(stat.entryTemplateCodes.values())[0]}`;
    } else if (familyCount === 1 && renderGroupCount >= 2) {
      layer = 'family-shared';
      bundleCode = `family-${Array.from(stat.familyKeys.values())[0]}`;
    }

    assignments.set(stat.styleCode, {
      styleCode: stat.styleCode,
      layer,
      bundleCode: sanitizeTemplateCode(bundleCode)
    });
  }

  return assignments;
}

function buildStyleBundlesFromAssignments(styleAssignments, registeredStyleTemplates) {
  const bundleStyles = new Map();

  for (const assignment of styleAssignments.values()) {
    if (!bundleStyles.has(assignment.bundleCode)) {
      bundleStyles.set(assignment.bundleCode, []);
    }
    bundleStyles.get(assignment.bundleCode).push(assignment.styleCode);
  }

  const bundles = new Map();
  for (const [bundleCode, styleCodes] of bundleStyles.entries()) {
    const bundle = buildBundleStyleAssets(bundleCode, styleCodes.sort(), registeredStyleTemplates);
    if (bundle) {
      bundles.set(bundle.code, bundle);
    }
  }

  return bundles;
}

function extractLiteralComponentReferences(content) {
  const refs = new Set();
  const source = String(content || '');
  const patterns = [
    /#component\(\s*["']([A-Za-z0-9_-]+)["']\s*\)#/g,
    /\bcomponent\(\s*["']([A-Za-z0-9_-]+)["']/g
  ];

  for (const pattern of patterns) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      const normalizedCode = sanitizeTemplateCode(match[1]);
      if (normalizedCode) {
        refs.add(normalizedCode);
      }
    }
  }

  return Array.from(refs.values());
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
