#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const cliArgs = process.argv.slice(2);
const contentRootArg = cliArgs.find((arg) => !arg.startsWith('--')) || 'html';
const INCLUDE_PDFS = cliArgs.includes('--include-pdfs');
const CONTENT_ROOT = path.resolve(PROJECT_ROOT, contentRootArg);
const PUBLIC_ROOT = path.resolve(PROJECT_ROOT, 'public');
const UPLOADS_ROOT = path.resolve(PROJECT_ROOT, 'uploads');

const AUDITABLE_EXTENSIONS = new Set([
  '.css', '.js', '.mjs', '.cjs', '.map',
  '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  '.mp4', '.webm', '.mp3', '.wav',
  '.pdf', '.txt', '.xml', '.json', '.wasm'
]);

const ASSET_PATH_HINTS = [
  '/assets/',
  '/css/',
  '/js/',
  '/skin/',
  '/upload/',
  '/uploads/',
  '/pagefind/'
];

const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.css']);

const findings = [];
let scannedFileCount = 0;
let checkedReferenceCount = 0;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  const stats = await fs.promises.stat(CONTENT_ROOT).catch(() => null);
  if (!stats?.isDirectory()) {
    throw new Error(`Content root not found: ${CONTENT_ROOT}`);
  }

  const files = await listFiles(CONTENT_ROOT);
  const textFiles = files.filter((filePath) => TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase()));

  for (const filePath of textFiles) {
    scannedFileCount += 1;
    const fileContent = await fs.promises.readFile(filePath, 'utf8');
    const references = path.extname(filePath).toLowerCase() === '.css'
      ? collectCssReferences(fileContent)
      : collectHtmlReferences(fileContent);

    for (const reference of references) {
      if (!shouldAuditReference(reference.value)) {
        continue;
      }

      const publicUrl = toPublicUrl(filePath);
      const requestPath = resolveRequestPath(publicUrl, reference.value);
      if (!looksLikeStaticAsset(requestPath)) {
        continue;
      }

      checkedReferenceCount += 1;
      const resolution = await resolveRuntimeCandidates(requestPath);
      if (resolution.found) {
        continue;
      }

      findings.push({
        sourceFile: path.relative(PROJECT_ROOT, filePath),
        line: getLineNumber(fileContent, reference.index),
        reference: reference.value,
        requestPath,
        candidates: resolution.candidates.map((candidate) => path.relative(PROJECT_ROOT, candidate))
      });
    }
  }

  printReport();
  if (findings.length > 0) {
    process.exitCode = 2;
  }
}

async function listFiles(rootDir) {
  const result = [];
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift();
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store') {
        continue;
      }
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
        continue;
      }
      if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }

  return result;
}

function collectHtmlReferences(input) {
  const references = [];
  const attributePattern = /\b(?:src|href|poster|data-src|data-href)\s*=\s*(["'])(.*?)\1/gi;
  const srcsetPattern = /\bsrcset\s*=\s*(["'])(.*?)\1/gi;
  const styleAttributePattern = /\bstyle\s*=\s*(["'])(.*?)\1/gi;
  const styleBlockPattern = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

  collectMatches(references, input, attributePattern, (match) => match[2], (match) => match.index + match[0].indexOf(match[2]));
  collectMatches(references, input, srcsetPattern, (match) => match[2], (match) => match.index + match[0].indexOf(match[2]), collectSrcsetUrls);
  collectMatches(references, input, styleAttributePattern, (match) => match[2], (match) => match.index + match[0].indexOf(match[2]), collectCssUrls);
  collectMatches(references, input, styleBlockPattern, (match) => match[1], (match) => match.index + match[0].indexOf(match[1]), collectCssReferences);

  return references;
}

function collectCssReferences(input) {
  const references = [];
  const urlPattern = /url\(\s*(?:"([^"]+)"|'([^']+)'|([^"'()]+))\s*\)/gi;
  const importPattern = /@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^"'();\s]+))/gi;

  collectMatches(references, input, urlPattern, (match) => match[1] || match[2] || match[3], (match) => {
    const value = match[1] || match[2] || match[3] || '';
    return match.index + match[0].indexOf(value);
  });
  collectMatches(references, input, importPattern, (match) => match[1] || match[2] || match[3], (match) => {
    const value = match[1] || match[2] || match[3] || '';
    return match.index + match[0].indexOf(value);
  });

  return references;
}

function collectCssUrls(input) {
  return collectCssReferences(input);
}

function collectSrcsetUrls(input) {
  return String(input || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ value: item.split(/\s+/)[0] || '', index: input.indexOf(item) }))
    .filter((item) => item.value);
}

function collectMatches(target, input, pattern, valueSelector, indexSelector, nestedCollector = null) {
  let match;
  while ((match = pattern.exec(input)) !== null) {
    const rawValue = valueSelector(match);
    const valueIndex = indexSelector(match);

    if (nestedCollector) {
      const nested = nestedCollector(rawValue);
      for (const item of nested) {
        target.push({
          value: item.value,
          index: valueIndex + (item.index || 0)
        });
      }
      continue;
    }

    target.push({
      value: rawValue,
      index: valueIndex
    });
  }
}

function shouldAuditReference(value) {
  const normalized = normalizeReferenceValue(value);
  if (!normalized) {
    return false;
  }
  if (!INCLUDE_PDFS && /^\/pdfs\//i.test(normalized)) {
    return false;
  }
  return !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(normalized) || normalized.startsWith('/');
}

function looksLikeStaticAsset(requestPath) {
  const pathname = stripQueryAndHash(requestPath);
  const ext = path.extname(pathname).toLowerCase();
  if (AUDITABLE_EXTENSIONS.has(ext)) {
    return true;
  }
  return ASSET_PATH_HINTS.some((hint) => pathname.includes(hint));
}

function toPublicUrl(filePath) {
  const relativePath = path.relative(CONTENT_ROOT, filePath).replaceAll(path.sep, '/');
  if (relativePath === 'index.html') {
    return '/';
  }
  if (relativePath.endsWith('/index.html')) {
    return `/${relativePath.slice(0, -'index.html'.length)}`;
  }
  return `/${relativePath}`;
}

function resolveRequestPath(publicUrl, referenceValue) {
  const cleanReference = normalizeReferenceValue(referenceValue);
  if (cleanReference.startsWith('/')) {
    return normalizeRequestPath(cleanReference);
  }

  const baseUrl = new URL(publicUrl, 'https://local.audit');
  return normalizeRequestPath(new URL(cleanReference, baseUrl).pathname + extractSuffix(cleanReference));
}

function normalizeRequestPath(value) {
  const [pathname, suffix = ''] = String(value || '').split(/(?=[?#])/);
  const normalizedPathname = pathname.replace(/\/{2,}/g, '/');
  return `${normalizedPathname}${suffix}`;
}

function normalizeReferenceValue(value) {
  const decoded = decodeHtmlEntities(String(value || ''));
  return decoded.trim().replace(/^['"]+|['"]+$/g, '');
}

function decodeHtmlEntities(value) {
  return String(value || '')
    .replaceAll('&quot;', '"')
    .replaceAll('&#34;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&#39;', "'")
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function extractSuffix(value) {
  const matched = String(value || '').match(/([?#].*)$/);
  return matched?.[1] || '';
}

async function resolveRuntimeCandidates(requestPath) {
  const pathname = stripQueryAndHash(requestPath);
  const candidates = [];

  const uploadPath = normalizeSharedUploadPath(pathname);
  if (uploadPath) {
    candidates.push(path.resolve(UPLOADS_ROOT, `.${uploadPath}`));
  }

  for (const candidate of getStaticCandidates(pathname)) {
    candidates.push(path.resolve(PUBLIC_ROOT, `.${candidate}`));
  }

  for (const candidate of getStaticCandidates(pathname)) {
    candidates.push(path.resolve(CONTENT_ROOT, `.${candidate}`));
  }

  const uniqueCandidates = [...new Set(candidates)];
  for (const candidate of uniqueCandidates) {
    const stats = await fs.promises.stat(candidate).catch(() => null);
    if (stats?.isFile()) {
      return { found: true, candidates: uniqueCandidates };
    }
  }

  return { found: false, candidates: uniqueCandidates };
}

function getStaticCandidates(pathname) {
  const candidates = [];
  candidates.push(pathname);

  for (const sharedCandidate of getSharedAssetCandidates(pathname)) {
    candidates.push(sharedCandidate);
  }

  const lowerPath = pathname.toLowerCase();
  if (lowerPath !== pathname) {
    candidates.push(lowerPath);
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0) {
    const capitalizedPath = '/' + segments
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
      .join('/');
    if (capitalizedPath !== pathname && capitalizedPath !== lowerPath) {
      candidates.push(capitalizedPath);
    }
  }

  if (pathname.endsWith('/')) {
    candidates.push(`${pathname}index.html`);
    candidates.push(`${lowerPath}index.html`);
  }

  return [...new Set(candidates)];
}

function getSharedAssetCandidates(pathname) {
  const normalized = String(pathname || '').replace(/\/{2,}/g, '/');
  const match = normalized.match(/^\/([^/]+)\/(css|js|skin|upload|uploads|assets)(\/.*)?$/i);
  if (!match) {
    return [];
  }

  const [, , assetDir, suffix = ''] = match;
  return [`/${assetDir}${suffix}`];
}

function normalizeSharedUploadPath(pathname) {
  const normalized = String(pathname || '').replace(/\/{2,}/g, '/');
  if (/^\/uploads\/(?:images|skin|pdfs)\//i.test(normalized)) {
    return normalized.replace(/^\/uploads\//i, '/');
  }
  if (/^\/upload\/(?:images|skin|pdfs)\//i.test(normalized)) {
    return normalized.replace(/^\/upload\//i, '/');
  }
  if (/^\/skin\//i.test(normalized)) {
    return normalized;
  }
  return '';
}

function stripQueryAndHash(value) {
  return String(value || '').split(/[?#]/)[0] || '';
}

function getLineNumber(content, index) {
  let line = 1;
  for (let position = 0; position < index; position += 1) {
    if (content.charCodeAt(position) === 10) {
      line += 1;
    }
  }
  return line;
}

function printReport() {
  console.log(`Scanned files: ${scannedFileCount}`);
  console.log(`Checked asset references: ${checkedReferenceCount}`);
  console.log(`Missing asset references: ${findings.length}`);

  if (findings.length === 0) {
    console.log('No missing static asset references found under the current runtime path mappings.');
    return;
  }

  for (const finding of findings.slice(0, 100)) {
    console.log('');
    console.log(`${finding.sourceFile}:${finding.line}`);
    console.log(`  ref: ${finding.reference}`);
    console.log(`  request: ${finding.requestPath}`);
    console.log('  candidates:');
    for (const candidate of finding.candidates) {
      console.log(`    - ${candidate}`);
    }
  }

  if (findings.length > 100) {
    console.log('');
    console.log(`Truncated output after 100 findings. Remaining: ${findings.length - 100}`);
  }
}
