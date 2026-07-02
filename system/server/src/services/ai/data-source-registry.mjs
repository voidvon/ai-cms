import { queryOne } from '../../db.mjs';

function hasTable(tableName) {
  return Boolean(queryOne(
    `
      SELECT name
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `,
    [String(tableName || '').trim()]
  ));
}

export function getAiDataSourceStatus() {
  return {
    managed_content: {
      key: 'managed_content',
      label: '栏目内容模型',
      kind: 'database_table_group',
      available: hasTable('content_product') && hasTable('content_product_translations'),
      dependencies: ['content_product', 'content_product_translations'],
    },
    stub_price_catalog: {
      key: 'stub_price_catalog',
      label: '占位价格目录',
      kind: 'stub',
      available: true,
      dependencies: [],
    },
    news_table: {
      key: 'news_table',
      label: '新闻表',
      kind: 'database_table',
      available: hasTable('news'),
      dependencies: ['news'],
    },
    contacts_table: {
      key: 'contacts_table',
      label: '联系人表',
      kind: 'database_table',
      available: hasTable('contacts'),
      dependencies: ['contacts'],
    },
    contract_clause_stub: {
      key: 'contract_clause_stub',
      label: '占位条款库',
      kind: 'stub',
      available: true,
      dependencies: [],
    },
    document_drafts: {
      key: 'document_drafts',
      label: '文档草稿',
      kind: 'database_table',
      available: hasTable('document_drafts'),
      dependencies: ['document_drafts'],
    },
  };
}

export function isAiDataSourceAvailable(sourceKey) {
  const sources = getAiDataSourceStatus();
  return Boolean(sources[String(sourceKey || '').trim()]?.available);
}
