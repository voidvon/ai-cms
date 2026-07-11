import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStaticSite } from '../src/static-builder.mjs';
import { clearTsxTemplateCache } from '../src/tsx-template-renderer.mjs';
import { CONTENT_ROOT } from '../src/config.mjs';

const EVENT_MARKER = '__STATIC_BUILD_EVENT__';
const RESULT_MARKER = '__STATIC_BUILD_RESULT__';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const cliArgs = parseCliArgs(process.argv.slice(2));
const outputDirArg = normalizeCliValue(cliArgs['output-dir']);
const outputRoot = outputDirArg
  ? path.resolve(appRoot, outputDirArg)
  : process.env.STATIC_OUTPUT_DIR
    ? path.resolve(appRoot, process.env.STATIC_OUTPUT_DIR)
    : CONTENT_ROOT;
const languageCode = normalizeCliValue(cliArgs.language || cliArgs.lang);
const section = normalizeCliValue(cliArgs.section);
const contentItemId = normalizePositiveInteger(cliArgs['content-id']);
const cleanExisting = normalizeBooleanCliValue(cliArgs['clean-existing'], true);
const jsonOutput = normalizeBooleanCliValue(cliArgs.json, false);

// 清除TSX模板缓存，确保使用最新的模板代码
clearTsxTemplateCache();
console.log('[build-static] TSX template cache cleared');

const result = buildStaticSite({
  outputRoot,
  cleanExisting,
  languageCode,
  contentItemId,
  sections: section ? [section] : undefined,
  onProgress: jsonOutput
    ? (event) => {
      console.log(`${EVENT_MARKER}${JSON.stringify(event)}`);
    }
    : null
});

console.log('[build-static] Static site build completed');
if (languageCode) {
  console.log(`[build-static] Language: ${languageCode}`);
}
if (section) {
  console.log(`[build-static] Section: ${section}`);
}

console.log(`Static pages generated into: ${result.outputRoot}`);
for (const item of result.results) {
  console.log(`- ${item.label}: ${item.filesWritten} files (${item.recordsProcessed} records)`);
}
if (jsonOutput) {
  console.log(`${RESULT_MARKER}${JSON.stringify(result)}`);
}

function parseCliArgs(argv) {
  const output = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = String(argv[index] || '').trim();
    if (!token.startsWith('--')) {
      continue;
    }

    const body = token.slice(2);
    if (!body) {
      continue;
    }

    const equalIndex = body.indexOf('=');
    if (equalIndex >= 0) {
      output[body.slice(0, equalIndex)] = body.slice(equalIndex + 1);
      continue;
    }

    const nextToken = String(argv[index + 1] || '').trim();
    if (nextToken && !nextToken.startsWith('--')) {
      output[body] = nextToken;
      index += 1;
      continue;
    }

    output[body] = 'true';
  }

  return output;
}

function normalizeCliValue(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeBooleanCliValue(value, fallback) {
  if (value === undefined) {
    return fallback;
  }

  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizePositiveInteger(value) {
  const normalized = Number.parseInt(value, 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
}
