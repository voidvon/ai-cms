import apiClient from './client'
import type { ProductCategory, ApiResponse } from '@/types'

export const productCategoriesApi = {
  list: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories', { params })
    return response.data
  },

  listAdmin: async (params?: { parentId?: number; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories/admin', { params })
    return response.data
  },

  listOptions: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories/options', { params })
    return response.data
  },

  get: async (id: number, params?: { language?: string; include_translations?: number | boolean }) => {
    const response = await apiClient.get<ApiResponse<ProductCategory>>(`/product-categories/${id}`, { params })
    return response.data
  },

  create: async (data: Partial<ProductCategory>) => {
    const response = await apiClient.post<ApiResponse<ProductCategory>>('/product-categories', data)
    return response.data
  },

  update: async (id: number, data: Partial<ProductCategory>) => {
    const response = await apiClient.put<ApiResponse<ProductCategory>>(`/product-categories/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/product-categories/${id}`)
    return response.data
  },
}
