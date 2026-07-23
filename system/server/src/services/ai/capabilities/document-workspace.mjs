import { createAiAgent } from '../runtime.mjs';
import { capabilityRegistry } from '../core/capability-registry.mjs';
import { createDocumentAgentTools } from '../../document-agent/tools.mjs';

/**
 * 文档工作台能力
 * 专门用于报价单和合同草稿的协作编辑
 */
export const documentWorkspaceCapability = {
  key: 'document_workspace',
  label: '文档工作台',
  description: '专门用于报价单和合同草稿的协作编辑，支持实时更新文档内容',
  icon: '📄',
  category: 'document',
  visibleToolNames: [
    'get_document_workspace_context',
    'set_document_customer',
    'set_document_seller',
    'replace_document_items',
    'set_document_terms',
    'set_document_pricing',
    'apply_document_patch',
    'price_lookup',
    'contract_clause_picker',
  ],

  // 匹配器：文档工作台不通过关键词匹配，由前端显式指定
  matcher: null,

  // 创建 Agent
  createAgent: ({ tools, instructions }) => {
    return createAiAgent({
      name: 'Document Workspace Agent',
      instructions:
        instructions ||
        [
          '你是后台 AI 文档工作台的文档协作 agent。',
          '你的职责是通过多轮对话帮助用户完成报价单或合同草稿，而不是一次性猜完整答案。',
          '你可以读取当前草稿上下文、查询价格、获取建议条款，并在确认后调用文档工具更新真源。',
          '当信息不足时先追问，不要凭空编造客户、价格、条款或明细。',
          '当用户明确提供客户、我方公司、明细、价格或条款时，优先调用对应的原子工具更新草稿。',
          '更新产品明细前必须先读取当前草稿；不得用空数组覆盖已有明细，除非用户明确要求清空全部明细。',
          '只有当一次变更同时涉及多个复杂字段且原子工具不足以表达时，才使用 apply_document_patch。',
          '给用户的回复要简洁、直接，并说明你刚刚做了什么或下一步缺什么。',
          '如果已更新草稿，回复中要明确提示已同步到文档预览。',
        ].join('\n'),
      tools: tools || [],
    });
  },

  // 工具选择
  selectTools: (context) => {
    // 文档工作台使用专门的文档工具 + 业务工具
    return [
      'get_document_workspace_context',
      'set_document_customer',
      'set_document_seller',
      'replace_document_items',
      'set_document_terms',
      'set_document_pricing',
      'apply_document_patch',
      'price_lookup',
      'contract_clause_picker',
    ];
  },

  // 增强上下文
  enhanceContext: (context) => {
    return {
      ...context,
      metadata: {
        capability: 'document_workspace',
        timestamp: new Date().toISOString(),
      },
    };
  },

  // 构建动态指令
  buildInstructions: (context) => {
    const parts = [
      '你是后台 AI 文档工作台的文档协作 agent。',
      '你的职责是通过多轮对话帮助用户完成报价单或合同草稿。',
    ];

    // 根据文档类型调整指令
    if (context.documentType === 'quote') {
      parts.push('当前正在编辑报价单，重点收集客户信息、产品明细和价格。');
    } else if (context.documentType === 'contract') {
      parts.push('当前正在编辑销售合同，需要收集完整的合同条款和双方信息。');
    }

    parts.push('当用户明确提供信息时，优先调用对应的原子工具更新草稿。');
    parts.push('更新产品明细前必须读取当前草稿并保留未要求删除的已有明细；只有用户明确要求清空全部明细时才允许传空数组。');
    parts.push('给用户的回复要简洁、直接，并说明你刚刚做了什么或下一步缺什么。');

    return parts.join('\n');
  },

  // 可用性检查
  isAvailable: (context) => {
    // 文档工作台需要有 draftId 上下文
    return Boolean(context.draftId);
  },
};

/**
 * 注册文档工作台能力
 */
export function registerDocumentWorkspaceCapability() {
  capabilityRegistry.register(documentWorkspaceCapability);
}
