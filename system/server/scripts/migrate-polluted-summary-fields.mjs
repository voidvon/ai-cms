import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');

const POLLUTED_PREFIX = /^width=device-width,\s*initial-scale=1/i;
const TABLES = [
  {
    translationTable: 'column_translations',
    sourceTable: 'columns',
    sourceIdField: 'column_id',
    sourceKeySql: 'coalesce(s.route_path, s.dir_name, cast(s.id as text))'
  },
  {
    translationTable: 'content_product_translations',
    sourceTable: 'content_product',
    sourceIdField: 'entry_id',
    sourceKeySql: 'coalesce(s.custom_url, s.code, cast(s.id as text))'
  },
  {
    translationTable: 'content_news_translations',
    sourceTable: 'content_news',
    sourceIdField: 'entry_id',
    sourceKeySql: 'coalesce(s.custom_url, s.code, cast(s.id as text))'
  }
];

const db = getDb();

function decodeHtmlEntities(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => {
      const parsed = Number.parseInt(code, 10);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : _;
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => {
      const parsed = Number.parseInt(code, 16);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : _;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function normalizeText(value) {
  return decodeHtmlEntities(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCleanSummary(value) {
  const text = normalizeText(value);
  return Boolean(text) && !POLLUTED_PREFIX.test(text);
}

function extractAfterH1Paragraph(html) {
  const match = String(html || '').match(/<h1\b[^>]*>[\s\S]*?<\/h1>[\s\S]{0,1200}?<p\b[^>]*>([\s\S]*?)<\/p>/i);
  if (!match) {
    return '';
  }
  return normalizeText(match[1]);
}

function extractFirstParagraph(html) {
  const source = String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, ' ');
  const matches = source.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi);
  for (const match of matches) {
    const text = normalizeText(match[1]);
    if (text.length >= 24 && !POLLUTED_PREFIX.test(text)) {
      return text;
    }
  }
  return '';
}

function extractIntroFromTemplateData(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return '';
  }
  if (typeof parsed.intro === 'string') {
    const text = normalizeText(parsed.intro);
    if (text) {
      return text;
    }
  }
  if (Array.isArray(parsed.intro)) {
    for (const item of parsed.intro) {
      const text = normalizeText(item);
      if (text) {
        return text;
      }
    }
  }
  if (parsed.intro && typeof parsed.intro === 'object' && typeof parsed.intro.body === 'string') {
    const text = normalizeText(parsed.intro.body);
    if (text) {
      return text;
    }
  }
  if (parsed.overview && Array.isArray(parsed.overview)) {
    for (const item of parsed.overview) {
      const text = normalizeText(item);
      if (text) {
        return text;
      }
    }
  }
  return '';
}

function sanitizeSeoDescription(value, name = '') {
  const text = normalizeText(value);
  if (!text || POLLUTED_PREFIX.test(text)) {
    return '';
  }
  if (!name) {
    return text;
  }
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const prefixPattern = new RegExp(`^${escapedName}\\s+`, 'i');
  return text.replace(prefixPattern, '').trim() || text;
}

function deriveSummary(row, parsedTemplateData) {
  const candidates = [
    extractAfterH1Paragraph(row.content_html),
    extractFirstParagraph(row.content_html),
    extractIntroFromTemplateData(parsedTemplateData),
    sanitizeSeoDescription(row.seo_description, row.name)
  ];

  for (const candidate of candidates) {
    if (candidate && !POLLUTED_PREFIX.test(candidate)) {
      return candidate;
    }
  }
  return '';
}

function parseTemplateDataJson(value) {
  const raw = String(value || '').trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function updateTemplateDataSummary(parsed, nextSummary) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return parsed;
  }
  parsed.summary = nextSummary;
  if (parsed.hero && typeof parsed.hero === 'object' && !Array.isArray(parsed.hero)) {
    parsed.hero.summary = nextSummary;
  }
  return parsed;
}

function loadRows(config) {
  return db.prepare(`
    SELECT
      t.id,
      t.${config.sourceIdField} AS source_id,
      l.code AS language_code,
      ${config.sourceKeySql} AS source_key,
      t.name,
      t.summary,
      t.content_html,
      t.template_data_json,
      t.seo_description
    FROM ${config.translationTable} t
    JOIN ${config.sourceTable} s ON s.id = t.${config.sourceIdField}
    JOIN languages l ON l.id = t.language_id
    WHERE t.summary LIKE ?
       OR t.template_data_json LIKE ?
    ORDER BY l.sort_order ASC, l.id ASC, t.id ASC
  `).all('width=device-width,%', '%width=device-width,%');
}

let changed = 0;
let unresolved = 0;
const details = [];

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  for (const config of TABLES) {
    const rows = loadRows(config);
    const updateStatement = db.prepare(`
      UPDATE ${config.translationTable}
      SET summary = ?, template_data_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);

    for (const row of rows) {
      const parsed = parseTemplateDataJson(row.template_data_json);
      const nextSummary = deriveSummary(row, parsed);

      if (!nextSummary) {
        unresolved += 1;
        details.push({
          table: config.translationTable,
          id: row.id,
          sourceId: row.source_id,
          languageCode: row.language_code,
          sourceKey: row.source_key,
          changed: false,
          reason: 'no-derived-summary'
        });
        continue;
      }

      const nextTemplateData = updateTemplateDataSummary(parsed ? { ...parsed, hero: parsed.hero && typeof parsed.hero === 'object' && !Array.isArray(parsed.hero) ? { ...parsed.hero } : parsed.hero } : parsed, nextSummary);
      const nextTemplateDataJson = nextTemplateData ? JSON.stringify(nextTemplateData, null, 2) : row.template_data_json;
      const didChange = String(row.summary || '') !== nextSummary || String(row.template_data_json || '') !== String(nextTemplateDataJson || '');

      details.push({
        table: config.translationTable,
        id: row.id,
        sourceId: row.source_id,
        languageCode: row.language_code,
        sourceKey: row.source_key,
        changed: didChange,
        summary: nextSummary
      });

      if (!didChange) {
        continue;
      }

      changed += 1;

      if (WRITE) {
        updateStatement.run(nextSummary, nextTemplateDataJson, row.id);
      }
    }
  }

  if (WRITE) {
    db.exec('COMMIT;');
  }
} catch (error) {
  if (WRITE) {
    db.exec('ROLLBACK;');
  }
  throw error;
}

console.log(JSON.stringify({
  write: WRITE,
  changed,
  unresolved,
  details
}, null, 2));
