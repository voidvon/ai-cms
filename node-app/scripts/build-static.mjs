import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStaticSite } from '../src/static-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outputRoot = path.resolve(appRoot, process.env.STATIC_OUTPUT_DIR || 'generated');
const result = buildStaticSite({ outputRoot });

console.log(`Static pages generated into: ${result.outputRoot}`);
for (const item of result.results) {
  console.log(`- ${item.label}: ${item.filesWritten} files (${item.recordsProcessed} records)`);
}
