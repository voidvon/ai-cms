import fs from 'node:fs';
import path from 'node:path';
import { execute, queryAll, queryOne } from '../src/db.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';

const sourceDocsRoot = path.join(sourceRoot, 'docs', 'zh-cn');
const sourceDistRoot = path.join(sourceRoot, 'dist', 'zh-cn');
const dryRun = process.argv.includes('--dry-run');

if (!fs.existsSync(sourceDocsRoot)) {
  throw new Error(`未找到原站 docs 目录: ${sourceDocsRoot}`);
}

if (!fs.existsSync(sourceDistRoot)) {
  throw new Error(`未找到原站 dist 目录: ${sourceDistRoot}`);
}

const defaultLanguage = queryOne(`
  SELECT id, code
  FROM languages
  WHERE is_default = 1
  ORDER BY id ASC
  LIMIT 1
`);

if (!defaultLanguage?.id) {
  throw new Error('未找到默认语言');
}

const contentRows = [
  ...queryAll(
    `
      SELECT
        'news' AS entry_type,
        n.id,
        n.custom_url,
        n.code,
        NULL AS legacy_extra,
        t.name,
        t.summary,
        t.seo_title,
        t.seo_description
      FROM content_news n
      JOIN content_news_translations t
        ON t.entry_id = n.id
       AND t.language_id = ?
      ORDER BY n.id ASC
    `,
    [defaultLanguage.id],
  ),
  ...queryAll(
    `
      SELECT
        'product' AS entry_type,
        p.id,
        p.custom_url,
        p.code,
        p.legacy_extra,
        t.name,
        t.summary,
        t.seo_title,
        t.seo_description
      FROM content_product p
      JOIN content_product_translations t
        ON t.entry_id = p.id
       AND t.language_id = ?
      ORDER BY p.id ASC
    `,
    [defaultLanguage.id],
  ),
];

const changed = [];
const missing = [];

for (const row of contentRows) {
  const metadata = resolveSourceMetadata(row);
  if (!metadata) {
    missing.push({
      entryType: row.entry_type,
      id: row.id,
      customUrl: row.custom_url,
      code: row.code,
    });
    continue;
  }

  const nextName = coalesceString(
    metadata.pageData?.title,
    metadata.title,
    row.name,
  );
  const nextSummary = coalesceString(
    metadata.pageData?.summary,
    metadata.description,
    row.summary,
  );
  const nextSeoTitle = coalesceNullableString(
    metadata.seoTitle,
    metadata.title,
    row.seo_title,
  );
  const nextSeoDescription = coalesceNullableString(
    metadata.seoDescription,
    metadata.description,
    metadata.pageData?.summary,
    row.seo_description,
  );

  const translationChanged = (
    String(row.name || '') !== nextName
    || String(row.summary || '') !== nextSummary
    || nullableString(row.seo_title) !== nextSeoTitle
    || nullableString(row.seo_description) !== nextSeoDescription
  );

  const currentLegacyExtra = row.entry_type === 'product'
    ? parseJsonObject(row.legacy_extra)
    : null;
  const nextLegacyExtra = row.entry_type === 'product'
    ? syncProductLegacyPageData(currentLegacyExtra, {
        title: metadata.pageData?.title || metadata.title || '',
        summary: metadata.pageData?.summary || metadata.description || '',
      })
    : null;
  const legacyExtraChanged = row.entry_type === 'product'
    ? JSON.stringify(currentLegacyExtra) !== JSON.stringify(nextLegacyExtra)
    : false;

  if (!translationChanged && !legacyExtraChanged) {
    continue;
  }

  changed.push({
    entryType: row.entry_type,
    id: row.id,
    customUrl: row.custom_url,
    before: {
      name: row.name,
      summary: row.summary,
      seoTitle: row.seo_title,
      seoDescription: row.seo_description,
    },
    after: {
      name: nextName,
      summary: nextSummary,
      seoTitle: nextSeoTitle,
      seoDescription: nextSeoDescription,
    },
  });

  if (dryRun) {
    continue;
  }

  if (translationChanged) {
    const translationTable = row.entry_type === 'news'
      ? 'content_news_translations'
      : 'content_product_translations';
    execute(
      `
        UPDATE ${translationTable}
           SET name = ?,
               summary = ?,
               seo_title = ?,
               seo_description = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE entry_id = ?
           AND language_id = ?
      `,
      [
        nextName,
        nextSummary,
        nextSeoTitle,
        nextSeoDescription,
        row.id,
        defaultLanguage.id,
      ],
    );
  }

  if (legacyExtraChanged) {
    execute(
      `
        UPDATE content_product
           SET legacy_extra = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
      `,
      [
        JSON.stringify(nextLegacyExtra),
        row.id,
      ],
    );
  }
}

console.log(`${dryRun ? '[dry-run] ' : ''}同步完成: ${changed.length} 个内容页已${dryRun ? '识别为待更新' : '更新'}.`);

if (changed.length > 0) {
  for (const item of changed) {
    console.log(`- [${item.entryType}:${item.id}] ${item.customUrl || item.after.name}`);
    console.log(`  name: ${stringifyForLog(item.before.name)} -> ${stringifyForLog(item.after.name)}`);
    console.log(`  summary: ${stringifyForLog(item.before.summary)} -> ${stringifyForLog(item.after.summary)}`);
    console.log(`  seo_title: ${stringifyForLog(item.before.seoTitle)} -> ${stringifyForLog(item.after.seoTitle)}`);
    console.log(`  seo_description: ${stringifyForLog(item.before.seoDescription)} -> ${stringifyForLog(item.after.seoDescription)}`);
  }
}

if (missing.length > 0) {
  console.log(`未匹配到原站来源的内容页: ${missing.length}`);
  for (const item of missing) {
    console.log(`- [${item.entryType}:${item.id}] ${item.customUrl || item.code || ''}`);
  }
}

function resolveSourceMetadata(row) {
  const sourceRoute = row.entry_type === 'news'
    ? resolveNewsSourceRoute(row)
    : resolveProductSourceRoute(row);
  if (!sourceRoute) {
    return null;
  }

  const sourceFile = resolveSourceFile(sourceRoute);
  const sourceHtmlFile = resolveSourceHtmlFile(sourceRoute);
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
    '',
  );
  const summary = coalesceString(
    mdxMetadata?.pageData?.summary,
    htmlMetadata?.pageData?.summary,
    htmlMetadata?.description,
    mdxMetadata?.description,
    '',
  );
  const seoTitle = coalesceString(
    htmlMetadata?.seoTitle,
    mdxMetadata?.seoTitle,
    title,
  );
  const seoDescription = coalesceString(
    htmlMetadata?.seoDescription,
    mdxMetadata?.seoDescription,
    mdxMetadata?.description,
    summary,
    '',
  );

  return {
    title,
    description: coalesceString(htmlMetadata?.description, mdxMetadata?.description, summary),
    seoTitle,
    seoDescription,
    pageData: {
      ...(htmlMetadata?.pageData && typeof htmlMetadata.pageData === 'object' ? htmlMetadata.pageData : {}),
      ...(mdxMetadata?.pageData && typeof mdxMetadata.pageData === 'object' ? mdxMetadata.pageData : {}),
      ...(title ? { title } : {}),
      ...(summary ? { summary } : {}),
    },
  };
}

function resolveNewsSourceRoute(row) {
  return normalizeRoutePath(row.custom_url);
}

function resolveProductSourceRoute(row) {
  const legacyExtra = parseJsonObject(row.legacy_extra);
  const key = String(legacyExtra?.key || '').trim();
  const routePath = normalizeRoutePath(legacyExtra?.route_path || '/products/');
  const detailSegment = String(row.custom_url || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/index\.html$/i, '')
    .replace(/index\.html$/i, '')
    .replace(/^\/+|\/+$/g, '');

  if (key.startsWith('product:')) {
    const productKey = key.slice('product:'.length).replace(/^\/+/, '').replace(/\/+$/g, '');
    if (productKey.includes('/')) {
      return normalizeRoutePath(`/products/${productKey}/`);
    }
    if (detailSegment) {
      return normalizeRoutePath(`${routePath}${detailSegment}/`);
    }
    return normalizeRoutePath(`/products/${productKey}/`);
  }

  if (key) {
    return normalizeRoutePath(`/products/${key.replace(/^\/+/, '').replace(/\/+$/g, '')}/`);
  }

  if (!detailSegment) {
    return null;
  }
  return normalizeRoutePath(`${routePath}${detailSegment}/`);
}

function resolveSourceFile(routePath) {
  const normalized = normalizeRoutePath(routePath);
  const relativeRoutePath = normalized.replace(/^\/+/u, '').replace(/\/$/u, '');
  const candidates = [
    path.join(sourceDocsRoot, relativeRoutePath, 'index.mdx'),
    path.join(sourceDocsRoot, relativeRoutePath, 'index.md'),
    path.join(sourceDocsRoot, `${relativeRoutePath}.mdx`),
    path.join(sourceDocsRoot, `${relativeRoutePath}.md`),
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function resolveSourceHtmlFile(routePath) {
  const normalized = normalizeRoutePath(routePath);
  const relativeRoutePath = normalized.replace(/^\/+/u, '').replace(/\/$/u, '');
  const candidate = relativeRoutePath
    ? path.join(sourceDistRoot, relativeRoutePath, 'index.html')
    : path.join(sourceDistRoot, 'index.html');

  return fs.existsSync(candidate) ? candidate : null;
}

function loadMdxMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const pageData = normalizePageData(safeParseExportObject(raw, 'pageData'));

  return {
    title: coalesceString(pageData?.title, frontmatter.title, ''),
    description: coalesceString(pageData?.summary, frontmatter.description, ''),
    seoTitle: coalesceString(frontmatter.seoTitle, ''),
    seoDescription: coalesceString(frontmatter.seoDescription, frontmatter.description, ''),
    pageData,
  };
}

function loadHtmlMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const title = decodeHtml(stripTags(matchFirst(raw, /<title>([\s\S]*?)<\/title>/i)));
  const seoDescription = extractMetaContent(raw, 'description');
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
    title: heading || title,
    description: summary || seoDescription,
    seoTitle: title,
    seoDescription,
    pageData: {
      title: heading || title,
      summary: summary || seoDescription || '',
    },
  };
}

function normalizePageData(pageData) {
  if (!pageData || typeof pageData !== 'object') {
    return null;
  }

  const normalized = { ...pageData };
  const title = coalesceString(
    normalized.title,
    normalized.hero?.title,
    '',
  );
  const summary = coalesceString(
    normalized.summary,
    normalized.heroSummary,
    normalized.hero?.summary,
    '',
  );

  if (title) {
    normalized.title = title;
  }
  if (summary) {
    normalized.summary = summary;
  }

  return normalized;
}

function syncProductLegacyPageData(currentLegacyExtra, incoming) {
  const nextLegacyExtra = currentLegacyExtra && typeof currentLegacyExtra === 'object'
    ? { ...currentLegacyExtra }
    : {};

  const currentPageData = nextLegacyExtra.page_data && typeof nextLegacyExtra.page_data === 'object'
    ? { ...nextLegacyExtra.page_data }
    : {};

  if (incoming.title) {
    currentPageData.title = incoming.title;
  }
  if (incoming.summary) {
    currentPageData.summary = incoming.summary;
  }

  if (Object.keys(currentPageData).length > 0) {
    nextLegacyExtra.page_data = currentPageData;
  }

  return nextLegacyExtra;
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

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const lines = match[1].split('\n');
  const result = {};
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }

    const key = pair[1];
    const inlineValue = pair[2].trim();
    if (inlineValue) {
      result[key] = stripWrappingQuotes(inlineValue);
      continue;
    }

    const blockLines = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const blockLine = lines[cursor];
      if (/^[A-Za-z0-9_]+:\s*/.test(blockLine)) {
        break;
      }
      if (blockLine.trim()) {
        blockLines.push(blockLine.trim());
      }
      cursor += 1;
    }
    index = cursor - 1;
    result[key] = stripWrappingQuotes(blockLines.join('\n').trim());
  }
  return result;
}

function parseExportObject(raw, exportName) {
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
        return Function(`"use strict"; return (${objectLiteral});`)();
      }
    }
  }

  return null;
}

function safeParseExportObject(raw, exportName) {
  try {
    return parseExportObject(raw, exportName);
  } catch {
    return null;
  }
}

function parseJsonObject(value) {
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

function extractMetaContent(html, name) {
  const tags = String(html || '').match(/<meta\b[^>]*>/giu) || [];
  const targetName = String(name || '').trim().toLowerCase();

  for (const tag of tags) {
    const attrs = Object.fromEntries(
      Array.from(tag.matchAll(/([A-Za-z_:.-]+)\s*=\s*(["'])([\s\S]*?)\2/gu)).map((match) => [
        String(match[1] || '').toLowerCase(),
        match[3] || '',
      ]),
    );
    if (String(attrs.name || '').toLowerCase() === targetName && attrs.content) {
      return decodeHtml(attrs.content);
    }
  }

  return '';
}

function matchFirst(value, pattern) {
  const match = String(value || '').match(pattern);
  return match?.[1] || '';
}

function stripTags(value) {
  return String(value || '').replace(/<[^>]+>/g, ' ');
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
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

function coalesceString(...values) {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function coalesceNullableString(...values) {
  const value = coalesceString(...values);
  return value || null;
}

function nullableString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function stringifyForLog(value) {
  if (value === null || value === undefined || value === '') {
    return '""';
  }
  return JSON.stringify(String(value));
}
