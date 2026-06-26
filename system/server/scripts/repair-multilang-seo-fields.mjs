import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');
const INCLUDE_ENGLISH = process.argv.includes('--include-en');
const MAX_TITLE_LENGTH = 65;
const MAX_DESCRIPTION_LENGTH = 165;
const MIN_DESCRIPTION_LENGTH = 50;
const BRAND_PATTERN = /\s*\|\s*Spirax Sarco(?:\s+Inc\.)?(?:\s+[^|]*)?$/iu;
const HTML_POLLUTION_PATTERN = /width=device-width|<\/?(?:title|meta|html|head|body)\b|name="viewport"/iu;

const SOURCES = [
  {
    label: 'column',
    table: 'column_translations',
    idField: 'column_id',
    titleField: 'name'
  },
  {
    label: 'product',
    table: 'content_product_translations',
    idField: 'entry_id',
    titleField: 'name'
  },
  {
    label: 'news',
    table: 'content_news_translations',
    idField: 'entry_id',
    titleField: 'name'
  }
];

const db = getDb();
const languages = db.prepare(`
  SELECT id, code
  FROM languages
  WHERE is_enabled = 1
  ORDER BY sort_order, id
`).all().filter((language) => INCLUDE_ENGLISH || language.code !== 'en');

const updateStatements = Object.fromEntries(
  SOURCES.map((source) => [
    source.table,
    db.prepare(`
      UPDATE ${source.table}
      SET seo_title = ?, seo_description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `)
  ])
);

const report = [];
const samples = [];
let totalChanged = 0;

function runRepair() {
  if (WRITE) {
    db.exec('BEGIN TRANSACTION;');
  }
  try {
  for (const language of languages) {
    const languageReport = {
      language: language.code,
      scanned: 0,
      changed: 0,
      titleChanged: 0,
      descriptionChanged: 0,
      titleOverAfter: 0,
      descriptionOverAfter: 0,
      descriptionShortAfter: 0
    };

    for (const source of SOURCES) {
      const rows = db.prepare(`
        SELECT id, ${source.idField} AS source_id, ${source.titleField} AS source_title,
               summary, content_html, seo_title, seo_description
        FROM ${source.table}
        WHERE language_id = ? AND publish_status = 'published'
      `).all(language.id);

      for (const row of rows) {
        languageReport.scanned += 1;
        const nextTitle = shouldRepairTitle(row.seo_title)
          ? buildSeoTitle(row)
          : normalizeWhitespace(stripHtmlPollution(row.seo_title));
        const nextDescription = shouldRepairDescription(row.seo_description)
          ? buildSeoDescription(row, language.code)
          : normalizeWhitespace(stripHtmlPollution(row.seo_description));
        const currentTitle = normalizeWhitespace(row.seo_title);
        const currentDescription = normalizeWhitespace(stripHtmlPollution(row.seo_description));
        const titleChanged = nextTitle !== currentTitle;
        const descriptionChanged = nextDescription !== currentDescription;

        if ([...nextTitle].length > MAX_TITLE_LENGTH) {
          languageReport.titleOverAfter += 1;
        }
        if ([...nextDescription].length > MAX_DESCRIPTION_LENGTH) {
          languageReport.descriptionOverAfter += 1;
        }
        if (nextDescription && [...nextDescription].length < MIN_DESCRIPTION_LENGTH) {
          languageReport.descriptionShortAfter += 1;
        }

        if (!titleChanged && !descriptionChanged) {
          continue;
        }

        languageReport.changed += 1;
        if (titleChanged) {
          languageReport.titleChanged += 1;
        }
        if (descriptionChanged) {
          languageReport.descriptionChanged += 1;
        }
        totalChanged += 1;

        if (samples.length < 30) {
          samples.push({
            language: language.code,
            source: source.label,
            source_id: row.source_id,
            old_title: currentTitle,
            new_title: nextTitle,
            old_description: currentDescription,
            new_description: nextDescription
          });
        }

        if (WRITE) {
          updateStatements[source.table].run(nextTitle, nextDescription, row.id);
        }
      }
    }

    report.push(languageReport);
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
}

runRepair();

console.log(JSON.stringify({
  mode: WRITE ? 'write' : 'dry-run',
  totalChanged,
  report,
  samples
}, null, 2));

function buildSeoTitle(row) {
  const sourceTitle = normalizeWhitespace(stripHtmlPollution(row.source_title));
  const currentTitle = normalizeWhitespace(stripHtmlPollution(row.seo_title));
  const base = normalizeWhitespace(currentTitle.replace(BRAND_PATTERN, '')) || sourceTitle;
  return clampText(base, MAX_TITLE_LENGTH);
}

function shouldRepairTitle(value) {
  const raw = String(value || '');
  const normalized = normalizeWhitespace(stripHtmlPollution(raw));
  return !normalized || HTML_POLLUTION_PATTERN.test(raw) || [...normalized].length > MAX_TITLE_LENGTH;
}

function shouldRepairDescription(value) {
  const raw = String(value || '');
  const normalized = normalizeWhitespace(stripHtmlPollution(raw));
  return !normalized || HTML_POLLUTION_PATTERN.test(raw) || [...normalized].length > MAX_DESCRIPTION_LENGTH;
}

function buildSeoDescription(row, languageCode) {
  const candidates = [
    row.seo_description,
    row.summary,
    row.content_html
  ];
  for (const candidate of candidates) {
    const text = normalizeWhitespace(stripHtml(stripHtmlPollution(candidate)));
    if (!text || HTML_POLLUTION_PATTERN.test(String(candidate || ''))) {
      continue;
    }
    if (text !== normalizeWhitespace(row.source_title)) {
      return clampText(text, MAX_DESCRIPTION_LENGTH);
    }
  }

  const title = normalizeWhitespace(stripHtmlPollution(row.source_title));
  if (!title) {
    return '';
  }
  return clampText(buildFallbackDescription(title, languageCode), MAX_DESCRIPTION_LENGTH);
}

function buildFallbackDescription(title, languageCode) {
  const templates = {
    'zh-CN': `${title}，来自 Spirax Sarco。查看产品信息、应用场景和相关资源。`,
    ru: `${title} от Spirax Sarco. Информация о продукции, применении и связанных ресурсах.`,
    ar: `${title} من Spirax Sarco. اطلع على معلومات المنتج والتطبيقات والموارد ذات الصلة.`,
    'ar-me': `${title} من Spirax Sarco. اطلع على معلومات المنتج والتطبيقات والموارد ذات الصلة.`,
    es: `${title} de Spirax Sarco. Consulte información del producto, aplicaciones y recursos relacionados.`,
    id: `${title} dari Spirax Sarco. Lihat informasi produk, aplikasi, dan sumber daya terkait.`,
    pt: `${title} da Spirax Sarco. Veja informações do produto, aplicações e recursos relacionados.`,
    fr: `${title} de Spirax Sarco. Consultez les informations produit, applications et ressources associées.`,
    tr: `${title} Spirax Sarco. Ürün bilgileri, uygulamalar ve ilgili kaynakları inceleyin.`,
    th: `${title} จาก Spirax Sarco ดูข้อมูลผลิตภัณฑ์ การใช้งาน และแหล่งข้อมูลที่เกี่ยวข้อง`,
    vi: `${title} từ Spirax Sarco. Xem thông tin sản phẩm, ứng dụng và tài nguyên liên quan.`
  };
  return templates[languageCode] || `${title} from Spirax Sarco. View product information, applications and related resources.`;
}

function stripHtmlPollution(value) {
  return String(value || '')
    .replace(/width=device-width,\s*initial-scale=1"?\s*name="viewport">?/giu, ' ')
    .replace(/<title>[\s\S]*?<\/title>/giu, ' ')
    .replace(/<meta\b[^>]*>/giu, ' ');
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<script\b[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ');
}

function normalizeWhitespace(value) {
  return String(value || '')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&quot;/giu, '"')
    .replace(/&#39;/giu, "'")
    .replace(/\s+/gu, ' ')
    .trim();
}

function clampText(value, maxLength) {
  const text = normalizeWhitespace(value);
  if ([...text].length <= maxLength) {
    return text;
  }

  const punctuationCut = findLastCutIndex(text, maxLength, /[.!?。！？؛،,;:]\s*/gu);
  if (punctuationCut >= Math.max(35, Math.floor(maxLength * 0.55))) {
    return trimTrailingPunctuation([...text].slice(0, punctuationCut).join(''));
  }

  const chars = [...text];
  let cut = maxLength;
  while (cut > Math.max(35, Math.floor(maxLength * 0.55)) && !/\s/u.test(chars[cut] || '')) {
    cut -= 1;
  }
  return trimTrailingPunctuation(chars.slice(0, cut > 0 ? cut : maxLength).join(''));
}

function findLastCutIndex(text, maxLength, pattern) {
  let output = -1;
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length;
    if (end <= maxLength) {
      output = end;
    }
  }
  return output;
}

function trimTrailingPunctuation(value) {
  return String(value || '').replace(/[|,;:，。؛،-]+$/u, '').trim();
}
