import { execute, queryAll } from '../src/db.mjs';
import { ensureTemplatesSchema } from '../src/services/templates.mjs';

ensureTemplatesSchema();

const listTemplates = queryAll(`
  SELECT id, code, tsx_source, css_source, published_tsx_source, published_css_source
  FROM templates
  WHERE type = 'list'
`);

const paginationTemplates = queryAll(`
  SELECT id, code, type
  FROM templates
  WHERE code = 'pagination'
`);

const replacements = [
  {
    from: "{showLegacyPager ? <div className=\"legacy-pager\" dangerouslySetInnerHTML={{ __html: props.pagerHtml }} /> : null}",
    to: "{showLegacyPager ? props.component('pagination', { pagination: props.pagination, pagerText: props.pagerText }) : null}",
  },
  {
    from: "{props.pagerHtml ? <div className=\"legacy-pager\" dangerouslySetInnerHTML={{ __html: props.pagerHtml }} /> : null}",
    to: "{props.pagination?.pageCount > 1 ? props.component('pagination', { pagination: props.pagination, pagerText: props.pagerText }) : null}",
  },
];

let updatedListCount = 0;
for (const row of listTemplates) {
  const nextDraft = replacePagerUsage(row.tsx_source || '', replacements);
  const nextPublished = replacePagerUsage(row.published_tsx_source || '', replacements);
  if (nextDraft === (row.tsx_source || '') && nextPublished === (row.published_tsx_source || '')) {
    continue;
  }
  execute(
    `
      UPDATE templates
      SET tsx_source = ?, published_tsx_source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextDraft, nextPublished, row.id]
  );
  updatedListCount += 1;
}

let migratedPaginationCount = 0;
for (const row of paginationTemplates) {
  if (String(row.type || '') === 'component') {
    continue;
  }
  execute(
    `
      UPDATE templates
      SET type = 'component', name = '分页组件', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [row.id]
  );
  migratedPaginationCount += 1;
}

console.log(`Updated ${updatedListCount} list templates.`);
console.log(`Migrated ${migratedPaginationCount} pagination templates to component.`);

function replacePagerUsage(source, rules) {
  let next = String(source || '');
  for (const rule of rules) {
    next = next.split(rule.from).join(rule.to);
  }
  return next;
}
