import apiClient from './client';
import type { Message, ApiResponse, PaginationInfo } from '@/types';

export const messagesApi = {
  list: async (params: { page?: number; limit?: number }) => {
    const response = await apiClient.get<ApiResponse<Message[]> & { pagination: PaginationInfo }>('/messages/admin', { params });
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Message>>(`/messages/${id}`);
    return response.data;
  },

  update: async (id: number, data: Partial<Message>) => {
    const response = await apiClient.put<ApiResponse<Message>>(`/messages/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/messages/${id}`);
    return response.data;
  },
};
