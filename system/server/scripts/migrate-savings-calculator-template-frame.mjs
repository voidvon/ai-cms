import { getDb } from '../src/db.mjs';
import { listColumns } from '../src/services/columns.mjs';

const WRITE = process.argv.includes('--write');

const TARGET_ROUTE = '/resources-and-design-tools/savings-calculator/savings-calculator/';
const TARGET_SRC = '/embedded-tools/products-services/capabilities/steam-system-services/savings-calculator.asp';

const db = getDb();
const targetColumnId = listColumns({ includeTranslations: false })
  .find((column) => column.public_path === TARGET_ROUTE)?.id;
if (!targetColumnId) throw new Error(`未找到栏目: ${TARGET_ROUTE}`);
const rows = db.prepare(`
  SELECT ct.id, ct.column_id, l.code AS language_code, ct.template_data_json
  FROM column_translations ct
  JOIN languages l ON l.id = ct.language_id
  JOIN columns c ON c.id = ct.column_id
  WHERE c.id = ?
    AND ct.template_data_json IS NOT NULL
    AND trim(ct.template_data_json) <> ''
  ORDER BY l.sort_order ASC, l.id ASC
`).all(targetColumnId);

let changed = 0;
const details = [];

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  const updateStatement = db.prepare(`
    UPDATE column_translations
    SET template_data_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  for (const row of rows) {
    row.route_path = TARGET_ROUTE;
    const original = String(row.template_data_json || '').trim();
    let parsed;

    try {
      parsed = JSON.parse(original);
    } catch {
      details.push({
        id: row.id,
        columnId: row.column_id,
        languageCode: row.language_code,
        routePath: row.route_path,
        changed: false,
        reason: 'invalid-json'
      });
      continue;
    }

    const frameSrc = parsed?.frame?.src ? String(parsed.frame.src) : null;
    const shouldRemoveFrame = frameSrc === TARGET_SRC;

    if (shouldRemoveFrame) {
      delete parsed.frame;
    }

    const next = JSON.stringify(parsed, null, 2);
    const didChange = shouldRemoveFrame && next !== original;

    details.push({
      id: row.id,
      columnId: row.column_id,
      languageCode: row.language_code,
      routePath: row.route_path,
      changed: didChange,
      removedFrame: shouldRemoveFrame
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
