import vm from 'node:vm';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { ADMIN_APP_ROOT } from './config.mjs';

const adminRequire = createRequire(path.join(ADMIN_APP_ROOT, 'package.json'));

let cachedReact = null;
let cachedRenderToStaticMarkup = null;
let cachedSucrase = null;
const compiledTemplateCache = new Map();
const MAX_COMPILED_TEMPLATE_CACHE_SIZE = 200;

export function renderTsxTemplate(source, props = {}, options = {}) {
  const React = loadReact();
  const renderToStaticMarkup = loadRenderToStaticMarkup();
  const rawFragments = [];
  const Component = getCompiledTsxComponent(source, React, options);
  const element = React.createElement(Component, buildTemplateProps(props, React, rawFragments, options));
  const markup = replaceRawMarkers(renderToStaticMarkup(element), rawFragments);
  return markup.startsWith('<html') ? `<!DOCTYPE html>${markup}` : markup;
}

export function clearTsxTemplateCache() {
  compiledTemplateCache.clear();
}

export function getTsxTemplateCacheStats() {
  return {
    size: compiledTemplateCache.size,
    maxSize: MAX_COMPILED_TEMPLATE_CACHE_SIZE
  };
}

function getCompiledTsxComponent(source, React, options = {}) {
  const cacheKey = buildCompiledTemplateCacheKey(source, options);
  if (compiledTemplateCache.has(cacheKey)) {
    const cached = compiledTemplateCache.get(cacheKey);
    compiledTemplateCache.delete(cacheKey);
    compiledTemplateCache.set(cacheKey, cached);
    return cached;
  }

  const Component = compileTsxComponent(source, React);
  compiledTemplateCache.set(cacheKey, Component);
  pruneCompiledTemplateCache();
  return Component;
}

function buildCompiledTemplateCacheKey(source, options = {}) {
  const templateCode = String(options.templateCode || '').trim();
  const hash = createHash('sha256').update(String(source || '')).digest('hex');
  return `${templateCode}:${hash}`;
}

function pruneCompiledTemplateCache() {
  while (compiledTemplateCache.size > MAX_COMPILED_TEMPLATE_CACHE_SIZE) {
    const oldestKey = compiledTemplateCache.keys().next().value;
    if (!oldestKey) {
      return;
    }
    compiledTemplateCache.delete(oldestKey);
  }
}

function compileTsxComponent(source, React) {
  const sucrase = loadSucrase();
  const result = sucrase.transform(String(source || ''), {
    transforms: ['typescript', 'jsx', 'imports'],
    production: true
  });

  const module = { exports: {} };
  const exports = module.exports;
  const require = (id) => {
    if (id === 'react') {
      return React;
    }
    throw new Error(`TSX template cannot import "${id}". Only "react" is available.`);
  };
  const sandbox = {
    React,
    module,
    exports,
    require
  };
  const context = vm.createContext(sandbox, {
    name: 'cms-tsx-template',
    codeGeneration: {
      strings: false,
      wasm: false
    }
  });

  const script = new vm.Script(result.code, {
    filename: 'cms-template.tsx'
  });
  script.runInContext(context, { timeout: 1000 });

  const Component = module.exports.default || module.exports.Template || exports.default || exports.Template;
  if (typeof Component !== 'function') {
    throw new Error('TSX template must export default a React component.');
  }
  return Component;
}

function buildTemplateProps(props, React, rawFragments, options = {}) {
  const templateCode = String(options.templateCode || '').trim();

  function raw(value) {
    return { __html: String(value ?? '') };
  }

  function Raw({ html }) {
    const id = rawFragments.length;
    rawFragments.push(String(html ?? ''));
    return React.createElement('cms-raw', {
      'data-raw-id': String(id)
    });
  }

  function ClientOnly({ name = 'default', props: clientProps = {}, children }) {
    const attributes = {
      'data-cms-client-root': String(name || 'default'),
      'data-cms-client-props': JSON.stringify(clientProps ?? {})
    };
    if (templateCode) {
      attributes['data-cms-client-template'] = templateCode;
    }
    return React.createElement('div', attributes, children);
  }

  return {
    ...props,
    raw,
    Raw,
    ClientOnly
  };
}

function replaceRawMarkers(markup, rawFragments) {
  return String(markup || '').replace(/<cms-raw data-raw-id="(\d+)"(?:><\/cms-raw>|\/>)/g, (_, id) => {
    return rawFragments[Number(id)] || '';
  });
}

function loadReact() {
  if (!cachedReact) {
    cachedReact = adminRequire('react');
  }
  return cachedReact;
}

function loadRenderToStaticMarkup() {
  if (!cachedRenderToStaticMarkup) {
    cachedRenderToStaticMarkup = adminRequire('react-dom/server').renderToStaticMarkup;
  }
  return cachedRenderToStaticMarkup;
}

function loadSucrase() {
  if (!cachedSucrase) {
    cachedSucrase = adminRequire('sucrase');
  }
  return cachedSucrase;
}
