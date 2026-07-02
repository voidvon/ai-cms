import { createAiAgent } from '../runtime.mjs';
import { capabilityRegistry } from '../core/capability-registry.mjs';

/**
 * 通用对话能力
 * 支持多轮对话、栏目内容查询、价格查询的后台助手
 */
export const generalChatCapability = {
  key: 'general_chat',
  label: '通用对话',
  description: '支持多轮对话、栏目内容查询、价格查询的 AI 助手',
  icon: '💬',
  category: 'general',
  visibleToolNames: ['query_columns', 'query_content_items', 'price_lookup'],

  // 匹配器：作为 fallback 能力，优先级最低
  matcher: {
    priority: -1, // fallback
    keywords: [],
  },

  // 创建 Agent
  createAgent: ({ tools, instructions }) => {
    return createAiAgent({
      name: 'General AI Assistant',
      instructions:
        instructions ||
        [
          '你是后台里的 AI 助手，当前主要职责是查询栏目内容和价格信息。',
          '你可以回答一般问题，但涉及系统数据时只围绕栏目、内容和价格三个方向工作。',
          '当用户询问站内内容时，优先调用 query_columns 和 query_content_items 工具查询栏目与内容。',
          '如果用户提到价格，可以使用 price_lookup 工具获取报价。',
          '如果用户请求联系方式、分类列表、新闻文章或其他未接入工具的数据，要明确说明当前入口暂不支持。',
          '保持友好、专业的语气，给出简洁明了的回复。',
        ].join('\n'),
      tools: tools || [],
    });
  },

  // 动态选择工具
  selectTools: (context) => {
    const tools = [];
    const message = String(context.message || '').toLowerCase();

    if (context.user) {
      if (context.user.hasPermissions(['read:content'])) {
        tools.push('query_columns', 'query_content_items');
      }
    }

    if (hasKeywords(message, ['价格', '报价', '多少钱', 'price', 'quote'])) {
      tools.push('price_lookup');
    }

    return tools;
  },

  // 增强上下文
  enhanceContext: (context) => {
    return {
      ...context,
      metadata: {
        capability: 'general_chat',
        timestamp: new Date().toISOString(),
      },
    };
  },

  // 构建动态指令
  buildInstructions: (context) => {
    const parts = [
      '你是后台里的 AI 助手，当前主要职责是查询栏目内容和价格信息。',
    ];

    // 根据用户权限调整指令
    if (context.user?.role === 'admin') {
      parts.push('你拥有管理员权限，可以访问所有数据。');
    }

    // 根据业务数据调整指令
    if (context.businessData) {
      if (context.businessData.itemCount > 0) {
        parts.push(`系统中当前可查询到 ${context.businessData.itemCount} 条相关内容。`);
      }
    }

    // 根据对话历史调整指令
    if (context.conversationHistory?.topics) {
      const topics = context.conversationHistory.topics;
      if (topics.includes('产品')) {
        parts.push('用户最近在讨论产品相关话题，优先先识别相关栏目，再用 query_content_items 查询栏目下的内容。');
      }
      if (topics.includes('价格')) {
        parts.push('用户最近在讨论价格相关话题，可以使用 price_lookup 工具提供报价。');
      }
    }

    parts.push('当前入口以栏目和内容查询为主，不提供联系方式等其他未接入工具。');
    parts.push('保持友好、专业的语气，给出简洁明了的回复。');

    return parts.join('\n');
  },

  // 可用性检查
  isAvailable: (context) => {
    // 通用对话能力始终可用
    return true;
  },
};

/**
 * 检查消息是否包含关键词
 */
function hasKeywords(message, keywords) {
  return keywords.some((keyword) => message.includes(keyword));
}

/**
 * 注册通用对话能力
 */
export function registerGeneralChatCapability() {
  capabilityRegistry.register(generalChatCapability);
}
