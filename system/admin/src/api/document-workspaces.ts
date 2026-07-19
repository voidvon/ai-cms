import apiClient from './client'
import type {
  ApiResponse,
  DocumentCompany,
  DocumentDraft,
  DocumentDraftMessageResult,
  DocumentStamp,
  DocumentTemplate,
  PaginationInfo,
} from '@/types'

const DOCUMENT_AI_REQUEST_TIMEOUT_MS = 180000

export const documentWorkspacesApi = {
  listTemplates: async (documentType?: string) => {
    const response = await apiClient.get<ApiResponse<DocumentTemplate[]>>('/document-templates', {
      params: documentType ? { document_type: documentType } : {},
    })
    return response.data
  },

  updateTemplate: async (id: number, data: {
    name?: string
    description?: string
    sort_order?: number
    default_payload?: Record<string, unknown>
  }) => {
    const response = await apiClient.put<ApiResponse<DocumentTemplate>>(`/document-templates/${id}`, data)
    return response.data
  },

  listDrafts: async (params?: { page?: number; limit?: number; search?: string }) => {
    const response = await apiClient.get<ApiResponse<DocumentDraft[]> & { pagination: PaginationInfo }>('/document-drafts', {
      params: {
        page: params?.page,
        limit: params?.limit,
        search: params?.search || undefined,
      },
    })
    return response.data
  },

  listCompanies: async (search?: string) => {
    const response = await apiClient.get<ApiResponse<DocumentCompany[]>>('/document-companies', {
      params: search ? { search } : {},
    })
    return response.data
  },

  createCompany: async (data: {
    name: string
    contact?: string
    phone?: string
    email?: string
    address?: string
    notes?: string
  }) => {
    const response = await apiClient.post<ApiResponse<DocumentCompany>>('/document-companies', data)
    return response.data
  },

  updateCompany: async (id: number, data: {
    name?: string
    contact?: string
    phone?: string
    email?: string
    address?: string
    notes?: string
  }) => {
    const response = await apiClient.put<ApiResponse<DocumentCompany>>(`/document-companies/${id}`, data)
    return response.data
  },

  deleteCompany: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean; id: string }>>(`/document-companies/${id}`)
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
