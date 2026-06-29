import apiClient from './client'
import type { AccessLog, AccessLogSummary, Admin, ApiResponse, PaginationMeta } from '@/types'

export const adminApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Admin[]>>('/admin/list')
    return response.data
  },

  listAccessLogs: async (params?: {
    page?: number
    limit?: number
    path?: string
    ip?: string
  }) => {
    const response = await apiClient.get<ApiResponse<{
      items: AccessLog[]
      pagination: PaginationMeta
    }>>('/admin/access-logs', { params })
    return response.data
  },

  getAccessLogSummary: async () => {
    const response = await apiClient.get<ApiResponse<AccessLogSummary>>('/admin/access-logs/summary')
    return response.data
  },

  create: async (data: { username: string; password: string }) => {
    const response = await apiClient.post<ApiResponse<Admin>>('/admin', data)
    return response.data
  },

  update: async (id: number, data: { username: string }) => {
    const response = await apiClient.put<ApiResponse<Admin>>(`/admin/${id}`, data)
    return response.data
  },

  updatePassword: async (id: number, data: { newPassword: string }) => {
    const response = await apiClient.put<ApiResponse<void>>(`/admin/${id}/password`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/admin/${id}`)
    return response.data
  },
}
