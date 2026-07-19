import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, RefreshCw, Search, Trash2 } from 'lucide-react'
import { contentModelsApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { contentItemsApi } from '@/api/content-items'
import { staticGenerationApi } from '@/api/static-generation'
import { languagesApi } from '@/api/languages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DataTablePagination } from '@/components/DataTablePagination'
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
import { buildColumnPathMap, buildColumnTreeOptions } from '@/lib/column-options'
import { formatDate } from '@/lib/datetime'
import { getFieldLabel, mapFieldsByName } from '@/lib/content-model-fields'
import { toast } from 'sonner'
import type { Column, ManagedContentItem, SectionContentItem } from '@/types'
import ContentItemFormDialog from '@/components/ContentItemFormDialog'

type ListedContentItem = ManagedContentItem | SectionContentItem

const PAGE_LIMIT = 20

interface ContentModelDataPageProps {
  initialModelCode?: string
  lockModelSelection?: boolean
  createButtonLabel?: string
}

export default function ContentModelDataPage({
  initialModelCode = '',
  lockModelSelection = false,
  createButtonLabel = '新增内容',
}: ContentModelDataPageProps) {
  const queryClient = useQueryClient()
  const [selectedModelCode, setSelectedModelCode] = useState('')
  const [selectedColumnId, setSelectedColumnId] = useState('all')
  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
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
    if ((lockModelSelection || !selectedModelCode) && initialModelCode && models.some((model) => model.code === initialModelCode) && selectedModelCode !== initialModelCode) {
      setSelectedModelCode(initialModelCode)
      setSelectedColumnId('all')
      setPage(1)
      return
    }
    if (!selectedModelCode || !models.some((model) => model.code === selectedModelCode)) {
      setSelectedModelCode(models[0].code)
    }
  }, [initialModelCode, lockModelSelection, models, selectedModelCode])

  const selectedModel = useMemo(
    () => models.find((model) => model.code === selectedModelCode) || models[0] || null,
    [models, selectedModelCode],
  )
  const fieldMap = useMemo(() => mapFieldsByName(selectedModel?.fields || []), [selectedModel?.fields])
  const allColumns = columnsData?.data || []
  const modelColumns = useMemo(
    () => allColumns.filter((column) => (
      Number(column.content_model_id || 0) === Number(selectedModel?.id || 0)
      && column.column_type === 'list'
    )),
    [allColumns, selectedModel?.id],
  )
  const modelColumnOptions = useMemo(
    () => buildColumnTreeOptions(allColumns, { selectableColumnIds: modelColumns.map((column) => column.id) }),
    [allColumns, modelColumns],
  )
  const columnPathById = useMemo(() => buildColumnPathMap(allColumns), [allColumns])

  useEffect(() => {
    if (selectedColumnId === 'all') {
      return
    }
    if (!modelColumnOptions.some((option) => option.value === selectedColumnId)) {
      setSelectedColumnId('all')
    }
  }, [modelColumnOptions, selectedColumnId])

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['content-items', selectedModel?.code || '', 'model-data', selectedColumnId, keyword, page, PAGE_LIMIT, defaultLanguageCode],
    queryFn: () => contentItemsApi.list<ListedContentItem>(selectedModel!.code, {
      page,
      limit: PAGE_LIMIT,
      column_id: selectedColumnId !== 'all' ? Number.parseInt(selectedColumnId, 10) : undefined,
      include_descendants: selectedColumnId !== 'all' ? 1 : undefined,
      language: defaultLanguageCode,
      keyword: keyword || undefined,
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

  const regenerateMutation = useMutation({
    mutationFn: async ({ modelCode, id }: { modelCode: string; id: number }) => staticGenerationApi.regenerateContentItem(modelCode, id),
    onSuccess: (result) => {
      const languageCount = result.data?.languageCodes.length || 0
      const skippedCount = result.data?.skippedLanguageCodes.length || 0
      if (languageCount > 0) {
        toast.success(`静态页面已刷新，共 ${languageCount} 个语言版本${skippedCount > 0 ? `，跳过 ${skippedCount} 个缺少翻译的语言` : ''}`)
        return
      }
      toast.warning('当前信息没有可发布的语言版本，已清理旧静态页面')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '静态页面刷新失败')
    },
  })

  const items = itemsData?.items || []
  const pagination = itemsData?.pagination
  const titleFieldName = fieldMap.has('title') ? 'title' : 'name'
  const titleFieldLabel = getFieldLabel(fieldMap, titleFieldName, titleFieldName === 'title' ? '标题' : '名称')
  const showCode = fieldMap.has('code') && selectedModel.code !== 'product'
  const showFeatured = fieldMap.has('is_featured_home')
  const showVisibility = fieldMap.has('is_visible')
  const showSortOrder = fieldMap.has('sort_order')
  const showCreatedAt = fieldMap.has('created_at')

  const handleSelectModel = (nextModelCode: string) => {
    if (lockModelSelection) {
      return
    }
    setSelectedModelCode(nextModelCode)
    setSelectedColumnId('all')
    setKeywordInput('')
    setKeyword('')
    setPage(1)
    setFormOpen(false)
    setEditingItem(undefined)
  }

  const handleSelectColumn = (nextColumnId: string) => {
    setSelectedColumnId(nextColumnId)
    setPage(1)
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setKeyword(keywordInput.trim())
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

  const handleRegenerate = (item: ListedContentItem) => {
    regenerateMutation.mutate({ modelCode: selectedModel.code, id: item.id })
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
      <div className="space-y-4">
          <div className={lockModelSelection ? 'grid items-center gap-4 xl:grid-cols-[auto_minmax(0,240px)_minmax(240px,1fr)_auto]' : 'grid items-center gap-4 xl:grid-cols-[auto_minmax(0,220px)_minmax(0,220px)_minmax(240px,1fr)_auto]'}>
            <Button onClick={handleCreate}>{createButtonLabel}</Button>

            {!lockModelSelection ? (
              <div>
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
            ) : null}

            <div>
              <Select value={selectedColumnId} onValueChange={handleSelectColumn}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部栏目</SelectItem>
                  {modelColumnOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <form className="min-w-0" onSubmit={handleSearchSubmit}>
              <div className="flex gap-2">
                <Input
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder={selectedModel.code === 'product' ? '搜索产品名称' : `搜索${titleFieldLabel}`}
                  aria-label={selectedModel.code === 'product' ? '搜索产品名称' : `搜索${titleFieldLabel}`}
                />
                <Button type="submit" variant="outline" size="icon" aria-label="搜索">
                  <Search className="size-4" />
                </Button>
              </div>
            </form>

            <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
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
                      <TableCell>{resolveColumnLabel(item, modelColumns, columnPathById)}</TableCell>
                      {showFeatured ? (
                        <TableCell>{Number(item.is_featured_home || (item as SectionContentItem).is_featured || 0) === 1 ? <Badge>是</Badge> : <Badge variant="outline">否</Badge>}</TableCell>
                      ) : null}
                      {showVisibility ? (
                        <TableCell>{(item as ManagedContentItem).is_visible === 1 ? <Badge>显示</Badge> : <Badge variant="secondary">隐藏</Badge>}</TableCell>
                      ) : null}
                      {showSortOrder ? <TableCell>{Number(item.sort_order || 0)}</TableCell> : null}
                      {showCreatedAt ? <TableCell>{formatDate(resolveCreatedAt(item))}</TableCell> : null}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRegenerate(item)}
                          disabled={regenerateMutation.isPending}
                          title="重新生成所有语言的静态页面"
                          aria-label="刷新静态页面"
                        >
                          {regenerateMutation.isPending && regenerateMutation.variables?.id === item.id
                            ? <Loader2 className="animate-spin" />
                            : <RefreshCw />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleEdit(item)}
                          title="编辑"
                          aria-label="编辑"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          variant="destructiveGhost"
                          size="icon-sm"
                          onClick={() => handleDelete(item)}
                          title="删除"
                          aria-label="删除"
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination ? (
            <DataTablePagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total || 0}
              pageSize={PAGE_LIMIT}
              onPageChange={setPage}
            />
          ) : null}
      </div>

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
        <ContentItemFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          item={editingItem}
          mode={editingItem ? 'edit' : 'create'}
          modelCode={selectedModel.code}
          defaultColumnId={selectedColumnId !== 'all' ? Number.parseInt(selectedColumnId, 10) : undefined}
        />
      ) : null}
    </div>
  )
}

function resolveContentItemTitle(item: ListedContentItem) {
  return 'title' in item ? String(item.title || '') : String(item.name || '')
}

function resolveCreatedAt(item: ListedContentItem) {
  return 'created_at' in item ? String(item.created_at || '') : ''
}

function resolveColumnLabel(
  item: ListedContentItem,
  modelColumns: Column[],
  columnPathById: Map<number, string>,
) {
  const columnId = Number(item.column_id || 0)
  if (columnId > 0) {
    return columnPathById.get(columnId)
      || modelColumns.find((column) => column.id === columnId)?.name
      || item.column_name
      || String(columnId)
  }
  return item.column_name || '-'
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
