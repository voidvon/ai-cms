import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(repoRoot, 'docs/关键词列表/SavantLook数据源');
const localizedDir = path.join(repoRoot, 'docs/关键词列表/SavantLook本土化关键词');
const modelListPath = path.join(repoRoot, 'docs/关键词列表/全部产品型号列表.md');
const databasePath = path.join(repoRoot, 'data/site.sqlite');
const siteOutputDir = path.join(repoRoot, 'html');
const outputPath = path.join(repoRoot, 'docs/关键词列表/SavantLook专题关键词.csv');

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

function normalizePageSignal(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en')
    .replace(/&amp;/g, ' and ')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function collectEnglishPageSignals(rootDir) {
  const languageDirectories = new Set(['es', 'fr', 'tr', 'pt', 'id', 'th', 'vi']);
  const pages = [];
  const visit = (directory, relativeParts = []) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (relativeParts.length === 0 && entry.isDirectory() && languageDirectories.has(entry.name)) continue;
      const absolutePath = path.join(directory, entry.name);
      const nextParts = [...relativeParts, entry.name];
      if (entry.isDirectory()) {
        visit(absolutePath, nextParts);
        continue;
      }
      if (entry.name !== 'index.html') continue;
      const html = fs.readFileSync(absolutePath, 'utf8');
      const signals = [
        html.match(/<title>([\s\S]*?)<\/title>/i)?.[1],
        html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1],
        html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)/i)?.[1],
      ].filter(Boolean).map((value) => value.replace(/<[^>]*>/g, ' '));
      const route = `/${nextParts.slice(0, -1).join('/')}${nextParts.length > 1 ? '/' : ''}`;
      pages.push({
        route,
        signal: normalizePageSignal(`${route} ${signals.join(' ')}`),
      });
    }
  };
  visit(rootDir);
  return pages;
}

function resolveExistingWebsitePage(keyword, existingTopic, pageSignals) {
  if (existingTopic !== '否') return true;
  const core = normalizePageSignal(keyword.replace(/(?:spirax[\s._/-]*sarco|sarco[\s._/-]*spirax)/giu, ' '));
  if (/\b(?:share|shares|stock|price|ftse|aktie|investor|annual report|dividend)\b/.test(core)) return false;
  if (!core || /^(?:inc|incorporated)?$/.test(core)) return true;
  if (core.length < 3) return false;
  if (/\b(?:career|careers|jobs?|vacanc\w*|graduate|apprentice|join)\b/.test(core)) return true;
  if (/\b(?:contact|contacts|distributor|distributors|dealer|dealers|supplier|suppliers|representative|representatives)\b/.test(core)) return true;
  if (/\bwhere (?:can i |to )?buy\b/.test(core)) return true;
  if (/\b(?:training|course|courses|seminar|academy)\b/.test(core)) return true;
  if (/\b(?:company|engineering|plc|limited|ltd|group|about|who is|what is)\b/.test(core)) return true;
  if (new Set(['app', 'store', 'logo']).has(core)) return false;
  const paddedCore = ` ${core} `;
  return pageSignals.some((page) => ` ${page.signal} `.includes(paddedCore));
}

function resolveExistingTopic(keyword, publishedTopicsByRoute) {
  const steamTrapTopic = publishedTopicsByRoute.get('/topics/steam-traps/');
  if (steamTrapTopic && isSteamTrapIntent(keyword)) {
    return `是（ID ${steamTrapTopic.id}）`;
  }

  const topicRoot = publishedTopicsByRoute.get('/topics/');
  if (topicRoot && isPopularValveIntent(keyword)) {
    return `是（ID ${topicRoot.id}）`;
  }
  return '否';
}

function isSteamTrapIntent(keyword) {
  if (/\bsteam[\s._/-]*traps?\b/i.test(keyword)) return true;
  if (/\b(?:pump|air|liquid[\s-]+drain|water)[\s._/-]*traps?\b/i.test(keyword)) return false;
  return /\btraps?\b/i.test(keyword);
}

function isPopularValveIntent(keyword) {
  if (/\b(?:pressure[\s-]+reducing|control|safety|pressure[\s-]+relief|check|ball)[\s-]+valves?\b/i.test(keyword)) {
    return true;
  }
  const withoutBrand = keyword
    .replace(/(?:spirax[\s._/-]*sarco|sarco[\s._/-]*spirax)/giu, ' ')
    .replace(/[^a-z0-9]+/giu, ' ')
    .trim();
  return /^(?:steam[\s-]+)?valves?(?:\s+(?:catalog(?:ue)?|products?|selection|types?))?$/i.test(withoutBrand);
}

const database = new DatabaseSync(databasePath, { readOnly: true });
const publishedTopicsByRoute = new Map(database.prepare(`
  SELECT c.id, c.route_path
  FROM columns c
  JOIN topic_profiles tp ON tp.column_id = c.id
  WHERE tp.publish_status = 'published'
    AND c.route_path LIKE '/topics/%'
  GROUP BY c.id, c.route_path
`).all().map((topic) => [topic.route_path, topic]));
database.close();
const pageSignals = collectEnglishPageSignals(siteOutputDir);

const modelPatterns = buildModelPatterns(fs.readFileSync(modelListPath, 'utf8'));
const localizedFiles = fs.readdirSync(localizedDir).filter(
  (filename) => /^全球站关键词-.*\.csv$/.test(filename) || filename === '全球EN站关键词-国家位置地址类.csv',
);
const localizedKeywords = new Set();
for (const filename of localizedFiles) {
  const rows = parseCsv(fs.readFileSync(path.join(localizedDir, filename), 'utf8').replace(/^\uFEFF/, ''));
  const header = rows.shift() ?? [];
  const keywordIndex = header.findIndex((column) => column.trim() === 'Keyword');
  if (keywordIndex === -1) throw new Error(`Missing Keyword column: ${filename}`);
  for (const row of rows) {
    const keyword = normalizeKeyword(row[keywordIndex] ?? '');
    if (keyword) localizedKeywords.add(keyword);
  }
}

const records = new Map();
let sourceRowCount = 0;
let brandRowCount = 0;
let modelExcludedRowCount = 0;
let localizedExcludedRowCount = 0;

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
    if (localizedKeywords.has(keyword)) {
      localizedExcludedRowCount += 1;
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
  ['存在页面', 'Keyword', 'Volume', '国家数', '来源国家', '当前是否已存在'],
  ...outputRows.map((record) => {
    const existingTopic = resolveExistingTopic(record.keyword, publishedTopicsByRoute);
    return [
      resolveExistingWebsitePage(record.keyword, existingTopic, pageSignals) ? '有' : '',
      record.keyword,
      record.volume,
      record.countries.size,
      [...record.countries].sort((left, right) => left.localeCompare(right, 'zh-CN')).join('、'),
      existingTopic,
    ];
  }),
]
  .map((row) => row.map(csvCell).join(','))
  .join('\n');

fs.writeFileSync(outputPath, `\uFEFF${csv}\n`, 'utf8');
console.log(JSON.stringify({
  sourceFiles: fs.readdirSync(sourceDir).filter((name) => name.endsWith('.csv')).length,
  sourceRows: sourceRowCount,
  brandRows: brandRowCount,
  modelExcludedRows: modelExcludedRowCount,
  localizedFiles: localizedFiles.length,
  localizedKeywords: localizedKeywords.size,
  localizedExcludedRows: localizedExcludedRowCount,
  publishedTopics: publishedTopicsByRoute.size,
  existingTopicKeywords: outputRows.filter((record) => resolveExistingTopic(record.keyword, publishedTopicsByRoute) !== '否').length,
  existingWebsitePageKeywords: outputRows.filter((record) => {
    const existingTopic = resolveExistingTopic(record.keyword, publishedTopicsByRoute);
    return resolveExistingWebsitePage(record.keyword, existingTopic, pageSignals);
  }).length,
  outputKeywords: outputRows.length,
  outputPath: path.relative(repoRoot, outputPath),
}, null, 2));
