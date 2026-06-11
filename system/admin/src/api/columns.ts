import apiClient from './client'
import type { ApiResponse, Column } from '@/types'

export const columnsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Column[]>>('/columns')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Column>>(`/columns/${id}`)
    return response.data
  },

  create: async (data: Partial<Column>) => {
    const response = await apiClient.post<ApiResponse<Column>>('/columns', data)
    return response.data
  },

  update: async (id: number, data: Partial<Column>) => {
    const response = await apiClient.put<ApiResponse<Column>>(`/columns/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<Column>>(`/columns/${id}`)
    return response.data
  },
}
