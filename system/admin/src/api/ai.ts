import apiClient from './client'
import type {
  AiCapabilities,
  AiContractDraftPayload,
  AiKnowledgePayload,
  AiPriceQueryPayload,
  AiTaskResult,
  ApiResponse,
} from '@/types'

export const aiApi = {
  capabilities: async () => {
    const response = await apiClient.get<ApiResponse<AiCapabilities>>('/ai/capabilities')
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
