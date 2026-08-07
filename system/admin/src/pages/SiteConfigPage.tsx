import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import ImageUploadField from '@/components/ImageUploadField'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import type { ApiResponse, SiteConfig } from '@/types'

type SiteConfigBaseForm = {
  icp_number: string
  assets_bind_host: string
  assets_port: string
  assets_public_base_url: string
  turnstile_site_key: string
  turnstile_secret_key: string
  favicon_source_path: string
}

export default function SiteConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['site-config', 'global'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SiteConfig>>('/site-config?include_secrets=1')
      return response.data
    },
  })

  if (isLoading || !data?.data) {
    return <div>加载中...</div>
  }

  return <GlobalSiteConfigForm key={data.data.base_web_url || 'global'} config={data.data} />
}

function GlobalSiteConfigForm({ config }: { config: SiteConfig }) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<SiteConfigBaseForm>(() => createBaseData(config))

  const mutation = useMutation({
    mutationFn: async (nextFormData: SiteConfigBaseForm) => {
      const response = await apiClient.put<ApiResponse<SiteConfig>>('/site-config', { base: nextFormData })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      toast.success('全站配置已保存')
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, '保存失败'))
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    mutation.mutate(formData)
  }

  const saveOnBlur = () => mutation.mutate(formData)

  return (
    <Card className="min-h-max">
      <CardHeader>
        <CardTitle>全站配置</CardTitle>
        <CardDescription>维护所有语言站点共用的备案、图标和资源服务。</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-8">
          <section className="space-y-4">
            <div>
              <h3 className="font-medium">基础信息</h3>
              <p className="text-sm text-muted-foreground">语言名称、公司资料和联系方式请前往多语言管理。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="icp_number">ICP备案号</Label>
                <Input
                  id="icp_number"
                  value={formData.icp_number}
                  onChange={(event) => setFormData({ ...formData, icp_number: event.target.value })}
                  onBlur={saveOnBlur}
                  placeholder="请输入ICP备案号"
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h3 className="font-medium">站点图标</h3>
              <p className="text-sm text-muted-foreground">保存时自动生成浏览器和 Apple 设备所需图标。</p>
            </div>
            <div className="max-w-xl space-y-2">
              <Label htmlFor="favicon_source_path">图标源图</Label>
              <ImageUploadField
                id="favicon_source_path"
                value={formData.favicon_source_path}
                onChange={(faviconSourcePath) => {
                  const next = { ...formData, favicon_source_path: faviconSourcePath }
                  setFormData(next)
                  mutation.mutate(next)
                }}
                purpose="site_icon"
                placeholder="上传至少 180x180 像素的正方形图片"
              />
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h3 className="font-medium">Cloudflare Turnstile</h3>
              <p className="text-sm text-muted-foreground">用于非中文联系页询价表单的人机验证。</p>
            </div>
            <div className="max-w-xl space-y-2">
              <Label htmlFor="turnstile_site_key">Site Key</Label>
              <Input id="turnstile_site_key" value={formData.turnstile_site_key} onChange={(event) => setFormData({ ...formData, turnstile_site_key: event.target.value })} onBlur={saveOnBlur} placeholder="0x4AAAAAAA..." />
              <Label htmlFor="turnstile_secret_key">Secret Key</Label>
              <Input id="turnstile_secret_key" type="password" value={formData.turnstile_secret_key} onChange={(event) => setFormData({ ...formData, turnstile_secret_key: event.target.value })} onBlur={saveOnBlur} placeholder="请输入 Secret Key" />
            </div>
          </section>

          <section className="space-y-4 border-t pt-6">
            <div>
              <h3 className="font-medium">共享资源服务</h3>
              <p className="text-sm text-muted-foreground">多个语言站点共用上传资源服务。</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="assets_bind_host">监听地址</Label>
                <Input
                  id="assets_bind_host"
                  value={formData.assets_bind_host}
                  onChange={(event) => setFormData({ ...formData, assets_bind_host: event.target.value })}
                  onBlur={saveOnBlur}
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assets_port">监听端口</Label>
                <Input
                  id="assets_port"
                  value={formData.assets_port}
                  onChange={(event) => setFormData({ ...formData, assets_port: event.target.value })}
                  onBlur={saveOnBlur}
                  placeholder="1232"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="assets_public_base_url">对外访问域名</Label>
                <Input
                  id="assets_public_base_url"
                  value={formData.assets_public_base_url}
                  onChange={(event) => setFormData({ ...formData, assets_public_base_url: event.target.value })}
                  onBlur={saveOnBlur}
                  placeholder="https://assets.example.com"
                />
              </div>
            </div>
          </section>

        </form>
      </CardContent>
    </Card>
  )
}

function createBaseData(config: SiteConfig): SiteConfigBaseForm {
  return {
    icp_number: config.icp_number || '',
    assets_bind_host: config.assets_bind_host || '',
    assets_port: config.assets_port ? String(config.assets_port) : '',
    assets_public_base_url: config.assets_public_base_url || '',
    turnstile_site_key: config.turnstile_site_key || '',
    turnstile_secret_key: config.turnstile_secret_key || '',
    favicon_source_path: config.favicon_source_path || '',
  }
}

function resolveApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback
  }
  const response = (error as { response?: { data?: { message?: unknown } } }).response
  return typeof response?.data?.message === 'string' ? response.data.message : fallback
}
