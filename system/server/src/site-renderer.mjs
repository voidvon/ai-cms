import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ADMIN_APP_ROOT } from './config.mjs';

const require = createRequire(import.meta.url);
const adminRequire = createRequire(path.join(ADMIN_APP_ROOT, 'package.json'));
const ADMIN_PACKAGE_JSON_PATH = path.join(ADMIN_APP_ROOT, 'package.json');
const SITE_SOURCE_ROOT = path.join(ADMIN_APP_ROOT, 'src', 'site');
const SITE_RENDERER_SOURCE_PATH = path.join(SITE_SOURCE_ROOT, 'render.tsx');
const SITE_SOURCE_EXTENSIONS = ['.ts', '.tsx'];

let cachedSourceRenderer = null;
let cachedSourceMtime = 0;
let cachedSucrase = null;

export function canRenderSitePage() {
  return fs.existsSync(SITE_RENDERER_SOURCE_PATH);
}

export function renderSitePage(pageName, props) {
  const renderer = loadRenderer();
  return renderer.renderPage(pageName, props);
}

function loadRenderer() {
  if (!fs.existsSync(SITE_RENDERER_SOURCE_PATH)) {
    throw new Error(`React site renderer source is missing. Expected source at ${SITE_RENDERER_SOURCE_PATH}`);
  }

  return loadSourceRenderer();
}

function getNewestMtime(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isDirectory()) {
    return stat.mtimeMs;
  }

  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(filePath, { withFileTypes: true })) {
    const childPath = path.join(filePath, entry.name);
    const childMtime = entry.isDirectory() ? getNewestMtime(childPath) : fs.statSync(childPath).mtimeMs;
    newest = Math.max(newest, childMtime);
  }
  return newest;
}

function loadSourceRenderer() {
  const sourceMtime = Math.max(
    getNewestMtime(SITE_SOURCE_ROOT),
    fs.existsSync(ADMIN_PACKAGE_JSON_PATH) ? fs.statSync(ADMIN_PACKAGE_JSON_PATH).mtimeMs : 0
  );
  if (cachedSourceRenderer && cachedSourceMtime === sourceMtime) {
    return cachedSourceRenderer;
  }

  const renderer = loadSourceModule(SITE_RENDERER_SOURCE_PATH);
  if (typeof renderer?.renderPage !== 'function') {
    throw new Error('React site renderer source does not export renderPage().');
  }

  cachedSourceRenderer = renderer;
  cachedSourceMtime = sourceMtime;
  return cachedSourceRenderer;
}

function loadSourceModule(filePath) {
  purgeSiteSourceRequireCache();

  const previousExtensions = new Map();
  const sucrase = loadSucrase();

  for (const extension of SITE_SOURCE_EXTENSIONS) {
    previousExtensions.set(extension, require.extensions[extension]);
    require.extensions[extension] = (module, filename) => {
      const source = fs.readFileSync(filename, 'utf8');
      const result = sucrase.transform(source, {
        transforms: ['typescript', 'jsx', 'imports'],
        jsxRuntime: 'automatic',
        production: true
      });
      module._compile(result.code, filename);
    };
  }

  try {
    return adminRequire(filePath);
  } finally {
    for (const extension of SITE_SOURCE_EXTENSIONS) {
      const previous = previousExtensions.get(extension);
      if (previous) {
        require.extensions[extension] = previous;
      } else {
        delete require.extensions[extension];
      }
    }
  }
}

function purgeSiteSourceRequireCache() {
  const normalizedSourceRoot = `${path.resolve(SITE_SOURCE_ROOT)}${path.sep}`;
  for (const cachedPath of Object.keys(require.cache)) {
    if (path.resolve(cachedPath).startsWith(normalizedSourceRoot)) {
      delete require.cache[cachedPath];
    }
  }
}

function loadSucrase() {
  if (cachedSucrase) {
    return cachedSucrase;
  }

  try {
    cachedSucrase = adminRequire('sucrase');
    return cachedSucrase;
  } catch {
    throw new Error('React site source renderer requires system/admin dependencies. Run npm install in the project root once on this server.');
  }
}
