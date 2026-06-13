import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Language } from '@/types'

interface LanguageFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  language?: Language
  mode: 'create' | 'edit'
}

export default function LanguageFormDialog({ open, onOpenChange, language, mode }: LanguageFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    native_name: '',
    is_default: 0,
    is_enabled: 1,
    sort_order: 0,
    site: {
      host: '',
      path_prefix: '/',
      output_dir: 'html',
      is_primary: 1,
    },
  })

  useEffect(() => {
    if (language && mode === 'edit') {
      setFormData({
        code: language.code || '',
        name: language.name || '',
        native_name: language.native_name || '',
        is_default: language.is_default || 0,
        is_enabled: language.is_enabled || 1,
        sort_order: language.sort_order || 0,
        site: {
          host: language.site?.host || '',
          path_prefix: language.site?.path_prefix || '/',
          output_dir: language.site?.output_dir || 'html',
          is_primary: language.site?.is_primary || 1,
        },
      })
      return
    }

    setFormData({
      code: '',
      name: '',
      native_name: '',
      is_default: 0,
      is_enabled: 1,
      sort_order: 0,
      site: {
        host: '',
        path_prefix: '/',
        output_dir: 'html',
        is_primary: 1,
      },
    })
  }, [language, mode, open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return languagesApi.create(formData)
      }
      return languagesApi.update(language!.id, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] })
      toast.success(mode === 'create' ? '语言已创建' : '语言已更新')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '保存失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.code.trim()) {
      toast.error('请输入语言代码')
      return
    }
    if (!formData.name.trim()) {
      toast.error('请输入语言名称')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增语言' : '编辑语言'}</DialogTitle>
          <DialogDescription>配置语言标识和部署路径。</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="code">语言代码</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="zh-CN / en / ru"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">语言名称</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="简体中文"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="native_name">本地名称</Label>
              <Input
                id="native_name"
                value={formData.native_name}
                onChange={(e) => setFormData({ ...formData, native_name: e.target.value })}
                placeholder="English"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">排序</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: Number.parseInt(e.target.value || '0', 10) || 0 })}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>默认语言</Label>
              <Select
                value={String(formData.is_default)}
                onValueChange={(value) => setFormData({ ...formData, is_default: Number.parseInt(value, 10) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">是</SelectItem>
                  <SelectItem value="0">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>启用状态</Label>
              <Select
                value={String(formData.is_enabled)}
                onValueChange={(value) => setFormData({ ...formData, is_enabled: Number.parseInt(value, 10) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">启用</SelectItem>
                  <SelectItem value="0">停用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded border p-4 space-y-4">
            <div className="font-medium">部署配置</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="host">独立域名</Label>
                <Input
                  id="host"
                  value={formData.site.host}
                  onChange={(e) => setFormData({ ...formData, site: { ...formData.site, host: e.target.value } })}
                  placeholder="en.example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="path_prefix">子目录前缀</Label>
                <Input
                  id="path_prefix"
                  value={formData.site.path_prefix}
                  onChange={(e) => setFormData({ ...formData, site: { ...formData.site, path_prefix: e.target.value } })}
                  placeholder="/en"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="output_dir">输出目录</Label>
              <Input
                id="output_dir"
                value={formData.site.output_dir}
                onChange={(e) => setFormData({ ...formData, site: { ...formData.site, output_dir: e.target.value } })}
                placeholder="html/en"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
