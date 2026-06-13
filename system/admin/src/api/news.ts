import apiClient from './client';
import type { News, ApiResponse, PaginationInfo } from '@/types';

export const newsApi = {
  list: async (params: { page?: number; limit?: number; category_id?: number; include_descendants?: number | boolean; language?: string }) => {
    const response = await apiClient.get<ApiResponse<News[]> & { pagination: PaginationInfo }>('/news/admin', { params });
    return response.data;
  },

  get: async (id: number, params?: { language?: string; include_translations?: number | boolean }) => {
    const response = await apiClient.get<ApiResponse<News>>(`/news/${id}`, { params });
    return response.data;
  },

  create: async (data: Record<string, unknown>) => {
    const response = await apiClient.post<ApiResponse<News>>('/news', data);
    return response.data;
  },

  update: async (id: number, data: Record<string, unknown>) => {
    const response = await apiClient.put<ApiResponse<News>>(`/news/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/news/${id}`);
    return response.data;
  },
};
