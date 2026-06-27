import { getDb } from '../src/db.mjs';
import { normalizeTemplateDataAssetsDeep } from '../src/services/template-data-assets.mjs';

const WRITE = process.argv.includes('--write');

const SOURCES = [
  { table: 'column_translations', idField: 'id' },
  { table: 'content_product_translations', idField: 'id' },
  { table: 'content_news_translations', idField: 'id' },
  { table: 'site_config_translations', idField: 'id' }
];

const db = getDb();
const report = [];
let totalChanged = 0;

if (WRITE) {
  db.exec('BEGIN TRANSACTION;');
}

try {
  for (const source of SOURCES) {
    const rows = db.prepare(`
      SELECT ${source.idField} AS id, template_data_json
      FROM ${source.table}
      WHERE template_data_json IS NOT NULL
        AND trim(template_data_json) <> ''
    `).all();

    const updateStatement = db.prepare(`
      UPDATE ${source.table}
      SET template_data_json = ?, updated_at = CURRENT_TIMESTAMP
      WHERE ${source.idField} = ?
    `);

    let changed = 0;

    for (const row of rows) {
      let parsed;
      try {
        parsed = JSON.parse(row.template_data_json);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== 'object') {
        continue;
      }

      const normalized = normalizeTemplateDataAssetsDeep(parsed);
      const nextJson = JSON.stringify(normalized);
      if (nextJson === row.template_data_json) {
        continue;
      }

      changed += 1;
      totalChanged += 1;
      if (WRITE) {
        updateStatement.run(nextJson, row.id);
      }
    }

    report.push({
      table: source.table,
      scanned: rows.length,
      changed
    });
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
  totalChanged,
  report
}, null, 2));
