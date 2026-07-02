import { DefaultChatTransport } from 'ai'

export function createAiChatTransport({
  capability,
  toolNames,
  explicitToolMode = false,
}: {
  capability?: string
  toolNames?: string[]
  explicitToolMode?: boolean
} = {}) {
  return new DefaultChatTransport({
    api: '/api/ai/chat',
    credentials: 'include',
    body: {
      ...(capability ? { capability } : {}),
      ...(explicitToolMode ? { toolMode: 'explicit' } : {}),
      ...(Array.isArray(toolNames) && toolNames.length > 0 ? { toolNames } : {}),
    },
    prepareSendMessagesRequest({ id, messages, body, headers, credentials, api }) {
      return {
        api,
        credentials,
        headers,
        body: {
          ...(capability ? { capability } : {}),
          ...(explicitToolMode ? { toolMode: 'explicit' } : {}),
          ...(Array.isArray(toolNames) && toolNames.length > 0 ? { toolNames } : {}),
          ...body,
          conversationId: id,
          messages,
        },
      }
    },
  })
}
