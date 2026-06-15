import fs from 'node:fs';
import path from 'node:path';
import { listSelectedThemePublishedComponents } from './services/template-variants.mjs';
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

    if (!template?.content) {
      throw new Error(`Published CMS template is missing: ${templateCode || pageName}`);
    }

    const styleTemplates = new Map();
    let html = '';

    if (template.engine === 'tsx') {
      registerTsxTemplateAssets(template, { styleTemplates });
      html = renderCmsTsxTemplate(template.content, props, templateContext, {
        styleTemplates,
        templateCode: template.code
      });
    } else {
      html = renderCmsTemplate(template.content, props, templateContext, {
        styleTemplates
      });
    }

    return injectPageAssets(html, {
      templateCode: template.code,
      styleTemplates
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
    const asset = getTsxTemplateStyleAsset(template.content, {
      templateCode: template.code
    });
    if (!asset) {
      return;
    }
    registeredStyleTemplates.set(asset.code, asset);
    if (styleTemplates) {
      styleTemplates.set(asset.code, asset);
    }
  }

  function injectPageAssets(html, { templateCode, styleTemplates }) {
    return injectStylesheetLinks(html, templateCode, styleTemplates);
  }

  function injectStylesheetLinks(html, templateCode, styleTemplates) {
    if (!styleTemplates || styleTemplates.size === 0) {
      return html;
    }

    const normalizedTemplateCode = sanitizeTemplateCode(templateCode);
    if (!normalizedTemplateCode) {
      return html;
    }

    registerPageTemplateStyleUsage(normalizedTemplateCode, styleTemplates);
    const linkHtml = `<!--cms-tsx-styles:${encodeRuntimePlaceholder({
      pageTemplateCode: normalizedTemplateCode,
      styleTemplateCodes: Array.from(styleTemplates.keys()).map((code) => sanitizeTemplateCode(code)).filter(Boolean)
    })}-->`;

    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${linkHtml}\n</head>`);
    }
    return `${linkHtml}\n${html}`;
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
        content: item.content || ''
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
    if (!component?.content) {
      return null;
    }

    if (component.engine === 'tsx') {
      registerTsxTemplateAssets(component, {
        styleTemplates: options.styleTemplates
      });
      return createTsxTemplateElement(component.content, props, {
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

    const html = renderCmsTemplateContent(component.content, props, templateContext, components, depth + 1, options);
    return helpers?.renderHtml ? helpers.renderHtml(html) : html;
  }

  function renderCmsComponentMarkup(code, components, templateContext, props, depth, options = {}) {
    if (depth > 10) {
      return '';
    }
    const component = components.get(String(code || '').toLowerCase());
    if (!component?.content) {
      return '';
    }

    if (component.engine === 'tsx') {
      registerTsxTemplateAssets(component, {
        styleTemplates: options.styleTemplates
      });
      return expandLegacyCommonPlaceholders(renderTsxTemplate(component.content, props, {
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

    return renderCmsTemplateContent(component.content, props, templateContext, components, depth + 1, options);
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
    if (registeredStyleTemplates.size === 0 || pageTemplateStyleUsage.size === 0) {
      return;
    }

    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    fs.mkdirSync(dirPath, { recursive: true });

    const bundlePlan = buildStyleBundlePlan({
      pageTemplateStyleUsage,
      registeredStyleTemplates
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

function buildStyleBundlePlan({ pageTemplateStyleUsage, registeredStyleTemplates }) {
  const usageCounts = new Map();

  for (const styleCodes of pageTemplateStyleUsage.values()) {
    for (const styleCode of styleCodes) {
      usageCounts.set(styleCode, (usageCounts.get(styleCode) || 0) + 1);
    }
  }

  const sharedStyleCodes = new Set(
    Array.from(usageCounts.entries())
      .filter(([, count]) => count > 2)
      .map(([code]) => code)
  );

  const sharedBundle = buildBundleStyleAssets(
    'shared',
    Array.from(sharedStyleCodes.values()),
    registeredStyleTemplates
  );

  const pageBundles = new Map();
  for (const [pageTemplateCode, styleCodes] of pageTemplateStyleUsage.entries()) {
    const pageSpecificCodes = Array.from(styleCodes.values()).filter((code) => !sharedStyleCodes.has(code));
    const bundle = buildBundleStyleAssets(
      `page-${pageTemplateCode}`,
      pageSpecificCodes,
      registeredStyleTemplates
    );
    if (bundle) {
      pageBundles.set(pageTemplateCode, bundle);
    }
  }

  return {
    sharedBundle,
    pageBundles,
    sharedStyleCodes
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
      const styleCodes = new Set(Array.isArray(payload.styleTemplateCodes) ? payload.styleTemplateCodes : []);
      const pageBundle = bundlePlan.pageBundles.get(payload.pageTemplateCode) || null;
      const usesSharedBundle = Array.from(styleCodes.values()).some((code) => bundlePlan.sharedStyleCodes.has(code));

      if (pageBundle) {
        runtimeParts.push(`<link rel="stylesheet" href="/${templateClientAssetDir}/${pageBundle.code}.css">`);
      }
      if (usesSharedBundle && bundlePlan.sharedBundle) {
        runtimeParts.push(`<link rel="stylesheet" href="/${templateClientAssetDir}/${bundlePlan.sharedBundle.code}.css">`);
      }

      return runtimeParts.join('\n');
    });

    if (next !== source) {
      fs.writeFileSync(filePath, next, 'utf8');
    }
  }
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
