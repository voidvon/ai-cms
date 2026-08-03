import fs from 'node:fs';
import path from 'node:path';
import { execute, getDb, queryAll, queryOne } from '../src/db.mjs';
import { listColumns } from '../src/services/columns.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';

const sourceDistRoot = path.join(sourceRoot, 'dist');
const dryRun = process.argv.includes('--dry-run');
const targetLanguages = parseLanguageArgs(process.argv.slice(2));

if (!fs.existsSync(sourceDistRoot)) {
  throw new Error(`未找到原站 dist 目录: ${sourceDistRoot}`);
}

const db = getDb();
const languageRows = queryAll(`
  SELECT
    l.id,
    l.code,
    ls.site_mode,
    ls.path_prefix,
    ls.output_dir
  FROM languages l
  LEFT JOIN language_sites ls
    ON ls.language_id = l.id
  ORDER BY l.sort_order ASC, l.id ASC
`);

const languageConfigs = languageRows
  .filter((row) => !targetLanguages.length || targetLanguages.includes(String(row.code || '').trim()))
  .map((row) => ({
    id: Number(row.id),
    code: String(row.code || '').trim(),
    siteMode: String(row.site_mode || 'subdir').trim(),
    pathPrefix: String(row.path_prefix || '').trim(),
    outputDir: String(row.output_dir || '').trim(),
    sourceDir: resolveSourceLanguageDir(String(row.code || '').trim()),
  }))
  .filter((row) => row.code && row.sourceDir);

if (!languageConfigs.length) {
  throw new Error('未匹配到可同步的语言配置');
}

const siteConfigId = queryOne('SELECT id FROM site_config ORDER BY id ASC LIMIT 1')?.id;
if (!siteConfigId) {
  throw new Error('未找到 site_config');
}
const homeColumnId = queryOne(`
  SELECT id
  FROM columns
  WHERE column_type = 'link'
    AND parent_id IS NULL
    AND trim(coalesce(custom_url, '')) IN ('/', '')
  ORDER BY id ASC
  LIMIT 1
`)?.id || null;

const columns = listColumns({ includeTranslations: false });
const columnsByRoute = new Map();
for (const row of columns) {
  const route = normalizeRoutePath(row.public_path);
  if (!route) continue;
  columnsByRoute.set(route, row);
  const sourceRoute = mapCurrentRouteToSourceRoute(route);
  if (sourceRoute && sourceRoute !== route) {
    columnsByRoute.set(sourceRoute, row);
  }
}

const newsEntries = queryAll(`
  SELECT
    id,
    column_id,
    custom_url
  FROM content_news
  ORDER BY id ASC
`);
const newsByRoute = new Map();
for (const row of newsEntries) {
  const route = normalizeRoutePath(row.custom_url);
  if (!route) continue;
  newsByRoute.set(route, row);
  const sourceRoute = mapCurrentRouteToSourceRoute(route);
  if (sourceRoute && sourceRoute !== route) {
    newsByRoute.set(sourceRoute, row);
  }
}

const productEntries = queryAll(`
  SELECT
    id,
    column_id,
    custom_url
  FROM content_product
  ORDER BY id ASC
`);
const productsByRoute = new Map();
for (const row of productEntries) {
  const route = normalizeProductRoute(row.custom_url, row.column_id);
  if (!route) continue;
  productsByRoute.set(route, row);
}

const stats = [];
for (const language of languageConfigs) {
  const result = syncLanguage(language);
  stats.push(result);
}

for (const item of stats) {
  console.log(`${dryRun ? '[dry-run] ' : ''}${item.code}: site=${item.site} columns=${item.columns} news=${item.news} products=${item.products} skipped=${item.skipped}`);
}

function syncLanguage(language) {
  const result = {
    code: language.code,
    site: 0,
    columns: 0,
    news: 0,
    products: 0,
    skipped: 0,
  };

  const sourceDir = language.sourceDir;
  const htmlFiles = listHtmlFiles(sourceDir);
  if (!htmlFiles.length) {
    return result;
  }

  const homeMeta = syncSiteHomeMeta(language, result);
  if (homeColumnId && homeMeta) {
    if (syncColumnTranslation({
      column: { id: homeColumnId, route_path: '/' },
      languageId: language.id,
      meta: homeMeta,
    })) {
      result.columns += 1;
    }
  }

  for (const filePath of htmlFiles) {
    const route = toRoutePath(filePath, sourceDir);
    if (!route) {
      result.skipped += 1;
      continue;
    }
    if (route === '/') {
      continue;
    }

    const meta = loadHtmlMetadata(filePath);
    if (!meta.title && !meta.heading && !meta.description) {
      result.skipped += 1;
      continue;
    }

    const mappedRoute = mapCurrentRouteToSourceRoute(route);

    const productEntry = productsByRoute.get(mappedRoute);
    if (productEntry) {
      if (syncContentTranslation({
        table: 'content_product_translations',
        entryId: Number(productEntry.id),
        languageId: language.id,
        meta,
        preferHeadingAsName: true,
      })) {
        result.products += 1;
      }
      continue;
    }

    const newsEntry = newsByRoute.get(mappedRoute);
    if (newsEntry) {
      if (syncContentTranslation({
        table: 'content_news_translations',
        entryId: Number(newsEntry.id),
        languageId: language.id,
        meta,
        preferHeadingAsName: true,
      })) {
        result.news += 1;
      }
      continue;
    }

    const column = columnsByRoute.get(mappedRoute);
    if (column) {
      if (syncColumnTranslation({
        column,
        languageId: language.id,
        meta,
      })) {
        result.columns += 1;
      }
      continue;
    }

    result.skipped += 1;
  }

  return result;
}

function syncSiteHomeMeta(language, result) {
  const sourceFile = path.join(language.sourceDir, 'index.html');
  if (!fs.existsSync(sourceFile)) {
    return null;
  }
  const meta = loadHtmlMetadata(sourceFile);
  const current = queryOne(
    `
      SELECT seo_home_title, seo_default_title, seo_home_description, template_data_json
      FROM site_config_translations
      WHERE site_config_id = ?
        AND language_id = ?
    `,
    [siteConfigId, language.id],
  );
  if (!current) {
    return meta;
  }

  const nextSeoHomeTitle = nullableString(meta.title) || nullableString(current.seo_home_title);
  const nextSeoDefaultTitle = nullableString(meta.title) || nullableString(current.seo_default_title);
  const nextSeoHomeDescription = nullableString(meta.description) || nullableString(current.seo_home_description);
  const nextTemplateDataJson = mergeSiteTemplateDataJson(current.template_data_json, {
    home: {
      title: meta.title || '',
      summary: meta.description || '',
      hero: {
        title: meta.heading || '',
        summary: meta.description || '',
      },
    },
  });

  const changed = (
    nullableString(current.seo_home_title) !== nextSeoHomeTitle
    || nullableString(current.seo_default_title) !== nextSeoDefaultTitle
    || nullableString(current.seo_home_description) !== nextSeoHomeDescription
    || String(current.template_data_json || '') !== String(nextTemplateDataJson || '')
  );

  if (!changed) {
    return meta;
  }

  result.site += 1;
  if (dryRun) {
    return meta;
  }

  execute(
    `
      UPDATE site_config_translations
         SET seo_home_title = ?,
             seo_default_title = ?,
             seo_home_description = ?,
             template_data_json = ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE site_config_id = ?
         AND language_id = ?
    `,
    [
      nextSeoHomeTitle,
      nextSeoDefaultTitle,
      nextSeoHomeDescription,
      nextTemplateDataJson,
      siteConfigId,
      language.id,
    ],
  );
  return meta;
}

function syncColumnTranslation({ column, languageId, meta }) {
  let current = queryOne(
    `
      SELECT id, name, summary, template_data_json, seo_title, seo_description
      FROM column_translations
      WHERE column_id = ?
        AND language_id = ?
    `,
    [column.id, languageId],
  );
  if (!current) {
    ensureColumnTranslationRow(column.id, languageId);
    current = queryOne(
      `
        SELECT id, name, summary, template_data_json, seo_title, seo_description
        FROM column_translations
        WHERE column_id = ?
          AND language_id = ?
      `,
      [column.id, languageId],
    );
  }
  if (!current) {
    return false;
  }

  const nextName = coalesceString(resolveColumnNameOverride(column, meta), current.name);
  const nextSummary = coalesceString(meta.description, current.summary);
  const nextSeoTitle = nullableString(meta.title) || nullableString(current.seo_title);
  const nextSeoDescription = nullableString(meta.metaDescription || meta.description) || nullableString(current.seo_description);
  const nextTemplateDataJson = mergeColumnTemplateDataJson(current.template_data_json, {
    title: meta.heading || meta.pageTitle || meta.title || '',
    summary: meta.description || '',
    hero: {
      title: meta.heading || meta.pageTitle || meta.title || '',
      summary: meta.description || '',
    },
  });

  const changed = (
    String(current.name || '') !== String(nextName || '')
    || String(current.summary || '') !== String(nextSummary || '')
    || nullableString(current.seo_title) !== nextSeoTitle
    || nullableString(current.seo_description) !== nextSeoDescription
    || String(current.template_data_json || '') !== String(nextTemplateDataJson || '')
  );

  if (!changed) {
    return false;
  }

  if (dryRun) {
    return true;
  }

  execute(
    `
      UPDATE column_translations
         SET name = ?,
             summary = ?,
             template_data_json = ?,
             seo_title = ?,
             seo_description = ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `,
    [
      nextName,
      nextSummary,
      nextTemplateDataJson,
      nextSeoTitle,
      nextSeoDescription,
      current.id,
    ],
  );
  return true;
}

function syncContentTranslation({ table, entryId, languageId, meta, preferHeadingAsName = false }) {
  let current = queryOne(
    `
      SELECT id, name, summary, template_data_json, seo_title, seo_description
      FROM ${table}
      WHERE entry_id = ?
        AND language_id = ?
    `,
    [entryId, languageId],
  );
  if (!current) {
    ensureContentTranslationRow(table, entryId, languageId);
    current = queryOne(
      `
        SELECT id, name, summary, template_data_json, seo_title, seo_description
        FROM ${table}
        WHERE entry_id = ?
          AND language_id = ?
      `,
      [entryId, languageId],
    );
  }
  if (!current) {
    return false;
  }

  const nextName = coalesceString(
    preferHeadingAsName ? meta.heading : '',
    meta.pageTitle,
    current.name,
  );
  const nextSummary = coalesceString(meta.description, current.summary);
  const nextSeoTitle = nullableString(meta.title) || nullableString(current.seo_title);
  const nextSeoDescription = nullableString(meta.metaDescription || meta.description) || nullableString(current.seo_description);
  const nextTemplateDataJson = mergeContentTemplateDataJson(current.template_data_json, {
    title: meta.heading || meta.pageTitle || current.name || '',
    summary: meta.description || '',
  });

  const changed = (
    String(current.name || '') !== String(nextName || '')
    || String(current.summary || '') !== String(nextSummary || '')
    || nullableString(current.seo_title) !== nextSeoTitle
    || nullableString(current.seo_description) !== nextSeoDescription
    || String(current.template_data_json || '') !== String(nextTemplateDataJson || '')
  );

  if (!changed) {
    return false;
  }

  if (dryRun) {
    return true;
  }

  execute(
    `
      UPDATE ${table}
         SET name = ?,
             summary = ?,
             template_data_json = ?,
             seo_title = ?,
             seo_description = ?,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
    `,
    [
      nextName,
      nextSummary,
      nextTemplateDataJson,
      nextSeoTitle,
      nextSeoDescription,
      current.id,
    ],
  );
  return true;
}

function resolveColumnNameOverride(column, meta) {
  const route = normalizeRoutePath(column.route_path);
  const h1 = String(meta.heading || '').trim();
  if (!h1) {
    return '';
  }

  if (route === '/about-us/careers/') {
    return h1;
  }
  if (route === '/customer-stories/') {
    return h1;
  }
  return '';
}

function resolveSourceLanguageDir(languageCode) {
  const code = String(languageCode || '').trim();
  const direct = path.join(sourceDistRoot, code);
  const lower = path.join(sourceDistRoot, code.toLowerCase());
  const enSubdir = path.join(sourceDistRoot, 'en', code);
  const enLowerSubdir = path.join(sourceDistRoot, 'en', code.toLowerCase());

  if (code === 'fr' && fs.existsSync(enSubdir)) {
    return enSubdir;
  }
  if (['pt', 'th', 'tr'].includes(code) && fs.existsSync(enSubdir)) {
    const directCustomerStories = path.join(direct, 'customer-stories', 'index.html');
    const enCustomerStories = path.join(enSubdir, 'customer-stories', 'index.html');
    if (!fs.existsSync(directCustomerStories) && fs.existsSync(enCustomerStories)) {
      return enSubdir;
    }
  }
  if (fs.existsSync(direct)) {
    return direct;
  }
  if (fs.existsSync(lower)) {
    return lower;
  }
  if (fs.existsSync(enSubdir)) {
    return enSubdir;
  }
  if (fs.existsSync(enLowerSubdir)) {
    return enLowerSubdir;
  }
  return null;
}

function listHtmlFiles(rootDir) {
  const files = [];
  walk(rootDir, files);
  return files;
}

function walk(dir, files) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '_astro' || entry.name === 'pagefind' || entry.name === 'images' || entry.name === 'pdfs') {
        continue;
      }
      walk(fullPath, files);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      files.push(fullPath);
    }
  }
}

function toRoutePath(filePath, rootDir) {
  const relative = path.relative(rootDir, filePath).replace(/\\/g, '/');
  if (!relative || relative === 'index.html') {
    return '/';
  }
  return normalizeRoutePath(relative.replace(/\/index\.html$/i, '/'));
}

function normalizeRoutePath(routePath) {
  const value = String(routePath || '').trim();
  if (!value) {
    return '';
  }

  let normalized = value
    .replace(/\\/gu, '/')
    .replace(/\/index\.html$/iu, '/')
    .replace(/^\/+/, '/');

  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (!normalized.endsWith('/')) {
    normalized = `${normalized}/`;
  }
  normalized = normalized.replace(/\/{2,}/gu, '/');
  return normalized === '//' ? '/' : normalized;
}

function mapCurrentRouteToSourceRoute(routePath) {
  let normalized = normalizeRoutePath(routePath);
  if (normalized === '/industry/' || normalized.startsWith('/industry/')) {
    normalized = normalized.replace(/^\/industry\//u, '/industries/');
  }
  if (normalized === '/cases/' || normalized.startsWith('/cases/')) {
    normalized = normalized.replace(/^\/cases\//u, '/customer-stories/');
  }
  return normalized;
}

function normalizeProductRoute(customUrl, columnId) {
  const detailSegment = String(customUrl || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/index\.html$/i, '')
    .replace(/index\.html$/i, '')
    .replace(/^\/+|\/+$/g, '');
  if (!detailSegment) {
    return '';
  }
  const column = columns.find((item) => Number(item.id) === Number(columnId));
  const baseRoute = normalizeRoutePath(column?.route_path);
  if (!baseRoute) {
    return normalizeRoutePath(detailSegment);
  }
  return normalizeRoutePath(`${baseRoute}${detailSegment}/`);
}

function loadHtmlMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const title = decodeHtml(stripTags(matchFirst(raw, /<title>([\s\S]*?)<\/title>/i)));
  const metaDescription = extractMetaContent(raw, 'description');
  const heading = decodeHtml(stripTags(
    matchFirst(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
  ));
  const summary = decodeHtml(stripTags(
    matchFirst(
      raw,
      /<(?:p|div)[^>]+class=["'][^"']*(?:banner-primary__copy|sg-short-masthead__summary|home-hero__summary|short-masthead__summary|sg-digital-page__summary|article__summary|product-top-panel__description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i,
    ),
  ));

  return {
    title: title || '',
    heading: heading || '',
    pageTitle: stripSiteSuffix(title || ''),
    metaDescription: metaDescription || '',
    description: summary || metaDescription || '',
  };
}

function stripSiteSuffix(value) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }
  return text
    .replace(/\s+\|\s+Spirax Sarco(?: Inc\.)?$/i, '')
    .trim();
}

function extractMetaContent(raw, name) {
  const patternA = new RegExp(`<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  const patternB = new RegExp(`<meta[^>]+content=["']([\\s\\S]*?)["'][^>]+name=["']${escapeRegExp(name)}["'][^>]*>`, 'i');
  return decodeHtml(matchFirst(raw, patternA) || matchFirst(raw, patternB));
}

function mergeColumnTemplateDataJson(value, patch) {
  const data = parseJsonObject(value);
  data.title = coalesceString(patch.title, data.title, '');
  data.summary = coalesceString(patch.summary, data.summary, '');
  const hero = data.hero && typeof data.hero === 'object' ? { ...data.hero } : {};
  hero.title = coalesceString(patch.hero?.title, hero.title, data.title, '');
  hero.summary = coalesceString(patch.hero?.summary, hero.summary, data.summary, '');
  data.hero = hero;
  return JSON.stringify(data, null, 0);
}

function mergeContentTemplateDataJson(value, patch) {
  const data = parseJsonObject(value);
  data.title = coalesceString(patch.title, data.title, '');
  data.summary = coalesceString(patch.summary, data.summary, '');
  return JSON.stringify(data, null, 0);
}

function mergeSiteTemplateDataJson(value, patch) {
  const data = parseJsonObject(value);
  const home = data.home && typeof data.home === 'object' ? { ...data.home } : {};
  home.title = coalesceString(patch.home?.title, home.title, '');
  home.summary = coalesceString(patch.home?.summary, home.summary, '');
  const hero = home.hero && typeof home.hero === 'object' ? { ...home.hero } : {};
  hero.title = coalesceString(patch.home?.hero?.title, hero.title, home.title, '');
  hero.summary = coalesceString(patch.home?.hero?.summary, hero.summary, home.summary, '');
  home.hero = hero;
  data.home = home;
  return JSON.stringify(data, null, 0);
}

function ensureColumnTranslationRow(columnId, languageId) {
  const existing = queryOne(
    'SELECT id FROM column_translations WHERE column_id = ? AND language_id = ?',
    [columnId, languageId],
  );
  if (existing?.id) {
    return;
  }
  const fallback = queryOne(
    `
      SELECT ct.name, ct.summary, ct.content_html, ct.template_data_json, ct.seo_title, ct.seo_description, ct.publish_status
      FROM column_translations ct
      JOIN languages l ON l.id = ct.language_id
      WHERE ct.column_id = ?
      ORDER BY CASE WHEN l.is_default = 1 THEN 0 ELSE 1 END, l.sort_order ASC, l.id ASC
      LIMIT 1
    `,
    [columnId],
  );
  if (dryRun) {
    return;
  }
  execute(
    `
      INSERT INTO column_translations (
        column_id,
        language_id,
        name,
        summary,
        content_html,
        template_data_json,
        seo_title,
        seo_description,
        publish_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      columnId,
      languageId,
      fallback?.name || '',
      fallback?.summary || '',
      fallback?.content_html || '',
      fallback?.template_data_json || null,
      fallback?.seo_title || null,
      fallback?.seo_description || null,
      fallback?.publish_status || 'published',
    ],
  );
}

function ensureContentTranslationRow(table, entryId, languageId) {
  const existing = queryOne(
    `SELECT id FROM ${table} WHERE entry_id = ? AND language_id = ?`,
    [entryId, languageId],
  );
  if (existing?.id) {
    return;
  }
  const fallback = queryOne(
    `
      SELECT t.name, t.summary, t.content_html, t.template_data_json, t.seo_title, t.seo_description, t.publish_status
      FROM ${table} t
      JOIN languages l ON l.id = t.language_id
      WHERE t.entry_id = ?
      ORDER BY CASE WHEN l.is_default = 1 THEN 0 ELSE 1 END, l.sort_order ASC, l.id ASC
      LIMIT 1
    `,
    [entryId],
  );
  if (dryRun) {
    return;
  }
  execute(
    `
      INSERT INTO ${table} (
        entry_id,
        language_id,
        name,
        summary,
        content_html,
        template_data_json,
        seo_title,
        seo_description,
        publish_status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      entryId,
      languageId,
      fallback?.name || '',
      fallback?.summary || '',
      fallback?.content_html || '',
      fallback?.template_data_json || null,
      fallback?.seo_title || null,
      fallback?.seo_description || null,
      fallback?.publish_status || 'published',
    ],
  );
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseLanguageArgs(argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = String(argv[index] || '').trim();
    if (!value || value === '--dry-run') {
      continue;
    }
    if (value === '--language' || value === '-l') {
      const next = String(argv[index + 1] || '').trim();
      if (next) {
        values.push(next);
        index += 1;
      }
      continue;
    }
    if (value.startsWith('--language=')) {
      values.push(value.slice('--language='.length));
    }
  }
  return values;
}

function coalesceString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function nullableString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#39;/g, '\'')
    .replace(/&#x27;/gi, '\'')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function matchFirst(value, pattern) {
  return String(value || '').match(pattern)?.[1] || '';
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
