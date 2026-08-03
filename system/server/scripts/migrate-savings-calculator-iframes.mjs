import { getDb } from '../src/db.mjs';
import { listColumns } from '../src/services/columns.mjs';

const WRITE = process.argv.includes('--write');

const TARGET_ROUTE = '/resources-and-design-tools/savings-calculator/savings-calculator/';
const TARGET_HREF = '/embedded-tools/products-services/capabilities/steam-system-services/savings-calculator.asp';
const FRAME_SECTION_PATTERN = new RegExp(
  String.raw`\s*<section class="sg-resource-detail__section">\s*<div class="sg-resource-detail__container">\s*<div class="sg-resource-detail__frame-card">[\s\S]*?<iframe class="sg-resource-detail__frame"[\s\S]*?src="[^"]*${TARGET_HREF.replace(/\//g, '\\/').replace(/\./g, '\\.')}"[\s\S]*?<\/iframe>\s*<\/div>\s*<\/div>\s*<\/section>`,
  'g'
);

const db = getDb();
const targetColumnId = listColumns({ includeTranslations: false })
  .find((column) => column.public_path === TARGET_ROUTE)?.id;
if (!targetColumnId) throw new Error(`未找到栏目: ${TARGET_ROUTE}`);
const rows = db.prepare(`
  SELECT ct.id, ct.column_id, l.code AS language_code, ct.content_html
  FROM column_translations ct
  JOIN languages l ON l.id = ct.language_id
  JOIN columns c ON c.id = ct.column_id
  WHERE c.id = ?
    AND ct.content_html LIKE ?
  ORDER BY l.sort_order ASC, l.id ASC
`).all(targetColumnId, `%${TARGET_HREF}%`);

let changed = 0;
const details = [];

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  const updateStatement = db.prepare(`
    UPDATE column_translations
    SET content_html = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    row.route_path = TARGET_ROUTE;
    const original = String(row.content_html || '');
    const next = original.replace(FRAME_SECTION_PATTERN, '');
    const didChange = next !== original;

    details.push({
      id: row.id,
      columnId: row.column_id,
      languageCode: row.language_code,
      routePath: row.route_path,
      changed: didChange
    });

    if (!didChange) {
      continue;
    }

    changed += 1;

    if (WRITE) {
      updateStatement.run(next, row.id);
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
  scanned: rows.length,
  changed,
  details
}, null, 2));
