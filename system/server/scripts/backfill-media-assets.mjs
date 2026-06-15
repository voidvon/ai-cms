import { queryAll } from '../src/db.mjs';
import { registerExistingMediaAsset } from '../src/services/media-assets.mjs';

const PRODUCT_PLACEHOLDER = '/skin/dfpic.gif';
const NEWS_PLACEHOLDERS = new Set([
  '/UploadFile/nopicture.gif',
  '/UploadFile/Newsuppic/nopicture.gif',
]);

let productCount = 0;
let newsCount = 0;

for (const row of queryAll(`
  SELECT DISTINCT primary_image
  FROM columns
  WHERE model_code = 'product'
    AND node_type = 'content'
    AND TRIM(coalesce(primary_image, '')) <> ''
    AND TRIM(coalesce(primary_image, '')) <> ?
`, [PRODUCT_PLACEHOLDER])) {
  const relativePath = String(row.primary_image || '').trim();
  if (!relativePath.startsWith('/UploadFile/')) {
    continue;
  }
  if (registerExistingMediaAsset({ relativePath, purpose: 'product_cover', status: 'active' })) {
    productCount += 1;
  }
}

for (const row of queryAll(`
  SELECT DISTINCT primary_image
  FROM columns
  WHERE model_code = 'news'
    AND node_type = 'content'
    AND TRIM(coalesce(primary_image, '')) <> ''
`, [])) {
  const relativePath = String(row.primary_image || '').trim();
  if (!relativePath.startsWith('/UploadFile/') || NEWS_PLACEHOLDERS.has(relativePath)) {
    continue;
  }
  if (registerExistingMediaAsset({ relativePath, purpose: 'news_cover', status: 'active' })) {
    newsCount += 1;
  }
}

console.log(`media assets backfilled: product_cover=${productCount}, news_cover=${newsCount}`);
