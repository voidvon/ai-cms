import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sqlite3 from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');
const dbPath = path.join(workspaceRoot, 'data/site.sqlite');
const htmlRoot = path.join(workspaceRoot, 'html');

const db = new sqlite3.DatabaseSync(dbPath);

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function execute(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function parseJson(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTitleFromHtmlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return '';
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/i);
  if (!titleMatch) {
    return '';
  }
  return stripHtml(titleMatch[1]);
}

function normalizeTitle(value) {
  const text = stripHtml(value);
  if (!text) {
    return '';
  }
  return text
    .replace(/\s*\|\s*斯派莎克.*$/u, '')
    .replace(/\s*-\s*斯派莎克.*$/u, '')
    .replace(/\s*_\s*斯派莎克.*$/u, '')
    .replace(/\s*\|\s*中国.*$/u, '')
    .trim();
}

function titleCaseFromSlug(value) {
  return String(value || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

function inferNameFromLegacyKey(column) {
  const legacy = parseJson(column.legacy_extra);
  const key = String(legacy?.key || '').trim();
  if (!key) {
    return '';
  }

  if (key.startsWith('news:')) {
    const parts = key.split(':');
    const last = parts[parts.length - 1] || '';
    return titleCaseFromSlug(last);
  }

  if (key.startsWith('column:')) {
    const route = key.slice('column:'.length);
    const last = route.split('/').filter(Boolean).pop() || '';
    return titleCaseFromSlug(last);
  }

  if (key.startsWith('product:')) {
    const route = key.slice('product:'.length);
    const last = route.split('/').filter(Boolean).pop() || '';
    return titleCaseFromSlug(last);
  }

  return '';
}

function buildNewsCategoryNameBySourceId() {
  const rows = queryAll(`
    SELECT source_id, legacy_extra
    FROM columns
    WHERE source_type = 'news_item'
    ORDER BY id ASC
  `);

  const names = new Map();
  for (const row of rows) {
    const legacy = parseJson(row.legacy_extra);
    const key = String(legacy?.key || '').trim();
    if (!key.startsWith('news:')) {
      continue;
    }

    const parts = key.split(':');
    const sourceId = Number(row.source_id);
    let categoryName = '';
    if (parts[1] === 'services') {
      categoryName = '服务';
    } else if (parts[1] === 'knowledge-exchange') {
      categoryName = '知识交流';
    } else if (parts[1] === 'customer-stories') {
      categoryName = '客户案例';
    } else if (parts[1] === 'promo') {
      categoryName = '专题推广';
    } else if (parts[1] === 'learn-about-steam') {
      categoryName = titleCaseFromSlug(parts[2] || '');
    }

    if (categoryName && !names.has(sourceId)) {
      names.set(sourceId, categoryName);
    }
  }
  return names;
}

function routePathToHtmlFile(routePath) {
  const normalized = String(routePath || '').trim();
  if (!normalized) {
    return null;
  }
  if (normalized.endsWith('.html')) {
    return path.join(htmlRoot, normalized.replace(/^\//, ''));
  }
  const clean = normalized.replace(/^\//, '').replace(/\/$/, '');
  return path.join(htmlRoot, clean, 'index.html');
}

function inferSinglePageName(column) {
  const legacy = parseJson(column.legacy_extra);
  const pageData = legacy?.page_data || {};
  return normalizeTitle(pageData.title || column.seo_title || extractTitleFromHtmlFile(routePathToHtmlFile(column.route_path)));
}

function inferProductCategoryName(column) {
  const legacy = parseJson(column.legacy_extra);
  const pageData = legacy?.page_data || {};
  return normalizeTitle(pageData.title || pageData.hero?.title || pageData.topPanel?.eyebrow || '');
}

function inferContentName(column) {
  const legacy = parseJson(column.legacy_extra);
  const pageData = legacy?.page_data || {};
  return normalizeTitle(pageData.title || column.seo_title || inferNameFromLegacyKey(column));
}

function inferFallbackName(column) {
  if (column.source_type === 'single_page') {
    return inferSinglePageName(column);
  }
  if (column.source_type === 'product_category') {
    return inferProductCategoryName(column);
  }
  if (column.source_type === 'product_item' || column.source_type === 'news_item') {
    return inferContentName(column);
  }
  if (column.source_type === 'news_category') {
    return newsCategoryNameBySourceId.get(Number(column.source_id)) || inferNameFromLegacyKey(column);
  }
  if (column.source_type === 'product_root') {
    return '产品';
  }
  if (column.source_type === 'corporation_root') {
    return '公司信息';
  }
  if (column.source_type === 'contact_page') {
    return '联系我们';
  }
  return '';
}

const defaultLanguage = queryOne(`SELECT id, code FROM languages WHERE is_default = 1 LIMIT 1`);
if (!defaultLanguage) {
  throw new Error('Default language not found');
}
const newsCategoryNameBySourceId = buildNewsCategoryNameBySourceId();

const columns = queryAll(`
  SELECT
    id,
    source_type,
    source_id,
    route_path,
    seo_title,
    summary,
    legacy_extra
  FROM columns
  ORDER BY id ASC
`);

let recovered = 0;
for (const column of columns) {
  const name = inferFallbackName(column);
  if (!name) {
    continue;
  }
  execute(
    `
      INSERT INTO column_translations (
        column_id,
        language_id,
        name,
        summary,
        content_html,
        keywords,
        seo_title,
        seo_keywords,
        seo_description,
        publish_status,
        published_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, '', '', NULL, NULL, NULL, NULL, 'published', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(column_id, language_id) DO UPDATE SET
        name = excluded.name,
        updated_at = excluded.updated_at
    `,
    [column.id, defaultLanguage.id, name]
  );
  recovered += 1;
}

const remaining = queryOne(`
  SELECT COUNT(*) AS count
  FROM columns c
  LEFT JOIN column_translations t
    ON t.column_id = c.id
   AND t.language_id = ?
  WHERE t.id IS NULL OR trim(coalesce(t.name, '')) = ''
`, [defaultLanguage.id])?.count || 0;

console.log(JSON.stringify({
  recovered,
  remaining,
  defaultLanguage: defaultLanguage.code,
}, null, 2));
