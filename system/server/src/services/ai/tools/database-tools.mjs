import { z } from 'zod';
import { toolRegistry } from '../core/tool-registry.mjs';
import { listModelColumns } from '../../columns.mjs';
import { isAiDataSourceAvailable } from '../data-source-registry.mjs';
import { queryColumnsForAi, queryContactsForAi, queryContentItemsForAi, queryNewsForAi } from '../query-service.mjs';
import {
  getAiContentItemTranslationContext,
  getAiTopicProfileTranslationContext,
  setAiContentItemImage,
  updateAiContentItemTranslationTitle,
  updateAiTopicProfileTranslation,
} from '../mention-context.mjs';

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

  toolRegistry.register({
    name: 'update_content_item_translation_title',
    description: '修改指定内容项在指定数据库语言版本中的标题/name。只用于用户明确要求修改标题时，不修改正文、SEO 或其他字段。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'write',
    requiredPermissions: ['write:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      model_code: z.string().min(1).describe('内容模型编码，例如 product 或 news'),
      id: z.number().int().positive().describe('内容 ID'),
      language_code: z.string().min(1).describe('数据库 languages 表中的语言 code/name/native_name；无法确定时先询问用户，不要猜测'),
      title: z.string().min(1).describe('新的标题/name'),
    }),
    async execute({ model_code, id, language_code, title }, context) {
      return updateAiContentItemTranslationTitle({
        user: context.user,
        modelCode: model_code,
        id,
        languageCode: language_code,
        title,
      });
    },
  });

  toolRegistry.register({
    name: 'set_content_item_image_from_latest_generation',
    description: '将本次会话最近生成的图片设置到用户 @信息 引用的内容项图片中。默认追加到图片列表并设为主图；仅在用户明确要求把生成图片放到该内容项/产品图片时调用。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'write',
    requiredPermissions: ['write:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      model_code: z.string().min(1).describe('内容模型编码，例如 product'),
      id: z.number().int().positive().describe('@信息 引用内容项的 ID'),
      replace_gallery: z.boolean().default(false).describe('是否替换现有全部图片；默认 false，保留原图片并追加'),
      set_as_primary: z.boolean().default(true).describe('是否将生成图片设为主图；默认 true'),
    }),
    async execute({ model_code, id, replace_gallery, set_as_primary }, context) {
      const assetId = Number(context.latestGeneratedImage?.asset_id || 0);
      if (assetId <= 0) {
        return { updated: false, message: '当前会话没有可用的最近生成图片。' };
      }
      return setAiContentItemImage({
        user: context.user,
        modelCode: model_code,
        id,
        assetId,
        replaceGallery: replace_gallery,
        setAsPrimary: set_as_primary,
      });
    },
  });

  toolRegistry.register({
    name: 'get_topic_profile_translation',
    description: '读取指定专题栏目的指定语言配置，包括 SEO 标题、关键词、简介、关联内容和发布状态。用于非默认语言查询或多语言对比。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'read',
    requiredPermissions: ['read:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      column_id: z.number().int().positive().describe('专题栏目 ID，即 @专题 上下文中的 column.id'),
      language_code: z.string().min(1).describe('数据库 languages 表中的语言 code/name/native_name'),
    }),
    async execute({ column_id, language_code }, context) {
      return getAiTopicProfileTranslationContext({
        user: context.user,
        columnId: column_id,
        languageCode: language_code,
      });
    },
  });

  toolRegistry.register({
    name: 'update_topic_profile_translation',
    description: '修改专题栏目指定语言版本的配置。只更新明确提供的字段，保留同语言的其他字段，不影响其他语言。仅在用户明确要求写入时使用。',
    category: 'database',
    requiresAuth: true,
    accessLevel: 'write',
    requiredPermissions: ['write:content'],
    dataSources: ['managed_content'],
    isEnabled: () => isAiDataSourceAvailable('managed_content'),
    parameters: z.object({
      column_id: z.number().int().positive().describe('专题栏目 ID，即 @专题 上下文中的 column.id'),
      language_code: z.string().min(1).describe('目标语言的数据库 code/name/native_name；无法确定时先询问用户，不要猜测'),
      seo_title: z.string().optional().describe('新的专题 SEO 标题；不修改则不要传'),
      topic_keyword: z.string().optional().describe('新的专题优化关键词；不修改则不要传'),
      intro_html: z.string().optional().describe('新的专题富文本简介 HTML；不修改则不要传'),
      publish_status: z.enum(['draft', 'published']).optional().describe('新的发布状态；不修改则不要传'),
    }).refine(
      (value) => ['seo_title', 'topic_keyword', 'intro_html', 'publish_status'].some((fieldName) => value[fieldName] !== undefined),
      { message: '至少需要提供一个要修改的专题字段' }
    ),
    async execute({ column_id, language_code, seo_title, topic_keyword, intro_html, publish_status }, context) {
      return updateAiTopicProfileTranslation({
        user: context.user,
        columnId: column_id,
        languageCode: language_code,
        changes: { seo_title, topic_keyword, intro_html, publish_status },
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
