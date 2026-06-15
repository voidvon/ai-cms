#!/usr/bin/env node

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function runLegacyEncodingRepair() {
  throw new Error('repair-legacy-encoding.mjs 已退役：旧修复逻辑依赖已删除的 legacy 表。请基于 columns / column_translations 重写后再使用。');
}

const entryFilePath = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryFilePath) {
  console.error('repair-legacy-encoding.mjs 已退役：旧修复逻辑依赖已删除的 legacy 表。');
  process.exit(1);
}
