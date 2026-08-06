import { useState, type ReactNode } from 'react'
import {
  BookOpenIcon,
  BrainIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  CircleIcon,
  ClockIcon,
  DownloadIcon,
  WrenchIcon,
  XCircleIcon,
} from 'lucide-react'
import { toast } from 'sonner'
import type {
  DynamicToolUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  ToolUIPart,
  UIMessage,
} from 'ai'
import type { AiGeneratedImage, AiMentionItem } from '@/types'
import { redirectToLogin } from '@/api/client'
import { resolveAssetUrl } from '@/lib/assets'
import { cn } from '@/lib/utils'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from '@/components/ui/attachment'
import { Badge } from '@/components/ui/badge'
import { Bubble, BubbleContent } from '@/components/ui/bubble'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Marker, MarkerContent, MarkerIcon, markerVariants } from '@/components/ui/marker'
import { Message, MessageContent } from '@/components/ui/message'
import { Spinner } from '@/components/ui/spinner'
import { StreamingMarkdown } from '@/components/ai-chat/StreamingMarkdown'

type ChatMessageRole = 'user' | 'assistant'
type ChatMessagePart = UIMessage['parts'][number]
type ChatToolPart = ToolUIPart | DynamicToolUIPart
type ChatSourcePart = SourceUrlUIPart | SourceDocumentUIPart

export type AiConversationDisplayPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; mention: AiMentionItem }
  | { type: 'tool'; name: string; category?: string }

export type ChatMessageMetadata = {
  displayParts?: AiConversationDisplayPart[]
  mentions?: AiMentionItem[]
  toolNames?: string[]
  images?: AiGeneratedImage[]
}

export type ChatMessageItemProps = {
  role: ChatMessageRole
  text?: string
  parts?: ChatMessagePart[]
  metadata?: ChatMessageMetadata
  streaming?: boolean
  pending?: boolean
  error?: boolean
  pendingLabel?: string
}

export function ChatMessageItem({
  role,
  text = '',
  parts = [],
  metadata,
  streaming = false,
  pending = false,
  error = false,
  pendingLabel = 'AI 正在整理回复...',
}: ChatMessageItemProps) {
  const normalizedText = String(text || '').trim()
  const isAssistant = role === 'assistant'
  const displayParts = Array.isArray(metadata?.displayParts) ? metadata.displayParts : []
  const reasoningParts = parts.filter(isChatReasoningPart)
  const toolParts = parts.filter(isChatToolPart)
  const sourceParts = parts.filter(isChatSourcePart)
  const reasoningText = reasoningParts.map((part) => part.text || '').join('\n').trim()
  const shouldShowPending = isAssistant && pending && !normalizedText && !reasoningText
  const isReasoningStreaming = reasoningParts.some((part) => part.state === 'streaming')
  const images = Array.isArray(metadata?.images) ? metadata.images : []
  const [downloadingAssetId, setDownloadingAssetId] = useState<number | null>(null)

  const handleDownloadImage = async (image: AiGeneratedImage) => {
    const src = resolveAssetUrl(image.relative_path, { publicUrl: image.public_url })
    if (!src || downloadingAssetId !== null) return

    setDownloadingAssetId(image.asset_id)
    try {
      const { blob, mimeType } = await fetchImageDownloadBlob(src, image.relative_path)
      const objectUrl = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = buildImageDownloadName(image, mimeType)
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
    } catch {
      toast.error('图片下载失败，请稍后重试')
    } finally {
      setDownloadingAssetId(null)
    }
  }

  return (
    <Message align={isAssistant ? 'start' : 'end'}>
      <MessageContent>
        {isAssistant && reasoningText ? (
          <ReasoningSection text={reasoningText} isStreaming={isReasoningStreaming} />
        ) : null}

        <Bubble
          align={isAssistant ? 'start' : 'end'}
          variant={error ? 'destructive' : isAssistant ? 'ghost' : 'muted'}
          className={isAssistant ? 'w-full' : undefined}
        >
          <BubbleContent className={cn(isAssistant && 'w-full', !isAssistant && 'rounded-3xl px-4 py-3')}>
            {shouldShowPending ? (
              <Marker role="status">
                <MarkerIcon><Spinner /></MarkerIcon>
                <MarkerContent className="shimmer shimmer-duration-1600">{pendingLabel}</MarkerContent>
              </Marker>
            ) : isAssistant || error ? (
              <StreamingMarkdown isAnimating={streaming} mode={streaming ? 'streaming' : 'static'}>
                {normalizedText}
              </StreamingMarkdown>
            ) : displayParts.length > 0 ? (
              <ReadonlyMessageParts parts={displayParts} fallbackText={normalizedText} />
            ) : (
              <StreamingMarkdown>{normalizedText}</StreamingMarkdown>
            )}
          </BubbleContent>
        </Bubble>

        {images.length > 0 ? (
          <AttachmentGroup className="grid w-full max-w-3xl grid-cols-1 overflow-visible sm:grid-cols-2">
            {images.map((image) => {
              const src = resolveAssetUrl(image.relative_path, { publicUrl: image.public_url })
              return (
                <Attachment key={`${image.asset_id}:${image.relative_path}`} orientation="vertical" className="w-full">
                  <AttachmentMedia variant="image" className="w-full bg-muted/20 p-0">
                    <a href={src} target="_blank" rel="noreferrer" title="打开原图" className="block w-full">
                      <img src={src} alt={image.alt || 'AI 生成图片'} className="aspect-square w-full object-contain" />
                    </a>
                  </AttachmentMedia>
                  <AttachmentTitle className="sr-only">{image.alt || 'AI 生成图片'}</AttachmentTitle>
                  <AttachmentActions>
                    <AttachmentAction
                      onClick={() => void handleDownloadImage(image)}
                      disabled={downloadingAssetId !== null}
                      aria-label="下载图片"
                      title="下载图片"
                    >
                      {downloadingAssetId === image.asset_id ? <Spinner /> : <DownloadIcon />}
                    </AttachmentAction>
                  </AttachmentActions>
                </Attachment>
              )
            })}
          </AttachmentGroup>
        ) : null}

        {isAssistant && sourceParts.length > 0 ? <SourcesSection parts={sourceParts} /> : null}

        {isAssistant && toolParts.length > 0
          ? toolParts.map((part) => <ToolSection key={getChatToolKey(part)} part={part} />)
          : null}
      </MessageContent>
    </Message>
  )
}

function ReasoningSection({ text, isStreaming }: { text: string; isStreaming: boolean }) {
  return (
    <Collapsible defaultOpen={isStreaming} className="w-full">
      <CollapsibleTrigger className={cn(markerVariants(), 'group/reasoning cursor-pointer hover:text-foreground')}>
        <MarkerIcon>{isStreaming ? <Spinner /> : <BrainIcon />}</MarkerIcon>
        <MarkerContent className={isStreaming ? 'shimmer shimmer-duration-1000' : undefined}>
          {isStreaming ? '正在思考...' : '思考摘要'}
        </MarkerContent>
        <ChevronDownIcon className="ml-auto transition-transform group-data-[panel-open]/reasoning:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 pl-6 text-muted-foreground">
        <StreamingMarkdown>{text}</StreamingMarkdown>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SourcesSection({ parts }: { parts: ChatSourcePart[] }) {
  return (
    <Collapsible className="w-full">
      <CollapsibleTrigger className={cn(markerVariants(), 'group/sources cursor-pointer text-primary hover:text-primary/80')}>
        <MarkerIcon><BookOpenIcon /></MarkerIcon>
        <MarkerContent>参考来源（{parts.length}）</MarkerContent>
        <ChevronDownIcon className="ml-auto transition-transform group-data-[panel-open]/sources:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-1 pl-6 text-xs">
        {parts.map((part) => {
          const title = part.title || part.sourceId
          return part.type === 'source-url' ? (
            <a key={part.sourceId} href={part.url} target="_blank" rel="noreferrer" className="block font-medium text-primary underline underline-offset-4">
              {title}
            </a>
          ) : (
            <div key={part.sourceId} className="font-medium text-muted-foreground">{title}</div>
          )
        })}
      </CollapsibleContent>
    </Collapsible>
  )
}

function ToolSection({ part }: { part: ChatToolPart }) {
  const status = getToolStatus(part.state)
  const title = getChatToolTitle(part)
  const input = 'input' in part ? part.input : undefined
  const output = 'output' in part ? part.output : undefined
  const errorText = 'errorText' in part ? part.errorText : undefined

  return (
    <Collapsible className="w-full rounded-xl border bg-card">
      <CollapsibleTrigger className="group/tool flex w-full cursor-pointer items-center gap-3 p-3 text-left">
        <WrenchIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
        <Badge variant="secondary" className="gap-1.5 rounded-full text-xs">
          {status.icon}{status.label}
        </Badge>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]/tool:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t p-4 text-xs">
        {input !== undefined ? <JsonBlock title="参数" value={input} /> : null}
        {output !== undefined || errorText ? (
          <JsonBlock title={errorText ? '错误' : '结果'} value={errorText || output} destructive={Boolean(errorText)} />
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  )
}

function JsonBlock({ title, value, destructive = false }: { title: string; value: unknown; destructive?: boolean }) {
  return (
    <div className="space-y-2">
      <div className="font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      <pre className={cn('max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 font-mono whitespace-pre-wrap break-words', destructive && 'bg-destructive/10 text-destructive')}>
        {formatToolValue(value)}
      </pre>
    </div>
  )
}

function getToolStatus(state: ChatToolPart['state']): { label: string; icon: ReactNode } {
  const statuses: Record<ChatToolPart['state'], { label: string; icon: ReactNode }> = {
    'approval-requested': { label: '等待确认', icon: <ClockIcon className="size-3.5 text-yellow-600" /> },
    'approval-responded': { label: '已确认', icon: <CheckCircleIcon className="size-3.5 text-blue-600" /> },
    'input-available': { label: '执行中', icon: <Spinner className="size-3.5" /> },
    'input-streaming': { label: '准备中', icon: <CircleIcon className="size-3.5" /> },
    'output-available': { label: '已完成', icon: <CheckCircleIcon className="size-3.5 text-green-600" /> },
    'output-denied': { label: '已拒绝', icon: <XCircleIcon className="size-3.5 text-orange-600" /> },
    'output-error': { label: '失败', icon: <XCircleIcon className="size-3.5 text-red-600" /> },
  }
  return statuses[state]
}

function ReadonlyMessageParts({ parts, fallbackText }: { parts: AiConversationDisplayPart[]; fallbackText: string }) {
  const visibleParts = parts.filter((part) => part.type === 'text' ? part.text.length > 0 : part.type === 'mention' ? Boolean(part.mention?.title) : Boolean(part.name))
  if (visibleParts.length === 0) return <StreamingMarkdown>{fallbackText}</StreamingMarkdown>

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7">
      {visibleParts.map((part, index) => {
        if (part.type === 'text') return <span key={`text-${index}`}>{part.text}</span>
        if (part.type === 'mention') {
          return (
            <Badge key={`mention-${part.mention.type}-${part.mention.id}-${index}`} variant="secondary" className="mx-0.5 align-baseline" title={part.mention.subtitle || part.mention.summary || part.mention.title}>
              @{part.mention.title}
            </Badge>
          )
        }
        return <Badge key={`tool-${part.name}-${index}`} variant="secondary" className="mx-0.5 align-baseline" title={part.category || part.name}>/{part.name}</Badge>
      })}
    </div>
  )
}

async function fetchImageDownloadBlob(primaryUrl: string, relativePath: string) {
  const fallbackUrl = String(relativePath || '').startsWith('/') ? new URL(relativePath, window.location.origin).toString() : ''
  const candidates = Array.from(new Set([primaryUrl, fallbackUrl].filter(Boolean)))
  for (const url of candidates) {
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (response.status === 401) {
        redirectToLogin()
        throw new Error('session expired')
      }
      if (response.ok) return { blob: await response.blob(), mimeType: response.headers.get('content-type') }
    } catch {
      // Try the same-origin compatibility URL when the asset host blocks CORS.
    }
  }
  throw new Error('image download failed')
}

function buildImageDownloadName(image: AiGeneratedImage, responseMimeType?: string | null) {
  const mimeType = String(image.mime_type || responseMimeType || '').split(';', 1)[0].toLowerCase()
  const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : mimeType === 'image/gif' ? 'gif' : 'webp'
  return `ai-image-${image.asset_id}.${extension}`
}

function formatToolValue(value: unknown) {
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) }
  catch { return String(value) }
}

function isChatToolPart(part: ChatMessagePart): part is ChatToolPart {
  return part.type === 'dynamic-tool' || part.type.startsWith('tool-')
}

function isChatSourcePart(part: ChatMessagePart): part is ChatSourcePart {
  return part.type === 'source-url' || part.type === 'source-document'
}

function isChatReasoningPart(part: ChatMessagePart): part is Extract<ChatMessagePart, { type: 'reasoning' }> {
  return part.type === 'reasoning'
}

function isDynamicToolPart(part: ChatToolPart): part is DynamicToolUIPart {
  return part.type === 'dynamic-tool'
}

function getChatToolTitle(part: ChatToolPart) {
  return isDynamicToolPart(part) ? part.title || part.toolName : part.title || part.type.slice(5)
}

function getChatToolKey(part: ChatToolPart) {
  return isDynamicToolPart(part) ? `${part.toolCallId}:${part.state}` : `${part.type}:${part.toolCallId}:${part.state}`
}
