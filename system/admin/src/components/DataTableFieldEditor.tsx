import { useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

  const addField = () => {
    const index = draft.length + 1
    setDraft((current) => [...current, {
      id: -Date.now(),
      field_key: `fld_new_${Date.now()}`,
      field_name: `新字段 ${index}`,
      field_type: 'text',
      is_primary: 0,
      sort_order: current.length * 10,
    }])
  }

  const removeField = (field: DataTableField) => {
    if (field.is_primary === 1) return
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
    <DialogContent className="flex h-[min(760px,90vh)] max-w-3xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14 text-left">
          <DialogTitle>字段设置</DialogTitle>
          <DialogDescription>字段属于当前表格，可自由新增；记录只需任意一个字段有值即可保存。</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 px-6 py-4">
          <div className="space-y-2">
            {draft.map((field, index) => (
              <div key={field.field_key} className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">字段名</Label>
                      <Input value={field.field_name} onChange={(event) => update(field.field_key, { field_name: event.target.value })} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">类型</Label>
                      <Select value={field.field_type} onValueChange={(value) => update(field.field_key, { field_type: value })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>{FIELD_TYPES.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground">{field.is_primary === 1 ? '主字段' : field.field_key}</span>
                </div>
                <div className="flex justify-end">
                  <Button type="button" variant="ghost" size="icon" disabled={field.is_primary === 1} onClick={() => removeField(field)} aria-label="删除字段"><Trash2 className="size-4 text-destructive" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveField(index, -1)} aria-label="上移字段"><ArrowUp className="size-4" /></Button>
                  <Button type="button" variant="ghost" size="icon" disabled={index === draft.length - 1} onClick={() => moveField(index, 1)} aria-label="下移字段"><ArrowDown className="size-4" /></Button>
                </div>
              </div>
            ))}
          </div>
          <Button type="button" variant="outline" className="mt-4" onClick={addField}><Plus className="size-4" />新增字段</Button>
        </ScrollArea>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" onClick={() => onSave(draft)} disabled={saving}>保存字段</Button>
        </DialogFooter>
      </DialogContent>
  )
}
