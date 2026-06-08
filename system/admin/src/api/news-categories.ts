import apiClient from './client'
import type { NewsCategory, ApiResponse } from '@/types'

export const newsCategoriesApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<NewsCategory[]>>('/news-categories')
    return response.data
  },

  listAdmin: async () => {
    const response = await apiClient.get<ApiResponse<NewsCategory[]>>('/news-categories/admin')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<NewsCategory>>(`/news-categories/${id}`)
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
