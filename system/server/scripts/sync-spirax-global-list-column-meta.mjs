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

if (!defaultLanguage?.id) {
  throw new Error('未找到默认语言');
}

const learnAboutSteamRoot = loadMdxMetadata(path.join(sourceDocsRoot, 'learn-about-steam', 'index.mdx'));
const learnAboutSteamSections = buildLearnAboutSteamSectionMap(learnAboutSteamRoot);
const publicPathByColumnId = new Map(
  listColumns({ includeTranslations: false }).map((column) => [Number(column.id), column.public_path || '']),
);

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
    WHERE c.column_type = 'list'
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
    metadata.description,
    metadata.seoDescription,
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

console.log(`${dryRun ? '[dry-run] ' : ''}同步完成: ${changed.length} 个列表栏目已${dryRun ? '识别为待更新' : '更新'}.`);

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
  console.log(`未匹配到原站来源的栏目: ${missing.length}`);
  for (const item of missing) {
    console.log(`- [${item.id}] ${item.routePath}`);
  }
}

function resolveSourceMetadata(routePath) {
  const normalizedRoutePath = normalizeRoutePath(routePath);

  if (normalizedRoutePath.startsWith('/learn-about-steam/')) {
    const segments = normalizedRoutePath.split('/').filter(Boolean);
    if (segments.length === 2) {
      const sectionKey = segments[1];
      const section = learnAboutSteamSections.get(sectionKey);
      if (section) {
        return section;
      }
    }
  }

  const sourceRoutePath = mapCurrentRouteToSourceRoute(normalizedRoutePath);
  const sourceFile = resolveSourceFile(sourceRoutePath);
  if (sourceFile) {
    return loadMdxMetadata(sourceFile);
  }

  const sourceHtmlFile = resolveSourceHtmlFile(sourceRoutePath);
  if (sourceHtmlFile) {
    return loadHtmlMetadata(sourceHtmlFile);
  }

  return null;
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
  const pageData = parseExportObject(raw, 'pageData');

  return {
    title: coalesceString(frontmatter.title, pageData?.title, ''),
    description: coalesceString(frontmatter.description, pageData?.summary, ''),
    seoTitle: coalesceString(frontmatter.seoTitle, pageData?.title, ''),
    seoDescription: coalesceString(frontmatter.seoDescription, frontmatter.description, pageData?.summary, ''),
    pageData: pageData && typeof pageData === 'object' ? pageData : null,
  };
}

function loadHtmlMetadata(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const title = decodeHtml(stripTags(matchFirst(raw, /<title>([\s\S]*?)<\/title>/i)));
  const seoDescription = decodeHtml(matchFirst(raw, /<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["'][^>]*>/i));
  const heading = decodeHtml(stripTags(
    matchFirst(raw, /<h1[^>]*>([\s\S]*?)<\/h1>/i),
  ));
  const summary = decodeHtml(stripTags(
    matchFirst(raw, /<p[^>]+class=["'][^"']*(?:banner-primary__copy|sg-short-masthead__summary)[^"']*["'][^>]*>([\s\S]*?)<\/p>/i),
  ));

  return {
    title: heading || title,
    description: summary || seoDescription,
    seoTitle: title,
    seoDescription,
    pageData: {
      title: heading || title,
      summary: summary || '',
    },
  };
}

function buildLearnAboutSteamSectionMap(rootMetadata) {
  const rootTitle = coalesceString(
    rootMetadata?.pageData?.title,
    rootMetadata?.title,
    'Learn about steam',
  );
  const sections = Array.isArray(rootMetadata?.pageData?.sections)
    ? rootMetadata.pageData.sections
    : [];
  const map = new Map();

  for (const section of sections) {
    if (!section || typeof section !== 'object') {
      continue;
    }
    const links = Array.isArray(section.links) ? section.links : [];
    const firstHref = String(links[0]?.href || '').trim();
    if (!firstHref.startsWith('/learn-about-steam/')) {
      continue;
    }
    const slug = firstHref
      .replace(/^\/learn-about-steam\//u, '')
      .replace(/^\/|\/$/gu, '')
      .split('/')
      .filter(Boolean)[0];
    if (!slug) {
      continue;
    }

    const title = coalesceString(section.title, '');
    const description = coalesceString(section.description, '');
    map.set(slug, {
      title,
      description,
      seoTitle: `${title} | ${rootTitle}`,
      seoDescription: description,
      pageData: {
        title,
        summary: rootTitle,
      },
    });
  }

  return map;
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
  const normalized = `/${value.replace(/^\/+|\/+$/gu, '')}/`.replace(/\/{2,}/gu, '/');
  return normalized === '//' ? '/' : normalized;
}

function mapCurrentRouteToSourceRoute(routePath) {
  let normalized = normalizeRoutePath(routePath);
  if (normalized === '/industry/' || normalized.startsWith('/industry/')) {
    normalized = normalized.replace(/^\/industry\//u, '/industries/');
  }
  if (normalized === '/cases/' || normalized.startsWith('/cases/')) {
    normalized = normalized.replace(/^\/cases\//u, '/customer-stories/');
  }
  return normalized;
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
