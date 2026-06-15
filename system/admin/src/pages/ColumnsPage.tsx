import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { corporationCategoriesApi, templateVariantsApi, templatesApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { languagesApi } from '@/api/languages'
import { newsApi } from '@/api/news'
import { newsCategoriesApi } from '@/api/news-categories'
import { productCategoriesApi } from '@/api/product-categories'
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
import CorporationCategoryFormDialog from '@/components/CorporationCategoryFormDialog'
import ManualColumnFormDialog, { type ManualColumnFormValue } from '@/components/ManualColumnFormDialog'
import NewsCategoryFormDialog from '@/components/NewsCategoryFormDialog'
import NewsFormDialog from '@/components/NewsFormDialog'
import ProductCategoryFormDialog from '@/components/ProductCategoryFormDialog'
import ProductFormDialog from '@/components/ProductFormDialog'
import { toast } from 'sonner'
import type { Column, News, Product, Template, TemplateBinding } from '@/types'

const DEFAULT_TEMPLATE_VALUE = '__default__'

interface ColumnTreeNode extends Column {
  children: ColumnTreeNode[]
}

type DeleteTarget =
  | { type: 'product'; id: number }
  | { type: 'news'; id: number }
  | null

type CategoryModel = 'product' | 'news' | 'corporation'

type EditingCategoryTarget =
  | { type: CategoryModel; id: number }
  | null

type EditingColumnTarget =
  | Column
  | null

type CategoryTreeTarget = {
  type: CategoryModel
  id: number
  columnId: number
  name: string
  targetType: Extract<TemplateBinding['target_type'], 'product_category' | 'news_category' | 'corporation_category'>
} | null

interface RootCategoryForm {
  name: string
  model: CategoryModel
  listTemplateId: string
  contentTemplateId: string
}

type ManualColumnKind = 'link' | 'single'

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
    model: 'product',
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

  const { data: editingProductCategoryData } = useQuery({
    queryKey: ['product-categories', 'detail', editingCategoryTarget?.id],
    queryFn: () => productCategoriesApi.get(editingCategoryTarget!.id),
    enabled: categoryFormOpen && categoryFormMode === 'edit' && editingCategoryTarget?.type === 'product',
  })

  const { data: editingNewsCategoryData } = useQuery({
    queryKey: ['news-categories', 'detail', editingCategoryTarget?.id],
    queryFn: () => newsCategoriesApi.get(editingCategoryTarget!.id),
    enabled: categoryFormOpen && categoryFormMode === 'edit' && editingCategoryTarget?.type === 'news',
  })

  const { data: editingCorporationCategoryData } = useQuery({
    queryKey: ['corporation-categories', 'detail', editingCategoryTarget?.id],
    queryFn: () => corporationCategoriesApi.get(editingCategoryTarget!.id),
    enabled: categoryFormOpen && categoryFormMode === 'edit' && editingCategoryTarget?.type === 'corporation',
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

  const columns = columnsData?.data || []
  const columnTree = useMemo(() => buildColumnTree(columns), [columns])
  const columnTreeItems = useMemo<TreeItemData<Column>[]>(
    () => columnTree.map(toTreeItem),
    [columnTree]
  )
  const selectedColumn = columns.find((column) => column.id === selectedColumnId)
    || columns.find((column) => column.source_type === 'product_root')
    || columns[0]
    || null

  const selectedModel = selectedColumn?.model_code || ''
  const isProductColumn = selectedModel === 'product'
  const isNewsColumn = selectedModel === 'news'
  const isCorporationColumn = selectedModel === 'corporation'
  const isManualLinkColumn = selectedColumn?.column_kind === 'link'
  const isManualSingleColumn = selectedColumn?.column_kind === 'single' && selectedColumn?.source_type === 'single_page'
  const isManualColumn = isManualLinkColumn || isManualSingleColumn
  const selectedSourceType = selectedColumn?.source_type || ''
  const categoryFormTargetType = editingCategoryTarget?.type || creatingCategoryTarget?.type

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

  const deleteProductCategoryMutation = useMutation({
    mutationFn: (id: number) => productCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
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

  const deleteNewsCategoryMutation = useMutation({
    mutationFn: (id: number) => newsCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
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

  const deleteCorporationCategoryMutation = useMutation({
    mutationFn: (id: number) => corporationCategoriesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporation-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
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

      const response = await createCategoryByModel(rootCategoryForm.model, { name, parent_id: 0, sort_order: 0 })
      const categoryId = response.data?.id
      if (!categoryId) {
        throw new Error('栏目创建失败')
      }

      const targetType = getTemplateTargetType(rootCategoryForm.model)
      if (rootCategoryForm.model !== 'corporation') {
        await saveOptionalTemplateBinding(selectedThemeId || 0, targetType, categoryId, 'list', rootCategoryForm.listTemplateId)
      }
      await saveOptionalTemplateBinding(selectedThemeId || 0, targetType, categoryId, 'content', rootCategoryForm.contentTemplateId)

      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['news-categories'] })
      queryClient.invalidateQueries({ queryKey: ['corporation-categories'] })
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
    mutationFn: async ({ value, templateId }: { value: ManualColumnFormValue; templateId: string }) => {
      const response = await columnsApi.create(value)
      const columnId = response.data?.id
      if (!columnId) {
        throw new Error('栏目创建失败')
      }
      await saveOptionalTemplateBinding(selectedThemeId || 0, 'column', columnId, 'content', templateId)
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
    mutationFn: async ({ id, value, templateId }: { id: number; value: ManualColumnFormValue; templateId: string }) => {
      const response = await columnsApi.update(id, value)
      await saveOptionalTemplateBinding(selectedThemeId || 0, 'column', id, 'content', templateId, bindings)
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

  const updateSystemColumnMutation = useMutation({
    mutationFn: ({ id, value }: { id: number; value: ManualColumnFormValue }) => columnsApi.update(id, value.base.show_in_nav !== undefined ? {
      parent_id: value.base.parent_id,
      sort_order: value.base.sort_order,
      show_in_nav: value.base.show_in_nav,
      translations: value.translations,
    } : value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
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
  const listTemplates = templates.filter((template: Template) => template.type === 'list')
  const contentTemplates = templates.filter((template: Template) => template.type === 'content')
  const selectedCategoryBindings = selectedColumn
    ? bindings.filter((binding) => {
      const target = getCategoryTreeTarget(selectedColumn)
      if (!target) {
        return false
      }
      return binding.target_type === target.targetType && binding.target_id === target.id
    })
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
      model: 'product',
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
    createRootCategoryMutation.mutate()
  }

  const handleCreateManualColumn = (kind: ManualColumnKind) => {
    setManualColumnDialogMode('create')
    setManualColumnDialogKind(kind)
    setEditingManualColumn(null)
    setManualColumnDialogOpen(true)
  }

  const handleSubmitManualColumn = (value: ManualColumnFormValue, templateId: string) => {
    if (editingColumnTarget) {
      updateSystemColumnMutation.mutate({ id: editingColumnTarget.id, value })
      return
    }
    if (manualColumnDialogMode === 'edit' && editingManualColumn) {
      updateManualColumnMutation.mutate({ id: editingManualColumn.id, value, templateId })
      return
    }
    createManualColumnMutation.mutate({ value, templateId })
  }

  const handleEditManualColumn = (column: Column) => {
    setManualColumnDialogMode('edit')
    setManualColumnDialogKind(column.column_kind === 'single' ? 'single' : 'link')
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

    if (target.id === 0) {
      setEditingCategoryTarget(null)
      setCreatingCategoryTarget(null)
      setEditingColumnTarget(column)
      setManualColumnDialogMode('edit')
      setManualColumnDialogKind('link')
      setEditingManualColumn(column)
      setManualColumnDialogOpen(true)
      return
    }

    setCategoryFormMode('edit')
    setCreatingCategoryTarget(null)
    setEditingColumnTarget(null)
    setEditingCategoryTarget({ type: target.type, id: target.id })
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
      queryClient.invalidateQueries({ queryKey: ['corporation-categories'] })
    }
  }

  const confirmDeleteCategory = () => {
    if (!deletingCategoryTarget) {
      return
    }

    if (deletingCategoryTarget.type === 'product') {
      deleteProductCategoryMutation.mutate(deletingCategoryTarget.id)
      return
    }

    if (deletingCategoryTarget.type === 'news') {
      deleteNewsCategoryMutation.mutate(deletingCategoryTarget.id)
      return
    }

    deleteCorporationCategoryMutation.mutate(deletingCategoryTarget.id)
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
              添加子分类
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
              编辑分类
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
              删除分类
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

  const selectedManualColumnBinding = editingManualColumn
    ? bindings.find((binding) => (
      binding.target_type === 'column'
      && binding.target_id === editingManualColumn.id
      && binding.template_type === 'content'
    ))
    : null

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
                  新增分类栏目
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleCreateManualColumn('link')}>
                  <Plus className="size-4" />
                  新增链接栏目
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => handleCreateManualColumn('single')}>
                  <Plus className="size-4" />
                  新增单页栏目
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
              selectedThemeId={selectedThemeId}
            />
          ) : null}
          {isManualColumn ? (
            <div className="min-h-0 flex-1">
              <ManualColumnPanel column={selectedColumn} onEdit={handleEditManualColumn} onDelete={handleDeleteManualColumn} />
            </div>
          ) : isCorporationColumn ? (
            <div className="min-h-0 flex-1">
              <CorporationColumnPanel column={selectedColumn} />
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
            <DialogDescription>填写栏目名称，选择内容模型和生成模板。</DialogDescription>
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
              <Label>模型</Label>
              <Select
                value={rootCategoryForm.model}
                onValueChange={(value: CategoryModel) => setRootCategoryForm({ ...rootCategoryForm, model: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">产品</SelectItem>
                  <SelectItem value="news">新闻</SelectItem>
                  <SelectItem value="corporation">公司</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {rootCategoryForm.model !== 'corporation' && (
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
                    <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
                    {listTemplates.map((template: Template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
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
                  <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
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
        templates={contentTemplates}
        initialTemplateId={selectedManualColumnBinding?.template_id ? String(selectedManualColumnBinding.template_id) : DEFAULT_TEMPLATE_VALUE}
        submitting={createManualColumnMutation.isPending || updateManualColumnMutation.isPending || updateSystemColumnMutation.isPending}
        onSubmit={handleSubmitManualColumn}
      />

      <ProductCategoryFormDialog
        open={categoryFormOpen && categoryFormTargetType === 'product'}
        onOpenChange={handleCategoryFormOpenChange}
        category={categoryFormMode === 'edit' ? editingProductCategoryData?.data : undefined}
        currentParentId={categoryFormMode === 'create' ? creatingCategoryTarget?.id || 0 : 0}
        mode={categoryFormMode}
      />

      <NewsCategoryFormDialog
        open={categoryFormOpen && categoryFormTargetType === 'news'}
        onOpenChange={handleCategoryFormOpenChange}
        category={categoryFormMode === 'edit' ? editingNewsCategoryData?.data : undefined}
        currentParentId={categoryFormMode === 'create' ? creatingCategoryTarget?.id || 0 : 0}
        mode={categoryFormMode}
      />

      <CorporationCategoryFormDialog
        open={categoryFormOpen && categoryFormTargetType === 'corporation'}
        onOpenChange={handleCategoryFormOpenChange}
        category={categoryFormMode === 'edit' ? editingCorporationCategoryData?.data : undefined}
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
        targetType={bindingCategoryTarget?.targetType || 'product_category'}
        targetId={bindingCategoryTarget?.id}
        targetName={bindingCategoryTarget?.name}
        templateTypes={bindingCategoryTarget?.type === 'corporation' ? ['content'] : ['list', 'content']}
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
            <AlertDialogTitle>确认删除分类</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除「{deletingCategoryTarget?.name}」吗？此操作无法撤销；如果该分类下有子分类或内容，删除可能会失败。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCategory}
              disabled={deleteProductCategoryMutation.isPending || deleteNewsCategoryMutation.isPending || deleteCorporationCategoryMutation.isPending}
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

function CorporationColumnPanel({ column }: { column: Column | null }) {
  if (!column) {
    return <div className="flex h-full items-center justify-center rounded border p-8 text-center text-muted-foreground">请选择左侧栏目</div>
  }

  return (
    <div className="flex h-full items-center justify-center rounded border p-8 text-center text-sm text-muted-foreground">
      公司栏目页面不包含产品或新闻列表。
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

  const isSingle = column.column_kind === 'single'
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
            <div>
              <div className="text-muted-foreground">打开方式</div>
              <div className="mt-1">{Number(column.open_in_new_tab || 0) === 1 ? '新窗口' : '当前窗口'}</div>
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
  selectedThemeId,
}: {
  column: Column
  bindings: TemplateBinding[]
  selectedThemeId?: number
}) {
  const target = getCategoryTreeTarget(column)
  const listBinding = bindings.find((item) => item.template_type === 'list')
  const contentBinding = bindings.find((item) => item.template_type === 'content')
  const detailText = column.column_kind === 'single'
    ? (column.route_path || '-')
    : column.source_type === 'custom_link'
      ? (column.custom_url || '-')
      : `栏目ID ${column.id || '-'}`
  const seoSummary = column.seo_description?.trim() || '-'
  const seoKeywords = column.seo_keywords?.trim() || '-'

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
          <div>模型：{column.model_code || '-'}</div>
          <div>来源类型：{column.source_type || '-'}</div>
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
          <div>列表模板：{listBinding?.template_name || listBinding?.template_code || '未绑定'}</div>
          <div>内容模板：{contentBinding?.template_name || contentBinding?.template_code || '未绑定'}</div>
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
  const nodes = new Map<number, ColumnTreeNode>()
  const roots: ColumnTreeNode[] = []

  for (const column of columns) {
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

function sortColumnTree(nodes: ColumnTreeNode[]) {
  nodes.sort(compareColumnTreeNodes)
  for (const node of nodes) {
    sortColumnTree(node.children)
  }
}

function compareColumnTreeNodes(a: ColumnTreeNode, b: ColumnTreeNode) {
  const childPriority = Number(b.children.length > 0) - Number(a.children.length > 0)
  if (childPriority !== 0) {
    return childPriority
  }

  const sortPriority = (a.sort_order || 0) - (b.sort_order || 0)
  if (sortPriority !== 0) {
    return sortPriority
  }

  return a.id - b.id
}

function getColumnKindLabel(column: Column) {
  if (column.column_kind === 'single') {
    return '单页'
  }
  if (column.column_kind === 'link' || column.source_type === 'custom_link') {
    return Number(column.open_in_new_tab || 0) === 1 ? '链接/新窗' : '链接'
  }
  if (column.source_type === 'product_root' || column.source_type === 'product_category') {
    return '产品'
  }
  if (column.source_type === 'news_category') {
    return '新闻'
  }
  if (column.source_type === 'corporation_root' || column.source_type === 'corporation_category') {
    return '公司'
  }
  if (column.source_type === 'contact_page') {
    return '联系'
  }
  return '栏目'
}

async function saveOptionalTemplateBinding(
  themeId: number,
  targetType: Extract<TemplateBinding['target_type'], 'product_category' | 'news_category' | 'corporation_category' | 'column'>,
  targetId: number,
  templateType: Extract<TemplateBinding['template_type'], 'list' | 'content'>,
  templateId: string,
  bindings: TemplateBinding[] = []
) {
  const existing = bindings.find((binding) => (
    binding.target_type === targetType
    && binding.target_id === targetId
    && binding.template_type === templateType
  ))

  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    if (existing?.id) {
      await templatesApi.deleteBinding(existing.id)
    }
    return
  }

  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: targetType,
    target_id: targetId,
    template_type: templateType,
    template_id: Number(templateId),
  })
}

function isEditableManualColumn(column: Column) {
  return Number(column.is_system || 0) === 0
    && (column.source_type === 'custom_link' || column.source_type === 'single_page')
}

function createCategoryByModel(model: CategoryModel, data: { name: string; parent_id: number; sort_order: number }) {
  if (model === 'product') {
    return productCategoriesApi.create(data)
  }
  if (model === 'news') {
    return newsCategoriesApi.create(data)
  }
  return corporationCategoriesApi.create({ ...data, is_external: 0 })
}

function getTemplateTargetType(model: CategoryModel): Extract<TemplateBinding['target_type'], 'product_category' | 'news_category' | 'corporation_category'> {
  if (model === 'product') {
    return 'product_category'
  }
  if (model === 'news') {
    return 'news_category'
  }
  return 'corporation_category'
}

function getCategoryTreeTarget(column: Column): CategoryTreeTarget {
  if (column.source_type === 'product_root') {
    return {
      type: 'product',
      id: column.id,
      columnId: column.id,
      name: column.name,
      targetType: 'product_category',
    }
  }

  if (column.source_type === 'product_category') {
    return {
      type: 'product',
      id: column.id,
      columnId: column.id,
      name: column.name,
      targetType: 'product_category',
    }
  }

  if (column.source_type === 'news_category') {
    return {
      type: 'news',
      id: column.id,
      columnId: column.id,
      name: column.name,
      targetType: 'news_category',
    }
  }

  if (column.source_type === 'corporation_category') {
    return {
      type: 'corporation',
      id: column.id,
      columnId: column.id,
      name: column.name,
      targetType: 'corporation_category',
    }
  }

  if (column.source_type === 'corporation_root') {
    return {
      type: 'corporation',
      id: column.id,
      columnId: column.id,
      name: column.name,
      targetType: 'corporation_category',
    }
  }

  return null
}

function toTreeItem(column: ColumnTreeNode): TreeItemData<Column> {
  const isManual = isEditableManualColumn(column)
  const detailText = column.column_kind === 'single'
    ? (column.route_path || '-')
    : column.source_type === 'custom_link'
      ? (column.custom_url || '-')
      : `栏目ID ${column.id || '-'}`
  const seoSummary = column.seo_description?.trim() || column.seo_keywords?.trim() || ''

  return {
    id: column.id,
    label: (
      <div className="min-w-0 py-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{column.name}</span>
          <Badge variant="outline" className="h-5 shrink-0 px-1.5 text-[10px]">
            {getColumnKindLabel(column)}
          </Badge>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>ID {column.id}</span>
          {!isManual ? <span>{detailText}</span> : null}
          <span>排序 {column.sort_order}</span>
          {isManual ? <span className="truncate">{detailText}</span> : null}
        </div>
        {seoSummary ? (
          <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            SEO: {seoSummary}
          </div>
        ) : null}
      </div>
    ),
    data: column,
    children: column.children.map(toTreeItem),
  }
}
