import apiClient from './client'
import type { ApiResponse, ContentTableView, ContentTableViewColumn } from '@/types'

export const tableViewsApi = {
  get: async (columnId: number) => {
    const response = await apiClient.get<ApiResponse<ContentTableView>>(`/columns/${columnId}/table-view`)
    return response.data
  },

  save: async (columnId: number, columns: Array<Partial<ContentTableViewColumn>>) => {
    const response = await apiClient.put<ApiResponse<ContentTableView>>(`/columns/${columnId}/table-view`, { columns })
    return response.data
  },

  reset: async (columnId: number) => {
    const response = await apiClient.post<ApiResponse<ContentTableView>>(`/columns/${columnId}/table-view/reset`)
    return response.data
  },
}
