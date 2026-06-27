import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');

const TARGET_HREF = '/about-us/careers/netherlands/technical-solutions-engineer/';
const BUTTON_PATTERN = new RegExp(
  String.raw`\s*<a class="sg-ui-button sg-ui-button--md sg-ui-button--primary sg-careers-button" href="[^"]*${TARGET_HREF.replace(/\//g, '\\/').replace(/\./g, '\\.')}"[^>]*>[\s\S]*?<\/a>`,
  'g'
);

const db = getDb();
const rows = db.prepare(`
  SELECT ct.id, ct.column_id, l.code AS language_code, ct.content_html
  FROM column_translations ct
  JOIN languages l ON l.id = ct.language_id
  WHERE ct.content_html LIKE ?
  ORDER BY l.sort_order ASC, l.id ASC
`).all(`%${TARGET_HREF}%`);

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
    const original = String(row.content_html || '');
    const next = original.replace(BUTTON_PATTERN, '');
    if (next === original) {
      details.push({
        id: row.id,
        columnId: row.column_id,
        languageCode: row.language_code,
        changed: false
      });
      continue;
    }

    changed += 1;
    details.push({
      id: row.id,
      columnId: row.column_id,
      languageCode: row.language_code,
      changed: true
    });

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
