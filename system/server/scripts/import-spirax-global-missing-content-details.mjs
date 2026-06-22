import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContentItem, listContentItems } from '../src/services/content-items.mjs';
import { getDefaultLanguage } from '../src/services/languages.mjs';
import { listColumns } from '../src/services/columns.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../..');
const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Volumes/DATA/Space/spirax-global';
const sourceDocsRoot = path.join(sourceRoot, 'docs', 'zh-cn');
const sourceDistRoot = path.join(sourceRoot, 'dist', 'zh-cn');
const htmlRoot = path.join(projectRoot, 'html');
const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
const MODEL_CODE = 'product';

const missingContentDetails = [
  {
    slug: 'avm7-stainless-steel-thermostatic-air-vent',
    routePath: '/products/clean-steam/',
    sourceFile: path.join(sourceDocsRoot, 'products/clean-steam/avm7-stainless-steel-thermostatic-air-vent/index.mdx')
  },
  {
    slug: 'clean-steam-generators',
    routePath: '/products/clean-steam/',
    sourceFile: path.join(sourceDocsRoot, 'products/clean-steam/clean-steam-generators/index.mdx')
  },
  {
    slug: 'm70i-and-m80i-sanitary-ball-valves',
    routePath: '/products/clean-steam/',
    sourceFile: path.join(sourceDocsRoot, 'products/clean-steam/m70i-and-m80i-sanitary-ball-valves/index.mdx')
  },
  {
    slug: 'steritrol-clean-service-control-valve',
    routePath: '/products/clean-steam/',
    sourceFile: path.join(sourceDocsRoot, 'products/clean-steam/steritrol-clean-service-control-valve/index.mdx')
  },
  {
    slug: 'svl488-clean-service-safety-valve',
    routePath: '/products/clean-steam/',
    sourceFile: path.join(sourceDocsRoot, 'products/clean-steam/svl488-clean-service-safety-valve/index.mdx')
  },
  {
    slug: 'tfa-flowmeters',
    routePath: '/products/flowmetering/target-flowmeters/',
    sourceFile: path.join(sourceDocsRoot, 'products/flowmetering/target-flowmeters/tfa-flowmeters/index.mdx')
  },
  {
    slug: 'tva-flowmeters',
    routePath: '/products/flowmetering/target-flowmeters/',
    sourceFile: path.join(sourceDocsRoot, 'products/flowmetering/target-flowmeters/tva-flowmeters/index.mdx')
  }
];

const imported = [];
const skipped = [];
const copiedAssets = new Set();
const columnsByRoutePath = new Map(
  listColumns({ includeHidden: true, includeTranslations: true, languageCode: defaultLanguageCode })
    .map((item) => [String(item.route_path || '').trim(), item])
    .filter((item) => item[0])
);
const existingContentItems = listContentItems(MODEL_CODE, {
  visibleOnly: false,
  limit: 10000,
  languageCode: defaultLanguageCode
});

for (const definition of missingContentDetails) {
  const column = columnsByRoutePath.get(definition.routePath);
  if (!column) {
    throw new Error(`未找到内容栏目: ${definition.routePath}`);
  }

  const customUrl = `${definition.slug}/index.html`;
  const existing = existingContentItems.find((item) => (
    Number(item.column_id || 0) === Number(column.id || 0)
    && String(item.custom_url || '').trim() === customUrl
  ));
  if (existing) {
    skipped.push({
      slug: definition.slug,
      contentItemId: existing.id,
      reason: 'already_exists'
    });
    continue;
  }

  const parsed = parseSourceMdx(definition.sourceFile);
  const title = String(parsed.title || definition.slug).trim();
  const summary = String(parsed.seoDescription || '').trim();
  const primaryImage = resolvePrimaryImage(parsed);
  const legacyExtra = {
    import_source: 'spirax-global',
    key: `${MODEL_CODE}:${definition.slug}`,
    route_path: definition.routePath,
    page_data: parsed.pageData || null
  };

  const payload = {
    base: {
      column_id: column.id,
      custom_url: customUrl,
      code: deriveCodeFromSlug(definition.slug),
      images: primaryImage ? [primaryImage] : [],
      primary_image: primaryImage || '',
      is_visible: 1,
      is_featured_home: 0,
      sort_order: getNextSortOrder(existingContentItems, column.id),
      legacy_extra: JSON.stringify(legacyExtra),
      created_at: null
    },
    translations: {
      [defaultLanguageCode]: {
        name: title,
        summary,
        content_html: parsed.bodyHtml || '',
        keywords: null,
        seo_title: parsed.seoTitle || title,
        seo_description: summary || null,
        publish_status: 'published'
      }
    }
  };

  const record = createContentItem(MODEL_CODE, payload);
  imported.push({
    slug: definition.slug,
    contentItemId: record.id,
    columnId: column.id,
    title
  });
  existingContentItems.push(record);

  for (const assetPath of collectReferencedImagePaths(parsed)) {
    const copied = syncAsset(assetPath);
    if (copied) {
      copiedAssets.add(copied);
    }
  }
}

console.log(JSON.stringify({
  imported,
  skipped,
  copied_assets: Array.from(copiedAssets).sort()
}, null, 2));

function getNextSortOrder(products, columnId) {
  return products
    .filter((item) => Number(item.column_id || 0) === Number(columnId || 0))
    .reduce((max, item) => Math.max(max, Number(item.sort_order || 0)), 0) + 1;
}

function deriveCodeFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .slice(0, 3)
    .join('-')
    .toUpperCase();
}

function resolvePrimaryImage(parsed) {
  const frontmatterImage = Array.isArray(parsed.coverImages) && parsed.coverImages[0]?.src
    ? String(parsed.coverImages[0].src).trim()
    : '';
  const pageImage = parsed.pageData?.mastheadImage
    ? String(parsed.pageData.mastheadImage).trim()
    : '';
  return mapImagePath(frontmatterImage || pageImage);
}

function collectReferencedImagePaths(parsed) {
  const values = new Set();
  const candidates = [
    ...(Array.isArray(parsed.coverImages) ? parsed.coverImages.map((item) => item?.src) : []),
    parsed.pageData?.mastheadImage || null
  ];
  for (const value of candidates) {
    const normalized = mapImagePath(value);
    if (normalized) {
      values.add(normalized);
    }
  }
  return Array.from(values);
}

function mapImagePath(value) {
  const normalized = String(value || '').trim();
  if (!normalized.startsWith('/images/')) {
    return '';
  }

  const relativePath = normalized.replace(/^\/+/, '');
  const currentTarget = path.join(htmlRoot, relativePath);
  if (fs.existsSync(currentTarget)) {
    return normalized;
  }

  const uploadsAlias = normalized.replace(/^\/images\/global\/products\//, '/uploads/images/202606/');
  const uploadsTarget = path.join(htmlRoot, uploadsAlias.replace(/^\/+/, ''));
  if (fs.existsSync(uploadsTarget)) {
    return uploadsAlias;
  }

  return normalized;
}

function syncAsset(publicPath) {
  const normalized = String(publicPath || '').trim();
  if (!normalized.startsWith('/images/')) {
    return '';
  }
  const relativePath = normalized.replace(/^\/+/, '');
  const targetPath = path.join(htmlRoot, relativePath);
  if (fs.existsSync(targetPath)) {
    return relativePath;
  }
  const sourcePath = path.join(sourceDistRoot, relativePath);
  if (!fs.existsSync(sourcePath)) {
    return '';
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  return relativePath;
}

function parseSourceMdx(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(raw);
  const pageData = parseExportObject(raw, 'pageData');
  const bodyHtml = extractBodyHtml(raw, pageData);
  return {
    title: String(frontmatter.title || pageData?.title || '').trim(),
    seoTitle: String(frontmatter.seoTitle || pageData?.title || '').trim(),
    seoDescription: String(frontmatter.seoDescription || frontmatter.description || pageData?.summary || '').trim(),
    coverImages: Array.isArray(frontmatter.coverImages) ? frontmatter.coverImages : [],
    bodyHtml,
    pageData
  };
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
    let value = pair[2].trim();
    if (key === 'coverImages') {
      const items = [];
      let cursor = index + 1;
      while (cursor < lines.length && /^\s*- /.test(lines[cursor])) {
        const srcMatch = lines[cursor].match(/src:\s*['"]([^'"]+)['"]/);
        const altMatch = (lines[cursor + 1] || '').match(/alt:\s*['"]([^'"]+)['"]/);
        items.push({
          src: srcMatch ? srcMatch[1] : '',
          alt: altMatch ? altMatch[1] : ''
        });
        cursor += 2;
      }
      result[key] = items.filter((item) => item.src);
      index = cursor - 1;
      continue;
    }
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
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        const objectLiteral = raw.slice(braceStart, index + 1);
        return Function(`"use strict"; return (${objectLiteral});`)();
      }
    }
  }
  return null;
}

function extractBodyHtml(raw, pageData = null) {
  let content = stripFrontmatter(raw)
    .replace(/^import\s.+?;?\s*$/gmu, '')
    .trim();

  content = removeExportObjectBlock(content, 'pageData');
  content = content
    .replace(/<\/?ProductCategoryPage[^>]*>/g, '')
    .trim();

  const directHtml = renderMarkdownLikeHtml(content);
  if (hasMeaningfulHtml(directHtml)) {
    return directHtml;
  }

  return renderBodyHtmlFromPageData(pageData);
}

function stripFrontmatter(raw) {
  return raw.replace(/^---\n[\s\S]*?\n---\n?/u, '');
}

function removeExportObjectBlock(raw, exportName) {
  const marker = `export const ${exportName} =`;
  const start = raw.indexOf(marker);
  if (start < 0) {
    return raw;
  }
  const braceStart = raw.indexOf('{', start);
  if (braceStart < 0) {
    return raw;
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
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        let end = index + 1;
        while (end < raw.length && /\s/u.test(raw[end])) {
          end += 1;
        }
        if (raw[end] === ';') {
          end += 1;
        }
        while (end < raw.length && /\s/u.test(raw[end])) {
          end += 1;
        }
        return `${raw.slice(0, start)}${raw.slice(end)}`;
      }
    }
  }
  return raw;
}

function renderMarkdownLikeHtml(content) {
  if (!content) {
    return '';
  }
  const lines = content.split('\n');
  const html = [];
  let inList = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html.push('</ul>');
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith('- ')) {
      if (!inList) {
        html.push('<ul>');
        inList = true;
      }
      html.push(`<li>${renderInlineHtml(trimmed.slice(2))}</li>`);
      continue;
    }
    if (inList) {
      html.push('</ul>');
      inList = false;
    }
    if (trimmed.startsWith('## ')) {
      html.push(`<h2>${renderInlineHtml(trimmed.slice(3))}</h2>`);
      continue;
    }
    if (trimmed.startsWith('### ')) {
      html.push(`<h3>${renderInlineHtml(trimmed.slice(4))}</h3>`);
      continue;
    }
    html.push(`<p>${renderInlineHtml(trimmed)}</p>`);
  }
  if (inList) {
    html.push('</ul>');
  }
  return html.join('\n');
}

function renderBodyHtmlFromPageData(pageData) {
  if (!pageData || typeof pageData !== 'object') {
    return '';
  }
  const parts = [];
  if (Array.isArray(pageData.overview)) {
    for (const paragraph of pageData.overview) {
      const text = String(paragraph || '').trim();
      if (text) {
        parts.push(`<p>${renderInlineHtml(text)}</p>`);
      }
    }
  }
  return parts.join('\n');
}

function hasMeaningfulHtml(value) {
  return String(value || '').replace(/<[^>]+>/g, '').trim().length > 0;
}

function renderInlineHtml(value) {
  return escapeHtml(String(value || ''))
    .replace(/&lt;a href=&quot;([^"]+)&quot;&gt;([\s\S]*?)&lt;\/a&gt;/g, '<a href="$1">$2</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}
