import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { corporationCategoriesApi, templatesApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
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
import { Ellipsis, LayoutTemplate, Pencil, Plus, Trash2 } from 'lucide-react'
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

  const { data: columnsData, isLoading: columnsLoading } = useQuery({
    queryKey: ['columns'],
    queryFn: () => columnsApi.list(),
  })

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
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
    enabled: rootCategoryDialogOpen,
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
  const selectedSourceId = selectedColumn?.source_id || 0
  const selectedSourceType = selectedColumn?.source_type || ''
  const selectedCategoryId = selectedSourceType.endsWith('_category') ? selectedSourceId : 0
  const categoryFormTargetType = editingCategoryTarget?.type || creatingCategoryTarget?.type

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'columns', selectedColumn?.id || 0, page, limit],
    queryFn: () => productsApi.list({
      page,
      limit,
      category_id: selectedSourceType === 'product_category' ? selectedSourceId : undefined,
      include_descendants: selectedSourceType === 'product_category' ? 1 : undefined,
    }),
    enabled: isProductColumn,
    staleTime: 0,
  })

  const { data: newsData, isLoading: newsLoading } = useQuery({
    queryKey: ['news', 'columns', selectedColumn?.id || 0, page, limit],
    queryFn: () => newsApi.list({
      page,
      limit,
      category_id: selectedSourceType === 'news_category' ? selectedSourceId : undefined,
      include_descendants: selectedSourceType === 'news_category' ? 1 : undefined,
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
        await saveOptionalTemplateBinding(targetType, categoryId, 'list', rootCategoryForm.listTemplateId)
      }
      await saveOptionalTemplateBinding(targetType, categoryId, 'content', rootCategoryForm.contentTemplateId)

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

  const activeItems = isNewsColumn ? (newsData?.items || []) : (isProductColumn ? (productsData?.items || []) : [])
  const activePagination = isNewsColumn ? newsData?.pagination : (isProductColumn ? productsData?.pagination : undefined)
  const activeLoading = isNewsColumn ? newsLoading : (isProductColumn ? productsLoading : false)
  const pageTitle = selectedColumn?.name || '栏目'
  const templates = templatesData?.data || []
  const listTemplates = templates.filter((template: Template) => template.type === 'list')
  const contentTemplates = templates.filter((template: Template) => template.type === 'content')

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

  const handleCreateRootCategory = (event: React.FormEvent) => {
    event.preventDefault()
    createRootCategoryMutation.mutate()
  }

  const handleEditColumnCategory = (column: Column) => {
    const target = getCategoryTreeTarget(column)
    if (!target) {
      return
    }

    setCategoryFormMode('edit')
    setCreatingCategoryTarget(null)
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
    if (!column || !isEditableCategoryColumn(column)) {
      return null
    }

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover/tree-item:opacity-100 group-focus-within/tree-item:opacity-100 data-[state=open]:opacity-100"
            aria-label={`${column.name}分类设置`}
            onClick={(event) => event.stopPropagation()}
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => handleCreateChildCategory(column)}>
            <Plus className="size-4" />
            添加子分类
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleEditColumnCategory(column)}>
            <Pencil className="size-4" />
            编辑分类
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleTemplateBinding(column)}>
            <LayoutTemplate className="size-4" />
            模板绑定
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => handleDeleteColumnCategory(column)}
          >
            <Trash2 className="size-4" />
            删除分类
          </DropdownMenuItem>
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

  return (
    <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>栏目</CardTitle>
              <CardDescription>选择左侧栏目后查看对应内容</CardDescription>
            </div>
            <Button type="button" variant="outline" size="icon" aria-label="新增一级栏目" onClick={() => setRootCategoryDialogOpen(true)}>
              <Plus className="size-4" />
            </Button>
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

      <Card className="flex min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>{pageTitle}</CardTitle>
            </div>
            {!isCorporationColumn && (
              <Button onClick={handleAdd}>
                新增内容
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col">
          {isCorporationColumn ? (
            <div className="min-h-0 flex-1">
              <CorporationColumnPanel column={selectedColumn} />
            </div>
          ) : activeLoading ? (
            <div className="flex min-h-0 flex-1 items-center justify-center rounded border p-8 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto rounded border">
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
            </div>
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
        </CardContent>
      </Card>

      <ProductFormDialog
        open={productFormOpen}
        onOpenChange={setProductFormOpen}
        product={editingProduct}
        mode={editingProduct ? 'edit' : 'create'}
        defaultCategoryId={selectedSourceType === 'product_category' ? selectedSourceId : 1}
      />

      <NewsFormDialog
        open={newsFormOpen}
        onOpenChange={setNewsFormOpen}
        news={editingNews}
        mode={editingNews ? 'edit' : 'create'}
        defaultCategoryId={selectedSourceType === 'news_category' ? selectedSourceId : 1}
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>标题</TableHead>
          <TableHead>编号</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>状态</TableHead>
          <TableHead>推荐</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center">暂无内容</TableCell>
          </TableRow>
        ) : (
          items.map((product) => (
            <TableRow key={product.id}>
              <TableCell>{product.id}</TableCell>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell>{product.code || '-'}</TableCell>
              <TableCell>{product.category_name || product.category_id || '-'}</TableCell>
              <TableCell>{product.is_visible === 1 ? <Badge>显示</Badge> : <Badge variant="secondary">隐藏</Badge>}</TableCell>
              <TableCell>{product.is_featured_home === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(product)}>编辑</Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(product.id)}>删除</Button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  )
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>标题</TableHead>
          <TableHead>分类</TableHead>
          <TableHead>推荐</TableHead>
          <TableHead>创建时间</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.length === 0 ? (
          <TableRow>
            <TableCell colSpan={6} className="text-center">暂无内容</TableCell>
          </TableRow>
        ) : (
          items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.id}</TableCell>
              <TableCell className="font-medium">{item.title}</TableCell>
              <TableCell>{item.category_name || item.category_id || '-'}</TableCell>
              <TableCell>{Number(item.is_featured_home || item.is_featured || 0) === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
              <TableCell>{item.created_at ? new Date(item.created_at).toLocaleDateString('zh-CN') : '-'}</TableCell>
              <TableCell className="text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(item)}>编辑</Button>
                <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>删除</Button>
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

function isEditableCategoryColumn(column: Column) {
  return column.source_type === 'product_category'
    || column.source_type === 'news_category'
    || column.source_type === 'corporation_category'
}

async function saveOptionalTemplateBinding(
  targetType: Extract<TemplateBinding['target_type'], 'product_category' | 'news_category' | 'corporation_category'>,
  targetId: number,
  templateType: Extract<TemplateBinding['template_type'], 'list' | 'content'>,
  templateId: string
) {
  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    return
  }

  await templatesApi.saveBinding({
    target_type: targetType,
    target_id: targetId,
    template_type: templateType,
    template_id: Number(templateId),
  })
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
  if (column.source_type === 'product_category') {
    return {
      type: 'product',
      id: column.source_id,
      columnId: column.id,
      name: column.name,
      targetType: 'product_category',
    }
  }

  if (column.source_type === 'news_category') {
    return {
      type: 'news',
      id: column.source_id,
      columnId: column.id,
      name: column.name,
      targetType: 'news_category',
    }
  }

  if (column.source_type === 'corporation_category') {
    return {
      type: 'corporation',
      id: column.source_id,
      columnId: column.id,
      name: column.name,
      targetType: 'corporation_category',
    }
  }

  return null
}

function toTreeItem(column: ColumnTreeNode): TreeItemData<Column> {
  return {
    id: column.id,
    label: column.name,
    data: column,
    children: column.children.map(toTreeItem),
  }
}
