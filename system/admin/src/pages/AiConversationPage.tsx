import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Chat, useChat } from '@ai-sdk/react'
import { MessageSquarePlus, RefreshCw, Trash2 } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { createAiChatTransport } from '@/api/ai-chat'
import { aiApi } from '@/api/ai'
import { AiConversationComposer, type AiConversationDisplayPart } from '@/components/ai-chat/AiConversationComposer'
import { ChatWorkspaceShell, type ChatWorkspaceShellMessage } from '@/components/ai-chat/ChatWorkspaceShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { AiChatCapabilityDefinition, AiMentionItem, AiToolDefinition } from '@/types'

type DashboardHeaderContext = {
  headerSlotElement: HTMLDivElement | null
  setDocumentTitle: (value: string) => void
  setMainContentPadding: (enabled: boolean) => void
}

type StoredConversation = {
  id: string
  title: string
  capability: string
  messages: ChatWorkspaceShellMessage[]
  selectedToolNames?: string[]
  updatedAt: string
}

const TOOL_NAME_MIGRATIONS: Record<string, string> = {
  query_products: 'query_content_items',
}

const STORAGE_KEY = 'spirax-admin-ai-conversations'

function createConversationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `ai-chat-${Date.now()}`
}

function migrateStoredConversation(conversation: StoredConversation): StoredConversation {
  return {
    ...conversation,
    selectedToolNames: Array.from(new Set((conversation.selectedToolNames || []).map((name) => TOOL_NAME_MIGRATIONS[name] || name))),
  }
}

function loadStoredConversations(): StoredConversation[] {
  if (typeof window === 'undefined') {
    return []
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.map(migrateStoredConversation) : []
  } catch {
    return []
  }
}

function saveStoredConversations(conversations: StoredConversation[]) {
  if (typeof window === 'undefined') {
    return
  }
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations.slice(0, 20)))
}

function toShellMessages(messages: any[]): ChatWorkspaceShellMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: extractMessageText(message.parts),
    parts: Array.isArray(message.parts) ? message.parts : [],
    metadata: normalizeChatMessageMetadata(message.metadata),
  }))
}

function extractMessageText(parts: any[] = []) {
  return parts
    .filter((part) => part?.type === 'text')
    .map((part) => String(part.text || ''))
    .join('')
}

function buildConversationTitle(messages: ChatWorkspaceShellMessage[]) {
  const firstUser = messages.find((message) => message.role === 'user')
  const source = String(firstUser?.text || '').trim()
  return source ? source.slice(0, 24) : '新对话'
}

function normalizeChatMessageMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object') {
    return undefined
  }

  const value = metadata as {
    displayParts?: AiConversationDisplayPart[]
    mentions?: AiMentionItem[]
    toolNames?: string[]
  }

  return {
    ...(Array.isArray(value.displayParts) ? { displayParts: value.displayParts } : {}),
    ...(Array.isArray(value.mentions) ? { mentions: value.mentions } : {}),
    ...(Array.isArray(value.toolNames) ? { toolNames: value.toolNames } : {}),
  }
}

export default function AiConversationPage() {
  const { headerSlotElement, setDocumentTitle, setMainContentPadding } =
    useOutletContext<DashboardHeaderContext>()
  const [conversations, setConversations] = useState<StoredConversation[]>([])
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

  const { data: toolsResponse } = useQuery({
    queryKey: ['ai-tools', defaultCapability],
    queryFn: () => aiApi.tools(defaultCapability),
  })

  const capabilities = useMemo<AiChatCapabilityDefinition[]>(() => {
    return capabilityPayload?.capabilities || capabilityPayload?.chat_capabilities || []
  }, [capabilityPayload])

  const availableTools = useMemo<AiToolDefinition[]>(() => {
    return toolsResponse?.data?.tools || []
  }, [toolsResponse])

  useEffect(() => {
    setDocumentTitle('AI 对话')
    setMainContentPadding(false)
    return () => setMainContentPadding(true)
  }, [setDocumentTitle, setMainContentPadding])

  useEffect(() => {
    const stored = loadStoredConversations()
    if (stored.length > 0) {
      setConversations(stored)
      setActiveConversationId(stored[0].id)
      return
    }

    const initialConversation: StoredConversation = {
      id: createConversationId(),
      title: '新对话',
      capability: defaultCapability,
      messages: [],
      selectedToolNames: [],
      updatedAt: new Date().toISOString(),
    }

    setConversations([initialConversation])
    setActiveConversationId(initialConversation.id)
  }, [defaultCapability])

  const activeConversation = useMemo(() => {
    return conversations.find((item) => item.id === activeConversationId) || null
  }, [activeConversationId, conversations])

  const selectedToolNames = activeConversation?.selectedToolNames || []

  const transport = useMemo(() => {
    return createAiChatTransport({
      capability: activeConversation?.capability || defaultCapability,
      toolNames: selectedToolNames,
      explicitToolMode: true,
    })
  }, [activeConversation?.capability, defaultCapability, selectedToolNames])

  const initialChatMessages = useMemo(() => {
    if (!activeConversation) {
      return []
    }
    return activeConversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts || (message.text ? [{ type: 'text', text: message.text }] : []),
      ...(message.metadata ? { metadata: message.metadata } : {}),
    }))
  }, [activeConversation])

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
        const shellMessages = toShellMessages(messages as any[])
        const nextConversation: StoredConversation = {
          id: activeConversation.id,
          capability: activeConversation.capability || defaultCapability,
          title: buildConversationTitle(shellMessages),
          messages: shellMessages,
          selectedToolNames: activeConversation.selectedToolNames || [],
          updatedAt: new Date().toISOString(),
        }
        setConversations((current) => {
          const next = [nextConversation, ...current.filter((item) => item.id !== nextConversation.id)]
          saveStoredConversations(next)
          return next
        })
      },
    })
  }, [activeConversation, defaultCapability, initialChatMessages, transport])

  const chat = useChat({
    chat: chatInstance,
  })

  const shellMessages = useMemo<ChatWorkspaceShellMessage[]>(() => {
    const messages = toShellMessages(chat.messages as any[])
    const isStreaming = chat.status === 'submitted' || chat.status === 'streaming'
    if (!isStreaming) {
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
  }, [chat.messages, chat.status])

  const activeCapabilityLabel = capabilities.find((item) => item.key === (activeConversation?.capability || defaultCapability))?.label || '通用对话'

  const updateActiveConversation = (updater: (conversation: StoredConversation) => StoredConversation) => {
    if (!activeConversation) {
      return
    }
    setConversations((current) => {
      const next = current.map((conversation) => (
        conversation.id === activeConversation.id
          ? updater(conversation)
          : conversation
      ))
      saveStoredConversations(next)
      return next
    })
  }

  const handleCreateConversation = () => {
    const nextConversation: StoredConversation = {
      id: createConversationId(),
      title: '新对话',
      capability: defaultCapability,
      messages: [],
      selectedToolNames: [],
      updatedAt: new Date().toISOString(),
    }
    const nextConversations = [nextConversation, ...conversations]
    setConversations(nextConversations)
    setActiveConversationId(nextConversation.id)
    saveStoredConversations(nextConversations)
    chat.stop()
    chat.setMessages([])
  }

  const handleDeleteConversation = async (conversationId: string) => {
    const nextConversations = conversations.filter((item) => item.id !== conversationId)
    setConversations(nextConversations)
    saveStoredConversations(nextConversations)
    try {
      await aiApi.resetChat(conversationId)
    } catch {
      // ignore reset failures for local-only history cleanup
    }
    if (conversationId === activeConversationId) {
      const fallback = nextConversations[0] || {
        id: createConversationId(),
        title: '新对话',
        capability: defaultCapability,
        messages: [],
        selectedToolNames: [],
        updatedAt: new Date().toISOString(),
      }
      if (nextConversations.length === 0) {
        saveStoredConversations([fallback])
        setConversations([fallback])
      }
      setActiveConversationId(fallback.id)
      chat.setMessages([])
    }
  }

  const handleComposerSubmit = async ({
    text,
    mentions,
    toolNames,
    displayParts,
  }: {
    text: string
    mentions: AiMentionItem[]
    toolNames: string[]
    displayParts: AiConversationDisplayPart[]
  }) => {
    const effectiveToolNames = toolNames.length > 0 ? toolNames : selectedToolNames
    await chat.sendMessage(
      {
        text,
        metadata: {
          displayParts,
          mentions,
          toolNames: effectiveToolNames,
        },
      },
      {
        body: {
          capability: activeConversation?.capability || defaultCapability,
          toolMode: 'explicit',
          ...(effectiveToolNames.length > 0 ? { toolNames: effectiveToolNames } : {}),
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
            <Button type="button" variant="outline" size="icon" onClick={handleCreateConversation}>
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
                  {(conversation.selectedToolNames || []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {(conversation.selectedToolNames || []).slice(0, 2).map((toolName) => (
                        <Badge key={`${conversation.id}-${toolName}`} variant="outline" className="text-[10px]">
                          {toolName}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {conversation.messages[conversation.messages.length - 1]?.text || '还没有消息'}
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
      <Button type="button" variant="outline" size="sm" onClick={handleCreateConversation}>
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
        emptyDescription="当前入口以栏目内容查询和价格查询两类工具为主。"
        sidebar={sidebar}
        statusBadges={[
          { key: 'capability', label: `能力：${activeCapabilityLabel}` },
          { key: 'tool-mode', label: selectedToolNames.length > 0 ? `显式工具 ${selectedToolNames.length}` : '自动工具关闭', tone: 'secondary' },
          capabilitiesResponse?.data?.model ? { key: 'model', label: `模型：${capabilitiesResponse.data.model}`, tone: 'secondary' } : null,
        ].filter(Boolean) as Array<{ key: string; label: string; tone?: 'default' | 'outline' | 'secondary' }>}
        composer={(
          <AiConversationComposer
            placeholder="问问AI，/ 选择工具 @ 搜索。"
            availableTools={availableTools}
            selectedToolNames={selectedToolNames}
            submitDisabled={chat.status === 'submitted' || chat.status === 'streaming'}
            submitStatus={chat.status === 'submitted' || chat.status === 'streaming' ? 'submitted' : 'ready'}
            onStop={() => chat.stop()}
            onToolSelectionChange={(toolNames) => {
              updateActiveConversation((conversation) => ({
                ...conversation,
                selectedToolNames: toolNames,
                updatedAt: new Date().toISOString(),
              }))
            }}
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
