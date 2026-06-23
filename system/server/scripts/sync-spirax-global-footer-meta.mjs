import fs from 'node:fs';
import path from 'node:path';
import { execute, getDb, queryAll, queryOne } from '../src/db.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const sourceDistRoot = path.join(sourceRoot, 'dist');
const dryRun = process.argv.includes('--dry-run');
const targetLanguages = parseLanguageArgs(process.argv.slice(2));
const FOOTER_SECTION_KEYS = ['homeLinks', 'products', 'industries', 'services', 'about'];

if (!fs.existsSync(sourceDistRoot)) {
  throw new Error(`未找到原站 dist 目录: ${sourceDistRoot}`);
}

getDb();

const siteConfigId = queryOne('SELECT id FROM site_config ORDER BY id ASC LIMIT 1')?.id;
if (!siteConfigId) {
  throw new Error('未找到 site_config');
}

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

const stats = [];
for (const language of languageConfigs) {
  stats.push(syncLanguage(language));
}

for (const item of stats) {
  console.log(`${dryRun ? '[dry-run] ' : ''}${item.code}: updated=${item.updated ? 1 : 0} skipped=${item.skipped ? 1 : 0}`);
}

function syncLanguage(language) {
  const sourceFile = path.join(language.sourceDir, 'index.html');
  if (!fs.existsSync(sourceFile)) {
    return { code: language.code, updated: false, skipped: true };
  }

  const raw = fs.readFileSync(sourceFile, 'utf8');
  const footerHtml = matchFirst(raw, /(<footer class="sg-site-footer"[\s\S]*?<\/footer>)/i);
  if (!footerHtml) {
    return { code: language.code, updated: false, skipped: true };
  }

  const footerConfig = buildFooterConfig(footerHtml, language);
  if (!footerConfig) {
    return { code: language.code, updated: false, skipped: true };
  }

  const current = queryOne(
    `
      SELECT id, template_data_json
      FROM site_config_translations
      WHERE site_config_id = ?
        AND language_id = ?
    `,
    [siteConfigId, language.id],
  );
  if (!current?.id) {
    return { code: language.code, updated: false, skipped: true };
  }

  const nextTemplateDataJson = mergeFooterTemplateDataJson(current.template_data_json, footerConfig);
  if (String(current.template_data_json || '') === String(nextTemplateDataJson || '')) {
    return { code: language.code, updated: false, skipped: false };
  }

  if (!dryRun) {
    execute(
      `
        UPDATE site_config_translations
           SET template_data_json = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `,
      [nextTemplateDataJson, current.id],
    );
  }

  return { code: language.code, updated: true, skipped: false };
}

function buildFooterConfig(footerHtml, language) {
  const sections = extractFooterSections(footerHtml, language);
  if (!sections.length) {
    return null;
  }

  const footerSections = {};
  const footerGroups = {};
  for (let index = 0; index < FOOTER_SECTION_KEYS.length; index += 1) {
    const section = sections[index];
    if (!section) {
      continue;
    }
    const key = FOOTER_SECTION_KEYS[index];
    footerSections[key] = section.title;
    footerGroups[key] = section.links;
  }

  const metaRecords = extractFooterMetaRecords(footerHtml);

  return {
    sections: footerSections,
    groups: footerGroups,
    metaRecords,
  };
}

function extractFooterSections(footerHtml, language) {
  const sections = [];
  const pattern = /<section class="sg-site-footer__section"[\s\S]*?<h2[^>]*>([\s\S]*?)<\/h2>[\s\S]*?<ul class="sg-site-footer__list"[^>]*>([\s\S]*?)<\/ul>[\s\S]*?<\/section>/gi;
  for (const match of footerHtml.matchAll(pattern)) {
    const title = decodeHtml(stripTags(match[1] || ''));
    const links = [];
    const linkPattern = /<a[^>]+href=(["'])([\s\S]*?)\1[^>]*>([\s\S]*?)<\/a>/gi;
    for (const linkMatch of String(match[2] || '').matchAll(linkPattern)) {
      const url = normalizeFooterLinkHref(decodeHtml(String(linkMatch[2] || '').trim()), language);
      const name = decodeHtml(stripTags(linkMatch[3] || ''));
      if (name && url) {
        links.push({ name, url });
      }
    }
    if (title && links.length > 0) {
      sections.push({ title, links });
    }
  }
  return sections;
}

function normalizeFooterLinkHref(url, language) {
  const value = String(url || '').trim();
  if (!value) {
    return '';
  }
  if (/^https?:\/\//i.test(value) || value.startsWith('mailto:') || value.startsWith('tel:') || value.startsWith('#')) {
    return value;
  }

  const normalizedSiteMode = String(language?.siteMode || '').trim().toLowerCase();
  const normalizedPathPrefix = normalizePathPrefix(language?.pathPrefix || '/');
  if (normalizedSiteMode !== 'subdir' || normalizedPathPrefix === '/') {
    return value;
  }

  if (!value.startsWith('/')) {
    return value;
  }
  if (value === normalizedPathPrefix || value.startsWith(`${normalizedPathPrefix}/`)) {
    return value;
  }
  return `${normalizedPathPrefix}${value === '/' ? '/' : value}`;
}

function normalizePathPrefix(value) {
  const normalized = String(value || '').trim().replace(/\/+$/g, '');
  if (!normalized || normalized === '/') {
    return '/';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function extractFooterMetaRecords(footerHtml) {
  const recordsHtml = matchFirst(
    footerHtml,
    /<div class="sg-site-footer__records"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!recordsHtml) {
    return [];
  }
  const records = [];
  const pattern = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  for (const match of recordsHtml.matchAll(pattern)) {
    const text = decodeHtml(stripTags(match[1] || ''));
    if (text) {
      records.push(text);
    }
  }
  return records;
}

function mergeFooterTemplateDataJson(value, footerConfig) {
  const data = parseJsonObject(value);
  const ui = data.ui && typeof data.ui === 'object' && !Array.isArray(data.ui)
    ? { ...data.ui }
    : {};
  const footer = ui.footer && typeof ui.footer === 'object' && !Array.isArray(ui.footer)
    ? { ...ui.footer }
    : {};

  footer.sections = {
    ...(footerConfig.sections || {}),
  };

  for (const key of FOOTER_SECTION_KEYS) {
    if (Array.isArray(footerConfig.groups?.[key]) && footerConfig.groups[key].length > 0) {
      footer[key] = footerConfig.groups[key];
      continue;
    }
    delete footer[key];
  }

  delete footer.languageSwitcher;

  footer.meta = Array.isArray(footerConfig.metaRecords) && footerConfig.metaRecords.length > 0
    ? { records: footerConfig.metaRecords }
    : {};

  ui.footer = footer;
  data.ui = ui;
  return JSON.stringify(data, null, 0);
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

function stripTags(value) {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchFirst(value, pattern, groupIndex = 1) {
  const match = String(value || '').match(pattern);
  return match?.[groupIndex] || '';
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
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
