import { z } from 'zod';
import { toolRegistry } from '../core/tool-registry.mjs';
import { listModelColumns } from '../../columns.mjs';
import { isAiDataSourceAvailable } from '../data-source-registry.mjs';
import { queryColumnsForAi, queryContactsForAi, queryContentItemsForAi, queryNewsForAi } from '../query-service.mjs';
import { getAiContentItemTranslationContext } from '../mention-context.mjs';

/**
 * 注册所有数据库查询工具到全局工具注册中心
 */
export function registerDatabaseTools() {
  // 产品查询工具
  toolRegistry.register({
    name: 'query_content_items',
    description: '按栏目或栏目树查询内容，支持关键词筛选。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      keyword: z.string().optional().describe('搜索关键词，匹配内容标题、编号或摘要'),
      column_id: z.number().int().positive().optional().describe('栏目 ID'),
      root_column_id: z.number().int().positive().optional().describe('栏目树根节点 ID'),
      limit: z.number().int().positive().max(50).default(10).describe('返回结果数量限制'),
    }),
    async execute({ keyword, column_id, root_column_id, limit }, context) {
      return queryContentItemsForAi({
        user: context.user,
        keyword,
        columnId: column_id,
        rootColumnId: root_column_id,
        limit,
        visibleOnly: true,
      });
    },
  });

  toolRegistry.register({
    name: 'query_columns',
    description: '查询栏目树、子栏目和栏目基础信息。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      keyword: z.string().optional().describe('搜索关键词，匹配栏目名称、路径或模型编码'),
      parent_id: z.number().int().positive().optional().describe('父栏目 ID'),
      root_column_id: z.number().int().positive().optional().describe('栏目树根节点 ID'),
      limit: z.number().int().positive().max(50).default(10).describe('返回结果数量限制'),
    }),
    async execute({ keyword, parent_id, root_column_id, limit }, context) {
      return queryColumnsForAi({
        user: context.user,
        keyword,
        parentId: parent_id,
        rootColumnId: root_column_id,
        limit,
      });
    },
  });

  toolRegistry.register({
    name: 'get_content_item_translation',
    description: '读取指定内容项的指定语言详情。默认 @信息 只提供默认语言；当用户询问其他语言或需要多语言对比时使用。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      model_code: z.string().min(1).describe('内容模型编码，例如 product 或 news'),
      id: z.number().int().positive().describe('内容 ID'),
      language_code: z.string().min(1).describe('语言编码，例如 en、zh-CN'),
    }),
    async execute({ model_code, id, language_code }, context) {
      return getAiContentItemTranslationContext({
        user: context.user,
        modelCode: model_code,
        id,
        languageCode: language_code,
      });
    },
  });

  // 新闻查询工具
  toolRegistry.register({
    name: 'query_news',
    description: '查询新闻/文章数据库，支持按关键词、分类搜索。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:all'],
    dataSources: ['news_table'],
    isEnabled: () => isAiDataSourceAvailable('news_table'),
    parameters: z.object({
      keyword: z.string().optional().describe('搜索关键词，匹配标题或内容'),
      category_id: z.number().int().positive().optional().describe('新闻分类 ID'),
      limit: z.number().int().positive().max(20).default(5).describe('返回结果数量限制'),
    }),
    async execute({ keyword, category_id, limit }, context) {
      return queryNewsForAi({
        user: context.user,
        keyword,
        categoryId: category_id,
        limit,
      });
    },
  });

  // 产品分类查询工具
  toolRegistry.register({
    name: 'query_product_categories',
    description: '查询栏目列表。',
    category: 'database',
    requiresAuth: false,
    accessLevel: 'read',
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      parent_id: z.number().int().optional().describe('父栏目 ID，不传则查询顶级栏目'),
      limit: z.number().int().positive().max(50).default(10).describe('返回结果数量限制'),
    }),
    async execute({ parent_id, limit }, context) {
      const categories = listModelColumns('product')
        .filter((item) => (
          parent_id
            ? Number(item.parent_id || 0) === Number(parent_id)
            : Number(item.parent_id || 0) <= 0
        ))
        .slice(0, limit);

      return {
        total: categories.length,
        categories: categories.map((c) => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id,
          sort_order: c.sort_order,
          path: c.route_path || c.custom_url || '',
          model_code: c.model_code || '',
        })),
      };
    },
  });

  // 联系方式查询工具
  toolRegistry.register({
    name: 'query_contacts',
    description: '查询公司联系方式信息。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:all'],
    dataSources: ['contacts_table'],
    isEnabled: () => isAiDataSourceAvailable('contacts_table'),
    parameters: z.object({
      region: z.string().optional().describe('区域筛选，如 "华东", "华北"'),
    }),
    async execute({ region }, context) {
      return queryContactsForAi({
        user: context.user,
        region,
      });
    },
  });
}
