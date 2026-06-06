import { execute, queryAll, queryOne } from '../db.mjs';
import { deleteUploadedFile } from './uploads.mjs';
import { looksLikeLegacyMojibake } from '../utils/legacy-text.mjs';

const LEGACY_MARKETING_PATTERNS = [
  /以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?/gi,
  /[-,，\s]*上海彪维供应[-,，\s]*中国驰名商标/gi,
  /[-,，\s]*上海彪维疏水阀/gi,
  /[,，]?\s*上海彪维专业制造/gi,
  /彪维传热介绍[，,]*/gi,
  /[,，]?\s*彪维公司始终站在蒸汽利用的历史前沿[\s\S]*$/gi
];

export function listNews({ limit = 20 } = {}) {
  const safeLimit = clampLimit(limit);
  return queryAll(
    `
      SELECT
        id,
        category_id,
        title,
        summary,
        content_html,
        picture,
        keywords,
        is_featured_home,
        created_at
      FROM news
      ORDER BY coalesce(created_at, '') DESC, id DESC
      LIMIT ?
    `,
    [safeLimit]
  ).map(normalizeNewsRecord);
}

export function listNewsAdmin({ page = 1, limit = 15 } = {}) {
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 15, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const items = queryAll(
    `
      SELECT
        n.id,
        n.category_id,
        n.title,
        n.summary,
        n.content_html,
        n.picture,
        n.keywords,
        n.is_featured_home,
        n.created_at,
        c.name AS category_name
      FROM news n
      LEFT JOIN news_categories c ON c.id = n.category_id
      ORDER BY n.id DESC
      LIMIT ?
      OFFSET ?
    `,
    [safeLimit, offset]
  ).map(normalizeNewsRecord);

  const total = queryOne('SELECT COUNT(*) AS count FROM news')?.count || 0;
  return {
    items,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getNewsById(id) {
  return normalizeNewsRecord(queryOne(
    `
      SELECT
        id,
        category_id,
        title,
        summary,
        content_html,
        picture,
        keywords,
        is_featured_home,
        created_at
      FROM news
      WHERE id = ?
    `,
    [id]
  ));
}

export function createNews(input) {
  const payload = normalizeNewsInput(input);
  const result = execute(
    `
      INSERT INTO news (
        category_id,
        title,
        summary,
        content_html,
        picture,
        keywords,
        is_featured_home,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.category_id,
      payload.title,
      payload.summary,
      payload.content_html,
      payload.picture,
      payload.keywords,
      payload.is_featured_home,
      payload.created_at
    ]
  );

  return getNewsById(result.lastInsertRowid);
}

export function updateNews(id, input) {
  const existing = getNewsById(id);
  if (!existing) {
    return null;
  }

  const payload = normalizeNewsInput({ ...existing, ...input });
  execute(
    `
      UPDATE news
      SET
        category_id = ?,
        title = ?,
        summary = ?,
        content_html = ?,
        picture = ?,
        keywords = ?,
        is_featured_home = ?,
        created_at = ?
      WHERE id = ?
    `,
    [
      payload.category_id,
      payload.title,
      payload.summary,
      payload.content_html,
      payload.picture,
      payload.keywords,
      payload.is_featured_home,
      payload.created_at,
      id
    ]
  );

  if (existing.picture !== payload.picture &&
    existing.picture &&
    existing.picture !== '/UploadFile/nopicture.gif' &&
    existing.picture !== '/UploadFile/Newsuppic/nopicture.gif') {
    deleteUploadedFile(existing.picture);
  }

  return getNewsById(id);
}

export function deleteNews(id) {
  const existing = getNewsById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM news WHERE id = ?', [id]);
  if (existing.picture && existing.picture !== '/UploadFile/nopicture.gif' && existing.picture !== '/UploadFile/Newsuppic/nopicture.gif') {
    deleteUploadedFile(existing.picture);
  }
  return existing;
}

export function normalizeNewsInput(input) {
  const title = String(input.title ?? '').trim();
  if (!title) {
    throw new Error('title is required');
  }

  return {
    category_id: toNullableInteger(input.category_id),
    title,
    summary: toNullableString(input.summary),
    content_html: toNullableString(input.content_html),
    picture: toNullableString(input.picture) || '/UploadFile/nopicture.gif',
    keywords: toNullableString(input.keywords),
    is_featured_home: toBooleanInt(input.is_featured_home),
    created_at: toNullableString(input.created_at) || new Date().toISOString()
  };
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

function normalizeNewsRecord(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    summary: resolveNewsSummary(row)
  };
}

function resolveNewsSummary(row) {
  const summary = normalizePlainText(row.summary);
  if (summary && !looksLikeLegacyMojibake(row.summary)) {
    return truncateSummary(summary);
  }

  const keywords = normalizePlainText(row.keywords);
  if (keywords && !looksLikeLegacyMojibake(row.keywords)) {
    return truncateSummary(keywords);
  }

  if (!looksLikeLegacyMojibake(row.content_html)) {
    const contentSummary = extractHtmlPlainText(row.content_html);
    if (contentSummary) {
      return truncateSummary(contentSummary);
    }
  }

  return truncateSummary(normalizePlainText(row.title));
}

function extractHtmlPlainText(value) {
  const normalized = normalizePlainText(
    String(value || '')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/p>/gi, ' ')
      .replace(/<\/div>/gi, ' ')
      .replace(/<\/li>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  );
  return normalized;
}

function normalizePlainText(value) {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return stripLegacyMarketingText(normalized);
}

function truncateSummary(value, maxLength = 220) {
  if (!value) {
    return null;
  }
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function stripLegacyMarketingText(value) {
  let output = String(value || '');
  for (const pattern of LEGACY_MARKETING_PATTERNS) {
    output = output.replace(pattern, ' ');
  }
  return output
    .replace(/^\s*[-|,，]+\s*/g, '')
    .replace(/\s*[-|,，]+\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function toNullableInteger(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return null;
  }
  const parsed = Number.parseInt(String(value), 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function toBooleanInt(value, fallback = 0) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return 1;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return 0;
  }
  return fallback;
}
