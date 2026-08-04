import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Language, MediaAsset, MediaCategory } from '@/types'
import { toast } from 'sonner'

interface Props {
  asset: MediaAsset | null
  onOpenChange: (open: boolean) => void
  languages: Language[]
  categories: MediaCategory[]
}

export default function MediaAssetMetadataDialog({ asset, onOpenChange, languages, categories }: Props) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [code, setCode] = useState('')
  const [languageId, setLanguageId] = useState('none')
  const [categoryId, setCategoryId] = useState('')

  useEffect(() => {
    setTitle(asset?.pdf_title || '')
    setCode(asset?.pdf_document_code || '')
    setLanguageId(asset?.language_id ? String(asset.language_id) : 'none')
    setCategoryId(asset?.category_id ? String(asset.category_id) : '')
  }, [asset])

  const mutation = useMutation({
    mutationFn: () => mediaApi.updateMetadata(asset!.id, {
      pdf_title: title,
      pdf_document_code: code,
      language_id: languageId === 'none' ? null : Number(languageId),
      category_id: Number(categoryId),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      queryClient.invalidateQueries({ queryKey: ['attachment-field-pdfs'] })
      onOpenChange(false)
      toast.success('PDF 元数据已保存')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || '元数据保存失败'),
  })

  return (
    <Dialog open={Boolean(asset)} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>编辑 PDF 元数据</DialogTitle>
          <DialogDescription>{asset?.original_name || asset?.relative_path}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="pdf-metadata-title">公开名称</Label><Input id="pdf-metadata-title" value={title} onChange={(event) => setTitle(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="pdf-metadata-code">文档编号</Label><Input id="pdf-metadata-code" value={code} onChange={(event) => setCode(event.target.value)} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>分类</Label>
              <Select value={categoryId} onValueChange={(value) => value && setCategoryId(value)}><SelectTrigger><SelectValue placeholder="选择分类" /></SelectTrigger><SelectContent>{categories.filter((item) => item.is_enabled || item.id === asset?.category_id).map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div className="space-y-2">
              <Label>文件语言</Label>
              <Select value={languageId} onValueChange={(value) => value && setLanguageId(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">未设置</SelectItem>{languages.map((item) => <SelectItem key={item.id} value={String(item.id)}>{item.name || item.code} ({item.code})</SelectItem>)}</SelectContent></Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={mutation.isPending} onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" disabled={mutation.isPending || !categoryId} onClick={() => mutation.mutate()}>{mutation.isPending ? '保存中...' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
