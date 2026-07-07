import apiClient from './client'
import type { ApiResponse } from '@/types'

export interface TopicProfile {
  id: number
  column_id: number
  language_id?: number
  language_code?: string
  column_name: string
  parent_id?: number | null
  dir_name?: string | null
  route_path?: string | null
  column_type?: string
  seo_title: string
  intro_html: string
  topic_keyword: string
  related_content_json: string
  publish_status: 'draft' | 'published'
  sort_order: number
  created_at?: string
  updated_at?: string
  current_language_code?: string
  requested_language_code?: string
  fallback_language_code?: string | null
  is_language_fallback?: number
}

export type TopicProfilePayload = Pick<
  TopicProfile,
  | 'seo_title'
  | 'intro_html'
  | 'topic_keyword'
  | 'related_content_json'
  | 'publish_status'
  | 'sort_order'
>

interface TopicProfileApiRecord {
  id: number
  column_id: number
  language_id?: number
  language_code?: string
  column_name: string
  parent_id?: number | null
  dir_name?: string | null
  route_path?: string | null
  column_type?: string
  seo_title: string
  intro_html: string
  topic_keyword: string
  related_content_json: string
  publish_status: 'draft' | 'published'
  sort_order: number
  created_at?: string
  updated_at?: string
  current_language_code?: string
  requested_language_code?: string
  fallback_language_code?: string | null
  is_language_fallback?: number
}

export interface TopicProfileGenerateResult {
  key: string
  label: string
  recordsProcessed: number
  filesWritten: number
  columnId: number
  url: string
  outputPath: string
}

function mapTopicProfile(record: TopicProfileApiRecord): TopicProfile {
  return record
}

function toApiPayload(data: TopicProfilePayload) {
  return {
    seo_title: data.seo_title,
    intro_html: data.intro_html,
    topic_keyword: data.topic_keyword,
    related_content_json: data.related_content_json,
    publish_status: data.publish_status,
    sort_order: data.sort_order,
  }
}

export const topicProfilesApi = {
  list: async (params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<TopicProfileApiRecord[]>>('/topic-profiles', { params })
    return {
      ...response.data,
      data: (response.data.data || []).map(mapTopicProfile),
    }
  },

  get: async (columnId: number, params?: { language?: string }) => {
    const response = await apiClient.get<ApiResponse<TopicProfileApiRecord>>(`/topic-profiles/${columnId}`, { params })
    return {
      ...response.data,
      data: response.data.data ? mapTopicProfile(response.data.data) : response.data.data,
    }
  },

  save: async (columnId: number, data: TopicProfilePayload, params?: { language?: string }) => {
    const response = await apiClient.put<ApiResponse<TopicProfileApiRecord>>(`/topic-profiles/${columnId}`, toApiPayload(data), { params })
    return {
      ...response.data,
      data: response.data.data ? mapTopicProfile(response.data.data) : response.data.data,
    }
  },

  delete: async (columnId: number, params?: { language?: string; all?: boolean | number | string }) => {
    const response = await apiClient.delete<ApiResponse<{ deleted: boolean }>>(`/topic-profiles/${columnId}`, { params })
    return response.data
  },

  generate: async (columnId: number, params?: { language?: string }) => {
    const response = await apiClient.post<ApiResponse<TopicProfileGenerateResult>>(`/topic-profiles/${columnId}/generate`, {}, { params })
    return response.data
  },
}
