import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { listColumns, createManualColumn, updateManualColumn } from '../system/server/src/services/columns.mjs';
import { createContentItem, listContentItemsAdmin, updateContentItem } from '../system/server/src/services/content-items.mjs';
import { getContentModelByCode } from '../system/server/src/services/content-models.mjs';
import { ensureContentModelStorageSchema } from '../system/server/src/services/content-model-storage.mjs';
import { getDefaultLanguage } from '../system/server/src/services/languages.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SEED_PATH = path.resolve(
  __dirname,
  '../docs/关键词列表/按产品系列类型拆分/专题树种子.json'
);

const args = new Set(process.argv.slice(2));
const shouldApply = args.has('--apply');
const seedPath = resolveSeedPath(process.argv.slice(2));

ensureContentModelStorageSchema();

const topicModel = getContentModelByCode('topic');
if (!topicModel?.id) {
  throw new Error('topic 内容模型不存在，请先初始化内容模型');
}

const defaultLanguageCode = getDefaultLanguage()?.code || 'zh-CN';
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
const columnsByPath = new Map(
  listColumns({ languageCode: defaultLanguageCode }).map((column) => [String(column.route_path || '').trim(), column])
);
const existingTopicsByCode = new Map(
  listContentItemsAdmin('topic', { page: 1, limit: 1000, languageCode: defaultLanguageCode }).items
    .map((item) => [String(item.code || '').trim(), item])
    .filter(([code]) => Boolean(code))
);

const planned = {
  createColumns: 0,
  updateColumns: 0,
  createTopics: 0,
  updateTopics: 0
};

const rootRoutePath = normalizeRoutePath(seed.root?.route_path || '/topics/');
const rootColumn = syncColumn({
  name: seed.root?.name || '专题',
  routePath: rootRoutePath,
  parentId: 0,
  slug: trimSlashes(rootRoutePath) || 'topics',
  sortOrder: 0,
  detailRule: seed.root?.detail_rule || '{id}.html',
  summary: '按产品系列、产品类型和解决方案组织的专题入口。'
});

syncTopicContent({
  code: 'topics',
  name: seed.root?.name || '专题',
  columnId: rootColumn.id,
  parentTopicCode: '',
  topicType: seed.root?.topic_type || 'topic_root',
  primaryKeyword: 'topics',
  keywordGroup: [],
  relatedProductCategories: [],
  sortOrder: 0
});

walkTopicNodes(seed.nodes || [], {
  parentColumn: rootColumn,
  parentRoutePath: rootRoutePath,
  parentTopicCode: 'topics',
  depth: 1
});

console.log(JSON.stringify({
  mode: shouldApply ? 'apply' : 'dry-run',
  seed: path.relative(process.cwd(), seedPath),
  ...planned
}, null, 2));

if (!shouldApply) {
  console.log('未写入数据库。确认无误后运行：node scripts/sync-topic-tree-seed.mjs --apply');
}

function walkTopicNodes(nodes, { parentColumn, parentRoutePath, parentTopicCode, depth }) {
  nodes.forEach((node, index) => {
    const slug = String(node.slug || node.code || '').trim();
    if (!slug) {
      throw new Error(`专题节点缺少 slug/code: ${JSON.stringify(node)}`);
    }

    const routePath = normalizeRoutePath(`${ensureTrailingSlash(parentRoutePath)}${slug}/`);
    const sortOrder = Number(node.volume || 0) * -1000 + index;
    const column = syncColumn({
      name: node.name,
      routePath,
      parentId: parentColumn.id,
      slug,
      sortOrder,
      detailRule: seed.root?.detail_rule || '{id}.html',
      summary: buildColumnSummary(node)
    });

    syncTopicContent({
      code: node.code,
      name: node.name,
      columnId: column.id,
      parentTopicCode,
      topicType: node.topic_type || (depth > 1 ? 'product_type' : 'product_family'),
      primaryKeyword: node.primary_keyword || '',
      keywordGroup: buildKeywordGroup(node),
      relatedProductCategories: node.related_product_categories || [],
      sortOrder,
      sourceFile: node.keyword_source_file || '',
      keywordCount: node.keyword_count || node.keyword_signal_count || 0,
      volume: node.volume || 0
    });

    walkTopicNodes(node.children || [], {
      parentColumn: column,
      parentRoutePath: routePath,
      parentTopicCode: node.code,
      depth: depth + 1
    });
  });
}

function syncColumn({ name, routePath, parentId, slug, sortOrder, detailRule, summary }) {
  const existing = columnsByPath.get(routePath) || null;
  if (existing && Number(existing.content_model_id || 0) !== Number(topicModel.id)) {
    throw new Error(`路径 ${routePath} 已存在但未绑定 topic 模型，停止同步`);
  }

  const payload = {
    base: {
      name,
      parent_id: parentId || 0,
      column_type: 'list',
      content_model_id: topicModel.id,
      custom_url: '',
      dir_name: slug,
      route_path: routePath,
      detail_rule: detailRule || '{id}.html',
      summary,
      seo_title: `${name} | Spirax Sarco`,
      seo_description: summary,
      publish_status: 'published',
      sort_order: sortOrder,
      is_visible: 1
    },
    translations: {
      [defaultLanguageCode]: {
        name,
        summary,
        seo_title: `${name} | Spirax Sarco`,
        seo_description: summary,
        publish_status: 'published'
      }
    }
  };

  if (!shouldApply) {
    if (existing) {
      planned.updateColumns += 1;
      return existing;
    }
    planned.createColumns += 1;
    return {
      id: planned.createColumns * -1,
      route_path: routePath,
      name,
      content_model_id: topicModel.id
    };
  }

  const column = existing
    ? updateManualColumn(existing.id, payload)
    : createManualColumn(payload);
  if (existing) {
    planned.updateColumns += 1;
  } else {
    planned.createColumns += 1;
  }
  columnsByPath.set(routePath, column);
  return column;
}

function syncTopicContent({
  code,
  name,
  columnId,
  parentTopicCode,
  topicType,
  primaryKeyword,
  keywordGroup,
  relatedProductCategories,
  sortOrder,
  sourceFile = '',
  keywordCount = 0,
  volume = 0
}) {
  const existing = existingTopicsByCode.get(code) || null;
  const summary = buildTopicSummary({ name, primaryKeyword, keywordCount, volume });
  const base = {
    column_id: columnId,
    code,
    topic_type: topicType,
    parent_topic_code: parentTopicCode,
    primary_keyword: primaryKeyword,
    keyword_group: keywordGroup.join('\n'),
    related_product_categories_json: JSON.stringify(relatedProductCategories, null, 2),
    related_products_json: '[]',
    related_resources_json: '[]',
    related_tools_json: '[]',
    related_industries_json: '[]',
    module_config_json: JSON.stringify({
      source_file: sourceFile,
      keyword_count: Number(keywordCount || 0),
      volume: Number(volume || 0),
      modules: [
        'overview',
        'related_products',
        'selection_guides',
        'downloads',
        'faq',
        'related_topics'
      ]
    }, null, 2),
    template_variant_key: '',
    is_visible: 1,
    is_featured_home: parentTopicCode === 'topics' ? 1 : 0,
    sort_order: sortOrder
  };
  const payload = {
    base,
    translations: {
      [defaultLanguageCode]: {
        name,
        summary,
        content_html: '',
        seo_title: `${name} | Spirax Sarco`,
        seo_description: summary,
        publish_status: 'published'
      }
    }
  };

  if (!shouldApply) {
    if (existing) {
      planned.updateTopics += 1;
    } else {
      planned.createTopics += 1;
    }
    return;
  }

  const item = existing
    ? updateContentItem('topic', existing.id, payload)
    : createContentItem('topic', payload);
  if (existing) {
    planned.updateTopics += 1;
  } else {
    planned.createTopics += 1;
  }
  existingTopicsByCode.set(code, item);
}

function buildKeywordGroup(node) {
  return [
    node.primary_keyword,
    node.name,
    ...(node.related_product_categories || [])
  ].map((item) => String(item || '').trim()).filter(Boolean);
}

function buildColumnSummary(node) {
  const count = Number(node.keyword_count || node.keyword_signal_count || 0);
  if (count > 0) {
    return `${node.name}专题，覆盖 ${count} 条关键词线索，用于组织产品、选型内容、资料和相关专题。`;
  }
  return `${node.name}专题，用于组织产品、选型内容、资料和相关专题。`;
}

function buildTopicSummary({ name, primaryKeyword, keywordCount, volume }) {
  const parts = [`${name}专题页`];
  if (primaryKeyword) {
    parts.push(`主关键词：${primaryKeyword}`);
  }
  if (Number(keywordCount || 0) > 0) {
    parts.push(`关键词数量：${keywordCount}`);
  }
  if (Number(volume || 0) > 0) {
    parts.push(`搜索量信号：${volume}`);
  }
  return `${parts.join('，')}。`;
}

function resolveSeedPath(argv) {
  const seedArg = argv.find((arg) => arg.startsWith('--seed='));
  if (!seedArg) {
    return DEFAULT_SEED_PATH;
  }
  return path.resolve(process.cwd(), seedArg.slice('--seed='.length));
}

function normalizeRoutePath(value) {
  const normalized = `/${String(value || '').trim().replace(/^\/+|\/+$/g, '')}/`;
  return normalized === '//'
    ? '/'
    : normalized;
}

function ensureTrailingSlash(value) {
  return String(value || '').endsWith('/') ? String(value || '') : `${value}/`;
}

function trimSlashes(value) {
  return String(value || '').replace(/^\/+|\/+$/g, '');
}
