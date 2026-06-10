import apiClient from './client'
import type { ApiResponse, MediaAsset, PaginationInfo } from '@/types'

export type MediaPurpose = 'product_cover' | 'news_cover' | 'richtext_image' | 'attachment'

export const mediaApi = {
  upload: async (file: File, purpose: MediaPurpose) => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<{ success: boolean; data: MediaAsset; message?: string }>(
      `/media/upload?purpose=${purpose}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )

    return response.data
  },

  list: async (params: { page?: number; limit?: number; purpose?: string; status?: string }) => {
    const response = await apiClient.get<ApiResponse<MediaAsset[]> & { items: MediaAsset[]; pagination: PaginationInfo }>(
      '/media-assets',
      { params },
    )
    return response.data
  },

  cleanupOrphaned: async (purpose?: string) => {
    const response = await apiClient.post<ApiResponse<{ deletedFiles: number; deletedRows: number }>>(
      '/media-assets/cleanup',
      { purpose: purpose && purpose !== 'all' ? purpose : undefined },
    )
    return response.data
  },
}
