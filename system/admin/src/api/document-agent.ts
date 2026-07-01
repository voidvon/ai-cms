export interface DocumentAgentStartedEvent {
  draftId: string
  conversationId: string
  runId: string
  model?: string
}

export interface DocumentAgentTextDeltaEvent {
  delta: string
}

export interface DocumentAgentToolEvent {
  toolName?: string
  item?: unknown
}

export interface DocumentAgentCompletedEvent {
  assistant_message: string
  draft: any
  missing_fields: string[]
  suggested_questions: string[]
}

export interface DocumentAgentErrorEvent {
  success: false
  message: string
}

export interface DocumentAgentStreamHandlers {
  onStarted?: (event: DocumentAgentStartedEvent) => void
  onTextDelta?: (event: DocumentAgentTextDeltaEvent) => void
  onToolCalled?: (event: DocumentAgentToolEvent) => void
  onToolOutput?: (event: DocumentAgentToolEvent) => void
  onDraftUpdated?: (event: { draft: any; missing_fields: string[] }) => void
  onCompleted?: (event: DocumentAgentCompletedEvent) => void
  onError?: (event: DocumentAgentErrorEvent) => void
}

export const documentAgentApi = {
  async streamDraftMessage(draftId: string, message: string, handlers: DocumentAgentStreamHandlers) {
    const response = await fetch(`/api/document-drafts/${encodeURIComponent(draftId)}/assistant/stream`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message }),
    })

    if (!response.ok || !response.body) {
      let errorMessage = 'AI 文档助手连接失败'
      try {
        const payload = await response.json()
        if (payload?.message) {
          errorMessage = payload.message
        }
      } catch {
        // ignore
      }
      throw new Error(errorMessage)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let completed = false
    let completedPayload: DocumentAgentCompletedEvent | null = null
    let errorPayload: DocumentAgentErrorEvent | null = null

    const handleBlock = (block: string) => {
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
      if (eventName === 'text_delta') {
        handlers.onTextDelta?.(payload)
        return
      }
      if (eventName === 'tool_called') {
        handlers.onToolCalled?.(payload)
        return
      }
      if (eventName === 'tool_output') {
        handlers.onToolOutput?.(payload)
        return
      }
      if (eventName === 'draft_updated') {
        handlers.onDraftUpdated?.(payload)
        return
      }
      if (eventName === 'completed') {
        completed = true
        completedPayload = payload
        handlers.onCompleted?.(payload)
        return
      }
      if (eventName === 'error') {
        completed = true
        errorPayload = payload
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
          handleBlock(block)
        }
      }
    } finally {
      reader.releaseLock()
    }

    if (errorPayload) {
      throw new Error(errorPayload.message || 'AI 文档助手执行失败')
    }

    if (!completed || !completedPayload) {
      throw new Error('AI 文档助手连接已中断')
    }

    return completedPayload
  },
}
