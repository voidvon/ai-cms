import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery } from '@tanstack/react-query'
import { Chat, useChat } from '@ai-sdk/react'
import { Bot, MessageSquarePlus, RefreshCw, Wrench, X, Trash2 } from 'lucide-react'
import { useOutletContext } from 'react-router-dom'
import { createAiChatTransport } from '@/api/ai-chat'
import { aiApi } from '@/api/ai'
import { ChatWorkspaceShell, type ChatWorkspaceShellMessage } from '@/components/ai-chat/ChatWorkspaceShell'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import type { AiChatCapabilityDefinition, AiToolDefinition } from '@/types'

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

function migrateStoredConversation(conversation: StoredConversation): StoredConversation {
  return {
    ...conversation,
    selectedToolNames: Array.from(new Set((conversation.selectedToolNames || []).map((name) => TOOL_NAME_MIGRATIONS[name] || name))),
  }
}

function toShellMessages(messages: any[]): ChatWorkspaceShellMessage[] {
  return messages.map((message) => ({
    id: String(message.id),
    role: message.role === 'assistant' ? 'assistant' : 'user',
    text: extractMessageText(message.parts),
    parts: Array.isArray(message.parts) ? message.parts : [],
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

function extractMentionedToolNames(input: string, availableTools: AiToolDefinition[]) {
  const matches = Array.from(String(input || '').matchAll(/@([\w-]+)/g))
  if (matches.length === 0) {
    return []
  }

  const availableToolNames = new Set(availableTools.map((tool) => tool.name))
  return Array.from(new Set(
    matches
      .map((match) => TOOL_NAME_MIGRATIONS[match[1]] || match[1])
      .filter((name) => availableToolNames.has(name))
  ))
}

function stripMentionedToolNames(input: string, toolNames: string[]) {
  let output = String(input || '')
  for (const toolName of toolNames) {
    const escaped = toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    output = output.replace(new RegExp(`(^|\\s)@${escaped}(?=\\s|$)`, 'g'), ' ')
  }
  return output.replace(/\s{2,}/g, ' ').trim()
}

export default function AiConversationPage() {
  const { headerSlotElement, setDocumentTitle, setMainContentPadding } =
    useOutletContext<DashboardHeaderContext>()
  const [conversations, setConversations] = useState<StoredConversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string>('')
  const [inputValue, setInputValue] = useState('')
  const [toolQuery, setToolQuery] = useState('')
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
  }, [capabilitiesResponse])
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
  const inlineMentionToolNames = useMemo(() => {
    return extractMentionedToolNames(inputValue, availableTools)
  }, [availableTools, inputValue])
  const effectiveSelectedToolNames = useMemo(() => {
    return Array.from(new Set([...selectedToolNames, ...inlineMentionToolNames]))
  }, [inlineMentionToolNames, selectedToolNames])

  const transport = useMemo(() => {
    return createAiChatTransport({
      capability: activeConversation?.capability || defaultCapability,
      toolNames: effectiveSelectedToolNames,
      explicitToolMode: true,
    })
  }, [activeConversation?.capability, defaultCapability, effectiveSelectedToolNames])

  const initialChatMessages = useMemo(() => {
    if (!activeConversation) {
      return []
    }
    return activeConversation.messages.map((message) => ({
      id: message.id,
      role: message.role,
      parts: message.parts || (message.text ? [{ type: 'text', text: message.text }] : []),
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
    const baseMessages = toShellMessages(chat.messages as any[])
    if (chat.status === 'submitted' && baseMessages.length > 0) {
      return baseMessages
    }
    return baseMessages
  }, [chat.messages, chat.status])

  const activeCapabilityLabel = capabilities.find((item) => item.key === (activeConversation?.capability || defaultCapability))?.label || '通用对话'

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
    setInputValue('')
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
      setInputValue('')
    }
  }

  const handleSubmit = async () => {
    const rawText = String(inputValue || '').trim()
    const text = stripMentionedToolNames(rawText, inlineMentionToolNames)
    if (!text) {
      return
    }
    if (inlineMentionToolNames.length > 0) {
      updateActiveConversation((conversation) => ({
        ...conversation,
        selectedToolNames: Array.from(new Set([...(conversation.selectedToolNames || []), ...inlineMentionToolNames])),
        updatedAt: new Date().toISOString(),
      }))
    }
    await chat.sendMessage(
      { text },
      {
        body: {
          capability: activeConversation?.capability || defaultCapability,
          toolMode: 'explicit',
          ...(effectiveSelectedToolNames.length > 0 ? { toolNames: effectiveSelectedToolNames } : {}),
        },
      }
    )
    setInputValue('')
    setToolQuery('')
  }

  const mentionMatch = useMemo(() => {
    const match = inputValue.match(/(?:^|\s)@([\w-]*)$/)
    return match ? match[1] || '' : null
  }, [inputValue])

  const filteredTools = useMemo(() => {
    const query = (mentionMatch ?? toolQuery).trim().toLowerCase()
    return availableTools
      .filter((tool) => !effectiveSelectedToolNames.includes(tool.name))
      .filter((tool) => {
        if (!query) {
          return true
        }
        return tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query)
      })
      .slice(0, 8)
  }, [availableTools, effectiveSelectedToolNames, mentionMatch, toolQuery])

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

  const handleAddTool = (toolName: string) => {
    updateActiveConversation((conversation) => ({
      ...conversation,
      selectedToolNames: [...new Set([...(conversation.selectedToolNames || []), toolName])],
      updatedAt: new Date().toISOString(),
    }))
    setInputValue((current) => current.replace(/(?:^|\s)@([\w-]*)$/, ' ').replace(/\s{2,}/g, ' ').trimStart())
    setToolQuery('')
  }

  const handleRemoveTool = (toolName: string) => {
    updateActiveConversation((conversation) => ({
      ...conversation,
      selectedToolNames: (conversation.selectedToolNames || []).filter((name) => name !== toolName),
      updatedAt: new Date().toISOString(),
    }))
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
                onClick={() => {
                  setActiveConversationId(conversation.id)
                    setInputValue('')
                    setToolQuery('')
                  }}
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
    <div className="h-full">
      {headerSlotElement ? createPortal(headerContent, headerSlotElement) : null}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 shadow-none">
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          <ChatWorkspaceShell
            messages={shellMessages}
            inputValue={inputValue}
            onInputChange={setInputValue}
            onSubmit={() => void handleSubmit()}
            submitDisabled={!inputValue.trim() || chat.status === 'submitted' || chat.status === 'streaming'}
            submitStatus={chat.status === 'submitted' || chat.status === 'streaming' ? 'submitted' : 'ready'}
            placeholder="例如：@query_columns 先找相关栏目，再用 @query_content_items 查询内容，或 @price_lookup 查询 BSA2T-25 的价格"
            emptyTitle="开始新的 AI 对话"
            emptyDescription="当前入口以栏目内容查询和价格查询两类工具为主。"
            sidebar={sidebar}
            statusBadges={[
              { key: 'capability', label: `能力：${activeCapabilityLabel}` },
              { key: 'tool-mode', label: effectiveSelectedToolNames.length > 0 ? `显式工具 ${effectiveSelectedToolNames.length}` : '自动工具关闭', tone: 'secondary' },
              capabilitiesResponse?.data?.model ? { key: 'model', label: `模型：${capabilitiesResponse.data.model}`, tone: 'secondary' } : null,
            ].filter(Boolean) as Array<{ key: string; label: string; tone?: 'default' | 'outline' | 'secondary' }>}
            footerTools={(
              <div className="flex flex-wrap items-center gap-2">
                <div className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                  输入 `@` 选择工具；当前只开放 `query_columns`、`query_content_items` 和 `price_lookup`。
                </div>
                {selectedToolNames.map((toolName) => (
                  <Badge key={toolName} variant="secondary" className="gap-1 rounded-full pl-2 pr-1">
                    <Wrench className="h-3 w-3" />
                    {toolName}
                    <button
                      type="button"
                      onClick={() => handleRemoveTool(toolName)}
                      className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full hover:bg-background/80"
                      aria-label={`移除工具 ${toolName}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          >
            {mentionMatch !== null ? (
              <div className="mb-3 rounded-2xl border bg-background p-2">
                <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" />
                  `@工具`
                </div>
                <div className="space-y-1">
                  {filteredTools.length > 0 ? filteredTools.map((tool) => (
                    <button
                      key={tool.name}
                      type="button"
                      onClick={() => handleAddTool(tool.name)}
                      className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{tool.name}</div>
                        <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">{tool.description}</div>
                      </div>
                      <Badge variant="outline" className="ml-3 shrink-0">{tool.category}</Badge>
                    </button>
                  )) : (
                    <div className="px-3 py-2 text-sm text-muted-foreground">没有匹配到可用工具。</div>
                  )}
                </div>
              </div>
            ) : null}
          </ChatWorkspaceShell>
        </CardContent>
      </Card>
    </div>
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
