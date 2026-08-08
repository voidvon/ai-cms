import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, GripVertical } from 'lucide-react'
import { AdminButton as Button } from '@/components/AdminButton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { ContentTableViewColumn } from '@/types'

type EditableColumn = ContentTableViewColumn

export function TableColumnEditor({
  open,
  columns,
  onOpenChange,
  onSave,
  onReset,
  saving = false,
}: {
  open: boolean
  columns: EditableColumn[]
  onOpenChange: (open: boolean) => void
  onSave: (columns: EditableColumn[]) => void
  onReset: () => void
  saving?: boolean
}) {
  const [draft, setDraft] = useState<EditableColumn[]>(columns)

  useEffect(() => {
    if (open) {
      setDraft(columns)
    }
  }, [columns, open])

  const moveColumn = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= draft.length) {
      return
    }
    setDraft((current) => {
      const next = [...current]
      const [item] = next.splice(index, 1)
      next.splice(target, 0, item)
      return next
    })
  }

  const updateColumn = (fieldName: string, patch: Partial<EditableColumn>) => {
    setDraft((current) => current.map((column) => (
      column.field_name === fieldName ? { ...column, ...patch } : column
    )))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[min(760px,90vh)] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14 text-left">
          <DialogTitle>表格列设置</DialogTitle>
          <DialogDescription>配置当前栏目的显示列、顺序、标题和宽度。</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0 flex-1 px-6 py-4">
          <div className="space-y-2">
            {draft.map((column, index) => {
              const required = column.is_required === 1 && column.is_editable === 1
              return (
                <div key={column.field_name} className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_110px_100px_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-2">
                    <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">
                        {column.field_label}
                        {required ? <span className="ml-1 text-destructive">*</span> : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">{column.field_name} · {column.field_type}</div>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">标题</Label>
                    <Input
                      value={column.label_override || ''}
                      placeholder={column.field_label}
                      onChange={(event) => updateColumn(column.field_name, { label_override: event.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">宽度</Label>
                    <Input
                      type="number"
                      min={72}
                      max={480}
                      value={column.width}
                      onChange={(event) => updateColumn(column.field_name, { width: Number(event.target.value) || 140 })}
                    />
                  </div>
                  <div className="flex items-end justify-between gap-2 md:justify-end">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={column.is_visible === 1}
                        disabled={required}
                        onCheckedChange={(checked) => updateColumn(column.field_name, { is_visible: checked ? 1 : 0 })}
                        aria-label={`${column.label}显示`}
                      />
                      <span className="text-sm">显示</span>
                    </div>
                    <Select value={column.align} onValueChange={(value) => updateColumn(column.field_name, { align: value })}>
                      <SelectTrigger className="w-[82px]" aria-label={`${column.label}对齐方式`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="left">左对齐</SelectItem>
                        <SelectItem value="center">居中</SelectItem>
                        <SelectItem value="right">右对齐</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex">
                      <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => moveColumn(index, -1)} aria-label="上移">
                        <ArrowUp className="size-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="icon" disabled={index === draft.length - 1} onClick={() => moveColumn(index, 1)} aria-label="下移">
                        <ArrowDown className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </ScrollArea>
        <DialogFooter className="shrink-0 border-t px-6 py-4">
          <Button type="button" variant="outline" onClick={onReset} disabled={saving}>恢复默认</Button>
          <Button type="button" onClick={() => onSave(draft)} disabled={saving}>保存配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
