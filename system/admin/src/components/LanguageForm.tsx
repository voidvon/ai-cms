import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import apiClient from '@/api/client'
import SiteConfigLanguageFields from '@/components/SiteConfigLanguageFields'
import { createEmptySiteConfigTranslation } from '@/lib/site-config-translations'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { ApiResponse, Language, SiteConfig, SiteConfigTranslation } from '@/types'

interface LanguageFormProps {
  language?: Language
  mode: 'create' | 'edit'
  siteConfigTranslations: Record<string, SiteConfigTranslation>
  fallbackLanguageCode: string
  fallbackLanguageName: string
  onCancel?: () => void
  onSaved?: (language: Language) => void
}

const DEFAULT_BIND_HOST = '127.0.0.1'

export default function LanguageForm({
  language,
  mode,
  siteConfigTranslations,
  fallbackLanguageCode,
  fallbackLanguageName,
  onCancel,
  onSaved,
}: LanguageFormProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState(() => createFormData(language, mode))
  const [siteTranslation, setSiteTranslation] = useState(() => createEmptySiteConfigTranslation(
    language ? siteConfigTranslations[language.code] || {} : {}
  ))

  const derivedOutputDir = useMemo(
    () => deriveOutputDir(formData.code, formData.site.site_mode, formData.site.path_prefix, formData.site.output_dir),
    [formData.code, formData.site.output_dir, formData.site.path_prefix, formData.site.site_mode]
  )
  const isRootStandaloneSite = formData.site.site_mode === 'standalone' && derivedOutputDir === 'html'

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

      const result = mode === 'create'
        ? await languagesApi.create(payload)
        : await languagesApi.update(language!.id, payload)
      const savedLanguage = result.data
      if (savedLanguage) {
        await apiClient.put<ApiResponse<SiteConfig>>('/site-config', {
          translations: {
            ...siteConfigTranslations,
            [savedLanguage.code]: siteTranslation,
          },
        })
      }
      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['languages'] })
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      toast.success(mode === 'create' ? '语言已创建' : '语言已更新')
      if (result.data) {
        onSaved?.(result.data)
      }
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, '保存失败'))
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!formData.code.trim()) {
      toast.error('请输入语言代码')
      return
    }
    if (!formData.name.trim()) {
      toast.error('请输入语言名称')
      return
    }
    if (formData.is_fallback === 1 && !String(siteTranslation.web_name || '').trim()) {
      toast.error('请输入兜底语言的网站名称')
      return
    }
    if (formData.site.site_mode === 'standalone' && !isRootStandaloneSite) {
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
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="language_code">语言代码</Label>
          <Input
            id="language_code"
            value={formData.code}
            onChange={(event) => setFormData({ ...formData, code: event.target.value })}
            placeholder="zh-CN / en / ru"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language_name">语言名称</Label>
          <Input
            id="language_name"
            value={formData.name}
            onChange={(event) => setFormData({ ...formData, name: event.target.value })}
            placeholder="简体中文"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language_native_name">本地名称</Label>
          <Input
            id="language_native_name"
            value={formData.native_name}
            onChange={(event) => setFormData({ ...formData, native_name: event.target.value })}
            placeholder="English"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="language_sort_order">排序</Label>
          <Input
            id="language_sort_order"
            type="number"
            value={formData.sort_order}
            onChange={(event) => setFormData({ ...formData, sort_order: Number.parseInt(event.target.value || '0', 10) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label>后台管理语言</Label>
          <Select
            value={String(formData.is_default)}
            onValueChange={(value) => setFormData({ ...formData, is_default: Number.parseInt(value, 10) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">是</SelectItem>
              <SelectItem value="0">否</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">后台管理中的默认显示与内容编辑语言。</p>
        </div>
        <div className="space-y-2">
          <Label>多语言兜底语言</Label>
          <Select
            value={String(formData.is_fallback)}
            onValueChange={(value) => setFormData({ ...formData, is_fallback: Number.parseInt(value, 10) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">是</SelectItem>
              <SelectItem value="0">否</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">其他语言缺少网站名称、公司文案或 SEO 配置时，逐字段使用该语言的数据。</p>
        </div>
        <div className="space-y-2">
          <Label>启用状态</Label>
          <Select
            value={String(formData.is_enabled)}
            onValueChange={(value) => setFormData({ ...formData, is_enabled: Number.parseInt(value, 10) })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">启用</SelectItem>
              <SelectItem value="0">停用</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="space-y-4 border-t pt-6">
        <div>
          <h3 className="font-medium">站点部署</h3>
          <p className="text-sm text-muted-foreground">配置该语言站点的访问方式和静态发布目录。</p>
        </div>
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
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subdir">子目录站点</SelectItem>
                <SelectItem value="standalone">独立站点</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="language_host">{formData.site.site_mode === 'standalone' && !isRootStandaloneSite ? '独立域名 *' : '独立域名'}</Label>
            <Input
              id="language_host"
              required={formData.site.site_mode === 'standalone' && !isRootStandaloneSite}
              value={formData.site.host}
              onChange={(event) => setFormData({ ...formData, site: { ...formData.site, host: event.target.value } })}
              placeholder={formData.site.site_mode === 'standalone' ? 'ru.example.com' : '可留空'}
            />
            {formData.site.site_mode === 'standalone' && !isRootStandaloneSite ? (
              <p className="text-xs text-muted-foreground">
                独立站点必须填写正式访问域名，sitemap、robots、llms 和 canonical 会基于这个域名生成。
              </p>
            ) : null}
          </div>
        </div>

        {formData.site.site_mode === 'subdir' ? (
          <div className="space-y-2">
            <Label htmlFor="language_path_prefix">子目录前缀</Label>
            <Input
              id="language_path_prefix"
              value={formData.site.path_prefix}
              onChange={(event) => setFormData({ ...formData, site: { ...formData.site, path_prefix: event.target.value } })}
              placeholder="/ru"
            />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="language_access_port">访问端口 *</Label>
              <Input
                id="language_access_port"
                type="number"
                required={formData.site.site_mode === 'standalone' && !isRootStandaloneSite}
                value={formData.site.access_port}
                onChange={(event) => setFormData({ ...formData, site: { ...formData.site, access_port: event.target.value } })}
                placeholder="例如 1233"
              />
              <p className="text-xs text-muted-foreground">
                {isRootStandaloneSite ? '根目录独立站点复用主站静态目录，不需要单独监听端口。' : '独立站点必须填写访问端口，保存后会自动启动该站点监听。'}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="language_bind_host">监听地址</Label>
              <Input
                id="language_bind_host"
                value={formData.site.bind_host}
                onChange={(event) => setFormData({ ...formData, site: { ...formData.site, bind_host: event.target.value } })}
                placeholder={DEFAULT_BIND_HOST}
              />
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="language_output_dir">输出目录</Label>
          <Input id="language_output_dir" value={derivedOutputDir} readOnly />
          <p className="text-xs text-muted-foreground">输出目录按站点模式自动生成，避免路径冲突。</p>
        </div>
      </section>

      <SiteConfigLanguageFields
        language={{ code: formData.code || language?.code || 'new' }}
        translation={siteTranslation}
        fallbackTranslation={siteConfigTranslations[fallbackLanguageCode] || createEmptySiteConfigTranslation()}
        fallbackLanguageName={fallbackLanguageName}
        isFallbackLanguage={formData.is_fallback === 1}
        onChange={(patch) => setSiteTranslation((previous) => ({ ...previous, ...patch }))}
      />

      <div className="flex justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? '保存中...' : mode === 'create' ? '创建语言' : '保存语言配置'}
        </Button>
      </div>
    </form>
  )
}

function createEmptyFormData(mode: 'create' | 'edit' = 'create') {
  const defaultSiteMode = mode === 'create' ? 'standalone' : 'subdir'

  return {
    code: '',
    name: '',
    native_name: '',
    is_default: 0,
    is_fallback: 0,
    is_enabled: 1,
    sort_order: 0,
    site: {
      host: '',
      path_prefix: '/',
      output_dir: 'html',
      site_mode: defaultSiteMode as 'subdir' | 'standalone',
      access_port: '',
      bind_host: DEFAULT_BIND_HOST,
      is_primary: 1,
    },
  }
}

function createFormData(language: Language | undefined, mode: 'create' | 'edit') {
  if (!language || mode !== 'edit') {
    return createEmptyFormData(mode)
  }

  return {
    code: language.code || '',
    name: language.name || '',
    native_name: language.native_name || '',
    is_default: language.is_default ?? 0,
    is_fallback: language.is_fallback ?? 0,
    is_enabled: language.is_enabled ?? 1,
    sort_order: language.sort_order ?? 0,
    site: {
      host: language.site?.host || '',
      path_prefix: language.site?.path_prefix || '/',
      output_dir: language.site?.output_dir || 'html',
      site_mode: language.site?.site_mode || 'subdir',
      access_port: language.site?.access_port ? String(language.site.access_port) : '',
      bind_host: language.site?.bind_host || DEFAULT_BIND_HOST,
      is_primary: language.site?.is_primary ?? 1,
    },
  }
}

function resolveApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback
  }
  const response = (error as { response?: { data?: { message?: unknown } } }).response
  return typeof response?.data?.message === 'string' ? response.data.message : fallback
}

function deriveOutputDir(code: string, siteMode: 'subdir' | 'standalone', pathPrefix: string, currentOutputDir?: string) {
  const normalizedOutputDir = String(currentOutputDir || '').trim().replace(/^\/+|\/+$/g, '')
  if (normalizedOutputDir === 'html') {
    return 'html'
  }

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
