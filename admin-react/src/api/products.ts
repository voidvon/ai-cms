import apiClient from './client';
import type { Product, ApiResponse, PaginationInfo } from '@/types';

export const productsApi = {
  list: async (params: { page?: number; limit?: number; category_id?: number }) => {
    const response = await apiClient.get<ApiResponse<Product[]> & { pagination: PaginationInfo }>('/products/admin', { params });
    return response.data;
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Product>>(`/products/${id}`);
    return response.data;
  },

  create: async (data: Partial<Product>) => {
    const response = await apiClient.post<ApiResponse<Product>>('/products', data);
    return response.data;
  },

  update: async (id: number, data: Partial<Product>) => {
    const response = await apiClient.put<ApiResponse<Product>>(`/products/${id}`, data);
    return response.data;
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<null>>(`/products/${id}`);
    return response.data;
  },
};
