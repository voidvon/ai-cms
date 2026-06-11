import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SERVER_ROOT } from './config.mjs';
import { listSelectedThemePublishedComponents, resolveSelectedThemeTemplateCode } from './services/template-variants.mjs';
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
  const registeredClientTemplates = new Map();
  const registeredStyleTemplates = new Map();

  function renderCmsSitePage(pageName, props, templateContext, options = {}) {
    const templateCode = templateByPage[pageName];
    const templateType = options.templateType || templateTypeByPage[pageName];
    const themeTemplateCode = options.themeSlot ? resolveSelectedThemeTemplateCode(options.themeSlot) : null;
    const template = templateCode && templateType ? resolvePublishedTemplate({
      templateType,
      targets: options.targets || [],
      fallbackCode: templateCode,
      fallbackCodes: themeTemplateCode ? [themeTemplateCode] : []
    }) : null;

    if (!template?.content) {
      throw new Error(`Published CMS template is missing: ${templateCode || pageName}`);
    }

    const clientTemplates = new Map();
    const styleTemplates = new Map();
    let html = '';

    if (template.engine === 'tsx') {
      registerTsxTemplateAssets(template, { clientTemplates, styleTemplates });
      html = renderCmsTsxTemplate(template.content, props, templateContext, {
        clientTemplates,
        styleTemplates,
        templateCode: template.code
      });
    } else {
      html = renderCmsTemplate(template.content, props, templateContext, {
        clientTemplates,
        styleTemplates
      });
    }

    return injectPageAssets(html, { clientTemplates, styleTemplates, props });
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
    registerTsxClientTemplate(template, registries.clientTemplates);
    registerTemplateStyleAsset(template, registries.styleTemplates);
  }

  function registerTsxClientTemplate(template, clientTemplates = null) {
    if (!hasTsxClientRuntime(template.content)) {
      return;
    }
    const code = sanitizeTemplateCode(template.code);
    if (!code) {
      return;
    }
    const runtimeTemplate = {
      code,
      source: template.content || '',
      needsProps: templateClientNeedsProps(template.content)
    };
    registeredClientTemplates.set(code, {
      kind: 'tsx-client',
      ...runtimeTemplate
    });
    if (clientTemplates) {
      clientTemplates.set(code, {
        kind: 'tsx-client',
        ...runtimeTemplate
      });
    }
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

  function injectPageAssets(html, { clientTemplates, styleTemplates, props }) {
    let nextHtml = injectStylesheetLinks(html, styleTemplates);
    nextHtml = injectClientRuntimes(nextHtml, clientTemplates, props);
    return nextHtml;
  }

  function injectStylesheetLinks(html, styleTemplates) {
    if (!styleTemplates || styleTemplates.size === 0) {
      return html;
    }
    const linkHtml = Array.from(styleTemplates.values())
      .map((asset) => `<link rel="stylesheet" href="/${templateClientAssetDir}/${asset.code}.css">`)
      .join('\n');

    if (/<\/head>/i.test(html)) {
      return html.replace(/<\/head>/i, `${linkHtml}\n</head>`);
    }
    return `${linkHtml}\n${html}`;
  }

  function injectClientRuntimes(html, clientTemplates, props) {
    if (!clientTemplates || clientTemplates.size === 0) {
      return html;
    }
    const runtimeParts = [];
    for (const template of clientTemplates.values()) {
      const code = sanitizeTemplateCode(template.code);
      if (!code) {
        continue;
      }
      if (template.kind === 'tsx-client' && hasImperativeTsxClientRuntime(template.source) && template.needsProps !== false) {
        runtimeParts.push(`<script type="application/json" id="cms-tsx-props-${code}">${safeJsonForScript(props)}</script>`);
      }
      runtimeParts.push(`<script type="module" src="/${templateClientAssetDir}/${code}.js"></script>`);
    }
    if (runtimeParts.length === 0) {
      return html;
    }
    const runtimeHtml = runtimeParts.join('\n');

    if (/<\/body>/i.test(html)) {
      return html.replace(/<\/body>/i, `${runtimeHtml}\n</body>`);
    }
    return `${html}\n${runtimeHtml}`;
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
        clientTemplates: options.clientTemplates,
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
        clientTemplates: options.clientTemplates,
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
    buildRegisteredTsxClientBundles(outputRoot);
  }

  function buildRegisteredTsxStyleAssets(outputRoot) {
    if (registeredStyleTemplates.size === 0) {
      return;
    }

    const dirPath = path.resolve(outputRoot, templateClientAssetDir);
    fs.mkdirSync(dirPath, { recursive: true });

    try {
      for (const asset of registeredStyleTemplates.values()) {
        fs.writeFileSync(path.join(dirPath, `${asset.code}.css`), asset.cssText, 'utf8');
      }
    } finally {
      registeredStyleTemplates.clear();
    }
  }

  function buildRegisteredTsxClientBundles(outputRoot) {
    if (registeredClientTemplates.size === 0) {
      return;
    }

    const manifestPath = path.join(outputRoot, '.cms-template-client-manifest.json');
    const manifest = {
      templates: Array.from(registeredClientTemplates.values())
    };

    try {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
      execFileSync(process.execPath, [
        path.join(SERVER_ROOT, 'scripts', 'build-template-client-bundles.mjs'),
        manifestPath,
        outputRoot
      ], {
        stdio: 'inherit'
      });
    } finally {
      registeredClientTemplates.clear();
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }
    }
  }

  return {
    renderCmsSitePage,
    cleanupTemplateClientBundles,
    buildRegisteredTsxAssets
  };
}

function hasTsxClientRuntime(source) {
  return hasImperativeTsxClientRuntime(source);
}

function hasImperativeTsxClientRuntime(source) {
  return /\bexport\s+(?:function|const|let|var)\s+client\b/.test(String(source || ''));
}

function templateClientNeedsProps(source) {
  return !/\bexport\s+const\s+clientProps\s*=\s*false\b/.test(String(source || ''));
}

function safeJsonForScript(value) {
  return JSON.stringify(stripNonSerializableTemplateValues(value) ?? {})
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function stripNonSerializableTemplateValues(value) {
  if (value == null) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripNonSerializableTemplateValues(item));
  }
  if (typeof value === 'object') {
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      if (typeof item !== 'function' && item !== undefined) {
        output[key] = stripNonSerializableTemplateValues(item);
      }
    }
    return output;
  }
  if (typeof value === 'function' || value === undefined) {
    return undefined;
  }
  return value;
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
