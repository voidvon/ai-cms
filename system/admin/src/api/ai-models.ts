import apiClient from './client'
import type { AiModelConfig, AiModelConnectionTest, ApiResponse } from '@/types'

export type AiModelPayload = {
  name?: string
  provider?: 'openai_responses'
  base_url?: string
  api_key?: string
  model?: string
  image_model?: string
  reasoning_effort?: 'low' | 'medium' | 'high'
  is_enabled?: number | boolean
  is_default?: number | boolean
}

export const aiModelsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<AiModelConfig[]>>('/ai-models')
    return response.data
  },

  create: async (data: AiModelPayload) => {
    const response = await apiClient.post<ApiResponse<AiModelConfig>>('/ai-models', data)
    return response.data
  },

  update: async (id: number, data: AiModelPayload) => {
    const response = await apiClient.put<ApiResponse<AiModelConfig>>(`/ai-models/${id}`, data)
    return response.data
  },

  setDefault: async (id: number) => {
    const response = await apiClient.post<ApiResponse<AiModelConfig>>(`/ai-models/${id}/default`)
    return response.data
  },

  test: async (id: number) => {
    const response = await apiClient.post<ApiResponse<AiModelConnectionTest>>(`/ai-models/${id}/test`)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<AiModelConfig>>(`/ai-models/${id}`)
    return response.data
  },
}
