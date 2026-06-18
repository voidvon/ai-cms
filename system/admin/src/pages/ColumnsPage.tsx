import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contentModelsApi, templateVariantsApi, templatesApi } from '@/api/advanced'
import { columnCategoriesApi } from '@/api/column-categories'
import { columnsApi } from '@/api/columns'
import { languagesApi } from '@/api/languages'
import { newsApi } from '@/api/news'
import { productsApi } from '@/api/products'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tree, type TreeItemData } from '@/components/ui/tree'
import { Ellipsis, ExternalLink, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react'
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
import CategoryTemplateBindingDialog from '@/components/CategoryTemplateBindingDialog'
import ColumnCategoryFormDialog from '@/components/ColumnCategoryFormDialog'
import ManualColumnFormDialog, { type ManualColumnFormValue } from '@/components/ManualColumnFormDialog'
import NewsFormDialog from '@/components/NewsFormDialog'
import ProductFormDialog from '@/components/ProductFormDialog'
import { toast } from 'sonner'
import type { Column, ColumnCategory, ContentModel, News, Product, Template, TemplateBinding } from '@/types'

const DEFAULT_TEMPLATE_VALUE = '__default__'

interface ColumnTreeNode extends Column {
  children: ColumnTreeNode[]
}

type DeleteTarget =
  | { type: 'product'; id: number }
  | { type: 'news'; id: number }
  | null

type EditingCategoryTarget =
  | { rootColumnId: number; id: number }
  | null

type EditingColumnTarget =
  | Column
  | null

type CategoryTreeTarget = {
  id: number
  columnId: number
  rootColumnId: number
  name: string
  targetType: 'column'
  renderDriver: string
} | null

interface RootCategoryForm {
  name: string
  contentModelId: string
  dirName: string
  routePath: string
  detailRule: string
  listTemplateId: string
  contentTemplateId: string
}

type ManualColumnKind = 'link' | 'single'
type ColumnDisplayKind = 'category' | ManualColumnKind

const COLUMN_KIND_META: Record<ColumnDisplayKind, { label: string; createLabel: string; showTreeBadge: boolean }> = {
  category: {
    label: '栏目',
    createLabel: '新增栏目',
    showTreeBadge: false,
  },
  link: {
    label: '链接',
    createLabel: '新增链接',
    showTreeBadge: true,
  },
  single: {
    label: '单页',
    createLabel: '新增单页',
    showTreeBadge: true,
  },
}

export default function ColumnsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedColumnId = Number.parseInt(searchParams.get('columnId') || '0', 10) || 0
  const [page, setPage] = useState(1)
  const limit = 50
  const queryClient = useQueryClient()

  const [productFormOpen, setProductFormOpen] = useState(false)
  const [newsFormOpen, setNewsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | undefined>()
  const [editingNews, setEditingNews] = useState<News | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null)
  const [categoryFormOpen, setCategoryFormOpen] = useState(false)
  const [categoryFormMode, setCategoryFormMode] = useState<'create' | 'edit'>('edit')
  const [editingCategoryTarget, setEditingCategoryTarget] = useState<EditingCategoryTarget>(null)
  const [editingColumnTarget, setEditingColumnTarget] = useState<EditingColumnTarget>(null)
  const [creatingCategoryTarget, setCreatingCategoryTarget] = useState<CategoryTreeTarget>(null)
  const [bindingCategoryTarget, setBindingCategoryTarget] = useState<CategoryTreeTarget>(null)
  const [categoryDeleteDialogOpen, setCategoryDeleteDialogOpen] = useState(false)
  const [deletingCategoryTarget, setDeletingCategoryTarget] = useState<CategoryTreeTarget>(null)
  const [rootCategoryDialogOpen, setRootCategoryDialogOpen] = useState(false)
  const [rootCategoryForm, setRootCategoryForm] = useState<RootCategoryForm>({
    name: '',
    contentModelId: '',
    dirName: '',
    routePath: '',
    detailRule: '{id}.html',
    listTemplateId: DEFAULT_TEMPLATE_VALUE,
    contentTemplateId: DEFAULT_TEMPLATE_VALUE,
  })
  const [manualColumnDialogOpen, setManualColumnDialogOpen] = useState(false)
  const [manualColumnDialogMode, setManualColumnDialogMode] = useState<'create' | 'edit'>('create')
  const [manualColumnDialogKind, setManualColumnDialogKind] = useState<ManualColumnKind>('link')
  const [editingManualColumn, setEditingManualColumn] = useState<Column | null>(null)
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

  const { data: editingCategoryData } = useQuery({
    queryKey: ['column-categories', editingCategoryTarget?.rootColumnId, 'detail', editingCategoryTarget?.id],
    queryFn: () => columnCategoriesApi.get(editingCategoryTarget!.rootColumnId, editingCategoryTarget!.id),
    enabled: categoryFormOpen && categoryFormMode === 'edit' && Boolean(editingCategoryTarget?.rootColumnId) && Boolean(editingCategoryTarget?.id),
  })

  const { data: templatesData } = useQuery({
    queryKey: ['templates', selectedThemeId ?? 0],
    queryFn: () => templatesApi.list(undefined, selectedThemeId),
    enabled: (rootCategoryDialogOpen || manualColumnDialogOpen || Boolean(bindingCategoryTarget)) && Boolean(selectedThemeId),
  })

  const { data: bindingsData } = useQuery({
    queryKey: ['template-bindings', selectedThemeId ?? 0],
    queryFn: () => templatesApi.listBindings(selectedThemeId),
    enabled: (manualColumnDialogOpen || Boolean(bindingCategoryTarget)) && Boolean(selectedThemeId),
  })
  const { data: contentModelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
    enabled: true,
  })

  const columns = columnsData?.data || []
  const columnTree = useMemo(() => buildColumnTree(columns), [columns])
  const columnTreeItems = useMemo<TreeItemData<Column>[]>(
    () => columnTree.map(toTreeItem),
    [columnTree]
  )
  const selectedColumn = columns.find((column) => column.id === selectedColumnId)
    || columns.find((column) => column.column_semantics?.is_root)
    || columns[0]
    || null

  const selectedColumnType = selectedColumn?.column_type || ''
  const selectedModelCode = selectedColumn?.model_code || ''
  const selectedRenderDriver = String(selectedColumn?.column_semantics?.render_driver || '')
  const isProductColumn = selectedColumnType === 'list' && selectedModelCode === 'product'
  const isNewsColumn = selectedColumnType === 'list' && selectedModelCode === 'news'
  const isManualLinkColumn = selectedColumnType === 'link'
  const isManualSingleColumn = selectedColumnType === 'single' && selectedRenderDriver !== 'page_tree'
  const isManualColumn = isManualLinkColumn || isManualSingleColumn
  const categoryFormRootColumnId = editingCategoryTarget?.rootColumnId || creatingCategoryTarget?.rootColumnId || 0
  const categoryFormRootColumn = categoryFormRootColumnId
    ? columns.find((item) => item.id === categoryFormRootColumnId) || null
    : null

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'columns', selectedColumn?.id || 0, page, limit],
    queryFn: () => productsApi.list({
      page,
      limit,
      column_id: isProductColumn ? (selectedColumn?.id || undefined) : undefined,
      include_descendants: isProductColumn ? 1 : undefined,
      language: defaultLanguageCode,
    }),
    enabled: isProductColumn,
    staleTime: 0,
  })

  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ['news', 'columns', selectedColumn?.id || 0, page, limit],
    queryFn: () => newsApi.list({
      page,
      limit,
      column_id: isNewsColumn ? (selectedColumn?.id || undefined) : undefined,
      include_descendants: isNewsColumn ? 1 : undefined,
      language: defaultLanguageCode,
    }),
    enabled: isNewsColumn,
    staleTime: 0,
  })

  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => productsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const deleteNewsMutation = useMutation({
    mutationFn: (id: number) => newsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const deleteCategoryMutation = useMutation({
    mutationFn: ({ rootColumnId, id }: { rootColumnId: number; id: number }) => columnCategoriesApi.delete(rootColumnId, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('删除成功')
      if (deletingCategoryTarget?.columnId === selectedColumn?.id) {
        setSearchParams({})
      }
      setCategoryDeleteDialogOpen(false)
      setDeletingCategoryTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const createRootCategoryMutation = useMutation({
    mutationFn: async () => {
      const name = rootCategoryForm.name.trim()
      if (!name) {
        throw new Error('请输入栏目名称')
      }
      const contentModelId = Number.parseInt(rootCategoryForm.contentModelId, 10)
      if (!contentModelId) {
        throw new Error('请选择内容模型')
      }
      const routePath = rootCategoryForm.routePath.trim()
      if (!routePath) {
        throw new Error('请输入访问路径')
      }

      const response = await columnsApi.create({
        base: {
          parent_id: 0,
          column_type: 'list',
          content_model_id: contentModelId,
          custom_url: '',
          dir_name: rootCategoryForm.dirName.trim(),
          route_path: routePath,
          detail_rule: rootCategoryForm.detailRule.trim() || '{id}.html',
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

      await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'list', rootCategoryForm.listTemplateId)
      await saveRequiredTemplateBinding(selectedThemeId || 0, 'column', columnId, 'content', rootCategoryForm.contentTemplateId)

      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['column-categories'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('栏目已创建')
      setRootCategoryDialogOpen(false)
      resetRootCategoryForm()
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
      setEditingManualColumn(null)
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
      setManualColumnDialogOpen(false)
      setEditingManualColumn(null)
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
        route_path: value.base.route_path,
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
      setManualColumnDialogOpen(false)
      setEditingManualColumn(null)
      setEditingColumnTarget(null)
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

  const activeItems = isNewsColumn ? (newsData?.items || []) : (isProductColumn ? (productsData?.items || []) : [])
  const activePagination = isNewsColumn ? newsData?.pagination : (isProductColumn ? productsData?.pagination : undefined)
  const activeLoading = isNewsColumn ? newsLoading : (isProductColumn ? productsLoading : false)
  const pageTitle = selectedColumn?.name || '栏目'
  const templates = templatesData?.data || []
  const bindings = bindingsData?.data || []
  const contentModels = contentModelsData?.data || []
  const listTemplates = templates.filter((template: Template) => template.type === 'list')
  const contentTemplates = templates.filter((template: Template) => template.type === 'content')
  const singleTemplates = templates.filter((template: Template) => template.type === 'single')
  const selectedCategoryBindings = selectedColumn
    ? bindings.filter((binding) => binding.target_type === 'column' && binding.target_id === selectedColumn.id)
    : []

  const handleSelectColumn = (column: TreeItemData<Column>) => {
    setPage(1)
    setSearchParams({ columnId: String(column.id) })
  }

  const handleCreateChildCategory = (column: Column) => {
    const target = getCategoryTreeTarget(column)
    if (!target) {
      return
    }

    setCategoryFormMode('create')
    setCreatingCategoryTarget(target)
    setEditingCategoryTarget(null)
    setCategoryFormOpen(true)
  }

  const resetRootCategoryForm = () => {
    setRootCategoryForm({
      name: '',
      contentModelId: '',
      dirName: '',
      routePath: '',
      detailRule: '{id}.html',
      listTemplateId: DEFAULT_TEMPLATE_VALUE,
      contentTemplateId: DEFAULT_TEMPLATE_VALUE,
    })
  }

  const handleRootCategoryDialogOpenChange = (open: boolean) => {
    setRootCategoryDialogOpen(open)
    if (!open) {
      resetRootCategoryForm()
    }
  }

  const handleManualColumnDialogOpenChange = (open: boolean) => {
    setManualColumnDialogOpen(open)
    if (!open) {
      setEditingManualColumn(null)
      setEditingColumnTarget(null)
      setManualColumnDialogMode('create')
    }
  }

  const handleCreateRootCategory = (event: React.FormEvent) => {
    event.preventDefault()
    if (rootCategoryForm.listTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择列表模板')
      return
    }
    if (rootCategoryForm.contentTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择内容模板')
      return
    }
    createRootCategoryMutation.mutate()
  }

  const handleCreateManualColumn = (kind: ManualColumnKind) => {
    setManualColumnDialogMode('create')
    setManualColumnDialogKind(kind)
    setEditingManualColumn(null)
    setManualColumnDialogOpen(true)
  }

  const handleSubmitManualColumn = (value: ManualColumnFormValue, templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string }) => {
    if (editingColumnTarget) {
      updateColumnMutation.mutate({ id: editingColumnTarget.id, value, templateIds })
      return
    }
    if (manualColumnDialogMode === 'edit' && editingManualColumn) {
      updateManualColumnMutation.mutate({ id: editingManualColumn.id, value, templateIds })
      return
    }
    createManualColumnMutation.mutate({ value, templateIds })
  }

  const handleEditManualColumn = (column: Column) => {
    setManualColumnDialogMode('edit')
    setManualColumnDialogKind(column.column_type === 'single' ? 'single' : 'link')
    setEditingManualColumn(column)
    setManualColumnDialogOpen(true)
  }

  const handleDeleteManualColumn = (column: Column) => {
    setDeletingManualColumn(column)
    setManualColumnDeleteDialogOpen(true)
  }

  const handleEditColumnCategory = (column: Column) => {
    const target = getCategoryTreeTarget(column)
    if (!target) {
      return
    }

    setCategoryFormMode('edit')
    setCreatingCategoryTarget(null)
    setEditingColumnTarget(null)
    setEditingCategoryTarget({ rootColumnId: target.rootColumnId, id: target.id })
    setCategoryFormOpen(true)
  }

  const handleTemplateBinding = (column: Column) => {
    const target = getCategoryTreeTarget(column)
    if (target) {
      setBindingCategoryTarget(target)
    }
  }

  const handleDeleteColumnCategory = (column: Column) => {
    const target = getCategoryTreeTarget(column)
    if (target) {
      setDeletingCategoryTarget(target)
      setCategoryDeleteDialogOpen(true)
    }
  }

  const handleCategoryFormOpenChange = (open: boolean) => {
    setCategoryFormOpen(open)
    if (!open) {
      setEditingCategoryTarget(null)
      setCreatingCategoryTarget(null)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['column-categories'] })
    }
  }

  const confirmDeleteCategory = () => {
    if (!deletingCategoryTarget) {
      return
    }
    deleteCategoryMutation.mutate({ rootColumnId: deletingCategoryTarget.rootColumnId, id: deletingCategoryTarget.id })
  }

  const renderColumnTreeAction = (item: TreeItemData<Column>) => {
    const column = item.data
    if (!column) {
      return null
    }

    const categoryTarget = getCategoryTreeTarget(column)
    const canEditManualColumn = isEditableManualColumn(column)
    const hasActions = canEditManualColumn || Boolean(categoryTarget)

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover/tree-item:opacity-100 group-focus-within/tree-item:opacity-100 data-[state=open]:opacity-100"
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

          {categoryTarget ? (
            <DropdownMenuItem onSelect={() => handleCreateChildCategory(column)}>
              <Plus className="size-4" />
              添加子栏目
            </DropdownMenuItem>
          ) : null}

          {categoryTarget && canEditManualColumn ? <DropdownMenuSeparator /> : null}

          {canEditManualColumn ? (
            <DropdownMenuItem onSelect={() => handleEditManualColumn(column)}>
              <Pencil className="size-4" />
              编辑栏目
            </DropdownMenuItem>
          ) : null}

          {categoryTarget ? (
            <DropdownMenuItem onSelect={() => handleEditColumnCategory(column)}>
              <Pencil className="size-4" />
              编辑栏目
            </DropdownMenuItem>
          ) : null}

          {categoryTarget ? (
            <DropdownMenuItem onSelect={() => handleTemplateBinding(column)}>
              <LayoutTemplate className="size-4" />
              模板绑定
            </DropdownMenuItem>
          ) : null}

          {(canEditManualColumn || categoryTarget) ? <DropdownMenuSeparator /> : null}

          {canEditManualColumn ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => handleDeleteManualColumn(column)}
            >
              <Trash2 className="size-4" />
              删除栏目
            </DropdownMenuItem>
          ) : null}

          {categoryTarget ? (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => handleDeleteColumnCategory(column)}
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
    return (
      <Tree
        items={columnTreeItems}
        value={selectedColumn?.id}
        defaultExpandedIds={columnTree.map((column) => column.id)}
        onValueChange={handleSelectColumn}
        renderAction={renderColumnTreeAction}
      />
    )
  }

  const handleAdd = () => {
    if (isProductColumn) {
      setEditingProduct(undefined)
      setProductFormOpen(true)
      return
    }
    if (isNewsColumn) {
      setEditingNews(undefined)
      setNewsFormOpen(true)
    }
  }

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product)
    setProductFormOpen(true)
  }

  const handleEditNews = (news: News) => {
    setEditingNews(news)
    setNewsFormOpen(true)
  }

  const handleDelete = (target: DeleteTarget) => {
    setDeleteTarget(target)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (!deleteTarget) {
      return
    }
    if (deleteTarget.type === 'product') {
      deleteProductMutation.mutate(deleteTarget.id)
      return
    }
    deleteNewsMutation.mutate(deleteTarget.id)
  }

  const selectedEditingColumnId = editingColumnTarget?.id || editingManualColumn?.id || 0
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
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>栏目</CardTitle>
              <CardDescription>选择左侧栏目后查看对应内容</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" aria-label="新增栏目">
                  <Plus className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setRootCategoryDialogOpen(true)}>
                  <Plus className="size-4" />
                  {COLUMN_KIND_META.category.createLabel}
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
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-y-auto">
          {columnsLoading ? (
            <div className="text-sm text-muted-foreground">加载中...</div>
          ) : (
            renderColumnTree()
          )}
        </CardContent>
      </Card>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <CardTitle>{pageTitle}</CardTitle>
          <div className="flex items-center gap-2">
            {isManualColumn && selectedColumn ? (
              <>
                <Button variant="outline" onClick={() => handleEditManualColumn(selectedColumn)}>
                  编辑栏目
                </Button>
                <Button variant="destructiveGhost" onClick={() => handleDeleteManualColumn(selectedColumn)}>
                  删除栏目
                </Button>
              </>
            ) : null}
            {(isProductColumn || isNewsColumn) && (
              <Button onClick={handleAdd}>
                新增内容
              </Button>
            )}
          </div>
        </div>
        <div className="mt-4 min-h-0 flex flex-1 flex-col">
          {selectedColumn && !isManualColumn ? (
            <CategoryDetailPanel
              column={selectedColumn}
              bindings={selectedCategoryBindings}
              contentModels={contentModels}
              selectedThemeId={selectedThemeId}
            />
          ) : null}
          {isManualColumn ? (
            <div className="min-h-0 flex-1">
              <ManualColumnPanel column={selectedColumn} onEdit={handleEditManualColumn} onDelete={handleDeleteManualColumn} />
            </div>
          ) : selectedRenderDriver === 'page_tree' ? (
            <div className="min-h-0 flex-1">
              <PageTreeColumnPanel column={selectedColumn} />
            </div>
          ) : activeLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded border p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <>
              {isNewsColumn ? (
                <NewsTable
                  items={activeItems as News[]}
                  onEdit={handleEditNews}
                  onDelete={(id) => handleDelete({ type: 'news', id })}
                />
              ) : (
                <ProductTable
                  items={activeItems as Product[]}
                  onEdit={handleEditProduct}
                  onDelete={(id) => handleDelete({ type: 'product', id })}
                />
              )}
            </>
          )}

          {activePagination && (
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                共 {activePagination.total || 0} 条 · 第 {activePagination.page} / {activePagination.totalPages} 页
              </div>
              {activePagination.totalPages > 1 && (
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        size="default"
                        className={activePagination.page === 1 ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (activePagination.page > 1) {
                            setPage(activePagination.page - 1)
                          }
                        }}
                      >
                        上一页
                      </PaginationLink>
                    </PaginationItem>
                    {buildPaginationItems(activePagination.page, activePagination.totalPages).map((item, index) => (
                      item === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === activePagination.page}
                            onClick={(event) => {
                              event.preventDefault()
                              setPage(item)
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    ))}
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        size="default"
                        className={activePagination.page === activePagination.totalPages ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (activePagination.page < activePagination.totalPages) {
                            setPage(activePagination.page + 1)
                          }
                        }}
                      >
                        下一页
                      </PaginationLink>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </div>
      </div>

      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        product={editingProduct}
        mode={editingProduct ? 'edit' : 'create'}
        defaultColumnId={isProductColumn ? (selectedColumn?.id || undefined) : undefined}
      />

      <NewsFormDialog
        open={newsFormOpen}
        onOpenChange={setNewsFormOpen}
        news={editingNews}
        mode={editingNews ? 'edit' : 'create'}
        defaultColumnId={isNewsColumn ? (selectedColumn?.id || undefined) : undefined}
      />

      <Dialog open={rootCategoryDialogOpen} onOpenChange={handleRootCategoryDialogOpenChange}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>新增一级栏目</DialogTitle>
            <DialogDescription>创建一个列表式栏目根节点，用于承载分类树和内容列表。</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateRootCategory} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="root-category-name">栏目名称 *</Label>
              <Input
                id="root-category-name"
                value={rootCategoryForm.name}
                onChange={(event) => setRootCategoryForm({ ...rootCategoryForm, name: event.target.value })}
                placeholder="请输入栏目名称"
              />
            </div>
            <div className="space-y-2">
              <Label>内容模型</Label>
              <Select
                value={rootCategoryForm.contentModelId}
                onValueChange={(value) => setRootCategoryForm({ ...rootCategoryForm, contentModelId: value })}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="root-category-dir-name">目录名</Label>
                <Input
                  id="root-category-dir-name"
                  value={rootCategoryForm.dirName}
                  onChange={(event) => setRootCategoryForm({ ...rootCategoryForm, dirName: event.target.value })}
                  placeholder="catalog"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="root-category-route-path">访问路径 *</Label>
                <Input
                  id="root-category-route-path"
                  value={rootCategoryForm.routePath}
                  onChange={(event) => setRootCategoryForm({ ...rootCategoryForm, routePath: event.target.value })}
                  placeholder="/catalog/"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="root-category-detail-rule">内容页规则</Label>
              <Input
                id="root-category-detail-rule"
                value={rootCategoryForm.detailRule}
                onChange={(event) => setRootCategoryForm({ ...rootCategoryForm, detailRule: event.target.value })}
                placeholder="{id}.html"
              />
            </div>
            <div className="space-y-2">
              <Label>列表模板</Label>
              <Select
                value={rootCategoryForm.listTemplateId}
                onValueChange={(value) => setRootCategoryForm({ ...rootCategoryForm, listTemplateId: value })}
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
                value={rootCategoryForm.contentTemplateId}
                onValueChange={(value) => setRootCategoryForm({ ...rootCategoryForm, contentTemplateId: value })}
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
              <Button type="button" variant="outline" onClick={() => handleRootCategoryDialogOpenChange(false)}>
                取消
              </Button>
              <Button type="submit" disabled={createRootCategoryMutation.isPending}>
                {createRootCategoryMutation.isPending ? '创建中...' : '确定'}
              </Button>
            </DialogFooter>
        </form>
      </DialogContent>
      </Dialog>

      <ManualColumnFormDialog
        open={manualColumnDialogOpen}
        onOpenChange={handleManualColumnDialogOpenChange}
        mode={manualColumnDialogMode}
        column={editingColumnTarget || editingManualColumn}
        initialKind={manualColumnDialogKind}
        forceBasicOnly={Boolean(editingColumnTarget)}
        columns={columns}
        contentModels={contentModels}
        listTemplates={listTemplates}
        contentTemplates={contentTemplates}
        singleTemplates={singleTemplates}
        initialListTemplateId={selectedManualListBinding?.template_id ? String(selectedManualListBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
        initialContentTemplateId={selectedManualContentBinding?.template_id ? String(selectedManualContentBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
        initialSingleTemplateId={selectedManualSingleBinding?.template_id ? String(selectedManualSingleBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
        submitting={createManualColumnMutation.isPending || updateManualColumnMutation.isPending || updateColumnMutation.isPending}
        onSubmit={handleSubmitManualColumn}
      />

      <ColumnCategoryFormDialog
        open={categoryFormOpen && Boolean(categoryFormRootColumn)}
        onOpenChange={handleCategoryFormOpenChange}
        rootColumn={categoryFormRootColumn}
        category={categoryFormMode === 'edit' ? editingCategoryData?.data as ColumnCategory | undefined : undefined}
        currentParentId={categoryFormMode === 'create' ? creatingCategoryTarget?.id || 0 : 0}
        mode={categoryFormMode}
      />

      <CategoryTemplateBindingDialog
        open={Boolean(bindingCategoryTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setBindingCategoryTarget(null)
          }
        }}
        targetType={bindingCategoryTarget?.targetType || 'column'}
        targetId={bindingCategoryTarget?.id}
        targetName={bindingCategoryTarget?.name}
        templateTypes={bindingCategoryTarget?.renderDriver === 'page_tree' ? ['single'] : ['list', 'content']}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这条内容吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={categoryDeleteDialogOpen} onOpenChange={setCategoryDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除栏目</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingCategoryTarget?.name}」吗？此操作无法撤销；如果该栏目下有子栏目或内容，删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCategory}
              disabled={deleteCategoryMutation.isPending}
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

function ProductTable({
  items,
  onEdit,
  onDelete,
}: {
  items: Product[]
  onEdit: (item: Product) => void
  onDelete: (id: number) => void
}) {
  return (
    <Table containerClassName="min-h-0 flex-1 rounded border">
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>标题</TableHead>
          <TableHead>编号</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>多语言</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>推荐</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center">暂无内容</TableCell>
          </TableRow>
        ) : (
          items.map((product) => (
            <TableRow key={product.id}>
              <TableCell>{product.id}</TableCell>
              <TableCell className="group/title font-medium">
                <div className="flex items-center gap-1">
                  <span>{product.name}</span>
                  <a
                    href={buildProductDetailPreviewHref(product.id)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex size-4 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/title:opacity-100"
                    aria-label={`新窗口打开 ${product.name} 详情页`}
                    title="打开详情页"
                  >
                    <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </TableCell>
              <TableCell>{product.code || '-'}</TableCell>
              <TableCell>{product.category_name || product.column_id || '-'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(product.translation_statuses || []).length === 0 ? (
                    <Badge variant="outline">默认语言</Badge>
                  ) : (
                    product.translation_statuses?.map((status) => (
                      <Badge
                        key={`${product.id}-${status.language_code}`}
                        variant={status.publish_status === 'published' ? 'default' : 'outline'}
                      >
                        {status.language_code}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell>{product.is_visible === 1 ? <Badge>显示</Badge> : <Badge variant="secondary">隐藏</Badge>}</TableCell>
              <TableCell>{product.is_featured_home === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>编辑</Button>
                <Button variant="destructiveGhost" size="sm" onClick={() => onDelete(product.id)}>删除</Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

function buildProductDetailPreviewHref(productId: number) {
  return `/product/${productId}.html`
}

function NewsTable({
  items,
  onEdit,
  onDelete,
}: {
  items: News[]
  onEdit: (item: News) => void
  onDelete: (id: number) => void
}) {
  return (
    <Table containerClassName="min-h-0 flex-1 rounded border">
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>标题</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>多语言</TableHead>
          <TableHead>推荐</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center">暂无内容</TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.id}</TableCell>
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell>{item.category_name || item.column_id || '-'}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(item.translation_statuses || []).length === 0 ? (
                    <Badge variant="outline">默认语言</Badge>
                  ) : (
                    item.translation_statuses?.map((status) => (
                      <Badge
                        key={`${item.id}-${status.language_code}`}
                        variant={status.publish_status === 'published' ? 'default' : 'outline'}
                      >
                        {status.language_code}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell>{Number(item.is_featured_home || item.is_featured || 0) === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
              <TableCell>{item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>编辑</Button>
                <Button variant="destructiveGhost" size="sm" onClick={() => onDelete(item.id)}>删除</Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
}

function PageTreeColumnPanel({ column }: { column: Column | null }) {
  if (!column) {
    return <div className="flex h-full items-center justify-center rounded border p-8 text-center text-muted-foreground">请选择左侧栏目</div>
  }

  return (
    <div className="flex h-full items-center justify-center rounded border p-8 text-center text-sm text-muted-foreground">
      该栏目树使用单页模式，不包含列表内容。
    </div>
  )
}

function ManualColumnPanel({
  column,
  onEdit,
  onDelete,
}: {
  column: Column | null
  onEdit: (column: Column) => void
  onDelete: (column: Column) => void
}) {
  if (!column) {
    return <div className="flex h-full items-center justify-center rounded border p-8 text-center text-muted-foreground">请选择左侧栏目</div>
  }

  const isSingle = column.column_type === 'single'
  return (
    <div className="flex h-full flex-col rounded border">
      <div className="border-b px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">{isSingle ? '单页栏目' : '链接栏目'}</div>
            <div className="mt-1 text-lg font-medium">{column.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onEdit(column)}>编辑栏目</Button>
            <Button variant="destructiveGhost" size="sm" onClick={() => onDelete(column)}>删除栏目</Button>
          </div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-4 text-sm">
        {isSingle ? (
          <>
            <div>
              <div className="text-muted-foreground">栏目目录名</div>
              <div className="mt-1 break-all font-medium">{column.dir_name || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">访问路径</div>
              <div className="mt-1 break-all font-medium">{column.route_path || '-'}</div>
            </div>
            <div>
              <div className="text-muted-foreground">页面内容</div>
              <div className="mt-1 rounded border bg-muted/20 p-3 whitespace-pre-wrap break-words">
                {column.content_html || '暂无内容'}
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="text-muted-foreground">跳转地址</div>
              <div className="mt-1 break-all font-medium">{column.custom_url || '-'}</div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function CategoryDetailPanel({
  column,
  bindings,
  contentModels,
  selectedThemeId,
}: {
  column: Column
  bindings: TemplateBinding[]
  contentModels: ContentModel[]
  selectedThemeId?: number
}) {
  const target = getCategoryTreeTarget(column)
  const listBinding = bindings.find((item) => item.template_type === 'list')
  const contentBinding = bindings.find((item) => item.template_type === 'content')
  const singleBinding = bindings.find((item) => item.template_type === 'single')
  const detailText = column.column_type === 'single'
    ? (column.route_path || '-')
    : column.column_type === 'link'
      ? (column.custom_url || '-')
      : `栏目ID ${column.id || '-'}`
  const seoSummary = column.seo_description?.trim() || '-'
  const seoKeywords = column.seo_keywords?.trim() || '-'
  const boundModel = contentModels.find((item) => item.id === column.content_model_id)
  const modelBindingText = boundModel
    ? `${boundModel.name} (#${boundModel.id})`
    : (column.content_model_id ? `#${column.content_model_id}` : '未绑定')

  return (
    <Card className="mb-4">
      <CardContent className="grid gap-4 px-5 py-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">基本信息</div>
          <div className="font-medium">{column.name}</div>
          <div>ID {column.id}</div>
          <div>类型：{getColumnKindLabel(column)}</div>
          <div>排序：{column.sort_order}</div>
          <div>父级：{column.parent_id || '顶级'}</div>
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">路径与来源</div>
          <div className="break-all">{detailText}</div>
          <div>栏目形态：{column.column_type || '-'}</div>
          <div>模型绑定：{modelBindingText}</div>
          {target ? <div>栏目ID：{target.id}</div> : null}
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">SEO</div>
          <div className="line-clamp-3 break-words">{seoSummary}</div>
          <div className="line-clamp-2 break-words text-muted-foreground">{seoKeywords}</div>
          <div>语言：{column.current_language_code || '-'}</div>
        </div>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">模板绑定</div>
          <div>主题：{selectedThemeId ? `#${selectedThemeId}` : '未选择'}</div>
          {column.column_type === 'single'
            ? <div>单页模板：{singleBinding?.template_name || singleBinding?.template_code || '未绑定'}</div>
            : (
              <>
                <div>列表模板：{listBinding?.template_name || listBinding?.template_code || '未绑定'}</div>
                <div>内容模板：{contentBinding?.template_name || contentBinding?.template_code || '未绑定'}</div>
              </>
            )}
        </div>
      </CardContent>
    </Card>
  )
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) {
    items.push('ellipsis')
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }

  if (end < totalPages - 1) {
    items.push('ellipsis')
  }

  items.push(totalPages)
  return items
}

function buildColumnTree(columns: Column[]) {
  const visibleColumns = columns.filter((column) => shouldShowInColumnTree(column))
  const nodes = new Map<number, ColumnTreeNode>()
  const roots: ColumnTreeNode[] = []

  for (const column of visibleColumns) {
    nodes.set(column.id, { ...column, children: [] })
  }

  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(Number(node.parent_id)) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortColumnTree(roots)

  return roots
}

function shouldShowInColumnTree(column: Column) {
  const displayKind = getColumnDisplayKind(column)

  if (displayKind === 'link' || displayKind === 'single') {
    return true
  }

  return column.column_type === 'list'
}

function sortColumnTree(nodes: ColumnTreeNode[]) {
  nodes.sort(compareColumnTreeNodes)
  for (const node of nodes) {
    sortColumnTree(node.children)
  }
}

function compareColumnTreeNodes(a: ColumnTreeNode, b: ColumnTreeNode) {
  const sortPriority = (a.sort_order || 0) - (b.sort_order || 0)
  if (sortPriority !== 0) {
    return sortPriority
  }

  return a.id - b.id
}

function getColumnKindLabel(column: Column) {
  return COLUMN_KIND_META[getColumnDisplayKind(column)].label
}

function getColumnDisplayKind(column: Column): ColumnDisplayKind {
  if (column.column_type === 'single') {
    return 'single'
  }
  if (column.column_type === 'link') {
    return 'link'
  }
  return 'category'
}

async function saveRequiredTemplateBinding(
  themeId: number,
  targetType: Extract<TemplateBinding['target_type'], 'column'>,
  targetId: number,
  templateType: Extract<TemplateBinding['template_type'], 'list' | 'content' | 'single'>,
  templateId: string,
  bindings: TemplateBinding[] = []
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

function getCategoryTreeTarget(column: Column): CategoryTreeTarget {
  const renderDriver = String(column.column_semantics?.render_driver || '')
  const rootColumnId = Number(column.column_semantics?.root_column_id || column.id || 0)
  if (!rootColumnId || !['managed_category', 'section', 'page_tree'].includes(renderDriver)) {
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

function toTreeItem(column: ColumnTreeNode): TreeItemData<Column> {
  const displayKind = getColumnDisplayKind(column)

  return {
    id: column.id,
    label: (
      <div className="min-w-0 py-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{column.name}</span>
          {COLUMN_KIND_META[displayKind].showTreeBadge ? (
            <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
              {COLUMN_KIND_META[displayKind].label}
            </Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>ID {column.id}</span>
        </div>
      </div>
    ),
    data: column,
    children: column.children.map(toTreeItem),
  }
}
