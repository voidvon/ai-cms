import { DefaultChatTransport } from 'ai'

export function createDocumentAgentChatTransport(draftId: string) {
  const normalizedDraftId = String(draftId || '').trim()

  return new DefaultChatTransport({
    api: `/api/document-drafts/${encodeURIComponent(normalizedDraftId)}/assistant/stream`,
    credentials: 'include',
    prepareSendMessagesRequest({ messages, body, headers, credentials, api }) {
      const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user')
      const message = lastUserMessage?.parts
        .filter((part) => part.type === 'text')
        .map((part) => part.text)
        .join('')
        .trim() || ''

      return {
        api,
        credentials,
        headers,
        body: {
          ...body,
          message,
          messages,
        },
      }
    },
  })
}
