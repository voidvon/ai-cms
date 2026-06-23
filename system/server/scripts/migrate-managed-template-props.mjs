import { queryAll, execute } from '../src/db.mjs';

const TEMPLATE_CODES = new Set(['managed_list', 'managed_detail']);

const REPLACEMENTS = [
  ['props.productCardItems', 'props.managedCardItems'],
  ['props.currentProductPageData', 'props.currentManagedItemPageData'],
  ['props.currentProduct', 'props.currentManagedItem'],
  ['props.relatedProductItems', 'props.relatedManagedItems'],
  ['const productItems =', 'const managedItems ='],
  ['productItems.length > 0 ? productItems : listItems', 'managedItems.length > 0 ? managedItems : listItems'],
  ['const product = props.currentManagedItem || props.currentContent || {};', 'const managedItem = props.currentManagedItem || props.currentContent || {};'],
  ['const productPageData = product.pageData || props.currentManagedItemPageData || {};', 'const managedItemPageData = managedItem.pageData || props.currentManagedItemPageData || {};'],
  ['title: product.title || props.title', 'title: managedItem.title || props.title'],
  ['image: product.primaryImage || props.image || \'\'', 'image: managedItem.primaryImage || props.image || \'\''],
  ['imageAlt: product.title || props.title || \'\'', 'imageAlt: managedItem.title || props.title || \'\''],
  ['product,', 'managedItem,'],
  ['image: product.primaryImage || props.image || \'/skin/dfpic.gif\'', 'image: managedItem.primaryImage || props.image || \'/skin/dfpic.gif\''],
  ['title: product.title || props.title,', 'title: managedItem.title || props.title,'],
  ['topPanel: productPageData?.topPanel || null,', 'topPanel: managedItemPageData?.topPanel || null,'],
  ['downloads: Array.isArray(productPageData?.downloads) ? productPageData.downloads : []', 'downloads: Array.isArray(managedItemPageData?.downloads) ? managedItemPageData.downloads : []'],
  ['title: productPageData?.brandPathSection?.title || \'\'', 'title: managedItemPageData?.brandPathSection?.title || \'\''],
  ['intro: productPageData?.brandPathSection?.intro || \'\'', 'intro: managedItemPageData?.brandPathSection?.intro || \'\''],
  ['cards: Array.isArray(productPageData?.brandPathSection?.cards) ? productPageData.brandPathSection.cards : []', 'cards: Array.isArray(managedItemPageData?.brandPathSection?.cards) ? managedItemPageData.brandPathSection.cards : []'],
  ['sections: Array.isArray(productPageData?.supplementalSections) ? productPageData.supplementalSections : []', 'sections: Array.isArray(managedItemPageData?.supplementalSections) ? managedItemPageData.supplementalSections : []'],
  ['product.bodyHtml || props.bodyHtml || \'\'', 'managedItem.bodyHtml || props.bodyHtml || \'\''],
];

function applyReplacements(source) {
  let next = String(source || '');
  for (const [from, to] of REPLACEMENTS) {
    next = next.replaceAll(from, to);
  }
  return next;
}

function migrateTemplateSource(source, code) {
  let next = applyReplacements(source);

  if (code === 'managed_list') {
    next = next
      .replaceAll('const productRoot = normalizedPageKind === \'root\';', 'const managedRoot = normalizedPageKind === \'root\';')
      .replaceAll('productRoot ||', 'managedRoot ||')
      .replaceAll('(productRoot ||', '(managedRoot ||')
      .replaceAll('productRoot ? \'intro__copy copy\' : \'intro__copy copy intro__copy--left\'', 'managedRoot ? \'intro__copy copy\' : \'intro__copy copy intro__copy--left\'')
      .replaceAll('productRoot ? \'intro intro--large intro--blue\' : \'\'', 'managedRoot ? \'intro intro--large intro--blue\' : \'\'')
      .replaceAll('const productUi = siteUi?.product || {};', 'const managedUi = siteUi?.product || {};')
      .replaceAll('productUi.', 'managedUi.');
  }

  if (code === 'managed_detail') {
    next = next
      .replaceAll('const productUi = siteUi?.product || {};', 'const managedUi = siteUi?.product || {};')
      .replaceAll('productUi.', 'managedUi.')
      .replaceAll('sg-product-page', 'sg-managed-page')
      .replaceAll('product-detail__body-section', 'managed-detail__body-section')
      .replaceAll('product-detail__body-shell', 'managed-detail__body-shell')
      .replaceAll('product-detail__body-main', 'managed-detail__body-main')
      .replaceAll('product-detail__body', 'managed-detail__body')
      .replaceAll('product-detail__body-rail', 'managed-detail__body-rail')
      .replaceAll('product-section-nav', 'managed-section-nav')
      .replaceAll('productUi.relatedTitle || \'Related products\'', 'managedUi.relatedTitle || \'Related items\'');
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
  if (!TEMPLATE_CODES.has(String(template.code || '').trim())) {
    continue;
  }
  const nextDraft = migrateTemplateSource(template.tsx_source || '', template.code);
  const nextPublished = migrateTemplateSource(template.published_tsx_source || '', template.code);
  execute(
    `
      UPDATE templates
      SET tsx_source = ?, published_tsx_source = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [nextDraft, nextPublished, template.id]
  );
}

const versions = queryAll(`
  SELECT tv.id, tv.template_id, tv.tsx_source, t.code
  FROM template_versions tv
  INNER JOIN templates t ON t.id = tv.template_id
  WHERE t.code IN ('managed_list', 'managed_detail')
  ORDER BY tv.id ASC
`);

for (const version of versions) {
  const nextSource = migrateTemplateSource(version.tsx_source || '', version.code);
  execute(
    `
      UPDATE template_versions
      SET tsx_source = ?
      WHERE id = ?
    `,
    [nextSource, version.id]
  );
}

console.log(`Migrated managed template props for ${templates.length} templates and ${versions.length} versions.`);
