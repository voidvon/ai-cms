import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { columnsApi } from '@/api/columns'
import { contentModelsApi } from '@/api/advanced'
import { contentItemsApi } from '@/api/content-items'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
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

export default function PriceManagementPage() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const [newListName, setNewListName] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<PriceRecordItem | undefined>(undefined)
  const [deleteTarget, setDeleteTarget] = useState<PriceRecordItem | null>(null)
  const [listDialogOpen, setListDialogOpen] = useState(false)
  const [listDialogName, setListDialogName] = useState('')
  const [deleteListOpen, setDeleteListOpen] = useState(false)

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
    mutationFn: async () => {
      if (!selectedColumn) {
        throw new Error('当前没有可编辑的报价列表')
      }
      const name = String(listDialogName || '').trim()
      if (!name) {
        throw new Error('请输入报价列表名称')
      }
      return columnsApi.update(selectedColumn.id, {
        base: {
          name,
          parent_id: Number(selectedColumn.parent_id || 0),
          content_model_id: Number(selectedColumn.content_model_id || 0),
          dir_name: selectedColumn.dir_name || '',
          route_path: selectedColumn.route_path || '',
          detail_rule: selectedColumn.detail_rule || '{id}.html',
          sort_order: Number(selectedColumn.sort_order || 0),
          is_visible: Number(selectedColumn.is_visible ?? 1),
        },
      })
    },
    onSuccess: () => {
      toast.success('报价列表名称已更新')
      setListDialogOpen(false)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新失败')
    },
  })

  const deleteListMutation = useMutation({
    mutationFn: async () => {
      if (!selectedColumn) {
        throw new Error('当前没有可删除的报价列表')
      }
      return columnsApi.delete(selectedColumn.id)
    },
    onSuccess: () => {
      toast.success('报价列表已删除')
      setDeleteListOpen(false)
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['content-items', PRICE_MODEL_CODE] })
      const nextColumn = priceListColumns.find((column) => column.id !== selectedColumn?.id) || null
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

  const handleCreateItem = () => {
    setEditingItem(undefined)
    setFormOpen(true)
  }

  const handleEditItem = (item: PriceRecordItem) => {
    setEditingItem(item)
    setFormOpen(true)
  }

  const handleOpenRenameList = () => {
    setListDialogName(selectedColumn?.name || '')
    setListDialogOpen(true)
  }

  if (modelsLoading || columnsLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>价格管理</CardTitle>
              <CardDescription>左侧按报价列表切换，右侧管理该列表下的价格条目。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">{priceListColumns.length} 个报价列表</Badge>
              <Badge variant="outline">{items.length} 条价格记录</Badge>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle>报价列表</CardTitle>
            <CardDescription>新增后可在右侧录入该列表下的价格条目。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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

            <ScrollArea className="h-[60vh]">
              <div className="space-y-2 pr-3">
                {priceListColumns.length > 0 ? priceListColumns.map((column) => (
                  <button
                    key={column.id}
                    type="button"
                    onClick={() => handleSelectList(column)}
                    className={`w-full rounded-lg border px-3 py-3 text-left transition-colors ${
                      selectedColumn?.id === column.id ? 'border-primary bg-muted' : 'hover:bg-muted/60'
                    }`}
                  >
                    <div className="font-medium">{column.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {column.route_path || '-'}
                    </div>
                  </button>
                )) : (
                  <div className="rounded border border-dashed px-4 py-6 text-sm text-muted-foreground">
                    还没有报价列表。先在上方创建一个。
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{selectedColumn?.name || '请选择报价列表'}</CardTitle>
                <CardDescription>
                  {selectedColumn
                    ? `当前列表路径：${selectedColumn.route_path || '-'}`
                    : '左侧选择或创建报价列表后可录入价格条目。'}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleOpenRenameList} disabled={!selectedColumn}>
                  重命名列表
                </Button>
                <Button variant="destructiveGhost" onClick={() => setDeleteListOpen(true)} disabled={!selectedColumn}>
                  删除列表
                </Button>
                <Button onClick={handleCreateItem} disabled={!selectedColumn}>
                  新增价格条目
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!selectedColumn ? (
              <div className="rounded border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                请选择一个报价列表。
              </div>
            ) : itemsLoading ? (
              <div>加载中...</div>
            ) : items.length === 0 ? (
              <div className="rounded border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                当前报价列表还没有价格条目。
              </div>
            ) : (
              <div className="rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名称</TableHead>
                      <TableHead>型号</TableHead>
                      <TableHead>规格</TableHead>
                      <TableHead>口径</TableHead>
                      <TableHead>价格</TableHead>
                      <TableHead>物料代码</TableHead>
                      <TableHead>分类</TableHead>
                      <TableHead>库存</TableHead>
                      <TableHead>参考编号</TableHead>
                      <TableHead>英文名称</TableHead>
                      <TableHead>材质</TableHead>
                      <TableHead>更新时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.name || '-'}</TableCell>
                        <TableCell>{stringValue(item.model)}</TableCell>
                        <TableCell>{stringValue(item.spec)}</TableCell>
                        <TableCell>{stringValue(item.diameter)}</TableCell>
                        <TableCell>{formatNumber(item.price)}</TableCell>
                        <TableCell>{stringValue(item.material_code)}</TableCell>
                        <TableCell>{stringValue(item.category)}</TableCell>
                        <TableCell>{formatNumber(item.stock)}</TableCell>
                        <TableCell>{stringValue(item.reference_no)}</TableCell>
                        <TableCell>{stringValue(item.name_en)}</TableCell>
                        <TableCell>{stringValue(item.material)}</TableCell>
                        <TableCell>{formatDate(item.updated_at || item.created_at || '')}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleEditItem(item)}>
                              编辑
                            </Button>
                            <Button variant="destructiveGhost" size="sm" onClick={() => setDeleteTarget(item)}>
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <PriceRecordFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        item={editingItem}
        selectedColumnId={selectedColumn?.id}
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

      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
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
            <Button onClick={() => renameListMutation.mutate()} disabled={renameListMutation.isPending}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteListOpen} onOpenChange={setDeleteListOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除报价列表</AlertDialogTitle>
            <AlertDialogDescription>
              删除后会一并删除该报价列表下的全部价格条目，且不可恢复。确认删除“{selectedColumn?.name || '-'}”吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteListMutation.mutate()}>
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

function stringValue(value: unknown) {
  const text = String(value ?? '').trim()
  return text || '-'
}

function formatNumber(value: unknown) {
  if (value === undefined || value === null || value === '') {
    return '-'
  }
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? String(numberValue) : '-'
}

type PriceRecordFormDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: PriceRecordItem
  selectedColumnId?: number
}

function PriceRecordFormDialog({
  open,
  onOpenChange,
  item,
  selectedColumnId,
}: PriceRecordFormDialogProps) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(item?.id)
  const [form, setForm] = useState({
    name: '',
    model: '',
    spec: '',
    diameter: '',
    price: '',
    material_code: '',
    category: '',
    description: '',
    stock: '',
    reference_no: '',
    name_en: '',
    material: '',
  })

  useEffect(() => {
    if (!open) {
      return
    }
    setForm({
      name: item?.name ? String(item.name) : '',
      model: item?.model ? String(item.model) : '',
      spec: item?.spec ? String(item.spec) : '',
      diameter: item?.diameter ? String(item.diameter) : '',
      price: item?.price === null || item?.price === undefined ? '' : String(item.price),
      material_code: item?.material_code ? String(item.material_code) : '',
      category: item?.category ? String(item.category) : '',
      description: item?.description ? String(item.description) : '',
      stock: item?.stock === null || item?.stock === undefined ? '' : String(item.stock),
      reference_no: item?.reference_no ? String(item.reference_no) : '',
      name_en: item?.name_en ? String(item.name_en) : '',
      material: item?.material ? String(item.material) : '',
    })
  }, [item, open])

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedColumnId && !item?.column_id) {
        throw new Error('请先选择报价列表')
      }
      const payload = {
        base: {
          column_id: selectedColumnId || item?.column_id,
          name: form.name.trim(),
          model: form.model.trim(),
          spec: form.spec.trim(),
          diameter: form.diameter.trim(),
          price: form.price.trim(),
          material_code: form.material_code.trim(),
          category: form.category.trim(),
          description: form.description.trim(),
          stock: form.stock.trim(),
          reference_no: form.reference_no.trim(),
          name_en: form.name_en.trim(),
          material: form.material.trim(),
        },
      }
      if (!payload.base.name) {
        throw new Error('请输入名称')
      }
      if (isEdit && item?.id) {
        return contentItemsApi.update<PriceRecordItem>(PRICE_MODEL_CODE, item.id, payload)
      }
      return contentItemsApi.create<PriceRecordItem>(PRICE_MODEL_CODE, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-items', PRICE_MODEL_CODE] })
      toast.success(isEdit ? '价格条目已更新' : '价格条目已创建')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '保存失败')
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑价格条目' : '新增价格条目'}</DialogTitle>
          <DialogDescription>价格管理使用单语言基础字段，不包含翻译信息。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="名称 *" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <FormField label="型号" value={form.model} onChange={(value) => setForm({ ...form, model: value })} />
          <FormField label="规格" value={form.spec} onChange={(value) => setForm({ ...form, spec: value })} />
          <FormField label="口径" value={form.diameter} onChange={(value) => setForm({ ...form, diameter: value })} />
          <FormField label="价格" type="number" value={form.price} onChange={(value) => setForm({ ...form, price: value })} />
          <FormField label="物料代码" value={form.material_code} onChange={(value) => setForm({ ...form, material_code: value })} />
          <FormField label="分类" value={form.category} onChange={(value) => setForm({ ...form, category: value })} />
          <FormField label="库存" type="number" value={form.stock} onChange={(value) => setForm({ ...form, stock: value })} />
          <FormField label="参考编号" value={form.reference_no} onChange={(value) => setForm({ ...form, reference_no: value })} />
          <FormField label="英文名称" value={form.name_en} onChange={(value) => setForm({ ...form, name_en: value })} />
          <FormField label="材质" value={form.material} onChange={(value) => setForm({ ...form, material: value })} />
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="price-record-description">说明</Label>
            <Input
              id="price-record-description"
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="请输入说明"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number'
}) {
  const id = `field-${label}`
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={`请输入${label.replace(/\s*\*$/, '')}`}
      />
    </div>
  )
}
