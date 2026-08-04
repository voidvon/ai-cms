import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { mediaCategoriesApi } from '@/api/media'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import type { Language, MediaCategory } from '@/types'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  languages: Language[]
}

const EMPTY_FORM = { code: '', sort_order: 0, is_enabled: true, translations: {} as Record<string, string> }

export default function MediaCategoryManagerDialog({ open, onOpenChange, languages }: Props) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<MediaCategory | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState<MediaCategory | null>(null)
  const { data, isLoading } = useQuery({
    queryKey: ['media-categories'],
    queryFn: () => mediaCategoriesApi.list(),
    enabled: open,
  })
  const categories = data?.data || []

  useEffect(() => {
    if (!open) {
      setEditing(null)
      setForm(EMPTY_FORM)
    }
  }, [open])

  const saveMutation = useMutation({
    mutationFn: () => editing
      ? mediaCategoriesApi.update(editing.id, form)
      : mediaCategoriesApi.create(form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-categories'] })
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setEditing(null)
      setForm(EMPTY_FORM)
      toast.success('分类已保存')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || '分类保存失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (category: MediaCategory) => mediaCategoriesApi.delete(category.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-categories'] })
      setDeleteTarget(null)
      toast.success('分类已删除')
    },
    onError: (error: any) => toast.error(error.response?.data?.message || error.message || '分类删除失败'),
  })

  const startEdit = (category?: MediaCategory) => {
    setEditing(category || null)
    setForm(category ? {
      code: category.code,
      sort_order: category.sort_order,
      is_enabled: Boolean(category.is_enabled),
      translations: { ...category.translations },
    } : { ...EMPTY_FORM, translations: {} })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>PDF 分类管理</DialogTitle>
          <DialogDescription>分类名称用于公开下载分组；缺少当前语言名称时自动回退英文。</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="max-h-[58vh] overflow-y-auto rounded-md border">
            <div className="flex items-center justify-between border-b p-3">
              <span className="text-sm font-medium">现有分类</span>
              <Button type="button" size="sm" variant="outline" onClick={() => startEdit()}>
                <Plus className="size-4" />新增
              </Button>
            </div>
            {isLoading ? <div className="p-6 text-center text-sm text-muted-foreground">加载中...</div> : categories.map((category) => (
              <div key={category.id} className="flex items-center gap-3 border-b p-3 last:border-b-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{category.name}</div>
                  <div className="text-xs text-muted-foreground">{category.code} · 排序 {category.sort_order} · {category.is_enabled ? '启用' : '停用'}</div>
                </div>
                <Button type="button" size="icon-sm" variant="ghost" title="编辑" onClick={() => startEdit(category)}><Pencil className="size-4" /></Button>
                <Button type="button" size="icon-sm" variant="destructive" title="删除" disabled={deleteMutation.isPending} onClick={() => setDeleteTarget(category)}><Trash2 className="size-4" /></Button>
              </div>
            ))}
          </div>
          <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
            <div className="space-y-2">
              <Label htmlFor="media-category-code">分类编码</Label>
              <Input id="media-category-code" value={form.code} placeholder="例如 product_catalogue" onChange={(event) => setForm((value) => ({ ...value, code: event.target.value }))} />
            </div>
            <div className="grid grid-cols-[1fr_auto] items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="media-category-sort">排序</Label>
                <Input id="media-category-sort" type="number" value={form.sort_order} onChange={(event) => setForm((value) => ({ ...value, sort_order: Number(event.target.value) || 0 }))} />
              </div>
              <label className="flex h-9 items-center gap-2 text-sm"><Switch checked={form.is_enabled} onCheckedChange={(checked) => setForm((value) => ({ ...value, is_enabled: checked }))} />启用</label>
            </div>
            {languages.map((language) => (
              <div key={language.id} className="space-y-2">
                <Label htmlFor={`media-category-${language.code}`}>{language.name || language.code} ({language.code})</Label>
                <Input id={`media-category-${language.code}`} value={form.translations[language.code] || ''} onChange={(event) => setForm((value) => ({ ...value, translations: { ...value.translations, [language.code]: event.target.value } }))} />
              </div>
            ))}
            <Button type="button" className="w-full" disabled={saveMutation.isPending || !form.code.trim()} onClick={() => saveMutation.mutate()}>
              {saveMutation.isPending ? '保存中...' : editing ? '保存修改' : '创建分类'}
            </Button>
          </div>
        </div>
        <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button></DialogFooter>
      </DialogContent>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(nextOpen) => !nextOpen && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除 PDF 分类</AlertDialogTitle><AlertDialogDescription>使用中的分类不能删除。此操作会删除“{deleteTarget?.name}”及其全部语言名称。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel><AlertDialogAction disabled={deleteMutation.isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(event) => { event.preventDefault(); if (deleteTarget) deleteMutation.mutate(deleteTarget) }}>{deleteMutation.isPending ? '删除中...' : '删除'}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  )
}
