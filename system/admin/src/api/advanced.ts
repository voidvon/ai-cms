import apiClient from './client'
import type { ContentModel, ContentModelField, Template, TemplateBinding, TemplateDependencyInfo, TemplatePreview, TemplateVariant, TemplateVersion, ApiResponse } from '@/types'

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

  create: async (data: Partial<TemplateVariant>) => {
    const response = await apiClient.post<ApiResponse<TemplateVariant>>('/template-variants', data)
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

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<TemplateVariant>>(`/template-variants/${id}`)
    return response.data
  },
}

export const templatesApi = {
  list: async (type?: Template['type'], themeId?: number) => {
    const response = await apiClient.get<ApiResponse<Template[]>>('/templates', {
      params: {
        ...(type ? { type } : {}),
        ...(themeId ? { theme_id: themeId } : {}),
      },
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

  preview: async (data: Partial<Template> & { preview_context?: { mode?: string; language_code?: string } }) => {
    const response = await apiClient.post<ApiResponse<TemplatePreview>>('/templates/preview', data)
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

  getDependencies: async (id: number) => {
    const response = await apiClient.get<ApiResponse<TemplateDependencyInfo>>(`/templates/${id}/dependencies`)
    return response.data
  },

  listVersions: async (id: number) => {
    const response = await apiClient.get<ApiResponse<TemplateVersion[]>>(`/templates/${id}/versions`)
    return response.data
  },

  restoreVersion: async (id: number, versionId: number) => {
    const response = await apiClient.post<ApiResponse<Template>>(`/templates/${id}/versions/${versionId}/restore`)
    return response.data
  },

  delete: async (id: number) => {
    const response = await apiClient.delete<ApiResponse<Template>>(`/templates/${id}`)
    return response.data
  },

  listBindings: async (themeId?: number) => {
    const response = await apiClient.get<ApiResponse<TemplateBinding[]>>('/template-bindings', {
      params: themeId ? { theme_id: themeId } : {},
    })
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

export const contentModelsApi = {
  list: async () => {
    const response = await apiClient.get<ApiResponse<ContentModel[]>>('/content-models')
    return response.data
  },

  get: async (id: number) => {
    const response = await apiClient.get<ApiResponse<ContentModel>>(`/content-models/${id}`)
    return response.data
  },

  updateField: async (modelId: number, fieldName: string, data: Partial<ContentModelField>) => {
    const response = await apiClient.put<ApiResponse<ContentModelField>>(`/content-models/${modelId}/fields/${fieldName}`, data)
    return response.data
  },
}
