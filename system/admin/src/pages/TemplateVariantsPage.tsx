import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tree, type TreeItemData, type TreeMoveParams } from '@/components/ui/tree'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
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
  { value: 'category-list', label: '列表栏目' },
  { value: 'content-detail', label: '内容详情' },
  { value: 'section-list', label: '信息列表' },
  { value: 'section-detail', label: '信息详情' },
  { value: 'knowledge-list', label: '知识列表' },
  { value: 'knowledge-detail', label: '知识详情' },
  { value: 'single-page', label: '单页栏目' },
  { value: 'contact-page', label: '联系页' },
]

const templateTypeLabelMap: Record<Template['type'], string> = {
  home: '首页模板',
  list: '列表模板',
  content: '内容模板',
  component: '组件模板',
}

type TemplateForm = Pick<Template, 'name' | 'code' | 'type' | 'engine' | 'content' | 'sort_order'>

type EditorTarget = {
  templateId: number | null
}

type TemplateLibraryNode = {
  kind: 'group' | 'template'
  templateType?: Template['type']
  template?: Template | null
}

function resolvePreviewMode(previewMode: string): string {
  if (previewMode !== 'auto') {
    return previewMode
  }
  return 'auto'
}

export default function TemplateVariantsPage() {
  const queryClient = useQueryClient()
  const [editorTarget, setEditorTarget] = useState<EditorTarget>({ templateId: null })
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [versionPopoverOpen, setVersionPopoverOpen] = useState(false)
  const [versionPreview, setVersionPreview] = useState<TemplateVersion | null>(null)
  const [previewMode, setPreviewMode] = useState('auto')
  const [deleteThemeDialogOpen, setDeleteThemeDialogOpen] = useState(false)
  const [templateDeleteDialogOpen, setTemplateDeleteDialogOpen] = useState(false)
  const [deletingTreeItem, setDeletingTreeItem] = useState<TemplateLibraryNode | null>(null)
  const [renameDialogOpen, setRenameDialogOpen] = useState(false)
  const [renamingTreeItem, setRenamingTreeItem] = useState<TemplateLibraryNode | null>(null)
  const [renameForm, setRenameForm] = useState({ name: '', code: '' })
  const [formData, setFormData] = useState<TemplateForm>({
    name: '',
    code: '',
    type: 'home',
    engine: 'tsx',
    content: '',
    sort_order: 0,
  })
  const { data: themesData, isLoading: isThemesLoading, error: themesError } = useQuery({
    queryKey: ['themes'],
    queryFn: () => templateVariantsApi.list(),
  })
  const themes = themesData?.data ?? []
  const selectedTheme = useMemo(
    () => themes.find((item) => item.is_selected === 1) || themes[0] || null,
    [themes],
  )
  const { data, isLoading, error: templatesError } = useQuery({
    queryKey: ['templates', selectedTheme?.id ?? 0],
    queryFn: () => templatesApi.list(undefined, selectedTheme?.id),
    enabled: Boolean(selectedTheme?.id),
  })
  const templates = data?.data ?? []
  const themeTemplatesByType = useMemo(
    () => {
      const grouped: Record<'home' | 'list' | 'content', Template[]> = {
        home: [],
        list: [],
        content: [],
      }

      if (templates.length === 0) {
        return grouped
      }

      for (const template of templates) {
        if (template.type !== 'home' && template.type !== 'list' && template.type !== 'content') {
          continue
        }
        grouped[template.type].push(template)
      }

      grouped.home.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
      grouped.list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)
      grouped.content.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.id - b.id)

      return grouped
    },
    [templates],
  )
  const themeComponentTemplates = useMemo(
    () => templates.filter((item) => item.type === 'component'),
    [selectedTheme, templates],
  )
  const resolvedThemeComponentCount = themeComponentTemplates.length
  const homeTemplates = useMemo(
    () => themeTemplatesByType.home,
    [themeTemplatesByType],
  )
  const primaryHomeTemplate = homeTemplates[0] || null
  const listTemplates = useMemo(
    () => themeTemplatesByType.list,
    [themeTemplatesByType],
  )
  const contentTemplates = useMemo(
    () => themeTemplatesByType.content,
    [themeTemplatesByType],
  )
  const templateLibraryItems = useMemo<TreeItemData<TemplateLibraryNode>[]>(() => {
    const createTemplateLeaf = (template: Template) => {
      return {
        id: `template:${template.id}`,
        label: (
          <div className="min-w-0">
            <div className="truncate">{template.name}</div>
            <div className="truncate text-xs text-muted-foreground">{template.code}</div>
          </div>
        ),
        data: {
          kind: 'template' as const,
          template,
        },
      }
    }

    return [
      primaryHomeTemplate
        ? {
            id: `template:${primaryHomeTemplate.id}`,
            label: (
              <div className="min-w-0">
                <div className="truncate">首页模板</div>
                <div className="truncate text-xs text-muted-foreground">{primaryHomeTemplate.code}</div>
              </div>
            ),
            data: {
              kind: 'template' as const,
              template: primaryHomeTemplate,
            },
          }
        : {
            id: 'group:home',
            label: '首页模板',
            selectable: false,
            data: { kind: 'group', templateType: 'home' },
            children: [],
          },
      {
        id: 'group:list',
        label: '列表模板',
        selectable: false,
        data: { kind: 'group', templateType: 'list' },
        children: listTemplates.map(createTemplateLeaf),
      },
      {
        id: 'group:content',
        label: '内容模板',
        selectable: false,
        data: { kind: 'group', templateType: 'content' },
        children: contentTemplates.map(createTemplateLeaf),
      },
      {
        id: 'group:component',
        label: '组件模板',
        selectable: false,
        data: { kind: 'group', templateType: 'component' },
        children: themeComponentTemplates.map(createTemplateLeaf),
      },
    ]
  }, [contentTemplates, listTemplates, primaryHomeTemplate, themeComponentTemplates])
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === editorTarget.templateId) || null,
    [editorTarget, templates],
  )
  const selectedTreeValue = useMemo(
    () => (selectedTemplate ? `template:${selectedTemplate.id}` : undefined),
    [selectedTemplate],
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
      setFormData({
        name: '',
        code: '',
        type: 'content',
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
  }, [selectedTemplate])

  useEffect(() => {
    if (themesError) {
      toast.error(getApiErrorMessage(themesError, '主题列表加载失败'))
    }
  }, [themesError])

  useEffect(() => {
    if (templatesError) {
      toast.error(getApiErrorMessage(templatesError, '模板列表加载失败'))
    }
  }, [templatesError])

  useEffect(() => {
    if (editorTarget.templateId || selectedTemplate) {
      return
    }
    const firstTemplate = homeTemplates[0] || listTemplates[0] || contentTemplates[0] || themeComponentTemplates[0] || null
    if (firstTemplate) {
      setEditorTarget({ templateId: firstTemplate.id })
    }
  }, [contentTemplates, editorTarget.templateId, homeTemplates, listTemplates, selectedTemplate, themeComponentTemplates])

  useEffect(() => {
    if (!editorTarget.templateId) {
      return
    }

    const visibleTemplateIds = new Set([
      ...homeTemplates.map((item) => item.id),
      ...listTemplates.map((item) => item.id),
      ...contentTemplates.map((item) => item.id),
      ...themeComponentTemplates.map((item) => item.id),
    ])

    if (visibleTemplateIds.has(editorTarget.templateId)) {
      return
    }

    const fallbackTemplate = homeTemplates[0] || listTemplates[0] || contentTemplates[0] || themeComponentTemplates[0] || null
    setEditorTarget({ templateId: fallbackTemplate?.id || null })
  }, [contentTemplates, editorTarget.templateId, homeTemplates, listTemplates, themeComponentTemplates])

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
    mutationFn: async (templateType: Extract<Template['type'], 'home' | 'list' | 'content'>) => {
      const templateCount = templates.filter((item) => item.type === templateType).length
      const code = `${templateType}_${Date.now()}`
      const created = await templatesApi.create({
        theme_id: selectedTheme?.id,
        name: `${templateTypeLabelMap[templateType]}-新模板`,
        code,
        type: templateType,
        engine: 'tsx',
        content: 'export default function Template() {\n  return <div>新模板</div>\n}\n',
        status: 'published',
        sort_order: templateCount + 1,
      })

      if (!created.data?.id) {
        throw new Error('创建模板失败')
      }
      return created
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      const createdId = result.data?.id
      if (createdId) {
        setEditorTarget({ templateId: createdId })
      }
      toast.success('模板已创建并发布')
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
        theme_id: selectedTheme.id,
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
      return created
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      const createdId = response.data?.id
      if (createdId) {
        setEditorTarget({ templateId: createdId })
      }
      toast.success('组件模板已创建并发布')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '创建组件失败')),
  })

  const reorderTemplatesMutation = useMutation({
    mutationFn: async ({ templateType, templateIds }: { templateType: Template['type']; templateIds: number[] }) => {
      for (let index = 0; index < templateIds.length; index += 1) {
        await templatesApi.update(templateIds[index], { sort_order: index + 1 })
      }

      return { templateType, templateIds }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      toast.success('排序已更新')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '排序更新失败')),
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

  const deleteThemeMutation = useMutation({
    mutationFn: (id: number) => templateVariantsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      setDeleteThemeDialogOpen(false)
      toast.success('主题已删除')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '删除主题失败')),
  })

  const deleteTemplateMutation = useMutation({
    mutationFn: async (node: TemplateLibraryNode) => {
      if (!node.template?.id) {
        throw new Error('未找到模板')
      }

      await templatesApi.delete(node.template.id)
      return node
    },
    onSuccess: (node) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      queryClient.invalidateQueries({ queryKey: ['themes'] })
      queryClient.invalidateQueries({ queryKey: ['selected-theme'] })
      if (node.template?.id) {
        queryClient.invalidateQueries({ queryKey: ['template-dependencies', node.template.id] })
        queryClient.invalidateQueries({ queryKey: ['template-versions', node.template.id] })
      }
      if (editorTarget.templateId === node.template?.id) {
        setEditorTarget({ templateId: null })
      }
      setTemplateDeleteDialogOpen(false)
      setDeletingTreeItem(null)
      toast.success('模板已删除')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '删除模板失败')),
  })

  const renameTemplateMutation = useMutation({
    mutationFn: async ({ templateId, name, code }: { templateId: number; name: string; code: string }) => {
      const normalizedName = name.trim()
      const normalizedCode = code.trim()
      if (!normalizedName) {
        throw new Error('模板名称不能为空')
      }
      if (!normalizedCode) {
        throw new Error('模板ID不能为空')
      }
      return templatesApi.update(templateId, { name: normalizedName, code: normalizedCode })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      if (selectedTemplate?.id === response.data?.id && response.data) {
        setFormData((current) => ({
          ...current,
          name: response.data!.name,
          code: response.data!.code,
        }))
      }
      setRenameDialogOpen(false)
      setRenamingTreeItem(null)
      setRenameForm({ name: '', code: '' })
      toast.success('模板信息已更新')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '重命名失败')),
  })

  const previewMutation = useMutation({
    mutationFn: () => templatesApi.preview({
      ...formData,
      preview_context: { mode: resolvePreviewMode(previewMode) },
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

    if (data.kind === 'template' && data.template?.id) {
      setEditorTarget({ templateId: data.template.id })
    }
  }

  const canDragTreeItem = (item: TreeItemData<TemplateLibraryNode>, parent: TreeItemData<TemplateLibraryNode> | null) => {
    if (!parent || item.data?.kind !== 'template') {
      return false
    }
    return Boolean(parent.data?.kind === 'group' && parent.children && parent.children.length > 1)
  }

  const handleTemplateTreeMove = ({ parent, fromIndex, toIndex, siblingItems }: TreeMoveParams<TemplateLibraryNode>) => {
    const templateType = parent?.data?.templateType
    if (!templateType || fromIndex === toIndex) {
      return
    }

    const orderedIds = siblingItems
      .map((entry) => entry.data?.template?.id || null)
      .filter((id): id is number => id != null)

    const [movedId] = orderedIds.splice(fromIndex, 1)
    orderedIds.splice(toIndex, 0, movedId)

    reorderTemplatesMutation.mutate({
      templateType,
      templateIds: orderedIds,
    })
  }

  const renderTreeAction = (item: TreeItemData<TemplateLibraryNode>) => {
    const data = item.data
    if (!data) {
      return null
    }

    const groupId = String(item.id)
    const canCreate = data.kind === 'group' && ['group:home', 'group:list', 'group:content', 'group:component'].includes(groupId)
    const canManageTemplate = data.kind === 'template' && Boolean(data.template?.id)

    if (!canCreate && !canManageTemplate) {
      return null
    }

    const createTarget = data.kind === 'group' ? data.templateType || null : null

    return (
      <div className="mr-1 opacity-0 transition-opacity group-hover/tree-item:opacity-100 focus-within:opacity-100">
        {canCreate && createTarget ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={(event) => {
              event.stopPropagation()
              if (createTarget === 'component') {
                createComponentMutation.mutate()
              } else if (createTarget === 'home' || createTarget === 'list' || createTarget === 'content') {
                createMutation.mutate(createTarget)
              }
            }}
            disabled={createMutation.isPending || createComponentMutation.isPending}
            aria-label="新增"
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
        {canManageTemplate ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={(event) => event.stopPropagation()}
              >
                <Ellipsis className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() => {
                  setRenamingTreeItem(data)
                  setRenameForm({
                    name: data.template?.name || '',
                    code: data.template?.code || '',
                  })
                  setRenameDialogOpen(true)
                }}
                disabled={renameTemplateMutation.isPending}
              >
                <Pencil className="size-4" />
                重命名
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onSelect={() => {
                  setDeletingTreeItem(data)
                  setTemplateDeleteDialogOpen(true)
                }}
                disabled={deleteTemplateMutation.isPending}
              >
                <Trash2 className="size-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    )
  }

  if (isLoading || isThemesLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          className="rounded-full"
                          onClick={() => createThemeMutation.mutate()}
                          disabled={createThemeMutation.isPending}
                          aria-label="新增主题"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>新增主题</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Select
                    value={selectedTheme ? String(selectedTheme.id) : undefined}
                    onValueChange={(value) => {
                      if (value === '__delete_current_theme__') {
                        setDeleteThemeDialogOpen(true)
                        return
                      }
                      const nextId = Number(value)
                      if (!Number.isNaN(nextId) && nextId !== selectedTheme?.id) {
                        selectThemeMutation.mutate(nextId)
                      }
                    }}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="选择主题" />
                    </SelectTrigger>
                    <SelectContent>
                      {themes.map((theme) => (
                        <SelectItem key={theme.id} value={String(theme.id)}>
                          {theme.template_name}
                        </SelectItem>
                      ))}
                      <SelectSeparator />
                      <SelectItem
                        value="__delete_current_theme__"
                        disabled={!selectedTheme || themes.length <= 1}
                        className="text-destructive focus:text-destructive"
                      >
                        删除当前主题
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto">
            <Tree
              items={templateLibraryItems}
              value={selectedTreeValue}
              defaultExpandedIds={['group:list', 'group:content', 'group:component']}
              onValueChange={handleSelectLibraryItem}
              renderAction={renderTreeAction}
              canDrag={canDragTreeItem}
              onItemMove={handleTemplateTreeMove}
              className="pr-1"
            />
            <div className="mt-4 space-y-3 rounded border p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">主题组件模板</div>
                  <div className="text-xs text-muted-foreground">
                    当前主题组件模板 {themeComponentTemplates.length} 个，运行时可用组件 {resolvedThemeComponentCount} 个。
                  </div>
                </div>
              </div>
              {themeComponentTemplates.length > 0 ? (
                <div className="space-y-2">
                  {themeComponentTemplates.map((template) => (
                    <div key={template.id} className="rounded bg-muted/50 px-2 py-1.5 text-sm">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{template.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{template.code}</div>
                      </div>
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
                <div className="flex flex-1 items-center">
                  <Popover open={versionPopoverOpen} onOpenChange={setVersionPopoverOpen}>
                    <PopoverTrigger asChild>
                      <Button type="button" variant="outline" className="shrink-0">
                        历史版本
                        <Badge variant="secondary" className="ml-2">{versionsData?.data?.length || 0}</Badge>
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[680px] p-0">
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
              ) : <div className="flex-1" />}
              <div className="flex gap-2">
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
                暂无可编辑模板，可点击左侧分组右侧的 + 新建模板。
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
      <AlertDialog open={deleteThemeDialogOpen} onOpenChange={setDeleteThemeDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除主题</AlertDialogTitle>
            <AlertDialogDescription>
              {themes.length <= 1
                ? '至少需要保留一个主题，当前主题无法删除。'
                : `确定删除当前主题“${selectedTheme?.template_name || ''}”吗？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (selectedTheme && themes.length > 1) {
                  deleteThemeMutation.mutate(selectedTheme.id)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={templateDeleteDialogOpen}
        onOpenChange={(open) => {
          setTemplateDeleteDialogOpen(open)
          if (!open) {
            setDeletingTreeItem(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除模板</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingTreeItem?.template
                ? `确定删除模板“${deletingTreeItem.template.name}”吗？`
                : '确定删除当前模板吗？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingTreeItem) {
                  deleteTemplateMutation.mutate(deletingTreeItem)
                }
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog
        open={renameDialogOpen}
        onOpenChange={(open) => {
          setRenameDialogOpen(open)
          if (!open) {
            setRenamingTreeItem(null)
            setRenameForm({ name: '', code: '' })
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>重命名模板</DialogTitle>
            <DialogDescription>
              {renamingTreeItem?.template
                ? `修改模板“${renamingTreeItem.template.name}”的名称和 ID。`
                : '修改当前模板信息。'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              value={renameForm.name}
              onChange={(event) => setRenameForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="请输入模板名称"
            />
            <Input
              value={renameForm.code}
              onChange={(event) => setRenameForm((current) => ({ ...current, code: event.target.value }))}
              placeholder="请输入模板ID"
              onKeyDown={(event) => {
                if (event.key === 'Enter' && renamingTreeItem?.template?.id && !renameTemplateMutation.isPending) {
                  renameTemplateMutation.mutate({
                    templateId: renamingTreeItem.template.id,
                    name: renameForm.name,
                    code: renameForm.code,
                  })
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setRenameDialogOpen(false)
                  setRenamingTreeItem(null)
                  setRenameForm({ name: '', code: '' })
                }}
              >
                取消
              </Button>
              <Button
                type="button"
                onClick={() => {
                  if (renamingTreeItem?.template?.id) {
                    renameTemplateMutation.mutate({
                      templateId: renamingTreeItem.template.id,
                      name: renameForm.name,
                      code: renameForm.code,
                    })
                  }
                }}
                disabled={!renameForm.name.trim() || !renameForm.code.trim() || renameTemplateMutation.isPending}
              >
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function buildNewThemePayload(baseTheme: TemplateVariant | null, nextIndex: number): Partial<TemplateVariant> {
  return {
    template_name: `新主题 ${nextIndex}`,
    source_theme_id: baseTheme?.id,
    is_selected: 0,
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
