import { useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { mergeAttributes, Node } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { ArrowUp, Hash, Square, Wrench, X } from 'lucide-react'
import { aiApi } from '@/api/ai'
import { Badge } from '@/components/ui/badge'
import type { AiMentionItem, AiToolDefinition } from '@/types'

type ComposerSubmitPayload = {
  text: string
  mentions: AiMentionItem[]
  toolNames: string[]
  displayParts: AiConversationDisplayPart[]
}

export type AiConversationDisplayPart =
  | { type: 'text'; text: string }
  | { type: 'mention'; mention: AiMentionItem }
  | { type: 'tool'; name: string; category?: string }

type ComposerProps = {
  placeholder: string
  availableTools: AiToolDefinition[]
  selectedToolNames: string[]
  enableTools?: boolean
  enableMentions?: boolean
  submitDisabled?: boolean
  submitStatus?: 'ready' | 'submitted'
  onStop?: () => void
  onSubmit: (payload: ComposerSubmitPayload) => void
  onToolSelectionChange: (toolNames: string[]) => void
}

type ComposerMentionAttrs = {
  id: number
  type: AiMentionItem['type']
  title: string
}

type ComposerToolAttrs = {
  name: string
  category?: string
}

type TriggerMatch = {
  from: number
  to: number
  query: string
}

type MentionMatch = TriggerMatch & {
  mentionType: AiMentionItem['type'] | null
}

type MentionCategory = {
  type: AiMentionItem['type']
  label: string
  description: string
}

const MENTION_CATEGORIES: MentionCategory[] = [
  {
    type: 'column',
    label: '栏目',
    description: '搜索栏目树中的栏目节点',
  },
  {
    type: 'content',
    label: '信息',
    description: '搜索内容模型中的信息数据',
  },
]

const MENTION_LABEL_TO_TYPE: Record<string, AiMentionItem['type']> = {
  栏目: 'column',
  信息: 'content',
}

const MENTION_TYPE_TO_LABEL: Record<AiMentionItem['type'], string> = {
  column: '栏目',
  content: '信息',
}

function uniqueTools(toolNames: string[]) {
  return Array.from(new Set(toolNames.filter(Boolean)))
}

function buildTextOffsetMap(node: ProseMirrorNode, limit: number) {
  let consumed = 0
  let text = ''

  for (let index = 0; index < node.childCount; index += 1) {
    if (consumed >= limit) {
      break
    }

    const child = node.child(index)
    const childSize = child.isText ? (child.text?.length || 0) : 1
    const remaining = limit - consumed
    const take = Math.min(childSize, remaining)

    if (child.isText) {
      text += (child.text || '').slice(0, take)
    } else {
      text += '\uFFFC'.repeat(take)
    }

    consumed += take
  }

  return text
}

const MentionNode = Node.create({
  name: 'aiMention',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      id: { default: 0 },
      type: { default: 'content' },
      title: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-mention-id]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'ai-mention-chip',
        contenteditable: 'false',
      }),
      `@${HTMLAttributes.title || ''}`,
    ]
  },

  renderText({ node }) {
    return `@${node.attrs.title}`
  },
})

const ToolNode = Node.create({
  name: 'aiTool',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: { default: '' },
      category: { default: '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-tool-name]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        class: 'ai-tool-chip',
        contenteditable: 'false',
      }),
      `/${HTMLAttributes.name || ''}`,
    ]
  },

  renderText({ node }) {
    return `/${node.attrs.name}`
  },
})

function getPlainText(editor: NonNullable<ReturnType<typeof useEditor>>) {
  return editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n', '\n').replace(/\n$/, '')
}

function getMentionTokens(editor: NonNullable<ReturnType<typeof useEditor>>, mentionCache: Map<string, AiMentionItem>) {
  const mentions: AiMentionItem[] = []

  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'aiMention') {
      return true
    }

    const attrs = node.attrs as ComposerMentionAttrs
    const key = `${attrs.type}:${attrs.id}`
    mentions.push(
      mentionCache.get(key) || {
        id: Number(attrs.id || 0),
        type: String(attrs.type || 'content') as AiMentionItem['type'],
        title: String(attrs.title || ''),
      }
    )
    return true
  })

  return mentions
}

function getToolTokens(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const toolNames: string[] = []

  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'aiTool') {
      return true
    }

    const attrs = node.attrs as ComposerToolAttrs
    if (attrs.name) {
      toolNames.push(String(attrs.name))
    }
    return true
  })

  return uniqueTools(toolNames)
}

function detectCoarsePointerInput() {
  if (typeof window === 'undefined') {
    return false
  }

  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
}

function pushTextPart(parts: AiConversationDisplayPart[], text: string) {
  if (!text) {
    return
  }

  const previous = parts[parts.length - 1]
  if (previous?.type === 'text') {
    previous.text += text
    return
  }

  parts.push({ type: 'text', text })
}

function getDisplayParts(editor: NonNullable<ReturnType<typeof useEditor>>, mentionCache: Map<string, AiMentionItem>) {
  const parts: AiConversationDisplayPart[] = []

  editor.state.doc.forEach((block, _offset, blockIndex) => {
    if (blockIndex > 0) {
      pushTextPart(parts, '\n')
    }

    block.forEach((node) => {
      if (node.isText) {
        pushTextPart(parts, node.text || '')
        return
      }

      if (node.type.name === 'aiMention') {
        const attrs = node.attrs as ComposerMentionAttrs
        const key = `${attrs.type}:${attrs.id}`
        const mention = mentionCache.get(key) || {
          id: Number(attrs.id || 0),
          type: String(attrs.type || 'content') as AiMentionItem['type'],
          title: String(attrs.title || ''),
        }
        parts.push({ type: 'mention', mention })
        return
      }

      if (node.type.name === 'aiTool') {
        const attrs = node.attrs as ComposerToolAttrs
        if (attrs.name) {
          parts.push({
            type: 'tool',
            name: String(attrs.name),
            category: attrs.category ? String(attrs.category) : undefined,
          })
        }
      }
    })
  })

  return parts.filter((part) => part.type !== 'text' || part.text.length > 0)
}

function findActiveTrigger(editor: NonNullable<ReturnType<typeof useEditor>>, trigger: '@' | '/') {
  const { from, to, $from } = editor.state.selection
  if (from !== to) {
    return null
  }

  const textBefore = buildTextOffsetMap($from.parent, $from.parentOffset)
  const escapedTrigger = trigger === '@' ? '@' : '/'
  const regex = new RegExp(`(?:^|\\s)\\${escapedTrigger}([^\\s@/]*)$`)
  const match = textBefore.match(regex)
  if (!match) {
    return null
  }

  const query = match[1] || ''
  const fullMatch = `${trigger}${query}`
  const start = textBefore.lastIndexOf(fullMatch)
  if (start < 0) {
    return null
  }

  return {
    from: $from.start() + start,
    to: $from.start() + start + fullMatch.length,
    query,
  } satisfies TriggerMatch
}

function findActiveMentionTrigger(editor: NonNullable<ReturnType<typeof useEditor>>): MentionMatch | null {
  const { from, to, $from } = editor.state.selection
  if (from !== to) {
    return null
  }

  const textBefore = buildTextOffsetMap($from.parent, $from.parentOffset)
  const regex = /(?:^|\s)(@(栏目|信息)?\s?([^\s@/]*)?)$/
  const match = textBefore.match(regex)
  if (!match) {
    return null
  }

  const fullMatch = match[1] || ''
  const label = match[2] || ''
  const query = match[3] || ''
  const start = textBefore.lastIndexOf(fullMatch)
  if (start < 0) {
    return null
  }

  return {
    from: $from.start() + start,
    to: $from.start() + start + fullMatch.length,
    query,
    mentionType: label ? MENTION_LABEL_TO_TYPE[label] : null,
  }
}

export function AiConversationComposer({
  placeholder,
  availableTools,
  selectedToolNames,
  enableTools = true,
  enableMentions = true,
  submitDisabled = false,
  submitStatus = 'ready',
  onStop,
  onSubmit,
  onToolSelectionChange,
}: ComposerProps) {
  const mentionCacheRef = useRef(new Map<string, AiMentionItem>())
  const selectedToolNamesRef = useRef<string[]>(selectedToolNames)
  const commandMatchRef = useRef<TriggerMatch | null>(null)
  const mentionMatchRef = useRef<MentionMatch | null>(null)
  const filteredToolsRef = useRef<AiToolDefinition[]>([])
  const mentionItemsRef = useRef<AiMentionItem[]>([])
  const activeCommandIndexRef = useRef(0)
  const activeMentionCategoryIndexRef = useRef(0)
  const activeMentionIndexRef = useRef(0)
  const isCoarsePointerInputRef = useRef(false)
  const [plainText, setPlainText] = useState('')
  const [mentionItems, setMentionItems] = useState<AiMentionItem[]>([])
  const [isMentionLoading, setIsMentionLoading] = useState(false)
  const [isCoarsePointerInput, setIsCoarsePointerInput] = useState(false)
  const [activeCommandIndex, setActiveCommandIndex] = useState(0)
  const [activeMentionCategoryIndex, setActiveMentionCategoryIndex] = useState(0)
  const [activeMentionIndex, setActiveMentionIndex] = useState(0)

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: true,
        history: true,
      }),
      Placeholder.configure({
        placeholder,
        showOnlyWhenEditable: true,
      }),
      MentionNode,
      ToolNode,
    ],
    editorProps: {
      attributes: {
        class: 'ai-conversation-tiptap-editor',
      },
      handleKeyDown: (_view, event) => {
        const hasCommandSuggestions = enableTools && commandMatchRef.current !== null && filteredToolsRef.current.length > 0
        const hasMentionCategorySuggestions = enableMentions && mentionMatchRef.current !== null && mentionMatchRef.current.mentionType === null
        const hasMentionSuggestions = enableMentions && mentionMatchRef.current !== null && mentionMatchRef.current.mentionType !== null && mentionItemsRef.current.length > 0

        if (event.key === 'Enter' && (event.shiftKey || isCoarsePointerInputRef.current)) {
          return false
        }

        if (event.key === 'Enter') {
          event.preventDefault()
          if (hasCommandSuggestions) {
            handleAddTool(filteredToolsRef.current[activeCommandIndexRef.current] || filteredToolsRef.current[0])
            return true
          }
          if (hasMentionCategorySuggestions) {
            handleSelectMentionCategory(MENTION_CATEGORIES[activeMentionCategoryIndexRef.current] || MENTION_CATEGORIES[0])
            return true
          }
          if (hasMentionSuggestions) {
            handleSelectMention(mentionItemsRef.current[activeMentionIndexRef.current] || mentionItemsRef.current[0])
            return true
          }
          handleSubmit()
          return true
        }

        if (event.key === 'ArrowDown' && hasCommandSuggestions) {
          event.preventDefault()
          setActiveCommandIndex((current) => Math.min(current + 1, filteredToolsRef.current.length - 1))
          return true
        }

        if (event.key === 'ArrowUp' && hasCommandSuggestions) {
          event.preventDefault()
          setActiveCommandIndex((current) => Math.max(current - 1, 0))
          return true
        }

        if (event.key === 'ArrowDown' && hasMentionCategorySuggestions) {
          event.preventDefault()
          setActiveMentionCategoryIndex((current) => Math.min(current + 1, MENTION_CATEGORIES.length - 1))
          return true
        }

        if (event.key === 'ArrowUp' && hasMentionCategorySuggestions) {
          event.preventDefault()
          setActiveMentionCategoryIndex((current) => Math.max(current - 1, 0))
          return true
        }

        if (event.key === 'ArrowDown' && hasMentionSuggestions) {
          event.preventDefault()
          setActiveMentionIndex((current) => Math.min(current + 1, mentionItemsRef.current.length - 1))
          return true
        }

        if (event.key === 'ArrowUp' && hasMentionSuggestions) {
          event.preventDefault()
          setActiveMentionIndex((current) => Math.max(current - 1, 0))
          return true
        }

        return false
      },
    },
    content: {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    },
    onUpdate: ({ editor: nextEditor }) => {
      setPlainText(getPlainText(nextEditor))
      const nextToolNames = getToolTokens(nextEditor)
      const previousToolNames = selectedToolNamesRef.current
      if (
        nextToolNames.length !== previousToolNames.length
        || nextToolNames.some((toolName, index) => toolName !== previousToolNames[index])
      ) {
        selectedToolNamesRef.current = nextToolNames
        onToolSelectionChange(nextToolNames)
      }
    },
  })

  const commandMatch = useMemo(() => {
    if (!editor || !enableTools) {
      return null
    }
    return findActiveTrigger(editor, '/')
  }, [editor, enableTools, plainText])

  const mentionMatch = useMemo(() => {
    if (!editor || !enableMentions) {
      return null
    }
    return findActiveMentionTrigger(editor)
  }, [editor, enableMentions, plainText])

  const filteredTools = useMemo(() => {
    if (!commandMatch) {
      return []
    }
    const query = commandMatch.query.trim().toLowerCase()
    return availableTools
      .filter((tool) => !selectedToolNames.includes(tool.name))
      .filter((tool) => !query || tool.name.toLowerCase().includes(query) || tool.description.toLowerCase().includes(query))
      .slice(0, 8)
  }, [availableTools, commandMatch, selectedToolNames])

  useEffect(() => {
    commandMatchRef.current = commandMatch
    mentionMatchRef.current = mentionMatch
    filteredToolsRef.current = filteredTools
    mentionItemsRef.current = mentionItems
    activeCommandIndexRef.current = activeCommandIndex
    activeMentionCategoryIndexRef.current = activeMentionCategoryIndex
    activeMentionIndexRef.current = activeMentionIndex
  }, [activeCommandIndex, activeMentionCategoryIndex, activeMentionIndex, commandMatch, filteredTools, mentionItems, mentionMatch])

  useEffect(() => {
    selectedToolNamesRef.current = selectedToolNames
  }, [selectedToolNames])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(pointer: coarse)')
    const updateInputMode = () => {
      setIsCoarsePointerInput(detectCoarsePointerInput())
    }

    updateInputMode()
    mediaQuery.addEventListener('change', updateInputMode)
    return () => {
      mediaQuery.removeEventListener('change', updateInputMode)
    }
  }, [])

  useEffect(() => {
    isCoarsePointerInputRef.current = isCoarsePointerInput
  }, [isCoarsePointerInput])

  useEffect(() => {
    setActiveCommandIndex(0)
  }, [commandMatch?.query, filteredTools.length])

  useEffect(() => {
    setActiveMentionIndex(0)
  }, [mentionMatch?.query, mentionItems.length])

  useEffect(() => {
    setActiveMentionCategoryIndex(0)
  }, [mentionMatch?.mentionType])

  useEffect(() => {
    if (!mentionMatch?.mentionType || !mentionMatch.query.trim()) {
      setMentionItems([])
      setIsMentionLoading(false)
      return
    }

    let cancelled = false
    setIsMentionLoading(true)
    aiApi.searchMentions(mentionMatch.query.trim(), 8, mentionMatch.mentionType)
      .then((response) => {
        if (cancelled) {
          return
        }
        const items = response.data?.items || []
        items.forEach((item) => {
          mentionCacheRef.current.set(`${item.type}:${item.id}`, item)
        })
        setMentionItems(items)
      })
      .catch(() => {
        if (!cancelled) {
          setMentionItems([])
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsMentionLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [mentionMatch?.query, mentionMatch?.mentionType])

  const handleAddTool = (tool: AiToolDefinition) => {
    if (!editor || !commandMatch) {
      return
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from: commandMatch.from, to: commandMatch.to })
      .insertContentAt(commandMatch.from, [
        {
          type: 'aiTool',
          attrs: {
            name: tool.name,
            category: tool.category,
          },
        },
        {
          type: 'text',
          text: ' ',
        },
      ])
      .run()
  }

  const handleSelectMentionCategory = (category: MentionCategory) => {
    if (!editor || !mentionMatch) {
      return
    }

    editor
      .chain()
      .focus()
      .deleteRange({ from: mentionMatch.from, to: mentionMatch.to })
      .insertContentAt(mentionMatch.from, `@${category.label} `)
      .run()
  }

  const handleSelectMention = (mention: AiMentionItem) => {
    if (!editor || !mentionMatch) {
      return
    }

    mentionCacheRef.current.set(`${mention.type}:${mention.id}`, mention)
    editor
      .chain()
      .focus()
      .deleteRange({ from: mentionMatch.from, to: mentionMatch.to })
      .insertContentAt(mentionMatch.from, [
        {
          type: 'aiMention',
          attrs: {
            id: mention.id,
            type: mention.type,
            title: mention.title,
          },
        },
        {
          type: 'text',
          text: ' ',
        },
      ])
      .run()
  }

  const handleSubmit = () => {
    if (!editor) {
      return
    }

    const text = getPlainText(editor).trim()
    if (!text || submitDisabled) {
      return
    }

    onSubmit({
      text,
      mentions: enableMentions ? getMentionTokens(editor, mentionCacheRef.current) : [],
      toolNames: enableTools ? getToolTokens(editor) : [],
      displayParts: getDisplayParts(editor, mentionCacheRef.current),
    })

    editor.commands.clearContent(true)
    editor.commands.focus('end')
    setPlainText('')
    setMentionItems([])
  }

  const handleRemoveTool = (toolName: string) => {
    if (!editor) {
      return
    }

    const ranges: Array<{ from: number; to: number }> = []

    editor.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'aiTool') {
        return true
      }
      const attrs = node.attrs as ComposerToolAttrs
      if (attrs.name !== toolName) {
        return true
      }
      ranges.push({ from: pos, to: pos + node.nodeSize })
      return true
    })

    if (ranges.length === 0) {
      return
    }

    const chain = editor.chain().focus()
    ranges.reverse().forEach((range) => {
      chain.deleteRange(range)
    })
    chain.run()
  }

  const hasContent = plainText.trim().length > 0
  const isSubmitting = submitStatus === 'submitted'
  const showActionButton = hasContent || isSubmitting

  return (
    <div className="relative mx-auto w-full max-w-[660px]">
      {enableTools && commandMatch ? (
        <div className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-20 rounded-2xl border bg-background p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <Wrench className="h-3.5 w-3.5" />
            `/工具`
          </div>
          <div className="space-y-1">
            {filteredTools.length > 0 ? filteredTools.map((tool, index) => (
              <button
                key={tool.name}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  handleAddTool(tool)
                }}
                className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/40 ${index === activeCommandIndex ? 'bg-muted/40' : ''}`}
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

      {enableMentions && mentionMatch ? (
        <div className="absolute inset-x-0 bottom-[calc(100%+0.75rem)] z-20 rounded-2xl border bg-background p-2 shadow-lg">
          <div className="mb-2 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            {mentionMatch.mentionType ? `@${MENTION_TYPE_TO_LABEL[mentionMatch.mentionType]} 搜索` : '@选择引用类型'}
          </div>
          <div className="space-y-1">
            {!mentionMatch.mentionType ? MENTION_CATEGORIES.map((category, index) => (
              <button
                key={category.type}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  handleSelectMentionCategory(category)
                }}
                className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/40 ${index === activeMentionCategoryIndex ? 'bg-muted/40' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{category.label}</div>
                  <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {category.description}
                  </div>
                </div>
                <Badge variant="outline" className="ml-3 shrink-0">@{category.label}</Badge>
              </button>
            )) : isMentionLoading ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">搜索中...</div>
            ) : !mentionMatch.query.trim() ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                继续输入关键词搜索{MENTION_TYPE_TO_LABEL[mentionMatch.mentionType]}。
              </div>
            ) : mentionItems.length > 0 ? mentionItems.map((item, index) => (
              <button
                key={`${item.type}-${item.id}`}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  handleSelectMention(item)
                }}
                className={`flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition hover:bg-muted/40 ${index === activeMentionIndex ? 'bg-muted/40' : ''}`}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.title}</div>
                  <div className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {item.subtitle || item.summary || (item.type === 'column' ? '栏目' : '内容')}
                  </div>
                </div>
                <Badge variant="outline" className="ml-3 shrink-0">{item.type === 'column' ? '栏目' : '信息'}</Badge>
              </button>
            )) : (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                没有匹配到{MENTION_TYPE_TO_LABEL[mentionMatch.mentionType]}。
              </div>
            )}
          </div>
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[32px] border bg-background shadow-sm transition focus-within:border-primary/40 focus-within:shadow-md">
        <div className="relative">
          <div className="ai-conversation-tiptap">
            <EditorContent editor={editor} />
          </div>
          {showActionButton ? (
            <button
              type="button"
              onClick={isSubmitting ? onStop : handleSubmit}
              className="absolute right-3 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={isSubmitting ? !onStop : submitDisabled || !hasContent}
              aria-label={isSubmitting ? '停止生成' : '发送消息'}
            >
              {isSubmitting ? <Square className="h-4 w-4 fill-current" /> : <ArrowUp className="h-4 w-4" />}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {enableTools ? selectedToolNames.map((toolName) => (
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
        )) : null}
      </div>
    </div>
  )
}
