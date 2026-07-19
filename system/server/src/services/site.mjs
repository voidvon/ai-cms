import { HOST, PORT } from '../config.mjs';
import { execute, getDb, queryAll, queryOne } from '../db.mjs';
import { ensureLanguagesSchema, getDefaultLanguage, getFallbackLanguage, hasMultipleEnabledLanguages, listLanguages } from './languages.mjs';
import { normalizeTemplateDataAssetsDeep } from './template-data-assets.mjs';
import { resolveRuntimeAssetBaseUrl } from './uploads.mjs';
import {
  cleanupSupersededSiteIconFiles,
  prepareSiteIconConfig
} from './site-icons.mjs';

const SITE_TRANSLATABLE_FIELDS = [
  'web_name',
  'company_name',
  'company_address',
  'postal_code',
  'company_phone',
  'company_fax',
  'contact_person',
  'company_email',
  'web_qq',
  'web_mobile',
  'seo_default_title',
  'seo_default_description',
  'seo_home_title',
  'seo_home_description',
  'template_data_json'
];

const SITE_REQUIRED_BASE_COLUMNS = [
  'web_name',
  'web_url',
  'company_name',
  'company_address',
  'postal_code',
  'company_phone',
  'company_fax',
  'contact_person',
  'company_email',
  'icp_number',
  'web_qq',
  'web_mobile',
  'assets_bind_host',
  'assets_port',
  'assets_public_base_url',
  'favicon_source_path',
  'favicon_manifest_json'
];

let schemaEnsured = false;

export function getSiteConfig(languageCode = null, options = {}) {
  ensureSiteConfigSchema();
  const { includeTranslations = false } = options;
  const base = getBaseSiteConfig();
  const selectedLanguage = resolveLanguageForContent(languageCode);
  const translations = loadSiteConfigTranslations();
  const translationOutput = Object.fromEntries(
    translations.map((item) => [
      item.language_code,
      {
        ...pickTranslationFields(item),
        template_data: parseSiteTemplateDataJson(item.template_data_json)
      }
    ])
  );
  const translationMap = Object.fromEntries(translations.map((item) => [item.language_code, item]));
  const selectedTranslation = translationMap[selectedLanguage.code];
  const fallbackTranslation = translationMap[selectedLanguage.fallback_code] || null;
  const translationResolution = resolveSiteTranslation(selectedTranslation, fallbackTranslation);
  const merged = applySiteTranslation(base, translationResolution.translation);
  const resolvedLanguageCode = selectedTranslation?.language_code || fallbackTranslation?.language_code || selectedLanguage.code;
  const requestedLanguageCode = selectedLanguage.code;
  const usedFallback = translationResolution.fallback_fields.length > 0 || !selectedTranslation;

  const output = {
    ...merged,
    current_language_code: resolvedLanguageCode,
    requested_language_code: requestedLanguageCode,
    resolved_language_code: resolvedLanguageCode,
    fallback_language_code: usedFallback ? selectedLanguage.fallback_code : null,
    fallback_fields: translationResolution.fallback_fields,
    is_language_fallback: usedFallback,
    ...(includeTranslations ? {
      translations: translationOutput
    } : {})
  };

  const siteUrl = resolveSiteBaseUrl(output, selectedLanguage.code);
  return {
    ...output,
    template_data: parseSiteTemplateDataJson(output.template_data_json),
    base_web_url: normalizeAbsoluteUrl(base.web_url) || '',
    web_url: siteUrl || output.web_url || '',
    resolved_web_url: siteUrl || '',
    runtime_assets_base_url: resolveRuntimeAssetBaseUrl(output),
    language_site_host: resolveLanguageSiteHost(selectedLanguage.code),
    language_site_path_prefix: selectedLanguage?.site?.path_prefix || '/',
    language_site_mode: selectedLanguage?.site?.site_mode || 'subdir'
  };
}

export function resolveLanguageSitePublicBaseUrl(languageCode, fallbackWebUrl = '') {
  return resolveLanguageSiteBaseUrl(languageCode, fallbackWebUrl);
}

export function normalizeLanguageSitePathPrefix(value) {
  return normalizePathPrefix(value);
}

export function prefixLanguageSitePath(url, pathPrefix, options = {}) {
  const value = String(url || '').trim();
  if (!value || !value.startsWith('/')) {
    return value;
  }

  const normalizedPrefix = normalizeLanguageSitePathPrefix(pathPrefix);
  if (normalizedPrefix === '/') {
    return value;
  }

  if (/^\/(?:uploads|pdfs)\//i.test(value)) {
    return value;
  }
  if (!options.allowAssets && /^\/(?:assets|css|img|images|skin|favicon\.ico|apple-touch-icon\.png|favicon-16x16\.png|favicon-32x32\.png|site\.webmanifest|safari-pinned-tab\.svg|browserconfig\.xml|logo\.svg)/i.test(value)) {
    return value;
  }
  if (!options.allowApi && /^\/(?:api|admin)\b/i.test(value)) {
    return value;
  }
  if (value === normalizedPrefix || value.startsWith(`${normalizedPrefix}/`)) {
    return value;
  }

  return value === '/'
    ? `${normalizedPrefix}/`
    : `${normalizedPrefix}${value}`;
}

export async function updateSiteConfig(input) {
  ensureSiteConfigSchema();
  const existing = getSiteConfig(null, { includeTranslations: true });
  const payload = normalizeSiteConfigMutationInput(input, { existingConfig: existing });
  const siteIcon = await prepareSiteIconConfig(
    payload.base.favicon_source_path,
    existing.favicon_manifest_json
  );
  payload.base.favicon_source_path = siteIcon.sourcePath;
  payload.base.favicon_manifest_json = siteIcon.manifestJson;
  const fallbackLanguage = getFallbackLanguage() || getDefaultLanguage();
  const fallbackTranslation = resolveFallbackTranslationPayload(payload.translations, fallbackLanguage?.code);
  const basePayload = {
    ...payload.base,
    ...fallbackTranslation
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
        assets_bind_host,
        assets_port,
        assets_public_base_url,
        favicon_source_path,
        favicon_manifest_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        assets_bind_host = excluded.assets_bind_host,
        assets_port = excluded.assets_port,
        assets_public_base_url = excluded.assets_public_base_url,
        favicon_source_path = excluded.favicon_source_path,
        favicon_manifest_json = excluded.favicon_manifest_json
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
      basePayload.assets_bind_host,
      basePayload.assets_port,
      basePayload.assets_public_base_url,
      basePayload.favicon_source_path,
      basePayload.favicon_manifest_json
    ]
  );

  saveSiteConfigTranslations(payload.translations);
  cleanupSupersededSiteIconFiles(existing.favicon_manifest_json, basePayload.favicon_manifest_json);
  return getSiteConfig(null, { includeTranslations: true });
}

function ensureSiteConfigSchema() {
  if (schemaEnsured) {
    return;
  }

  ensureLanguagesSchema();
  ensureSiteConfigTableSchema();
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS site_config_translations (
      id INTEGER PRIMARY KEY,
      site_config_id INTEGER NOT NULL,
      language_id INTEGER NOT NULL,
      web_name TEXT,
      company_name TEXT,
      company_address TEXT,
      postal_code TEXT,
      company_phone TEXT,
      company_fax TEXT,
      contact_person TEXT,
      company_email TEXT,
      web_qq TEXT,
      web_mobile TEXT,
      seo_default_title TEXT,
      seo_default_description TEXT,
      seo_home_title TEXT,
      seo_home_description TEXT,
      template_data_json TEXT,
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
  addColumnIfMissing('site_config_translations', 'template_data_json', 'TEXT');
  addColumnIfMissing('site_config_translations', 'postal_code', 'TEXT');
  addColumnIfMissing('site_config_translations', 'company_phone', 'TEXT');
  addColumnIfMissing('site_config_translations', 'company_fax', 'TEXT');
  addColumnIfMissing('site_config_translations', 'web_qq', 'TEXT');
  addColumnIfMissing('site_config_translations', 'web_mobile', 'TEXT');
  dropColumnIfExists('site_config_translations', 'web_copyright');
  dropColumnIfExists('site_config_translations', 'web_author');

  ensureFallbackSiteConfigTranslation();
  schemaEnsured = true;
}

function ensureSiteConfigTableSchema() {
  getDb().exec(`
    CREATE TABLE IF NOT EXISTS site_config (
      id INTEGER PRIMARY KEY,
      web_name TEXT,
      web_url TEXT,
      company_name TEXT,
      company_address TEXT,
      postal_code TEXT,
      company_phone TEXT,
      company_fax TEXT,
      contact_person TEXT,
      company_email TEXT,
      icp_number TEXT,
      web_qq TEXT,
      web_mobile TEXT,
      assets_bind_host TEXT,
      assets_port INTEGER,
      assets_public_base_url TEXT,
      favicon_source_path TEXT,
      favicon_manifest_json TEXT
    );
  `);

  addColumnIfMissing('site_config', 'assets_bind_host', 'TEXT');
  addColumnIfMissing('site_config', 'assets_port', 'INTEGER');
  addColumnIfMissing('site_config', 'assets_public_base_url', 'TEXT');
  addColumnIfMissing('site_config', 'favicon_source_path', 'TEXT');
  addColumnIfMissing('site_config', 'favicon_manifest_json', 'TEXT');
  dropColumnIfExists('site_config', 'web_copyright');
  dropColumnIfExists('site_config', 'web_author');

  const requiredColumns = SITE_REQUIRED_BASE_COLUMNS;
  const columnNames = new Set(queryAll('PRAGMA table_info(site_config)').map((column) => String(column.name || '')));
  const missingColumns = requiredColumns.filter((columnName) => !columnNames.has(columnName));
  if (missingColumns.length > 0) {
    throw new Error(`site_config 表缺少字段：${missingColumns.join(', ')}`);
  }
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
        assets_bind_host,
        assets_port,
        assets_public_base_url,
        favicon_source_path,
        favicon_manifest_json
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
      assets_bind_host: HOST,
      assets_port: null,
      assets_public_base_url: '',
      favicon_source_path: null,
      favicon_manifest_json: null
    }
  );
  return base;
}

function normalizeSiteConfigInput(input) {
  const webUrl = toNullableString(input.web_url);
  if (!webUrl) {
    throw new Error('网站地址不能为空');
  }
  if (!/^https?:\/\//i.test(webUrl)) {
    throw new Error('网站地址必须以 http:// 或 https:// 开头');
  }

  const assetsPort = normalizeOptionalPort(input.assets_port);
  const assetsPublicBaseUrl = normalizeOptionalPublicBaseUrl(input.assets_public_base_url);
  const assetsBindHost = toNullableString(input.assets_bind_host) || HOST;

  if (assetsPort != null && assetsPort === PORT) {
    throw new Error(`资源服务端口不能与主站端口重复：${PORT}`);
  }

  const standalonePortUsed = listLanguages().some((language) => (
    Number(language?.is_enabled || 0) === 1
    && String(language?.site?.site_mode || '') === 'standalone'
    && Number(language?.site?.access_port || 0) === assetsPort
  ));
  if (assetsPort != null && standalonePortUsed) {
    throw new Error(`资源服务端口已被独立站点占用：${assetsPort}`);
  }

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
    assets_bind_host: assetsBindHost,
    assets_port: assetsPort,
    assets_public_base_url: assetsPublicBaseUrl,
    favicon_source_path: toNullableString(input.favicon_source_path),
    favicon_manifest_json: toNullableString(input.favicon_manifest_json)
  };
}

function normalizeSiteConfigMutationInput(input, { existingConfig = null } = {}) {
  const fallbackLanguageCode = (getFallbackLanguage() || getDefaultLanguage())?.code || 'zh-CN';

  if (input?.base || input?.translations) {
    const mergedBaseSource = {
      ...(existingConfig || {}),
      ...(input?.base || {})
    };
    const base = normalizeSiteConfigInput(mergedBaseSource);
    const translations = normalizeSiteConfigTranslations(input?.translations || {}, {
      fallbackLanguageCode,
      existingTranslations: existingConfig?.translations || {},
      baseFallback: existingConfig || base
    });
    return { base, translations };
  }

  const legacy = normalizeSiteConfigInput({ ...(existingConfig || {}), ...(input || {}) });
  return {
    base: legacy,
    translations: {
      [fallbackLanguageCode]: pickTranslationFields(legacy)
    }
  };
}

function normalizeSiteConfigTranslations(translations, {
  fallbackLanguageCode,
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
      postal_code: toNullableString(value?.postal_code ?? existing.postal_code),
      company_phone: toNullableString(value?.company_phone ?? existing.company_phone),
      company_fax: toNullableString(value?.company_fax ?? existing.company_fax),
      contact_person: toNullableString(value?.contact_person ?? existing.contact_person),
      company_email: toNullableString(value?.company_email ?? existing.company_email),
      web_qq: toNullableString(value?.web_qq ?? existing.web_qq),
      web_mobile: toNullableString(value?.web_mobile ?? existing.web_mobile),
      seo_default_title: toNullableString(value?.seo_default_title ?? existing.seo_default_title),
      seo_default_description: toNullableString(value?.seo_default_description ?? existing.seo_default_description),
      seo_home_title: toNullableString(value?.seo_home_title ?? existing.seo_home_title),
      seo_home_description: toNullableString(value?.seo_home_description ?? existing.seo_home_description),
      template_data_json: normalizeSiteTemplateDataJson(value?.template_data_json ?? existing.template_data_json)
    };
    if (languageCode === fallbackLanguageCode && !String(normalized.web_name || '').trim()) {
      throw new Error('兜底语言的网站名称不能为空');
    }
    if (SITE_TRANSLATABLE_FIELDS.some((field) => normalized[field])) {
      output[languageCode] = normalized;
    }
  }

  if (!output[fallbackLanguageCode]) {
    output[fallbackLanguageCode] = {
      web_name: toNullableString(existingTranslations?.[fallbackLanguageCode]?.web_name ?? baseFallback.web_name),
      company_name: toNullableString(existingTranslations?.[fallbackLanguageCode]?.company_name ?? baseFallback.company_name),
      company_address: toNullableString(existingTranslations?.[fallbackLanguageCode]?.company_address ?? baseFallback.company_address),
      postal_code: toNullableString(existingTranslations?.[fallbackLanguageCode]?.postal_code ?? baseFallback.postal_code),
      company_phone: toNullableString(existingTranslations?.[fallbackLanguageCode]?.company_phone ?? baseFallback.company_phone),
      company_fax: toNullableString(existingTranslations?.[fallbackLanguageCode]?.company_fax ?? baseFallback.company_fax),
      contact_person: toNullableString(existingTranslations?.[fallbackLanguageCode]?.contact_person ?? baseFallback.contact_person),
      company_email: toNullableString(existingTranslations?.[fallbackLanguageCode]?.company_email ?? baseFallback.company_email),
      web_qq: toNullableString(existingTranslations?.[fallbackLanguageCode]?.web_qq ?? baseFallback.web_qq),
      web_mobile: toNullableString(existingTranslations?.[fallbackLanguageCode]?.web_mobile ?? baseFallback.web_mobile),
      seo_default_title: toNullableString(existingTranslations?.[fallbackLanguageCode]?.seo_default_title ?? baseFallback.seo_default_title),
      seo_default_description: toNullableString(existingTranslations?.[fallbackLanguageCode]?.seo_default_description ?? baseFallback.seo_default_description),
      seo_home_title: toNullableString(existingTranslations?.[fallbackLanguageCode]?.seo_home_title ?? baseFallback.seo_home_title),
      seo_home_description: toNullableString(existingTranslations?.[fallbackLanguageCode]?.seo_home_description ?? baseFallback.seo_home_description),
      template_data_json: normalizeSiteTemplateDataJson(existingTranslations?.[fallbackLanguageCode]?.template_data_json ?? null)
    };
  }

  if (!String(output[fallbackLanguageCode]?.web_name || '').trim()) {
    throw new Error('兜底语言的网站名称不能为空');
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
        t.postal_code,
        t.company_phone,
        t.company_fax,
        t.contact_person,
        t.company_email,
        t.web_qq,
        t.web_mobile,
        t.seo_default_title,
        t.seo_default_description,
        t.seo_home_title,
        t.seo_home_description,
        t.template_data_json
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
          postal_code,
          company_phone,
          company_fax,
          contact_person,
          company_email,
          web_qq,
          web_mobile,
          seo_default_title,
          seo_default_description,
          seo_home_title,
          seo_home_description,
          template_data_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(site_config_id, language_id) DO UPDATE SET
          web_name = excluded.web_name,
          company_name = excluded.company_name,
          company_address = excluded.company_address,
          postal_code = excluded.postal_code,
          company_phone = excluded.company_phone,
          company_fax = excluded.company_fax,
          contact_person = excluded.contact_person,
          company_email = excluded.company_email,
          web_qq = excluded.web_qq,
          web_mobile = excluded.web_mobile,
          seo_default_title = excluded.seo_default_title,
          seo_default_description = excluded.seo_default_description,
          seo_home_title = excluded.seo_home_title,
          seo_home_description = excluded.seo_home_description,
          template_data_json = excluded.template_data_json,
          updated_at = excluded.updated_at
      `,
      [
        1,
        languageId,
        toNullableString(translation?.web_name),
        toNullableString(translation?.company_name),
        toNullableString(translation?.company_address),
        toNullableString(translation?.postal_code),
        toNullableString(translation?.company_phone),
        toNullableString(translation?.company_fax),
        toNullableString(translation?.contact_person),
        toNullableString(translation?.company_email),
        toNullableString(translation?.web_qq),
        toNullableString(translation?.web_mobile),
        toNullableString(translation?.seo_default_title),
        toNullableString(translation?.seo_default_description),
        toNullableString(translation?.seo_home_title),
        toNullableString(translation?.seo_home_description),
        normalizeSiteTemplateDataJson(translation?.template_data_json),
        now,
        now
      ]
    );
  }
}

function ensureFallbackSiteConfigTranslation() {
  const fallbackLanguage = getFallbackLanguage() || getDefaultLanguage();
  if (!fallbackLanguage) {
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
    [fallbackLanguage.id]
  );

  const site = getBaseSiteConfig();
  const now = new Date().toISOString();
  if (existing) {
    execute(
      `
        UPDATE site_config_translations
        SET
          postal_code = COALESCE(postal_code, ?),
          company_phone = COALESCE(company_phone, ?),
          company_fax = COALESCE(company_fax, ?),
          web_qq = COALESCE(web_qq, ?),
          web_mobile = COALESCE(web_mobile, ?)
        WHERE id = ?
      `,
      [
        toNullableString(site.postal_code),
        toNullableString(site.company_phone),
        toNullableString(site.company_fax),
        toNullableString(site.web_qq),
        toNullableString(site.web_mobile),
        existing.id
      ]
    );
    return;
  }

  execute(
    `
      INSERT INTO site_config_translations (
        site_config_id,
        language_id,
        web_name,
        company_name,
        company_address,
        postal_code,
        company_phone,
        company_fax,
        contact_person,
        company_email,
        web_qq,
        web_mobile,
        seo_default_title,
        seo_default_description,
        seo_home_title,
        seo_home_description,
        template_data_json,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      1,
      fallbackLanguage.id,
      toNullableString(site.web_name),
      toNullableString(site.company_name),
      toNullableString(site.company_address),
      toNullableString(site.postal_code),
      toNullableString(site.company_phone),
      toNullableString(site.company_fax),
      toNullableString(site.contact_person),
      toNullableString(site.company_email),
      toNullableString(site.web_qq),
      toNullableString(site.web_mobile),
      toNullableString(site.seo_default_title),
      toNullableString(site.seo_default_description),
      toNullableString(site.seo_home_title),
      toNullableString(site.seo_home_description),
      normalizeSiteTemplateDataJson(site.template_data_json),
      now,
      now
    ]
  );
}

function resolveLanguageForContent(languageCode) {
  const languages = listLanguages();
  const defaultLanguage = languages.find((item) => Number(item.is_default || 0) === 1) || languages[0] || { code: 'zh-CN' };
  const fallbackLanguage = languages.find((item) => Number(item.is_fallback || 0) === 1) || defaultLanguage;
  const requestedCode = String(languageCode || '').trim();
  const selected = requestedCode
    ? languages.find((item) => item.code === requestedCode)
    : defaultLanguage;

  return {
    code: requestedCode || selected?.code || defaultLanguage.code || 'zh-CN',
    id: Number(selected?.id || 0) || null,
    site: selected?.site || null,
    default_code: defaultLanguage.code || 'zh-CN',
    default_id: Number(defaultLanguage?.id || 0) || null,
    default_site: defaultLanguage?.site || null,
    fallback_code: fallbackLanguage.code || defaultLanguage.code || 'zh-CN',
    fallback_id: Number(fallbackLanguage?.id || 0) || null
  };
}

function resolveSiteBaseUrl(baseConfig, languageCode) {
  const languageSiteUrl = resolveLanguageSiteBaseUrl(languageCode, baseConfig?.web_url);
  if (languageSiteUrl) {
    return languageSiteUrl;
  }
  return normalizeAbsoluteUrl(baseConfig?.web_url);
}

function resolveLanguageSiteBaseUrl(languageCode, fallbackWebUrl = '') {
  const requestedCode = String(languageCode || '').trim();
  if (!requestedCode) {
    return '';
  }

  const language = listLanguages().find((item) => item.code === requestedCode);
  const site = language?.site || null;
  if (!site) {
    return '';
  }

  const baseUrl = normalizeAbsoluteUrl(fallbackWebUrl);
  const host = normalizeHostUrl(site.host);
  if (site.site_mode === 'standalone') {
    if (host) {
      return host;
    }
    return baseUrl;
  }

  if (!baseUrl) {
    return '';
  }

  const pathPrefix = normalizePathPrefix(site.path_prefix);
  if (!pathPrefix || pathPrefix === '/') {
    return baseUrl;
  }
  return `${baseUrl}${pathPrefix}`;
}

function resolveLanguageSiteHost(languageCode) {
  const requestedCode = String(languageCode || '').trim();
  if (!requestedCode) {
    return '';
  }
  const language = listLanguages().find((item) => item.code === requestedCode);
  return normalizeHostUrl(language?.site?.host) || '';
}

function normalizeAbsoluteUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/g, '');
  if (!/^https?:\/\//i.test(normalized)) {
    return '';
  }
  return normalized;
}

function normalizeHostUrl(value) {
  const normalized = String(value || '').trim().replace(/\/+$/g, '');
  if (!normalized) {
    return '';
  }
  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return `https://${normalized}`;
}

function normalizePathPrefix(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/g, '');
}

function resolveFallbackTranslationPayload(translations, fallbackLanguageCode) {
  const code = fallbackLanguageCode || 'zh-CN';
  const direct = translations[code];
  if (direct?.web_name) {
    return direct;
  }
  throw new Error('至少需要提供兜底语言的网站名称');
}

function resolveSiteTranslation(selectedTranslation, fallbackTranslation) {
  const output = {};
  const fallbackFields = [];

  for (const field of SITE_TRANSLATABLE_FIELDS) {
    const selectedValue = selectedTranslation?.[field];
    if (hasSiteTranslationValue(selectedValue)) {
      output[field] = selectedValue;
      continue;
    }

    const fallbackValue = fallbackTranslation?.[field];
    if (hasSiteTranslationValue(fallbackValue)) {
      output[field] = fallbackValue;
      if (selectedTranslation?.language_code !== fallbackTranslation?.language_code) {
        fallbackFields.push(field);
      }
      continue;
    }

    output[field] = field === 'template_data_json' ? null : '';
  }

  return {
    translation: selectedTranslation || fallbackTranslation ? output : null,
    fallback_fields: fallbackFields
  };
}

function hasSiteTranslationValue(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function applySiteTranslation(base, translation) {
  if (!translation) {
    return base;
  }

  const output = { ...base };
  for (const field of SITE_TRANSLATABLE_FIELDS) {
    output[field] = translation[field] ?? (field === 'template_data_json' ? null : '');
  }
  return output;
}

function pickTranslationFields(input) {
  return {
    web_name: toNullableString(input?.web_name),
    company_name: toNullableString(input?.company_name),
    company_address: toNullableString(input?.company_address),
    postal_code: toNullableString(input?.postal_code),
    company_phone: toNullableString(input?.company_phone),
    company_fax: toNullableString(input?.company_fax),
    contact_person: toNullableString(input?.contact_person),
    company_email: toNullableString(input?.company_email),
    web_qq: toNullableString(input?.web_qq),
    web_mobile: toNullableString(input?.web_mobile),
    seo_default_title: toNullableString(input?.seo_default_title),
    seo_default_description: toNullableString(input?.seo_default_description),
    seo_home_title: toNullableString(input?.seo_home_title),
    seo_home_description: toNullableString(input?.seo_home_description),
    template_data_json: normalizeSiteTemplateDataJson(input?.template_data_json)
  };
}

function normalizeSiteTemplateDataJson(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }
    const parsed = JSON.parse(normalized);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('site template_data_json must be a JSON object');
    }
    return JSON.stringify(normalizeSiteTemplateDataObject(parsed));
  }
  if (typeof value === 'object' && !Array.isArray(value)) {
    return JSON.stringify(normalizeSiteTemplateDataObject(value));
  }
  throw new Error('site template_data_json must be a JSON object');
}

function parseSiteTemplateDataJson(value) {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? normalizeSiteTemplateDataObject(parsed)
      : null;
  } catch {
    return null;
  }
}

function normalizeSiteTemplateDataObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }

  return normalizeTemplateDataAssetsDeep(value);
}

function addColumnIfMissing(tableName, columnName, definition) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

function dropColumnIfExists(tableName, columnName) {
  const columns = queryAll(`PRAGMA table_info(${tableName})`);
  if (!columns.some((column) => column.name === columnName)) {
    return;
  }
  getDb().exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
}

function toNullableString(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized === '' ? null : normalized;
}

function normalizeOptionalPort(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return null;
  }
  const port = Number.parseInt(normalized, 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('资源服务端口必须在 1-65535 之间');
  }
  return port;
}

function normalizeOptionalPublicBaseUrl(value) {
  const normalized = toNullableString(value);
  if (!normalized) {
    return null;
  }
  if (!/^https?:\/\//i.test(normalized)) {
    throw new Error('资源域名必须以 http:// 或 https:// 开头');
  }
  return normalized.replace(/\/+$/g, '');
}
