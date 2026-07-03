import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { columnsApi } from '@/api/columns'
import { contentModelsApi } from '@/api/advanced'
import { contentItemsApi } from '@/api/content-items'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Ellipsis, Pencil, Trash2 } from 'lucide-react'
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
import { toast } from 'sonner'
import type { Column, ContentModel, ManagedContentItem } from '@/types'

const PRICE_MODEL_CODE = 'price_record'
const PRICE_LIST_BASE_PATH = '/price-lists/'

type PriceRecordItem = ManagedContentItem & {
  model?: string
  spec?: string
  diameter?: string
  price?: number | null
  material_code?: string
  category?: string
  description?: string
  stock?: number | null
  reference_no?: string
  name_en?: string
  material?: string
}

type PriceRecordField = 'name' | 'model' | 'spec' | 'diameter' | 'price' | 'material_code' | 'category' | 'stock' | 'reference_no' | 'name_en' | 'material'

type PriceGridRow = Record<PriceRecordField, string> & {
  id?: number
  column_id?: number
  updated_at?: string
  created_at?: string
  _localId: string
  _isDraft: boolean
  _original: Record<PriceRecordField, string>
}

const GRID_MIN_EMPTY_ROW_COUNT = 20
const PRICE_GRID_COLUMNS: Array<{ field: PriceRecordField, label: string, type?: 'text' | 'number', className?: string }> = [
  { field: 'name', label: '名称', className: 'min-w-[160px]' },
  { field: 'model', label: '型号', className: 'min-w-[130px]' },
  { field: 'spec', label: '规格', className: 'min-w-[130px]' },
  { field: 'diameter', label: '口径', className: 'min-w-[100px]' },
  { field: 'price', label: '价格', type: 'number', className: 'min-w-[100px]' },
  { field: 'material_code', label: '物料代码', className: 'min-w-[140px]' },
  { field: 'category', label: '分类', className: 'min-w-[120px]' },
  { field: 'stock', label: '库存', type: 'number', className: 'min-w-[90px]' },
  { field: 'reference_no', label: '参考编号', className: 'min-w-[140px]' },
  { field: 'name_en', label: '英文名称', className: 'min-w-[160px]' },
  { field: 'material', label: '材质', className: 'min-w-[120px]' },
]

export default function PriceManagementPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newListName, setNewListName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PriceRecordItem | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [listDialogName, setListDialogName] = useState('')
  const [listActionTarget, setListActionTarget] = useState<Column | null>(null)
  const [deleteListOpen, setDeleteListOpen] = useState(false)
  const [priceSearch, setPriceSearch] = useState('')

  const { data: modelsData, isLoading: modelsLoading } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })
  const { data: columnsData, isLoading: columnsLoading } = useQuery({
    queryKey: ['columns', 'price-management'],
    queryFn: () => columnsApi.list(),
  })

  const priceModel = useMemo(
    () => (modelsData?.data || []).find((model) => model.code === PRICE_MODEL_CODE) || null,
    [modelsData?.data],
  )
  const priceListColumns = useMemo(
    () => (columnsData?.data || [])
      .filter((column) => (
        Number(column.content_model_id || 0) === Number(priceModel?.id || 0)
        && column.column_type === 'list'
        && String(column.route_path || '').startsWith(PRICE_LIST_BASE_PATH)
      ))
      .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0) || left.id - right.id),
    [columnsData?.data, priceModel?.id],
  )

  const selectedColumnId = Number.parseInt(searchParams.get('list') || '0', 10) || 0
  const selectedColumn = priceListColumns.find((column) => column.id === selectedColumnId) || priceListColumns[0] || null

  useEffect(() => {
    if (!selectedColumn) {
      return
    }
    if (selectedColumn.id !== selectedColumnId) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.set('list', String(selectedColumn.id))
      setSearchParams(nextParams, { replace: true })
    }
  }, [priceListColumns, searchParams, selectedColumn, selectedColumnId, setSearchParams])

  useEffect(() => {
    setPriceSearch('')
  }, [selectedColumn?.id])

  const { data: itemsData, isLoading: itemsLoading } = useQuery({
    queryKey: ['content-items', PRICE_MODEL_CODE, 'price-management', selectedColumn?.id || 0],
    queryFn: () => contentItemsApi.list<PriceRecordItem>(PRICE_MODEL_CODE, {
      page: 1,
      limit: 500,
      column_id: selectedColumn?.id,
    }),
    enabled: Boolean(selectedColumn?.id),
    staleTime: 0,
  })

  const createListMutation = useMutation({
    mutationFn: async () => {
      const name = String(newListName || '').trim()
      if (!name) {
        throw new Error('请输入报价列表名称')
      }
      if (!priceModel?.id) {
        throw new Error('价格条目模型尚未准备完成')
      }
      const routePath = buildPriceListRoutePath(name)
      return columnsApi.create({
        base: {
          name,
          parent_id: 0,
          column_type: 'list',
          content_model_id: priceModel.id,
          custom_url: '',
          dir_name: '',
          route_path: routePath,
          detail_rule: '{id}.html',
          sort_order: priceListColumns.length * 10,
          is_visible: 1,
        },
      })
    },
    onSuccess: (response) => {
      toast.success('报价列表已创建')
      setNewListName('')
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      const createdColumn = response.data
      if (createdColumn?.id) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('list', String(createdColumn.id))
        setSearchParams(nextParams, { replace: true })
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '创建失败')
    },
  })

  const renameListMutation = useMutation({
    mutationFn: async ({ column, name }: { column: Column, name: string }) => {
      if (!name) {
        throw new Error('请输入报价列表名称')
      }
      return columnsApi.update(column.id, {
        parent_id: Number(column.parent_id || 0),
        content_model_id: Number(column.content_model_id || 0),
        dir_name: column.dir_name || '',
        route_path: column.route_path || '',
        detail_rule: column.detail_rule || '{id}.html',
        sort_order: Number(column.sort_order || 0),
        is_visible: Number(column.is_visible ?? 1),
        translations: buildRenamedColumnTranslations(column, name),
      })
    },
    onSuccess: () => {
      toast.success('报价列表名称已更新')
      setListDialogOpen(false)
      setListActionTarget(null)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新失败')
    },
  })

  const deleteListMutation = useMutation({
    mutationFn: async (column: Column) => {
      return columnsApi.delete(column.id)
    },
    onSuccess: (_response, deletedColumn) => {
      toast.success('报价列表已删除')
      setDeleteListOpen(false)
      setListActionTarget(null)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['content-items', PRICE_MODEL_CODE] })
      const nextColumn = priceListColumns.find((column) => column.id !== deletedColumn.id) || null
      const nextParams = new URLSearchParams(searchParams)
      if (nextColumn) {
        nextParams.set('list', String(nextColumn.id))
      } else {
        nextParams.delete('list')
      }
      setSearchParams(nextParams, { replace: true })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '删除失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (itemId: number) => contentItemsApi.delete(PRICE_MODEL_CODE, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-items', PRICE_MODEL_CODE] })
      toast.success('价格条目已删除')
      setDeleteTarget(null)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const items = itemsData?.items || []

  const handleSelectList = (column: Column) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('list', String(column.id))
    setSearchParams(nextParams)
  }

  const handleOpenRenameList = (column: Column) => {
    setListActionTarget(column)
    setListDialogName(column.name || '')
    setListDialogOpen(true)
  }

  const handleOpenDeleteList = (column: Column) => {
    setListActionTarget(column)
    setDeleteListOpen(true)
  }

  if (modelsLoading || columnsLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="flex h-full flex-col">
      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <CardTitle>报价列表</CardTitle>
            <CardDescription>新增后可在右侧录入该列表下的价格条目。</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-price-list">新增报价列表</Label>
              <div className="flex gap-2">
                <Input
                  id="new-price-list"
                  value={newListName}
                  onChange={(event) => setNewListName(event.target.value)}
                  placeholder="例如：2026 Q3 工业蒸汽阀门"
                />
                <Button onClick={() => createListMutation.mutate()} disabled={createListMutation.isPending}>
                  新增
                </Button>
              </div>
            </div>

            <Separator />

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-2 pr-3">
                {priceListColumns.length > 0 ? priceListColumns.map((column) => (
                  <div
                    key={column.id}
                    className={`group/price-list-item flex w-full items-start gap-2 rounded-lg border px-3 py-3 text-left transition-colors ${
                      selectedColumn?.id === column.id ? 'border-primary bg-muted' : 'hover:bg-muted/60'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectList(column)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="truncate font-medium">{column.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {column.route_path || '-'}
                      </div>
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover/price-list-item:opacity-100 group-focus-within/price-list-item:opacity-100 data-[state=open]:opacity-100"
                          aria-label={`${column.name}列表操作`}
                        >
                          <Ellipsis className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => handleOpenRenameList(column)}>
                          <Pencil className="size-4" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => handleOpenDeleteList(column)}
                        >
                          <Trash2 className="size-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )) : (
                  <div className="rounded border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    还没有报价列表。先在上方创建一个。
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <Input
              value={priceSearch}
              onChange={(event) => setPriceSearch(event.target.value)}
              placeholder="搜索..."
              disabled={!selectedColumn}
              className="w-[180px]"
            />
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden">
            {!selectedColumn ? (
              <div className="rounded border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                请选择一个报价列表。
              </div>
            ) : itemsLoading ? (
              <div>加载中...</div>
            ) : (
              <PriceRecordGrid
                items={items}
                selectedColumnId={selectedColumn.id}
                search={priceSearch}
                onDeleteItem={setDeleteTarget}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => {
        if (!open) {
          setDeleteTarget(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除价格条目</AlertDialogTitle>
            <AlertDialogDescription>
              删除后不可恢复。确认删除“{deleteTarget?.name || '-'}”吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget?.id) {
                  deleteMutation.mutate(deleteTarget.id)
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={listDialogOpen} onOpenChange={(open) => {
        setListDialogOpen(open)
        if (!open) {
          setListActionTarget(null)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名报价列表</DialogTitle>
            <DialogDescription>只更新当前报价列表名称，不修改其路径。</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="price-list-name">报价列表名称</Label>
            <Input
              id="price-list-name"
              value={listDialogName}
              onChange={(event) => setListDialogName(event.target.value)}
              placeholder="请输入报价列表名称"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialogOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const targetColumn = listActionTarget || selectedColumn
                if (!targetColumn) {
                  toast.error('当前没有可编辑的报价列表')
                  return
                }
                renameListMutation.mutate({
                  column: targetColumn,
                  name: String(listDialogName || '').trim(),
                })
              }}
              disabled={renameListMutation.isPending}
            >
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteListOpen} onOpenChange={(open) => {
        setDeleteListOpen(open)
        if (!open) {
          setListActionTarget(null)
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除报价列表</AlertDialogTitle>
            <AlertDialogDescription>
              删除后会一并删除该报价列表下的全部价格条目，且不可恢复。确认删除“{listActionTarget?.name || '-'}”吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              const targetColumn = listActionTarget || selectedColumn
              if (!targetColumn) {
                toast.error('当前没有可删除的报价列表')
                return
              }
              deleteListMutation.mutate(targetColumn)
            }}>
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function buildPriceListRoutePath(name: string) {
  const slug = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  const safeSlug = slug || `list-${Date.now()}`
  return `${PRICE_LIST_BASE_PATH}${safeSlug}/`
}

function buildRenamedColumnTranslations(column: Column, name: string) {
  const languageCode = column.resolved_language_code || column.current_language_code || 'zh-CN'
  return {
    ...(column.translations || {}),
    [languageCode]: {
      ...(column.translations?.[languageCode] || {}),
      name,
    },
  }
}

function PriceRecordGrid({
  items,
  selectedColumnId,
  search,
  onDeleteItem,
}: {
  items: PriceRecordItem[]
  selectedColumnId: number
  search: string
  onDeleteItem: (item: PriceRecordItem) => void
}) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<PriceGridRow[]>(() => buildGridRows(items, selectedColumnId))
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setRows(buildGridRows(items, selectedColumnId))
  }, [items, selectedColumnId])

  const saveMutation = useMutation({
    mutationFn: async (row: PriceGridRow) => {
      const payload = buildPriceRecordPayload(row, selectedColumnId)
      if (!payload.base.name) {
        throw new Error('请输入名称')
      }
      if (row.id) {
        return contentItemsApi.update<PriceRecordItem>(PRICE_MODEL_CODE, row.id, payload)
      }
      return contentItemsApi.create<PriceRecordItem>(PRICE_MODEL_CODE, payload)
    },
    onMutate: (row) => {
      setSavingRows((current) => ({ ...current, [row._localId]: true }))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-items', PRICE_MODEL_CODE] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '保存失败')
    },
    onSettled: (_data, _error, row) => {
      if (!row) {
        return
      }
      setSavingRows((current) => {
        const next = { ...current }
        delete next[row._localId]
        return next
      })
    },
  })

  const handleChangeCell = (rowLocalId: string, field: PriceRecordField, value: string) => {
    setRows((current) => ensureMinimumEmptyRows(
      current.map((row) => (
        row._localId === rowLocalId ? { ...row, [field]: value } : row
      )),
      selectedColumnId,
    ))
  }

  const handleCommitRow = (rowLocalId: string) => {
    const row = rows.find((item) => item._localId === rowLocalId)
    if (!row || savingRows[rowLocalId]) {
      return
    }
    if (!isGridRowDirty(row)) {
      return
    }
    if (!isGridRowChanged(row)) {
      return
    }
    if (!row.name.trim()) {
      toast.error('请输入名称')
      return
    }
    saveMutation.mutate(row)
  }

  const visibleRows = useMemo(() => filterGridRows(rows, search), [rows, search])

  return (
    <div className="h-full overflow-hidden rounded border">
      <Table className="min-w-[1320px]" containerClassName="h-full">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-card hover:bg-card">
              {PRICE_GRID_COLUMNS.map((column) => (
                <TableHead key={column.field} className={column.className}>
                  {column.label}
                </TableHead>
              ))}
              <TableHead className="min-w-[140px]">更新时间</TableHead>
              <TableHead className="w-14 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleRows.map((row) => (
              <TableRow key={row._localId} className="group/price-row">
                {PRICE_GRID_COLUMNS.map((column) => (
                  <TableCell key={column.field} className="h-10 border-r p-0 align-middle">
                    <PriceGridCell
                      row={row}
                      column={column}
                      disabled={Boolean(savingRows[row._localId])}
                      onChange={handleChangeCell}
                      onCommit={handleCommitRow}
                    />
                  </TableCell>
                ))}
                <TableCell className="h-10 border-r px-2 text-xs text-muted-foreground">
                  {row._isDraft ? '' : formatDate(row.updated_at || row.created_at || '')}
                </TableCell>
                <TableCell className="h-10 p-1 text-right">
                  {!row._isDraft ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 transition-opacity group-hover/price-row:opacity-100 group-focus-within/price-row:opacity-100"
                      onClick={() => onDeleteItem(gridRowToPriceRecordItem(row))}
                      aria-label="删除价格条目"
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
    </div>
  )
}

function PriceGridCell({
  row,
  column,
  disabled,
  onChange,
  onCommit,
}: {
  row: PriceGridRow
  column: { field: PriceRecordField, label: string, type?: 'text' | 'number' }
  disabled: boolean
  onChange: (rowLocalId: string, field: PriceRecordField, value: string) => void
  onCommit: (rowLocalId: string) => void
}) {
  return (
    <Input
      type={column.type || 'text'}
      value={row[column.field]}
      disabled={disabled}
      onChange={(event) => onChange(row._localId, column.field, event.target.value)}
      onBlur={() => onCommit(row._localId)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          event.currentTarget.blur()
        }
      }}
      aria-label={column.label}
      className="h-10 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-70"
    />
  )
}

function buildGridRows(items: PriceRecordItem[], selectedColumnId: number): PriceGridRow[] {
  const persistedRows = items.map((item) => priceRecordToGridRow(item))
  return ensureMinimumEmptyRows(persistedRows, selectedColumnId)
}

function ensureMinimumEmptyRows(rows: PriceGridRow[], selectedColumnId: number) {
  const emptyDraftCount = rows.filter((row) => row._isDraft && !isGridRowDirty(row)).length
  if (emptyDraftCount >= GRID_MIN_EMPTY_ROW_COUNT) {
    return rows
  }
  const timestamp = Date.now()
  const rowsToAdd = GRID_MIN_EMPTY_ROW_COUNT - emptyDraftCount
  const draftRows = Array.from({ length: rowsToAdd }, (_value, index) => createDraftGridRow(selectedColumnId, `${timestamp}-${index}`))
  return [...rows, ...draftRows]
}

function filterGridRows(rows: PriceGridRow[], search: string) {
  const keyword = search.trim().toLowerCase()
  if (!keyword) {
    return rows
  }
  return rows.filter((row) => {
    if (row._isDraft) {
      return true
    }
    return PRICE_GRID_COLUMNS.some((column) => row[column.field].toLowerCase().includes(keyword))
  })
}

function priceRecordToGridRow(item: PriceRecordItem): PriceGridRow {
  const values = {
    name: stringifyCell(item.name),
    model: stringifyCell(item.model),
    spec: stringifyCell(item.spec),
    diameter: stringifyCell(item.diameter),
    price: stringifyCell(item.price),
    material_code: stringifyCell(item.material_code),
    category: stringifyCell(item.category),
    stock: stringifyCell(item.stock),
    reference_no: stringifyCell(item.reference_no),
    name_en: stringifyCell(item.name_en),
    material: stringifyCell(item.material),
  }
  return {
    id: item.id,
    column_id: Number(item.column_id || 0) || undefined,
    updated_at: item.updated_at,
    created_at: item.created_at,
    _localId: `item-${item.id}`,
    _isDraft: false,
    _original: values,
    ...values,
  }
}

function createDraftGridRow(selectedColumnId: number, index: number | string): PriceGridRow {
  const values = createEmptyGridValues()
  return {
    column_id: selectedColumnId,
    _localId: `draft-${selectedColumnId}-${index}`,
    _isDraft: true,
    _original: values,
    ...values,
  }
}

function buildPriceRecordPayload(row: PriceGridRow, selectedColumnId: number) {
  return {
    base: {
      column_id: selectedColumnId || row.column_id,
      name: row.name.trim(),
      model: row.model.trim(),
      spec: row.spec.trim(),
      diameter: row.diameter.trim(),
      price: row.price.trim(),
      material_code: row.material_code.trim(),
      category: row.category.trim(),
      description: '',
      stock: row.stock.trim(),
      reference_no: row.reference_no.trim(),
      name_en: row.name_en.trim(),
      material: row.material.trim(),
    },
  }
}

function isGridRowDirty(row: PriceGridRow) {
  return PRICE_GRID_COLUMNS.some((column) => row[column.field].trim())
}

function isGridRowChanged(row: PriceGridRow) {
  return PRICE_GRID_COLUMNS.some((column) => row[column.field] !== row._original[column.field])
}

function createEmptyGridValues(): Record<PriceRecordField, string> {
  return {
    name: '',
    model: '',
    spec: '',
    diameter: '',
    price: '',
    material_code: '',
    category: '',
    stock: '',
    reference_no: '',
    name_en: '',
    material: '',
  }
}

function stringifyCell(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value)
}

function gridRowToPriceRecordItem(row: PriceGridRow): PriceRecordItem {
  return {
    id: row.id || 0,
    column_id: row.column_id,
    name: row.name,
    model: row.model,
    spec: row.spec,
    diameter: row.diameter,
    price: row.price === '' ? null : Number(row.price),
    material_code: row.material_code,
    category: row.category,
    stock: row.stock === '' ? null : Number(row.stock),
    reference_no: row.reference_no,
    name_en: row.name_en,
    material: row.material,
    updated_at: row.updated_at,
    created_at: row.created_at,
  } as PriceRecordItem
}
