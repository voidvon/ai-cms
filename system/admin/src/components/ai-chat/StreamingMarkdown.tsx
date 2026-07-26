import { memo, type ComponentProps } from 'react'
import { cjk } from '@streamdown/cjk'
import { Streamdown } from 'streamdown'
import { limitedCodeHighlighter } from '@/lib/limited-code-highlighter'
import { cn } from '@/lib/utils'

export type StreamingMarkdownProps = ComponentProps<typeof Streamdown>

const streamdownPlugins = { cjk, code: limitedCodeHighlighter } as unknown as NonNullable<StreamingMarkdownProps['plugins']>

export const StreamingMarkdown = memo(
  ({ className, ...props }: StreamingMarkdownProps) => (
    <Streamdown
      className={cn(
        'typeset size-full text-sm leading-7 [--typeset-flow:0.8em] [--typeset-leading:1.75] [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
        "[&_[data-streamdown='ordered-list']]:my-3 [&_[data-streamdown='ordered-list']]:list-outside [&_[data-streamdown='ordered-list']]:list-decimal [&_[data-streamdown='ordered-list']]:pl-6",
        "[&_[data-streamdown='unordered-list']]:my-3 [&_[data-streamdown='unordered-list']]:list-outside [&_[data-streamdown='unordered-list']]:list-disc [&_[data-streamdown='unordered-list']]:pl-6",
        "[&_[data-streamdown='list-item']]:py-1 [&_[data-streamdown='list-item']>p]:inline",
        "[&_[data-streamdown='ordered-list']_[data-streamdown='ordered-list']]:my-1 [&_[data-streamdown='ordered-list']_[data-streamdown='unordered-list']]:my-1",
        "[&_[data-streamdown='unordered-list']_[data-streamdown='ordered-list']]:my-1 [&_[data-streamdown='unordered-list']_[data-streamdown='unordered-list']]:my-1",
        "[&_[data-streamdown='heading-1']]:mb-3 [&_[data-streamdown='heading-1']]:mt-6 [&_[data-streamdown='heading-1']]:text-2xl [&_[data-streamdown='heading-1']]:font-semibold",
        "[&_[data-streamdown='heading-2']]:mb-2 [&_[data-streamdown='heading-2']]:mt-5 [&_[data-streamdown='heading-2']]:text-xl [&_[data-streamdown='heading-2']]:font-semibold",
        "[&_[data-streamdown='heading-3']]:mb-2 [&_[data-streamdown='heading-3']]:mt-4 [&_[data-streamdown='heading-3']]:text-lg [&_[data-streamdown='heading-3']]:font-semibold",
        "[&_[data-streamdown='blockquote']]:my-4 [&_[data-streamdown='blockquote']]:border-l-4 [&_[data-streamdown='blockquote']]:border-muted-foreground/30 [&_[data-streamdown='blockquote']]:pl-4 [&_[data-streamdown='blockquote']]:text-muted-foreground",
        "[&_[data-streamdown='inline-code']]:rounded [&_[data-streamdown='inline-code']]:bg-muted [&_[data-streamdown='inline-code']]:px-1.5 [&_[data-streamdown='inline-code']]:py-0.5 [&_[data-streamdown='inline-code']]:font-mono [&_[data-streamdown='inline-code']]:text-[0.9em]",
        "[&_[data-streamdown='strong']]:font-semibold [&_[data-streamdown='link']]:font-medium [&_[data-streamdown='link']]:text-primary [&_[data-streamdown='link']]:underline",
        className,
      )}
      parseIncompleteMarkdown
      plugins={streamdownPlugins}
      {...props}
    />
  ),
  (previous, next) => (
    previous.children === next.children
    && previous.isAnimating === next.isAnimating
    && previous.mode === next.mode
    && previous.parseIncompleteMarkdown === next.parseIncompleteMarkdown
  ),
)

StreamingMarkdown.displayName = 'StreamingMarkdown'
