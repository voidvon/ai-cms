import { execute, queryAll } from '../src/db.mjs';

const TARGET_CODES = new Set(['managed_list', 'managed_detail']);

const REPLACEMENTS = [
  ['siteUi?.product || {}', 'siteUi?.managed || {}'],
  ['siteUi.product || {}', 'siteUi.managed || {}'],
  ['const managedUi = siteUi?.product || {};', 'const managedUi = siteUi?.managed || {};'],
  ['const managedUi = siteUi.product || {};', 'const managedUi = siteUi.managed || {};'],
  ['Product benefits', 'Managed content benefits'],
  ['product: {', 'managedItem: {'],
  ['value.products', 'value.managedItems'],
  ['pageData?.products', 'pageData?.managedItems'],
  ['props.pageData?.products', 'props.pageData?.managedItems'],
];

function migrateSource(source) {
  let next = String(source || '');
  for (const [from, to] of REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}

const templates = queryAll(`
  SELECT id, code, tsx_source, published_tsx_source
  FROM templates
  WHERE code IN ('managed_list', 'managed_detail')
  ORDER BY id ASC
`);

for (const template of templates) {
  if (!TARGET_CODES.has(String(template.code || '').trim())) {
    continue;
  }
  execute(
    `
      UPDATE templates
      SET tsx_source = ?, published_tsx_source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      migrateSource(template.tsx_source || ''),
      migrateSource(template.published_tsx_source || ''),
      template.id
    ]
  );
}

const versions = queryAll(`
  SELECT tv.id, tv.tsx_source, t.code
  FROM template_versions tv
  INNER JOIN templates t ON t.id = tv.template_id
  WHERE t.code IN ('managed_list', 'managed_detail')
  ORDER BY tv.id ASC
`);

for (const version of versions) {
  execute(
    `
      UPDATE template_versions
      SET tsx_source = ?
      WHERE id = ?
    `,
    [migrateSource(version.tsx_source || ''), version.id]
  );
}

console.log(`Migrated latest managed template sources for ${templates.length} templates and ${versions.length} versions.`);
