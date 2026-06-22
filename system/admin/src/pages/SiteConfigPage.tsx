import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { ApiResponse, SiteConfig, SiteConfigTranslation } from '@/types'

type SiteConfigBaseForm = {
  web_url: string
  postal_code: string
  company_phone: string
  company_fax: string
  icp_number: string
  web_qq: string
  web_mobile: string
  assets_bind_host: string
  assets_port: string
  assets_public_base_url: string
}

export default function SiteConfigPage() {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState<SiteConfigBaseForm>(createEmptyBaseData())
  const [translations, setTranslations] = useState<Record<string, SiteConfigTranslation>>({})

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = languages.map((item) => item.code)

  const { data, isLoading } = useQuery({
    queryKey: ['site-config', defaultLanguageCode],
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SiteConfig>>('/site-config', {
        params: {
          language: defaultLanguageCode,
          include_translations: 1,
        },
      })
      return response.data
    },
  })

  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()

  useEffect(() => {
    const source = data?.data
    if (!source) {
      return
    }

    setBaseData({
      web_url: source.web_url || '',
      postal_code: source.postal_code || '',
      company_phone: source.company_phone || '',
      company_fax: source.company_fax || '',
      icp_number: source.icp_number || '',
      web_qq: source.web_qq || '',
      web_mobile: source.web_mobile || '',
      assets_bind_host: source.assets_bind_host || '',
      assets_port: source.assets_port ? String(source.assets_port) : '',
      assets_public_base_url: source.assets_public_base_url || '',
    })
    setTranslations(buildInitialTranslations(source, defaultLanguageCode, availableLanguageCodes))
    setActiveLanguage(source.requested_language_code || source.current_language_code || defaultLanguageCode)
  }, [data, defaultLanguageCode, availableLanguageCodes.join('|')])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        base: baseData,
        translations,
      }
      const response = await apiClient.put<ApiResponse<SiteConfig>>('/site-config', payload)
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['site-config'] })
      toast.success('更新成功')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '更新失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!String(baseData.web_url || '').trim()) {
      toast.error('网站地址不能为空')
      return
    }
    if (!/^https?:\/\//i.test(baseData.web_url.trim())) {
      toast.error('网站地址必须以 http:// 或 https:// 开头')
      return
    }
    if (!String(translations[defaultLanguageCode]?.web_name || '').trim()) {
      toast.error('请输入默认语言的网站名称')
      return
    }

    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<SiteConfigTranslation>) => {
    setTranslations((previous) => ({
      ...previous,
      [activeLanguage]: {
        ...createEmptyTranslation(),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>网站配置</CardTitle>
          <CardDescription>基础地址与联系信息全站共用，名称与公司文案按语言维护。</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="rounded border p-4 space-y-4">
              <div>
                <div className="font-medium">基础信息</div>
                <div className="text-sm text-muted-foreground">主站地址、联系方式和备案信息在所有语言站点之间共用。</div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="web_url">网站地址</Label>
                  <Input
                    id="web_url"
                    value={baseData.web_url}
                    onChange={(e) => setBaseData({ ...baseData, web_url: e.target.value })}
                    placeholder="https://www.example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_phone">公司电话</Label>
                  <Input
                    id="company_phone"
                    value={baseData.company_phone}
                    onChange={(e) => setBaseData({ ...baseData, company_phone: e.target.value })}
                    placeholder="请输入公司电话"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_fax">公司传真</Label>
                  <Input
                    id="company_fax"
                    value={baseData.company_fax}
                    onChange={(e) => setBaseData({ ...baseData, company_fax: e.target.value })}
                    placeholder="请输入公司传真"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postal_code">邮政编码</Label>
                  <Input
                    id="postal_code"
                    value={baseData.postal_code}
                    onChange={(e) => setBaseData({ ...baseData, postal_code: e.target.value })}
                    placeholder="请输入邮政编码"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_qq">QQ号</Label>
                  <Input
                    id="company_qq"
                    value={baseData.web_qq}
                    onChange={(e) => setBaseData({ ...baseData, web_qq: e.target.value })}
                    placeholder="请输入QQ号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="web_mobile">手机号</Label>
                  <Input
                    id="web_mobile"
                    value={baseData.web_mobile}
                    onChange={(e) => setBaseData({ ...baseData, web_mobile: e.target.value })}
                    placeholder="请输入手机号"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="icp_number">ICP备案号</Label>
                  <Input
                    id="icp_number"
                    value={baseData.icp_number}
                    onChange={(e) => setBaseData({ ...baseData, icp_number: e.target.value })}
                    placeholder="请输入ICP备案号"
                  />
                </div>
              </div>
            </div>

            <div className="rounded border p-4 space-y-4">
              <div>
                <div className="font-medium">共享资源服务</div>
                <div className="text-sm text-muted-foreground">
                  根目录 `uploads/` 由这里统一提供访问。多个站点共用这一套资源服务，保存后会自动重载监听。
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="assets_bind_host">监听地址</Label>
                  <Input
                    id="assets_bind_host"
                    value={baseData.assets_bind_host}
                    onChange={(e) => setBaseData({ ...baseData, assets_bind_host: e.target.value })}
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="assets_port">监听端口</Label>
                  <Input
                    id="assets_port"
                    value={baseData.assets_port}
                    onChange={(e) => setBaseData({ ...baseData, assets_port: e.target.value })}
                    placeholder="1232"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="assets_public_base_url">对外访问域名</Label>
                  <Input
                    id="assets_public_base_url"
                    value={baseData.assets_public_base_url}
                    onChange={(e) => setBaseData({ ...baseData, assets_public_base_url: e.target.value })}
                    placeholder="https://assets.spiraxsteam.com"
                  />
                  <p className="text-sm text-muted-foreground">
                    生成静态页时会把上传资源 URL 输出为这个域名，例如 `https://assets.spiraxsteam.com/uploads/...`
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded border p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium">语言内容</div>
                  <div className="text-sm text-muted-foreground">网站名称、公司名称、地址、联系人，以及默认 SEO 文案按语言分别维护。</div>
                </div>
                <div className="w-48">
                  <Select value={activeLanguage} onValueChange={setActiveLanguage}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {languages.map((language) => (
                        <SelectItem key={language.id} value={language.code}>
                          {language.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="web_name">网站名称 {activeLanguage === defaultLanguageCode ? '*' : ''}</Label>
                  <Input
                    id="web_name"
                    value={currentTranslation.web_name || ''}
                    onChange={(e) => updateTranslation({ web_name: e.target.value })}
                    placeholder="请输入网站名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company_name">公司名称</Label>
                  <Input
                    id="company_name"
                    value={currentTranslation.company_name || ''}
                    onChange={(e) => updateTranslation({ company_name: e.target.value })}
                    placeholder="请输入公司名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contact_person">联系人</Label>
                  <Input
                    id="contact_person"
                    value={currentTranslation.contact_person || ''}
                    onChange={(e) => updateTranslation({ contact_person: e.target.value })}
                    placeholder="请输入联系人"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="company_address">公司地址</Label>
                  <Input
                    id="company_address"
                    value={currentTranslation.company_address || ''}
                    onChange={(e) => updateTranslation({ company_address: e.target.value })}
                    placeholder="请输入公司地址"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="company_email">公司邮箱</Label>
                  <Input
                    id="company_email"
                    type="email"
                    value={currentTranslation.company_email || ''}
                    onChange={(e) => updateTranslation({ company_email: e.target.value })}
                    placeholder="请输入公司邮箱"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="web_copyright">版权信息</Label>
                  <Textarea
                    id="web_copyright"
                    value={currentTranslation.web_copyright || ''}
                    onChange={(e) => updateTranslation({ web_copyright: e.target.value })}
                    placeholder="请输入版权信息"
                    rows={3}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="web_author">网站作者</Label>
                  <Input
                    id="web_author"
                    value={currentTranslation.web_author || ''}
                    onChange={(e) => updateTranslation({ web_author: e.target.value })}
                    placeholder="请输入网站作者"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="seo_default_title">默认 SEO 标题</Label>
                  <Input
                    id="seo_default_title"
                    value={currentTranslation.seo_default_title || ''}
                    onChange={(e) => updateTranslation({ seo_default_title: e.target.value })}
                    placeholder="用于未单独设置页面 SEO 标题时兜底"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="seo_default_description">默认 SEO 描述</Label>
                  <Textarea
                    id="seo_default_description"
                    value={currentTranslation.seo_default_description || ''}
                    onChange={(e) => updateTranslation({ seo_default_description: e.target.value })}
                    placeholder="用于未单独设置页面 SEO 描述时兜底"
                    rows={3}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="seo_home_title">首页 SEO 标题</Label>
                  <Input
                    id="seo_home_title"
                    value={currentTranslation.seo_home_title || ''}
                    onChange={(e) => updateTranslation({ seo_home_title: e.target.value })}
                    placeholder="首页专用标题，可留空回退默认 SEO 标题"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="seo_home_description">首页 SEO 描述</Label>
                  <Textarea
                    id="seo_home_description"
                    value={currentTranslation.seo_home_description || ''}
                    onChange={(e) => updateTranslation({ seo_home_description: e.target.value })}
                    placeholder="首页专用描述，可留空回退默认 SEO 描述"
                    rows={3}
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '保存中...' : '保存配置'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function createEmptyBaseData(): SiteConfigBaseForm {
  return {
    web_url: '',
    postal_code: '',
    company_phone: '',
    company_fax: '',
    icp_number: '',
    web_qq: '',
    web_mobile: '',
    assets_bind_host: '',
    assets_port: '',
    assets_public_base_url: '',
  }
}

function createEmptyTranslation(patch: Partial<SiteConfigTranslation> = {}): SiteConfigTranslation {
  return {
    web_name: '',
    company_name: '',
    company_address: '',
    contact_person: '',
    company_email: '',
    web_copyright: '',
    web_author: '',
    seo_default_title: '',
    seo_default_description: '',
    seo_home_title: '',
    seo_home_description: '',
    ...patch,
  }
}

function buildInitialTranslations(config: SiteConfig, defaultLanguageCode: string, availableLanguageCodes: string[]) {
  const source = config.translations || {}
  const output: Record<string, SiteConfigTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation()
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation({
      web_name: config.web_name || '',
      company_name: config.company_name || '',
      company_address: config.company_address || '',
      contact_person: config.contact_person || '',
      company_email: config.company_email || '',
      web_copyright: config.web_copyright || '',
      web_author: config.web_author || '',
      seo_default_title: config.seo_default_title || '',
      seo_default_description: config.seo_default_description || '',
      seo_home_title: config.seo_home_title || '',
      seo_home_description: config.seo_home_description || '',
    })
  }

  return output
}
