import apiClient from './client'
import type { ApiResponse, PaginationInfo } from '@/types'

export interface ContentItemsListParams {
  page?: number
  limit?: number
  column_id?: number
  include_descendants?: number | boolean
  language?: string
}

export interface ContentItemsDetailParams {
  language?: string
  include_translations?: number | boolean
}

export const contentItemsApi = {
  list: async <T>(modelCode: string, params: ContentItemsListParams) => {
    const response = await apiClient.get<ApiResponse<T[]> & { pagination: PaginationInfo }>(`/content-items/${encodeURIComponent(modelCode)}/admin`, { params })
    return response.data
  },

  get: async <T>(modelCode: string, id: number, params?: ContentItemsDetailParams) => {
    const response = await apiClient.get<ApiResponse<T>>(`/content-items/${encodeURIComponent(modelCode)}/${id}`, { params })
    return response.data
  },

  create: async <T>(modelCode: string, data: Record<string, unknown>) => {
    const response = await apiClient.post<ApiResponse<T>>(`/content-items/${encodeURIComponent(modelCode)}`, data)
    return response.data
  },

  update: async <T>(modelCode: string, id: number, data: Record<string, unknown>) => {
    const response = await apiClient.put<ApiResponse<T>>(`/content-items/${encodeURIComponent(modelCode)}/${id}`, data)
    return response.data
  },

  delete: async (modelCode: string, id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/content-items/${encodeURIComponent(modelCode)}/${id}`)
    return response.data
  },
}
