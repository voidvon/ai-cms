import apiClient from './client'
import type { CustomLabel, CustomLabelKind, ApiResponse } from '@/types'

export const customLabelsApi = {
  listKinds: async () => {
    const response = await apiClient.get<ApiResponse<CustomLabelKind[]>>('/custom-label-kinds')
    return response.data
  },

  list: async () => {
    const response = await apiClient.get<ApiResponse<CustomLabel[]>>('/custom-labels')
    return response.data
  },

  create: async (data: Partial<CustomLabel>) => {
    const response = await apiClient.post<ApiResponse<CustomLabel>>('/custom-labels', data)
    return response.data
  },

  update: async (id: number, data: Partial<CustomLabel>) => {
    const response = await apiClient.put<ApiResponse<CustomLabel>>(`/custom-labels/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/custom-labels/${id}`)
    return response.data
  },
}

export const metaTypesApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<any[]>>('/meta-types')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<any>>(`/meta-types/${id}`)
    return response.data
  },

  update: async (id: number, data: any) => {
    const response = await apiClient.put<ApiResponse<any>>(`/meta-types/${id}`, data)
    return response.data
  },
}
