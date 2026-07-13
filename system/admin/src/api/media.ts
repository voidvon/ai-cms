import apiClient from './client'
import type { ApiResponse, MediaAsset, PaginationInfo } from '@/types'

export type MediaPurpose = 'product_cover' | 'news_cover' | 'richtext_image' | 'column_image' | 'site_icon' | 'document_stamp' | 'ai_generated_image' | 'ai_input_image' | 'attachment' | 'pdf_document'

export type PdfDocumentType = 'sales_brochure' | 'installation_guide' | 'technical_information'

export const mediaApi = {
  upload: async (file: File, purpose: MediaPurpose, options: { languageId?: number | null; pdfDocumentType?: PdfDocumentType | null } = {}) => {
    const formData = new FormData()
    formData.append('file', file)
    const params = new URLSearchParams({ purpose })
    if (options.languageId) {
      params.set('language_id', String(options.languageId))
    }
    if (options.pdfDocumentType) {
      params.set('pdf_document_type', options.pdfDocumentType)
    }

    const response = await apiClient.post<{ success: boolean; data: MediaAsset; message?: string }>(
      `/media/upload?${params.toString()}`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )

    return response.data
  },

  list: async (params: { page?: number; limit?: number; purpose?: string; usage?: string; q?: string; pdf_search?: 1; language_id?: number }) => {
    const response = await apiClient.get<ApiResponse<MediaAsset[]> & { items: MediaAsset[]; pagination: PaginationInfo }>(
      '/media-assets',
      { params },
    )
    return response.data
  },

  replace: async (id: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await apiClient.put<ApiResponse<MediaAsset>>(
      `/media-assets/${id}/file`,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      },
    )
    return response.data
  },

  download: async (id: number) => {
    const response = await apiClient.get<Blob>(`/media-assets/${id}/download`, {
      responseType: 'blob',
    })
    return response.data
  },

  cleanupOrphaned: async (purpose?: string) => {
    const response = await apiClient.post<ApiResponse<{ deletedFiles: number; deletedRows: number }>>(
      '/media-assets/cleanup',
      { purpose: purpose && purpose !== 'all' ? purpose : undefined },
    )
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<{ deletedFile: boolean; deletedRow: boolean }>>(
      `/media-assets/${id}`,
    )
    return response.data
  },

  updateLanguage: async (id: number, languageId: number | null) => {
    const response = await apiClient.patch<ApiResponse<MediaAsset>>(
      `/media-assets/${id}/language`,
      { language_id: languageId || null },
    )
    return response.data
  },

  updatePdfDocumentType: async (id: number, pdfDocumentType: PdfDocumentType | null) => {
    const response = await apiClient.patch<ApiResponse<MediaAsset>>(
      `/media-assets/${id}/pdf-document-type`,
      { pdf_document_type: pdfDocumentType || null },
    )
    return response.data
  },
}
