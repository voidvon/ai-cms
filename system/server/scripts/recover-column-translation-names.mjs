import sqlite3 from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, '../../..');
const dbPath = path.join(workspaceRoot, 'data/site.sqlite');

const db = new sqlite3.DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = OFF');

function queryAll(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function queryOne(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function execute(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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

function titleCaseFromSlug(value) {
  return String(value || '')
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
    .trim();
}

const CUSTOM_URL_NAME_MAP = new Map([
  ['/', '首页'],
  ['#top-menu', '顶部菜单'],
  ['#misc-links', '其他'],
  ['/about-us/', '关于我们'],
  ['/knowledge-exchange/', '知识中心'],
  ['/pdfs/sxs-cn-sales-and-service-terms.pdf', '销售和服务条款']
]);

const ROUTE_PATH_NAME_MAP = new Map([
  ['/contact.html', '联系我们'],
  ['/news/', '公司新闻'],
  ['/service/', '服务'],
  ['/services/audits-for-optimisation/', '蒸汽系统调研'],
  ['/services/installation-and-commissioning/', '安装调试交钥匙'],
  ['/services/repairs-and-maintenance/', '预防性维护保养'],
  ['/services/steam-quality-testing/', '蒸汽品质检测'],
  ['/services/steam-trap-surveys-and-management/', '疏水阀调研和管理'],
  ['/services/wireless-steam-trap-monitoring/', '疏水阀无线监测'],
  ['/products/', '产品']
]);

function inferNameFromLegacyKey(column) {
  const legacy = parseJson(column.legacy_extra);
  const key = String(legacy?.key || '').trim();
  if (!key) {
    return '';
  }

  if (key.startsWith('news:')) {
    const parts = key.split(':').filter(Boolean);
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

function inferNameFromPageData(column) {
  const legacy = parseJson(column.legacy_extra);
  const pageData = legacy?.page_data || {};
  return normalizeTitle(pageData.title || pageData.hero?.title || pageData.topPanel?.eyebrow || '');
}

function inferNameFromRoute(column) {
  const routePath = String(column.route_path || '').trim();
  if (ROUTE_PATH_NAME_MAP.has(routePath)) {
    return ROUTE_PATH_NAME_MAP.get(routePath) || '';
  }

  if (routePath) {
    const last = routePath.replace(/\/+$/g, '').split('/').filter(Boolean).pop() || '';
    return titleCaseFromSlug(last);
  }

  return '';
}

function inferNameFromCustomUrl(column) {
  const customUrl = String(column.custom_url || '').trim();
  if (CUSTOM_URL_NAME_MAP.has(customUrl)) {
    return CUSTOM_URL_NAME_MAP.get(customUrl) || '';
  }

  if (customUrl) {
    const last = customUrl.replace(/\/+$/g, '').split('/').filter(Boolean).pop() || '';
    return titleCaseFromSlug(last);
  }

  return '';
}

function inferSummaryFromLegacy(column) {
  const legacy = parseJson(column.legacy_extra);
  const pageData = legacy?.page_data || {};
  return stripHtml(pageData.summary || '');
}

function inferColumnTranslation(column) {
  const sourceType = String(column.source_type || '').trim();
  const name = normalizeTitle(
    inferNameFromPageData(column)
    || inferNameFromCustomUrl(column)
    || inferNameFromRoute(column)
    || inferNameFromLegacyKey(column)
    || (sourceType === 'contact_page' ? '联系我们' : '')
  );
  const summary = inferSummaryFromLegacy(column);

  return {
    name,
    summary
  };
}

const defaultLanguage = queryOne(`SELECT id, code FROM languages WHERE is_default = 1 LIMIT 1`);
if (!defaultLanguage) {
  throw new Error('Default language not found');
}

const columns = queryAll(`
  SELECT
    id,
    source_type,
    source_id,
    route_path,
    custom_url,
    dir_name,
    legacy_extra
  FROM columns
  ORDER BY id ASC
`);

let recovered = 0;
let inserted = 0;
let updated = 0;
for (const column of columns) {
  const translation = inferColumnTranslation(column);
  if (!translation.name) {
    continue;
  }

  const existing = queryOne(
    `
      SELECT
        id,
        name,
        summary
      FROM column_translations
      WHERE column_id = ?
        AND language_id = ?
      LIMIT 1
    `,
    [column.id, defaultLanguage.id]
  );

  if (!existing) {
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
        ) VALUES (?, ?, ?, ?, '', NULL, NULL, NULL, NULL, 'published', NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      [column.id, defaultLanguage.id, translation.name, translation.summary]
    );
    inserted += 1;
    recovered += 1;
    continue;
  }

  const shouldFillName = !String(existing.name || '').trim() && translation.name;
  const shouldFillSummary = !String(existing.summary || '').trim() && translation.summary;

  if (!shouldFillName && !shouldFillSummary) {
    continue;
  }

  execute(
    `
      UPDATE column_translations
      SET
        name = CASE
          WHEN trim(COALESCE(name, '')) = '' THEN ?
          ELSE name
        END,
        summary = CASE
          WHEN trim(COALESCE(summary, '')) = '' THEN ?
          ELSE summary
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [translation.name, translation.summary, existing.id]
  );
  updated += 1;
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

const unresolved = queryAll(
  `
    SELECT
      c.id,
      c.source_type,
      c.source_id,
      c.route_path,
      c.custom_url
    FROM columns c
    LEFT JOIN column_translations t
      ON t.column_id = c.id
     AND t.language_id = ?
    WHERE t.id IS NULL OR trim(COALESCE(t.name, '')) = ''
    ORDER BY c.id ASC
  `,
  [defaultLanguage.id]
);

console.log(JSON.stringify({
  recovered,
  inserted,
  updated,
  remaining,
  unresolved,
  defaultLanguage: defaultLanguage.code,
}, null, 2));
