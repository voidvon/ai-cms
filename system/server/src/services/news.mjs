import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, listLanguages } from './languages.mjs';
import { markMediaAssetStatusByPath } from './media-assets.mjs';
import { looksLikeLegacyMojibake } from '../utils/legacy-text.mjs';

const LEGACY_MARKETING_PATTERNS = [
  /以上内容由彪维公司[（(](?:www\.)?(?:bilwe|bilvie)\.com[）)]编写，?转载请注明文章出处。?/gi,
  /[-,，\s]*上海彪维供应[-,，\s]*中国驰名商标/gi,
  /[-,，\s]*上海彪维疏水阀/gi,
  /[,，]?\s*上海彪维专业制造/gi,
  /彪维传热介绍[，,]*/gi,
  /[,，]?\s*彪维公司始终站在蒸汽利用的历史前沿[\s\S]*$/gi
];
const DEFAULT_NEWS_IMAGE = '/UploadFile/nopicture.gif';
const LEGACY_NEWS_PLACEHOLDERS = new Set([
  DEFAULT_NEWS_IMAGE,
  '/UploadFile/Newsuppic/nopicture.gif',
]);
let schemaEnsured = false;

export function ensureNewsSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS news_translations (
      id INTEGER PRIMARY KEY,
      news_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      title TEXT,
      summary TEXT,
      content_html TEXT,
      keywords TEXT,
      seo_title TEXT,
      seo_keywords TEXT,
      seo_description TEXT,
      publish_status TEXT NOT NULL DEFAULT 'draft',
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(news_id, language_id),
      FOREIGN KEY (news_id) REFERENCES news(id) ON DELETE CASCADE,
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_news_translations_news_id ON news_translations(news_id, language_id);
    CREATE INDEX IF NOT EXISTS idx_news_translations_language_id ON news_translations(language_id, news_id);
  `);

  ensureDefaultNewsTranslations();
  schemaEnsured = true;
}

export function listNews({ limit = 20, languageCode = null } = {}) {
  ensureNewsSchema();
  const safeLimit = clampLimit(limit);
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const rows = queryAll(
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
  );

  return hydrateNews(rows, {
    languageCode: selectedLanguage.code,
    includeTranslations: false,
    includeTranslationStatuses: false
  });
}

export function listNewsAdmin({ page = 1, limit = 15, categoryId = null, includeDescendants = false, languageCode = null } = {}) {
  ensureNewsSchema();
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const safeLimit = Math.min(Math.max(Number.parseInt(String(limit), 10) || 15, 1), 200);
  const safePage = Math.max(Number.parseInt(String(page), 10) || 1, 1);
  const safeCategoryId = Number.parseInt(String(categoryId ?? ''), 10);
  const hasCategoryFilter = Number.isInteger(safeCategoryId) && safeCategoryId > 0;
  const withDescendants = Boolean(includeDescendants);
  const offset = (safePage - 1) * safeLimit;
  const categoryTree = hasCategoryFilter && withDescendants
    ? `
      WITH RECURSIVE category_tree(id) AS (
        SELECT id FROM news_categories WHERE id = ?
        UNION ALL
        SELECT child.id
        FROM news_categories child
        INNER JOIN category_tree parent ON child.parent_id = parent.id
      )
    `
    : '';
  const where = hasCategoryFilter
    ? withDescendants
      ? 'WHERE n.category_id IN (SELECT id FROM category_tree)'
      : 'WHERE n.category_id = ?'
    : '';
  const countWhere = hasCategoryFilter
    ? withDescendants
      ? 'WHERE category_id IN (SELECT id FROM category_tree)'
      : 'WHERE category_id = ?'
    : '';

  const rows = queryAll(
    `
      ${categoryTree}
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
      ${where}
      ORDER BY n.id DESC
      LIMIT ?
      OFFSET ?
    `,
    hasCategoryFilter ? [safeCategoryId, safeLimit, offset] : [safeLimit, offset]
  );

  const total = queryOne(
    `
      ${categoryTree}
      SELECT COUNT(*) AS count
      FROM news
      ${countWhere}
    `,
    hasCategoryFilter ? [safeCategoryId] : []
  )?.count || 0;
  return {
    items: hydrateNews(rows, {
      languageCode: selectedLanguage.code,
      includeTranslations: false,
      includeTranslationStatuses: true
    }),
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      totalPages: Math.max(Math.ceil(total / safeLimit), 1)
    }
  };
}

export function getNewsById(id, { languageCode = null, includeTranslations = false, includeTranslationStatuses = false } = {}) {
  ensureNewsSchema();
  const row = queryOne(
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
  );
  if (!row) {
    return null;
  }

  const selectedLanguage = resolveLanguageForContent(languageCode);
  return hydrateNews([row], {
    languageCode: selectedLanguage.code,
    includeTranslations,
    includeTranslationStatuses
  })[0] || null;
}

export function createNews(input) {
  ensureNewsSchema();
  const defaultLanguage = getDefaultLanguage();
  const payload = normalizeNewsMutationInput(input, { defaultLanguageCode: defaultLanguage?.code });
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
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
      payload.base.category_id,
      defaultTranslation.title,
      defaultTranslation.summary,
      defaultTranslation.content_html,
      payload.base.picture,
      defaultTranslation.keywords,
      payload.base.is_featured_home,
      payload.base.created_at
    ]
  );

  saveNewsTranslations(result.lastInsertRowid, payload.translations);
  const news = getNewsById(result.lastInsertRowid, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  markNewsPictureActive(news?.picture);
  return news;
}

export function updateNews(id, input) {
  ensureNewsSchema();
  const defaultLanguage = getDefaultLanguage();
  const existing = getNewsById(id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  if (!existing) {
    return null;
  }

  const payload = normalizeNewsMutationInput(input, {
    defaultLanguageCode: defaultLanguage?.code,
    existingNews: existing
  });
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
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
      payload.base.category_id,
      defaultTranslation.title,
      defaultTranslation.summary,
      defaultTranslation.content_html,
      payload.base.picture,
      defaultTranslation.keywords,
      payload.base.is_featured_home,
      payload.base.created_at,
      id
    ]
  );

  saveNewsTranslations(id, payload.translations);

  if (existing.picture !== payload.base.picture) {
    markNewsPictureOrphaned(existing.picture);
  }

  const news = getNewsById(id, {
    includeTranslations: true,
    includeTranslationStatuses: true
  });
  markNewsPictureActive(news?.picture);
  return news;
}

export function deleteNews(id) {
  ensureNewsSchema();
  const existing = getNewsById(id);
  if (!existing) {
    return null;
  }

  execute('DELETE FROM news WHERE id = ?', [id]);
  markNewsPictureOrphaned(existing.picture);
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
    picture: toNullableString(input.picture) || DEFAULT_NEWS_IMAGE,
    keywords: toNullableString(input.keywords),
    is_featured_home: toBooleanInt(input.is_featured_home),
    created_at: toNullableString(input.created_at) || new Date().toISOString()
  };
}

function normalizeNewsBaseInput(input) {
  return {
    category_id: toNullableInteger(input?.category_id),
    picture: toNullableString(input?.picture) || DEFAULT_NEWS_IMAGE,
    is_featured_home: toBooleanInt(input?.is_featured_home),
    created_at: toNullableString(input?.created_at) || new Date().toISOString()
  };
}

function normalizeNewsTranslationInput(input, { requireTitle = false } = {}) {
  const title = String(input?.title ?? '').trim();
  if (requireTitle && !title) {
    throw new Error('默认语言的新闻标题不能为空');
  }

  return {
    title,
    summary: toNullableString(input?.summary),
    content_html: toNullableString(input?.content_html),
    keywords: toNullableString(input?.keywords),
    publish_status: normalizePublishStatus(input?.publish_status),
    seo_title: toNullableString(input?.seo_title),
    seo_keywords: toNullableString(input?.seo_keywords),
    seo_description: toNullableString(input?.seo_description)
  };
}

function normalizeNewsMutationInput(input, { defaultLanguageCode = 'zh-CN', existingNews = null } = {}) {
  if (input?.base || input?.translations) {
    const base = normalizeNewsBaseInput({ ...(existingNews || {}), ...(input.base || {}) });
    const translations = normalizeTranslationsMap(input.translations || {}, {
      defaultLanguageCode,
      existingTranslations: existingNews?.translations || {}
    });
    return { base, translations };
  }

  const base = normalizeNewsBaseInput({ ...(existingNews || {}), ...(input || {}) });
  const translation = normalizeNewsTranslationInput(
    { ...(existingNews || {}), ...(input || {}) },
    { requireTitle: true }
  );

  return {
    base,
    translations: {
      [defaultLanguageCode]: translation
    }
  };
}

function normalizeTranslationsMap(translations, { defaultLanguageCode, existingTranslations = {} }) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const normalized = normalizeNewsTranslationInput(
      { ...(existingTranslations?.[languageCode] || {}), ...(value || {}) },
      { requireTitle: languageCode === defaultLanguageCode }
    );
    if (hasAnyTranslationValue(normalized)) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    const fallbackSource = existingTranslations?.[defaultLanguageCode] || {};
    output[defaultLanguageCode] = normalizeNewsTranslationInput(fallbackSource, { requireTitle: true });
  }

  return output;
}

function resolveDefaultTranslationPayload(translations, defaultLanguageCode) {
  const defaultCode = defaultLanguageCode || 'zh-CN';
  const direct = translations[defaultCode];
  if (direct) {
    return direct;
  }
  const first = Object.values(translations)[0];
  if (first?.title) {
    return first;
  }
  throw new Error('至少需要提供默认语言的新闻标题');
}

function clampLimit(limit) {
  return Math.min(Math.max(Number.parseInt(String(limit), 10) || 20, 1), 10000);
}

function markNewsPictureActive(relativePath) {
  if (!isManagedNewsPicture(relativePath)) {
    return;
  }
  markMediaAssetStatusByPath(relativePath, 'active');
}

function markNewsPictureOrphaned(relativePath) {
  if (!isManagedNewsPicture(relativePath)) {
    return;
  }
  markMediaAssetStatusByPath(relativePath, 'orphaned');
}

function isManagedNewsPicture(relativePath) {
  const normalizedPath = String(relativePath || '').trim();
  return normalizedPath !== '' && !LEGACY_NEWS_PLACEHOLDERS.has(normalizedPath);
}

function normalizeNewsRecord(row) {
  if (!row) {
    return row;
  }

  return {
    ...row,
    title: resolveNewsTitle(row),
    keywords: resolveNewsKeywords(row),
    summary: resolveNewsSummary(row)
  };
}

function resolveNewsTitle(row) {
  const title = normalizePlainText(row.title);
  if (title && !looksLikeLegacyMojibake(row.title)) {
    return title;
  }
  return title || String(row.title || '').trim();
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

function resolveNewsKeywords(row) {
  const keywords = normalizePlainText(row.keywords);
  if (keywords && !looksLikeLegacyMojibake(row.keywords)) {
    return keywords;
  }
  return resolveNewsTitle(row);
}

function hydrateNews(rows, {
  languageCode,
  includeTranslations = false,
  includeTranslationStatuses = false
} = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const newsIds = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0);
  const translationsByNewsId = loadTranslationsByNewsIds(newsIds);
  const selectedLanguage = resolveLanguageForContent(languageCode);

  return rows.map((row) => {
    const normalized = normalizeNewsRecord(row);
    const translations = translationsByNewsId.get(Number(row.id)) || [];
    const translationMap = Object.fromEntries(
      translations.map((translation) => [translation.language_code, translation])
    );
    const selectedTranslation = translationMap[selectedLanguage.code];
    const defaultTranslation = translationMap[selectedLanguage.default_code];
    const fallbackTranslation = selectedTranslation || defaultTranslation || translations[0] || null;
    const merged = applyNewsTranslation(normalized, fallbackTranslation);

    return {
      ...merged,
      current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
      ...(includeTranslations ? { translations: mapTranslationsForApi(translationMap) } : {}),
      ...(includeTranslationStatuses ? { translation_statuses: buildTranslationStatuses(translations) } : {})
    };
  });
}

function loadTranslationsByNewsIds(newsIds) {
  if (!newsIds.length) {
    return new Map();
  }

  const placeholders = newsIds.map(() => '?').join(', ');
  const rows = queryAll(
    `
      SELECT
        nt.id,
        nt.news_id,
        nt.language_id,
        l.code AS language_code,
        nt.title,
        nt.summary,
        nt.content_html,
        nt.keywords,
        nt.seo_title,
        nt.seo_keywords,
        nt.seo_description,
        nt.publish_status,
        nt.published_at,
        nt.created_at,
        nt.updated_at
      FROM news_translations nt
      INNER JOIN languages l ON l.id = nt.language_id
      WHERE nt.news_id IN (${placeholders})
      ORDER BY nt.news_id ASC, l.sort_order ASC, l.id ASC
    `,
    newsIds
  );

  const map = new Map();
  for (const row of rows) {
    const list = map.get(Number(row.news_id)) || [];
    list.push({
      id: Number(row.id),
      news_id: Number(row.news_id),
      language_id: Number(row.language_id),
      language_code: row.language_code,
      title: row.title || '',
      summary: row.summary || '',
      content_html: row.content_html || '',
      keywords: row.keywords || '',
      seo_title: row.seo_title || '',
      seo_keywords: row.seo_keywords || '',
      seo_description: row.seo_description || '',
      publish_status: normalizePublishStatus(row.publish_status),
      published_at: row.published_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
    map.set(Number(row.news_id), list);
  }
  return map;
}

function applyNewsTranslation(news, translation) {
  if (!translation) {
    return news;
  }

  return {
    ...news,
    title: translation.title || news.title,
    summary: translation.summary || news.summary,
    content_html: translation.content_html || news.content_html,
    keywords: translation.keywords || news.keywords
  };
}

function mapTranslationsForApi(translationMap) {
  return Object.fromEntries(
    Object.entries(translationMap).map(([languageCode, translation]) => [
      languageCode,
      {
        title: translation.title || '',
        summary: translation.summary || '',
        content_html: translation.content_html || '',
        keywords: translation.keywords || '',
        seo_title: translation.seo_title || '',
        seo_keywords: translation.seo_keywords || '',
        seo_description: translation.seo_description || '',
        publish_status: normalizePublishStatus(translation.publish_status),
        published_at: translation.published_at || null
      }
    ])
  );
}

function buildTranslationStatuses(translations) {
  return translations.map((translation) => ({
    language_code: translation.language_code,
    publish_status: normalizePublishStatus(translation.publish_status),
    published_at: translation.published_at || null,
    has_content: translation.title.trim() !== '' || translation.summary.trim() !== '' || translation.content_html.trim() !== ''
  }));
}

function saveNewsTranslations(newsId, translations, now = new Date().toISOString()) {
  const defaultLanguageCode = getDefaultLanguage()?.code;
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }

    const normalized = normalizeNewsTranslationInput(translation, {
      requireTitle: languageCode === defaultLanguageCode
    });
    const publishedAt = normalized.publish_status === 'published'
      ? (translation?.published_at || now)
      : null;

    execute(
      `
        INSERT INTO news_translations (
          news_id,
          language_id,
          title,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(news_id, language_id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          content_html = excluded.content_html,
          keywords = excluded.keywords,
          seo_title = excluded.seo_title,
          seo_keywords = excluded.seo_keywords,
          seo_description = excluded.seo_description,
          publish_status = excluded.publish_status,
          published_at = excluded.published_at,
          updated_at = excluded.updated_at
      `,
      [
        newsId,
        languageId,
        normalized.title || '',
        normalized.summary,
        normalized.content_html,
        normalized.keywords,
        normalized.seo_title,
        normalized.seo_keywords,
        normalized.seo_description,
        normalized.publish_status,
        publishedAt,
        now,
        now
      ]
    );
  }
}

function ensureDefaultNewsTranslations() {
  const defaultLanguage = getDefaultLanguage();
  if (!defaultLanguage) {
    return;
  }

  execute(
    `
      INSERT INTO news_translations (
        news_id,
        language_id,
        title,
        summary,
        content_html,
        keywords,
        publish_status,
        published_at,
        created_at,
        updated_at
      )
      SELECT
        n.id,
        ?,
        coalesce(n.title, ''),
        n.summary,
        n.content_html,
        n.keywords,
        'published',
        n.created_at,
        coalesce(n.created_at, CURRENT_TIMESTAMP),
        coalesce(n.created_at, CURRENT_TIMESTAMP)
      FROM news n
      WHERE NOT EXISTS (
        SELECT 1
        FROM news_translations nt
        WHERE nt.news_id = n.id
          AND nt.language_id = ?
      )
    `,
    [defaultLanguage.id, defaultLanguage.id]
  );
}

function resolveLanguageForContent(languageCode) {
  const defaultLanguage = getDefaultLanguage();
  const fallbackCode = defaultLanguage?.code || 'zh-CN';
  const code = String(languageCode || '').trim() || fallbackCode;

  return {
    code,
    default_code: fallbackCode
  };
}

function normalizePublishStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'published' ? 'published' : 'draft';
}

function hasAnyTranslationValue(translation) {
  return Boolean(
    String(translation?.title || '').trim()
    || String(translation?.summary || '').trim()
    || String(translation?.content_html || '').trim()
    || String(translation?.keywords || '').trim()
    || String(translation?.seo_title || '').trim()
    || String(translation?.seo_keywords || '').trim()
    || String(translation?.seo_description || '').trim()
  );
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
