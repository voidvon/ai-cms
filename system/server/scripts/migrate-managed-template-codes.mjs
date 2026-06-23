import { execute, queryAll } from '../src/db.mjs';

const CODE_RENAMES = new Map([
  ['product_list', 'managed_list'],
  ['product_detail', 'managed_detail'],
]);

const templates = queryAll(`
  SELECT id, code
  FROM templates
  WHERE code IN ('product_list', 'product_detail')
  ORDER BY id ASC
`);

for (const template of templates) {
  const currentCode = String(template.code || '').trim();
  const nextCode = CODE_RENAMES.get(currentCode);
  if (!nextCode) {
    continue;
  }
  execute(
    `
      UPDATE templates
      SET code = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextCode, template.id]
  );
}

const bindings = queryAll(`
  SELECT tb.id, tb.template_id, t.code
  FROM template_bindings tb
  INNER JOIN templates t ON t.id = tb.template_id
  WHERE t.code IN ('managed_list', 'managed_detail')
  ORDER BY tb.id ASC
`);

const versions = queryAll(`
  SELECT tv.id, tv.template_id, t.code
  FROM template_versions tv
  INNER JOIN templates t ON t.id = tv.template_id
  WHERE t.code IN ('managed_list', 'managed_detail')
  ORDER BY tv.id ASC
`);

console.log(`Migrated template codes for ${templates.length} templates, validated ${bindings.length} bindings and ${versions.length} versions.`);
