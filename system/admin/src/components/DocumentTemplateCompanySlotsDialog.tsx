import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { documentWorkspacesApi } from '@/api/document-workspaces'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { DocumentCompanySlot, DocumentTemplate } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: DocumentTemplate | null
}

type SlotForm = DocumentCompanySlot & {
  id: string
}

export function DocumentTemplateCompanySlotsDialog({ open, onOpenChange, template }: Props) {
  const queryClient = useQueryClient()
  const [slots, setSlots] = useState<SlotForm[]>([])

  const templateName = String(template?.name || '').trim() || '文档模板'

  useEffect(() => {
    if (!open) {
      return
    }
    setSlots(readTemplateCompanySlots(template).map((slot, index) => ({
      ...slot,
      id: `${slot.key}-${index}`,
    })))
  }, [open, template])

  const canSave = useMemo(() => {
    return slots.every((slot) => slot.key.trim() && slot.label.trim() && slot.role.trim())
  }, [slots])

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!template?.id) {
        throw new Error('文档模板不存在')
      }
      return documentWorkspacesApi.updateTemplate(template.id, {
        default_payload: {
          ...(template.default_payload || {}),
          meta: {
            ...(((template.default_payload || {}).meta as Record<string, unknown> | undefined) || {}),
            companySlots: slots.map(({ id, ...slot }) => slot),
          },
        },
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      toast.success('公司槽位已保存')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '保存公司槽位失败')
    },
  })

  const addSlot = () => {
    setSlots((current) => [
      ...current,
      {
        id: `slot-${Date.now()}`,
        key: `company-${current.length + 1}`,
        role: current.length === 0 ? 'seller' : 'customer',
        label: `公司 ${current.length + 1}`,
      },
    ])
  }

  const updateSlot = (id: string, patch: Partial<SlotForm>) => {
    setSlots((current) => current.map((slot) => (
      slot.id === id ? { ...slot, ...patch } : slot
    )))
  }

  const removeSlot = (id: string) => {
    setSlots((current) => current.filter((slot) => slot.id !== id))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{templateName} · 公司位置</DialogTitle>
          <DialogDescription>配置当前文档模板需要显示几个公司选择位置，以及每个位置对应的标签和角色。</DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="text-sm font-medium">公司槽位</div>
            <Button type="button" variant="outline" size="sm" onClick={addSlot}>
              <Plus className="size-4" />
              新增位置
            </Button>
          </div>
          <ScrollArea className="h-[420px]">
            <div className="space-y-4 p-4">
              {slots.map((slot, index) => (
                <div key={slot.id} className="rounded-xl border p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Pencil className="size-4 text-muted-foreground" />
                      公司位置 {index + 1}
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={() => removeSlot(slot.id)}>
                      <Trash2 className="size-4" />
                      删除
                    </Button>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="grid gap-2">
                      <Label>标识</Label>
                      <Input
                        value={slot.key}
                        onChange={(event) => updateSlot(slot.id, { key: event.target.value })}
                        placeholder="例如：seller"
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>角色</Label>
                      <Select value={slot.role} onValueChange={(value) => updateSlot(slot.id, { role: value })}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择角色" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="seller">seller</SelectItem>
                          <SelectItem value="customer">customer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>标签</Label>
                      <Input
                        value={slot.label}
                        onChange={(event) => updateSlot(slot.id, { label: event.target.value })}
                        placeholder="例如：我方公司"
                      />
                    </div>
                  </div>
                </div>
              ))}
              {slots.length === 0 ? (
                <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                  当前模板还没有公司位置，新增后右侧 AI 区域才会显示对应公司选择器。
                </div>
              ) : null}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => updateMutation.mutate()} disabled={!canSave || updateMutation.isPending}>
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function readTemplateCompanySlots(template: DocumentTemplate | null): DocumentCompanySlot[] {
  const meta = template?.default_payload?.meta
  const source = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {}
  const rawSlots = Array.isArray(source.companySlots) ? source.companySlots : []

  return rawSlots
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null
      }
      const entry = item as Record<string, unknown>
      const key = String(entry.key || `company-${index + 1}`).trim()
      const role = String(entry.role || '').trim() || (index === 0 ? 'seller' : 'customer')
      const label = String(entry.label || '').trim() || `公司 ${index + 1}`
      if (!key) {
        return null
      }
      return { key, role, label }
    })
    .filter(Boolean) as DocumentCompanySlot[]
}
