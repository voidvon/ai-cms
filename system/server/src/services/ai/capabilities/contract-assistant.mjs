import { createAiAgent } from '../runtime.mjs';
import { capabilityRegistry } from '../core/capability-registry.mjs';

/**
 * 合同协作能力
 * 连续对话收集价格、条款与合同上下文，生成合同草稿
 */
export const contractAssistantCapability = {
  key: 'contract_assistant',
  label: '合同协作',
  description: '连续对话收集价格、条款与合同上下文，适合作为合同起草的 AI 助手',
  icon: '📝',
  category: 'business',
  visibleToolNames: ['price_lookup', 'contract_clause_picker'],

  // 匹配器：当消息包含合同相关关键词时激活
  matcher: {
    priority: 10, // 高优先级
    keywords: ['合同', '草稿', '起草', 'contract', 'draft', '客户合同', '销售合同'],
  },

  // 创建 Agent
  createAgent: ({ tools, instructions }) => {
    return createAiAgent({
      name: 'AI Contract Assistant',
      instructions:
        instructions ||
        [
          '你是管理后台里的 AI 合同协作助手。',
          '你的职责包括：查询价格、收集合同所需字段、解释缺失信息、生成合同草稿。',
          '当用户问价格时，优先调用 price_lookup 工具。',
          '当用户要生成合同或补充合同条款时，可以调用 contract_clause_picker 工具。',
          '如果信息不足，不要假装完成合同，而要明确追问缺少的字段。',
          '生成合同时，请输出清晰的中文结果，包含：已知信息、待确认项、建议下一步。',
          '如果用户明确要求"生成合同草稿"，再给出结构化草稿摘要；否则优先保持对话式回复。',
        ].join('\n'),
      tools: tools || [],
    });
  },

  // 工具选择
  selectTools: (context) => {
    // 合同协作固定使用价格和条款工具
    return ['price_lookup', 'contract_clause_picker'];
  },

  // 增强上下文
  enhanceContext: (context) => {
    return {
      ...context,
      metadata: {
        capability: 'contract_assistant',
        timestamp: new Date().toISOString(),
      },
    };
  },

  // 构建动态指令
  buildInstructions: (context) => {
    const parts = [
      '你是管理后台里的 AI 合同协作助手。',
      '你的职责包括：查询价格、收集合同所需字段、解释缺失信息、生成合同草稿。',
    ];

    // 根据对话历史调整指令
    if (context.conversationHistory?.topics) {
      const topics = context.conversationHistory.topics;
      if (topics.includes('价格')) {
        parts.push('用户已经讨论过价格，可以继续深入收集产品明细。');
      }
      if (topics.includes('客户')) {
        parts.push('用户已经提供客户信息，可以继续收集产品和条款。');
      }
    }

    parts.push('当用户问价格时，优先调用 price_lookup 工具。');
    parts.push('当用户要生成合同或补充合同条款时，可以调用 contract_clause_picker 工具。');
    parts.push('如果信息不足，不要假装完成合同，而要明确追问缺少的字段。');

    return parts.join('\n');
  },

  // 可用性检查
  isAvailable: (context) => {
    // 合同协作能力始终可用
    return true;
  },
};

/**
 * 注册合同协作能力
 */
export function registerContractAssistantCapability() {
  capabilityRegistry.register(contractAssistantCapability);
}
