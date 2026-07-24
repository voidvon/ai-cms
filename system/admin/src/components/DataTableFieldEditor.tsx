import { useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TableActionButton } from '@/components/TableActionButton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { DataTableField } from '@/types'

const FIELD_TYPES = [
  ['text', '文本'],
  ['textarea', '长文本'],
  ['number', '数字'],
  ['currency', '金额'],
  ['date', '日期'],
  ['datetime', '日期时间'],
  ['boolean', '复选框'],
  ['select', '单选'],
  ['multi_select', '多选'],
  ['url', '链接'],
] as const

export function DataTableFieldEditor({
  open,
  fields,
  onOpenChange,
  onSave,
  saving = false,
}: {
  open: boolean
  fields: DataTableField[]
  onOpenChange: (open: boolean) => void
  onSave: (fields: DataTableField[]) => void
  saving?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {open ? <DataTableFieldEditorContent fields={fields} onSave={onSave} saving={saving} onClose={() => onOpenChange(false)} /> : null}
    </Dialog>
  )
}

function DataTableFieldEditorContent({
  fields,
  onSave,
  saving,
  onClose,
}: {
  fields: DataTableField[]
  onSave: (fields: DataTableField[]) => void
  saving: boolean
  onClose: () => void
}) {
  const [draft, setDraft] = useState<DataTableField[]>(fields)

  const update = (fieldKey: string, patch: Partial<DataTableField>) => {
    setDraft((current) => current.map((field) => field.field_key === fieldKey ? { ...field, ...patch } : field))
  }

  const updateOptions = (field: DataTableField, value: string) => {
    update(field.field_key, {
      settings: {
        ...(field.settings || {}),
        options: value.split(/[，,]/).map((option) => option.trim()).filter(Boolean),
      },
    })
  }

  const addField = () => {
    const index = draft.length + 1
    setDraft((current) => [...current, {
      id: -Date.now(),
      field_key: `draft-${crypto.randomUUID()}`,
      field_name: `新字段 ${index}`,
      field_type: 'text',
      sort_order: current.length * 10,
    }])
  }

  const removeField = (field: DataTableField) => {
    if (draft.length <= 1) return
    setDraft((current) => current.filter((item) => item.field_key !== field.field_key))
  }

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.length) return
    setDraft((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  return (
    <DialogContent className="flex h-[min(760px,90vh)] max-w-5xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14 text-left">
          <DialogTitle>字段设置</DialogTitle>
          <DialogDescription>字段属于当前表格，可自由新增；记录只需任意一个字段有值即可保存。</DialogDescription>
        </DialogHeader>
        <div className="flex shrink-0 items-center justify-between border-b px-6 py-3">
          <span className="text-sm text-muted-foreground">共 {draft.length} 个字段</span>
          <Button type="button" size="sm" onClick={addField}><Plus className="size-4" />新增字段</Button>
        </div>
        <Table containerClassName="min-h-0 flex-1" className="min-w-[740px] table-fixed">
          <TableHeader>
            <TableRow className="sticky top-0 z-10 bg-muted/95 hover:bg-muted/95">
              <TableHead className="w-12 px-3 text-center">#</TableHead>
              <TableHead className="w-[24%] px-3">字段名</TableHead>
              <TableHead className="w-40 px-3">类型</TableHead>
              <TableHead className="px-3">单选/多选选项</TableHead>
              <TableHead className="w-36 px-3 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {draft.map((field, index) => (
              <TableRow key={field.field_key}>
                <TableCell className="px-3 py-2 text-center text-xs text-muted-foreground">{index + 1}</TableCell>
                <TableCell className="px-3 py-2">
                  <Input
                    className="h-8"
                    value={field.field_name}
                    onChange={(event) => update(field.field_key, { field_name: event.target.value })}
                    aria-label={`第 ${index + 1} 行字段名`}
                  />
                </TableCell>
                <TableCell className="px-3 py-2">
                  <Select value={field.field_type} onValueChange={(value) => update(field.field_key, { field_type: value })}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>{FIELD_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="px-3 py-2">
                  {field.field_type === 'select' || field.field_type === 'multi_select' ? (
                    <Input
                      className="h-8"
                      value={getFieldOptions(field).join('，')}
                      onChange={(event) => updateOptions(field, event.target.value)}
                      placeholder="使用逗号分隔选项"
                      aria-label={`${field.field_name}选项`}
                    />
                  ) : <span className="text-muted-foreground">-</span>}
                </TableCell>
                <TableCell className="px-3 py-2">
                  <div className="flex justify-end">
                    <TableActionButton disabled={index === 0} onClick={() => moveField(index, -1)} aria-label="上移字段" tooltip="上移字段"><ArrowUp /></TableActionButton>
                    <TableActionButton disabled={index === draft.length - 1} onClick={() => moveField(index, 1)} aria-label="下移字段" tooltip="下移字段"><ArrowDown /></TableActionButton>
                    <TableActionButton variant="destructive" disabled={draft.length <= 1} onClick={() => removeField(field)} aria-label="删除字段" tooltip="删除字段"><Trash2 /></TableActionButton>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" onClick={() => onSave(draft)} disabled={saving}>保存字段</Button>
        </DialogFooter>
      </DialogContent>
  )
}

function getFieldOptions(field: DataTableField) {
  const options = field.settings?.options
  return Array.isArray(options) ? options.map(String).filter(Boolean) : []
}
