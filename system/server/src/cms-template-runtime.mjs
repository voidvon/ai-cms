import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { SERVER_ROOT } from './config.mjs';
import { listPublishedComponents, resolvePublishedTemplate } from './services/templates.mjs';
import { renderTsxTemplate } from './tsx-template-renderer.mjs';
import { escapeHtml } from './utils/html.mjs';

export function createCmsTemplateRuntime({
  templateByPage,
  templateTypeByPage,
  templateClientAssetDir,
  expandLegacyCommonPlaceholders
}) {
  const registeredTsxClientTemplates = new Map();

  function renderCmsSitePage(pageName, props, templateContext, options = {}) {
    const templateCode = templateByPage[pageName];
    const templateType = options.templateType || templateTypeByPage[pageName];
    const template = templateCode && templateType ? resolvePublishedTemplate({
      templateType,
      targets: options.targets || [],
      fallbackCode: templateCode
    }) : null;

    if (!template?.content) {
      throw new Error(`Published CMS template is missing: ${templateCode || pageName}`);
    }

    const clientTemplates = new Map();
    let html = '';

    if (template.engine === 'tsx') {
      if (hasTsxClientRuntime(template.content)) {
        registerTsxClientTemplate(template, clientTemplates);
      }
      html = renderCmsTsxTemplate(template.content, props, templateContext, {
        clientTemplates,
        templateCode: template.code
      });
    } else {
      html = renderCmsTemplate(template.content, props, templateContext, {
        clientTemplates
      });
    }

    return injectTsxClientRuntimes(html, clientTemplates, props);
  }

  function renderCmsTsxTemplate(content, props, templateContext, options = {}) {
    const components = buildCmsComponentMap(templateContext);
    const templateProps = {
      ...props,
      component: (code, extraProps = {}) => {
        return renderCmsComponent(code, components, templateContext, { ...props, ...extraProps }, 0, options);
      }
    };
    return expandLegacyCommonPlaceholders(renderTsxTemplate(content, templateProps, {
      templateCode: options.templateCode || ''
    }), templateContext);
  }

  function registerTsxClientTemplate(template, clientTemplates = null) {
    const code = sanitizeTemplateCode(template.code);
    if (!code) {
      return;
    }
    const runtimeTemplate = {
      code,
      source: template.content || ''
    };
    registeredTsxClientTemplates.set(code, runtimeTemplate);
    if (clientTemplates) {
      clientTemplates.set(code, runtimeTemplate);
    }
  }

  function injectTsxClientRuntimes(html, clientTemplates, props) {
    if (!clientTemplates || clientTemplates.size === 0) {
      return html;
    }
    const runtimeParts = [];
    for (const template of clientTemplates.values()) {
      const code = sanitizeTemplateCode(template.code);
      if (!code) {
        continue;
      }
      if (hasImperativeTsxClientRuntime(template.source)) {
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

    for (const item of listPublishedComponents()) {
      components.set(String(item.code || '').toLowerCase(), {
        code: item.code || '',
        engine: item.engine || 'html',
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
        return renderCmsComponent(code, components, templateContext, props, depth + 1, options);
      });
      if (!changed) {
        break;
      }
    }
    return html;
  }

  function renderCmsComponent(code, components, templateContext, props, depth, options = {}) {
    if (depth > 10) {
      return '';
    }
    const component = components.get(String(code || '').toLowerCase());
    if (!component?.content) {
      return '';
    }

    if (component.engine === 'tsx') {
      if (hasTsxClientRuntime(component.content)) {
        registerTsxClientTemplate(component, options.clientTemplates);
      }
      const templateProps = {
        ...props,
        component: (nestedCode, extraProps = {}) => renderCmsComponent(nestedCode, components, templateContext, { ...props, ...extraProps }, depth + 1, options)
      };
      return expandLegacyCommonPlaceholders(renderTsxTemplate(component.content, templateProps, {
        templateCode: component.code
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

  function buildRegisteredTsxClientBundles(outputRoot) {
    if (registeredTsxClientTemplates.size === 0) {
      return;
    }

    const manifestPath = path.join(outputRoot, '.cms-template-client-manifest.json');
    const manifest = {
      templates: Array.from(registeredTsxClientTemplates.values())
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
      registeredTsxClientTemplates.clear();
      if (fs.existsSync(manifestPath)) {
        fs.unlinkSync(manifestPath);
      }
    }
  }

  return {
    renderCmsSitePage,
    cleanupTemplateClientBundles,
    buildRegisteredTsxClientBundles
  };
}

function hasTsxClientRuntime(source) {
  return /\bClientOnly\b|\bexport\s+(?:function|const|let|var)\s+(?:Client|client|ClientComponents)\b/.test(String(source || ''));
}

function hasImperativeTsxClientRuntime(source) {
  return /\bexport\s+(?:function|const|let|var)\s+client\b/.test(String(source || ''));
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

function sanitizeTemplateCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
