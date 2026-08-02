import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import ImageUploadField from '@/components/ImageUploadField'
import { Button } from '@/components/ui/button'
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
  favicon_source_path: string
}

export default function SiteConfigPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['site-config', 'global'],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SiteConfig>>('/site-config')
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
    mutationFn: async () => {
      const response = await apiClient.put<ApiResponse<SiteConfig>>('/site-config', { base: formData })
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
    mutation.mutate()
  }

  return (
    <Card>
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
                onChange={(faviconSourcePath) => setFormData({ ...formData, favicon_source_path: faviconSourcePath })}
                purpose="site_icon"
                placeholder="上传至少 180x180 像素的正方形图片"
              />
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
                  placeholder="127.0.0.1"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="assets_port">监听端口</Label>
                <Input
                  id="assets_port"
                  value={formData.assets_port}
                  onChange={(event) => setFormData({ ...formData, assets_port: event.target.value })}
                  placeholder="1232"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="assets_public_base_url">对外访问域名</Label>
                <Input
                  id="assets_public_base_url"
                  value={formData.assets_public_base_url}
                  onChange={(event) => setFormData({ ...formData, assets_public_base_url: event.target.value })}
                  placeholder="https://assets.example.com"
                />
              </div>
            </div>
          </section>

          <div className="flex justify-end border-t pt-4">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中...' : '保存全站配置'}
            </Button>
          </div>
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
