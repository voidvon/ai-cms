import { useEffect, useMemo, useState } from 'react'
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

const DEFAULT_BIND_HOST = '127.0.0.1'

export default function LanguageFormDialog({ open, onOpenChange, language, mode }: LanguageFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState(createEmptyFormData())

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
          site_mode: language.site?.site_mode || 'subdir',
          access_port: language.site?.access_port ? String(language.site.access_port) : '',
          bind_host: language.site?.bind_host || DEFAULT_BIND_HOST,
          is_primary: language.site?.is_primary || 1,
        },
      })
      return
    }

    setFormData(createEmptyFormData(mode))
  }, [language, mode, open])

  const derivedOutputDir = useMemo(
    () => deriveOutputDir(formData.code, formData.site.site_mode, formData.site.path_prefix),
    [formData.code, formData.site.path_prefix, formData.site.site_mode]
  )

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...formData,
        site: {
          ...formData.site,
          output_dir: derivedOutputDir,
          access_port: formData.site.site_mode === 'standalone'
            ? Number.parseInt(formData.site.access_port || '', 10) || null
            : null,
        },
      }

      if (mode === 'create') {
        return languagesApi.create(payload)
      }
      return languagesApi.update(language!.id, payload)
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
    if (formData.site.site_mode === 'standalone') {
      if (formData.is_default === 1) {
        toast.error('默认语言不能配置为独立站点')
        return
      }
      if (!formData.site.host.trim()) {
        toast.error('独立站点必须填写正式域名')
        return
      }
      if (!formData.site.access_port.trim()) {
        toast.error('独立站点必须填写访问端口')
        return
      }
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增语言' : '编辑语言'}</DialogTitle>
          <DialogDescription>配置语言标识、多站点模式和发布目录。</DialogDescription>
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
            <div className="font-medium">站点部署</div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>站点模式</Label>
                <Select
                  value={formData.site.site_mode}
                  onValueChange={(value: 'subdir' | 'standalone') => {
                    setFormData({
                      ...formData,
                      site: {
                        ...formData.site,
                        site_mode: value,
                        path_prefix: value === 'standalone' ? '/' : formData.site.path_prefix || '/',
                        access_port: value === 'standalone' ? formData.site.access_port : '',
                        bind_host: value === 'standalone' ? (formData.site.bind_host || DEFAULT_BIND_HOST) : DEFAULT_BIND_HOST,
                      },
                    })
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subdir">子目录站点</SelectItem>
                    <SelectItem value="standalone">独立站点</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="host">{formData.site.site_mode === 'standalone' ? '独立域名 *' : '独立域名'}</Label>
                <Input
                  id="host"
                  required={formData.site.site_mode === 'standalone'}
                  value={formData.site.host}
                  onChange={(e) => setFormData({ ...formData, site: { ...formData.site, host: e.target.value } })}
                  placeholder={formData.site.site_mode === 'standalone' ? 'ru.example.com' : '可留空'}
                />
                {formData.site.site_mode === 'standalone' ? (
                  <div className="text-xs text-muted-foreground">
                    独立站点必须填写正式访问域名，`sitemap`、`robots`、`llms`、canonical 会基于这个域名生成。
                  </div>
                ) : null}
              </div>
            </div>

            {formData.site.site_mode === 'subdir' ? (
              <div className="space-y-2">
                <Label htmlFor="path_prefix">子目录前缀</Label>
                <Input
                  id="path_prefix"
                  value={formData.site.path_prefix}
                  onChange={(e) => setFormData({ ...formData, site: { ...formData.site, path_prefix: e.target.value } })}
                  placeholder="/ru"
                />
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="access_port">访问端口 *</Label>
                  <Input
                    id="access_port"
                    type="number"
                    required={formData.site.site_mode === 'standalone'}
                    value={formData.site.access_port}
                    onChange={(e) => setFormData({ ...formData, site: { ...formData.site, access_port: e.target.value } })}
                    placeholder="例如 1233"
                  />
                  <div className="text-xs text-muted-foreground">
                    独立站点必须填写访问端口，保存后会自动启动该站点监听。
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bind_host">监听地址</Label>
                  <Input
                    id="bind_host"
                    value={formData.site.bind_host}
                    onChange={(e) => setFormData({ ...formData, site: { ...formData.site, bind_host: e.target.value } })}
                    placeholder={DEFAULT_BIND_HOST}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="output_dir">输出目录</Label>
              <Input
                id="output_dir"
                value={derivedOutputDir}
                readOnly
              />
              <div className="text-xs text-muted-foreground">
                输出目录按站点模式自动生成，避免路径冲突。
              </div>
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

function createEmptyFormData(mode: 'create' | 'edit' = 'create') {
  const defaultSiteMode = mode === 'create' ? 'standalone' : 'subdir'

  return {
    code: '',
    name: '',
    native_name: '',
    is_default: 0,
    is_enabled: 1,
    sort_order: 0,
    site: {
      host: '',
      path_prefix: defaultSiteMode === 'standalone' ? '/' : '/',
      output_dir: 'html',
      site_mode: defaultSiteMode as 'subdir' | 'standalone',
      access_port: '',
      bind_host: DEFAULT_BIND_HOST,
      is_primary: 1,
    },
  }
}

function deriveOutputDir(code: string, siteMode: 'subdir' | 'standalone', pathPrefix: string) {
  if (siteMode === 'standalone') {
    const normalizedCode = String(code || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
    return `html_${normalizedCode || 'site'}`
  }

  const normalizedPrefix = String(pathPrefix || '').trim()
  if (!normalizedPrefix || normalizedPrefix === '/') {
    return 'html'
  }

  const withSlash = normalizedPrefix.startsWith('/') ? normalizedPrefix : `/${normalizedPrefix}`
  return `html${withSlash.replace(/\/+$/, '')}`
}
