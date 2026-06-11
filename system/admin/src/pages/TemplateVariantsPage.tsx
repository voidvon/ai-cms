import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tree, type TreeItemData } from '@/components/ui/tree'
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
  { value: 'service-list', label: '服务列表' },
  { value: 'service-detail', label: '服务详情' },
  { value: 'content', label: '公司栏目' },
  { value: 'contact', label: '联系我们' },
  { value: 'message', label: '在线留言' },
]

type TemplateForm = Pick<Template, 'name' | 'code' | 'type' | 'engine' | 'content' | 'sort_order'>
type ThemeSlotKey =
  'home' |
  'corporation' |
  'product_list' |
  'product_detail' |
  'news_list' |
  'news_detail' |
  'service_list' |
  'service_detail' |
  'message' |
  'contact'

const themeSlotConfigs: Array<{
  key: ThemeSlotKey
  label: string
  description: string
  templateType: Extract<Template['type'], 'home' | 'list' | 'content'>
  field: keyof TemplateVariant
}> = [
  { key: 'home', label: '首页模板', description: '网站首页', templateType: 'home', field: 'home_index' },
  { key: 'corporation', label: '公司栏目模板', description: '公司单页', templateType: 'content', field: 'co_index' },
  { key: 'product_list', label: '产品列表模板', description: '产品分类列表', templateType: 'list', field: 'produts_sort1' },
  { key: 'product_detail', label: '产品详情模板', description: '产品详情页', templateType: 'content', field: 'produts_detail' },
  { key: 'news_list', label: '新闻列表模板', description: '新闻分类列表', templateType: 'list', field: 'news_sort1' },
  { key: 'news_detail', label: '新闻详情模板', description: '新闻详情页', templateType: 'content', field: 'news_detail' },
  { key: 'service_list', label: '服务列表模板', description: '服务分类列表', templateType: 'list', field: 'service_sort1' },
  { key: 'service_detail', label: '服务详情模板', description: '服务详情页', templateType: 'content', field: 'service_detail' },
  { key: 'message', label: '留言板模板', description: '在线留言页', templateType: 'content', field: 'msg_index' },
  { key: 'contact', label: '联系页模板', description: '联系我们页', templateType: 'content', field: 'contact' },
]

type EditorTarget =
  | { kind: 'slot'; slot: ThemeSlotKey }
  | { kind: 'component'; templateId: number | null }

type TemplateLibraryNode = {
  kind: 'group' | 'slot' | 'component'
  slotKey?: ThemeSlotKey
  template?: Template | null
}

function resolvePreviewMode(previewMode: string, editorTarget: EditorTarget): string {
  if (previewMode !== 'auto') {
    return previewMode
  }

  if (editorTarget.kind !== 'slot') {
    return 'auto'
  }

  const slotModeMap: Record<ThemeSlotKey, string> = {
    home: 'home',
    corporation: 'content',
    product_list: 'product-list',
    product_detail: 'product-detail',
    news_list: 'article-list',
    news_detail: 'article-detail',
    service_list: 'service-list',
    service_detail: 'service-detail',
    message: 'message',
    contact: 'contact',
  }

  return slotModeMap[editorTarget.slot]
}

export default function TemplateVariantsPage() {
  const queryClient = useQueryClient()
  const [activeThemeSlot, setActiveThemeSlot] = useState<ThemeSlotKey>('home')
  const [editorTarget, setEditorTarget] = useState<EditorTarget>({ kind: 'slot', slot: 'home' })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false)
  const [versionPreview, setVersionPreview] = useState<TemplateVersion | null>(null)
  const [previewMode, setPreviewMode] = useState('auto')
  const [attachComponentId, setAttachComponentId] = useState<string>('')
  const [formData, setFormData] = useState<TemplateForm>({
    name: '',
    code: '',
    type: 'home',
    engine: 'tsx',
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
  const themeComponentTemplates = useMemo(
    () => {
      const componentIds = new Set(selectedTheme?.manual_component_template_ids || [])
      return templates.filter((item) => item.type === 'component' && componentIds.has(item.id))
    },
    [selectedTheme, templates],
  )
  const availableComponentTemplates = useMemo(
    () => {
      const attachedIds = new Set(selectedTheme?.manual_component_template_ids || [])
      return templates.filter((item) => item.type === 'component' && !attachedIds.has(item.id))
    },
    [selectedTheme, templates],
  )
  const resolvedThemeComponentCount = selectedTheme?.component_template_ids?.length || 0
  const selectedSlotConfig = useMemo(
    () => themeSlotConfigs.find((item) => item.key === activeThemeSlot) || themeSlotConfigs[0],
    [activeThemeSlot],
  )
  const themeSlotItems = useMemo(() => {
    return themeSlotConfigs.map((slot) => {
      const code = selectedTheme?.[slot.field]
      const template = templates.find((item) => item.code === code) || null
      return {
        ...slot,
        code: typeof code === 'string' ? code : '',
        template,
      }
    })
  }, [selectedTheme, templates])
  const templateLibraryItems = useMemo<TreeItemData<TemplateLibraryNode>[]>(() => {
    const slotByKey = new Map(themeSlotItems.map((item) => [item.key, item]))
    const createSlotLeaf = (slotKey: ThemeSlotKey) => {
      const slot = slotByKey.get(slotKey) || null
      return {
        id: `slot:${slotKey}`,
        label: (
          <div className="min-w-0">
            <div className="truncate">{slot?.label || slotKey}</div>
            <div className="truncate text-xs text-muted-foreground">
              {slot?.template?.name || slot?.description || '未绑定模板'}
            </div>
          </div>
        ),
        data: {
          kind: 'slot' as const,
          slotKey,
          template: slot?.template || null,
        },
      }
    }

    return [
      createSlotLeaf('home'),
      {
        id: 'group:list',
        label: '列表模板',
        selectable: false,
        data: { kind: 'group' },
        children: [
          createSlotLeaf('product_list'),
          createSlotLeaf('news_list'),
          createSlotLeaf('service_list'),
        ],
      },
      {
        id: 'group:content',
        label: '内容模板',
        selectable: false,
        data: { kind: 'group' },
        children: [
          createSlotLeaf('corporation'),
          createSlotLeaf('product_detail'),
          createSlotLeaf('news_detail'),
          createSlotLeaf('service_detail'),
          createSlotLeaf('contact'),
        ],
      },
      createSlotLeaf('message'),
      {
        id: 'group:component',
        label: '组件模板',
        selectable: false,
        data: { kind: 'group' },
        children: themeComponentTemplates.map((template) => ({
          id: `component:${template.id}`,
          label: (
            <div className="min-w-0">
              <div className="truncate">{template.name}</div>
              <div className="truncate text-xs text-muted-foreground">{template.code}</div>
            </div>
          ),
          data: {
            kind: 'component' as const,
            template,
          },
        })),
      },
    ]
  }, [themeComponentTemplates, themeSlotItems])
  const selectedComponentTemplate = useMemo(
    () => {
      if (editorTarget.kind !== 'component') {
        return themeComponentTemplates[0] || null
      }
      return themeComponentTemplates.find((item) => item.id === editorTarget.templateId) || themeComponentTemplates[0] || null
    },
    [themeComponentTemplates, editorTarget],
  )
  const selectedTemplate = useMemo(
    () => {
      if (editorTarget.kind === 'component') {
        return selectedComponentTemplate
      }
      const code = selectedTheme?.[selectedSlotConfig.field]
      return templates.find((item) => item.code === code) || null
    },
    [editorTarget, selectedTheme, selectedSlotConfig, templates, selectedComponentTemplate],
  )
  const selectedTreeValue = useMemo(
    () => editorTarget.kind === 'component'
      ? `component:${editorTarget.templateId || selectedComponentTemplate?.id || ''}`
      : `slot:${activeThemeSlot}`,
    [activeThemeSlot, editorTarget, selectedComponentTemplate],
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
    if (editorTarget.kind === 'slot') {
      return
    }
    if (selectedComponentTemplate && selectedComponentTemplate.id !== editorTarget.templateId) {
      setEditorTarget({ kind: 'component', templateId: selectedComponentTemplate.id })
    }
  }, [editorTarget, selectedComponentTemplate])

  useEffect(() => {
    if (!selectedTemplate) {
      setFormData({
        name: '',
        code: '',
        type: editorTarget.kind === 'component' ? 'component' : selectedSlotConfig.templateType,
        engine: 'tsx',
        content: '',
        sort_order: 0,
      })
      return
    }
    setFormData({
      name: selectedTemplate.name,
      code: selectedTemplate.code,
      type: selectedTemplate.type,
      engine: selectedTemplate.engine || 'tsx',
      content: selectedTemplate.content || '',
      sort_order: selectedTemplate.sort_order || 0,
    })
  }, [selectedSlotConfig, selectedTemplate])

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
      toast.success('模板已保存并发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '保存失败')),
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTheme) {
        throw new Error('未选择主题')
      }

      const slotTemplates = themeSlotItems.filter((item) => item.templateType === selectedSlotConfig.templateType)
      const code = `${selectedSlotConfig.key}_${Date.now()}`
      const created = await templatesApi.create({
        name: `${selectedSlotConfig.label}-新模板`,
        code,
        type: selectedSlotConfig.templateType,
        engine: 'tsx',
        content: 'export default function Template() {\n  return <div>新模板</div>\n}\n',
        status: 'published',
        sort_order: slotTemplates.length + 1,
      })

      if (!created.data?.id) {
        throw new Error('创建模板失败')
      }

      await templateVariantsApi.update(selectedTheme.id, buildThemeSlotUpdate(selectedSlotConfig.field, code))
      return created
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      toast.success('模板已创建、发布并绑定到当前主题')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '创建失败')),
  })

  const createComponentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTheme) {
        throw new Error('未选择主题')
      }
      const code = `component_${Date.now()}`
      const created = await templatesApi.create({
        name: '新组件模板',
        code,
        type: 'component',
        engine: 'tsx',
        status: 'published',
        content: [
          'export const scss = String.raw`',
          '.component-root {',
          '  display: block;',
          '}',
          '`;',
          '',
          'export default function ComponentTemplate({ children, slots = {}, title = "" }) {',
          '  return (',
          '    <section className="component-root">',
          '      {slots.header}',
          '      {title ? <h2>{title}</h2> : null}',
          '      {children}',
          '      {slots.footer}',
          '    </section>',
          '  )',
          '}',
          '',
        ].join('\n'),
        sort_order: themeComponentTemplates.length + 1,
      })
      if (!created.data?.id) {
        throw new Error('创建组件失败')
      }
      await templateVariantsApi.update(selectedTheme.id, {
        manual_component_template_ids: [...(selectedTheme.manual_component_template_ids || []), created.data.id],
      })
      return created
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      const createdId = response.data?.id
      if (createdId) {
        setEditorTarget({ kind: 'component', templateId: createdId })
      }
      toast.success('组件模板已创建并发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '创建组件失败')),
  })
  const attachComponentMutation = useMutation({
    mutationFn: async (templateId: number) => {
      if (!selectedTheme) {
        throw new Error('未选择主题')
      }
      return templateVariantsApi.update(selectedTheme.id, {
        manual_component_template_ids: Array.from(new Set([
          ...(selectedTheme.manual_component_template_ids || []),
          templateId,
        ])),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      setAttachComponentId('')
      toast.success('组件已关联到当前主题')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '组件关联失败')),
  })
  const detachComponentMutation = useMutation({
    mutationFn: async (templateId: number) => {
      if (!selectedTheme) {
        throw new Error('未选择主题')
      }
      return templateVariantsApi.update(selectedTheme.id, {
        manual_component_template_ids: (selectedTheme.manual_component_template_ids || []).filter((id) => id !== templateId),
      })
    },
    onSuccess: (_, templateId) => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      if (editorTarget.kind === 'component' && editorTarget.templateId === templateId) {
        setEditorTarget({ kind: 'slot', slot: activeThemeSlot })
      }
      toast.success('组件已从当前主题解除关联')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '解除关联失败')),
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
      preview_context: { mode: resolvePreviewMode(previewMode, editorTarget) },
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
        setFormData({
          name: response.data.name,
          code: response.data.code,
          type: response.data.type,
          engine: response.data.engine || 'tsx',
          content: response.data.content || '',
          sort_order: response.data.sort_order || 0,
        })
      }
      toast.success('模板版本已恢复并发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '恢复失败')),
  })

  const handleSelectLibraryItem = (item: TreeItemData<TemplateLibraryNode>) => {
    const data = item.data
    if (!data || data.kind === 'group') {
      return
    }

    if (data.kind === 'slot' && data.slotKey) {
      setActiveThemeSlot(data.slotKey)
      setEditorTarget({ kind: 'slot', slot: data.slotKey })
      return
    }

    if (data.kind === 'component' && data.template?.id) {
      setEditorTarget({ kind: 'component', templateId: data.template.id })
    }
  }

  if (isLoading || isThemesLoading) {
    return <div>加载中...</div>
  }

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
            切换主题后会自动重新生成静态页面，并按所选主题输出默认页面模板。
          </div>
        </CardContent>
      </Card>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div>
                <CardTitle>主题模板库</CardTitle>
                <CardDescription>
                  页面模板按当前主题绑定。这里展示的是当前主题直属组件，组件源码统一保存在数据库。
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => createComponentMutation.mutate()}
                disabled={createComponentMutation.isPending}
              >
                新增组件
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <Tree
              items={templateLibraryItems}
              value={selectedTreeValue}
              defaultExpandedIds={['group:list', 'group:content', 'group:component']}
              onValueChange={handleSelectLibraryItem}
              className="pr-1"
            />
            <div className="mt-4 space-y-3 rounded border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">主题组件关联</div>
                  <div className="text-xs text-muted-foreground">
                    直属组件 {themeComponentTemplates.length} 个，运行时解析组件 {resolvedThemeComponentCount} 个。
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <Select value={attachComponentId} onValueChange={setAttachComponentId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="关联已有组件模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableComponentTemplates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name} ({template.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const templateId = Number(attachComponentId)
                    if (!Number.isNaN(templateId) && templateId > 0) {
                      attachComponentMutation.mutate(templateId)
                    }
                  }}
                  disabled={!attachComponentId || attachComponentMutation.isPending}
                >
                  关联
                </Button>
              </div>
              {themeComponentTemplates.length > 0 ? (
                <div className="space-y-2">
                  {themeComponentTemplates.map((template) => (
                    <div key={template.id} className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{template.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{template.code}</div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => detachComponentMutation.mutate(template.id)}
                        disabled={detachComponentMutation.isPending}
                      >
                        移除
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {themeComponentTemplates.length === 0 ? (
              <div className="mt-4 rounded border border-dashed p-3 text-sm text-muted-foreground">
                还没有组件模板，可新建布局、容器、按钮、导航等公共片段。
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex items-center justify-between gap-3">
              {selectedTemplate ? (
                <div className="grid flex-1 gap-4 md:grid-cols-[320px_180px_80px_auto]">
                  <Input
                    id="template-name"
                    placeholder="模板名称"
                    value={formData.name}
                    onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                  />
                  <Input
                    id="template-code"
                    placeholder="模板编码"
                    value={formData.code}
                    onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                  />
                  <Input
                    id="template-sort"
                    type="number"
                    placeholder="排序"
                    value={formData.sort_order}
                    onChange={(event) => setFormData({ ...formData, sort_order: Number(event.target.value) || 0 })}
                  />
                  <div className="flex items-center">
                    <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" className="shrink-0">
                          历史版本
                          <Badge variant="secondary" className="ml-2">{versionsData?.data?.length || 0}</Badge>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-[680px] p-0">
                        <TemplateVersionPopover
                          currentContent={formData.content}
                          versions={versionsData?.data || []}
                          isLoading={isVersionsLoading}
                          isRestoring={restoreVersionMutation.isPending}
                          onViewCode={(version) => {
                            setVersionPreview(version)
                            setVersionPopoverOpen(false)
                          }}
                          onRestore={(versionId) => {
                            setVersionPopoverOpen(false)
                            restoreVersionMutation.mutate(versionId)
                          }}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ) : <div className="flex-1" />}
              <div className="flex gap-2">
                {editorTarget.kind === 'slot' ? (
                  <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
                    新增并绑定模板
                  </Button>
                ) : (
                  <Button onClick={() => createComponentMutation.mutate()} disabled={createComponentMutation.isPending}>
                    新增组件
                  </Button>
                )}
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
                <Button onClick={() => publishMutation.mutate()} disabled={!selectedTemplate || publishMutation.isPending}>
                  保存并发布
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            {selectedTemplate ? (
              <div className="flex min-h-0 flex-col gap-4 pr-1">
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <TemplateCodeEditor
                      id="template-content"
                      value={formData.content}
                      onChange={(content) => setFormData({ ...formData, content })}
                      placeholder="模板内容"
                      height="100%"
                      className="h-full min-h-[420px]"
                    />
                    <div className="min-h-0 overflow-auto">
                      <TemplateVariableReference type={formData.type} />
                    </div>
                  </div>
                </div>
                <TemplateDependencyPanel
                  dependencies={dependencyData?.data}
                  isLoading={isDependenciesLoading}
                />
              </div>
            ) : (
              <div className="rounded border p-8 text-center text-muted-foreground">
                {editorTarget.kind === 'slot'
                  ? '当前主题的这个槽位还没有绑定模板，可以直接点击“新增并绑定模板”。'
                  : '还没有组件模板，可以先点击“新增组件”。'}
              </div>
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
      <TemplateVersionCodeDialog
        open={Boolean(versionPreview)}
        onOpenChange={(open) => {
          if (!open) {
            setVersionPreview(null)
          }
        }}
        templateName={selectedTemplate?.name || '模板'}
        version={versionPreview}
      />
    </div>
  )
}

function buildNewThemePayload(baseTheme: TemplateVariant | null, nextIndex: number): Partial<TemplateVariant> {
  return {
    template_name: `新主题 ${nextIndex}`,
    source_theme_id: baseTheme?.id,
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

function buildThemeSlotUpdate(field: keyof TemplateVariant, code: string): Partial<TemplateVariant> {
  return {
    [field]: code,
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

function TemplateVersionPopover({
  currentContent,
  versions,
  isLoading,
  isRestoring,
  onViewCode,
  onRestore,
}: {
  currentContent: string
  versions: TemplateVersion[]
  isLoading: boolean
  isRestoring: boolean
  onViewCode: (version: TemplateVersion) => void
  onRestore: (versionId: number) => void
}) {
  return (
    <div className="max-h-[70vh] overflow-auto p-4">
      <div className="flex items-center justify-between gap-2 border-b px-0 pb-3">
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
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => onViewCode(version)}
                >
                  查看代码
                </Button>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TemplateVersionCodeDialog({
  open,
  onOpenChange,
  templateName,
  version,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  templateName: string
  version: TemplateVersion | null
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="h-[86vh] max-w-[1180px] grid-rows-[auto_minmax(0,1fr)] p-4">
        <DialogHeader>
          <DialogTitle>{templateName} · 历史版本代码</DialogTitle>
          <DialogDescription>
            {version ? `版本 #${version.version_no} · ${version.engine.toUpperCase()} · ${formatDateTime(version.created_at)}` : '历史版本代码预览'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-3">
          {version?.note ? (
            <div className="rounded border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              备注：{version.note}
            </div>
          ) : null}
          <TemplateCodeEditor
            value={version?.content || ''}
            onChange={() => {}}
            readOnly
            height="100%"
            className="h-full min-h-[420px]"
          />
        </div>
      </DialogContent>
    </Dialog>
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
