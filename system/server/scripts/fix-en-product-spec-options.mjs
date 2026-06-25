import { execute, queryAll, queryOne } from '../src/db.mjs';
import { normalizePageDataSpecOptions } from './lib/spec-option-normalizer.mjs';

const EN_LANGUAGE_ID = queryOne(`SELECT id FROM languages WHERE code = 'en' LIMIT 1`)?.id || 0;

if (!EN_LANGUAGE_ID) {
  throw new Error('Missing en language');
}

const rows = queryAll(
  `
    SELECT id, entry_id, template_data_json
    FROM content_product_translations
    WHERE language_id = ?
      AND template_data_json IS NOT NULL
      AND (
        template_data_json LIKE '%螺纹%'
        OR template_data_json LIKE '%法兰%'
      )
    ORDER BY entry_id ASC, id ASC
  `,
  [EN_LANGUAGE_ID]
);

let updated = 0;

for (const row of rows) {
  const raw = String(row.template_data_json || '').trim();
  if (!raw) {
    continue;
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    continue;
  }

  const normalized = normalizePageDataSpecOptions(parsed, 'en');
  const nextRaw = normalized ? JSON.stringify(normalized) : null;

  if (!nextRaw || nextRaw === raw) {
    continue;
  }

  execute(
    `
      UPDATE content_product_translations
      SET template_data_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextRaw, row.id]
  );

  updated += 1;
}

console.log(JSON.stringify({ scanned: rows.length, updated }, null, 2));
