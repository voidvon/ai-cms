import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildStaticSite } from '../src/static-builder.mjs';
import { CONTENT_ROOT, PROJECT_ROOT, SERVER_ROOT } from '../src/config.mjs';

const htmlExtensions = new Set(['.html', '.htm']);
const frontDirs = new Set(['about', 'job', 'news', 'product', 'products', 'service', 'valve']);
const frontFiles = new Set(['index.html', 'contact.html', 'msg.html', '404.html', 'sitemap.html']);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'spirax-static-audit-'));

try {
  buildStaticSite({
    outputRoot: tempRoot,
    cleanExisting: true
  });

  const rootFrontFiles = collectHtmlFiles(CONTENT_ROOT, true);
  const expectedFiles = collectHtmlFiles(tempRoot, false);
  const rootSet = new Set(rootFrontFiles.map((item) => item.relativePath));
  const expectedSet = new Set(expectedFiles.map((item) => item.relativePath));
  const expectedIndex = new Map(expectedFiles.map((item) => [item.relativePath, item]));

  const rootOnly = sortStrings([...rootSet].filter((item) => !expectedSet.has(item)));
  const expectedOnly = sortStrings([...expectedSet].filter((item) => !rootSet.has(item)));
  const comparison = compareCommonFiles(rootFrontFiles, expectedIndex);

  printSection('Summary', [
    `project root: ${PROJECT_ROOT}`,
    `content root: ${CONTENT_ROOT}`,
    `fresh build temp: ${tempRoot}`,
    `root front html: ${rootFrontFiles.length}`,
    `expected html: ${expectedFiles.length}`,
    `common paths: ${comparison.commonCount}`,
    `same content: ${comparison.sameCount}`,
    `different content: ${comparison.diffFiles.length}`,
    `root-only paths: ${rootOnly.length}`,
    `expected-only paths: ${expectedOnly.length}`
  ]);

  printSection('Root Only', rootOnly, 120);
  printSection('Expected Only', expectedOnly, 120);
  printSection('Different Content', comparison.diffFiles, 160);
} finally {
  if (process.env.KEEP_AUDIT_OUTPUT === '1') {
    console.log(`\n[Info]\nkept temp audit output: ${tempRoot}`);
  } else {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

function collectHtmlFiles(baseDir, frontOnly) {
  const result = [];

  walk(baseDir, (absolutePath) => {
    const relativePath = path.relative(baseDir, absolutePath).replaceAll(path.sep, '/');
    if (!htmlExtensions.has(path.extname(relativePath).toLowerCase())) {
      return;
    }
    if (frontOnly && !isFrontHtml(relativePath)) {
      return;
    }
    result.push({ absolutePath, relativePath });
  });

  return result.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function walk(currentPath, visitor) {
  const stat = fs.statSync(currentPath);
  if (stat.isFile()) {
    visitor(currentPath);
    return;
  }

  for (const entry of fs.readdirSync(currentPath, { withFileTypes: true })) {
    const absolutePath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      if (absolutePath === SERVER_ROOT) {
        continue;
      }
      walk(absolutePath, visitor);
      continue;
    }
    if (entry.isFile()) {
      visitor(absolutePath);
    }
  }
}

function isFrontHtml(relativePath) {
  if (frontFiles.has(relativePath)) {
    return true;
  }
  const [topLevel] = relativePath.split('/');
  return frontDirs.has(topLevel);
}

function compareCommonFiles(rootFiles, expectedIndex) {
  let commonCount = 0;
  let sameCount = 0;
  const diffFiles = [];

  for (const rootFile of rootFiles) {
    const expectedFile = expectedIndex.get(rootFile.relativePath);
    if (!expectedFile) {
      continue;
    }

    commonCount += 1;
    const rootHash = sha1File(rootFile.absolutePath);
    const expectedHash = sha1File(expectedFile.absolutePath);
    if (rootHash === expectedHash) {
      sameCount += 1;
      continue;
    }
    diffFiles.push(rootFile.relativePath);
  }

  return {
    commonCount,
    sameCount,
    diffFiles: sortStrings(diffFiles)
  };
}

function sha1File(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function sortStrings(items) {
  return items.slice().sort((left, right) => left.localeCompare(right));
}

function printSection(title, lines, limit = 40) {
  console.log(`\n[${title}]`);
  if (!lines || lines.length === 0) {
    console.log('(none)');
    return;
  }

  for (const line of lines.slice(0, limit)) {
    console.log(line);
  }

  if (lines.length > limit) {
    console.log(`... ${lines.length - limit} more`);
  }
}
