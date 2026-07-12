import { useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, ExternalLink, FileText, Plus, Search, Trash2, Upload } from 'lucide-react'
import { mediaApi } from '@/api/media'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { resolveAssetUrl, resolveMediaAssetUrl } from '@/lib/assets'
import { toast } from 'sonner'

interface AttachmentsFieldProps {
  value: string[]
  onChange: (value: string[]) => void
  languageId?: number | null
  disabled?: boolean
}

export default function AttachmentsField({
  value,
  onChange,
  languageId,
  disabled = false,
}: AttachmentsFieldProps) {
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [selectorOpen, setSelectorOpen] = useState(false)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const normalizedValue = Array.isArray(value) ? value.filter(Boolean) : []

  const { data, isLoading } = useQuery({
    queryKey: ['attachment-field-pdfs', keyword],
    queryFn: () => mediaApi.list({
      page: 1,
      limit: 50,
      purpose: 'pdf_document',
      q: keyword || undefined,
      pdf_search: 1,
      language_id: languageId || undefined,
    }),
    enabled: selectorOpen,
  })

  const assets = data?.items || []

  const addPath = (path: string) => {
    const normalizedPath = String(path || '').trim()
    if (!normalizedPath || normalizedValue.includes(normalizedPath)) {
      return
    }
    onChange([...normalizedValue, normalizedPath])
  }

  const removeItem = (index: number) => {
    onChange(normalizedValue.filter((_, itemIndex) => itemIndex !== index))
  }

  const moveItem = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= normalizedValue.length) {
      return
    }
    const nextValue = [...normalizedValue]
    const [item] = nextValue.splice(index, 1)
    nextValue.splice(nextIndex, 0, item)
    onChange(nextValue)
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setIsUploading(true)
    try {
      const uploadedPaths: string[] = []
      for (const file of files) {
        const response = await mediaApi.upload(file, 'pdf_document', { languageId })
        uploadedPaths.push(response.data.relative_path)
      }
      onChange(Array.from(new Set([...normalizedValue, ...uploadedPaths])))
      toast.success(`已上传并选择 ${uploadedPaths.length} 个 PDF`)
    } catch (error: any) {
      toast.error(error.response?.data?.message || error.message || 'PDF 上传失败')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={uploadInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {normalizedValue.length ? (
        <div className="space-y-2">
          {normalizedValue.map((path, index) => (
            <div key={`${path}-${index}`} className="flex items-center gap-2 rounded-md border p-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{getFileName(path)}</div>
                <div className="truncate text-xs text-muted-foreground">{path}</div>
              </div>
              <Button type="button" size="icon-sm" variant="ghost" asChild title="打开附件">
                <a href={resolveAssetUrl(path)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => moveItem(index, -1)} disabled={disabled || index === 0} title="上移">
                <ArrowUp className="size-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="ghost" onClick={() => moveItem(index, 1)} disabled={disabled || index === normalizedValue.length - 1} title="下移">
                <ArrowDown className="size-4" />
              </Button>
              <Button type="button" size="icon-sm" variant="destructiveGhost" onClick={() => removeItem(index)} disabled={disabled} title="移除">
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-24 flex-col items-center justify-center gap-2 rounded-md border bg-muted/20 text-sm text-muted-foreground">
          <FileText className="size-5" />
          <span>暂无附件</span>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setSelectorOpen(true)} disabled={disabled}>
          <Plus className="size-4" />
          从 PDF 库选择
        </Button>
        <Button type="button" variant="outline" onClick={() => uploadInputRef.current?.click()} disabled={disabled || isUploading}>
          <Upload className="size-4" />
          {isUploading ? '上传中...' : '上传 PDF'}
        </Button>
      </div>

      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>选择 PDF 附件</DialogTitle>
            <DialogDescription>从 PDF 管理中的现有资源选择，字段只保存资源 URL。</DialogDescription>
          </DialogHeader>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              setKeyword(keywordInput.trim())
            }}
          >
            <Input value={keywordInput} onChange={(event) => setKeywordInput(event.target.value)} placeholder="搜索文件名、标题或文档编号" />
            <Button type="submit" variant="outline"><Search className="size-4" />搜索</Button>
          </form>
          <div className="max-h-[55vh] overflow-y-auto rounded-md border">
            {isLoading ? (
              <div className="p-8 text-center text-sm text-muted-foreground">加载中...</div>
            ) : assets.length ? assets.map((asset) => {
              const selected = normalizedValue.includes(asset.relative_path)
              return (
                <div key={asset.id} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                  <FileText className="size-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{asset.pdf_title || asset.original_name || getFileName(asset.relative_path)}</div>
                    <div className="truncate text-xs text-muted-foreground">{asset.pdf_document_code || asset.relative_path}</div>
                  </div>
                  <Button type="button" size="sm" variant={selected ? 'secondary' : 'outline'} disabled={selected} onClick={() => addPath(asset.relative_path)}>
                    {selected ? '已选择' : '选择'}
                  </Button>
                  <Button type="button" size="icon-sm" variant="ghost" asChild title="预览">
                    <a href={resolveMediaAssetUrl(asset)} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
                  </Button>
                </div>
              )
            }) : (
              <div className="p-8 text-center text-sm text-muted-foreground">没有匹配的 PDF</div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getFileName(path: string) {
  const cleanPath = String(path || '').split(/[?#]/, 1)[0]
  return decodeURIComponent(cleanPath.split('/').pop() || cleanPath)
}
