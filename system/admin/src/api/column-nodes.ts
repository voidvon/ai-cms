import apiClient from './client'
import type { ApiResponse, ColumnNode } from '@/types'

interface BaseColumnNodeParams {
  language?: string
}

interface AdminColumnNodeParams extends BaseColumnNodeParams {
  parentId?: number
  page?: number
  limit?: number
}

interface ColumnNodeGetParams extends BaseColumnNodeParams {
  include_translations?: number | boolean
}

function withRootColumnId<T extends object | undefined>(rootColumnId: number, params?: T) {
  return {
    ...(params || {}),
    rootColumnId,
  }
}

export const columnNodesApi = {
  list: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, params?: BaseColumnNodeParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-nodes', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  listAdmin: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, params?: AdminColumnNodeParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-nodes/admin', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  listOptions: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, params?: BaseColumnNodeParams) => {
    const response = await apiClient.get<ApiResponse<T[]>>('/column-nodes/options', { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  get: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, id: number, params?: ColumnNodeGetParams) => {
    const response = await apiClient.get<ApiResponse<T>>(`/column-nodes/${id}`, { params: withRootColumnId(rootColumnId, params) })
    return response.data
  },

  create: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, data: Partial<T>) => {
    const response = await apiClient.post<ApiResponse<T>>(`/column-nodes?rootColumnId=${encodeURIComponent(rootColumnId)}`, data)
    return response.data
  },

  update: async <T extends ColumnNode = ColumnNode>(rootColumnId: number, id: number, data: Partial<T>) => {
    const response = await apiClient.put<ApiResponse<T>>(`/column-nodes/${id}?rootColumnId=${encodeURIComponent(rootColumnId)}`, data)
    return response.data
  },

  delete: async (rootColumnId: number, id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/column-nodes/${id}?rootColumnId=${encodeURIComponent(rootColumnId)}`)
    return response.data
  },
}
