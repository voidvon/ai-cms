import { useEffect, useRef, useState } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { EditorView } from '@codemirror/view'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TextAlign } from '@tiptap/extension-text-align'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code,
  CodeXml,
  Columns3,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  ImagePlus,
  Italic,
  Link,
  List,
  ListChecks,
  ListOrdered,
  Palette,
  Pilcrow,
  Quote,
  Redo2,
  RemoveFormatting,
  Rows3,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { mediaApi, type MediaPurpose } from '@/api/media'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { resolveAssetUrl } from '@/lib/assets'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  uploadPurpose?: MediaPurpose
  className?: string
  fillAvailableHeight?: boolean
  readOnly?: boolean
}

type ToolbarButtonProps = {
  active?: boolean
  disabled?: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}

const colorOptions = [
  { label: '默认', value: '' },
  { label: '红色', value: '#dc2626' },
  { label: '橙色', value: '#ea580c' },
  { label: '绿色', value: '#16a34a' },
  { label: '蓝色', value: '#2563eb' },
  { label: '紫色', value: '#9333ea' },
]

const highlightOptions = [
  { label: '默认', value: '' },
  { label: '黄色', value: '#fef08a' },
  { label: '绿色', value: '#bbf7d0' },
  { label: '蓝色', value: '#bfdbfe' },
  { label: '粉色', value: '#fbcfe8' },
]

const sourceEditorExtensions = [EditorView.lineWrapping]

function normalizeEditorHtml(value: string) {
  const trimmed = value.trim()
  return trimmed === '<p></p>' || trimmed === '<p><br></p>' ? '' : trimmed
}

function normalizeEditorAssetDisplay(root: HTMLElement | null) {
  if (!root) {
    return
  }

  root.querySelectorAll<HTMLImageElement>('img[src]').forEach((image) => {
    const storedSrc = image.getAttribute('data-relative-src') || image.getAttribute('src') || ''
    const displaySrc = resolveAssetUrl(storedSrc)
    if (displaySrc && displaySrc !== storedSrc) {
      image.setAttribute('data-relative-src', storedSrc)
      image.setAttribute('src', displaySrc)
    }
  })
}

function readEditorStorageHtml(editor: NonNullable<ReturnType<typeof useEditor>>) {
  const root = editor.view.dom
  const restoredImages: Array<{ image: HTMLImageElement; displaySrc: string; storedSrc: string }> = []

  root.querySelectorAll<HTMLImageElement>('img[data-relative-src]').forEach((image) => {
    const storedSrc = image.getAttribute('data-relative-src') || ''
    const displaySrc = image.getAttribute('src') || ''
    if (storedSrc && displaySrc && storedSrc !== displaySrc) {
      image.setAttribute('src', storedSrc)
      restoredImages.push({ image, displaySrc, storedSrc })
    }
  })

  const html = normalizeEditorHtml(editor.getHTML())

  restoredImages.forEach(({ image, displaySrc, storedSrc }) => {
    image.setAttribute('src', displaySrc)
    image.setAttribute('data-relative-src', storedSrc)
  })

  return html
}

function ToolbarButton({ active, disabled, label, onClick, children }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon-sm"
      disabled={disabled}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '请输入内容',
  uploadPurpose = 'richtext_image',
  className = '',
  fillAvailableHeight = false,
  readOnly = false,
}: RichTextEditorProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const lastHtmlRef = useRef(normalizeEditorHtml(value))
  const onChangeRef = useRef(onChange)
  const { resolvedTheme } = useTheme()
  const [linkUrl, setLinkUrl] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isSourceMode, setIsSourceMode] = useState(false)
  const [sourceHtml, setSourceHtml] = useState(lastHtmlRef.current)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: false,
          enableClickSelection: true,
        },
      }),
      Placeholder.configure({ placeholder }),
      Highlight.configure({ multicolor: true }),
      Image.configure({ inline: false, allowBase64: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit.configure({
        table: {
          resizable: true,
          allowTableNodeSelection: true,
        },
      }),
    ],
    content: lastHtmlRef.current,
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
        'aria-label': '富文本内容编辑区',
      },
      handleDOMEvents: {
        click: (_view, event) => {
          if (event.button !== 0 || (!event.metaKey && !event.ctrlKey)) {
            return false
          }

          const target = event.target
          if (!(target instanceof Element)) {
            return false
          }

          const link = target.closest<HTMLAnchorElement>('a[href]')
          if (!link) {
            return false
          }

          event.preventDefault()
          window.open(link.href, '_blank', 'noopener,noreferrer')
          return true
        },
      },
    },
    onUpdate: ({ editor }) => {
      const nextHtml = readEditorStorageHtml(editor)
      lastHtmlRef.current = nextHtml
      onChangeRef.current(nextHtml)
      queueMicrotask(() => normalizeEditorAssetDisplay(editor.view.dom))
    },
  }, [placeholder])

  useEffect(() => {
    if (!editor) {
      return
    }
    normalizeEditorAssetDisplay(editor.view.dom)
  }, [editor])

  useEffect(() => {
    editor?.setEditable(!readOnly)
  }, [editor, readOnly])

  useEffect(() => {
    if (!editor) {
      return
    }

    const normalizedValue = normalizeEditorHtml(value)
    if (normalizedValue === lastHtmlRef.current) {
      return
    }

    setSourceHtml(normalizedValue)
    editor.commands.setContent(normalizedValue, { emitUpdate: false })
    lastHtmlRef.current = normalizedValue
    queueMicrotask(() => normalizeEditorAssetDisplay(editor.view.dom))
  }, [editor, value])

  const disabled = readOnly || !editor || isSourceMode

  const toggleSourceMode = () => {
    if (!editor) {
      return
    }

    if (!isSourceMode) {
      const currentHtml = readEditorStorageHtml(editor)
      setSourceHtml(currentHtml)
      setIsSourceMode(true)
      return
    }

    editor.commands.setContent(normalizeEditorHtml(sourceHtml), { emitUpdate: false })
    const normalizedHtml = readEditorStorageHtml(editor)
    setSourceHtml(normalizedHtml)
    lastHtmlRef.current = normalizedHtml
    onChangeRef.current(normalizedHtml)
    setIsSourceMode(false)
    queueMicrotask(() => normalizeEditorAssetDisplay(editor.view.dom))
  }

  const handleSourceChange = (nextHtml: string) => {
    setSourceHtml(nextHtml)
    const normalizedHtml = normalizeEditorHtml(nextHtml)
    lastHtmlRef.current = normalizedHtml
    onChangeRef.current(normalizedHtml)
  }

  const setHeading = (level: 1 | 2 | 3) => {
    editor?.chain().focus().toggleHeading({ level }).run()
  }

  const handleSetLink = () => {
    const normalizedUrl = linkUrl.trim()
    if (!editor) {
      return
    }

    if (!normalizedUrl) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }

    editor.chain().focus().extendMarkRange('link').setLink({ href: normalizedUrl }).run()
  }

  const handleUploadImages = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    event.target.value = ''

    if (!files || files.length === 0 || !editor) {
      return
    }

    setIsUploading(true)
    try {
      let successCount = 0
      for (const file of Array.from(files)) {
        try {
          const result = await mediaApi.upload(file, uploadPurpose)
          editor
            .chain()
            .focus()
            .setImage({ src: result.data.relative_path, alt: file.name.replace(/\.[^/.]+$/, '') })
            .run()
          successCount += 1
        } catch (error: any) {
          toast.error(`${file.name} 上传失败: ${error.response?.data?.message || error.message}`)
        }
      }
      if (successCount > 0) {
        toast.success(`已插入 ${successCount} 张图片`)
      }
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={cn('rich-text-editor', fillAvailableHeight && 'rich-text-editor-fill-height', className)}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={disabled || isUploading}
        onChange={handleUploadImages}
      />

      <div className="rich-text-editor-toolbar">
        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton
            active={isSourceMode}
            disabled={!editor}
            label={isSourceMode ? '返回富文本' : '查看源代码'}
            onClick={toggleSourceMode}
          >
            <CodeXml />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton disabled={disabled || !editor?.can().undo()} label="撤销" onClick={() => editor?.chain().focus().undo().run()}>
            <Undo2 />
          </ToolbarButton>
          <ToolbarButton disabled={disabled || !editor?.can().redo()} label="重做" onClick={() => editor?.chain().focus().redo().run()}>
            <Redo2 />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="sm" disabled={disabled} className="h-8 gap-1 px-2">
                {editor?.isActive('heading', { level: 1 }) ? <Heading1 /> : editor?.isActive('heading', { level: 2 }) ? <Heading2 /> : editor?.isActive('heading', { level: 3 }) ? <Heading3 /> : <Pilcrow />}
                <ChevronDown className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => editor?.chain().focus().setParagraph().run()}>
                <Pilcrow className="mr-2 size-4" /> 正文
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHeading(1)}>
                <Heading1 className="mr-2 size-4" /> 标题 1
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHeading(2)}>
                <Heading2 className="mr-2 size-4" /> 标题 2
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setHeading(3)}>
                <Heading3 className="mr-2 size-4" /> 标题 3
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <ToolbarButton active={editor?.isActive('bulletList')} disabled={disabled} label="无序列表" onClick={() => editor?.chain().focus().toggleBulletList().run()}>
            <List />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('orderedList')} disabled={disabled} label="有序列表" onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
            <ListOrdered />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('taskList')} disabled={disabled} label="任务列表" onClick={() => editor?.chain().focus().toggleTaskList().run()}>
            <ListChecks />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton active={editor?.isActive('bold')} disabled={disabled} label="加粗" onClick={() => editor?.chain().focus().toggleBold().run()}>
            <Bold />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('italic')} disabled={disabled} label="斜体" onClick={() => editor?.chain().focus().toggleItalic().run()}>
            <Italic />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('underline')} disabled={disabled} label="下划线" onClick={() => editor?.chain().focus().toggleUnderline().run()}>
            <Underline />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('strike')} disabled={disabled} label="删除线" onClick={() => editor?.chain().focus().toggleStrike().run()}>
            <Strikethrough />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('code')} disabled={disabled} label="行内代码" onClick={() => editor?.chain().focus().toggleCode().run()}>
            <Code />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label="文字颜色" title="文字颜色">
                <Palette />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {colorOptions.map((option) => (
                <DropdownMenuItem key={option.label} onClick={() => option.value ? editor?.chain().focus().setColor(option.value).run() : editor?.chain().focus().unsetColor().run()}>
                  <span className="mr-2 size-3 rounded-full border" style={{ backgroundColor: option.value || 'transparent' }} />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" disabled={disabled} aria-label="高亮" title="高亮">
                <Highlighter />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {highlightOptions.map((option) => (
                <DropdownMenuItem key={option.label} onClick={() => option.value ? editor?.chain().focus().toggleHighlight({ color: option.value }).run() : editor?.chain().focus().unsetHighlight().run()}>
                  <span className="mr-2 size-3 rounded-full border" style={{ backgroundColor: option.value || 'transparent' }} />
                  {option.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant={editor?.isActive('link') ? 'secondary' : 'ghost'}
                size="icon-sm"
                disabled={disabled}
                aria-label="链接"
                title="链接"
                onClick={() => setLinkUrl(editor?.getAttributes('link').href || '')}
              >
                <Link />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 space-y-3">
              <Input value={linkUrl} onChange={(event) => setLinkUrl(event.target.value)} placeholder="https://example.com" />
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => editor?.chain().focus().extendMarkRange('link').unsetLink().run()}>
                  移除
                </Button>
                <Button type="button" size="sm" onClick={handleSetLink}>
                  应用
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton active={editor?.isActive({ textAlign: 'left' })} disabled={disabled} label="左对齐" onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
            <AlignLeft />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: 'center' })} disabled={disabled} label="居中" onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
            <AlignCenter />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: 'right' })} disabled={disabled} label="右对齐" onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
            <AlignRight />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive({ textAlign: 'justify' })} disabled={disabled} label="两端对齐" onClick={() => editor?.chain().focus().setTextAlign('justify').run()}>
            <AlignJustify />
          </ToolbarButton>
        </div>

        <div className="rich-text-editor-toolbar-group">
          <ToolbarButton active={editor?.isActive('blockquote')} disabled={disabled} label="引用" onClick={() => editor?.chain().focus().toggleBlockquote().run()}>
            <Quote />
          </ToolbarButton>
          <ToolbarButton active={editor?.isActive('codeBlock')} disabled={disabled} label="代码块" onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>
            <Code />
          </ToolbarButton>
          <ToolbarButton disabled={disabled || isUploading} label="插入图片" onClick={() => fileInputRef.current?.click()}>
            <ImagePlus />
          </ToolbarButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant={editor?.isActive('table') ? 'secondary' : 'ghost'}
                size="icon-sm"
                disabled={disabled}
                aria-label="表格"
                title="表格"
              >
                <Table2 />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                <Table2 className="mr-2 size-4" /> 插入 3 x 3 表格
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addRowAfter().run()}>
                <Rows3 className="mr-2 size-4" /> 在下方添加行
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().deleteRow().run()}>
                <Rows3 className="mr-2 size-4" /> 删除当前行
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().addColumnAfter().run()}>
                <Columns3 className="mr-2 size-4" /> 在右侧添加列
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().deleteColumn().run()}>
                <Columns3 className="mr-2 size-4" /> 删除当前列
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!editor?.isActive('table')} onClick={() => editor?.chain().focus().deleteTable().run()}>
                <Trash2 className="mr-2 size-4" /> 删除表格
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolbarButton disabled={disabled} label="清除格式" onClick={() => editor?.chain().focus().unsetAllMarks().clearNodes().run()}>
            <RemoveFormatting />
          </ToolbarButton>
        </div>
      </div>

      {isSourceMode ? (
        <div className="rich-text-editor-body rich-text-editor-source">
          <CodeMirror
            value={sourceHtml}
            height={fillAvailableHeight ? '100%' : '360px'}
            theme={resolvedTheme === 'dark' ? 'dark' : 'light'}
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: true,
              bracketMatching: true,
              closeBrackets: !readOnly,
              autocompletion: !readOnly,
              searchKeymap: true,
            }}
            extensions={sourceEditorExtensions}
            editable={!readOnly}
            onChange={handleSourceChange}
          />
        </div>
      ) : (
        <EditorContent editor={editor} className="rich-text-editor-body" />
      )}
      {isUploading ? <div className="px-3 pb-3 text-xs text-muted-foreground">图片上传中，请稍候...</div> : null}
    </div>
  )
}
