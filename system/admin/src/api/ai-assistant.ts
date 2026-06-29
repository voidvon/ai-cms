import apiClient from './client'
import type {
  AiAssistantCapabilities,
  AiAssistantContractDraftPayload,
  AiAssistantKnowledgePayload,
  AiAssistantPricePayload,
  AiAssistantStubResult,
  ApiResponse,
} from '@/types'

export const aiAssistantApi = {
  capabilities: async () => {
    const response = await apiClient.get<ApiResponse<AiAssistantCapabilities>>('/ai-assistant/capabilities')
    return response.data
  },

  draftContract: async (data: AiAssistantContractDraftPayload) => {
    const response = await apiClient.post<ApiResponse<AiAssistantStubResult>>('/ai-assistant/contract/draft', data)
    return response.data
  },

  queryPrice: async (data: AiAssistantPricePayload) => {
    const response = await apiClient.post<ApiResponse<AiAssistantStubResult>>('/ai-assistant/price/query', data)
    return response.data
  },

  askKnowledge: async (data: AiAssistantKnowledgePayload) => {
    const response = await apiClient.post<ApiResponse<AiAssistantStubResult>>('/ai-assistant/knowledge/ask', data)
    return response.data
  },

  exportPdf: async (data: { draft_id: string; html?: string; template_code?: string }) => {
    const response = await apiClient.post<ApiResponse<AiAssistantStubResult>>('/ai-assistant/contract/export-pdf', data)
    return response.data
  },

  resetChat: async (chatId: string) => {
    const response = await apiClient.post<ApiResponse<{ cleared: boolean; chat_id?: string }>>('/ai-assistant/chat/reset', {
      chat_id: chatId,
    })
    return response.data
  },
}
