import apiClient from './client'
import type {
  ApiResponse,
  DocumentDraft,
  DocumentDraftMessageResult,
  DocumentStamp,
  DocumentTemplate,
} from '@/types'

const DOCUMENT_AI_REQUEST_TIMEOUT_MS = 180000

export const documentWorkspacesApi = {
  listTemplates: async (documentType?: string) => {
    const response = await apiClient.get<ApiResponse<DocumentTemplate[]>>('/document-templates', {
      params: documentType ? { document_type: documentType } : {},
    })
    return response.data
  },

  listDrafts: async (limit?: number) => {
    const response = await apiClient.get<ApiResponse<DocumentDraft[]>>('/document-drafts', {
      params: typeof limit === 'number' ? { limit } : {},
    })
    return response.data
  },

  listStamps: async () => {
    const response = await apiClient.get<ApiResponse<DocumentStamp[]>>('/document-stamps')
    return response.data
  },

  createStamp: async (data: {
    name: string
    image_asset_id?: number | null
    image_path?: string
  }) => {
    const response = await apiClient.post<ApiResponse<DocumentStamp>>('/document-stamps', data)
    return response.data
  },

  updateStamp: async (id: number, data: {
    name?: string
    image_asset_id?: number | null
    image_path?: string
  }) => {
    const response = await apiClient.put<ApiResponse<DocumentStamp>>(`/document-stamps/${id}`, data)
    return response.data
  },

  deleteStamp: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean; id: string }>>(`/document-stamps/${id}`)
    return response.data
  },

  createDraft: async (data: {
    document_type: 'quote' | 'contract'
    document_template_id?: number
    title?: string
    draft_payload?: Record<string, unknown>
  }) => {
    const response = await apiClient.post<ApiResponse<DocumentDraft>>('/document-drafts', data)
    return response.data
  },

  getDraft: async (id: string) => {
    const response = await apiClient.get<ApiResponse<DocumentDraft>>(`/document-drafts/${encodeURIComponent(id)}`)
    return response.data
  },

  updateDraft: async (id: string, data: {
    title?: string
    draft_payload?: Record<string, unknown>
    payload?: Record<string, unknown>
    replace_payload?: boolean
  }) => {
    const response = await apiClient.patch<ApiResponse<DocumentDraft>>(
      `/document-drafts/${encodeURIComponent(id)}`,
      data
    )
    return response.data
  },

  deleteDraft: async (id: string) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean; id: string }>>(
      `/document-drafts/${encodeURIComponent(id)}`
    )
    return response.data
  },

  sendMessage: async (id: string, message: string) => {
    const response = await apiClient.post<ApiResponse<DocumentDraftMessageResult>>(
      `/document-drafts/${encodeURIComponent(id)}/messages`,
      { message },
      { timeout: DOCUMENT_AI_REQUEST_TIMEOUT_MS }
    )
    return response.data
  },

  getPreviewUrl: (id: string) => `/api/document-drafts/${encodeURIComponent(id)}/preview`,
}
