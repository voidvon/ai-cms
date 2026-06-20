import { useEffect, useRef, useState } from 'react'
import Quill from 'quill'
import 'quill/dist/quill.snow.css'
import { toast } from 'sonner'
import { mediaApi, type MediaPurpose } from '@/api/media'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  uploadPurpose?: MediaPurpose
  className?: string
  readOnly?: boolean
}

function normalizeEditorHtml(value: string) {
  const trimmed = value.trim()
  return trimmed === '<p><br></p>' ? '' : trimmed
}

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '请输入内容',
  uploadPurpose = 'richtext_image',
  className = '',
  readOnly = false,
}: RichTextEditorProps) {
  const mountRef = useRef<HTMLDivElement | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const quillRef = useRef<Quill | null>(null)
  const lastHtmlRef = useRef(normalizeEditorHtml(value))
  const onChangeRef = useRef(onChange)
  const isUploadingRef = useRef(false)
  const [isUploading, setIsUploading] = useState(false)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    isUploadingRef.current = isUploading
  }, [isUploading])

  useEffect(() => {
    if (!mountRef.current || quillRef.current) {
      return
    }

    // Quill 的 toolbar 和 editor DOM 会一起插入挂载容器中。
    // 这里统一托管整块 DOM，避免重复挂载时残留旧 toolbar。
    mountRef.current.innerHTML = ''
    const editorHost = document.createElement('div')
    mountRef.current.appendChild(editorHost)

    const quill = new Quill(editorHost, {
      theme: 'snow',
      readOnly,
      placeholder,
      modules: {
        toolbar: {
          container: [
            [{ header: [1, 2, 3, false] }],
            ['bold', 'italic', 'underline', 'strike'],
            [{ list: 'ordered' }, { list: 'bullet' }],
            [{ color: [] }, { background: [] }],
            ['link', 'image', 'blockquote', 'code-block'],
            ['clean'],
          ],
          handlers: {
            image: () => {
              if (isUploadingRef.current || readOnly) {
                return
              }
              fileInputRef.current?.click()
            },
          },
        },
      },
    })

    if (lastHtmlRef.current) {
      quill.clipboard.dangerouslyPasteHTML(lastHtmlRef.current)
    }

    quill.on('text-change', () => {
      const nextHtml = normalizeEditorHtml(quill.root.innerHTML)
      lastHtmlRef.current = nextHtml
      onChangeRef.current(nextHtml)
    })

    quillRef.current = quill

    return () => {
      quillRef.current = null
      if (mountRef.current) {
        mountRef.current.innerHTML = ''
      }
    }
  }, [placeholder, readOnly])

  useEffect(() => {
    quillRef.current?.enable(!readOnly)
  }, [readOnly])

  useEffect(() => {
    const quill = quillRef.current
    const normalizedValue = normalizeEditorHtml(value)

    if (!quill || normalizedValue === lastHtmlRef.current) {
      return
    }

    if (!normalizedValue) {
      quill.setText('')
    } else {
      quill.clipboard.dangerouslyPasteHTML(normalizedValue)
    }

    lastHtmlRef.current = normalizedValue
  }, [value])

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    event.target.value = ''

    if (!files || files.length === 0 || !quillRef.current) {
      return
    }

    setIsUploading(true)
    try {
      const quill = quillRef.current
      const range = quill.getSelection(true)
      let insertIndex = range?.index ?? quill.getLength()

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        try {
          const result = await mediaApi.upload(file, uploadPurpose)
          quill.insertEmbed(insertIndex, 'image', result.data.relative_path, 'user')
          insertIndex += 1
          // 在每张图片后插入换行，避免图片挤在一起
          if (i < files.length - 1) {
            quill.insertText(insertIndex, '\n', 'user')
            insertIndex += 1
          }
        } catch (error: any) {
          toast.error(`${file.name} 上传失败: ${error.response?.data?.message || error.message}`)
        }
      }

      quill.setSelection(insertIndex, 0, 'silent')
      toast.success(`已插入 ${files.length} 张图片`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || '图片上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className={`rich-text-editor ${className}`.trim()}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        disabled={readOnly}
        onChange={handleFileChange}
      />
      <div ref={mountRef} />
      {isUploading && (
        <div className="mt-2 text-xs text-muted-foreground">图片上传中，请稍候...</div>
      )}
    </div>
  )
}
