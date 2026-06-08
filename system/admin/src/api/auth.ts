import axios from 'axios';
import apiClient from './client';
import type { Admin, ApiResponse } from '@/types';

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await axios.post<ApiResponse<{ token: string; admin: Admin }>>(
      '/admin/api/login',
      { username, password },
      { withCredentials: true }
    );
    return response.data;
  },

  logout: async () => {
    const response = await axios.post<ApiResponse<null>>(
      '/admin/api/logout',
      {},
      { withCredentials: true }
    );
    return response.data;
  },

  getCurrentUser: async () => {
    const response = await apiClient.get<ApiResponse<Admin>>('/admin/me');
    return response.data;
  },
};
