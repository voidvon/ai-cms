import apiClient from './client'
import type { ApiResponse, DataTable, DataTableRecord } from '@/types'

export const dataTablesApi = {
  get: async (columnId: number) => {
    const response = await apiClient.get<ApiResponse<DataTable>>(`/data-tables/by-column/${columnId}`)
    return response.data
  },
  updateFields: async (columnId: number, fields: Array<Partial<DataTableFieldPayload>>) => {
    const payload = fields.map((field) => {
      const next = { ...field }
      if (String(next.field_key || '').startsWith('draft-')) {
        delete next.field_key
      }
      return next
    })
    const response = await apiClient.put<ApiResponse<DataTable>>(`/data-tables/by-column/${columnId}/fields`, { fields: payload })
    return response.data
  },
  listRecords: async (columnId: number, params?: { page?: number; limit?: number; keyword?: string }) => {
    const response = await apiClient.get<ApiResponse<DataTableRecord[]> & { table: DataTable; pagination: { page: number; limit: number; total: number } }>(`/data-tables/by-column/${columnId}/records`, { params })
    return response.data
  },
  createRecord: async (columnId: number, fields: Record<string, unknown>) => {
    const response = await apiClient.post<ApiResponse<DataTableRecord>>(`/data-tables/by-column/${columnId}/records`, { fields })
    return response.data
  },
  updateRecord: async (columnId: number, id: number, fields: Record<string, unknown>) => {
    const response = await apiClient.put<ApiResponse<DataTableRecord>>(`/data-tables/by-column/${columnId}/records/${id}`, { fields })
    return response.data
  },
  deleteRecord: async (columnId: number, id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/data-tables/by-column/${columnId}/records/${id}`)
    return response.data
  },
}

export type DataTableFieldPayload = {
  field_key: string
  field_name: string
  field_type: string
  is_primary?: number
  settings?: Record<string, unknown> | null
}
