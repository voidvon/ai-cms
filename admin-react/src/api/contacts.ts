import apiClient from './client';
import type { Contact, ApiResponse } from '@/types';

export const contactsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Contact[]>>('/contacts');
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Contact>>(`/contacts/${id}`);
    return response.data;
  },

  create: async (data: Partial<Contact>) => {
    const response = await apiClient.post<ApiResponse<Contact>>('/contacts', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Contact>) => {
    const response = await apiClient.put<ApiResponse<Contact>>(`/contacts/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/contacts/${id}`);
    return response.data;
  },
};
