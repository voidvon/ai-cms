import { useMemo, useState } from 'react'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { RotateCcw, Send } from 'lucide-react'
import { toast } from 'sonner'
import { aiAssistantApi } from '@/api/ai-assistant'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

const QUICK_PROMPTS = [
  '帮我查询 BSA2T-25 在中国区的价格',
  '我要做一份销售合同，需要先收集哪些信息？',
  '客户是上海某工厂，产品是 BSA2T-25 2 台和 BSA2T-40 1 台，先帮我整理合同草稿',
  '把刚才的合同草稿改成需要人工确认付款条款和交期的版本',
]

export default function AiAssistantPage() {
  const [draftInput, setDraftInput] = useState('')
  const chatId = useMemo(() => `admin-ai-chat`, [])

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai-assistant/chat',
        credentials: 'include',
        body: {
          chatId,
        },
      }),
    [chatId]
  )

  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: chatId,
    transport,
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  const handleSend = async () => {
    const value = draftInput.trim()
    if (!value) {
      return
    }

    setDraftInput('')
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: value }],
    })
  }

  const handleReset = async () => {
    try {
      await aiAssistantApi.resetChat(chatId)
      setMessages([])
      toast.success('对话已重置')
    } catch (resetError) {
      toast.error(getApiErrorMessage(resetError, '重置对话失败'))
    }
  }

  const handleQuickPrompt = async (prompt: string) => {
    setDraftInput('')
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
    })
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="lg:sticky lg:top-0 lg:h-[calc(100vh-8rem)]">
        <CardHeader>
          <CardTitle>AI 合同助手</CardTitle>
          <CardDescription>
            通过对话连续查询价格、补齐合同信息、整理合同草稿。当前合同对话已接 OpenAI Agents SDK TS。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge>chat-first</Badge>
            <Badge variant="secondary">OpenAI Agents</Badge>
            <Badge variant="outline">Fastify</Badge>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">推荐用法</div>
            <div className="rounded-lg border p-3 text-sm text-muted-foreground">
              先直接问价格，再继续补客户、产品、交期、付款方式，让助手逐步整理成合同草稿。
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-sm font-medium">快捷提示</div>
            <div className="space-y-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void handleQuickPrompt(prompt)}
                  className="w-full rounded-lg border px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <Button variant="outline" className="w-full" onClick={() => void handleReset()}>
            <RotateCcw className="h-4 w-4" />
            清空对话
          </Button>
        </CardContent>
      </Card>

      <Card className="flex min-h-[70vh] flex-col">
        <CardHeader className="border-b">
          <CardTitle>对话</CardTitle>
          <CardDescription>
            直接问价格、追问缺失信息，或要求生成合同草稿。助手会基于当前对话上下文继续。
          </CardDescription>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-4 p-0">
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              messages.map((message) => (
                <MessageBubble key={message.id} role={message.role} text={extractMessageText(message)} />
              ))
            )}

            {error ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {error.message || '聊天请求失败'}
              </div>
            ) : null}
          </div>

          <div className="border-t p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>状态：{status}</span>
              <span>{isBusy ? '处理中...' : '可继续发送'}</span>
            </div>
            <div className="flex gap-3">
              <Textarea
                value={draftInput}
                onChange={(event) => setDraftInput(event.target.value)}
                placeholder="例如：先帮我查 BSA2T-25 在中国区的价格，然后根据结果起草一份销售合同"
                className="min-h-[96px] resize-y"
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                    event.preventDefault()
                    void handleSend()
                  }
                }}
              />
              <Button className="self-end" onClick={() => void handleSend()} disabled={isBusy || !draftInput.trim()}>
                <Send className="h-4 w-4" />
                发送
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-full min-h-[320px] items-center justify-center rounded-lg border border-dashed">
      <div className="max-w-md space-y-3 px-6 text-center">
        <div className="text-lg font-semibold">从对话开始</div>
        <div className="text-sm text-muted-foreground">
          这不是一个表单工具，而是一个连续协作的助手。你可以先问价格，再继续补合同信息，最后让它整理合同草稿。
        </div>
      </div>
    </div>
  )
}

function MessageBubble({ role, text }: { role: string; text: string }) {
  const isUser = role === 'user'

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm',
          isUser ? 'bg-primary text-primary-foreground' : 'border bg-background'
        )}
      >
        <div className="mb-1 text-[11px] uppercase tracking-wide opacity-70">{isUser ? 'You' : 'Assistant'}</div>
        <div className="whitespace-pre-wrap break-words">{text || '...'}</div>
      </div>
    </div>
  )
}

function extractMessageText(message: { parts?: Array<{ type?: string; text?: string }> }) {
  if (!Array.isArray(message.parts)) {
    return ''
  }

  return message.parts
    .filter((part) => part?.type === 'text')
    .map((part) => part.text || '')
    .join('\n')
    .trim()
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
