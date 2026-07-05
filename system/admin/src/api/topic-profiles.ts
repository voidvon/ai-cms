import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface TopicProfile {
  id: number
  column_id: number
  column_name: string
  parent_id?: number | null
  dir_name?: string | null
  route_path?: string | null
  column_type?: string
  topic_type: string
  primary_keyword: string
  keyword_group: string
  related_columns_json: string
  related_products_json: string
  related_resources_json: string
  related_articles_json: string
  module_config_json: string
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type TopicProfilePayload = Pick<
  TopicProfile,
  | 'topic_type'
  | 'primary_keyword'
  | 'keyword_group'
  | 'related_columns_json'
  | 'related_products_json'
  | 'related_resources_json'
  | 'related_articles_json'
  | 'module_config_json'
  | 'sort_order'
>

export const topicProfilesApi = {
  list: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<TopicProfile[]>>('/topic-profiles', { params })
    return response.data
  },

  get: async (columnId: number, params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<TopicProfile>>(`/topic-profiles/${columnId}`, { params })
    return response.data
  },

  save: async (columnId: number, data: TopicProfilePayload, params?: { language?: string }) => {
    const response = await apiClient.put<ApiResponse<TopicProfile>>(`/topic-profiles/${columnId}`, data, { params })
    return response.data
  },

  delete: async (columnId: number) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/topic-profiles/${columnId}`)
    return response.data
  },
}
