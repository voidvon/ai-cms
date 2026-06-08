import apiClient from './client'
import type { ProductCategory, ApiResponse } from '@/types'

export const productCategoriesApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories')
    return response.data
  },

  listAdmin: async (params?: { parentId?: number; page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories/admin', { params })
    return response.data
  },

  listOptions: async () => {
    const response = await apiClient.get<ApiResponse<ProductCategory[]>>('/product-categories/options')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<ProductCategory>>(`/product-categories/${id}`)
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
