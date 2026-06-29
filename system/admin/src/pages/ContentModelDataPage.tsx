import { Suspense, lazy, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contentModelsApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { contentItemsApi } from '@/api/content-items'
import { languagesApi } from '@/api/languages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { formatDate } from '@/lib/datetime'
import { getFieldLabel, isFieldVisible, mapFieldsByName } from '@/lib/content-model-fields'
import { toast } from 'sonner'
import type { ManagedContentItem, SectionContentItem } from '@/types'

const ContentItemFormDialog = lazy(() => import('@/components/ContentItemFormDialog'))

type ListedContentItem = ManagedContentItem | SectionContentItem

const PAGE_LIMIT = 20

function DialogFallback() {
  return null
}

export default function ContentModelDataPage() {
  const queryClient = useQueryClient()
  const [selectedModelCode, setSelectedModelCode] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState('all')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<ListedContentItem | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<ListedContentItem | null>(null)

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const defaultLanguageCode = languagesData?.data?.find((language) => language.is_default === 1)?.code || 'zh-CN'
  const { data: columnsData } = useQuery({
    queryKey: ['columns', defaultLanguageCode],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode }),
  })

  const models = modelsData?.data || []

  useEffect(() => {
    if (!models.length) {
      return
    }
    if (!selectedModelCode || !models.some((model) => model.code === selectedModelCode)) {
      setSelectedModelCode(models[0].code)
    }
  }, [models, selectedModelCode])

  const selectedModel = useMemo(
    () => models.find((model) => model.code === selectedModelCode) || models[0] || null,
    [models, selectedModelCode],
  )
  const fieldMap = useMemo(() => mapFieldsByName(selectedModel?.fields || []), [selectedModel?.fields])
  const modelColumns = useMemo(
    () => (columnsData?.data || []).filter((column) => (
      Number(column.content_model_id || 0) === Number(selectedModel?.id || 0)
      && column.column_type === 'list'
    )),
    [columnsData?.data, selectedModel?.id],
  )

  useEffect(() => {
    if (selectedColumnId === 'all') {
      return
    }
    if (!modelColumns.some((column) => String(column.id) === selectedColumnId)) {
      setSelectedColumnId('all')
    }
  }, [modelColumns, selectedColumnId])

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['content-items', selectedModel?.code || '', 'model-data', selectedColumnId, page, PAGE_LIMIT, defaultLanguageCode],
    queryFn: () => contentItemsApi.list<ListedContentItem>(selectedModel!.code, {
      page,
      limit: PAGE_LIMIT,
      column_id: selectedColumnId !== 'all' ? Number.parseInt(selectedColumnId, 10) : undefined,
      include_descendants: selectedColumnId !== 'all' ? 1 : undefined,
      language: defaultLanguageCode,
    }),
    enabled: Boolean(selectedModel?.code),
    staleTime: 0,
  })

  const deleteMutation = useMutation({
    mutationFn: async ({ modelCode, id }: { modelCode: string; id: number }) => contentItemsApi.delete(modelCode, id),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['content-items', variables.modelCode] })
      toast.success('删除成功')
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const items = itemsData?.items || []
  const pagination = itemsData?.pagination
  const titleFieldName = fieldMap.has('title') ? 'title' : 'name'
  const titleFieldLabel = getFieldLabel(fieldMap, titleFieldName, titleFieldName === 'title' ? '标题' : '名称')
  const showCode = isFieldVisible(fieldMap, 'code', false)
  const showFeatured = isFieldVisible(fieldMap, 'is_featured_home', false)
  const showVisibility = isFieldVisible(fieldMap, 'is_visible', false)
  const showSortOrder = isFieldVisible(fieldMap, 'sort_order', false)
  const showCreatedAt = isFieldVisible(fieldMap, 'created_at', false)

  const handleSelectModel = (nextModelCode: string) => {
    setSelectedModelCode(nextModelCode)
    setSelectedColumnId('all')
    setPage(1)
    setFormOpen(false)
    setEditingItem(undefined)
  }

  const handleSelectColumn = (nextColumnId: string) => {
    setSelectedColumnId(nextColumnId)
    setPage(1)
  }

  const handleCreate = () => {
    setEditingItem(undefined)
    setFormOpen(true)
  }

  const handleEdit = (item: ListedContentItem) => {
    setEditingItem(item)
    setFormOpen(true)
  }

  const handleDelete = (item: ListedContentItem) => {
    setDeleteTarget(item)
  }

  const confirmDelete = () => {
    if (!selectedModel || !deleteTarget) {
      return
    }
    deleteMutation.mutate({ modelCode: selectedModel.code, id: deleteTarget.id })
  }

  if (modelsLoading) {
    return <div>加载中...</div>
  }

  if (!selectedModel) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">暂无信息模型</CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>信息</CardTitle>
              <CardDescription>统一管理内容模型下的信息，默认进入第一个模型，可在上方切换。</CardDescription>
            </div>
            <Button onClick={handleCreate}>新增内容</Button>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_minmax(0,260px)_minmax(0,1fr)]">
            <div className="space-y-2">
              <Label>内容模型</Label>
              <Select value={selectedModel.code} onValueChange={handleSelectModel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.code}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>所属栏目</Label>
              <Select value={selectedColumnId} onValueChange={handleSelectColumn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部栏目</SelectItem>
                  {modelColumns.map((column) => (
                    <SelectItem key={column.id} value={String(column.id)}>
                      {column.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap items-end justify-start gap-2 lg:justify-end">
              <Badge variant="outline">{selectedModel.code}</Badge>
              <Badge variant="outline">{selectedModel.fields.length} 字段</Badge>
              <Badge variant="outline">{modelColumns.length} 栏目</Badge>
            </div>
          </div>

          <div className="rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>{titleFieldLabel}</TableHead>
                  {showCode ? <TableHead>{getFieldLabel(fieldMap, 'code', '编号')}</TableHead> : null}
                  <TableHead>栏目</TableHead>
                  {showFeatured ? <TableHead>{getFieldLabel(fieldMap, 'is_featured_home', '推荐')}</TableHead> : null}
                  {showVisibility ? <TableHead>{getFieldLabel(fieldMap, 'is_visible', '显示状态')}</TableHead> : null}
                  {showSortOrder ? <TableHead>{getFieldLabel(fieldMap, 'sort_order', '排序')}</TableHead> : null}
                  {showCreatedAt ? <TableHead>{getFieldLabel(fieldMap, 'created_at', '创建时间')}</TableHead> : null}
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itemsLoading ? (
                  <TableRow>
                    <TableCell colSpan={resolveColumnCount({ showCode, showFeatured, showVisibility, showSortOrder, showCreatedAt })} className="text-center">
                      加载中...
                    </TableCell>
                  </TableRow>
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={resolveColumnCount({ showCode, showFeatured, showVisibility, showSortOrder, showCreatedAt })} className="text-center">
                      暂无内容
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell className="font-medium">{resolveContentItemTitle(item)}</TableCell>
                      {showCode ? <TableCell>{'code' in item ? item.code || '-' : '-'}</TableCell> : null}
                      <TableCell>{item.column_name || item.column_id || '-'}</TableCell>
                      {showFeatured ? (
                        <TableCell>{Number(item.is_featured_home || (item as SectionContentItem).is_featured || 0) === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
                      ) : null}
                      {showVisibility ? (
                        <TableCell>{(item as ManagedContentItem).is_visible === 1 ? <Badge>显示</Badge> : <Badge variant="secondary">隐藏</Badge>}</TableCell>
                      ) : null}
                      {showSortOrder ? <TableCell>{Number(item.sort_order || 0)}</TableCell> : null}
                      {showCreatedAt ? <TableCell>{formatDate(item.created_at)}</TableCell> : null}
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEdit(item)}>编辑</Button>
                        <Button variant="destructiveGhost" size="sm" onClick={() => handleDelete(item)}>删除</Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination ? (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                共 {pagination.total || 0} 条 · 第 {pagination.page} / {pagination.totalPages} 页
              </div>
              {pagination.totalPages > 1 ? (
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        size="default"
                        className={pagination.page === 1 ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (pagination.page > 1) {
                            setPage(pagination.page - 1)
                          }
                        }}
                      >
                        上一页
                      </PaginationLink>
                    </PaginationItem>
                    {buildPaginationItems(pagination.page, pagination.totalPages).map((item, index) => (
                      item === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === pagination.page}
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
                        className={pagination.page === pagination.totalPages ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (pagination.page < pagination.totalPages) {
                            setPage(pagination.page + 1)
                          }
                        }}
                      >
                        下一页
                      </PaginationLink>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除内容</AlertDialogTitle>
            <AlertDialogDescription>
              将删除“{deleteTarget ? resolveContentItemTitle(deleteTarget) : ''}”，该操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {formOpen ? (
        <Suspense fallback={<DialogFallback />}>
          <ContentItemFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            item={editingItem}
            mode={editingItem ? 'edit' : 'create'}
            modelCode={selectedModel.code}
            defaultColumnId={selectedColumnId !== 'all' ? Number.parseInt(selectedColumnId, 10) : undefined}
          />
        </Suspense>
      ) : null}
    </div>
  )
}

function resolveContentItemTitle(item: ListedContentItem) {
  return 'title' in item ? item.title : item.name
}

function resolveColumnCount({
  showCode,
  showFeatured,
  showVisibility,
  showSortOrder,
  showCreatedAt,
}: {
  showCode: boolean
  showFeatured: boolean
  showVisibility: boolean
  showSortOrder: boolean
  showCreatedAt: boolean
}) {
  return 4
    + Number(showCode)
    + Number(showFeatured)
    + Number(showVisibility)
    + Number(showSortOrder)
    + Number(showCreatedAt)
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
