import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execute, queryAll, queryOne } from '../src/db.mjs';
import { UPLOADS_IMAGES_ROOT } from '../src/config.mjs';
import { normalizeUploadedRelativePath } from '../src/services/uploads.mjs';
import { createLanguage, listLanguages, updateLanguage } from '../src/services/languages.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliArgs = parseCliArgs(process.argv.slice(2));
const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const languageCode = normalizeLanguageCode(cliArgs.lang || cliArgs.language || 'en');
const docsPath = normalizeRelativeDir(cliArgs['docs-path'] || cliArgs.docs || languageCode);
const distPath = normalizeRelativeDir(cliArgs['dist-path'] || cliArgs.dist || languageCode);
const sourceDocsRoot = path.join(sourceRoot, 'docs', docsPath);
const sourceDistRoot = path.join(sourceRoot, 'dist', distPath);
const sourceDistSharedRoot = path.join(sourceRoot, 'dist', 'en');
const sourceSrcRoot = path.join(sourceRoot, 'src');
const dryRun = process.argv.includes('--dry-run');
const languageMeta = resolveLanguageMeta(languageCode, cliArgs);
const hasSourceDocsRoot = fs.existsSync(sourceDocsRoot);

if (!fs.existsSync(sourceDistRoot)) {
  throw new Error(`未找到语言 dist 目录: ${sourceDistRoot}`);
}

if (!dryRun) {
  ensureLanguageSite();
}

const language = queryOne(
  `
    SELECT id, code
    FROM languages
    WHERE code = ?
    LIMIT 1
  `,
  [languageCode]
);

if (!language?.id) {
  throw new Error(`未找到 ${languageCode} 语言，请先创建语言站点`);
}

const stats = {
  siteConfig: 0,
  columns: 0,
  news: 0,
  products: 0,
  copiedAssets: 0,
  missing: []
};

syncSiteConfigTranslation();
syncColumnTranslations();
syncNewsTranslations();
syncProductTranslations();

console.log(JSON.stringify(stats, null, 2));

function syncSiteConfigTranslation() {
  const sourceFile = path.join(sourceDocsRoot, 'index.mdx');
  const frontmatter = fs.existsSync(sourceFile)
    ? parseFrontmatter(fs.readFileSync(sourceFile, 'utf8'))
    : {};
  if (!fs.existsSync(sourceFile) && hasSourceDocsRoot) {
    stats.missing.push({ type: 'site-config', source: sourceFile });
  }
  const current = queryOne(
    `
      SELECT id
      FROM site_config_translations
      WHERE site_config_id = 1 AND language_id = ?
      LIMIT 1
    `,
    [language.id]
  );

  const values = [
    1,
    language.id,
    languageMeta.webName,
    languageMeta.companyName,
    languageMeta.companyAddress,
    languageMeta.contactPerson,
    languageMeta.companyEmail,
    languageMeta.webCopyright,
    languageMeta.webAuthor,
    toNullableString(frontmatter.seoTitle),
    toNullableString(frontmatter.seoDescription),
    toNullableString(frontmatter.seoTitle),
    toNullableString(frontmatter.seoDescription),
    JSON.stringify(buildSiteTemplateData(languageCode))
  ];

  if (!dryRun) {
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
          template_data_json,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
          template_data_json = excluded.template_data_json,
          updated_at = CURRENT_TIMESTAMP
      `,
      values
    );
  }

  stats.siteConfig += current?.id ? 1 : 1;
}

function syncColumnTranslations() {
  const rows = queryAll(`
    SELECT c.id, c.route_path, c.column_type
    FROM columns c
    ORDER BY c.id ASC
  `);

  for (const row of rows) {
    const routePath = normalizeRoutePath(row.route_path);
    const metadata = resolveSourceMetadata(routePath);
    if (!metadata) {
      continue;
    }

    const payload = buildColumnTranslationPayload(metadata);
    if (!dryRun) {
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(column_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            template_data_json = excluded.template_data_json,
            seo_title = excluded.seo_title,
            seo_description = excluded.seo_description,
            publish_status = excluded.publish_status,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          row.id,
          language.id,
          payload.name,
          payload.summary,
          payload.content_html,
          payload.template_data_json,
          payload.seo_title,
          payload.seo_description
        ]
      );
    }
    stats.columns += 1;
  }
}

function syncNewsTranslations() {
  const rows = queryAll(`
    SELECT id, custom_url
    FROM content_news
    ORDER BY id ASC
  `);

  for (const row of rows) {
    const routePath = normalizeRoutePath(row.custom_url);
    const metadata = resolveSourceMetadata(routePath);
    if (!metadata) {
      continue;
    }

    const payload = buildEntryTranslationPayload(metadata);
    if (!dryRun) {
      execute(
        `
          INSERT INTO content_news_translations (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(entry_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            template_data_json = excluded.template_data_json,
            seo_title = excluded.seo_title,
            seo_description = excluded.seo_description,
            publish_status = excluded.publish_status,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          row.id,
          language.id,
          payload.name,
          payload.summary,
          payload.content_html,
          payload.template_data_json,
          payload.seo_title,
          payload.seo_description
        ]
      );
    }
    stats.news += 1;
  }
}

function syncProductTranslations() {
  const rows = queryAll(`
    SELECT p.id, p.custom_url, c.route_path
    FROM content_product p
    INNER JOIN columns c ON c.id = p.column_id
    ORDER BY p.id ASC
  `);

  for (const row of rows) {
    const detailSegment = String(row.custom_url || '')
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/index\.html$/i, '')
      .replace(/index\.html$/i, '')
      .replace(/^\/+|\/+$/g, '');

    if (!detailSegment) {
      continue;
    }

    const routePath = normalizeRoutePath(`${normalizeRoutePath(row.route_path)}${detailSegment}/`);
    const metadata = resolveSourceMetadata(routePath);
    if (!metadata) {
      continue;
    }

    const existingTranslation = queryOne(
      `
        SELECT summary, content_html, template_data_json, seo_title, seo_description
        FROM content_product_translations
        WHERE entry_id = ? AND language_id = ?
        LIMIT 1
      `,
      [row.id, language.id]
    );
    const englishTranslation = queryOne(
      `
        SELECT t.summary, t.content_html, t.template_data_json, t.seo_title, t.seo_description
        FROM content_product_translations t
        INNER JOIN languages l ON l.id = t.language_id
        WHERE t.entry_id = ? AND l.code = 'en'
        LIMIT 1
      `,
      [row.id]
    );
    const payload = buildEntryTranslationPayload(metadata, {
      existingTranslation,
      fallbackTranslation: englishTranslation
    });
    if (!dryRun) {
      execute(
        `
          INSERT INTO content_product_translations (
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
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(entry_id, language_id) DO UPDATE SET
            name = excluded.name,
            summary = excluded.summary,
            content_html = excluded.content_html,
            template_data_json = excluded.template_data_json,
            seo_title = excluded.seo_title,
            seo_description = excluded.seo_description,
            publish_status = excluded.publish_status,
            updated_at = CURRENT_TIMESTAMP
        `,
        [
          row.id,
          language.id,
          payload.name,
          payload.summary,
          payload.content_html,
          payload.template_data_json,
          payload.seo_title,
          payload.seo_description
        ]
      );
    }
    stats.products += 1;
  }
}

function buildColumnTranslationPayload(metadata) {
  return {
    name: metadata.title || '',
    summary: metadata.summary || '',
    content_html: metadata.contentHtml || '',
    template_data_json: metadata.pageData ? JSON.stringify(metadata.pageData) : null,
    seo_title: toNullableString(metadata.seoTitle || metadata.title),
    seo_description: toNullableString(metadata.seoDescription || metadata.summary)
  };
}

function buildEntryTranslationPayload(metadata, options = {}) {
  const existingTranslation = options?.existingTranslation || null;
  const fallbackTranslation = options?.fallbackTranslation || null;
  const summary = coalesceString(
    metadata.summary,
    existingTranslation?.summary,
    fallbackTranslation?.summary,
    ''
  );
  const contentHtml = coalesceString(
    metadata.contentHtml,
    existingTranslation?.content_html,
    fallbackTranslation?.content_html,
    ''
  );
  const templateDataJson = metadata.pageData
    ? JSON.stringify(metadata.pageData)
    : (existingTranslation?.template_data_json || fallbackTranslation?.template_data_json || null);
  const seoTitle = toNullableString(
    metadata.seoTitle
    || metadata.title
    || existingTranslation?.seo_title
    || fallbackTranslation?.seo_title
  );
  const seoDescription = toNullableString(
    metadata.seoDescription
    || summary
    || existingTranslation?.seo_description
    || fallbackTranslation?.seo_description
  );

  return {
    name: metadata.title || '',
    summary,
    content_html: contentHtml,
    template_data_json: templateDataJson,
    seo_title: seoTitle,
    seo_description: seoDescription
  };
}

function resolveSourceMetadata(routePath) {
  const normalizedRoutePath = normalizeRoutePath(routePath);
  const sourceFile = resolveSourceFile(normalizedRoutePath);
  const sourceHtmlFile = resolveSourceHtmlFile(normalizedRoutePath);
  const mdxMetadata = sourceFile ? loadMdxMetadata(sourceFile) : null;
  const htmlMetadata = sourceHtmlFile ? loadHtmlMetadata(sourceHtmlFile) : null;

  if (!mdxMetadata && !htmlMetadata) {
    return null;
  }

  const title = coalesceString(
    mdxMetadata?.pageData?.title,
    htmlMetadata?.pageData?.title,
    mdxMetadata?.title,
    htmlMetadata?.title,
    ''
  );
  const summary = coalesceString(
    mdxMetadata?.pageData?.summary,
    htmlMetadata?.pageData?.summary,
    mdxMetadata?.description,
    htmlMetadata?.description,
    ''
  );
  const pageData = {
    ...(htmlMetadata?.pageData && typeof htmlMetadata.pageData === 'object' ? htmlMetadata.pageData : {}),
    ...(mdxMetadata?.pageData && typeof mdxMetadata.pageData === 'object' ? mdxMetadata.pageData : {}),
    ...(title ? { title } : {}),
    ...(summary ? { summary } : {})
  };
  const contentHtml = mdxMetadata?.contentHtml || htmlMetadata?.contentHtml || '';

  return {
    title,
    summary,
    seoTitle: coalesceString(mdxMetadata?.seoTitle, htmlMetadata?.seoTitle, title),
    seoDescription: coalesceString(mdxMetadata?.seoDescription, htmlMetadata?.seoDescription, summary),
    description: coalesceString(mdxMetadata?.description, htmlMetadata?.description, summary),
    pageData: Object.keys(pageData).length > 0 ? pageData : null,
    contentHtml
  };
}

function resolveSourceFile(routePath) {
  if (!hasSourceDocsRoot) {
    return null;
  }
  const relativeRoutePath = normalizeRoutePath(routePath).replace(/^\/+/u, '').replace(/\/$/u, '');
  const candidates = [
    path.join(sourceDocsRoot, relativeRoutePath, 'index.mdx'),
    path.join(sourceDocsRoot, relativeRoutePath, 'index.md'),
    path.join(sourceDocsRoot, `${relativeRoutePath}.mdx`),
    path.join(sourceDocsRoot, `${relativeRoutePath}.md`)
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveSourceHtmlFile(routePath) {
  const relativeRoutePath = normalizeRoutePath(routePath).replace(/^\/+/u, '').replace(/\/$/u, '');
  const candidate = relativeRoutePath
    ? path.join(sourceDistRoot, relativeRoutePath, 'index.html')
    : path.join(sourceDistRoot, 'index.html');
  return fs.existsSync(candidate) ? candidate : null;
}

function loadMdxMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const pageData = safeParseExportObject(raw, 'pageData', {
    bindings: resolveImportedBindings(raw, filePath)
  });

  return {
    title: coalesceString(frontmatter.title, pageData?.title, pageData?.hero?.title, ''),
    description: coalesceString(frontmatter.description, pageData?.summary, ''),
    seoTitle: coalesceString(frontmatter.seoTitle, ''),
    seoDescription: coalesceString(frontmatter.seoDescription, frontmatter.description, pageData?.summary, ''),
    pageData: pageData && typeof pageData === 'object' ? normalizePageData(pageData) : null,
    contentHtml: ''
  };
}

function loadHtmlMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const contentHtml = extractHtmlBody(raw);
  const rewrittenHtml = sanitizeImportedContentHtml(rewriteImportedAssetHtml(contentHtml));
  const title = decodeHtml(stripTags(matchFirst(raw, /<title>([\s\S]*?)<\/title>/i)));
  const seoDescription = extractMetaContent(raw, 'description');
  const heading = decodeHtml(stripTags(matchFirst(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i)));
  const explicitSummary = decodeHtml(stripTags(
    matchFirst(
      raw,
      /<(?:p|div)[^>]+class=["'][^"']*(?:banner-primary__copy|sg-short-masthead__summary|home-hero__summary|short-masthead__summary|sg-digital-page__summary|article__summary|product-top-panel__description)[^"']*["'][^>]*>([\s\S]*?)<\/(?:p|div)>/i
    )
  ));
  const bodySummary = buildSummaryFromContentHtml(rewrittenHtml);
  const summary = coalesceString(explicitSummary, seoDescription, bodySummary, '');

  return {
    title: heading || title,
    description: summary || seoDescription,
    seoTitle: title,
    seoDescription,
    pageData: normalizePageData({
      title: heading || title,
      summary: summary || seoDescription || ''
    }),
    contentHtml: rewrittenHtml
  };
}

function extractHtmlBody(raw) {
  const main = matchFirst(raw, /<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (main) {
    return main;
  }
  const article = matchFirst(raw, /<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (article) {
    return article;
  }
  return '';
}

function sanitizeImportedContentHtml(html) {
  const input = String(html || '').trim();
  if (!input || !input.includes('sg-page-shell sg-product-page')) {
    return input;
  }

  const infoSections = collectMatches(input, /<section class="sg-info-section">[\s\S]*?<\/section>/gi);
  if (infoSections.length > 0) {
    return infoSections.join('\n').trim();
  }

  const productBody = matchFirst(
    input,
    /<div class="intro__copy copy intro__copy--left product-detail__body">\s*([\s\S]*?)\s*<\/div>\s*<\/div>\s*(?:<aside|<\/div>\s*<\/section>)/i
  );
  if (productBody) {
    return productBody.trim();
  }

  const genericInfoBody = matchFirst(
    input,
    /<div class="intro__copy copy intro__copy--left sg-info-page">\s*([\s\S]*?)\s*<\/div>\s*<\/div>\s*<\/section>/i
  );
  if (genericInfoBody) {
    return genericInfoBody.trim();
  }

  return '';
}

function buildSummaryFromContentHtml(html) {
  const input = String(html || '').trim();
  if (!input) {
    return '';
  }

  const paragraphMatches = collectMatches(input, /<p\b[^>]*>([\s\S]*?)<\/p>/gi)
    .map((item) => normalizeSummaryText(item))
    .filter(Boolean);

  const directText = normalizeSummaryText(input);
  const summarySource = paragraphMatches[0] || directText;
  if (!summarySource) {
    return '';
  }

  return truncateSummary(summarySource, 220);
}

function normalizeSummaryText(value) {
  return decodeHtml(stripTags(String(value || '')))
    .replace(/\s+/gu, ' ')
    .trim();
}

function truncateSummary(value, maxLength = 220) {
  const text = String(value || '').trim();
  if (!text || text.length <= maxLength) {
    return text;
  }

  const sliced = text.slice(0, maxLength);
  const lastSpaceIndex = sliced.lastIndexOf(' ');
  const safeSlice = lastSpaceIndex >= Math.floor(maxLength * 0.6)
    ? sliced.slice(0, lastSpaceIndex)
    : sliced;
  return `${safeSlice.trim()}...`;
}

function rewriteImportedAssetHtml(html) {
  const input = String(html || '');
  if (!input) {
    return '';
  }

  assertNoLegacyImageAssetPath(input);

  const assetPaths = new Set();
  const rewritten = input.replace(
    /\b(?:src|href|poster)=["']((?:https?:\/\/[^/"'\s<>]+)?\/uploads\/images\/[^"']+)["']/gi,
    (matched, assetPath) => {
      const normalized = syncImageAsset(assetPath);
      assetPaths.add(normalized);
      return matched.replace(assetPath, normalized);
    }
  );

  rewritten.replace(/url\((['"]?)((?:https?:\/\/[^/"'\s<>]+)?\/uploads\/images\/[^)'"]+)\1\)/gi, (_, quote, assetPath) => {
    assetPaths.add(syncImageAsset(assetPath));
    return _;
  });

  return rewritten.replace(/url\((['"]?)((?:https?:\/\/[^/"'\s<>]+)?\/uploads\/images\/[^)'"]+)\1\)/gi, (_, quote, assetPath) => {
    const normalized = syncImageAsset(assetPath);
    return `url(${quote}${normalized}${quote})`;
  });
}

function syncImageAsset(assetPath) {
  const normalized = normalizeUploadedRelativePath(assetPath);
  const legacyValue = String(assetPath || '').trim();
  if (!normalized) {
    assertNoLegacyImageAssetPath(legacyValue);
    return legacyValue;
  }

  const relativePath = normalized.replace(/^\/uploads\/images\//, '');
  const targetPath = path.join(UPLOADS_IMAGES_ROOT, relativePath);
  if (!fs.existsSync(targetPath)) {
    const sourcePath = resolveSourceImagePath(relativePath);
    if (fs.existsSync(sourcePath) && !dryRun) {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(sourcePath, targetPath);
      stats.copiedAssets += 1;
    } else if (!fs.existsSync(sourcePath)) {
      stats.missing.push({ type: 'asset', source: sourcePath });
    }
  }

  return `/uploads/images/${relativePath}`;
}

function assertNoLegacyImageAssetPath(value) {
  const normalized = String(value || '').trim();
  if (normalized.includes('/images/')) {
    throw new Error(`Legacy /images asset path is no longer supported in import-spirax-global-en-content: ${normalized}`);
  }
}

function resolveSourceImagePath(relativePath) {
  const candidates = [
    path.join(sourceDistRoot, 'images', relativePath),
    path.join(sourceDistSharedRoot, 'images', relativePath)
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
}

function normalizeRoutePath(routePath) {
  const value = String(routePath || '').trim();
  if (!value) {
    return '/';
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

function collectMatches(value, regex) {
  return Array.from(String(value || '').matchAll(regex), (match) => String(match?.[0] || '').trim()).filter(Boolean);
}

function normalizePageData(pageData) {
  if (!pageData || typeof pageData !== 'object') {
    return null;
  }

  const normalized = { ...pageData };
  const title = coalesceString(
    normalized.title,
    normalized.hero?.title,
    ''
  );
  const summary = coalesceString(
    normalized.summary,
    normalized.heroSummary,
    normalized.hero?.summary,
    ''
  );

  if (title) {
    normalized.title = title;
  }
  if (summary) {
    normalized.summary = summary;
  }
  return normalized;
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const lines = match[1].split('\n');
  const result = {};
  for (const line of lines) {
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    result[pair[1]] = stripWrappingQuotes(pair[2].trim());
  }
  return result;
}

function safeParseExportObject(raw, exportName, options = {}) {
  try {
    return parseExportObject(raw, exportName, options);
  } catch {
    return null;
  }
}

function parseExportObject(raw, exportName, options = {}) {
  const marker = `export const ${exportName} =`;
  const start = raw.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const braceStart = raw.indexOf('{', start);
  if (braceStart < 0) {
    return null;
  }

  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;

  for (let index = braceStart; index < raw.length; index += 1) {
    const char = raw[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble || inTemplate) && char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const objectLiteral = raw.slice(braceStart, index + 1);
        return evaluateExpression(objectLiteral, options.bindings || {});
      }
    }
  }

  return null;
}

function resolveImportedBindings(raw, filePath) {
  const bindings = {};
  const importLines = String(raw || '')
    .split('\n')
    .filter((line) => /^\s*import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"]/.test(line));

  for (const line of importLines) {
    const match = line.match(/^\s*import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]/);
    if (!match) {
      continue;
    }
    const names = match[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => {
        const aliasMatch = item.match(/^([A-Za-z0-9_$]+)\s+as\s+([A-Za-z0-9_$]+)$/);
        if (aliasMatch) {
          return { importedName: aliasMatch[1], localName: aliasMatch[2] };
        }
        return { importedName: item, localName: item };
      });
    const modulePath = resolveImportModulePath(match[2], filePath);
    if (!modulePath) {
      continue;
    }
    const moduleRaw = fs.readFileSync(modulePath, 'utf8');
    for (const { importedName, localName } of names) {
      const exportedValue = safeParseNamedExportValue(moduleRaw, importedName);
      if (exportedValue !== null && exportedValue !== undefined) {
        bindings[localName] = exportedValue;
      }
    }
  }

  return bindings;
}

function resolveImportModulePath(importPath, filePath) {
  const normalized = String(importPath || '').trim();
  if (!normalized) {
    return null;
  }

  const candidates = [];
  if (normalized.startsWith('@src/')) {
    candidates.push(path.join(sourceSrcRoot, normalized.slice('@src/'.length)));
  } else if (normalized.startsWith('./') || normalized.startsWith('../')) {
    candidates.push(path.resolve(path.dirname(filePath), normalized));
  } else {
    return null;
  }

  for (const candidate of candidates) {
    for (const resolved of [
      candidate,
      `${candidate}.ts`,
      `${candidate}.js`,
      path.join(candidate, 'index.ts'),
      path.join(candidate, 'index.js')
    ]) {
      if (fs.existsSync(resolved)) {
        return resolved;
      }
    }
  }

  return null;
}

function safeParseNamedExportValue(raw, exportName) {
  try {
    return parseNamedExportValue(raw, exportName);
  } catch {
    return null;
  }
}

function parseNamedExportValue(raw, exportName) {
  const marker = `export const ${exportName} =`;
  const start = String(raw || '').indexOf(marker);
  if (start < 0) {
    return null;
  }
  const expressionStart = start + marker.length;
  const expression = extractExpression(String(raw || '').slice(expressionStart));
  if (!expression) {
    return null;
  }
  const cleaned = expression.replace(/\s+satisfies\s+[\s\S]+$/u, '').trim();
  return evaluateExpression(cleaned, {});
}

function extractExpression(raw) {
  const input = String(raw || '');
  let depthCurly = 0;
  let depthSquare = 0;
  let depthParen = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaped = false;
  let started = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (!started && /\s/.test(char)) {
      continue;
    }
    started = true;

    if (escaped) {
      escaped = false;
      continue;
    }
    if ((inSingle || inDouble || inTemplate) && char === '\\') {
      escaped = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === '\'') {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) {
      continue;
    }
    if (char === '{') {
      depthCurly += 1;
      continue;
    }
    if (char === '}') {
      depthCurly -= 1;
      continue;
    }
    if (char === '[') {
      depthSquare += 1;
      continue;
    }
    if (char === ']') {
      depthSquare -= 1;
      continue;
    }
    if (char === '(') {
      depthParen += 1;
      continue;
    }
    if (char === ')') {
      depthParen -= 1;
      continue;
    }
    if (char === ';' && depthCurly === 0 && depthSquare === 0 && depthParen === 0) {
      return input.slice(0, index).trim();
    }
  }

  return input.trim();
}

function evaluateExpression(expression, bindings = {}) {
  const names = Object.keys(bindings);
  const values = names.map((name) => bindings[name]);
  return Function(...names, `"use strict"; return (${expression});`)(...values);
}

function extractMetaContent(raw, name) {
  const pattern = new RegExp(`<meta[^>]+name=["']${escapeRegExp(name)}["'][^>]+content=["']([\\s\\S]*?)["'][^>]*>`, 'i');
  return decodeHtml(matchFirst(raw, pattern));
}

function matchFirst(raw, pattern) {
  const match = String(raw || '').match(pattern);
  return match?.[1] || '';
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function stripWrappingQuotes(value) {
  const normalized = String(value || '').trim();
  if (
    (normalized.startsWith('"') && normalized.endsWith('"'))
    || (normalized.startsWith('\'') && normalized.endsWith('\''))
  ) {
    return normalized.slice(1, -1);
  }
  return normalized;
}

function toNullableString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
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

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ensureLanguageSite() {
  const existing = listLanguages().find((item) => item.code === languageCode) || null;
  const payload = {
    code: languageCode,
    name: languageMeta.name,
    native_name: languageMeta.nativeName,
    is_enabled: 1,
    sort_order: languageMeta.sortOrder,
    site: {
      site_mode: languageMeta.siteMode,
      path_prefix: languageMeta.pathPrefix,
      host: languageMeta.host,
      access_port: languageMeta.accessPort,
      bind_host: languageMeta.bindHost,
      is_primary: 1
    }
  };

  if (existing?.id) {
    if (languageMeta.shouldSetDefault) {
      payload.is_default = 1;
    }
    updateLanguage(existing.id, payload);
    return;
  }

  payload.is_default = languageMeta.shouldSetDefault ? 1 : 0;
  createLanguage(payload);
}

function parseCliArgs(argv) {
  const output = {};
  for (const rawArg of Array.isArray(argv) ? argv : []) {
    const arg = String(rawArg || '').trim();
    if (!arg.startsWith('--')) {
      continue;
    }
    const content = arg.slice(2);
    const separatorIndex = content.indexOf('=');
    if (separatorIndex === -1) {
      output[content] = 'true';
      continue;
    }
    const key = content.slice(0, separatorIndex);
    const value = content.slice(separatorIndex + 1);
    output[key] = value;
  }
  return output;
}

function resolveLanguageMeta(code, args) {
  const defaults = getLanguageDefaults(code);
  const siteMode = normalizeSiteModeArg(args['site-mode'] || args.siteMode || defaults.siteMode || 'subdir');
  const defaultPathPrefix = siteMode === 'standalone'
    ? '/'
    : (code === 'en' ? '/' : `/${code}`);
  return {
    name: String(args.name || defaults.name || code).trim(),
    nativeName: String(args['native-name'] || args.nativeName || defaults.nativeName || defaults.name || code).trim(),
    sortOrder: toIntegerArg(args['sort-order'] || args.sortOrder, defaults.sortOrder ?? 0),
    shouldSetDefault: toBooleanArg(args.default),
    siteMode,
    pathPrefix: siteMode === 'standalone'
      ? '/'
      : normalizeSitePathPrefixArg(args['path-prefix'] || args.pathPrefix || defaults.pathPrefix || defaultPathPrefix),
    host: toNullableString(args.host || defaults.host),
    accessPort: siteMode === 'standalone' ? toIntegerArg(args.port || args['access-port'] || defaults.accessPort, null) : null,
    bindHost: siteMode === 'standalone' ? toNullableString(args['bind-host'] || args.bindHost || defaults.bindHost) : null,
    webName: String(args['web-name'] || args.webName || defaults.webName || 'Spirax Sarco').trim(),
    companyName: String(args['company-name'] || args.companyName || defaults.companyName || 'Spirax Sarco').trim(),
    companyAddress: toNullableString(args['company-address'] || args.companyAddress || defaults.companyAddress),
    contactPerson: String(args['contact-person'] || args.contactPerson || defaults.contactPerson || 'Spirax Sarco').trim(),
    companyEmail: String(args['company-email'] || args.companyEmail || defaults.companyEmail || 'sales@spiraxsteam.com').trim(),
    webCopyright: String(args['web-copyright'] || args.webCopyright || defaults.webCopyright || 'Spirax Sarco').trim(),
    webAuthor: String(args['web-author'] || args.webAuthor || defaults.webAuthor || 'Spirax Sarco').trim()
  };
}

function getLanguageDefaults(code) {
  const normalized = normalizeLanguageCode(code);
  const defaults = {
    ar: {
      name: 'العربية',
      nativeName: 'العربية',
      sortOrder: 110,
      siteMode: 'standalone',
      host: 'www.spiraxsteam.ae',
      companyAddress: 'Spirax Sarco Limited, Runnings Road, Kingsditch Trading Estate, Cheltenham, Gloucestershire, GL51 9NQ, United Kingdom',
      webCopyright: '© 2026 Spirax Sarco Limited. جميع الحقوق محفوظة.',
      webAuthor: 'Spirax Sarco Arabic'
    },
    'ar-me': {
      name: 'العربية (الشرق الأوسط)',
      nativeName: 'العربية (الشرق الأوسط)',
      sortOrder: 115,
      siteMode: 'standalone',
      host: 'me.tangbure.cc',
      companyAddress: 'Spirax Sarco Limited, Runnings Road, Kingsditch Trading Estate, Cheltenham, Gloucestershire, GL51 9NQ, United Kingdom',
      webCopyright: '© 2026 Spirax Sarco Limited. جميع الحقوق محفوظة.',
      webAuthor: 'Spirax Sarco Middle East'
    },
    en: {
      name: 'English',
      nativeName: 'English',
      sortOrder: -100,
      pathPrefix: '/',
      siteMode: 'subdir'
    },
    es: {
      name: 'Español',
      nativeName: 'Español',
      sortOrder: 120,
      siteMode: 'subdir',
      pathPrefix: '/es',
      companyAddress: 'Spirax Sarco Limited, Cheltenham, United Kingdom',
      webCopyright: '© 2026 Spirax Sarco Limited. Todos los derechos reservados.',
      webAuthor: 'Spirax Sarco Español'
    },
    fr: {
      name: 'Français',
      nativeName: 'Français',
      sortOrder: 150,
      pathPrefix: '/fr',
      siteMode: 'subdir',
      companyAddress: 'Spirax Sarco Limited, Cheltenham, United Kingdom',
      webCopyright: '© 2026 Spirax Sarco Limited. Tous droits reserves.',
      webAuthor: 'Spirax Sarco France'
    },
    id: {
      name: 'Bahasa Indonesia',
      nativeName: 'Bahasa Indonesia',
      sortOrder: 130,
      siteMode: 'subdir',
      pathPrefix: '/id',
      companyAddress: 'Spirax Sarco (Indonesia), Jakarta, Indonesia',
      webCopyright: '© 2026 Spirax Sarco Limited. Hak cipta dilindungi.',
      webAuthor: 'Spirax Sarco Indonesia'
    },
    pt: {
      name: 'Português',
      nativeName: 'Português',
      sortOrder: 140,
      siteMode: 'subdir',
      pathPrefix: '/pt',
      companyAddress: 'BrasilSpirax Sarco (Brasil), São Paulo, Brasil',
      webCopyright: '(c) 2026 Spirax Sarco Limited. Todos os direitos reservados.',
      webAuthor: 'Spirax Sarco Brasil'
    },
    tr: {
      name: 'Türkçe',
      nativeName: 'Türkçe',
      sortOrder: 160,
      pathPrefix: '/tr',
      siteMode: 'subdir',
      companyAddress: 'Spirax Sarco Limited, Cheltenham, United Kingdom',
      webCopyright: '© 2026 Spirax Sarco Limited. Tum haklari saklidir.',
      webAuthor: 'Spirax Sarco Turkiye'
    },
    ru: {
      name: 'Русский',
      nativeName: 'Русский',
      sortOrder: 100,
      siteMode: 'standalone'
    },
    th: {
      name: 'ไทย',
      nativeName: 'ไทย',
      sortOrder: 170,
      siteMode: 'subdir',
      pathPrefix: '/th',
      companyAddress: 'Spirax Sarco Thailand',
      webCopyright: '© 2026 Spirax Sarco Limited. All rights reserved.',
      webAuthor: 'Spirax Sarco Thailand'
    },
    vi: {
      name: 'Tiếng Việt',
      nativeName: 'Tiếng Việt',
      sortOrder: 180,
      siteMode: 'subdir',
      pathPrefix: '/vi',
      companyAddress: 'Spirax Sarco Vietnam',
      webCopyright: '© 2026 Spirax Sarco Limited. All rights reserved.',
      webAuthor: 'Spirax Sarco Vietnam'
    },
    'zh-cn': {
      name: '简体中文',
      nativeName: '简体中文',
      sortOrder: 0,
      siteMode: 'standalone'
    }
  };
  return defaults[normalized] || {};
}

function buildSiteTemplateData(code) {
  const normalized = normalizeLanguageCode(code).toLowerCase();
  if (normalized === 'ar' || normalized === 'ar-me') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'تغيير اللغة'
        },
        nav: {
          utilityAriaLabel: 'روابط مساعدة',
          mainAriaLabel: 'التنقل الرئيسي',
          searchAriaLabel: 'فتح البحث',
          searchTitle: 'فتح البحث',
          menuAriaLabel: 'القائمة',
          contactLabel: 'اتصل بنا',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'من نحن' },
            { url: '/learn-about-steam/', name: 'تعرف على البخار' },
            { url: '/resources-and-design-tools/', name: 'الموارد وأدوات التصميم' },
            { url: '/knowledge-exchange/', name: 'مركز المعرفة' }
          ]
        },
        search: {
          cancelLabel: 'إلغاء',
          clearLabel: 'مسح البحث',
          closeLabel: 'إغلاق البحث',
          emptyBody: 'لم يتم العثور على محتوى مطابق. جرّب كلمة مفتاحية أخرى.',
          emptyTitle: 'لا توجد نتائج',
          loadingLabel: 'جارٍ البحث...',
          placeholder: 'ابحث عن المنتجات أو المقالات أو الحلول',
          resultsLabel: 'نتائج البحث',
          unavailableBody: 'البحث غير متاح حالياً. حاول مرة أخرى لاحقاً.',
          unavailableTitle: 'البحث غير متاح'
        },
        breadcrumb: {
          ariaLabel: 'مسار التنقل',
          homeLabel: 'الرئيسية',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: normalized === 'ar-me'
            ? 'Spirax Sarco Limited, Cheltenham, United Kingdom'
            : 'Spirax Sarco Limited, Cheltenham, United Kingdom'
        },
        home: {
          heroSummary: 'خبرة Spirax Sarco في حلول وأنظمة البخار الصناعية.',
          primaryCtaLabel: 'استعرض المنتجات',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'استعرض الخدمات',
          secondaryCtaHref: '/services/',
          phoneLabel: 'الهاتف',
          emailLabel: 'البريد الإلكتروني',
          featuredTitle: 'المنتجات المميزة',
          newsTitle: 'الأخبار',
          servicesTitle: 'الخدمات'
        },
        product: {
          benefitsTitle: 'مزايا المنتج',
          overviewTitle: 'نظرة عامة',
          showAllLabel: 'عرض الكل',
          collapseLabel: 'طي',
          quickFactsTitle: 'حقائق سريعة',
          onThisPageLabel: 'في هذه الصفحة',
          relatedTitle: 'منتجات ذات صلة',
          contactBannerTitle: 'تحدث إلى فريقنا الفني',
          contactBannerSubtitle: 'تواصل مع Spirax Sarco للحصول على المساعدة في اختيار المنتج أو الوثائق أو البدائل المناسبة.',
          contactBannerPrimaryLabel: 'صفحة الاتصال',
          previousImageLabel: 'الصورة السابقة',
          nextImageLabel: 'الصورة التالية',
          viewImageLabel: 'عرض الصورة'
        },
        common: {
          learnMoreLabel: 'اعرف المزيد'
        }
      }
    };
  }

  if (normalized === 'es') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Cambiar idioma'
        },
        nav: {
          utilityAriaLabel: 'Navegación auxiliar',
          mainAriaLabel: 'Navegación principal',
          searchAriaLabel: 'Abrir búsqueda',
          searchTitle: 'Abrir búsqueda',
          menuAriaLabel: 'Menú',
          contactLabel: 'Contáctanos',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'Sobre nosotros' },
            { url: '/learn-about-steam/', name: 'Aprenda sobre vapor' },
            { url: '/resources-and-design-tools/', name: 'Recursos y herramientas de diseño' },
            { url: '/knowledge-exchange/', name: 'Centro de conocimiento' }
          ]
        },
        search: {
          cancelLabel: 'Cancelar',
          clearLabel: 'Borrar búsqueda',
          closeLabel: 'Cerrar búsqueda',
          emptyBody: 'No se encontró contenido coincidente. Pruebe con otra palabra clave.',
          emptyTitle: 'Sin resultados',
          loadingLabel: 'Buscando...',
          placeholder: 'Buscar productos, artículos o soluciones',
          resultsLabel: 'Resultados de búsqueda',
          unavailableBody: 'La búsqueda no está disponible temporalmente. Inténtelo más tarde.',
          unavailableTitle: 'Búsqueda no disponible'
        },
        breadcrumb: {
          ariaLabel: 'Ruta de navegación',
          homeLabel: 'Inicio',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: 'Spirax Sarco Limited, Cheltenham, United Kingdom'
        },
        home: {
          heroSummary: 'Soluciones, productos y servicios para sistemas de vapor industriales.',
          primaryCtaLabel: 'Ver productos',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Ver servicios',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Teléfono',
          emailLabel: 'Correo electrónico',
          featuredTitle: 'Productos destacados',
          newsTitle: 'Noticias',
          servicesTitle: 'Servicios'
        },
        product: {
          benefitsTitle: 'Ventajas del producto',
          overviewTitle: 'Descripción general',
          showAllLabel: 'Mostrar todo',
          collapseLabel: 'Ocultar',
          quickFactsTitle: 'Datos rápidos',
          onThisPageLabel: 'En esta página',
          relatedTitle: 'Productos relacionados',
          contactBannerTitle: 'Hable con nuestro equipo técnico',
          contactBannerSubtitle: 'Contacte con Spirax Sarco para selección de producto, documentación o alternativas.',
          contactBannerPrimaryLabel: 'Página de contacto',
          previousImageLabel: 'Imagen anterior',
          nextImageLabel: 'Siguiente imagen',
          viewImageLabel: 'Ver imagen'
        },
        common: {
          learnMoreLabel: 'Más información'
        }
      }
    };
  }

  if (normalized === 'fr') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Changer de langue'
        },
        nav: {
          utilityAriaLabel: 'Navigation utilitaire',
          mainAriaLabel: 'Navigation principale',
          searchAriaLabel: 'Ouvrir la recherche',
          searchTitle: 'Ouvrir la recherche',
          menuAriaLabel: 'Menu',
          contactLabel: 'Contactez-nous',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'À propos de nous' },
            { url: '/learn-about-steam/', name: 'En savoir plus sur la vapeur' },
            { url: '/resources-and-design-tools/', name: 'Ressources et outils de conception' },
            { url: '/knowledge-exchange/', name: 'Échange de connaissances' }
          ]
        },
        search: {
          cancelLabel: 'Annuler',
          clearLabel: 'Effacer la recherche',
          closeLabel: 'Fermer la recherche',
          emptyBody: 'Aucun contenu correspondant. Essayez un autre mot-clé.',
          emptyTitle: 'Aucun résultat',
          loadingLabel: 'Recherche en cours...',
          placeholder: 'Rechercher des produits, articles ou solutions',
          resultsLabel: 'Résultats de recherche',
          unavailableBody: 'La recherche est temporairement indisponible. Réessayez plus tard.',
          unavailableTitle: 'Recherche indisponible'
        },
        breadcrumb: {
          ariaLabel: 'Fil d’ariane',
          homeLabel: 'Accueil',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: 'Spirax Sarco Limited, Cheltenham, United Kingdom'
        },
        home: {
          heroSummary: 'L’expertise vapeur Spirax Sarco pour les systèmes industriels dans le monde entier.',
          primaryCtaLabel: 'Découvrir les produits',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Découvrir les services',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Téléphone',
          emailLabel: 'Email',
          featuredTitle: 'Produits phares',
          newsTitle: 'Actualités',
          servicesTitle: 'Services'
        },
        product: {
          benefitsTitle: 'Avantages produit',
          overviewTitle: 'Aperçu',
          showAllLabel: 'Afficher tout',
          collapseLabel: 'Réduire',
          quickFactsTitle: 'Informations clés',
          onThisPageLabel: 'Sur cette page',
          relatedTitle: 'Produits associés',
          contactBannerTitle: 'Contactez-nous pour un accompagnement technique',
          contactBannerSubtitle: 'Contactez l’équipe Spirax Sarco pour confirmer la sélection, la documentation ou la solution de remplacement.',
          contactBannerPrimaryLabel: 'Page de contact',
          previousImageLabel: 'Image précédente',
          nextImageLabel: 'Image suivante',
          viewImageLabel: 'Voir l’image'
        },
        common: {
          learnMoreLabel: 'En savoir plus'
        }
      }
    };
  }

  if (normalized === 'tr') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Dili degistir'
        },
        nav: {
          utilityAriaLabel: 'Yardimci gezinme',
          mainAriaLabel: 'Ana gezinme',
          searchAriaLabel: 'Aramayi ac',
          searchTitle: 'Aramayi ac',
          menuAriaLabel: 'Menu',
          contactLabel: 'Bize ulasin',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'Hakkimizda' },
            { url: '/learn-about-steam/', name: 'Buhar hakkinda bilgi' },
            { url: '/resources-and-design-tools/', name: 'Kaynaklar ve tasarim araclari' },
            { url: '/knowledge-exchange/', name: 'Bilgi paylasimi' }
          ]
        },
        search: {
          cancelLabel: 'Iptal',
          clearLabel: 'Aramayi temizle',
          closeLabel: 'Aramayi kapat',
          emptyBody: 'Eslesen icerik bulunamadi. Baska bir anahtar kelime deneyin.',
          emptyTitle: 'Sonuc bulunamadi',
          loadingLabel: 'Araniyor...',
          placeholder: 'Urun, makale veya cozum ara',
          resultsLabel: 'Arama sonuclari',
          unavailableBody: 'Arama su anda kullanilamiyor. Lutfen daha sonra tekrar deneyin.',
          unavailableTitle: 'Arama kullanilamiyor'
        },
        breadcrumb: {
          ariaLabel: 'Gezinti yolu',
          homeLabel: 'Ana sayfa',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: 'Spirax Sarco Limited, Cheltenham, United Kingdom'
        },
        home: {
          heroSummary: 'Endustriyel buhar sistemleri icin Spirax Sarco uzmanligi.',
          primaryCtaLabel: 'Urunleri inceleyin',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Hizmetleri inceleyin',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Telefon',
          emailLabel: 'E-posta',
          featuredTitle: 'One cikan urunler',
          newsTitle: 'Haberler',
          servicesTitle: 'Hizmetler'
        },
        product: {
          benefitsTitle: 'Urun avantajlari',
          overviewTitle: 'Genel bakis',
          showAllLabel: 'Tumunu goster',
          collapseLabel: 'Daralt',
          quickFactsTitle: 'Hizli bilgiler',
          onThisPageLabel: 'Bu sayfada',
          relatedTitle: 'Ilgili urunler',
          contactBannerTitle: 'Teknik destek icin bizimle iletisime gecin',
          contactBannerSubtitle: 'Urun secimi, dokumantasyon veya alternatif cozumler icin Spirax Sarco ekibiyle iletisime gecin.',
          contactBannerPrimaryLabel: 'Iletisim sayfasi',
          previousImageLabel: 'Onceki gorsel',
          nextImageLabel: 'Sonraki gorsel',
          viewImageLabel: 'Gorseli goruntule'
        },
        common: {
          learnMoreLabel: 'Daha fazla bilgi'
        }
      }
    };
  }

  if (normalized === 'id') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Ubah bahasa'
        },
        nav: {
          utilityAriaLabel: 'Navigasi utilitas',
          mainAriaLabel: 'Navigasi utama',
          searchAriaLabel: 'Buka pencarian',
          searchTitle: 'Buka pencarian',
          menuAriaLabel: 'Menu',
          contactLabel: 'Hubungi kami',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'Tentang kami' },
            { url: '/learn-about-steam/', name: 'Pelajari tentang steam' },
            { url: '/resources-and-design-tools/', name: 'Sumber daya dan alat desain' },
            { url: '/knowledge-exchange/', name: 'Pusat pengetahuan' }
          ]
        },
        search: {
          cancelLabel: 'Batal',
          clearLabel: 'Hapus pencarian',
          closeLabel: 'Tutup pencarian',
          emptyBody: 'Tidak ada konten yang cocok. Coba kata kunci lain.',
          emptyTitle: 'Tidak ada hasil',
          loadingLabel: 'Sedang mencari...',
          placeholder: 'Cari produk, artikel, atau solusi',
          resultsLabel: 'Hasil pencarian',
          unavailableBody: 'Pencarian sementara tidak tersedia. Silakan coba lagi nanti.',
          unavailableTitle: 'Pencarian tidak tersedia'
        },
        breadcrumb: {
          ariaLabel: 'Navigasi breadcrumb',
          homeLabel: 'Beranda',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+1 781 334 8391',
          address: 'Spirax Sarco (Indonesia), Jakarta, Indonesia'
        },
        home: {
          heroSummary: 'Solusi, produk, dan layanan sistem steam untuk industri.',
          primaryCtaLabel: 'Lihat produk',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Lihat layanan',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Telepon',
          emailLabel: 'Email',
          featuredTitle: 'Produk unggulan',
          newsTitle: 'Berita',
          servicesTitle: 'Layanan'
        },
        product: {
          benefitsTitle: 'Keunggulan produk',
          overviewTitle: 'Ikhtisar',
          showAllLabel: 'Tampilkan semua',
          collapseLabel: 'Tutup',
          quickFactsTitle: 'Fakta cepat',
          onThisPageLabel: 'Di halaman ini',
          relatedTitle: 'Produk terkait',
          contactBannerTitle: 'Hubungi tim teknis kami',
          contactBannerSubtitle: 'Hubungi Spirax Sarco untuk pemilihan produk, dokumentasi, atau panduan penggantian.',
          contactBannerPrimaryLabel: 'Halaman kontak',
          previousImageLabel: 'Gambar sebelumnya',
          nextImageLabel: 'Gambar berikutnya',
          viewImageLabel: 'Lihat gambar'
        },
        common: {
          learnMoreLabel: 'Pelajari lebih lanjut'
        }
      }
    };
  }

  if (normalized === 'pt') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Alterar idioma'
        },
        nav: {
          utilityAriaLabel: 'Navegação utilitária',
          mainAriaLabel: 'Navegação principal',
          searchAriaLabel: 'Abrir busca',
          searchTitle: 'Abrir busca',
          menuAriaLabel: 'Menu',
          contactLabel: 'Fale conosco',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'Sobre nós' },
            { url: '/learn-about-steam/', name: 'Aprenda sobre vapor' },
            { url: '/resources-and-design-tools/', name: 'Recursos e ferramentas de projeto' },
            { url: '/knowledge-exchange/', name: 'Central de conhecimento' }
          ]
        },
        search: {
          cancelLabel: 'Cancelar',
          clearLabel: 'Limpar busca',
          closeLabel: 'Fechar busca',
          emptyBody: 'Nenhum conteúdo correspondente foi encontrado. Tente outra palavra-chave.',
          emptyTitle: 'Nenhum resultado encontrado',
          loadingLabel: 'Buscando...',
          placeholder: 'Buscar produtos, artigos ou soluções',
          resultsLabel: 'Resultados da busca',
          unavailableBody: 'A busca está temporariamente indisponível. Tente novamente mais tarde.',
          unavailableTitle: 'Busca indisponível'
        },
        breadcrumb: {
          ariaLabel: 'Navegação estrutural',
          homeLabel: 'Início',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+1 781 334 8391',
          address: 'BrasilSpirax Sarco (Brasil), São Paulo, Brasil'
        },
        home: {
          heroSummary: 'Soluções, produtos e serviços para sistemas de vapor industriais.',
          primaryCtaLabel: 'Ver produtos',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Ver serviços',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Telefone',
          emailLabel: 'Email',
          featuredTitle: 'Produtos em destaque',
          newsTitle: 'Notícias',
          servicesTitle: 'Serviços'
        },
        product: {
          benefitsTitle: 'Benefícios do produto',
          overviewTitle: 'Visão geral',
          showAllLabel: 'Mostrar tudo',
          collapseLabel: 'Recolher',
          quickFactsTitle: 'Fatos rápidos',
          onThisPageLabel: 'Nesta página',
          relatedTitle: 'Produtos relacionados',
          contactBannerTitle: 'Fale com nossa equipe técnica',
          contactBannerSubtitle: 'Contate a Spirax Sarco para seleção de produto, documentação ou orientação de substituição.',
          contactBannerPrimaryLabel: 'Página de contato',
          previousImageLabel: 'Imagem anterior',
          nextImageLabel: 'Próxima imagem',
          viewImageLabel: 'Ver imagem'
        },
        common: {
          learnMoreLabel: 'Saiba mais'
        }
      }
    };
  }

  if (normalized === 'th') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'เปลี่ยนภาษา'
        },
        nav: {
          utilityAriaLabel: 'เมนูช่วยเหลือ',
          mainAriaLabel: 'เมนูหลัก',
          searchAriaLabel: 'เปิดการค้นหา',
          searchTitle: 'เปิดการค้นหา',
          menuAriaLabel: 'เมนู',
          contactLabel: 'ติดต่อเรา',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'เกี่ยวกับเรา' },
            { url: '/learn-about-steam/', name: 'เรียนรู้เรื่องไอน้ำ' },
            { url: '/resources-and-design-tools/', name: 'แหล่งข้อมูลและเครื่องมือออกแบบ' },
            { url: '/knowledge-exchange/', name: 'คลังความรู้' }
          ]
        },
        search: {
          cancelLabel: 'ยกเลิก',
          clearLabel: 'ล้างการค้นหา',
          closeLabel: 'ปิดการค้นหา',
          emptyBody: 'ไม่พบเนื้อหาที่ตรงกัน ลองใช้คำค้นอื่น',
          emptyTitle: 'ไม่พบผลลัพธ์',
          loadingLabel: 'กำลังค้นหา...',
          placeholder: 'ค้นหาผลิตภัณฑ์ บทความ หรือโซลูชัน',
          resultsLabel: 'ผลการค้นหา',
          unavailableBody: 'การค้นหาไม่พร้อมใช้งานชั่วคราว โปรดลองอีกครั้งภายหลัง',
          unavailableTitle: 'ไม่สามารถใช้การค้นหาได้'
        },
        breadcrumb: {
          ariaLabel: 'เส้นทางนำทาง',
          homeLabel: 'หน้าแรก',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: 'Spirax Sarco Thailand'
        },
        home: {
          heroSummary: 'โซลูชัน ผลิตภัณฑ์ และบริการสำหรับระบบไอน้ำอุตสาหกรรม',
          primaryCtaLabel: 'ดูผลิตภัณฑ์',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'ดูบริการ',
          secondaryCtaHref: '/services/',
          phoneLabel: 'โทรศัพท์',
          emailLabel: 'อีเมล',
          featuredTitle: 'ผลิตภัณฑ์เด่น',
          newsTitle: 'ข่าวสาร',
          servicesTitle: 'บริการ'
        },
        product: {
          benefitsTitle: 'จุดเด่นของผลิตภัณฑ์',
          overviewTitle: 'ภาพรวม',
          showAllLabel: 'แสดงทั้งหมด',
          collapseLabel: 'ย่อ',
          quickFactsTitle: 'ข้อมูลสำคัญ',
          onThisPageLabel: 'ในหน้านี้',
          relatedTitle: 'ผลิตภัณฑ์ที่เกี่ยวข้อง',
          contactBannerTitle: 'พูดคุยกับทีมเทคนิคของเรา',
          contactBannerSubtitle: 'ติดต่อ Spirax Sarco เพื่อขอคำแนะนำด้านการเลือกผลิตภัณฑ์ เอกสาร หรือการทดแทนสินค้า',
          contactBannerPrimaryLabel: 'หน้าติดต่อ',
          previousImageLabel: 'ภาพก่อนหน้า',
          nextImageLabel: 'ภาพถัดไป',
          viewImageLabel: 'ดูภาพ'
        },
        common: {
          learnMoreLabel: 'เรียนรู้เพิ่มเติม'
        }
      }
    };
  }

  if (normalized === 'vi') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Doi ngon ngu'
        },
        nav: {
          utilityAriaLabel: 'Dieu huong bo tro',
          mainAriaLabel: 'Dieu huong chinh',
          searchAriaLabel: 'Mo tim kiem',
          searchTitle: 'Mo tim kiem',
          menuAriaLabel: 'Menu',
          contactLabel: 'Lien he chung toi',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'Ve chung toi' },
            { url: '/learn-about-steam/', name: 'Tim hieu ve hoi' },
            { url: '/resources-and-design-tools/', name: 'Tai nguyen va cong cu thiet ke' },
            { url: '/knowledge-exchange/', name: 'Trung tam kien thuc' }
          ]
        },
        search: {
          cancelLabel: 'Huy',
          clearLabel: 'Xoa tim kiem',
          closeLabel: 'Dong tim kiem',
          emptyBody: 'Khong tim thay noi dung phu hop. Hay thu tu khoa khac.',
          emptyTitle: 'Khong co ket qua',
          loadingLabel: 'Dang tim kiem...',
          placeholder: 'Tim san pham, bai viet hoac giai phap',
          resultsLabel: 'Ket qua tim kiem',
          unavailableBody: 'Tinh nang tim kiem tam thoi khong kha dung. Vui long thu lai sau.',
          unavailableTitle: 'Khong the tim kiem'
        },
        breadcrumb: {
          ariaLabel: 'Dieu huong breadcrumb',
          homeLabel: 'Trang chu',
          homeHref: '/'
        },
        footer: {
          companyName: 'Spirax Sarco',
          phone: '+44 1242 521361',
          address: 'Spirax Sarco Vietnam'
        },
        home: {
          heroSummary: 'Giai phap, san pham va dich vu cho he thong hoi cong nghiep.',
          primaryCtaLabel: 'Xem san pham',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Xem dich vu',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Dien thoai',
          emailLabel: 'Email',
          featuredTitle: 'San pham noi bat',
          newsTitle: 'Tin tuc',
          servicesTitle: 'Dich vu'
        },
        product: {
          benefitsTitle: 'Loi ich san pham',
          overviewTitle: 'Tong quan',
          showAllLabel: 'Xem tat ca',
          collapseLabel: 'Thu gon',
          quickFactsTitle: 'Thong tin nhanh',
          onThisPageLabel: 'Trong trang nay',
          relatedTitle: 'San pham lien quan',
          contactBannerTitle: 'Trao doi voi doi ngu ky thuat cua chung toi',
          contactBannerSubtitle: 'Lien he Spirax Sarco de duoc ho tro chon san pham, tai lieu hoac huong dan thay the.',
          contactBannerPrimaryLabel: 'Trang lien he',
          previousImageLabel: 'Hinh truoc',
          nextImageLabel: 'Hinh tiep theo',
          viewImageLabel: 'Xem hinh'
        },
        common: {
          learnMoreLabel: 'Tim hieu them'
        }
      }
    };
  }

  if (normalized === 'en') {
    return {
      ui: {
        languageSwitcher: {
          triggerLabel: 'Change language'
        },
        nav: {
          utilityAriaLabel: 'Utility navigation',
          mainAriaLabel: 'Main navigation',
          searchAriaLabel: 'Open search',
          searchTitle: 'Open search',
          menuAriaLabel: 'Menu',
          contactLabel: 'Contact us',
          contactHref: '/contact-us/',
          utilityItems: [
            { url: '/about-us/', name: 'About us' },
            { url: '/learn-about-steam/', name: 'Learn about steam' },
            { url: '/resources-and-design-tools/', name: 'Resources and design tools' },
            { url: '/knowledge-exchange/', name: 'Knowledge exchange' }
          ]
        },
        search: {
          cancelLabel: 'Cancel',
          clearLabel: 'Clear search',
          closeLabel: 'Close search',
          emptyBody: 'No matching content was found. Try another keyword.',
          emptyTitle: 'No results found',
          loadingLabel: 'Searching...',
          placeholder: 'Search products, articles or solutions',
          resultsLabel: 'Search results',
          unavailableBody: 'Search is currently unavailable. Please try again later.',
          unavailableTitle: 'Search unavailable'
        },
        breadcrumb: {
          ariaLabel: 'Breadcrumb navigation',
          homeLabel: 'Home',
          homeHref: '/'
        },
        home: {
          heroSummary: 'Steam system solutions, products and services.',
          primaryCtaLabel: 'View products',
          primaryCtaHref: '/products/',
          secondaryCtaLabel: 'Services',
          secondaryCtaHref: '/services/',
          phoneLabel: 'Phone',
          emailLabel: 'Email',
          featuredTitle: 'Featured products',
          newsTitle: 'News',
          servicesTitle: 'Services'
        },
        product: {
          benefitsTitle: 'Product benefits',
          overviewTitle: 'Overview',
          showAllLabel: 'Show all',
          collapseLabel: 'Collapse',
          quickFactsTitle: 'Quick facts',
          onThisPageLabel: 'On this page',
          relatedTitle: 'Related products',
          contactBannerTitle: 'Talk to our technical team',
          contactBannerSubtitle: 'Contact Spirax Sarco for product selection, documentation or replacement guidance.',
          contactBannerPrimaryLabel: 'Contact page',
          previousImageLabel: 'Previous image',
          nextImageLabel: 'Next image',
          viewImageLabel: 'View image'
        },
        common: {
          learnMoreLabel: 'Learn more'
        }
      }
    };
  }

  return {
    ui: {
      languageSwitcher: {
        triggerLabel: '切换语言'
      },
      nav: {
        utilityAriaLabel: '辅助导航',
        mainAriaLabel: '主导航',
        searchAriaLabel: '打开搜索',
        searchTitle: '打开搜索',
        menuAriaLabel: '菜单',
        contactLabel: '联系我们',
        contactHref: '/contact-us/'
      },
      search: {
        cancelLabel: '取消',
        clearLabel: '清空搜索',
        closeLabel: '关闭搜索',
        emptyBody: '未找到匹配内容，请尝试其他关键词。',
        emptyTitle: '未找到结果',
        loadingLabel: '搜索中...',
        placeholder: '搜索产品、文章或解决方案',
        resultsLabel: '站内搜索结果',
        unavailableBody: '搜索服务暂时不可用，请稍后再试。',
        unavailableTitle: '搜索不可用'
      },
      breadcrumb: {
        ariaLabel: '面包屑导航',
        homeLabel: '首页',
        homeHref: '/'
      }
    }
  };
}

function normalizeLanguageCode(value) {
  return String(value || '').trim() || 'en';
}

function normalizeRelativeDir(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/');
}

function normalizeSiteModeArg(value) {
  return String(value || 'subdir').trim().toLowerCase() === 'standalone' ? 'standalone' : 'subdir';
}

function normalizeSitePathPrefixArg(value) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized === '/') {
    return '/';
  }
  return `/${normalized.replace(/^\/+|\/+$/g, '')}`;
}

function toIntegerArg(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number.parseInt(String(value).trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toBooleanArg(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
