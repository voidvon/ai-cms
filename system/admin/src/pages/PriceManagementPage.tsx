import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { columnsApi } from '@/api/columns'
import { contentModelsApi } from '@/api/advanced'
import { dataTablesApi } from '@/api/data-tables'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfigurableDataTable } from '@/components/ConfigurableDataTable'
import { DataTableFieldEditor } from '@/components/DataTableFieldEditor'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Ellipsis, ListOrdered, Pencil, Settings2, Trash2 } from 'lucide-react'
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
import type { Column, ContentTableViewColumn, DataTableField, DataTableRecord } from '@/types'

const PRICE_MODEL_CODE = 'price_record'
const PRICE_LIST_BASE_PATH = '/price-lists/'

type DashboardHeaderContext = {
  headerSlotElement: HTMLDivElement | null
}

type PriceRecordDeleteTarget = Pick<DataTableRecord, 'id'> & { name: string }

const GRID_MIN_EMPTY_ROW_COUNT = 20

export default function PriceManagementPage() {
  const queryClient = useQueryClient()
  const { headerSlotElement } = useOutletContext<DashboardHeaderContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newListName, setNewListName] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PriceRecordDeleteTarget | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [listDialogName, setListDialogName] = useState('')
  const [listActionTarget, setListActionTarget] = useState<Column | null>(null)
  const [deleteListOpen, setDeleteListOpen] = useState(false)
  const [priceSearch, setPriceSearch] = useState('')
  const [mobileListDrawerOpen, setMobileListDrawerOpen] = useState(false)
  const [fieldEditorOpen, setFieldEditorOpen] = useState(false)

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

  const { data: dataTableData, isLoading: dataTableLoading } = useQuery({
    queryKey: ['data-table', selectedColumn?.id || 0],
    queryFn: () => dataTablesApi.get(selectedColumn!.id),
    enabled: Boolean(selectedColumn?.id),
  })
  const { data: dataRecordsData, isLoading: dataRecordsLoading } = useQuery({
    queryKey: ['data-table-records', selectedColumn?.id || 0, priceSearch],
    queryFn: () => dataTablesApi.listRecords(selectedColumn!.id, { page: 1, limit: 500, keyword: priceSearch }),
    enabled: Boolean(selectedColumn?.id),
    staleTime: 0,
  })
  const dataTable = dataTableData?.data || null
  const dataRecords = dataRecordsData?.items || []

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
      setMobileListDrawerOpen(false)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      const createdColumn = response.data
      if (createdColumn?.id) {
        const nextParams = new URLSearchParams(searchParams)
        nextParams.set('list', String(createdColumn.id))
        setSearchParams(nextParams, { replace: true })
      }
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '创建失败'))
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
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '更新失败'))
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
      queryClient.invalidateQueries({ queryKey: ['data-table'] })
      const nextColumn = priceListColumns.find((column) => column.id !== deletedColumn.id) || null
      const nextParams = new URLSearchParams(searchParams)
      if (nextColumn) {
        nextParams.set('list', String(nextColumn.id))
      } else {
        nextParams.delete('list')
      }
      setSearchParams(nextParams, { replace: true })
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '删除失败'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (itemId: number) => dataTablesApi.deleteRecord(selectedColumn!.id, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-table-records', selectedColumn?.id || 0] })
      toast.success('价格条目已删除')
      setDeleteTarget(null)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '删除失败'))
    },
  })

  const saveDataFieldsMutation = useMutation({
    mutationFn: (fields: DataTableField[]) => dataTablesApi.updateFields(selectedColumn!.id, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['data-table', selectedColumn?.id || 0] })
      queryClient.invalidateQueries({ queryKey: ['data-table-records', selectedColumn?.id || 0] })
      setFieldEditorOpen(false)
      toast.success('字段配置已保存')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '保存字段失败')),
  })

  const handleSelectList = (column: Column) => {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('list', String(column.id))
    setSearchParams(nextParams)
    setPriceSearch('')
    setMobileListDrawerOpen(false)
  }

  const handleOpenRenameList = (column: Column) => {
    setMobileListDrawerOpen(false)
    setListActionTarget(column)
    setListDialogName(column.name || '')
    setListDialogOpen(true)
  }

  const handleOpenDeleteList = (column: Column) => {
    setMobileListDrawerOpen(false)
    setListActionTarget(column)
    setDeleteListOpen(true)
  }

  if (modelsLoading || columnsLoading) {
    return <div>加载中...</div>
  }

  const renderPriceListControls = (inputId: string) => (
    <div className="flex min-h-0 flex-1 flex-col space-y-4">
      <div className="space-y-2">
        <Label htmlFor={inputId}>新增报价列表</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
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
                    className="h-7 w-7 shrink-0 opacity-100 transition-opacity xl:opacity-0 xl:group-hover/price-list-item:opacity-100 xl:group-focus-within/price-list-item:opacity-100 data-[state=open]:opacity-100"
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
    </div>
  )

  return (
    <div className="flex h-full flex-col">
      {headerSlotElement ? createPortal(
        <div className="flex justify-end xl:hidden">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setMobileListDrawerOpen(true)}
            aria-label="选择报价列表"
            title="选择报价列表"
          >
            <ListOrdered className="size-5" />
          </Button>
        </div>,
        headerSlotElement,
      ) : null}

      <div className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="hidden min-h-0 flex-col overflow-hidden xl:flex">
          <CardHeader>
            <CardTitle>报价列表</CardTitle>
            <CardDescription>新增后可在右侧录入该列表下的价格条目。</CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col">
            {renderPriceListControls('new-price-list-desktop')}
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Input
                value={priceSearch}
                onChange={(event) => setPriceSearch(event.target.value)}
                placeholder="搜索..."
                disabled={!selectedColumn}
                className="w-[180px]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={!dataTable}
                onClick={() => setFieldEditorOpen(true)}
                aria-label="表格字段设置"
                title="表格字段设置"
              >
                <Settings2 className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-hidden">
            {!selectedColumn ? (
              <div className="rounded border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                请选择一个报价列表。
              </div>
            ) : dataTableLoading || dataRecordsLoading || !dataTable ? (
              <div>加载中...</div>
            ) : (
              <DataRecordsGrid
                key={buildDataGridKey(selectedColumn.id, dataTable.fields, dataRecords)}
                records={dataRecords}
                fields={dataTable.fields}
                columnId={selectedColumn.id}
                onDeleteRecord={(record) => {
                  const primaryKey = dataTable.fields.find((field) => field.is_primary === 1)?.field_key
                  setDeleteTarget({ id: record.id, name: String(primaryKey ? record.fields[primaryKey] || '' : '') })
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Sheet open={mobileListDrawerOpen} onOpenChange={setMobileListDrawerOpen}>
        <SheetContent side="right" className="flex w-[90vw] max-w-sm flex-col gap-0 p-0 xl:hidden">
          <SheetHeader className="shrink-0 border-b px-5 py-4 pr-14 text-left">
            <SheetTitle>报价列表</SheetTitle>
            <SheetDescription>选择或管理报价列表。</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-5">
            {renderPriceListControls('new-price-list-mobile')}
          </div>
        </SheetContent>
      </Sheet>

      <DataTableFieldEditor
        open={fieldEditorOpen}
        fields={dataTable?.fields || []}
        onOpenChange={setFieldEditorOpen}
        onSave={(fields) => saveDataFieldsMutation.mutate(fields)}
        saving={saveDataFieldsMutation.isPending}
      />

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

type DynamicGridRow = {
  id?: number
  localId: string
  isDraft: boolean
  fields: Record<string, string>
  originalFields: Record<string, string>
}

function DataRecordsGrid({
  records,
  fields,
  columnId,
  onDeleteRecord,
}: {
  records: DataTableRecord[]
  fields: DataTableField[]
  columnId: number
  onDeleteRecord: (record: DataTableRecord) => void
}) {
  const [rows, setRows] = useState<DynamicGridRow[]>(() => buildDynamicRows(records, fields, columnId))
  const [savingRows, setSavingRows] = useState<Record<string, boolean>>({})
  const columns = useMemo(() => fields.map(dataFieldToViewColumn), [fields])

  const saveMutation = useMutation({
    mutationFn: async (row: DynamicGridRow) => {
      const payload = Object.fromEntries(fields.map((field) => [field.field_key, row.fields[field.field_key] ?? '']))
      return row.id
        ? dataTablesApi.updateRecord(columnId, row.id, payload)
        : dataTablesApi.createRecord(columnId, payload)
    },
    onMutate: (row) => setSavingRows((current) => ({ ...current, [row.localId]: true })),
    onSuccess: (response, row) => {
      const savedRecord = response.data
      if (!savedRecord) return
      const savedFields = Object.fromEntries(fields.map((field) => [
        field.field_key,
        stringifyCell(savedRecord.fields[field.field_key]),
      ]))
      setRows((current) => {
        const next = current.map((item) => item.localId === row.localId ? {
          id: savedRecord.id,
          localId: `record-${savedRecord.id}`,
          isDraft: false,
          fields: savedFields,
          originalFields: savedFields,
        } : item)
        const draftCount = next.filter((item) => item.isDraft).length
        return draftCount >= GRID_MIN_EMPTY_ROW_COUNT
          ? next
          : [...next, ...buildEmptyDynamicRows(fields, columnId, GRID_MIN_EMPTY_ROW_COUNT - draftCount)]
      })
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '保存记录失败')),
    onSettled: (_data, _error, row) => {
      if (!row) return
      setSavingRows((current) => {
        const next = { ...current }
        delete next[row.localId]
        return next
      })
    },
  })

  const updateCell = (localId: string, fieldKey: string, value: string) => {
    setRows((current) => current.map((row) => row.localId === localId
      ? { ...row, fields: { ...row.fields, [fieldKey]: value } }
      : row))
  }

  const commitRow = (localId: string) => {
    const row = rows.find((item) => item.localId === localId)
    if (!row || savingRows[localId] || !isDynamicGridRowChanged(row, fields)) return
    if (!hasAnyDynamicGridValue(row, fields)) {
      if (!row.isDraft) {
        toast.error('一行至少需要填写一个字段；如需移除该行，请删除记录')
      }
      return
    }
    saveMutation.mutate(row)
  }

  return (
    <div className="h-full overflow-hidden rounded border">
      <ConfigurableDataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.localId}
        showRowNumbers
        renderCell={(row, column) => (
          <Input
            type={column.field_type === 'number' || column.field_type === 'currency' ? 'number' : column.field_type === 'date' ? 'date' : 'text'}
            value={row.fields[column.field_name] || ''}
            disabled={Boolean(savingRows[row.localId])}
            onChange={(event) => updateCell(row.localId, column.field_name, event.target.value)}
            onBlur={(event) => {
              const nextTarget = event.relatedTarget
              const tableRow = event.currentTarget.closest('tr')
              if (nextTarget instanceof Node && tableRow?.contains(nextTarget)) return
              commitRow(row.localId)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            aria-label={column.label}
            className="h-10 rounded-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-wait"
          />
        )}
        renderActions={(row) => !row.isDraft && row.id ? (
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/configurable-row:opacity-100 group-focus-within/configurable-row:opacity-100" onClick={() => onDeleteRecord({ id: row.id!, fields: row.fields })} aria-label="删除记录">
            <Trash2 className="size-4 text-destructive" />
          </Button>
        ) : null}
      />
    </div>
  )
}

function buildDynamicRows(records: DataTableRecord[], fields: DataTableField[], columnId: number): DynamicGridRow[] {
  const persisted = records.map((record) => {
    const values = Object.fromEntries(fields.map((field) => [field.field_key, stringifyCell(record.fields[field.field_key])]))
    return {
      id: record.id,
      localId: `record-${record.id}`,
      isDraft: false,
      fields: values,
      originalFields: values,
    }
  })
  return [...persisted, ...buildEmptyDynamicRows(fields, columnId, GRID_MIN_EMPTY_ROW_COUNT)]
}

function buildEmptyDynamicRows(fields: DataTableField[], columnId: number, count: number): DynamicGridRow[] {
  return Array.from({ length: count }, () => ({
    localId: `draft-${columnId}-${crypto.randomUUID()}`,
    isDraft: true,
    fields: Object.fromEntries(fields.map((field) => [field.field_key, ''])),
    originalFields: Object.fromEntries(fields.map((field) => [field.field_key, ''])),
  }))
}

function buildDataGridKey(columnId: number, fields: DataTableField[], records: DataTableRecord[]) {
  const fieldVersion = fields.map((field) => `${field.field_key}:${field.field_type}:${field.sort_order}`).join('|')
  const recordVersion = records.map((record) => `${record.id}:${record.updated_at || ''}`).join('|')
  return `${columnId}::${fieldVersion}::${recordVersion}`
}

function dataFieldToViewColumn(field: DataTableField, index: number): ContentTableViewColumn {
  return {
    field_name: field.field_key,
    field_label: field.field_name,
    label: field.field_name,
    field_type: field.field_type,
    is_required: 0,
    is_editable: 1,
    is_searchable: 1,
    is_visible: 1,
    width: field.field_type === 'number' || field.field_type === 'currency' ? 120 : 160,
    align: field.field_type === 'number' || field.field_type === 'currency' ? 'right' : 'left',
    sort_order: index * 10,
  }
}

function hasAnyDynamicGridValue(row: DynamicGridRow, fields: DataTableField[]) {
  return fields.some((field) => row.fields[field.field_key]?.trim())
}

function isDynamicGridRowChanged(row: DynamicGridRow, fields: DataTableField[]) {
  return fields.some((field) => (
    (row.fields[field.field_key] || '') !== (row.originalFields[field.field_key] || '')
  ))
}

function stringifyCell(value: unknown) {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value)
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const responseMessage = (error as { response?: { data?: { message?: unknown } } }).response?.data?.message
  if (typeof responseMessage === 'string' && responseMessage) return responseMessage
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' && message ? message : fallback
}
