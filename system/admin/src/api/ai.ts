import apiClient from './client'
import type {
  AiCapabilities,
  AiConversationMessageRecord,
  AiConversationRecord,
  AiMentionItem,
  AiContractDraftPayload,
  AiKnowledgePayload,
  AiPriceQueryPayload,
  AiTaskResult,
  AiToolDefinition,
  ApiResponse,
} from '@/types'

export const aiApi = {
  listConversations: async (limit = 20) => {
    const response = await apiClient.get<ApiResponse<AiConversationRecord[]>>('/ai/conversations', {
      params: { limit },
    })
    return response.data
  },

  createConversation: async (data: {
    id?: string
    title?: string
    capability?: string
    selectedToolNames?: string[]
  }) => {
    const response = await apiClient.post<ApiResponse<AiConversationRecord>>('/ai/conversations', data)
    return response.data
  },

  updateConversation: async (id: string, data: {
    title?: string
    capability?: string
    selectedToolNames?: string[]
  }) => {
    const response = await apiClient.patch<ApiResponse<AiConversationRecord>>(`/ai/conversations/${encodeURIComponent(id)}`, data)
    return response.data
  },

  deleteConversation: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean; id: string }>>(`/ai/conversations/${encodeURIComponent(id)}`)
    return response.data
  },

  listConversationMessages: async (id: string, limit = 100) => {
    const response = await apiClient.get<ApiResponse<AiConversationMessageRecord[]>>(`/ai/conversations/${encodeURIComponent(id)}/messages`, {
      params: { limit },
    })
    return response.data
  },

  capabilities: async () => {
    const response = await apiClient.get<ApiResponse<AiCapabilities>>('/ai/capabilities')
    return response.data
  },

  tools: async (capability?: string) => {
    const response = await apiClient.get<ApiResponse<{ total: number; tools: AiToolDefinition[] }>>('/ai/tools', {
      params: capability ? { capability } : undefined,
    })
    return response.data
  },

  searchMentions: async (q: string, limit = 8, type?: AiMentionItem['type']) => {
    const response = await apiClient.get<ApiResponse<{ total: number; items: AiMentionItem[] }>>('/ai/mentions/search', {
      params: { q, limit, type },
    })
    return response.data
  },

  executeTask: async (taskKey: string, data: Record<string, unknown>) => {
    const response = await apiClient.post<ApiResponse<AiTaskResult>>(`/ai/tasks/${taskKey}/execute`, data)
    return response.data
  },

  draftContract: async (data: AiContractDraftPayload) => {
    return aiApi.executeTask('contract_draft', data)
  },

  queryPrice: async (data: AiPriceQueryPayload) => {
    return aiApi.executeTask('price_query', data)
  },

  askKnowledge: async (data: AiKnowledgePayload) => {
    return aiApi.executeTask('knowledge_qa', data)
  },

  exportPdf: async (data: { draft_id: string; html?: string; template_code?: string }) => {
    return aiApi.executeTask('export_pdf', data)
  },

  resetChat: async (conversationId: string) => {
    const response = await apiClient.post<ApiResponse<{ cleared: boolean; conversation_id?: string }>>('/ai/chat/reset', {
      conversation_id: conversationId,
    })
    return response.data
  },
}
