import fs from 'node:fs';
import path from 'node:path';
import { execute, queryAll, queryOne } from '../src/db.mjs';
import { listColumns } from '../src/services/columns.mjs';

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
const publicPathByColumnId = new Map(
  listColumns({ includeTranslations: false }).map((column) => [Number(column.id), column.public_path || '']),
);

if (!defaultLanguage?.id) {
  throw new Error('未找到默认语言');
}

const rows = queryAll(
  `
    SELECT
      c.id,
      c.dir_name,
      c.legacy_extra,
      ct.name,
      ct.summary,
      ct.seo_title,
      ct.seo_description
    FROM columns c
    JOIN column_translations ct
      ON ct.column_id = c.id
     AND ct.language_id = ?
    WHERE c.column_type = 'single'
    ORDER BY c.id ASC
  `,
  [defaultLanguage.id],
);

const changed = [];
const missing = [];

for (const row of rows) {
  row.route_path = publicPathByColumnId.get(Number(row.id)) || '';
  const metadata = resolveSourceMetadata(row.route_path);
  if (!metadata) {
    missing.push({
      id: row.id,
      routePath: row.route_path,
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
    row.summary,
  );
  const nextSeoTitle = coalesceNullableString(
    metadata.seoTitle,
    metadata.pageData?.title,
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

  const currentLegacyExtra = parseJsonObject(row.legacy_extra);
  const nextLegacyExtra = syncLegacyPageData(currentLegacyExtra, {
    title: metadata.pageData?.title || metadata.title || '',
    summary: metadata.pageData?.summary || nextSummary || '',
    hero: metadata.pageData?.hero,
    heroImage: metadata.pageData?.heroImage,
    mastheadImage: metadata.pageData?.mastheadImage,
  });
  const legacyExtraChanged = JSON.stringify(currentLegacyExtra) !== JSON.stringify(nextLegacyExtra);

  if (!translationChanged && !legacyExtraChanged) {
    continue;
  }

  changed.push({
    id: row.id,
    routePath: row.route_path,
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
    execute(
      `
        UPDATE column_translations
           SET name = ?,
               summary = ?,
               seo_title = ?,
               seo_description = ?,
               updated_at = CURRENT_TIMESTAMP
         WHERE column_id = ?
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
        UPDATE columns
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

console.log(`${dryRun ? '[dry-run] ' : ''}同步完成: ${changed.length} 个单页栏目已${dryRun ? '识别为待更新' : '更新'}.`);

if (changed.length > 0) {
  for (const item of changed) {
    console.log(`- [${item.id}] ${item.routePath}`);
    console.log(`  name: ${stringifyForLog(item.before.name)} -> ${stringifyForLog(item.after.name)}`);
    console.log(`  summary: ${stringifyForLog(item.before.summary)} -> ${stringifyForLog(item.after.summary)}`);
    console.log(`  seo_title: ${stringifyForLog(item.before.seoTitle)} -> ${stringifyForLog(item.after.seoTitle)}`);
    console.log(`  seo_description: ${stringifyForLog(item.before.seoDescription)} -> ${stringifyForLog(item.after.seoDescription)}`);
  }
}

if (missing.length > 0) {
  console.log(`未匹配到原站来源的单页栏目: ${missing.length}`);
  for (const item of missing) {
    console.log(`- [${item.id}] ${item.routePath}`);
  }
}

function resolveSourceMetadata(routePath) {
  const normalizedRoutePath = mapCurrentRouteToSourceRoute(normalizeRoutePath(routePath));
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
    '',
  );
  const summary = coalesceString(
    mdxMetadata?.pageData?.summary,
    htmlMetadata?.pageData?.summary,
    '',
  );
  const seoTitle = coalesceString(
    mdxMetadata?.seoTitle,
    htmlMetadata?.seoTitle,
    title,
  );
  const seoDescription = coalesceString(
    mdxMetadata?.seoDescription,
    htmlMetadata?.seoDescription,
    mdxMetadata?.description,
    summary,
    '',
  );

  return {
    title,
    description: coalesceString(mdxMetadata?.description, htmlMetadata?.description, ''),
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
  const pageData = normalizePageData(parseExportObject(raw, 'pageData'));

  return {
    title: coalesceString(frontmatter.title, pageData?.title, pageData?.hero?.title, ''),
    description: coalesceString(frontmatter.description, ''),
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
    matchFirst(raw, /<p[^>]+class=["'][^"']*(?:banner-primary__copy|sg-short-masthead__summary|home-hero__summary|short-masthead__summary|sg-digital-page__summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i),
  ));
  const heroImage = decodeHtml(extractAttribute(
    matchFirst(raw, /<(?:img|source)[^>]+class=["'][^"']*(?:banner-primary__image|sg-short-masthead__image)[^"']*["'][^>]*>/i),
    'src',
  )) || decodeHtml(
    matchFirst(
      raw,
      /<div[^>]+class=["'][^"']*sg-digital-page__hero-card[^"']*["'][^>]*style=["'][^"']*background-image:\s*url\(([^)"']+)\)["']/i,
    ),
  );

  return {
    title: heading || title,
    description: summary || '',
    seoTitle: title,
    seoDescription,
    pageData: {
      title: heading || title,
      summary: summary || '',
      ...(heroImage ? { heroImage, mastheadImage: heroImage } : {}),
    },
  };
}

function normalizePageData(pageData) {
  if (!pageData || typeof pageData !== 'object') {
    return null;
  }

  const normalized = { ...pageData };
  const existingHero = normalized.hero && typeof normalized.hero === 'object'
    ? { ...normalized.hero }
    : {};
  const title = coalesceString(
    normalized.title,
    existingHero.title,
    '',
  );
  const summary = coalesceString(
    normalized.summary,
    normalized.heroSummary,
    existingHero.summary,
    '',
  );
  const heroImage = coalesceString(
    normalized.heroImage,
    normalized.mastheadImage,
    normalized.heroSummaryImage,
    existingHero.image,
    '',
  );
  const heroTitle = coalesceString(existingHero.title, title, '');
  const heroSummary = coalesceString(existingHero.summary, normalized.heroSummary, summary, '');

  if (title) {
    normalized.title = title;
  }

  if (summary) {
    normalized.summary = summary;
  }

  if (heroImage) {
    normalized.heroImage = heroImage;
    normalized.mastheadImage = coalesceString(normalized.mastheadImage, heroImage);
  }

  if (heroTitle || heroSummary || Object.keys(existingHero).length > 0) {
    normalized.hero = existingHero;
    if (heroTitle) {
      normalized.hero.title = heroTitle;
    }
    if (heroSummary) {
      normalized.hero.summary = heroSummary;
    }
    if (heroImage) {
      normalized.hero.image = heroImage;
    }
  }

  return normalized;
}

function syncLegacyPageData(currentLegacyExtra, incoming) {
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

  const incomingHeroImage = coalesceString(
    incoming.hero?.image,
    incoming.heroImage,
    incoming.mastheadImage,
    '',
  );
  if (incomingHeroImage) {
    currentPageData.heroImage = incomingHeroImage;
    currentPageData.mastheadImage = incomingHeroImage;
  }

  const currentHero = currentPageData.hero && typeof currentPageData.hero === 'object'
    ? { ...currentPageData.hero }
    : {};
  const incomingHero = incoming.hero && typeof incoming.hero === 'object'
    ? incoming.hero
    : null;

  const nextHeroTitle = coalesceString(incomingHero?.title, incoming.title, currentHero.title);
  const nextHeroSummary = coalesceString(incomingHero?.summary, incoming.summary, currentHero.summary);

  if (nextHeroTitle || nextHeroSummary || Object.keys(currentHero).length > 0) {
    if (nextHeroTitle) {
      currentHero.title = nextHeroTitle;
    }
    if (nextHeroSummary) {
      currentHero.summary = nextHeroSummary;
    }
    if (incomingHeroImage) {
      currentHero.image = incomingHeroImage;
    }
    currentPageData.hero = currentHero;
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

function mapCurrentRouteToSourceRoute(routePath) {
  return normalizeRoutePath(routePath);
}

function parseFrontmatter(raw) {
  const match = raw.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  const result = {};
  for (const line of match[1].split('\n')) {
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!pair) {
      continue;
    }
    const key = pair[1];
    let value = pair[2].trim();
    value = value.replace(/^['"]|['"]$/g, '');
    result[key] = value;
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
      Array.from(tag.matchAll(/([A-Za-z_:.-]+)\s*=\s*["']([\s\S]*?)["']/gu)).map((match) => [
        String(match[1] || '').toLowerCase(),
        match[2] || '',
      ]),
    );
    if (String(attrs.name || '').toLowerCase() === targetName && attrs.content) {
      return decodeHtml(attrs.content);
    }
  }

  return '';
}

function extractAttribute(tag, attributeName) {
  const tagText = String(tag || '');
  const targetName = String(attributeName || '').trim();
  if (!tagText || !targetName) {
    return '';
  }
  const match = tagText.match(new RegExp(`${targetName}\\s*=\\s*["']([\\s\\S]*?)["']`, 'i'));
  return match ? match[1] || '' : '';
}

function decodeHtml(value) {
  const input = String(value || '');
  return input
    .replace(/&#(\d+);/gu, (_, codePoint) => String.fromCodePoint(Number(codePoint)))
    .replace(/&#x([0-9a-f]+);/giu, (_, codePoint) => String.fromCodePoint(Number.parseInt(codePoint, 16)))
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, '\'')
    .replace(/&apos;/gu, '\'')
    .replace(/&amp;/gu, '&')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&nbsp;/gu, ' ')
    .trim();
}

function stripTags(value) {
  return String(value || '')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function matchFirst(value, pattern) {
  const match = String(value || '').match(pattern);
  return match?.[1] || '';
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
  return normalized ? normalized : null;
}

function coalesceNullableString(...values) {
  return nullableString(coalesceString(...values));
}

function stringifyForLog(value) {
  return value == null || value === ''
    ? 'NULL'
    : JSON.stringify(String(value));
}
