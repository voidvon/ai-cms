import apiClient from './client'
import type { ApiResponse, ColumnCategory } from '@/types'

interface BaseCategoryParams {
  language?: string
}

interface AdminCategoryParams extends BaseCategoryParams {
  parentId?: number
  page?: number
  limit?: number
}

interface CategoryGetParams extends BaseCategoryParams {
  include_translations?: number | boolean
}

function withRootColumnId<T extends object | undefined>(rootColumnId: number, params?: T) {
  return {
    ...(params || {}),
    rootColumnId,
  }
}

export const columnCategoriesApi = {
  list: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, params?: BaseCategoryParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-categories', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  listAdmin: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, params?: AdminCategoryParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-categories/admin', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  listOptions: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, params?: BaseCategoryParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-categories/options', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  get: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, id: number, params?: CategoryGetParams) => {
    const response = await apiClient.get<ApiResponse<T>>(`/column-categories/${id}`, { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  create: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, data: Partial<T>) => {
    const response = await apiClient.post<ApiResponse<T>>(`/column-categories?rootColumnId=${encodeURIComponent(rootColumnId)}`, data)
    return response.data
  },

  update: async <T extends ColumnCategory = ColumnCategory>(rootColumnId: number, id: number, data: Partial<T>) => {
    const response = await apiClient.put<ApiResponse<T>>(`/column-categories/${id}?rootColumnId=${encodeURIComponent(rootColumnId)}`, data)
    return response.data
  },

  delete: async (rootColumnId: number, id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/column-categories/${id}?rootColumnId=${encodeURIComponent(rootColumnId)}`)
    return response.data
  },
}
