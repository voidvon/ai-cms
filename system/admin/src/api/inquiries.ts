import apiClient from './client'
import type { ApiResponse, Inquiry, InquiryListResult, InquirySettings, InquiryStatus, InquiryType } from '@/types'

export type InquiryListParams = {
  page?: number
  limit?: number
  keyword?: string
  status?: InquiryStatus | 'all'
  inquiry_type?: InquiryType | 'all'
}

export const inquiriesApi = {
  getSettings: async () => {
    const response = await apiClient.get<ApiResponse<InquirySettings>>('/inquiry-settings')
    return response.data
  },

  updateSettings: async (data: { feishu_webhook_url: string; feishu_enabled: boolean }) => {
    const response = await apiClient.put<ApiResponse<InquirySettings>>('/inquiry-settings', data)
    return response.data
  },

  testFeishuWebhook: async (feishuWebhookUrl: string) => {
    const response = await apiClient.post<ApiResponse<null>>('/inquiry-settings/test', {
      feishu_webhook_url: feishuWebhookUrl,
    })
    return response.data
  },

  list: async (params?: InquiryListParams) => {
    const response = await apiClient.get<ApiResponse<InquiryListResult>>('/inquiries', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Inquiry>>(`/inquiries/${id}`)
    return response.data
  },

  update: async (id: number, data: { status: InquiryStatus; internal_note: string }) => {
    const response = await apiClient.put<ApiResponse<Inquiry>>(`/inquiries/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/inquiries/${id}`)
    return response.data
  },
}
