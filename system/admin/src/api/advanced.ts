import apiClient from './client'
import type { CorporationCategory, ProductPhoto, Template, TemplateBinding, TemplateVariant, ApiResponse } from '@/types'

// 公司信息分类 API
export const corporationCategoriesApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<CorporationCategory[]>>('/corporation-categories')
    return response.data
  },

  listAdmin: async () => {
    const response = await apiClient.get<ApiResponse<CorporationCategory[]>>('/corporation-categories/admin')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<CorporationCategory>>(`/corporation-categories/${id}`)
    return response.data
  },

  create: async (data: Partial<CorporationCategory>) => {
    const response = await apiClient.post<ApiResponse<CorporationCategory>>('/corporation-categories', data)
    return response.data
  },

  update: async (id: number, data: Partial<CorporationCategory>) => {
    const response = await apiClient.put<ApiResponse<CorporationCategory>>(`/corporation-categories/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/corporation-categories/${id}`)
    return response.data
  },
}

// 产品相册 API
export const productPhotosApi = {
  list: async (productId?: number) => {
    const params = productId ? { product_id: productId } : {}
    const response = await apiClient.get<ApiResponse<ProductPhoto[]>>('/product-photos', { params })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<ProductPhoto>>(`/product-photos/${id}`)
    return response.data
  },

  create: async (data: Partial<ProductPhoto>) => {
    const response = await apiClient.post<ApiResponse<ProductPhoto>>('/product-photos', data)
    return response.data
  },

  update: async (id: number, data: Partial<ProductPhoto>) => {
    const response = await apiClient.put<ApiResponse<ProductPhoto>>(`/product-photos/${id}`, data)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<void>>(`/product-photos/${id}`)
    return response.data
  },
}

// 模板变体 API
export const templateVariantsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<TemplateVariant[]>>('/template-variants')
    return response.data
  },

  getSelected: async () => {
    const response = await apiClient.get<ApiResponse<TemplateVariant>>('/template-variants/selected')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<TemplateVariant>>(`/template-variants/${id}`)
    return response.data
  },

  update: async (id: number, data: Partial<TemplateVariant>) => {
    const response = await apiClient.put<ApiResponse<TemplateVariant>>(`/template-variants/${id}`, data)
    return response.data
  },

  select: async (id: number) => {
    const response = await apiClient.post<ApiResponse<TemplateVariant>>(`/template-variants/${id}/select`)
    return response.data
  },
}

export const templatesApi = {
  list: async (type?: Template['type']) => {
    const response = await apiClient.get<ApiResponse<Template[]>>('/templates', {
      params: type ? { type } : {},
    })
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<Template>>(`/templates/${id}`)
    return response.data
  },

  create: async (data: Partial<Template>) => {
    const response = await apiClient.post<ApiResponse<Template>>('/templates', data)
    return response.data
  },

  update: async (id: number, data: Partial<Template>) => {
    const response = await apiClient.put<ApiResponse<Template>>(`/templates/${id}`, data)
    return response.data
  },

  publish: async (id: number, note?: string) => {
    const response = await apiClient.post<ApiResponse<Template>>(`/templates/${id}/publish`, { note })
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<Template>>(`/templates/${id}`)
    return response.data
  },

  listBindings: async () => {
    const response = await apiClient.get<ApiResponse<TemplateBinding[]>>('/template-bindings')
    return response.data
  },

  saveBinding: async (data: Partial<TemplateBinding>) => {
    const response = await apiClient.put<ApiResponse<TemplateBinding>>('/template-bindings', data)
    return response.data
  },

  deleteBinding: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<TemplateBinding>>(`/template-bindings/${id}`)
    return response.data
  },
}
