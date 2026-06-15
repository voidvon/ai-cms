import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, hasMultipleEnabledLanguages, listLanguages } from './languages.mjs';
import { listNews } from './news.mjs';
import { listProducts, searchProducts } from './products.mjs';

const SITE_TRANSLATABLE_FIELDS = [
  'web_name',
  'company_name',
  'company_address',
  'contact_person',
  'company_email',
  'web_copyright',
  'web_author',
  'seo_default_title',
  'seo_default_description',
  'seo_home_title',
  'seo_home_description'
];

let schemaEnsured = false;

export function getSiteConfig(languageCode = null, options = {}) {
  ensureSiteConfigSchema();
  const { includeTranslations = false } = options;
  const base = getBaseSiteConfig();
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const translations = loadSiteConfigTranslations();
  const translationMap = Object.fromEntries(translations.map((item) => [item.language_code, item]));
  const selectedTranslation = translationMap[selectedLanguage.code];
  const defaultTranslation = translationMap[selectedLanguage.default_code];
  const fallbackTranslation = hasMultipleEnabledLanguages()
    ? (selectedTranslation || defaultTranslation || translations[0] || null)
    : null;
  const merged = applySiteTranslation(base, fallbackTranslation);

  return {
    ...merged,
    current_language_code: fallbackTranslation?.language_code || selectedLanguage.code,
    ...(includeTranslations ? {
      translations: Object.fromEntries(
        translations.map((item) => [
          item.language_code,
          pickTranslationFields(item)
        ])
      )
    } : {})
  };
}

export function updateSiteConfig(input) {
  ensureSiteConfigSchema();
  const existing = getSiteConfig(null, { includeTranslations: true });
  const payload = normalizeSiteConfigMutationInput(input, { existingConfig: existing });
  const defaultLanguage = getDefaultLanguage();
  const defaultTranslation = resolveDefaultTranslationPayload(payload.translations, defaultLanguage?.code);
  const basePayload = {
    ...payload.base,
    ...defaultTranslation
  };

  execute(
    `
      INSERT INTO site_config (
        id,
        web_name,
        web_url,
        company_name,
        company_address,
        postal_code,
        company_phone,
        company_fax,
        contact_person,
        company_email,
        icp_number,
        web_qq,
        web_mobile,
        web_copyright,
        web_author,
        legacy_extra
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        web_name = excluded.web_name,
        web_url = excluded.web_url,
        company_name = excluded.company_name,
        company_address = excluded.company_address,
        postal_code = excluded.postal_code,
        company_phone = excluded.company_phone,
        company_fax = excluded.company_fax,
        contact_person = excluded.contact_person,
        company_email = excluded.company_email,
        icp_number = excluded.icp_number,
        web_qq = excluded.web_qq,
        web_mobile = excluded.web_mobile,
        web_copyright = excluded.web_copyright,
        web_author = excluded.web_author,
        legacy_extra = excluded.legacy_extra
    `,
    [
      1,
      basePayload.web_name,
      basePayload.web_url,
      basePayload.company_name,
      basePayload.company_address,
      basePayload.postal_code,
      basePayload.company_phone,
      basePayload.company_fax,
      basePayload.contact_person,
      basePayload.company_email,
      basePayload.icp_number,
      basePayload.web_qq,
      basePayload.web_mobile,
      basePayload.web_copyright,
      basePayload.web_author,
      basePayload.legacy_extra
    ]
  );

  saveSiteConfigTranslations(payload.translations);
  return getSiteConfig(null, { includeTranslations: true });
}

export { listNews, listProducts, searchProducts };

function ensureSiteConfigSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS site_config_translations (
      id INTEGER PRIMARY KEY,
      site_config_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      web_name TEXT,
      company_name TEXT,
      company_address TEXT,
      contact_person TEXT,
      company_email TEXT,
      web_copyright TEXT,
      web_author TEXT,
      seo_default_title TEXT,
      seo_default_description TEXT,
      seo_home_title TEXT,
      seo_home_description TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(site_config_id, language_id),
      FOREIGN KEY (language_id) REFERENCES languages(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_site_config_translations_site_config_id
    ON site_config_translations(site_config_id, language_id);
  `);
  addColumnIfMissing('site_config_translations', 'seo_default_title', 'TEXT');
  addColumnIfMissing('site_config_translations', 'seo_default_description', 'TEXT');
  addColumnIfMissing('site_config_translations', 'seo_home_title', 'TEXT');
  addColumnIfMissing('site_config_translations', 'seo_home_description', 'TEXT');

  ensureDefaultSiteConfigTranslation();
  schemaEnsured = true;
}

function getBaseSiteConfig() {
  const base = (
    queryOne(`
      SELECT
        id,
        web_name,
        web_url,
        company_name,
        company_address,
        postal_code,
        company_phone,
        company_fax,
        contact_person,
        company_email,
        icp_number,
        web_qq,
        web_mobile,
        web_copyright,
        web_author,
        legacy_extra
      FROM site_config
      WHERE id = 1
    `) || {
      id: 1,
      web_name: 'Spirax Sarco CN',
      web_url: '',
      company_name: '',
      company_address: '',
      postal_code: '',
      company_phone: '',
      company_fax: '',
      contact_person: '',
      company_email: '',
      icp_number: '',
      web_qq: '',
      web_mobile: '',
      web_copyright: '',
      web_author: '',
      legacy_extra: null
    }
  );
  return {
    ...base,
    ...readSiteSeoBaseConfig(base.legacy_extra)
  };
}

function normalizeSiteConfigInput(input) {
  const webUrl = toNullableString(input.web_url);
  if (!webUrl) {
    throw new Error('网站地址不能为空');
  }
  if (!/^https?:\/\//i.test(webUrl)) {
    throw new Error('网站地址必须以 http:// 或 https:// 开头');
  }

  const existingLegacyExtra = parseLegacyExtra(input.legacy_extra);
  const mergedLegacyExtra = {
    ...existingLegacyExtra,
    seo: {
      ...(existingLegacyExtra.seo && typeof existingLegacyExtra.seo === 'object' ? existingLegacyExtra.seo : {}),
      default_image: toNullableString(input.seo_default_image),
      site_name: toNullableString(input.seo_site_name),
      twitter_handle: toNullableString(input.seo_twitter_handle),
      organization_name: toNullableString(input.seo_organization_name),
      same_as: normalizeMultilineList(input.seo_same_as_text),
      hreflang_links: normalizeHreflangText(input.seo_hreflang_links_text)
    }
  };

  return {
    web_name: toNullableString(input.web_name),
    web_url: webUrl,
    company_name: toNullableString(input.company_name),
    company_address: toNullableString(input.company_address),
    postal_code: toNullableString(input.postal_code),
    company_phone: toNullableString(input.company_phone),
    company_fax: toNullableString(input.company_fax),
    contact_person: toNullableString(input.contact_person),
    company_email: toNullableString(input.company_email),
    icp_number: toNullableString(input.icp_number),
    web_qq: toNullableString(input.web_qq),
    web_mobile: toNullableString(input.web_mobile),
    web_copyright: toNullableString(input.web_copyright),
    web_author: toNullableString(input.web_author),
    legacy_extra: stringifyLegacyExtra(mergedLegacyExtra),
    seo_default_image: toNullableString(input.seo_default_image),
    seo_site_name: toNullableString(input.seo_site_name),
    seo_twitter_handle: toNullableString(input.seo_twitter_handle),
    seo_organization_name: toNullableString(input.seo_organization_name),
    seo_same_as: normalizeMultilineList(input.seo_same_as_text),
    seo_same_as_text: stringifyMultilineList(normalizeMultilineList(input.seo_same_as_text)),
    seo_hreflang_links: normalizeHreflangText(input.seo_hreflang_links_text),
    seo_hreflang_links_text: stringifyHreflangList(normalizeHreflangText(input.seo_hreflang_links_text))
  };
}

function normalizeSiteConfigMutationInput(input, { existingConfig = null } = {}) {
  const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';

  if (input?.base || input?.translations) {
    const mergedBaseSource = {
      ...(existingConfig || {}),
      ...(input?.base || {})
    };
    const base = normalizeSiteConfigInput(mergedBaseSource);
    const translations = normalizeSiteConfigTranslations(input?.translations || {}, {
      defaultLanguageCode,
      existingTranslations: existingConfig?.translations || {},
      baseFallback: existingConfig || base
    });
    return { base, translations };
  }

  const legacy = normalizeSiteConfigInput({ ...(existingConfig || {}), ...(input || {}) });
  return {
    base: legacy,
    translations: {
      [defaultLanguageCode]: pickTranslationFields(legacy)
    }
  };
}

function normalizeSiteConfigTranslations(translations, {
  defaultLanguageCode,
  existingTranslations = {},
  baseFallback = {}
}) {
  const output = {};
  const knownCodes = new Set(listLanguages().map((language) => language.code));

  for (const [languageCode, value] of Object.entries(translations || {})) {
    if (!knownCodes.has(languageCode)) {
      continue;
    }
    const existing = existingTranslations?.[languageCode] || {};
    const normalized = {
      web_name: toNullableString(value?.web_name ?? existing.web_name),
      company_name: toNullableString(value?.company_name ?? existing.company_name),
      company_address: toNullableString(value?.company_address ?? existing.company_address),
      contact_person: toNullableString(value?.contact_person ?? existing.contact_person),
      company_email: toNullableString(value?.company_email ?? existing.company_email),
      web_copyright: toNullableString(value?.web_copyright ?? existing.web_copyright),
      web_author: toNullableString(value?.web_author ?? existing.web_author),
      seo_default_title: toNullableString(value?.seo_default_title ?? existing.seo_default_title),
      seo_default_description: toNullableString(value?.seo_default_description ?? existing.seo_default_description),
      seo_home_title: toNullableString(value?.seo_home_title ?? existing.seo_home_title),
      seo_home_description: toNullableString(value?.seo_home_description ?? existing.seo_home_description)
    };
    if (languageCode === defaultLanguageCode && !String(normalized.web_name || '').trim()) {
      throw new Error('默认语言的网站名称不能为空');
    }
    if (SITE_TRANSLATABLE_FIELDS.some((field) => normalized[field])) {
      output[languageCode] = normalized;
    }
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = {
      web_name: toNullableString(existingTranslations?.[defaultLanguageCode]?.web_name ?? baseFallback.web_name),
      company_name: toNullableString(existingTranslations?.[defaultLanguageCode]?.company_name ?? baseFallback.company_name),
      company_address: toNullableString(existingTranslations?.[defaultLanguageCode]?.company_address ?? baseFallback.company_address),
      contact_person: toNullableString(existingTranslations?.[defaultLanguageCode]?.contact_person ?? baseFallback.contact_person),
      company_email: toNullableString(existingTranslations?.[defaultLanguageCode]?.company_email ?? baseFallback.company_email),
      web_copyright: toNullableString(existingTranslations?.[defaultLanguageCode]?.web_copyright ?? baseFallback.web_copyright),
      web_author: toNullableString(existingTranslations?.[defaultLanguageCode]?.web_author ?? baseFallback.web_author),
      seo_default_title: toNullableString(existingTranslations?.[defaultLanguageCode]?.seo_default_title ?? baseFallback.seo_default_title),
      seo_default_description: toNullableString(existingTranslations?.[defaultLanguageCode]?.seo_default_description ?? baseFallback.seo_default_description),
      seo_home_title: toNullableString(existingTranslations?.[defaultLanguageCode]?.seo_home_title ?? baseFallback.seo_home_title),
      seo_home_description: toNullableString(existingTranslations?.[defaultLanguageCode]?.seo_home_description ?? baseFallback.seo_home_description)
    };
  }

  if (!String(output[defaultLanguageCode]?.web_name || '').trim()) {
    throw new Error('默认语言的网站名称不能为空');
  }

  return output;
}

function loadSiteConfigTranslations() {
  return queryAll(
    `
      SELECT
        t.id,
        t.site_config_id,
        t.language_id,
        l.code AS language_code,
        t.web_name,
        t.company_name,
        t.company_address,
        t.contact_person,
        t.company_email,
        t.web_copyright,
        t.web_author,
        t.seo_default_title,
        t.seo_default_description,
        t.seo_home_title,
        t.seo_home_description
      FROM site_config_translations t
      INNER JOIN languages l ON l.id = t.language_id
      WHERE t.site_config_id = 1
      ORDER BY l.sort_order ASC, l.id ASC
    `
  );
}

function saveSiteConfigTranslations(translations, now = new Date().toISOString()) {
  const languageIdByCode = new Map(listLanguages().map((language) => [language.code, language.id]));

  for (const [languageCode, translation] of Object.entries(translations || {})) {
    const languageId = languageIdByCode.get(languageCode);
    if (!languageId) {
      continue;
    }
    execute(
      `
        INSERT INTO site_config_translations (
          site_config_id,
          language_id,
          web_name,
          company_name,
          company_address,
          contact_person,
          company_email,
          web_copyright,
          web_author,
          seo_default_title,
          seo_default_description,
          seo_home_title,
          seo_home_description,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(site_config_id, language_id) DO UPDATE SET
          web_name = excluded.web_name,
          company_name = excluded.company_name,
          company_address = excluded.company_address,
          contact_person = excluded.contact_person,
          company_email = excluded.company_email,
          web_copyright = excluded.web_copyright,
          web_author = excluded.web_author,
          seo_default_title = excluded.seo_default_title,
          seo_default_description = excluded.seo_default_description,
          seo_home_title = excluded.seo_home_title,
          seo_home_description = excluded.seo_home_description,
          updated_at = excluded.updated_at
      `,
      [
        1,
        languageId,
        toNullableString(translation?.web_name),
        toNullableString(translation?.company_name),
        toNullableString(translation?.company_address),
        toNullableString(translation?.contact_person),
        toNullableString(translation?.company_email),
        toNullableString(translation?.web_copyright),
        toNullableString(translation?.web_author),
        toNullableString(translation?.seo_default_title),
        toNullableString(translation?.seo_default_description),
        toNullableString(translation?.seo_home_title),
        toNullableString(translation?.seo_home_description),
        now,
        now
      ]
    );
  }
}

function ensureDefaultSiteConfigTranslation() {
  const defaultLanguage = getDefaultLanguage();
  if (!defaultLanguage) {
    return;
  }

  const existing = queryOne(
    `
      SELECT id
      FROM site_config_translations
      WHERE site_config_id = 1
        AND language_id = ?
      LIMIT 1
    `,
    [defaultLanguage.id]
  );

  if (existing) {
    return;
  }

  const site = getBaseSiteConfig();
  const now = new Date().toISOString();
  execute(
    `
      INSERT INTO site_config_translations (
        site_config_id,
        language_id,
        web_name,
        company_name,
        company_address,
        contact_person,
        company_email,
        web_copyright,
        web_author,
        seo_default_title,
        seo_default_description,
        seo_home_title,
        seo_home_description,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      1,
      defaultLanguage.id,
      toNullableString(site.web_name),
      toNullableString(site.company_name),
      toNullableString(site.company_address),
      toNullableString(site.contact_person),
      toNullableString(site.company_email),
      toNullableString(site.web_copyright),
      toNullableString(site.web_author),
      toNullableString(site.seo_default_title),
      toNullableString(site.seo_default_description),
      toNullableString(site.seo_home_title),
      toNullableString(site.seo_home_description),
      now,
      now
    ]
  );
}

function resolveLanguageForContent(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = languages.find((item) => Number(item.is_default || 0) === 1) || languages[0] || { code: 'zh-CN' };
  const selected = languageCode
    ? languages.find((item) => item.code === languageCode)
    : defaultLanguage;

  return {
    code: selected?.code || defaultLanguage.code || 'zh-CN',
    default_code: defaultLanguage.code || 'zh-CN'
  };
}

function resolveDefaultTranslationPayload(translations, defaultLanguageCode) {
  const code = defaultLanguageCode || 'zh-CN';
  const direct = translations[code];
  if (direct?.web_name) {
    return direct;
  }
  const first = Object.values(translations).find((item) => item?.web_name);
  if (first) {
    return first;
  }
  throw new Error('至少需要提供默认语言的网站名称');
}

function applySiteTranslation(base, translation) {
  if (!translation) {
    return base;
  }

  const output = { ...base };
  for (const field of SITE_TRANSLATABLE_FIELDS) {
    if (translation[field] !== undefined && translation[field] !== null) {
      output[field] = translation[field];
    }
  }
  return output;
}

function pickTranslationFields(input) {
  return {
    web_name: toNullableString(input?.web_name),
    company_name: toNullableString(input?.company_name),
    company_address: toNullableString(input?.company_address),
    contact_person: toNullableString(input?.contact_person),
    company_email: toNullableString(input?.company_email),
    web_copyright: toNullableString(input?.web_copyright),
    web_author: toNullableString(input?.web_author),
    seo_default_title: toNullableString(input?.seo_default_title),
    seo_default_description: toNullableString(input?.seo_default_description),
    seo_home_title: toNullableString(input?.seo_home_title),
    seo_home_description: toNullableString(input?.seo_home_description)
  };
}

function readSiteSeoBaseConfig(legacyExtra) {
  const parsed = parseLegacyExtra(legacyExtra);
  const seo = parsed.seo && typeof parsed.seo === 'object' ? parsed.seo : {};
  const sameAs = Array.isArray(seo.same_as)
    ? seo.same_as.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const hreflangLinks = Array.isArray(seo.hreflang_links)
    ? seo.hreflang_links
      .map((item) => ({
        lang: toNullableString(item?.lang),
        url: toNullableString(item?.url)
      }))
      .filter((item) => item.lang && item.url)
    : [];

  return {
    seo_default_image: toNullableString(seo.default_image),
    seo_site_name: toNullableString(seo.site_name),
    seo_twitter_handle: toNullableString(seo.twitter_handle),
    seo_organization_name: toNullableString(seo.organization_name),
    seo_same_as: sameAs,
    seo_same_as_text: stringifyMultilineList(sameAs),
    seo_hreflang_links: hreflangLinks,
    seo_hreflang_links_text: stringifyHreflangList(hreflangLinks)
  };
}

function normalizeMultilineList(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function stringifyMultilineList(items) {
  return Array.isArray(items)
    ? items.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
    : '';
}

function normalizeHreflangText(value) {
  return String(value || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [langPart, ...urlParts] = line.split('|');
      const lang = String(langPart || '').trim();
      const url = String(urlParts.join('|') || '').trim();
      return {
        lang: toNullableString(lang),
        url: toNullableString(url)
      };
    })
    .filter((item) => item.lang && item.url);
}

function stringifyHreflangList(items) {
  return Array.isArray(items)
    ? items
      .map((item) => {
        const lang = String(item?.lang || '').trim();
        const url = String(item?.url || '').trim();
        return lang && url ? `${lang}|${url}` : '';
      })
      .filter(Boolean)
      .join('\n')
    : '';
}

function parseLegacyExtra(value) {
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function stringifyLegacyExtra(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const payload = { ...value };
  if (payload.seo && typeof payload.seo === 'object') {
    const seoPayload = Object.fromEntries(
      Object.entries(payload.seo).filter(([, item]) => {
        if (Array.isArray(item)) {
          return item.length > 0;
        }
        return item !== undefined && item !== null && item !== '';
      })
    );
    if (Object.keys(seoPayload).length > 0) {
      payload.seo = seoPayload;
    } else {
      delete payload.seo;
    }
  }

  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}
