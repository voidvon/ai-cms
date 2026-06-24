import apiClient from './client'
import type { ApiResponse, BulkReplaceExecutePayload, BulkReplaceOptions, BulkReplacePreviewPayload, BulkReplaceResult } from '@/types'

export const bulkReplaceApi = {
  options: async () => {
    const response = await apiClient.get<ApiResponse<BulkReplaceOptions>>('/bulk-replace/options')
    return response.data
  },

  preview: async (data: BulkReplacePreviewPayload) => {
    const response = await apiClient.post<ApiResponse<BulkReplaceResult>>('/bulk-replace/preview', data)
    return response.data
  },

  execute: async (data: BulkReplaceExecutePayload) => {
    const response = await apiClient.post<ApiResponse<BulkReplaceResult>>('/bulk-replace/execute', data)
    return response.data
  },
}
