import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contentModelsApi, templateVariantsApi, templatesApi } from '@/api/advanced'
import { columnNodesApi } from '@/api/column-nodes'
import { columnsApi } from '@/api/columns'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { SidebarTreeMenu, type SidebarTreeMenuItem } from '@/components/SidebarTreeMenu'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'
import { Ellipsis, Plus, Trash2 } from 'lucide-react'
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
import { toast } from 'sonner'
import { filterTopicColumns } from '@/lib/topic-columns'
import type { Column, ColumnNode, Template, TemplateBinding } from '@/types'
import ColumnNodeFormDialog from '@/components/ColumnNodeFormDialog'
import ManualColumnFormDialog from '@/components/ManualColumnFormDialog'
import type { ManualColumnFormValue } from '@/components/ManualColumnFormDialog'

const DEFAULT_TEMPLATE_VALUE = '__default__'

const INVALIDATED_CONTENT_MODELS = ['product', 'news'] as const

type ColumnNodeTarget = {
  id: number
  columnId: number
  rootColumnId: number
  name: string
  targetType: 'column'
  renderDriver: string
} | null

interface RootColumnNodeForm {
  name: string
  contentModelId: string
  dirName: string
  detailRule: string
  listTemplateId: string
  contentTemplateId: string
}

type ManualColumnKind = 'link' | 'single'
interface ManagedColumnTreeNode {
  column: Column
  children: ManagedColumnTreeNode[]
}

const COLUMN_KIND_META: Record<'node' | ManualColumnKind, { createLabel: string }> = {
  node: {
    createLabel: '新增栏目',
  },
  link: {
    createLabel: '新增链接',
  },
  single: {
    createLabel: '新增单页',
  },
}

export default function ColumnsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedColumnId = Number.parseInt(searchParams.get('columnId') || '0', 10) || 0
  const queryClient = useQueryClient()

  const [nodeFormOpen, setNodeFormOpen] = useState(false)
  const [creatingNodeTarget, setCreatingNodeTarget] = useState<ColumnNodeTarget>(null)
  const [nodeDeleteDialogOpen, setNodeDeleteDialogOpen] = useState(false)
  const [deletingNodeTarget, setDeletingNodeTarget] = useState<ColumnNodeTarget>(null)
  const [rootNodeDialogOpen, setRootNodeDialogOpen] = useState(false)
  const [rootNodeForm, setRootNodeForm] = useState<RootColumnNodeForm>({
    name: '',
    contentModelId: '',
    dirName: '',
    detailRule: '{id}.html',
    listTemplateId: DEFAULT_TEMPLATE_VALUE,
    contentTemplateId: DEFAULT_TEMPLATE_VALUE,
  })
  const [manualColumnDialogOpen, setManualColumnDialogOpen] = useState(false)
  const [manualColumnDialogKind, setManualColumnDialogKind] = useState<ManualColumnKind>('link')
  const [manualColumnDeleteDialogOpen, setManualColumnDeleteDialogOpen] = useState(false)
  const [deletingManualColumn, setDeletingManualColumn] = useState<Column | null>(null)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const defaultLanguageCode = languagesData?.data?.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const { data: columnsData, isLoading: columnsLoading } = useQuery({
    queryKey: ['columns', defaultLanguageCode],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode }),
  })
  const { data: selectedThemeData } = useQuery({
    queryKey: ['selected-theme'],
    queryFn: () => templateVariantsApi.getSelected(),
  })
  const selectedThemeId = selectedThemeData?.data?.id

  const { data: templatesData } = useQuery({
    queryKey: ['templates', selectedThemeId ?? 0],
    queryFn: () => templatesApi.list(undefined, selectedThemeId),
    enabled: Boolean(selectedThemeId),
  })

  const { data: bindingsData } = useQuery({
    queryKey: ['template-bindings', selectedThemeId ?? 0],
    queryFn: () => templatesApi.listBindings(selectedThemeId),
    enabled: Boolean(selectedThemeId),
  })
  const { data: contentModelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
    enabled: true,
  })

  const columns = columnsData?.data || []
  const managedColumns = useMemo(() => filterTopicColumns(columns), [columns])
  const selectedColumn = managedColumns.find((column) => column.id === selectedColumnId) || null

  const nodeFormRootColumnId = creatingNodeTarget?.rootColumnId || 0
  const nodeFormRootColumn = nodeFormRootColumnId
    ? managedColumns.find((item) => item.id === nodeFormRootColumnId) || null
    : null

  const deleteNodeMutation = useMutation({
    mutationFn: ({ rootColumnId, id }: { rootColumnId: number; id: number }) => columnNodesApi.delete(rootColumnId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-nodes'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      INVALIDATED_CONTENT_MODELS.forEach((modelCode) => {
        queryClient.invalidateQueries({ queryKey: ['content-items', modelCode] })
      })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('删除成功')
      if (deletingNodeTarget?.columnId === selectedColumn?.id) {
        setSearchParams({})
      }
      setNodeDeleteDialogOpen(false)
      setDeletingNodeTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const createRootNodeMutation = useMutation({
    mutationFn: async () => {
      const name = rootNodeForm.name.trim()
      if (!name) {
        throw new Error('请输入栏目名称')
      }
      const contentModelId = Number.parseInt(rootNodeForm.contentModelId, 10)
      if (!contentModelId) {
        throw new Error('请选择内容模型')
      }
      if (!rootNodeForm.dirName.trim()) {
        throw new Error('请输入目录名')
      }

      const response = await columnsApi.create({
        base: {
          parent_id: 0,
          column_type: 'list',
          content_model_id: contentModelId,
          custom_url: '',
          dir_name: rootNodeForm.dirName.trim(),
          detail_rule: rootNodeForm.detailRule.trim() || '{id}.html',
          sort_order: 0,
          is_visible: 1,
        },
        translations: {
          [defaultLanguageCode]: {
            name,
          },
        },
      })
      const columnId = response.data?.id
      if (!columnId) {
        throw new Error('栏目创建失败')
      }

      await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'list', rootNodeForm.listTemplateId)
      await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'content', rootNodeForm.contentTemplateId)

      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['column-nodes'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已创建')
      setRootNodeDialogOpen(false)
      resetRootNodeForm()
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '创建失败')
    },
  })

  const createManualColumnMutation = useMutation({
    mutationFn: async ({ value, templateIds }: { value: ManualColumnFormValue; templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string } }) => {
      const response = await columnsApi.create(value)
      const columnId = response.data?.id
      if (!columnId) {
        throw new Error('栏目创建失败')
      }
      if (value.base.column_type === 'single') {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'single', templateIds.singleTemplateId)
      } else {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'list', templateIds.listTemplateId)
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'content', templateIds.contentTemplateId)
      }
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已创建')
      setManualColumnDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '创建失败')
    },
  })

  const updateManualColumnMutation = useMutation({
    mutationFn: async ({ id, value, templateIds }: { id: number; value: ManualColumnFormValue; templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string } }) => {
      const response = await columnsApi.update(id, value)
      if (value.base.column_type === 'single') {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'single', templateIds.singleTemplateId, bindings)
        await deleteTemplateBindingIfExists('column', id, 'list', bindings)
        await deleteTemplateBindingIfExists('column', id, 'content', bindings)
      } else {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'list', templateIds.listTemplateId, bindings)
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'content', templateIds.contentTemplateId, bindings)
        await deleteTemplateBindingIfExists('column', id, 'single', bindings)
      }
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新失败')
    },
  })

  const updateColumnMutation = useMutation({
    mutationFn: async ({ id, value, templateIds }: { id: number; value: ManualColumnFormValue; templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string } }) => {
      const response = await columnsApi.update(id, value.base.is_visible !== undefined ? {
        parent_id: value.base.parent_id,
        content_model_id: value.base.content_model_id,
        dir_name: value.base.dir_name,
        detail_rule: value.base.detail_rule,
        sort_order: value.base.sort_order,
        is_visible: value.base.is_visible,
        translations: value.translations,
      } : value)
      if (value.base.column_type === 'single') {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'single', templateIds.singleTemplateId, bindings)
        await deleteTemplateBindingIfExists('column', id, 'list', bindings)
        await deleteTemplateBindingIfExists('column', id, 'content', bindings)
      } else {
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'list', templateIds.listTemplateId, bindings)
        await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', id, 'content', templateIds.contentTemplateId, bindings)
        await deleteTemplateBindingIfExists('column', id, 'single', bindings)
      }
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新失败')
    },
  })

  const deleteManualColumnMutation = useMutation({
    mutationFn: (id: number) => columnsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已删除')
      if (deletingManualColumn?.id === selectedColumn?.id) {
        setSearchParams({})
      }
      setManualColumnDeleteDialogOpen(false)
      setDeletingManualColumn(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const templates = templatesData?.data || []
  const bindings = bindingsData?.data || []
  const contentModels = contentModelsData?.data || []
  const listTemplates = templates.filter((template: Template) => template.type === 'list')
  const contentTemplates = templates.filter((template: Template) => template.type === 'content')
  const singleTemplates = templates.filter((template: Template) => template.type === 'single')
  const handleSelectColumn = (column: Column) => {
    setSearchParams({ columnId: String(column.id) })
  }

  const handleCreateChildNode = (column: Column) => {
    const target = getColumnNodeTarget(column)
    if (!target) {
      return
    }

    setCreatingNodeTarget(target)
    setNodeFormOpen(true)
  }

  const resetRootNodeForm = () => {
    setRootNodeForm({
      name: '',
      contentModelId: '',
      dirName: '',
      detailRule: '{id}.html',
      listTemplateId: DEFAULT_TEMPLATE_VALUE,
      contentTemplateId: DEFAULT_TEMPLATE_VALUE,
    })
  }

  const handleRootNodeDialogOpenChange = (open: boolean) => {
    setRootNodeDialogOpen(open)
    if (!open) {
      resetRootNodeForm()
    }
  }

  const handleManualColumnDialogOpenChange = (open: boolean) => {
    setManualColumnDialogOpen(open)
  }

  const handleCreateRootNode = (event: React.FormEvent) => {
    event.preventDefault()
    if (rootNodeForm.listTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择列表模板')
      return
    }
    if (rootNodeForm.contentTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择内容模板')
      return
    }
    createRootNodeMutation.mutate()
  }

  const handleCreateManualColumn = (kind: ManualColumnKind) => {
    setManualColumnDialogKind(kind)
    setManualColumnDialogOpen(true)
  }

  const handleSubmitManualColumn = (value: ManualColumnFormValue, templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string }) => {
    createManualColumnMutation.mutate({ value, templateIds })
  }

  const handleDeleteManualColumn = (column: Column) => {
    setDeletingManualColumn(column)
    setManualColumnDeleteDialogOpen(true)
  }

  const handleDeleteColumnNode = (column: Column) => {
    const target = getColumnNodeTarget(column)
    if (target) {
      setDeletingNodeTarget(target)
      setNodeDeleteDialogOpen(true)
    }
  }

  const handleNodeFormOpenChange = (open: boolean) => {
    setNodeFormOpen(open)
    if (!open) {
      setCreatingNodeTarget(null)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      INVALIDATED_CONTENT_MODELS.forEach((modelCode) => {
        queryClient.invalidateQueries({ queryKey: ['content-items', modelCode] })
      })
      queryClient.invalidateQueries({ queryKey: ['column-nodes'] })
    }
  }

  const confirmDeleteNode = () => {
    if (!deletingNodeTarget) {
      return
    }
    deleteNodeMutation.mutate({ rootColumnId: deletingNodeTarget.rootColumnId, id: deletingNodeTarget.id })
  }

  const renderColumnTreeAction = (column: Column) => {
    const nodeTarget = getColumnNodeTarget(column)
    const canEditManualColumn = isEditableManualColumn(column)
    const hasActions = canEditManualColumn || Boolean(nodeTarget)

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0 opacity-0 transition-opacity group-hover/sidebar-tree-row:opacity-100 group-focus-within/sidebar-tree-row:opacity-100 data-[state=open]:opacity-100"
            aria-label={`${column.name}栏目设置`}
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!hasActions ? (
            <DropdownMenuItem disabled>
              <Ellipsis className="size-4" />
              暂无可用操作
            </DropdownMenuItem>
          ) : null}

          {nodeTarget ? (
            <DropdownMenuItem onSelect={() => handleCreateChildNode(column)}>
              <Plus className="size-4" />
              添加子栏目
            </DropdownMenuItem>
          ) : null}

          {(canEditManualColumn || nodeTarget) ? <DropdownMenuSeparator /> : null}

          {canEditManualColumn ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => handleDeleteManualColumn(column)}
            >
              <Trash2 className="size-4" />
              删除栏目
            </DropdownMenuItem>
          ) : null}

          {nodeTarget ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => handleDeleteColumnNode(column)}
            >
              <Trash2 className="size-4" />
              删除栏目
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  const renderColumnTree = () => {
    const tree = buildManagedColumnTree(managedColumns)
    const items = tree.map((node) => toColumnSidebarItem(
      node,
      selectedColumn?.id || 0,
      handleSelectColumn,
      renderColumnTreeAction,
    ))

    return (
      <Sidebar collapsible="none" className="min-h-0 w-full overflow-hidden bg-transparent">
        <SidebarContent>
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              {items.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">暂无栏目</p>
              ) : (
                <SidebarTreeMenu items={items} />
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    )
  }

  const selectedEditingColumnId = selectedColumn?.id || 0
  const selectedManualListBinding = useMemo(() =>
    selectedEditingColumnId
      ? bindings.find((binding) => (
        binding.target_type === 'column'
        && binding.target_id === selectedEditingColumnId
        && binding.template_type === 'list'
      ))
      : null
  , [selectedEditingColumnId, bindings])

  const selectedManualContentBinding = useMemo(() =>
    selectedEditingColumnId
      ? bindings.find((binding) => (
        binding.target_type === 'column'
        && binding.target_id === selectedEditingColumnId
        && binding.template_type === 'content'
      ))
      : null
  , [selectedEditingColumnId, bindings])

  const selectedManualSingleBinding = useMemo(() =>
    selectedEditingColumnId
      ? bindings.find((binding) => (
        binding.target_type === 'column'
        && binding.target_id === selectedEditingColumnId
        && binding.template_type === 'single'
      ))
      : null
  , [selectedEditingColumnId, bindings])

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="flex min-h-0 flex-col overflow-hidden">
        <div className="flex justify-end pb-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon" aria-label="新增栏目">
                <Plus className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setRootNodeDialogOpen(true)}>
                <Plus className="size-4" />
                {COLUMN_KIND_META.node.createLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleCreateManualColumn('link')}>
                <Plus className="size-4" />
                {COLUMN_KIND_META.link.createLabel}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => handleCreateManualColumn('single')}>
                <Plus className="size-4" />
                {COLUMN_KIND_META.single.createLabel}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {columnsLoading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            renderColumnTree()
          )}
        </div>
      </div>

      <div className="min-h-0 overflow-y-auto pr-1">
        {!selectedColumn ? (
          <div className="flex min-h-64 items-center justify-center rounded border p-8 text-center text-muted-foreground">
            请选择左侧栏目
          </div>
        ) : getColumnNodeTarget(selectedColumn) ? (
          <ColumnNodeFormDialog
            key={`column-node-panel-${selectedColumn.id}`}
            open
            onOpenChange={() => undefined}
            presentation="panel"
            rootColumn={columns.find((item) => item.id === getColumnNodeTarget(selectedColumn)?.rootColumnId) || selectedColumn}
            node={selectedColumn as unknown as ColumnNode}
            mode="edit"
          />
        ) : (
          <ManualColumnFormDialog
            key={`column-panel-${selectedColumn.id}`}
            open
            onOpenChange={() => undefined}
            presentation="panel"
            mode="edit"
            column={selectedColumn}
            initialKind={selectedColumn.column_type === 'single' ? 'single' : 'link'}
            columns={managedColumns}
            contentModels={contentModels}
            listTemplates={listTemplates}
            contentTemplates={contentTemplates}
            singleTemplates={singleTemplates}
            initialListTemplateId={selectedManualListBinding?.template_id ? String(selectedManualListBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
            initialContentTemplateId={selectedManualContentBinding?.template_id ? String(selectedManualContentBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
            initialSingleTemplateId={selectedManualSingleBinding?.template_id ? String(selectedManualSingleBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
            submitting={updateManualColumnMutation.isPending || updateColumnMutation.isPending}
            onSubmit={(value, templateIds) => {
              if (isEditableManualColumn(selectedColumn)) {
                updateManualColumnMutation.mutate({ id: selectedColumn.id, value, templateIds })
                return
              }
              updateColumnMutation.mutate({ id: selectedColumn.id, value, templateIds })
            }}
          />
        )}
      </div>

      <Dialog open={rootNodeDialogOpen} onOpenChange={handleRootNodeDialogOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>新增一级栏目</DialogTitle>
            <DialogDescription>创建一个列表式栏目根节点，用于承载分类树和内容列表。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRootNode} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="root-column-name">栏目名称 *</Label>
              <Input
                id="root-column-name"
                value={rootNodeForm.name}
                onChange={(event) => setRootNodeForm({ ...rootNodeForm, name: event.target.value })}
                placeholder="请输入栏目名称"
              />
            </div>
            <div className="space-y-2">
              <Label>内容模型</Label>
              <Select
                value={rootNodeForm.contentModelId}
                onValueChange={(value) => setRootNodeForm({ ...rootNodeForm, contentModelId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {contentModels.map((model) => (
                    <SelectItem key={model.id} value={String(model.id)}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor="root-column-dir-name">目录名</Label>
                <Input
                  id="root-column-dir-name"
                  value={rootNodeForm.dirName}
                  onChange={(event) => setRootNodeForm({ ...rootNodeForm, dirName: event.target.value })}
                  placeholder="catalog"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="root-column-detail-rule">内容页规则</Label>
              <Input
                id="root-column-detail-rule"
                value={rootNodeForm.detailRule}
                onChange={(event) => setRootNodeForm({ ...rootNodeForm, detailRule: event.target.value })}
                placeholder="{id}.html"
              />
            </div>
            <div className="space-y-2">
              <Label>列表模板</Label>
              <Select
                value={rootNodeForm.listTemplateId}
                onValueChange={(value) => setRootNodeForm({ ...rootNodeForm, listTemplateId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_TEMPLATE_VALUE}>请选择列表模板</SelectItem>
                  {listTemplates.map((template: Template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>内容模板</Label>
              <Select
                value={rootNodeForm.contentTemplateId}
                onValueChange={(value) => setRootNodeForm({ ...rootNodeForm, contentTemplateId: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_TEMPLATE_VALUE}>请选择内容模板</SelectItem>
                  {contentTemplates.map((template: Template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleRootNodeDialogOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createRootNodeMutation.isPending}>
                {createRootNodeMutation.isPending ? '创建中...' : '确定'}
              </Button>
            </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>

      {manualColumnDialogOpen ? (
        <ManualColumnFormDialog
          open={manualColumnDialogOpen}
          onOpenChange={handleManualColumnDialogOpenChange}
          mode="create"
          initialKind={manualColumnDialogKind}
          columns={managedColumns}
          contentModels={contentModels}
          listTemplates={listTemplates}
          contentTemplates={contentTemplates}
          singleTemplates={singleTemplates}
          initialListTemplateId={selectedManualListBinding?.template_id ? String(selectedManualListBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
          initialContentTemplateId={selectedManualContentBinding?.template_id ? String(selectedManualContentBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
          initialSingleTemplateId={selectedManualSingleBinding?.template_id ? String(selectedManualSingleBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
          submitting={createManualColumnMutation.isPending}
          onSubmit={handleSubmitManualColumn}
        />
      ) : null}

      {nodeFormOpen && nodeFormRootColumn ? (
        <ColumnNodeFormDialog
          open={nodeFormOpen}
          onOpenChange={handleNodeFormOpenChange}
          rootColumn={nodeFormRootColumn}
          currentParentId={creatingNodeTarget?.id || 0}
          mode="create"
        />
      ) : null}

      <AlertDialog open={nodeDeleteDialogOpen} onOpenChange={setNodeDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除栏目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingNodeTarget?.name}」吗？此操作无法撤销；如果该栏目下有子栏目或内容，删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteNode}
              disabled={deleteNodeMutation.isPending}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={manualColumnDeleteDialogOpen} onOpenChange={setManualColumnDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除栏目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingManualColumn?.name}」吗？如果它仍有子栏目，将无法删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingManualColumn && deleteManualColumnMutation.mutate(deletingManualColumn.id)}
              disabled={deleteManualColumnMutation.isPending}
            >
              确定
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

async function saveRequiredTemplateBinding(
  themeId: number,
  targetType: Extract<TemplateBinding['target_type'], 'column'>,
  targetId: number,
  templateType: Extract<TemplateBinding['template_type'], 'list' | 'content' | 'single'>,
  templateId: string,
  _bindings: TemplateBinding[] = []
) {
  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    throw new Error(`missing required ${templateType} template binding`)
  }

  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: targetType,
    target_id: targetId,
    template_type: templateType,
    template_id: Number(templateId),
  })
}

function buildManagedColumnTree(columns: Column[]): ManagedColumnTreeNode[] {
  const nodes = new Map<number, ManagedColumnTreeNode>()
  const roots: ManagedColumnTreeNode[] = []

  for (const column of columns) {
    if (column.column_type === 'list' || column.column_type === 'link' || column.column_type === 'single') {
      nodes.set(column.id, { column, children: [] })
    }
  }

  for (const node of nodes.values()) {
    const parent = nodes.get(Number(node.column.parent_id || 0))
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortManagedColumnTree(roots)
  return roots
}

function sortManagedColumnTree(nodes: ManagedColumnTreeNode[]) {
  nodes.sort((left, right) => {
    const sortOrderDifference = Number(left.column.sort_order || 0) - Number(right.column.sort_order || 0)
    return sortOrderDifference || left.column.id - right.column.id
  })
  nodes.forEach((node) => sortManagedColumnTree(node.children))
}

function toColumnSidebarItem(
  node: ManagedColumnTreeNode,
  selectedColumnId: number,
  onSelect: (column: Column) => void,
  renderAction: (column: Column) => ReactNode,
): SidebarTreeMenuItem {
  return {
    id: node.column.id,
    label: node.column.name || '未命名栏目',
    active: selectedColumnId === node.column.id,
    onSelect: () => onSelect(node.column),
    defaultOpen: true,
    className: 'h-9',
    action: renderAction(node.column),
    children: node.children.map((child) => toColumnSidebarItem(child, selectedColumnId, onSelect, renderAction)),
  }
}

async function deleteTemplateBindingIfExists(
  targetType: Extract<TemplateBinding['target_type'], 'column'>,
  targetId: number,
  templateType: Extract<TemplateBinding['template_type'], 'list' | 'content' | 'single'>,
  bindings: TemplateBinding[] = []
) {
  const existing = bindings.find((binding) => (
    binding.target_type === targetType
    && binding.target_id === targetId
    && binding.template_type === templateType
  ))

  if (existing?.id) {
    await templatesApi.deleteBinding(existing.id)
  }
}

function isEditableManualColumn(column: Column) {
  return column.column_type === 'link' || (column.column_type === 'single' && String(column.column_semantics?.render_driver || '') !== 'page_tree')
}

function getColumnNodeTarget(column: Column): ColumnNodeTarget {
  const renderDriver = String(column.column_semantics?.render_driver || '')
  const rootColumnId = Number(column.column_semantics?.root_column_id || column.id || 0)
  if (!rootColumnId || !['managed_column', 'section', 'page_tree'].includes(renderDriver)) {
    return null
  }
  return {
    id: column.id,
    columnId: column.id,
    rootColumnId,
    name: column.name,
    targetType: 'column',
    renderDriver,
  }
}
