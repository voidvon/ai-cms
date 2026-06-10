import { createRequire } from 'node:module';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ADMIN_APP_ROOT } from './config.mjs';
import { getTsxTemplateModuleExports } from './tsx-template-renderer.mjs';

const adminRequire = createRequire(path.join(ADMIN_APP_ROOT, 'package.json'));
const compiledStyleCache = new Map();
const MAX_COMPILED_STYLE_CACHE_SIZE = 200;

let cachedSass = null;

export function getTsxTemplateStyleAsset(source, options = {}) {
  const templateCode = sanitizeTemplateCode(options.templateCode);
  const definition = getTsxTemplateStyleDefinition(source, options);
  if (!definition) {
    return null;
  }

  const cacheKey = buildStyleCacheKey(source, templateCode);
  if (compiledStyleCache.has(cacheKey)) {
    const cached = compiledStyleCache.get(cacheKey);
    compiledStyleCache.delete(cacheKey);
    compiledStyleCache.set(cacheKey, cached);
    return cached;
  }

  const asset = {
    code: templateCode || createAnonymousStyleCode(source),
    cssText: compileStyleDefinition(definition, options),
    sourceType: definition.sourceType
  };
  compiledStyleCache.set(cacheKey, asset);
  pruneCompiledStyleCache();
  return asset;
}

export function clearTsxTemplateStyleCache() {
  compiledStyleCache.clear();
}

function getTsxTemplateStyleDefinition(source, options = {}) {
  const exports = getTsxTemplateModuleExports(source, options);
  const css = normalizeStyleSource(exports?.css);
  const scss = normalizeStyleSource(exports?.scss);

  if (css && scss) {
    throw new Error('TSX 模板不能同时导出 css 和 scss，请只保留一种。');
  }

  if (scss) {
    return { sourceType: 'scss', content: scss };
  }

  if (css) {
    return { sourceType: 'css', content: css };
  }

  return null;
}

function compileStyleDefinition(definition, options = {}) {
  if (definition.sourceType === 'css') {
    return definition.content;
  }

  const sass = loadSass();
  const result = sass.compileString(definition.content, {
    syntax: 'scss',
    style: 'expanded',
    url: buildVirtualTemplateUrl(options.templateCode)
  });
  return String(result.css || '');
}

function loadSass() {
  if (!cachedSass) {
    cachedSass = adminRequire('sass');
  }
  return cachedSass;
}

function normalizeStyleSource(value) {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function buildStyleCacheKey(source, templateCode) {
  const hash = createHash('sha256').update(String(source || '')).digest('hex');
  return `${templateCode || 'anonymous'}:${hash}`;
}

function createAnonymousStyleCode(source) {
  return `template_${createHash('sha256').update(String(source || '')).digest('hex').slice(0, 12)}`;
}

function buildVirtualTemplateUrl(templateCode) {
  const code = sanitizeTemplateCode(templateCode) || 'template';
  return new URL(`file:///cms-template/${code}.scss`);
}

function pruneCompiledStyleCache() {
  while (compiledStyleCache.size > MAX_COMPILED_STYLE_CACHE_SIZE) {
    const oldestKey = compiledStyleCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    compiledStyleCache.delete(oldestKey);
  }
}

function sanitizeTemplateCode(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
