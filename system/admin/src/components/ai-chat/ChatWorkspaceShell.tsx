import type { KeyboardEventHandler, ReactNode } from 'react'
import { Bot, Loader2 } from 'lucide-react'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import { ChatMessageItem, type ChatMessageMetadata } from '@/components/ai-chat/ChatMessageItem'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { UIMessage } from 'ai'

export interface ChatWorkspaceShellMessage {
  id: string
  role: 'user' | 'assistant'
  text?: string
  parts?: UIMessage['parts']
  metadata?: ChatMessageMetadata
  streaming?: boolean
  pending?: boolean
  error?: boolean
  pendingLabel?: string
}

interface ChatWorkspaceShellProps {
  messages: ChatWorkspaceShellMessage[]
  inputValue: string
  onInputChange: (value: string) => void
  onInputKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  onSubmit: () => void
  submitDisabled?: boolean
  submitStatus?: 'ready' | 'submitted'
  placeholder?: string
  emptyTitle?: string
  emptyDescription?: string
  sidebar?: ReactNode
  footerTools?: ReactNode
  statusBadges?: Array<{
    key: string
    label: string
    tone?: 'default' | 'outline' | 'secondary'
  }>
  composerHint?: ReactNode
  composer?: ReactNode
  className?: string
  children?: ReactNode
  layout?: 'split' | 'stacked'
  sidebarPosition?: 'left' | 'right'
}

export function ChatWorkspaceShell({
  messages,
  inputValue,
  onInputChange,
  onInputKeyDown,
  onSubmit,
  submitDisabled = false,
  submitStatus = 'ready',
  placeholder,
  emptyTitle = '还没有消息',
  emptyDescription = '发送第一条消息开始对话。',
  sidebar,
  footerTools,
  statusBadges = [],
  composerHint,
  composer,
  className,
  children,
  layout = 'split',
  sidebarPosition = 'right',
}: ChatWorkspaceShellProps) {
  const conversationSection = (
    <section className={cn(
      'flex min-h-0 flex-col',
      layout === 'split'
        ? sidebarPosition === 'left'
          ? 'border-b lg:order-2 lg:border-b-0 lg:border-l'
          : 'border-b lg:border-b-0 lg:border-r'
        : ''
    )}>
        <div className="border-b bg-background/95 px-4 py-3 backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            {statusBadges.map((badge) => (
              <Badge key={badge.key} variant={badge.tone || 'outline'}>
                {badge.label}
              </Badge>
            ))}
          </div>
        </div>

        <Conversation className="min-h-0 flex-1 bg-muted/10">
          <ConversationContent className="gap-5 px-4 py-5">
            {layout === 'stacked' && sidebar ? sidebar : null}
            {messages.length === 0 ? (
              <ConversationEmptyState
                title={emptyTitle}
                description={emptyDescription}
                icon={<Bot className="h-5 w-5" />}
              />
            ) : (
              messages.map((message) => (
                <ChatMessageItem
                  key={message.id}
                  role={message.role}
                  text={message.text}
                  parts={message.parts}
                  metadata={message.metadata}
                  streaming={message.streaming}
                  pending={message.pending}
                  error={message.error}
                  pendingLabel={message.pendingLabel}
                />
              ))
            )}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>

        <div className="shrink-0 border-t bg-background/95 px-4 py-4 backdrop-blur">
          {children}
          {composer ? (
            composer
          ) : (
            <>
              <PromptInput
                onSubmit={(event) => {
                  const nextValue = String(event.text || inputValue || '').trim()
                  if (!nextValue || submitDisabled) {
                    return
                  }
                  onSubmit()
                }}
              >
                <PromptInputBody>
                  <PromptInputTextarea
                    value={inputValue}
                    onChange={(event) => onInputChange(event.target.value)}
                    onKeyDown={onInputKeyDown}
                    placeholder={placeholder}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    {footerTools || composerHint || null}
                  </PromptInputTools>
                  <PromptInputSubmit disabled={submitDisabled} status={submitStatus}>
                    {submitStatus === 'submitted' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                  </PromptInputSubmit>
                </PromptInputFooter>
              </PromptInput>
              {composerHint && !footerTools ? (
                <div className="mt-3 text-xs text-muted-foreground">{composerHint}</div>
              ) : null}
            </>
          )}
        </div>
      </section>
  )

  if (layout === 'stacked') {
    return <div className={cn('flex min-h-0 flex-1 flex-col overflow-hidden', className)}>{conversationSection}</div>
  }

  return (
    <div
      className={cn(
        'grid h-full min-h-0 flex-1 grid-cols-1 overflow-hidden',
        sidebarPosition === 'left'
          ? 'lg:grid-cols-[420px_minmax(0,1fr)]'
          : 'lg:grid-cols-[minmax(0,1fr)_420px]',
        className
      )}
    >
      {sidebarPosition === 'left' ? (
        <>
          <aside className="min-h-0 overflow-hidden border-t bg-background lg:order-1 lg:border-t-0">
            {sidebar}
          </aside>
          {conversationSection}
        </>
      ) : (
        <>
          {conversationSection}
          <aside className="min-h-0 overflow-hidden border-t bg-background lg:border-t-0">
            {sidebar}
          </aside>
        </>
      )}
    </div>
  )
}
