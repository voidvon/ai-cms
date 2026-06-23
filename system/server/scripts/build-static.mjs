import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStaticSite } from '../src/static-builder.mjs';
import { clearTsxTemplateCache } from '../src/tsx-template-renderer.mjs';
import { CONTENT_ROOT } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outputRoot = process.env.STATIC_OUTPUT_DIR
  ? path.resolve(appRoot, process.env.STATIC_OUTPUT_DIR)
  : CONTENT_ROOT;
const cliArgs = parseCliArgs(process.argv.slice(2));
const languageCode = normalizeCliValue(cliArgs.language || cliArgs.lang);

// 清除TSX模板缓存，确保使用最新的模板代码
clearTsxTemplateCache();
console.log('[build-static] TSX template cache cleared');

const result = buildStaticSite({
  outputRoot,
  cleanExisting: true,
  languageCode
});

console.log('[build-static] Static site build completed');
if (languageCode) {
  console.log(`[build-static] Language: ${languageCode}`);
}

console.log(`Static pages generated into: ${result.outputRoot}`);
for (const item of result.results) {
  console.log(`- ${item.label}: ${item.filesWritten} files (${item.recordsProcessed} records)`);
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
