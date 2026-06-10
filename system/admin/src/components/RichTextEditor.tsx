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
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null)
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
    if (!editorRef.current || quillRef.current) {
      return
    }

    const quill = new Quill(editorRef.current, {
      theme: 'snow',
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
              if (isUploadingRef.current) {
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
    }
  }, [placeholder])

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
    const file = event.target.files?.[0]
    event.target.value = ''

    if (!file || !quillRef.current) {
      return
    }

    setIsUploading(true)
    try {
      const result = await mediaApi.upload(file, uploadPurpose)
      const quill = quillRef.current
      const range = quill.getSelection(true)
      const insertIndex = range?.index ?? quill.getLength()

      quill.insertEmbed(insertIndex, 'image', result.data.relative_path, 'user')
      quill.setSelection(insertIndex + 1, 0, 'silent')
      toast.success('图片已插入')
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
        className="hidden"
        onChange={handleFileChange}
      />
      <div ref={editorRef} />
      {isUploading && (
        <div className="mt-2 text-xs text-muted-foreground">图片上传中...</div>
      )}
    </div>
  )
}
