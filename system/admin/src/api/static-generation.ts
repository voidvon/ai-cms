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

export interface StaticBuildProgressTarget {
  key?: string
  label?: string
  group?: string
}

export interface StaticBuildProgressEvent {
  type: string
  timestamp?: string
  languageCode?: string | null
  outputRoot?: string | null
  target?: StaticBuildProgressTarget | null
  fileType?: string
  relativePath?: string
  absolutePath?: string
  assetType?: string
  filesWritten?: number
  recordsProcessed?: number
  elapsedMs?: number
  totalFiles?: number
  totalRecords?: number
  requestedLanguageCode?: string | null
  languageCodes?: string[]
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

export interface StaticBuildStreamHandlers {
  onStarted?: (data: { section: string; normalizedSection: string; languageCode?: string | null }) => void
  onProgress?: (event: StaticBuildProgressEvent) => void
  onCompleted?: (result: BuildResult) => void
  onError?: (error: { success: false; message: string; statusCode?: number }) => void
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

  async buildStream(section: string, handlers: StaticBuildStreamHandlers, languageCode?: string) {
    const query = new URLSearchParams({ section })
    if (languageCode) {
      query.set('language', languageCode)
    }

    const response = await fetch(`/admin/build/stream?${query.toString()}`, {
      credentials: 'include',
      headers: {
        Accept: 'text/event-stream',
      },
    })

    if (!response.ok || !response.body) {
      let message = '静态生成连接失败'
      try {
        const payload = await response.json()
        if (payload?.message) {
          message = payload.message
        }
      } catch {
        // ignore parse failure
      }
      throw new Error(message)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let finished = false
    let completedResult: BuildResult | null = null

    const handleSseBlock = (block: string) => {
      const lines = block.split('\n')
      let eventName = 'message'
      const dataLines: string[] = []

      for (const rawLine of lines) {
        const line = rawLine.trimEnd()
        if (!line || line.startsWith(':')) {
          continue
        }
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim()
          continue
        }
        if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trim())
        }
      }

      if (dataLines.length === 0) {
        return
      }

      const payload = JSON.parse(dataLines.join('\n'))
      if (eventName === 'started') {
        handlers.onStarted?.(payload)
        return
      }
      if (eventName === 'progress') {
        handlers.onProgress?.(payload)
        return
      }
      if (eventName === 'completed') {
        finished = true
        completedResult = payload
        handlers.onCompleted?.(payload)
        return
      }
      if (eventName === 'error') {
        finished = true
        handlers.onError?.(payload)
      }
    }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }

        buffer += decoder.decode(value, { stream: true })
        const blocks = buffer.split('\n\n')
        buffer = blocks.pop() || ''
        for (const block of blocks) {
          handleSseBlock(block)
        }
      }
    } finally {
      reader.releaseLock()
    }

    if (!finished) {
      throw new Error('静态生成连接已中断')
    }

    if (!completedResult) {
      throw new Error('静态生成结果缺失')
    }

    return completedResult
  },

  async checkpointDatabaseWal() {
    const response = await staticGenerationClient.post<{ success: boolean; data?: DatabaseCheckpointResult; message?: string }>('/admin/build/database/checkpoint', {})
    return response.data
  },
}
