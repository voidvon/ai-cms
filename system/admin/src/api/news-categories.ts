import apiClient from './client'
import type { NewsCategory, ApiResponse } from '@/types'

export const newsCategoriesApi = {
  list: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<NewsCategory[]>>('/news-categories', { params })
    return response.data
  },

  listAdmin: async (params?: { parentId?: number; page?: number; limit?: number; language?: string }) => {
    const response = await apiClient.get<ApiResponse<NewsCategory[]>>('/news-categories/admin', { params })
    return response.data
  },

  listOptions: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<NewsCategory[]>>('/news-categories/options', { params })
    return response.data
  },

  get: async (id: number, params?: { language?: string; include_translations?: number | boolean }) => {
    const response = await apiClient.get<ApiResponse<NewsCategory>>(`/news-categories/${id}`, { params })
    return response.data
  },

  create: async (data: Partial<NewsCategory>) => {
    const response = await apiClient.post<ApiResponse<NewsCategory>>('/news-categories', data)
    return response.data
  },

  update: async (id: number, data: Partial<NewsCategory>) => {
    const response = await apiClient.put<ApiResponse<NewsCategory>>(`/news-categories/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/news-categories/${id}`)
    return response.data
  },
}
