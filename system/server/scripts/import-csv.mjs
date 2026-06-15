#!/usr/bin/env node

console.error('system/server/scripts/import-csv.mjs 已退役。');
console.error('原因：旧 CSV 导入链路依赖 products/news/product_categories/news_categories/corporation_categories 表，这些表已被统一迁移并删除。');
console.error('如需继续导入历史数据，请基于 columns / column_translations 重写导入器后再执行。');
process.exit(1);
