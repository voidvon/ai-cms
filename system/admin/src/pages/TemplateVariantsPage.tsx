import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TemplateCodeEditor } from '@/components/TemplateCodeEditor'
import { TemplateVariableReference } from '@/components/TemplateVariableReference'
import { toast } from 'sonner'
import type { Template, TemplateVariant, TemplateVersion } from '@/types'

const templateTypes: Array<{ value: Template['type']; label: string; description: string }> = [
  { value: 'home', label: '首页模板', description: '生成首页' },
  { value: 'list', label: '列表模板', description: '生成栏目和分页列表' },
  { value: 'content', label: '内容模板', description: '生成详情、单页和表单页面' },
  { value: 'component', label: '组件模板', description: '头部、底部、导航和公共片段' },
]

const previewModes = [
  { value: 'auto', label: '自动场景' },
  { value: 'home', label: '首页' },
  { value: 'product-list', label: '产品列表' },
  { value: 'product-detail', label: '产品详情' },
  { value: 'article-list', label: '文章列表' },
  { value: 'article-detail', label: '文章详情' },
  { value: 'content', label: '公司栏目' },
  { value: 'contact', label: '联系我们' },
  { value: 'message', label: '在线留言' },
]

type TemplateForm = Pick<Template, 'name' | 'code' | 'type' | 'engine' | 'content' | 'sort_order'>

export default function TemplateVariantsPage() {
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<Template['type']>('home')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewMode, setPreviewMode] = useState('auto')
  const [formData, setFormData] = useState<TemplateForm>({
    name: '',
    code: '',
    type: 'home',
    engine: 'html',
    content: '',
    sort_order: 0,
  })
  const { data: themesData, isLoading: isThemesLoading } = useQuery({
    queryKey: ['themes'],
    queryFn: () => templateVariantsApi.list(),
  })
  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  })

  const themes = themesData?.data ?? []
  const templates = data?.data ?? []
  const selectedTheme = useMemo(
    () => themes.find((item) => item.is_selected === 1) || themes[0] || null,
    [themes],
  )
  const filteredTemplates = useMemo(
    () => templates.filter((item) => item.type === activeType),
    [templates, activeType],
  )
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId) || filteredTemplates[0] || null,
    [templates, selectedId, filteredTemplates],
  )
  const { data: dependencyData, isLoading: isDependenciesLoading } = useQuery({
    queryKey: ['template-dependencies', selectedTemplate?.id],
    queryFn: () => templatesApi.getDependencies(selectedTemplate!.id),
    enabled: Boolean(selectedTemplate?.id),
  })
  const { data: versionsData, isLoading: isVersionsLoading } = useQuery({
    queryKey: ['template-versions', selectedTemplate?.id],
    queryFn: () => templatesApi.listVersions(selectedTemplate!.id),
    enabled: Boolean(selectedTemplate?.id),
  })

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedId(null)
      setFormData({ name: '', code: '', type: activeType, engine: 'html', content: '', sort_order: 0 })
      return
    }
    if (selectedTemplate.id !== selectedId) {
      setSelectedId(selectedTemplate.id)
    }
    setFormData({
      name: selectedTemplate.name,
      code: selectedTemplate.code,
      type: selectedTemplate.type,
      engine: selectedTemplate.engine || 'html',
      content: selectedTemplate.content || '',
      sort_order: selectedTemplate.sort_order || 0,
    })
  }, [activeType, selectedId, selectedTemplate])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) {
        throw new Error('未选择模板')
      }
      return templatesApi.update(selectedTemplate.id, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template-dependencies', selectedTemplate?.id] })
      toast.success('模板已保存为草稿')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '保存失败')),
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) {
        throw new Error('未选择模板')
      }
      await templatesApi.update(selectedTemplate.id, formData)
      return templatesApi.publish(selectedTemplate.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template-dependencies', selectedTemplate?.id] })
      queryClient.invalidateQueries({ queryKey: ['template-versions', selectedTemplate?.id] })
      toast.success('模板已发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '发布失败')),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const code = `${activeType}_${Date.now()}`
      return templatesApi.create({
        name: '新模板',
        code,
        type: activeType,
        engine: 'html',
        content: '',
        sort_order: filteredTemplates.length + 1,
      })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      if (response.data?.id) {
        setSelectedId(response.data.id)
      }
      toast.success('模板已创建')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '创建失败')),
  })

  const createThemeMutation = useMutation({
    mutationFn: () => templateVariantsApi.create(buildNewThemePayload(selectedTheme, themes.length + 1)),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      toast.success('主题已创建')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '创建主题失败')),
  })

  const selectThemeMutation = useMutation({
    mutationFn: (id: number) => templateVariantsApi.select(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      toast.success('主题已切换')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '切换主题失败')),
  })

  const previewMutation = useMutation({
    mutationFn: () => templatesApi.preview({
      ...formData,
      preview_context: { mode: previewMode },
    }),
    onSuccess: (response) => {
      setPreviewHtml(response.data?.html || '')
      setPreviewOpen(true)
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '预览失败')),
  })

  const restoreVersionMutation = useMutation({
    mutationFn: (versionId: number) => {
      if (!selectedTemplate) {
        throw new Error('未选择模板')
      }
      return templatesApi.restoreVersion(selectedTemplate.id, versionId)
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['template-dependencies', selectedTemplate?.id] })
      queryClient.invalidateQueries({ queryKey: ['template-versions', selectedTemplate?.id] })
      if (response.data) {
        setSelectedId(response.data.id)
        setFormData({
          name: response.data.name,
          code: response.data.code,
          type: response.data.type,
          engine: response.data.engine || 'html',
          content: response.data.content || '',
          sort_order: response.data.sort_order || 0,
        })
      }
      toast.success('模板版本已恢复并发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '恢复失败')),
  })

  if (isLoading || isThemesLoading) {
    return <div>加载中...</div>
  }

  const selectedTypeInfo = templateTypes.find((item) => item.value === activeType)

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0">
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>主题管理</CardTitle>
              <CardDescription>
                当前主题：{selectedTheme?.template_name || '未选择'}。主题决定静态生成时各页面默认使用的已发布模板，下方模板库用于编辑具体模板内容。
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select
                value={selectedTheme ? String(selectedTheme.id) : undefined}
                onValueChange={(value) => {
                  const nextId = Number(value)
                  if (!Number.isNaN(nextId) && nextId !== selectedTheme?.id) {
                    selectThemeMutation.mutate(nextId)
                  }
                }}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="选择主题" />
                </SelectTrigger>
                <SelectContent>
                  {themes.map((theme) => (
                    <SelectItem key={theme.id} value={String(theme.id)}>
                      {theme.template_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => createThemeMutation.mutate()} disabled={createThemeMutation.isPending}>
                新增主题
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-muted-foreground">
            切换主题后，下一次静态生成会按所选主题输出默认页面模板。
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>主题模板库</CardTitle>
            <CardDescription>{selectedTypeInfo?.label}，当前分类共 {filteredTemplates.length} 个模板</CardDescription>
            <div className="grid gap-2 pt-2 md:grid-cols-2 xl:grid-cols-1">
              {templateTypes.map((type) => (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => {
                    setActiveType(type.value)
                    setSelectedId(null)
                  }}
                  className={`rounded border p-3 text-left transition-colors ${activeType === type.value ? 'border-primary bg-muted' : 'hover:bg-muted/60'}`}
                >
                  <div className="font-medium">{type.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{type.description}</div>
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <div className="space-y-2 pr-1">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full rounded border p-3 text-left transition-colors ${selectedTemplate?.id === template.id ? 'border-primary bg-muted' : 'hover:bg-muted/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{template.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{template.code}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={template.status === 'published' ? 'default' : 'outline'}>
                        {template.status === 'published' ? '已发布' : '草稿'}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <div className="rounded border p-6 text-center text-sm text-muted-foreground">暂无模板</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedTemplate ? selectedTemplate.name : '未选择模板'}</CardTitle>
                <CardDescription>
                  模板是主题的组成单元。使用组件引用和占位符编辑模板，双花括号输出转义文本，三花括号输出 HTML。
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                  新增模板
                </Button>
                <Select value={previewMode} onValueChange={setPreviewMode}>
                  <SelectTrigger className="w-[138px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {previewModes.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value}>{mode.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => previewMutation.mutate()} disabled={!selectedTemplate || previewMutation.isPending}>
                  预览
                </Button>
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!selectedTemplate || saveMutation.isPending}>
                  保存草稿
                </Button>
                <Button onClick={() => publishMutation.mutate()} disabled={!selectedTemplate || publishMutation.isPending}>
                  发布
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {selectedTemplate ? (
              <div className="flex min-h-0 flex-col gap-4 pr-1">
                <div className="grid gap-4 md:grid-cols-[1fr_220px_150px_120px]">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">模板名称</Label>
                    <Input
                      id="template-name"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-code">模板编码</Label>
                    <Input
                      id="template-code"
                      value={formData.code}
                      onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-sort">排序</Label>
                    <Input
                      id="template-sort"
                      type="number"
                      value={formData.sort_order}
                      onChange={(event) => setFormData({ ...formData, sort_order: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>模板引擎</Label>
                    <Select
                      value={formData.engine}
                      onValueChange={(value) => setFormData({ ...formData, engine: value as Template['engine'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML 占位符</SelectItem>
                        <SelectItem value="tsx">TSX 组件</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex min-h-0 flex-1 flex-col space-y-2">
                  <Label htmlFor="template-content">模板内容</Label>
                  <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <TemplateCodeEditor
                      id="template-content"
                      value={formData.content}
                      engine={formData.engine}
                      onChange={(content) => setFormData({ ...formData, content })}
                      height="100%"
                      className="h-full min-h-[420px]"
                    />
                    <div className="min-h-0 overflow-auto">
                      <TemplateVariableReference type={formData.type} engine={formData.engine} />
                    </div>
                  </div>
                </div>
                <TemplateDependencyPanel
                  dependencies={dependencyData?.data}
                  isLoading={isDependenciesLoading}
                />
                <TemplateVersionPanel
                  currentContent={formData.content}
                  versions={versionsData?.data || []}
                  isLoading={isVersionsLoading}
                  isRestoring={restoreVersionMutation.isPending}
                  onRestore={(versionId) => restoreVersionMutation.mutate(versionId)}
                />
              </div>
            ) : (
              <div className="rounded border p-8 text-center text-muted-foreground">请选择或新增模板</div>
            )}
          </CardContent>
        </Card>
      </div>
      <TemplatePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        html={previewHtml}
        title={selectedTemplate?.name || '模板预览'}
      />
    </div>
  )
}

function buildNewThemePayload(baseTheme: TemplateVariant | null, nextIndex: number): Partial<TemplateVariant> {
  return {
    template_name: `新主题 ${nextIndex}`,
    is_selected: 0,
    home_index: baseTheme?.home_index,
    co_index: baseTheme?.co_index,
    produts_index: baseTheme?.produts_index,
    produts_sort1: baseTheme?.produts_sort1,
    produts_sort2: baseTheme?.produts_sort2,
    produts_detail: baseTheme?.produts_detail,
    news_index: baseTheme?.news_index,
    news_sort1: baseTheme?.news_sort1,
    news_detail: baseTheme?.news_detail,
    service_sort1: baseTheme?.service_sort1,
    service_detail: baseTheme?.service_detail,
    msg_index: baseTheme?.msg_index,
    contact: baseTheme?.contact,
  }
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

function TemplatePreviewDialog({
  open,
  onOpenChange,
  html,
  title,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  html: string
  title: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[86vh] max-w-[1180px] grid-rows-[auto_minmax(0,1fr)] p-4">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>当前编辑器内容的服务端渲染结果，未保存也未发布。</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-hidden rounded border bg-white">
          <iframe
            title="模板预览"
            className="h-full w-full"
            sandbox="allow-same-origin allow-forms allow-scripts"
            srcDoc={html || '<!DOCTYPE html><html><body></body></html>'}
          />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function TemplateDependencyPanel({
  dependencies,
  isLoading,
}: {
  dependencies?: Awaited<ReturnType<typeof templatesApi.getDependencies>>['data']
  isLoading: boolean
}) {
  if (isLoading) {
    return <div className="rounded border p-3 text-sm text-muted-foreground">依赖关系加载中...</div>
  }
  if (!dependencies) {
    return null
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="rounded border p-3">
        <div className="text-sm font-medium">引用的组件</div>
        <div className="mt-2 space-y-2">
          {dependencies.references.length === 0 ? (
            <div className="text-sm text-muted-foreground">未引用组件模板</div>
          ) : dependencies.references.map((item) => (
            <div key={item.code} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{item.name || item.code}</div>
                <div className="truncate text-xs text-muted-foreground">{item.code}</div>
              </div>
              <Badge variant={item.exists ? 'outline' : 'destructive'}>
                {item.exists ? formatTemplateTypeLabel(item.type || 'component') : '不存在'}
              </Badge>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded border p-3">
        <div className="text-sm font-medium">被这些模板引用</div>
        <div className="mt-2 space-y-2">
          {dependencies.referenced_by.length === 0 ? (
            <div className="text-sm text-muted-foreground">暂无其他模板引用</div>
          ) : dependencies.referenced_by.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{item.name}</div>
                <div className="truncate text-xs text-muted-foreground">{item.code}</div>
              </div>
              <Badge variant={item.status === 'published' ? 'default' : 'outline'}>
                {formatTemplateTypeLabel(item.type)}
              </Badge>
            </div>
          ))}
        </div>
        {dependencies.bindings.length > 0 && (
          <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
            当前模板已绑定到 {dependencies.bindings.length} 个站点或分类，删除前需要先取消绑定。
          </div>
        )}
      </div>
    </div>
  )
}

function TemplateVersionPanel({
  currentContent,
  versions,
  isLoading,
  isRestoring,
  onRestore,
}: {
  currentContent: string
  versions: TemplateVersion[]
  isLoading: boolean
  isRestoring: boolean
  onRestore: (versionId: number) => void
}) {
  return (
    <div className="rounded border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-medium">历史版本</div>
          <div className="text-xs text-muted-foreground">最多保留 10 个发布前版本，可恢复并立即发布。</div>
        </div>
        <Badge variant="outline">{versions.length} 个版本</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">版本加载中...</div>
        ) : versions.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无历史版本</div>
        ) : versions.map((version) => {
          const diff = summarizeContentDiff(currentContent, version.content || '')
          return (
            <div key={version.id} className="grid gap-2 rounded bg-muted/50 p-2 text-sm md:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">版本 #{version.version_no}</span>
                  <Badge variant="outline">{version.engine.toUpperCase()}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTime(version.created_at)}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{version.note || '发布前版本'}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  当前草稿 {currentContent.length} 字符，历史版本 {version.content.length} 字符，{diff}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (window.confirm(`确定恢复版本 #${version.version_no} 并发布吗？当前已发布内容会进入历史版本。`)) {
                    onRestore(version.id)
                  }
                }}
                disabled={isRestoring}
              >
                恢复并发布
              </Button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function summarizeContentDiff(current: string, previous: string) {
  if (current === previous) {
    return '内容相同'
  }
  const delta = current.length - previous.length
  if (delta > 0) {
    return `当前多 ${delta} 字符`
  }
  if (delta < 0) {
    return `当前少 ${Math.abs(delta)} 字符`
  }
  return '字符数相同但内容不同'
}

function formatDateTime(value?: string) {
  if (!value) {
    return ''
  }
  return value.replace('T', ' ').slice(0, 19)
}

function formatTemplateTypeLabel(type: string) {
  if (type === 'home') return '首页'
  if (type === 'list') return '列表'
  if (type === 'content') return '内容'
  if (type === 'component') return '组件'
  return type || '未知'
}
