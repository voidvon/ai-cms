import axios from 'axios'

export interface StaticSectionGroup {
  title: string
  items: Array<{
    label: string
    value: string
  }>
}

export interface BuildResult {
  success: boolean
  totalFiles?: number
  totalRecords?: number
  message?: string
  languageCode?: string | null
  result?: {
    languageBuilds?: Array<{
      languageCode: string
      outputRoot: string
      totalFiles: number
      totalRecords: number
    }>
  }
}

export interface DatabaseCheckpointResult {
  databasePath: string
  walPath: string
  shmPath: string
  beforeWalSize: number
  afterWalSize: number
  beforeDbSize: number
  afterDbSize: number
  releasedBytes: number
  checkpoint?: {
    busy?: number
    log?: number
    checkpointed?: number
  } | null
}

const staticGenerationClient = axios.create({
  withCredentials: true,
  timeout: 300000,
})

export const staticGenerationApi = {
  async listSections() {
    const response = await staticGenerationClient.get<{ success: boolean; data?: StaticSectionGroup[]; message?: string }>('/admin/build/sections')
    return response.data
  },

  async build(section: string, languageCode?: string) {
    const query = new URLSearchParams({ section })
    if (languageCode) {
      query.set('language', languageCode)
    }
    const response = await staticGenerationClient.post<BuildResult>(`/admin/build/generate?${query.toString()}`, {})
    return response.data
  },

  async checkpointDatabaseWal() {
    const response = await staticGenerationClient.post<{ success: boolean; data?: DatabaseCheckpointResult; message?: string }>('/admin/build/database/checkpoint', {})
    return response.data
  },
}
