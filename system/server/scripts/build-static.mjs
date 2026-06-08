import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStaticSite } from '../src/static-builder.mjs';
import { CONTENT_ROOT } from '../src/config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outputRoot = process.env.STATIC_OUTPUT_DIR
  ? path.resolve(appRoot, process.env.STATIC_OUTPUT_DIR)
  : CONTENT_ROOT;
const result = buildStaticSite({
  outputRoot,
  cleanExisting: true
});

console.log(`Static pages generated into: ${result.outputRoot}`);
for (const item of result.results) {
  console.log(`- ${item.label}: ${item.filesWritten} files (${item.recordsProcessed} records)`);
}
