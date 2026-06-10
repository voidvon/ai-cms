import apiClient from './client'

export interface UploadResponse {
  success: boolean
  message?: string
  fileName: string
  relativePath: string
  legacyFileName: string
  uploadType: string
}

export const uploadsApi = {
  upload: async (file: File, uploadType: 'prod' | 'news' = 'prod') => {
    const formData = new FormData()
    formData.append('file', file)

    const response = await apiClient.post<UploadResponse>(`/uploads?utype=${uploadType}`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    })

    return response.data
  },
}
