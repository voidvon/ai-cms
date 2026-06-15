import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { templateVariantsApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import axios from 'axios'
import type { Language } from '@/types'

interface BuildResult {
  success: boolean
  totalFiles?: number
  totalRecords?: number
  message?: string
  languageCode?: string | null
  result?: {
    languageBuilds?: Array<{
      languageCode: string
      outputRoot: string
      totalFiles: number
      totalRecords: number
    }>
  }
}

const buildClient = axios.create({
  withCredentials: true,
  timeout: 300000, // 5 minutes for build operations
})

export default function StaticGenerationPage() {
  const [building, setBuilding] = useState(false)
  const [lastBuild, setLastBuild] = useState<BuildResult | null>(null)
  const { data: selectedThemeData } = useQuery({
    queryKey: ['selected-theme'],
    queryFn: () => templateVariantsApi.getSelected(),
  })
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = languagesData?.data || []
  const enabledLanguages = useMemo(
    () => languages.filter((item) => Number(item.is_enabled || 0) === 1),
    [languages]
  )
  const outputDirConflicts = useMemo(() => {
    const grouped = new Map<string, Language[]>()
    for (const language of enabledLanguages) {
      const outputDir = String(language.site?.output_dir || '').trim() || 'html'
      const existing = grouped.get(outputDir) || []
      existing.push(language)
      grouped.set(outputDir, existing)
    }
    return Array.from(grouped.entries()).filter(([, items]) => items.length > 1)
  }, [enabledLanguages])

  const buildMutation = useMutation({
    mutationFn: async ({ section, languageCode }: { section: string; languageCode?: string }) => {
      const query = new URLSearchParams({ section })
      if (languageCode) {
        query.set('language', languageCode)
      }
      const response = await buildClient.post<BuildResult>(`/admin/build/generate?${query.toString()}`, {})
      return response.data
    },
    onSuccess: (data) => {
      if (data.success) {
        const buildScope = data.languageCode ? `语言 ${data.languageCode}` : '全部已启用语言'
        toast.success(`生成成功：${buildScope}，文件数：${data.totalFiles}，记录数：${data.totalRecords}`)
        setLastBuild(data)
      } else {
        toast.error(data.message || '生成失败')
      }
      setBuilding(false)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '生成失败'))
      setBuilding(false)
    },
  })

  const handleBuild = (section: string, languageCode?: string) => {
    setBuilding(true)
    buildMutation.mutate({ section, languageCode })
  }

  const sections = [
    { title: '基础页面', items: [
      { label: '生成首页', value: 'index' },
      { label: '生成联系我们', value: 'contact' },
      { label: '生成公司页面', value: 'corporation' },
    ]},
    { title: '产品相关', items: [
      { label: '生成产品分类列表', value: 'product-lists' },
      { label: '生成产品详情页', value: 'product-details' },
    ]},
    { title: '新闻相关', items: [
      { label: '生成新闻分类列表', value: 'news-lists' },
      { label: '生成新闻详情页', value: 'news-details' },
    ]},
    { title: '服务相关', items: [
      { label: '生成服务分类列表', value: 'service-lists' },
      { label: '生成服务详情页', value: 'service-details' },
    ]},
    { title: '索引与 AI 文件', items: [
      { label: '生成 robots.txt', value: 'robots' },
      { label: '生成 sitemap.xml', value: 'sitemap' },
      { label: '生成 LLMS 文件', value: 'llms' },
    ]},
  ]

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>静态页面生成</CardTitle>
          <CardDescription>
            生成静态 HTML 文件。当前默认主题：{selectedThemeData?.data?.template_name || '未选择'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">语言输出目录</h3>
              <Badge variant="outline">{enabledLanguages.length} 个启用语言</Badge>
            </div>
            <div className="space-y-2">
              {enabledLanguages.map((language) => (
                <div key={language.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={language.is_default ? 'default' : 'outline'}>
                    {language.code}
                  </Badge>
                  <span>{language.name}</span>
                  <span className="text-muted-foreground">输出到</span>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{language.site?.output_dir || 'html'}</code>
                  <span className="text-muted-foreground">路径前缀</span>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{language.site?.path_prefix || '/'}</code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBuild('all', language.code)}
                    disabled={building}
                  >
                    仅生成该语言
                  </Button>
                </div>
              ))}
            </div>
            {outputDirConflicts.length > 0 ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                存在语言输出目录冲突，以下语言会互相覆盖：
                {outputDirConflicts.map(([outputDir, conflictLanguages]) => (
                  <div key={outputDir}>
                    <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">{outputDir}</code>
                    {conflictLanguages.map((item) => item.code).join(' / ')}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {sections.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="font-semibold">{section.title}</h3>
              <div className="flex flex-wrap gap-2">
                {section.items.map((item) => (
                  <Button
                    key={item.value}
                    variant="outline"
                    onClick={() => handleBuild(item.value)}
                    disabled={building}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">全站生成</h3>
            <Button
              onClick={() => handleBuild('all')}
              disabled={building}
            >
              {building ? '生成中...' : '生成全站'}
            </Button>
          </div>

          {lastBuild?.result?.languageBuilds?.length ? (
            <div className="rounded border p-4 space-y-3">
              <h3 className="font-semibold">最近一次生成结果</h3>
              <div className="space-y-2 text-sm">
                {lastBuild.result.languageBuilds.map((item) => (
                  <div key={`${item.languageCode}-${item.outputRoot}`} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.languageCode}</Badge>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs">{item.outputRoot}</code>
                    <span className="text-muted-foreground">文件数 {item.totalFiles}</span>
                    <span className="text-muted-foreground">记录数 {item.totalRecords}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
