import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/site.sqlite');

function readTemplate(id) {
  const row = db.prepare('select id, code, content, published_content from templates where id = ?').get(id);
  if (!row) {
    throw new Error(`template ${id} not found`);
  }
  return row;
}

function insertTemplateVersion(templateId, content, note) {
  const maxVersion = db.prepare('select coalesce(max(version_no), 0) as value from template_versions where template_id = ?').get(templateId)?.value || 0;
  db.prepare(`
    insert into template_versions (template_id, version_no, engine, content, note, created_at)
    values (?, ?, 'tsx', ?, ?, datetime('now'))
  `).run(templateId, maxVersion + 1, content, note);
}

function updateTemplate(id, content, note) {
  const row = readTemplate(id);
  if (row.content === content && row.published_content === content) {
    return false;
  }
  insertTemplateVersion(id, content, note);
  db.prepare(`
    update templates
    set content = ?, published_content = ?, status = 'published', updated_at = datetime('now'), published_at = datetime('now')
    where id = ?
  `).run(content, content, id);
  return true;
}

function updateProductListTemplate() {
  const row = readTemplate(3);
  let content = row.content;
  const before = content;
  content = content.replace(
    "  const currentRouteUrl = currentCategory?.url || '';",
    "  const currentRouteUrl = currentCategory?.url || '';\n  const categoryHeroImage = Array.isArray(currentCategory?.images) ? (currentCategory.images.find((item) => typeof item === 'string' && item.trim()) || '') : '';"
  );
  content = content.replaceAll(
    "pageData?.mastheadImage || props.currentCategoryHeroImage || ''",
    "categoryHeroImage"
  );
  if (content === before) {
    return false;
  }
  return updateTemplate(3, content, 'Use currentCategoryItem.images[0] for category masthead image');
}

function updateContentPageTemplate() {
  const row = readTemplate(9);
  let content = row.content;
  const before = content;
  content = content.replace(
    "  const heroTitle = pageData?.hero?.title || props.title;\n  const heroImage = pageData?.hero?.image || pageData.heroImage || pageData.mastheadImage || props.currentCategoryHeroImage || '';",
    "  const heroTitle = pageData?.hero?.title || props.title;\n  const heroImage = Array.isArray(props.currentCategoryItem?.images) ? (props.currentCategoryItem.images.find((item) => typeof item === 'string' && item.trim()) || '') : '';"
  );
  if (content === before) {
    return false;
  }
  return updateTemplate(9, content, 'Use currentCategoryItem.images[0] for content page masthead image');
}

function migrateRootProductColumnImage() {
  const column = db.prepare('select id, images from columns where id = 1').get();
  if (!column) {
    throw new Error('column 1 not found');
  }
  const images = JSON.parse(column.images || '[]');
  const source = images[0];
  if (!source || !String(source).startsWith('/images/')) {
    return false;
  }

  const sourcePath = path.join('/Volumes/DATA/Space/spirax-global/dist/zh-cn', String(source).replace(/^\//, ''));
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`source image missing: ${sourcePath}`);
  }

  const destDir = path.join('html', 'uploads', 'images', '202606', 'product-columns');
  fs.mkdirSync(destDir, { recursive: true });
  const destName = `col-1-${path.basename(sourcePath)}`;
  const destPath = path.join(destDir, destName);
  fs.copyFileSync(sourcePath, destPath);

  images[0] = `/uploads/images/202606/product-columns/${destName}`;
  db.prepare('update columns set images = ?, updated_at = datetime(\'now\') where id = 1').run(JSON.stringify(images));
  return true;
}

const changedProductList = updateProductListTemplate();
const changedContentPage = updateContentPageTemplate();
const changedColumnImage = migrateRootProductColumnImage();

console.log(JSON.stringify({
  changedProductList,
  changedContentPage,
  changedColumnImage
}, null, 2));
