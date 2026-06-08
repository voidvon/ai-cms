import apiClient from './client';
import type { Job, ApiResponse } from '@/types';

export const jobsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<Job[]>>('/jobs');
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Job>>(`/jobs/${id}`);
    return response.data;
  },

  create: async (data: Partial<Job>) => {
    const response = await apiClient.post<ApiResponse<Job>>('/jobs', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Job>) => {
    const response = await apiClient.put<ApiResponse<Job>>(`/jobs/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/jobs/${id}`);
    return response.data;
  },
};
