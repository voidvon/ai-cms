import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/site.sqlite');

const current = db
  .prepare('select * from template_versions where template_id = ? order by id desc limit 1')
  .get(3);

if (!current) {
  throw new Error('template 3 version not found');
}

let content = String(current.content || '');

const oldMasthead = `const masthead = props.component('spirax_short_masthead', {
    title: pageData?.title || props.smallName || props.title,
    summary: pageData?.summary || props.currentCategoryDescription || props.currentCategoryItem?.seoDescription || '',
    image: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
    imageAlt: pageData?.title || props.smallName || props.title || '',
    className: 'short-masthead'
  });`;

const newMasthead = `const categoryTitle = props.smallName || props.title || currentCategory?.name || '';
  const categorySummary = props.currentCategoryDescription || props.currentCategoryItem?.seoDescription || '';
  const categoryHeroImage = props.currentCategoryHeroImage || pageData?.mastheadImage || '';
  const masthead = props.component('spirax_short_masthead', {
    title: categoryTitle,
    summary: categorySummary,
    image: categoryHeroImage,
    imageAlt: categoryTitle,
    className: 'short-masthead'
  });`;

const oldTopPanel = `const topPanel = hasTopPanel ? props.component('spirax_product_top_panel', {
    product: {
      title: pageData?.title || props.smallName || props.title || '',
      summary: pageData?.summary || props.currentCategoryDescription || '',
      primaryImage: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
      images: Array.isArray(pageData?.topPanel?.images) ? pageData.topPanel.images : []
    },
    title: pageData?.title || props.smallName || props.title || '',
    image: pageData?.mastheadImage || props.currentCategoryHeroImage || '',
    topPanel: pageData?.topPanel || null,
    quickFactsTitle: 'Quick facts'
  }) : null;`;

const newTopPanel = `const topPanel = null;`;

if (!content.includes(oldMasthead)) {
  throw new Error('masthead block not found');
}

if (!content.includes(oldTopPanel)) {
  throw new Error('top panel block not found');
}

content = content.replace(oldMasthead, newMasthead).replace(oldTopPanel, newTopPanel);

const nextVersionNo = Number(current.version_no || 0) + 1;
const now = new Date().toISOString();

db.prepare(
  'insert into template_versions (template_id, version_no, engine, content, note, created_at) values (?, ?, ?, ?, ?, ?)'
).run(
  3,
  nextVersionNo,
  current.engine || 'tsx',
  content,
  'Keep product category pages category-only',
  now
);

db.prepare('update templates set updated_at = ? where id = ?').run(now, 3);

console.log(
  JSON.stringify(
    {
      templateId: 3,
      fromVersion: current.version_no,
      toVersion: nextVersionNo
    },
    null,
    2
  )
);
