#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const PRODUCT_MANAGEMENT = new Set([
  'README.md',
  '匹配摘要.csv',
  '人工语义分类摘要.csv',
  '人工语义分类规则.csv',
  '自动型号分类候选.csv',
  '自动型号分类进度.csv'
]);

const NON_MANAGEMENT = new Set([
  'README.md',
  '非产品属性分类规则.csv',
  '非产品属性分类进度.csv'
]);

function usage() {
  console.log(`Usage:
  node keyword_splitter_tools.mjs validate [--root docs/关键词列表]
  node keyword_splitter_tools.mjs rename [--root docs/关键词列表]
  node keyword_splitter_tools.mjs apply --plan /path/plan.json [--batch batch-N] [--root docs/关键词列表]

Plan format:
  {"moves":[{"keyword":"...","targetType":"product|non-product","category":"...","evidence":"...","token":"...","batch":"..."}]}`);
}

function parseArgs(argv) {
  const out = { cmd: argv[2], root: 'docs/关键词列表' };
  for (let i = 3; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--root') out.root = argv[++i];
    else if (arg === '--plan') out.plan = argv[++i];
    else if (arg === '--batch') out.batch = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function hasBom(file) {
  const b = fs.readFileSync(file);
  return b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf;
}

function parseCsv(text) {
  text = stripBom(text);
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v !== ''));
}

function escapeCsv(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function readCsv(file) {
  return parseCsv(fs.readFileSync(file, 'utf8'));
}

function writeCsv(file, rows) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `\ufeff${rows.map((r) => r.map(escapeCsv).join(',')).join('\n')}\n`, 'utf8');
}

function writeTextBom(file, text) {
  fs.writeFileSync(file, `\ufeff${stripBom(text)}`, 'utf8');
}

function paths(root) {
  const productDir = path.join(root, '按产品系列类型拆分');
  const nonDir = path.join(productDir, '非产品属性拆分');
  return {
    root,
    main: path.join(root, '全球EN站关键词合并去重.csv'),
    productDir,
    nonDir,
    readme: path.join(productDir, 'README.md'),
    summary: path.join(productDir, '匹配摘要.csv'),
    manualSummary: path.join(productDir, '人工语义分类摘要.csv'),
    progress: path.join(productDir, '自动型号分类进度.csv'),
    nonReadme: path.join(nonDir, 'README.md'),
    nonProgress: path.join(nonDir, '非产品属性分类进度.csv')
  };
}

function normalizeKeyword(s) {
  return String(s ?? '').trim().toLowerCase();
}

function categoryFromFile(file) {
  return file.replace(/\.csv$/u, '').replace(/^\d+(?:\.\d+)?-\d+-/u, '');
}

function categoryFiles(dir, management) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith('.csv') && !management.has(f))
    .map((file) => ({ file, category: categoryFromFile(file), path: path.join(dir, file) }));
}

function stats(file) {
  const rows = readCsv(file);
  const header = rows[0] ?? [];
  const vi = header.indexOf('Volume');
  let max = 0;
  if (vi >= 0) {
    for (const r of rows.slice(1)) {
      const n = Number(String(r[vi] ?? '0').replace(/,/g, ''));
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return { count: Math.max(0, rows.length - 1), max };
}

function volumeLabel(n) {
  return Number.isInteger(n) ? String(n) : String(n).replace(/\.0+$/u, '');
}

function findCategoryFile(dir, management, category) {
  const exact = path.join(dir, `${category}.csv`);
  if (fs.existsSync(exact)) return exact;
  const match = categoryFiles(dir, management).find((f) => f.category === category);
  return match ? match.path : exact;
}

function ensureTargetCsv(file, mainHeader, typeValue, category) {
  if (fs.existsSync(file)) return readCsv(file);
  const header = [...mainHeader];
  if (!header.includes('类型')) header.push('类型');
  if (!header.includes('备注')) header.push('备注');
  return [header];
}

function alignRow(sourceHeader, targetHeader, sourceRow, typeValue, evidence) {
  const sourceMap = new Map(sourceHeader.map((h, i) => [h, sourceRow[i] ?? '']));
  return targetHeader.map((h) => {
    if (h === '类型') return typeValue;
    if (h === '备注') return evidence;
    return sourceMap.get(h) ?? '';
  });
}

function replaceMarkdownTable(file, headerLine, alignLine, rows) {
  let text = stripBom(fs.readFileSync(file, 'utf8'));
  const start = text.indexOf(headerLine);
  if (start < 0) throw new Error(`Table header not found in ${file}`);
  const table = `${headerLine}\n${alignLine}\n${rows.join('\n')}\n`;
  writeTextBom(file, text.slice(0, start) + table);
}

function updateProductSummary(p) {
  const items = categoryFiles(p.productDir, PRODUCT_MANAGEMENT)
    .map((f) => ({ ...f, ...stats(f.path) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'zh-Hans-CN'));
  writeCsv(p.summary, [
    ['产品系列/类型', '文件', '关键词行数'],
    ...items.map((x) => [x.category, x.file, x.count])
  ]);
  if (fs.existsSync(p.readme)) {
    replaceMarkdownTable(
      p.readme,
      '| 产品系列/类型 | 文件 | 关键词行数 |',
      '| --- | --- | ---: |',
      items.map((x) => `| ${x.category} | ${x.file} | ${x.count} |`)
    );
  }
}

function updateNonReadme(p) {
  const items = categoryFiles(p.nonDir, NON_MANAGEMENT)
    .map((f) => ({ ...f, ...stats(f.path) }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category, 'zh-Hans-CN'));
  if (fs.existsSync(p.nonReadme)) {
    replaceMarkdownTable(
      p.nonReadme,
      '| 属性类型 | 文件 | 关键词行数 |',
      '| --- | --- | ---: |',
      items.map((x) => `| ${x.category} | ${x.file} | ${x.count} |`)
    );
  }
}

function renameCategories(dir, management) {
  const renamed = [];
  for (const item of categoryFiles(dir, management)) {
    const s = stats(item.path);
    const target = `${volumeLabel(s.max)}-${s.count}-${item.category}.csv`;
    const targetPath = path.join(dir, target);
    if (item.file !== target) {
      if (fs.existsSync(targetPath)) throw new Error(`Rename target already exists: ${targetPath}`);
      fs.renameSync(item.path, targetPath);
      renamed.push([item.file, target]);
    }
  }
  return renamed;
}

function appendProgress(file, header, rowsToAppend) {
  const rows = fs.existsSync(file) ? readCsv(file) : [header];
  rows.push(...rowsToAppend);
  writeCsv(file, rows);
}

function applyPlan(args) {
  if (!args.plan) throw new Error('Missing --plan');
  const p = paths(args.root);
  const plan = JSON.parse(fs.readFileSync(args.plan, 'utf8'));
  const moves = plan.moves ?? [];
  if (!Array.isArray(moves) || moves.length === 0) throw new Error('Plan contains no moves');

  const mainRows = readCsv(p.main);
  const mainHeader = mainRows[0];
  const keywordIndex = mainHeader.indexOf('Keyword');
  if (keywordIndex < 0) throw new Error('Main CSV must have a Keyword column');

  const byKeyword = new Map(mainRows.slice(1).map((r, i) => [normalizeKeyword(r[keywordIndex]), { row: r, index: i + 1 }]));
  const removeIndexes = new Set();
  const productProgress = [];
  const nonProgressTouched = new Map();
  const manualRows = [];
  const now = new Date().toISOString();

  for (const move of moves) {
    const keyword = normalizeKeyword(move.keyword);
    const found = byKeyword.get(keyword);
    if (!found) throw new Error(`Keyword not found in main CSV: ${move.keyword}`);
    if (removeIndexes.has(found.index)) throw new Error(`Duplicate move for keyword: ${move.keyword}`);
    const targetType = move.targetType;
    if (!['product', 'non-product'].includes(targetType)) throw new Error(`Invalid targetType for ${move.keyword}: ${targetType}`);
    if (!move.category || !move.evidence) throw new Error(`Move requires category and evidence: ${move.keyword}`);

    const dir = targetType === 'product' ? p.productDir : p.nonDir;
    const management = targetType === 'product' ? PRODUCT_MANAGEMENT : NON_MANAGEMENT;
    const typeValue = targetType === 'product' ? 'product' : '';
    const targetFile = findCategoryFile(dir, management, move.category);
    const targetRows = ensureTargetCsv(targetFile, mainHeader, typeValue, move.category);
    const targetHeader = targetRows[0];
    targetRows.push(alignRow(mainHeader, targetHeader, found.row, typeValue, move.evidence));
    writeCsv(targetFile, dedupeRows(targetRows));
    removeIndexes.add(found.index);

    if (targetType === 'product') {
      productProgress.push([
        move.token || move.keyword,
        'done',
        move.category,
        move.evidence,
        1,
        now,
        move.batch || args.batch || ''
      ]);
      manualRows.push([move.keyword, move.category, move.evidence, now, move.batch || args.batch || '']);
    } else {
      nonProgressTouched.set(move.category, true);
    }
  }

  const kept = [mainHeader, ...mainRows.slice(1).filter((_, i) => !removeIndexes.has(i + 1))];
  writeCsv(p.main, kept);

  if (productProgress.length) {
    appendProgress(p.progress, ['token', '状态', '产品系列/类型', '依据', '移动行数', '处理时间', '备注'], productProgress);
  }
  if (manualRows.length) {
    appendProgress(p.manualSummary, ['关键词', '产品系列/类型', '依据', '处理时间', '备注'], manualRows);
  }
  if (nonProgressTouched.size && fs.existsSync(p.nonProgress)) {
    const rows = readCsv(p.nonProgress);
    const catIndex = rows[0].indexOf('属性类型');
    const countIndex = rows[0].indexOf('关键词行数');
    for (const row of rows.slice(1)) {
      if (nonProgressTouched.has(row[catIndex])) {
        const file = findCategoryFile(p.nonDir, NON_MANAGEMENT, row[catIndex]);
        row[countIndex] = String(stats(file).count);
      }
    }
    writeCsv(p.nonProgress, rows);
  }

  renameAll(args.root);
  return validate(args.root);
}

function dedupeRows(rows) {
  const out = [rows[0]];
  const seen = new Set();
  for (const row of rows.slice(1)) {
    const key = JSON.stringify(row);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(row);
    }
  }
  return out;
}

function renameAll(root) {
  const p = paths(root);
  renameCategories(p.productDir, PRODUCT_MANAGEMENT);
  renameCategories(p.nonDir, NON_MANAGEMENT);
  updateProductSummary(p);
  updateNonReadme(p);
  return validate(root);
}

function validate(root) {
  const p = paths(root);
  const errors = [];
  const requireBom = [p.main, p.readme, p.summary, p.nonReadme].filter((f) => fs.existsSync(f));
  for (const file of requireBom) {
    if (!hasBom(file)) errors.push(`Missing UTF-8 BOM: ${file}`);
  }

  const mainRows = readCsv(p.main);
  const keywordIndex = (mainRows[0] ?? []).indexOf('Keyword');
  const mainKeywords = new Set(mainRows.slice(1).map((r) => normalizeKeyword(r[keywordIndex])));

  function validateCategoryDir(dir, management, label) {
    for (const item of categoryFiles(dir, management)) {
      const s = stats(item.path);
      const expected = `${volumeLabel(s.max)}-${s.count}-${item.category}.csv`;
      if (item.file !== expected) errors.push(`${label} bad filename: ${item.file}, expected ${expected}`);
      if (!hasBom(item.path)) errors.push(`Missing UTF-8 BOM: ${item.path}`);
      const rows = readCsv(item.path);
      const rowKeys = new Set();
      const ki = (rows[0] ?? []).indexOf('Keyword');
      for (const row of rows.slice(1)) {
        const rowKey = JSON.stringify(row);
        if (rowKeys.has(rowKey)) errors.push(`Duplicate full row in ${item.path}: ${row[ki] ?? rowKey}`);
        rowKeys.add(rowKey);
        const kw = normalizeKeyword(row[ki]);
        if (kw && mainKeywords.has(kw)) errors.push(`Keyword overlap with main CSV: ${kw} in ${item.path}`);
      }
    }
  }
  validateCategoryDir(p.productDir, PRODUCT_MANAGEMENT, 'product');
  validateCategoryDir(p.nonDir, NON_MANAGEMENT, 'non-product');

  if (fs.existsSync(p.summary)) {
    const summary = readCsv(p.summary);
    for (const row of summary.slice(1)) {
      const [category, file, count] = row;
      const fp = path.join(p.productDir, file);
      if (!fs.existsSync(fp)) errors.push(`Product summary references missing file: ${file}`);
      else {
        const s = stats(fp);
        if (categoryFromFile(file) !== category) errors.push(`Product summary category mismatch: ${file}`);
        if (String(s.count) !== String(count)) errors.push(`Product summary count mismatch: ${file}`);
      }
    }
  }

  if (fs.existsSync(p.nonProgress)) {
    const progress = readCsv(p.nonProgress);
    const ci = progress[0].indexOf('属性类型');
    const counti = progress[0].indexOf('关键词行数');
    for (const row of progress.slice(1)) {
      const category = row[ci];
      const matches = categoryFiles(p.nonDir, NON_MANAGEMENT).filter((f) => f.category === category);
      if (matches.length !== 1) errors.push(`Non-product progress category file count for ${category}: ${matches.length}`);
      else if (String(stats(matches[0].path).count) !== String(row[counti])) errors.push(`Non-product progress count mismatch: ${category}`);
    }
  }

  return {
    ok: errors.length === 0,
    mainCount: Math.max(0, mainRows.length - 1),
    productFiles: categoryFiles(p.productDir, PRODUCT_MANAGEMENT).length,
    productTotal: categoryFiles(p.productDir, PRODUCT_MANAGEMENT).reduce((sum, f) => sum + stats(f.path).count, 0),
    nonFiles: categoryFiles(p.nonDir, NON_MANAGEMENT).length,
    nonTotal: categoryFiles(p.nonDir, NON_MANAGEMENT).reduce((sum, f) => sum + stats(f.path).count, 0),
    errors
  };
}

try {
  const args = parseArgs(process.argv);
  let result;
  if (args.cmd === 'validate') result = validate(args.root);
  else if (args.cmd === 'rename') result = renameAll(args.root);
  else if (args.cmd === 'apply') result = applyPlan(args);
  else {
    usage();
    process.exit(args.cmd ? 1 : 0);
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exit(1);
} catch (error) {
  console.error(`[ERROR] ${error.message}`);
  process.exit(1);
}
