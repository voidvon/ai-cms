#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../../../..');
process.chdir(repoRoot);

const { getDb, queryAll, queryOne } = await import('../../../../system/server/src/db.mjs');
const { uploadMediaAsset, deleteMediaAsset } = await import('../../../../system/server/src/services/media-assets.mjs');

const options = parseArgs(process.argv.slice(2));
const db = getDb();
const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 17);
const backupPath = path.join(repoRoot, `tmp/site-before-pdf-html-import-${options.productId}-${timestamp}.sqlite`);
fs.mkdirSync(path.dirname(backupPath), { recursive: true });
db.exec(`VACUUM INTO '${backupPath.replaceAll("'", "''")}'`);

const language = queryOne('SELECT id, code FROM languages WHERE code = ?', [options.language]);
if (!language) fail(`Language not found: ${options.language}`);
const translation = queryOne(
  `SELECT id, content_html FROM content_product_translations WHERE entry_id = ? AND language_id = ?`,
  [options.productId, language.id],
);
if (!translation) fail(`Product ${options.productId} translation ${options.language} not found`);

const oldAssets = queryAll(
  `SELECT id, relative_path FROM media_assets WHERE purpose = 'richtext_image' ORDER BY id`,
).filter((asset) => translation.content_html.includes(asset.relative_path));
const uploaded = [];

db.exec('BEGIN IMMEDIATE');
try {
  const fragments = [];
  for (const htmlFile of options.htmlFiles) {
    const absoluteHtml = path.resolve(repoRoot, htmlFile);
    let fragment = extractBody(fs.readFileSync(absoluteHtml, 'utf8'), htmlFile);
    if (!options.keepChrome) fragment = stripDocumentChrome(fragment);
    rejectForbiddenMarkup(fragment, htmlFile);

    const sources = [...new Set([...fragment.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]))];
    for (const source of sources) {
      if (/^(?:https?:|data:|\/)/i.test(source)) {
        fail(`Image must be a local HTML asset before import: ${source}`);
      }
      const sourcePath = path.resolve(path.dirname(absoluteHtml), source);
      if (!fs.existsSync(sourcePath)) fail(`Image not found: ${sourcePath}`);
      const asset = await uploadMediaAsset({
        buffer: fs.readFileSync(sourcePath),
        originalFilename: `${path.basename(absoluteHtml, path.extname(absoluteHtml))}-${path.basename(sourcePath)}`,
        purpose: 'richtext_image',
      });
      uploaded.push(asset);
      fragment = fragment.split(source).join(asset.relative_path);
    }
    fragments.push(fragment.trim());
  }

  const contentHtml = fragments.join('\n\n');
  validateImportedContent(contentHtml, options.keepChrome);
  db.prepare(
    `UPDATE content_product_translations
     SET content_html = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(contentHtml, translation.id);

  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  for (const asset of uploaded) {
    if (asset.fs_path && fs.existsSync(asset.fs_path)) fs.unlinkSync(asset.fs_path);
  }
  throw error;
}

const deleted = [];
if (!options.keepOldImages) {
  for (const asset of oldAssets) {
    deleted.push({ id: asset.id, ...deleteMediaAsset(asset.id) });
  }
}

if (options.build) runSinglePageBuild(options);

console.log(JSON.stringify({
  productId: options.productId,
  language: options.language,
  backupPath,
  uploaded: uploaded.map((asset) => ({ id: asset.id, relativePath: asset.relative_path })),
  deleted: deleted.map((asset) => ({ id: asset.id, deletedFile: asset.deletedFile })),
  built: options.build,
}, null, 2));

function parseArgs(args) {
  const result = { htmlFiles: [], language: 'zh-CN', keepChrome: false, keepOldImages: false, build: true };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--product-id') result.productId = positiveInt(args[++index], arg);
    else if (arg === '--language') result.language = requiredValue(args[++index], arg);
    else if (arg === '--html') result.htmlFiles.push(requiredValue(args[++index], arg));
    else if (arg === '--keep-chrome') result.keepChrome = true;
    else if (arg === '--keep-old-images') result.keepOldImages = true;
    else if (arg === '--no-build') result.build = false;
    else fail(`Unknown argument: ${arg}`);
  }
  if (!result.productId) fail('--product-id is required');
  if (result.htmlFiles.length === 0) fail('At least one --html is required');
  return result;
}

function requiredValue(value, flag) {
  if (!value || value.startsWith('--')) fail(`${flag} requires a value`);
  return value;
}

function positiveInt(value, flag) {
  const parsed = Number.parseInt(requiredValue(value, flag), 10);
  if (!Number.isInteger(parsed) || parsed <= 0) fail(`${flag} must be a positive integer`);
  return parsed;
}

function extractBody(html, file) {
  const match = html.match(/<body\b[^>]*>\s*([\s\S]*?)\s*<\/body>/i);
  if (!match) fail(`Cannot extract <body> from ${file}`);
  return match[1];
}

function stripDocumentChrome(html) {
  return html
    .replace(/\s*<header\b[^>]*\bclass="[^"]*\bdocument-header\b[^"]*"[^>]*>[\s\S]*?<\/header>\s*/gi, '\n')
    .replace(/\s*<div\b[^>]*\bclass="[^"]*\btitle-band\b[^"]*"[^>]*>[\s\S]*?<\/div>\s*/gi, '\n')
    .replace(/\s*<footer\b[^>]*\bclass="[^"]*\bdocument-footer\b[^"]*"[^>]*>[\s\S]*?<\/footer>\s*/gi, '\n');
}

function rejectForbiddenMarkup(html, file) {
  if (/<style\b|\sstyle\s*=|<link\b/i.test(html)) fail(`Forbidden style or link markup in ${file}`);
}

function validateImportedContent(html, keepChrome) {
  if (!html.includes('class="pdf-document')) fail('Imported content has no pdf-document wrapper');
  if (/src="assets\//i.test(html)) fail('Local image paths remain after upload');
  rejectForbiddenMarkup(html, 'imported content');
  if (!keepChrome && /\b(document-header|title-band|document-footer)\b/.test(html)) {
    fail('Document chrome remains after stripping');
  }
}

function runSinglePageBuild(settings) {
  const result = spawnSync(
    'npm',
    ['--prefix', 'system/server', 'run', 'build:static', '--', '--language', settings.language, '--section', 'column:1:detail', '--content-id', String(settings.productId), '--clean-existing', 'false'],
    { cwd: repoRoot, stdio: 'inherit' },
  );
  if (result.status !== 0) fail(`Single-page static build failed with status ${result.status}`);
}

function fail(message) {
  throw new Error(message);
}
