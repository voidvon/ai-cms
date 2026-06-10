import apiClient from './client'
import type { ApiResponse, Column } from '@/types'

export const columnsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Column[]>>('/columns')
    return response.data
  },
}
