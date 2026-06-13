import apiClient from './client'
import type { ApiResponse, Column } from '@/types'

export const columnsApi = {
  list: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<Column[]>>('/columns', { params })
    return response.data
  },

  get: async (id: number, params?: { language?: string; include_translations?: number | boolean }) => {
    const response = await apiClient.get<ApiResponse<Column>>(`/columns/${id}`, { params })
    return response.data
  },

  create: async (data: Record<string, unknown>) => {
    const response = await apiClient.post<ApiResponse<Column>>('/columns', data)
    return response.data
  },

  update: async (id: number, data: Record<string, unknown>) => {
    const response = await apiClient.put<ApiResponse<Column>>(`/columns/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<Column>>(`/columns/${id}`)
    return response.data
  },
}
