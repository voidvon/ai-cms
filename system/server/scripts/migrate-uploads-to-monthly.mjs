import fs from 'node:fs';
import path from 'node:path';
import { CONTENT_ROOT, PUBLIC_ROOT } from '../src/config.mjs';
import { execute, getDb, queryAll } from '../src/db.mjs';

const WRITE = process.argv.includes('--write');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif']);
const PLACEHOLDER_IMAGES = new Set([
  '/UploadFile/nopicture.gif',
  '/UploadFile/Newsuppic/nopicture.gif',
]);
const OLD_PATH_PATTERN = /(?:https?:\/\/[^/"'\s<>]+)?(\/(?:UploadFile|uploadfile|upload\/(?:products|news|richtext)|uploads\/images\/(?:products|news|richtext|product-cover|news-cover|richtext_image|attachment)|images\/global\/products)\/[^\s"'<>),?#]+\.(?:jpe?g|png|gif))/gi;
const TARGET_PATH_PATTERN = /^\/uploads\/images\/\d{6}\//i;

const paths = new Map();
const missing = [];
const moved = [];
const plannedTargetPaths = new Set();

collectReferencedUploadPaths();

for (const [oldPath, references] of paths.entries()) {
  if (PLACEHOLDER_IMAGES.has(oldPath)) {
    continue;
  }

  const sourcePath = resolveExistingFilePath(oldPath);
  if (!sourcePath) {
    missing.push(oldPath);
    continue;
  }

  const extension = path.extname(sourcePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(extension)) {
    missing.push(oldPath);
    continue;
  }

  const stat = fs.statSync(sourcePath);
  const monthSegment = getUploadMonthSegment(stat.mtime);
  const targetPath = resolveUniqueTargetPath(monthSegment, path.basename(sourcePath));
  const relativePath = toRelativeUploadPath(targetPath);

  references.newPath = relativePath;
  references.sourcePath = sourcePath;
  references.targetPath = targetPath;
}

const replacements = buildReplacements();

console.log(`[migrate-uploads] mode=${WRITE ? 'write' : 'dry-run'}`);
console.log(`[migrate-uploads] referenced paths=${paths.size}`);
console.log(`[migrate-uploads] migratable paths=${replacements.length}`);
console.log(`[migrate-uploads] missing paths=${missing.length}`);

if (!WRITE) {
  for (const [from, to] of replacements.slice(0, 20)) {
    console.log(`[migrate-uploads] ${from} -> ${to}`);
  }
  if (replacements.length > 20) {
    console.log(`[migrate-uploads] ... ${replacements.length - 20} more`);
  }
  console.log('[migrate-uploads] dry-run only. Re-run with --write to move files and update database.');
  process.exit(0);
}

moveFiles();
updateDatabaseReferences(replacements);

console.log(`[migrate-uploads] files moved=${moved.length}`);
console.log(`[migrate-uploads] database replacements=${replacements.length}`);
if (missing.length > 0) {
  console.log('[migrate-uploads] missing source files:');
  for (const item of missing.slice(0, 50)) {
    console.log(`- ${item}`);
  }
  if (missing.length > 50) {
    console.log(`- ... ${missing.length - 50} more`);
  }
}

function collectReferencedUploadPaths() {
  for (const table of listUserTables()) {
    const textColumns = listTextColumns(table.name);
    if (textColumns.length === 0) {
      continue;
    }

    const selectColumns = ['rowid AS __rowid', ...textColumns.map(quoteIdentifier)].join(', ');
    const rows = queryAll(`SELECT ${selectColumns} FROM ${quoteIdentifier(table.name)}`);
    for (const row of rows) {
      for (const column of textColumns) {
        collectPathsFromValue(row[column]);
      }
    }
  }
}

function collectPathsFromValue(value) {
  if (typeof value !== 'string' || value === '') {
    return;
  }

  for (const placeholder of PLACEHOLDER_IMAGES) {
    if (value.includes(placeholder)) {
      addReference(placeholder, placeholder);
    }
  }

  OLD_PATH_PATTERN.lastIndex = 0;
  for (const match of value.matchAll(OLD_PATH_PATTERN)) {
    const fullMatch = match[0];
    const relativePath = normalizeRelativePath(match[1]);
    if (!relativePath || TARGET_PATH_PATTERN.test(relativePath) || PLACEHOLDER_IMAGES.has(relativePath)) {
      continue;
    }
    addReference(relativePath, fullMatch);
  }
}

function addReference(relativePath, literal) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath || TARGET_PATH_PATTERN.test(normalizedPath)) {
    return;
  }

  const references = paths.get(normalizedPath) || { literals: new Set() };
  references.literals.add(literal);
  paths.set(normalizedPath, references);
}

function buildReplacements() {
  const output = [];

  for (const [oldPath, references] of paths.entries()) {
    if (PLACEHOLDER_IMAGES.has(oldPath)) {
      output.push([oldPath, '']);
      continue;
    }
    if (!references.newPath) {
      continue;
    }
    for (const literal of references.literals) {
      output.push([literal, references.newPath]);
    }
    output.push([oldPath, references.newPath]);
  }

  return dedupeReplacements(output).sort((a, b) => b[0].length - a[0].length);
}

function moveFiles() {
  for (const references of paths.values()) {
    if (!references.sourcePath || !references.targetPath) {
      continue;
    }

    fs.mkdirSync(path.dirname(references.targetPath), { recursive: true });

    if (references.sourcePath === references.targetPath) {
      continue;
    }

    fs.copyFileSync(references.sourcePath, references.targetPath);
    fs.unlinkSync(references.sourcePath);
    moved.push([references.sourcePath, references.targetPath]);
  }
}

function updateDatabaseReferences(replacements) {
  const db = getDb();
  db.exec('BEGIN');
  try {
    for (const table of listUserTables()) {
      const textColumns = listTextColumns(table.name);
      if (textColumns.length === 0) {
        continue;
      }

      const selectColumns = ['rowid AS __rowid', ...textColumns.map(quoteIdentifier)].join(', ');
      const rows = queryAll(`SELECT ${selectColumns} FROM ${quoteIdentifier(table.name)}`);
      for (const row of rows) {
        for (const column of textColumns) {
          const currentValue = row[column];
          const nextValue = replaceKnownPaths(currentValue, replacements);
          if (nextValue === currentValue) {
            continue;
          }
          execute(
            `UPDATE ${quoteIdentifier(table.name)} SET ${quoteIdentifier(column)} = ? WHERE rowid = ?`,
            [nextValue, Number(row.__rowid)],
          );
        }
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function replaceKnownPaths(value, replacements) {
  if (typeof value !== 'string' || value === '') {
    return value;
  }

  let nextValue = value;
  for (const [from, to] of replacements) {
    nextValue = nextValue.split(from).join(to);
  }
  return nextValue;
}

function listUserTables() {
  return queryAll(
    `
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      ORDER BY name ASC
    `,
  ).filter((table) => {
    const name = String(table.name || '');
    const sql = String(table.sql || '').toUpperCase();
    return !name.includes('_fts') && !sql.includes('VIRTUAL TABLE');
  });
}

function listTextColumns(tableName) {
  return queryAll(`PRAGMA table_info(${quoteIdentifier(tableName)})`)
    .filter((column) => isTextColumn(column.type))
    .map((column) => column.name);
}

function isTextColumn(type) {
  const normalized = String(type || '').toUpperCase();
  return normalized.includes('TEXT') || normalized.includes('CHAR') || normalized.includes('CLOB');
}

function resolveExistingFilePath(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  const strippedPath = normalizedPath.replace(/^\/+/, '');
  const segments = strippedPath.split('/').filter(Boolean);
  const candidates = [
    path.resolve(CONTENT_ROOT, strippedPath),
    path.resolve(PUBLIC_ROOT, strippedPath),
  ];

  if (segments[0]?.toLowerCase() === 'uploadfile') {
    candidates.push(path.resolve(CONTENT_ROOT, 'uploadfile', ...segments.slice(1)));
    candidates.push(path.resolve(CONTENT_ROOT, 'UploadFile', ...segments.slice(1)));
    if (segments.length > 1) {
      candidates.push(path.resolve(CONTENT_ROOT, 'uploadfile', segments[1].toLowerCase(), ...segments.slice(2)));
      candidates.push(path.resolve(CONTENT_ROOT, 'UploadFile', segments[1], ...segments.slice(2)));
    }
  }

  if (segments[0]?.toLowerCase() === 'images') {
    candidates.push(path.resolve(CONTENT_ROOT, 'images', ...segments.slice(1)));
    candidates.push(path.resolve(PUBLIC_ROOT, 'images', ...segments.slice(1)));
  }

  if (segments[0]?.toLowerCase() === 'upload') {
    candidates.push(path.resolve(CONTENT_ROOT, 'upload', ...segments.slice(1)));
  }

  if (segments[0]?.toLowerCase() === 'uploads') {
    candidates.push(path.resolve(CONTENT_ROOT, 'uploads', ...segments.slice(1)));
  }

  for (const candidate of candidates) {
    if (isInsideAllowedRoot(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  return null;
}

function resolveUniqueTargetPath(monthSegment, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const parsed = path.parse(safeFileName);
  let targetPath = path.resolve(CONTENT_ROOT, 'uploads/images', monthSegment, safeFileName);
  let index = 1;

  while (fs.existsSync(targetPath) || plannedTargetPaths.has(targetPath)) {
    targetPath = path.resolve(
      CONTENT_ROOT,
      'uploads/images',
      monthSegment,
      `${parsed.name}_${index}${parsed.ext}`,
    );
    index += 1;
  }

  plannedTargetPaths.add(targetPath);
  return targetPath;
}

function toRelativeUploadPath(filePath) {
  const relativePath = path.relative(CONTENT_ROOT, filePath).split(path.sep).join('/');
  return `/${relativePath}`;
}

function normalizeRelativePath(value) {
  const normalized = String(value || '').trim().replaceAll('\\', '/');
  if (!normalized) {
    return '';
  }
  return normalized.startsWith('/') ? normalized : `/${normalized}`;
}

function getUploadMonthSegment(date = new Date()) {
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'upload')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^_+/, '') || 'upload';
}

function dedupeReplacements(items) {
  const seen = new Set();
  const output = [];
  for (const item of items) {
    const key = `${item[0]}\n${item[1]}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(item);
  }
  return output;
}

function isInsideAllowedRoot(filePath) {
  const resolvedPath = path.resolve(filePath);
  for (const root of [CONTENT_ROOT, PUBLIC_ROOT]) {
    const resolvedRoot = path.resolve(root);
    if (resolvedPath === resolvedRoot || resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) {
      return true;
    }
  }
  return false;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
