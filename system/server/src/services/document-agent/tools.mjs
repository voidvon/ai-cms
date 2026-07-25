import { tool } from '@openai/agents';
import { z } from 'zod';
import { buildDocumentAgentContext } from './context.mjs';
import {
  applyDocumentPatchMutation,
  replaceDocumentItemsMutation,
  setDocumentPartyMutation,
  setDocumentPricingMutation,
  setDocumentTermsMutation,
} from './mutations.mjs';
import {
  createToolCallRecord,
  finishToolCallRecord,
} from './store.mjs';
import { createPriceLookupTool } from '../ai/tools/price-lookup.mjs';
import { createContractClauseTool } from '../ai/tools/contract-clause-picker.mjs';

export function createDocumentAgentTools() {
  const priceLookupTool = createPriceLookupTool();
  const clauseTool = createContractClauseTool();

  return [
    wrapAuditedTool(
      tool({
        name: 'get_document_workspace_context',
        description: '读取当前文档草稿、缺失字段、最近消息和模板上下文。',
        parameters: z.object({}),
        isEnabled: ({ runContext }) => {
          const context = getAgentExecutionContext(runContext);
          return !context.workspaceContextRead;
        },
        async execute(_, runContext) {
          const context = getAgentExecutionContext(runContext);
          const snapshot = buildDocumentAgentContext(context.draftId);
          context.workspaceContextRead = true;
          return {
            draft: compactDraftContext(snapshot.draft),
            template: compactTemplateContext(snapshot.template),
            missing_fields: snapshot.missingFields,
            recent_messages: snapshot.messages.slice(-8).map(compactMessageContext),
          };
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'set_document_customer',
        description: '更新当前文档的客户信息。',
        parameters: z.object({
          summary: z.string().default('更新客户信息'),
          customer: z.object({
            name: z.string().default(''),
            company: z.string().default(''),
            contact: z.string().default(''),
            address: z.string().default(''),
            email: z.string().default(''),
            phone: z.string().default(''),
          }),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const result = setDocumentPartyMutation({
            draftId: context.draftId,
            runId: context.runId,
            role: 'customer',
            party: input.customer,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            customer: input.customer,
          });
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'set_document_seller',
        description: '更新当前文档的我方公司信息。',
        parameters: z.object({
          summary: z.string().default('更新我方公司信息'),
          seller: z.object({
            name: z.string().default(''),
            company: z.string().default(''),
            contact: z.string().default(''),
            address: z.string().default(''),
            email: z.string().default(''),
            phone: z.string().default(''),
          }),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const result = setDocumentPartyMutation({
            draftId: context.draftId,
            runId: context.runId,
            role: 'seller',
            party: input.seller,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            seller: input.seller,
          });
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'replace_document_items',
        description: '用结构化数组替换当前文档明细，可附带更新价格汇总。',
        parameters: z.object({
          summary: z.string().default('更新产品明细'),
          items: z.array(z.object({
            id: z.string().optional(),
            sku: z.string().optional(),
            model: z.string().optional(),
            description: z.string().optional(),
            qty: z.number().optional(),
            unit: z.string().optional(),
            unitPrice: z.number().optional(),
            amount: z.number().optional(),
            notes: z.string().optional(),
          })),
          clearExisting: z.boolean().default(false).describe('仅当用户明确要求清空全部现有明细时设为 true'),
          pricing: z.object({
            currency: z.string().optional(),
            subtotal: z.number().optional(),
            taxRate: z.number().optional(),
            taxAmount: z.number().optional(),
            shippingFee: z.number().optional(),
            total: z.number().optional(),
          }).optional(),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const result = replaceDocumentItemsMutation({
            draftId: context.draftId,
            runId: context.runId,
            items: input.items,
            pricing: input.pricing,
            clearExisting: input.clearExisting,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            items: input.items,
            pricing: input.pricing,
          });
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'set_document_terms',
        description: '更新当前文档条款，如交期、付款、有效期、违约责任等。',
        parameters: z.object({
          summary: z.string().default('更新条款信息'),
          terms: z.object({
            validity: z.string().optional(),
            delivery: z.string().optional(),
            payment: z.string().optional(),
            warranty: z.string().optional(),
            disputeResolution: z.string().optional(),
            breachLiability: z.string().optional(),
            remarks: z.string().optional(),
          }),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const result = setDocumentTermsMutation({
            draftId: context.draftId,
            runId: context.runId,
            terms: input.terms,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            terms: input.terms,
          });
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'set_document_pricing',
        description: '更新当前文档价格汇总字段，如币种、税率、税额和总价。',
        parameters: z.object({
          summary: z.string().default('更新价格信息'),
          pricing: z.object({
            currency: z.string().optional(),
            subtotal: z.number().optional(),
            taxRate: z.number().optional(),
            taxAmount: z.number().optional(),
            shippingFee: z.number().optional(),
            total: z.number().optional(),
          }),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const result = setDocumentPricingMutation({
            draftId: context.draftId,
            runId: context.runId,
            pricing: input.pricing,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            pricing: input.pricing,
          });
        },
      })
    ),
    wrapAuditedTool(
      tool({
        name: 'apply_document_patch',
        description: '复杂混合更新时的后备工具。仅当原子工具不足以表达变更时才使用。',
        parameters: z.object({
          summary: z.string().default('AI 更新文档草稿'),
          patch_json: z.string().default('{}'),
        }),
        async execute(input, runContext) {
          const context = getAgentExecutionContext(runContext);
          const patch = safeParseToolJson(input.patch_json, 'apply_document_patch.patch_json');
          const result = applyDocumentPatchMutation({
            draftId: context.draftId,
            runId: context.runId,
            patch,
            summary: input.summary,
            syncConversationId: context.conversationId,
            user: context.user,
          });
          return compactMutationResult(result, {
            summary: input.summary,
            updated_fields: Object.keys(patch),
          });
        },
      })
    ),
    wrapAuditedTool(priceLookupTool),
    wrapAuditedTool(clauseTool),
  ];
}

function wrapAuditedTool(baseTool) {
  return tool({
    name: baseTool.name,
    description: baseTool.description,
    parameters: baseTool.parameters,
    strict: baseTool.strict,
    deferLoading: baseTool.deferLoading,
    needsApproval: baseTool.needsApproval,
    isEnabled: async ({ runContext, agent }) => {
      if (typeof baseTool.isEnabled !== 'function') {
        return baseTool.isEnabled !== false;
      }
      return baseTool.isEnabled(runContext, agent);
    },
    timeoutMs: baseTool.timeoutMs,
    timeoutBehavior: baseTool.timeoutBehavior,
    timeoutErrorFunction: baseTool.timeoutErrorFunction,
    inputGuardrails: baseTool.inputGuardrails,
    outputGuardrails: baseTool.outputGuardrails,
    customDataExtractor: baseTool.customDataExtractor,
    async execute(input, runContext, details) {
      const context = getAgentExecutionContext(runContext);
      const toolCall = createToolCallRecord({
        runId: context.runId,
        draftId: context.draftId,
        toolName: baseTool.name,
        input,
      });

      try {
        const output = await baseTool.invoke(runContext, JSON.stringify(input || {}), details);
        finishToolCallRecord(toolCall.id, {
          status: 'completed',
          output,
        });
        return output;
      } catch (error) {
        finishToolCallRecord(toolCall.id, {
          status: 'failed',
          errorMessage: error?.message || 'tool execution failed',
        });
        throw error;
      }
    },
  });
}

function compactDraftContext(draft) {
  return {
    id: draft.id,
    document_type: draft.document_type,
    document_template_id: draft.document_template_id,
    template_id: draft.template_id,
    title: draft.title,
    language_code: draft.language_code,
    status: draft.status,
    draft_payload: draft.draft_payload,
    updated_at: draft.updated_at,
  };
}

function compactTemplateContext(template) {
  if (!template) {
    return null;
  }
  return {
    id: template.id,
    key: template.key,
    name: template.name,
    description: template.description,
    document_type: template.document_type,
    template_id: template.template_id,
    template_code: template.template_code,
    template_name: template.template_name,
  };
}

function compactMessageContext(message) {
  return {
    role: message.role,
    text: String(message.content?.text || ''),
    created_at: message.created_at,
  };
}

function getAgentExecutionContext(runContext) {
  const context = runContext?.context || {};
  if (!context.draftId || !context.conversationId || !context.runId) {
    throw new Error('缺少 document agent 运行上下文');
  }
  return context;
}

function safeParseToolJson(value, fieldName) {
  const text = String(value || '').trim();
  if (!text) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${fieldName} 必须是合法 JSON 字符串`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${fieldName} 必须解析为 JSON 对象`);
  }

  return parsed;
}

function compactMutationResult(result, details = {}) {
  return {
    ok: true,
    summary: String(details.summary || '文档已更新'),
    ...(Array.isArray(details.updated_fields)
      ? { updated_fields: details.updated_fields.filter((field) => field !== 'clearExistingItems') }
      : {}),
    ...(details.customer ? { customer: details.customer } : {}),
    ...(details.seller ? { seller: details.seller } : {}),
    ...(details.items ? { items: details.items } : {}),
    ...(details.terms ? { terms: details.terms } : {}),
    ...(details.pricing ? { pricing: details.pricing } : {}),
    missing_fields: Array.isArray(result?.missingFields) ? result.missingFields : [],
  };
}
