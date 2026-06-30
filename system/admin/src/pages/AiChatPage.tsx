import { useMemo } from 'react'
import { DefaultChatTransport } from 'ai'
import { useChat } from '@ai-sdk/react'
import { Bot, Send, Sparkles } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const QUICK_PROMPTS = [
  '帮我查询 BSA2T-25 在中国区的价格',
  '我要做一份销售合同，需要先收集哪些信息？',
  '客户是上海某工厂，产品是 BSA2T-25 2 台和 BSA2T-40 1 台，先帮我整理合同草稿',
  '我想把 AI 能力扩展到知识问答和内容协作，应该怎么规划入口？',
]

const DEFAULT_CONVERSATION_ID = 'admin-ai-chat'
const DEFAULT_CAPABILITY = 'contract_copilot'

export default function AiChatPage() {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/ai/chat',
        credentials: 'include',
        body: {
          conversationId: DEFAULT_CONVERSATION_ID,
          capability: DEFAULT_CAPABILITY,
        },
      }),
    []
  )

  const { messages, sendMessage, status, error, stop } = useChat({
    id: DEFAULT_CONVERSATION_ID,
    transport,
  })

  const isBusy = status === 'submitted' || status === 'streaming'

  const handlePromptSubmit = async ({ text }: { text?: string }) => {
    const value = String(text || '').trim()
    if (!value) {
      return
    }

    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: value }],
    })
  }

  const handleSuggestionClick = async (prompt: string) => {
    await sendMessage({
      role: 'user',
      parts: [{ type: 'text', text: prompt }],
    })
  }

  return (
    <div className="min-h-0">
      <Card className="flex min-h-[calc(100vh-9rem)] flex-col overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <Bot className="h-5 w-5 text-primary" />
                AI 对话
              </CardTitle>
              <CardDescription>
                统一承接后续 AI 能力。当前先内置合同协作能力，支持连续对话、价格占位查询和合同草稿整理。
              </CardDescription>
            </div>
            <div className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
              {isBusy ? '正在处理' : '可继续对话'}
            </div>
          </div>
        </CardHeader>

        <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
          <Conversation className="bg-gradient-to-b from-background via-background to-muted/10">
            <ConversationContent className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
              {messages.length === 0 ? (
                <ConversationEmptyState
                  icon={<Sparkles className="h-6 w-6" />}
                  title="从一条问题开始"
                  description="当前先通过统一对话入口承接合同相关能力，后续再向知识问答、内容协作、运营辅助扩展。"
                >
                  <div className="flex max-w-xl flex-col items-center gap-4 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl border bg-background shadow-sm">
                      <Bot className="h-6 w-6 text-primary" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-lg font-semibold">AI 对话</h3>
                      <p className="text-sm leading-6 text-muted-foreground">
                        这里是统一 AI 入口，不再把合同做成单独产品页。当前默认能力仍是合同协作，后续新能力会继续挂在这里。
                      </p>
                    </div>
                    <Suggestions className="max-w-full">
                      {QUICK_PROMPTS.map((prompt) => (
                        <Suggestion key={prompt} suggestion={prompt} onClick={() => void handleSuggestionClick(prompt)} />
                      ))}
                    </Suggestions>
                  </div>
                </ConversationEmptyState>
              ) : (
                messages.map((message) => (
                  <Message key={message.id} from={message.role}>
                    <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </div>
                    <MessageContent className="rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm group-[.is-user]:border-transparent group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground">
                      <MessageResponse>{extractMessageText(message) || '...'}</MessageResponse>
                    </MessageContent>
                  </Message>
                ))
              )}

              {error ? (
                <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive shadow-sm">
                  {error.message || '聊天请求失败'}
                </div>
              ) : null}
            </ConversationContent>

            <ConversationScrollButton />
          </Conversation>

          <div className="border-t bg-background/95 backdrop-blur">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4 sm:px-6">
              {messages.length > 0 ? (
                <Suggestions>
                  {QUICK_PROMPTS.map((prompt) => (
                    <Suggestion key={prompt} suggestion={prompt} onClick={() => void handleSuggestionClick(prompt)} />
                  ))}
                </Suggestions>
              ) : null}

              <PromptInput onSubmit={({ text }, event) => void handlePromptSubmit({ text: text || '' }, event)}>
                <PromptInputBody>
                  <PromptInputTextarea placeholder="例如：先帮我查 BSA2T-25 在中国区的价格，然后根据结果起草一份销售合同" />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <div className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                      当前能力：合同协作
                    </div>
                  </PromptInputTools>
                  <PromptInputSubmit disabled={false} onStop={() => void stop()} status={status}>
                    {!isBusy ? <Send className="h-4 w-4" /> : undefined}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </CardContent>
      </Card>
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
