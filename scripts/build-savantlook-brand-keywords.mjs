import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'docs/关键词列表/SavantLook数据源');
const modelListPath = path.join(repoRoot, 'docs/关键词列表/全部产品型号列表.md');
const outputPath = path.join(repoRoot, 'docs/关键词列表/SavantLook品牌相关非型号关键词.csv');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function normalizeKeyword(value) {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildModelPatterns(markdown) {
  const models = markdown
    .split(/\r?\n/)
    .filter((line) => line.startsWith('|'))
    .map((line) => line.split('|')[1]?.trim())
    .filter((model) => model && model !== '型号' && !model.startsWith('---'));

  return [...new Set(models.map((model) => model.normalize('NFKC').toLocaleLowerCase('en')))]
    .map((model) => {
      const compact = model.replace(/[^\p{L}\p{N}]/gu, '');
      if (!compact) return null;
      const body = [...compact].map(escapeRegex).join('[\\s._/-]*');
      return { model, pattern: new RegExp(`(?<![a-z0-9])${body}(?![a-z0-9])`, 'iu') };
    })
    .filter(Boolean)
    .sort((left, right) => right.model.length - left.model.length);
}

function hasBrandSignal(keyword) {
  return /(?:spirax[\s._/-]*sarco|sarco[\s._/-]*spirax)/iu.test(keyword) || keyword.includes('斯派莎克');
}

function numericVolume(value) {
  const parsed = Number(String(value ?? '').replaceAll(',', '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

const modelPatterns = buildModelPatterns(fs.readFileSync(modelListPath, 'utf8'));
const records = new Map();
let sourceRowCount = 0;
let brandRowCount = 0;
let modelExcludedRowCount = 0;

for (const filename of fs.readdirSync(sourceDir).filter((name) => name.endsWith('.csv')).sort()) {
  const country = filename.replace(/\.csv$/i, '').replace(/^\d+-\d+-/, '');
  const rows = parseCsv(fs.readFileSync(path.join(sourceDir, filename), 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift() ?? [];
  const keywordIndex = header.findIndex((column) => column.trim() === 'Keyword');
  const volumeIndex = header.findIndex((column) => column.trim() === 'Volume');
  if (keywordIndex === -1 || volumeIndex === -1) {
    throw new Error(`Missing Keyword or Volume column: ${filename}`);
  }

  for (const row of rows) {
    const keyword = normalizeKeyword(row[keywordIndex] ?? '');
    if (!keyword) continue;
    sourceRowCount += 1;
    if (!hasBrandSignal(keyword)) continue;
    brandRowCount += 1;
    if (modelPatterns.some(({ pattern }) => pattern.test(keyword))) {
      modelExcludedRowCount += 1;
      continue;
    }

    const volume = numericVolume(row[volumeIndex]);
    const existing = records.get(keyword) ?? { keyword, volume: 0, countries: new Set() };
    existing.volume = Math.max(existing.volume, volume);
    existing.countries.add(country);
    records.set(keyword, existing);
  }
}

const outputRows = [...records.values()].sort(
  (left, right) => right.volume - left.volume || left.keyword.localeCompare(right.keyword, 'en'),
);
const csv = [
  ['Keyword', 'Volume', '国家数', '来源国家'],
  ...outputRows.map((record) => [
    record.keyword,
    record.volume,
    record.countries.size,
    [...record.countries].sort((left, right) => left.localeCompare(right, 'zh-CN')).join('、'),
  ]),
]
  .map((row) => row.map(csvCell).join(','))
  .join('\n');

fs.writeFileSync(outputPath, `\uFEFF${csv}\n`, 'utf8');
console.log(JSON.stringify({
  sourceFiles: fs.readdirSync(sourceDir).filter((name) => name.endsWith('.csv')).length,
  sourceRows: sourceRowCount,
  brandRows: brandRowCount,
  modelExcludedRows: modelExcludedRowCount,
  outputKeywords: outputRows.length,
  outputPath: path.relative(repoRoot, outputPath),
}, null, 2));
