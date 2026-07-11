import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Chat, useChat } from '@ai-sdk/react'
import { MessageSquarePlus, RefreshCw, Trash2 } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { createAiChatTransport } from '@/api/ai-chat'
import { aiApi } from '@/api/ai'
import { AiConversationComposer, type AiConversationDisplayPart } from '@/components/ai-chat/AiConversationComposer'
import { ChatWorkspaceShell, type ChatWorkspaceShellMessage } from '@/components/ai-chat/ChatWorkspaceShell'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type {
  AiChatCapabilityDefinition,
  AiConversationMessageRecord,
  AiConversationRecord,
  AiGeneratedImage,
  AiMentionItem,
} from '@/types'

type DashboardHeaderContext = {
  headerSlotElement: HTMLDivElement | null
  setDocumentTitle: (value: string) => void
  setMainContentPadding: (enabled: boolean) => void
}

type ConversationView = {
  id: string
  title: string
  capability: string
  updatedAt: string
  lastMessageText?: string
}

function createConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ai-chat-${Date.now()}`
}

function toShellMessages(messages: any[]): ChatWorkspaceShellMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: extractMessageText(message.parts) || String(message.text || message.content?.text || ''),
    parts: Array.isArray(message.parts) ? message.parts : [],
    metadata: normalizeChatMessageMetadata(message.metadata, message.content?.images),
  }))
}

function extractMessageText(parts: any[] = []) {
  return parts
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text ?? part.delta ?? part.value ?? part.content ?? ''))
    .join('')
}

function getMessagesContentSignature(messages: any[] = []) {
  return messages
    .map((message) => {
      const text = extractMessageText(message.parts) || String(message.text || message.content?.text || '')
      const images = Array.isArray(message.content?.images)
        ? message.content.images.map((image: AiGeneratedImage) => image.relative_path).join(',')
        : ''
      return `${message.role}:${text}:${images}`
    })
    .join('|')
}

function normalizeChatMessageMetadata(metadata: unknown, contentImages?: unknown) {
  const value = metadata && typeof metadata === 'object' ? metadata as {
    displayParts?: AiConversationDisplayPart[]
    mentions?: AiMentionItem[]
  } : {}
  const images = Array.isArray(contentImages) ? contentImages as AiGeneratedImage[] : []

  return {
    ...(Array.isArray(value.displayParts) ? { displayParts: value.displayParts } : {}),
    ...(Array.isArray(value.mentions) ? { mentions: value.mentions } : {}),
    ...(images.length > 0 ? { images } : {}),
  }
}

function toConversationView(record: AiConversationRecord, messages: ChatWorkspaceShellMessage[] = []): ConversationView {
  return {
    id: record.id,
    title: record.title || '新对话',
    capability: record.capability || 'general_chat',
    updatedAt: record.updated_at,
    lastMessageText: messages[messages.length - 1]?.text || '',
  }
}

function toChatMessagesFromRecords(records: AiConversationMessageRecord[]) {
  return records
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => {
      const text = String(message.content?.text || '')
      return {
        id: String(message.id),
        role: message.role,
        parts: [{ type: 'text', text }],
        content: message.content,
        ...(message.metadata ? { metadata: message.metadata } : {}),
      }
    })
}

export default function AiConversationPage() {
  const { headerSlotElement, setDocumentTitle, setMainContentPadding } =
    useOutletContext<DashboardHeaderContext>()
  const queryClient = useQueryClient()
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  const { data: capabilitiesResponse, isFetching: isCapabilitiesFetching, refetch } = useQuery({
    queryKey: ['ai-capabilities'],
    queryFn: () => aiApi.capabilities(),
  })

  const capabilityPayload = capabilitiesResponse?.data
  const defaultCapability = String(
    capabilityPayload?.default_chat_capability
    || capabilityPayload?.capabilities?.[0]?.key
    || capabilityPayload?.chat_capabilities?.[0]?.key
    || 'general_chat'
  )

  const conversationsQuery = useQuery({
    queryKey: ['ai-conversations'],
    queryFn: () => aiApi.listConversations(30),
  })

  const conversationRecords = useMemo(() => {
    return conversationsQuery.data?.data || []
  }, [conversationsQuery.data])

  const capabilities = useMemo<AiChatCapabilityDefinition[]>(() => {
    return capabilityPayload?.capabilities || capabilityPayload?.chat_capabilities || []
  }, [capabilityPayload])

  useEffect(() => {
    setDocumentTitle('AI 对话')
    setMainContentPadding(false)
    return () => setMainContentPadding(true)
  }, [setDocumentTitle, setMainContentPadding])

  useEffect(() => {
    if (activeConversationId || conversationsQuery.isLoading) {
      return
    }

    const firstConversation = conversationRecords[0]
    if (firstConversation) {
      setActiveConversationId(firstConversation.id)
      return
    }

    const id = createConversationId()
    aiApi.createConversation({
      id,
      title: '新对话',
      capability: defaultCapability,
    }).then((response) => {
      void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
      setActiveConversationId(response.data?.id || id)
    }).catch((error) => {
      toast.error(error?.message || '创建 AI 会话失败')
    })
  }, [activeConversationId, conversationRecords, conversationsQuery.isLoading, defaultCapability, queryClient])

  const activeConversation = useMemo(() => {
    const record = conversationRecords.find((item) => item.id === activeConversationId)
    return record ? toConversationView(record) : null
  }, [activeConversationId, conversationRecords])

  const messagesQuery = useQuery({
    queryKey: ['ai-conversation-messages', activeConversationId],
    queryFn: () => aiApi.listConversationMessages(activeConversationId, 100),
    enabled: Boolean(activeConversationId),
    refetchOnWindowFocus: false,
  })

  const persistedChatMessages = useMemo(() => {
    return toChatMessagesFromRecords(messagesQuery.data?.data || [])
  }, [messagesQuery.data])

  const conversations = useMemo(() => {
    const activeShellMessages = activeConversationId
      ? toShellMessages(persistedChatMessages as any[])
      : []
    return conversationRecords.map((record) => (
      toConversationView(record, record.id === activeConversationId ? activeShellMessages : [])
    ))
  }, [activeConversationId, conversationRecords, persistedChatMessages])

  const transport = useMemo(() => {
    return createAiChatTransport({
      capability: activeConversation?.capability || defaultCapability,
    })
  }, [activeConversation?.capability, defaultCapability])

  const initialChatMessages = useMemo(() => {
    return persistedChatMessages
  }, [persistedChatMessages])

  const chatInstance = useMemo(() => {
    return new Chat({
      id: activeConversation?.id,
      transport,
      messages: initialChatMessages as any[],
      onError: (error) => {
        toast.error(error.message || 'AI 对话失败')
      },
      onFinish: ({ messages }) => {
        if (!activeConversation?.id) {
          return
        }
        void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
        void queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', activeConversation.id] })
      },
    })
  }, [activeConversation?.id])

  const chat = useChat({
    chat: chatInstance,
    experimental_throttle: 0,
  })

  const isChatStreaming = chat.status === 'submitted' || chat.status === 'streaming'

  useEffect(() => {
    if (isChatStreaming) {
      return
    }

    const currentSignature = getMessagesContentSignature(chat.messages as any[])
    const nextSignature = getMessagesContentSignature(initialChatMessages as any[])

    if (currentSignature !== nextSignature) {
      chat.setMessages(initialChatMessages as any[])
    }
  }, [activeConversationId, initialChatMessages, isChatStreaming])

  const shellMessages = useMemo<ChatWorkspaceShellMessage[]>(() => {
    const messages = toShellMessages(chat.messages as any[])
    if (!isChatStreaming) {
      return messages
    }

    const lastAssistantIndex = messages.findLastIndex((message) => message.role === 'assistant')
    if (lastAssistantIndex < 0) {
      return messages
    }

    return messages.map((message, index) => (
      index === lastAssistantIndex
        ? { ...message, streaming: true, pending: !message.text?.trim() }
        : message
    ))
  }, [chat.messages, isChatStreaming])

  const activeCapabilityLabel = capabilities.find((item) => item.key === (activeConversation?.capability || defaultCapability))?.label || '通用对话'

  const updateActiveConversation = async (updater: (conversation: ConversationView) => ConversationView) => {
    if (!activeConversation) {
      return
    }
    const next = updater(activeConversation)
    await aiApi.updateConversation(activeConversation.id, {
      title: next.title,
      capability: next.capability,
    })
    await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
  }

  const handleCreateConversation = async () => {
    const id = createConversationId()
    await aiApi.createConversation({
      id,
      title: '新对话',
      capability: defaultCapability,
    })
    await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    setActiveConversationId(id)
    chat.stop()
    chat.setMessages([])
  }

  const handleDeleteConversation = async (conversationId: string) => {
    try {
      await aiApi.deleteConversation(conversationId)
      await aiApi.resetChat(conversationId)
    } catch {
      // ignore reset failures after server-side delete
    }
    await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
    await queryClient.invalidateQueries({ queryKey: ['ai-conversation-messages', conversationId] })
    if (conversationId === activeConversationId) {
      const remaining = conversationRecords.filter((item) => item.id !== conversationId)
      if (remaining[0]) {
        setActiveConversationId(remaining[0].id)
      } else {
        const id = createConversationId()
        await aiApi.createConversation({
          id,
          title: '新对话',
          capability: defaultCapability,
        })
        await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] })
        setActiveConversationId(id)
      }
      chat.setMessages([])
    }
  }

  const handleComposerSubmit = async ({
    text,
    mentions,
    displayParts,
  }: {
    text: string
    mentions: AiMentionItem[]
    displayParts: AiConversationDisplayPart[]
  }) => {
    await chat.sendMessage(
      {
        text,
        metadata: {
          displayParts,
          mentions,
        },
      },
      {
        body: {
          capability: activeConversation?.capability || defaultCapability,
          ...(mentions.length > 0 ? { mentions } : {}),
        },
      }
    )
  }

  const sidebar = (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold">会话列表</div>
            <div className="text-xs text-muted-foreground">当前能力：{activeCapabilityLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => void refetch()} disabled={isCapabilitiesFetching}>
              <RefreshCw className={`h-4 w-4 ${isCapabilitiesFetching ? 'animate-spin' : ''}`} />
            </Button>
            <Button type="button" variant="outline" size="icon" onClick={() => void handleCreateConversation()}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <div className="space-y-3">
          {conversations.map((conversation) => (
            <div
              key={conversation.id}
              className={`group relative border px-4 py-4 transition ${
                conversation.id === activeConversationId
                  ? 'border-primary/40 bg-muted/30'
                  : 'border-border/70 hover:border-primary/30 hover:bg-muted/20'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveConversationId(conversation.id)}
                className="block w-full pr-9 text-left"
              >
                  <div className="space-y-1">
                    <div className="truncate text-sm font-medium">{conversation.title}</div>
                  <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {conversation.lastMessageText || '还没有消息'}
                  </div>
                  <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                    {formatConversationTime(conversation.updatedAt)}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteConversation(conversation.id)}
                className="invisible absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                aria-label={`删除会话 ${conversation.title}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const headerContent = (
    <div className="hidden min-w-0 items-center justify-end gap-2 lg:flex">
      <Button type="button" variant="outline" size="sm" onClick={() => void handleCreateConversation()}>
        新对话
      </Button>
    </div>
  )

  return (
    <>
      {headerSlotElement ? createPortal(headerContent, headerSlotElement) : null}
      <ChatWorkspaceShell
        messages={shellMessages}
        sidebarPosition="left"
        emptyTitle="开始新的 AI 对话"
        emptyDescription="可以直接对话，也可以描述你想生成的图片。"
        sidebar={sidebar}
        statusBadges={[
          { key: 'capability', label: `能力：${activeCapabilityLabel}` },
          { key: 'tool-mode', label: 'Agent 自动工具', tone: 'secondary' },
          capabilitiesResponse?.data?.model ? { key: 'model', label: `模型：${capabilitiesResponse.data.model}`, tone: 'secondary' } : null,
        ].filter(Boolean) as Array<{ key: string; label: string; tone?: 'default' | 'outline' | 'secondary' }>}
        composer={(
          <AiConversationComposer
            placeholder="问问AI，或描述你想生成的图片。"
            availableTools={[]}
            selectedToolNames={[]}
            enableTools={false}
            submitDisabled={chat.status === 'submitted' || chat.status === 'streaming'}
            submitStatus={chat.status === 'submitted' || chat.status === 'streaming' ? 'submitted' : 'ready'}
            onStop={() => chat.stop()}
            onToolSelectionChange={() => {}}
            onSubmit={handleComposerSubmit}
          />
        )}
      />
    </>
  )
}

function formatConversationTime(value?: string) {
  if (!value) {
    return '-'
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
