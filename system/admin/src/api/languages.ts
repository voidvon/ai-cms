import apiClient from './client'
import type { ApiResponse, Language } from '@/types'

export const languagesApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Language[]>>('/languages')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Language>>(`/languages/${id}`)
    return response.data
  },

  create: async (data: Partial<Language>) => {
    const response = await apiClient.post<ApiResponse<Language>>('/languages', data)
    return response.data
  },

  update: async (id: number, data: Partial<Language>) => {
    const response = await apiClient.put<ApiResponse<Language>>(`/languages/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<Language>>(`/languages/${id}`)
    return response.data
  },
}
