import { useEffect, useMemo, useRef, useState } from 'react'
import { Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import { documentWorkspacesApi } from '@/api/document-workspaces'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveAssetUrl } from '@/lib/assets'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'
import type { DocumentStamp } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  stamps: DocumentStamp[]
}

type FormState = {
  id: number | null
  name: string
  image_asset_id: number | null
  image_path: string
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  image_asset_id: null,
  image_path: '',
}

export function DocumentStampManagerDialog({ open, onOpenChange, stamps }: Props) {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM)
    }
  }, [open])

  const selectedStamp = useMemo(
    () => stamps.find((item) => item.id === form.id) || null,
    [stamps, form.id]
  )

  const formImagePreviewUrl = useMemo(() => {
    if (!form.image_path) {
      return ''
    }
    if (selectedStamp?.image_path === form.image_path && selectedStamp.image_public_url) {
      return selectedStamp.image_public_url
    }
    return resolveAssetUrl(form.image_path)
  }, [form.image_path, selectedStamp])

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => mediaApi.upload(file, 'document_stamp'),
    onSuccess: (response) => {
      setForm((current) => ({
        ...current,
        image_asset_id: response.data?.id || null,
        image_path: response.data?.relative_path || '',
      }))
      toast.success('印章图片上传成功')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '印章图片上传失败')
    },
  })

  const createMutation = useMutation({
    mutationFn: async () => documentWorkspacesApi.createStamp({
      name: form.name,
      image_asset_id: form.image_asset_id,
      image_path: form.image_path,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-stamps'] })
      setForm(EMPTY_FORM)
      toast.success('印章已新增')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '新增印章失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async () => documentWorkspacesApi.updateStamp(Number(form.id), {
      name: form.name,
      image_asset_id: form.image_asset_id,
      image_path: form.image_path,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-stamps'] })
      toast.success('印章已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新印章失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => documentWorkspacesApi.deleteStamp(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['document-stamps'] })
      if (form.id === id) {
        setForm(EMPTY_FORM)
      }
      toast.success('印章已删除')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '删除印章失败')
    },
  })

  const handleSelectFile = () => {
    if (!uploadMutation.isPending) {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    uploadMutation.mutate(file)
  }

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('请输入印章名称')
      return
    }
    if (!form.image_path.trim()) {
      toast.error('请先上传印章图片')
      return
    }

    if (form.id) {
      await updateMutation.mutateAsync()
      return
    }
    await createMutation.mutateAsync()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>印章管理</DialogTitle>
          <DialogDescription>上传透明背景图片作为印章，可在报价单和销售合同预览中拖拽与旋转。</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium">已有印章</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(EMPTY_FORM)}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>
            <ScrollArea className="h-[420px] overflow-x-hidden">
              <div className="space-y-2 p-3">
                {stamps.map((stamp) => (
                  <button
                    key={stamp.id}
                    type="button"
                    onClick={() => setForm({
                      id: stamp.id,
                      name: stamp.name,
                      image_asset_id: stamp.image_asset_id || null,
                      image_path: stamp.image_path,
                    })}
                    className={`grid w-full grid-cols-[48px_minmax(0,1fr)_16px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition hover:border-primary/40 ${
                      selectedStamp?.id === stamp.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded border bg-white">
                      {stamp.image_path ? <img src={stamp.image_public_url || stamp.image_path} alt={stamp.name} className="max-h-full max-w-full object-contain" /> : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{stamp.name}</div>
                      <div className="truncate text-xs text-muted-foreground">{stamp.image_path}</div>
                    </div>
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                ))}
                {stamps.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    还没有印章，先新建一个。
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            <div className="grid gap-2">
              <Label htmlFor="stamp-name">印章名称</Label>
              <Input
                id="stamp-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：销售专用章"
              />
            </div>

            <div className="grid gap-2">
              <Label>印章图片</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={handleSelectFile} disabled={uploadMutation.isPending}>
                  <Upload className="size-4" />
                  {uploadMutation.isPending ? '上传中...' : '上传透明图片'}
                </Button>
                <div className="text-sm text-muted-foreground">建议使用透明 PNG</div>
              </div>
              <Input
                value={form.image_path}
                onChange={(event) => setForm((current) => ({ ...current, image_path: event.target.value }))}
                placeholder="/uploads/images/..."
              />
              <div className="flex min-h-[240px] items-center justify-center rounded-xl border bg-muted/10 p-4">
                {formImagePreviewUrl ? (
                  <img src={formImagePreviewUrl} alt={form.name || 'stamp'} className="max-h-[220px] max-w-full object-contain" />
                ) : (
                  <div className="text-sm text-muted-foreground">上传后在这里预览</div>
                )}
              </div>
            </div>

            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {form.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(Number(form.id))}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={createMutation.isPending || updateMutation.isPending || uploadMutation.isPending}
              >
                {form.id ? '保存修改' : '新增印章'}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
