import apiClient from './client'
import type {
  AccessLog,
  AccessLogSummary,
  Admin,
  AdminGroup,
  AdminLoginLog,
  AdminPermissionDefinition,
  ApiResponse,
  PaginationMeta
} from '@/types'

export type AccessLogFilterParams = {
  path?: string
  ip?: string
  userAgentKind?: 'non_bot' | 'bot' | 'all'
  refererFilters?: string
  statusMode?: 'all' | '2xx' | '3xx' | '4xx' | '404' | '5xx'
  statusOperator?: 'is' | 'is_not'
}

export type SystemVersionStatus = {
  current_version: string
  current_version_source: string
  update_supported: boolean
  latest_version: string | null
  latest_tag: string | null
  has_update: boolean
  release_url: string
  release_name: string | null
  published_at: string | null
  repository: string
  checking_error: string | null
  update_in_progress: boolean
  auto_restart: boolean
  can_update: boolean
}

export type SystemUpdateResult = {
  updated: boolean
  previous_version?: string
  current_version: string
  latest_version: string
  message: string
  restart_required: boolean
  restarting: boolean
  backup_directory?: string
}

export const adminApi = {
  getSystemVersion: async (refresh = false) => {
    const response = await apiClient.get<ApiResponse<SystemVersionStatus>>('/admin/system-version', {
      params: refresh ? { refresh: '1' } : undefined,
      timeout: 30 * 1000,
    })
    return response.data
  },

  installSystemUpdate: async () => {
    const response = await apiClient.post<ApiResponse<SystemUpdateResult>>(
      '/admin/system-version/update',
      {},
      { timeout: 15 * 60 * 1000 },
    )
    return response.data
  },

  list: async () => {
    const response = await apiClient.get<ApiResponse<Admin[]>>('/admin/list')
    return response.data
  },

  listGroups: async () => {
    const response = await apiClient.get<ApiResponse<AdminGroup[]>>('/admin/groups')
    return response.data
  },

  listPermissions: async () => {
    const response = await apiClient.get<ApiResponse<AdminPermissionDefinition[]>>('/admin/permissions')
    return response.data
  },

  createGroup: async (data: { code: string; name: string; permission_flags: string[] }) => {
    const response = await apiClient.post<ApiResponse<AdminGroup>>('/admin/groups', data)
    return response.data
  },

  updateGroup: async (id: number, data: { code: string; name: string; permission_flags: string[] }) => {
    const response = await apiClient.put<ApiResponse<AdminGroup>>(`/admin/groups/${id}`, data)
    return response.data
  },

  deleteGroup: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/admin/groups/${id}`)
    return response.data
  },

  listAccessLogs: async (params?: AccessLogFilterParams & {
    page?: number
    limit?: number
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

  listLoginLogs: async (params?: {
    page?: number
    limit?: number
    username?: string
    ip?: string
    status?: 'success' | 'failure' | 'all'
  }) => {
    const response = await apiClient.get<ApiResponse<{
      items: AdminLoginLog[]
      pagination: PaginationMeta
    }>>('/admin/login-logs', { params })
    return response.data
  },

  clearAccessLogs: async (params?: AccessLogFilterParams) => {
    const response = await apiClient.delete<ApiResponse<{ deleted_count: number }>>('/admin/access-logs', { params })
    return response.data
  },

  create: async (data: { username: string; password: string; group_id: number }) => {
    const response = await apiClient.post<ApiResponse<Admin>>('/admin', data)
    return response.data
  },

  update: async (id: number, data: { username: string; group_id: number }) => {
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
