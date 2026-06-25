import fs from 'node:fs';
import path from 'node:path';
import { execute, queryAll } from '../src/db.mjs';
import { ensureContentModelStorageSchema } from '../src/services/content-model-storage.mjs';
import { ensureContentModelsSchema } from '../src/services/content-models.mjs';

const sourceRoot = process.env.SPIRAX_GLOBAL_DIR
  ? path.resolve(process.env.SPIRAX_GLOBAL_DIR)
  : '/Users/yytest/Documents/projects/spirax-global';
const productOptionsDir = path.join(sourceRoot, 'src', 'data', 'product-options');

if (!fs.existsSync(productOptionsDir)) {
  throw new Error(`未找到 product-options 目录: ${productOptionsDir}`);
}

ensureContentModelsSchema();
ensureContentModelStorageSchema();

const productRows = queryAll(`
  SELECT id, code
  FROM content_product
  ORDER BY id ASC
`);

let updated = 0;
let clearedTranslations = 0;
const missing = [];

for (const row of productRows) {
  const productCode = String(row.code || '').trim();
  const productKey = extractProductKey(productCode);
  if (!productKey) {
    continue;
  }

  const sourceFile = path.join(productOptionsDir, `${productKey}.ts`);
  if (!fs.existsSync(sourceFile)) {
    missing.push({ id: row.id, code: productCode, key: productKey });
    continue;
  }

  const values = dedupeValues(
    extractValueList(fs.readFileSync(sourceFile, 'utf8'))
      .map((value) => formatStoredSpecOption(value, productKey))
      .filter(Boolean)
  );

  if (values.length === 0) {
    missing.push({ id: row.id, code: productCode, key: productKey, reason: 'empty-values' });
    continue;
  }

  execute(
    `
      UPDATE content_product
      SET spec_options_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [JSON.stringify(values), row.id]
  );
  updated += 1;

  const translationRows = queryAll(
    `
      SELECT id, template_data_json
      FROM content_product_translations
      WHERE entry_id = ?
        AND template_data_json IS NOT NULL
    `,
    [row.id]
  );

  for (const translation of translationRows) {
    const raw = String(translation.template_data_json || '').trim();
    if (!raw) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      continue;
    }

    const topPanel = parsed.topPanel;
    if (!topPanel || typeof topPanel !== 'object' || Array.isArray(topPanel) || !Array.isArray(topPanel.specOptions)) {
      continue;
    }

    const nextTopPanel = { ...topPanel };
    delete nextTopPanel.specOptions;
    const nextParsed = {
      ...parsed,
      topPanel: nextTopPanel
    };

    execute(
      `
        UPDATE content_product_translations
        SET template_data_json = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      [JSON.stringify(nextParsed), translation.id]
    );
    clearedTranslations += 1;
  }
}

console.log(JSON.stringify({
  updated,
  clearedTranslations,
  missing
}, null, 2));

function extractProductKey(code) {
  const normalized = String(code || '').trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const firstSegment = normalized.split('-')[0]?.trim();
  return firstSegment || null;
}

function extractValueList(source) {
  const arrayMatches = Array.from(
    String(source || '').matchAll(
      /export const\s+([A-Za-z0-9_]+)\s*=\s*\[(.*?)\]\s*satisfies SpecOption\[\];/gs
    )
  );

  const selectedArrays = arrayMatches.filter((match) => !/zh/i.test(match[1]));
  const arraysToRead = selectedArrays.length > 0 ? selectedArrays : arrayMatches;
  const values = [];

  for (const match of arraysToRead) {
    const body = String(match[2] || '');
    const valueMatches = Array.from(body.matchAll(/value:\s*'([^']+)'/g));
    for (const valueMatch of valueMatches) {
      const value = String(valueMatch[1] || '').trim();
      if (value) {
        values.push(value);
      }
    }
  }

  return values;
}

function formatStoredSpecOption(rawValue, productKey) {
  const raw = String(rawValue || '').trim();
  if (!raw) {
    return null;
  }

  const [displaySource, materialCodeSource] = raw.split('|').map((item) => item.trim());
  if (!displaySource) {
    return null;
  }

  const materialCode = materialCodeSource || '';
  const compactDisplay = normalizeDisplayText(removeProductPrefix(displaySource, productKey));
  if (!materialCode) {
    return compactDisplay || null;
  }

  return `${compactDisplay} (${materialCode})`;
}

function removeProductPrefix(value, productKey) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    return normalized;
  }

  const productPattern = buildProductPrefixPattern(productKey);
  if (productPattern) {
    const directMatched = normalized.match(new RegExp(`^${productPattern}(?:(?:\\s+)|-)+(.+)$`, 'iu'));
    if (directMatched) {
      return directMatched[1].trim();
    }
  }

  return normalized;
}

function normalizeDisplayText(value) {
  return String(value || '')
    .replace(/螺纹/gu, 'Threaded')
    .replace(/法兰/gu, 'Flanged')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

function buildProductPrefixPattern(productKey) {
  const normalized = String(productKey || '').trim();
  if (!normalized) {
    return null;
  }

  const segments = normalized.match(/[a-z]+|\d+/gi);
  if (!segments || segments.length === 0) {
    return escapeRegExp(normalized);
  }

  return segments.map((segment) => escapeRegExp(segment)).join('[-\\s]*');
}

function dedupeValues(values) {
  const seen = new Set();
  const deduped = [];

  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
