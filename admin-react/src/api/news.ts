import apiClient from './client';
import type { News, ApiResponse, PaginationInfo } from '@/types';

export const newsApi = {
  list: async (params: { page?: number; limit?: number; category_id?: number }) => {
    const response = await apiClient.get<ApiResponse<News[]> & { pagination: PaginationInfo }>('/news/admin', { params });
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<News>>(`/news/${id}`);
    return response.data;
  },

  create: async (data: Partial<News>) => {
    const response = await apiClient.post<ApiResponse<News>>('/news', data);
    return response.data;
  },

  update: async (id: number, data: Partial<News>) => {
    const response = await apiClient.put<ApiResponse<News>>(`/news/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/news/${id}`);
    return response.data;
  },
};
