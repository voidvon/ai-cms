import { getDb } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');

const TARGET_ROUTE = '/resources-and-design-tools/savings-calculator/savings-calculator/';

const HERO_PATTERN = new RegExp(
  String.raw`\s*<section class="sg-resource-detail__hero">[\s\S]*?<\/section>`,
  'g'
);

const BREADCRUMB_PATTERN = new RegExp(
  String.raw`\s*<div aria-label="[^"]*" class="breadcrumb">\s*<div class="wrapper"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>`,
  'g'
);

const db = getDb();
const rows = db.prepare(`
  SELECT ct.id, ct.column_id, l.code AS language_code, c.route_path, ct.content_html
  FROM column_translations ct
  JOIN languages l ON l.id = ct.language_id
  JOIN columns c ON c.id = ct.column_id
  WHERE c.route_path = ?
    AND ct.content_html IS NOT NULL
    AND trim(ct.content_html) <> ''
  ORDER BY l.sort_order ASC, l.id ASC
`).all(TARGET_ROUTE);

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
    const withoutHero = original.replace(HERO_PATTERN, '');
    const next = withoutHero.replace(BREADCRUMB_PATTERN, '');
    const didChange = next !== original;

    details.push({
      id: row.id,
      columnId: row.column_id,
      languageCode: row.language_code,
      routePath: row.route_path,
      changed: didChange,
      removedHero: withoutHero !== original,
      removedBreadcrumb: next !== withoutHero
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
