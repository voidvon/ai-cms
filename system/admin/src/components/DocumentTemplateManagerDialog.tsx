import { useMemo, useState } from 'react'
import { FileText, Pencil, Settings2 } from 'lucide-react'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { DocumentTemplate } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  documentType: DocumentTemplate['document_type']
  templates: DocumentTemplate[]
  onConfigureCompanySlots: (template: DocumentTemplate) => void
}

type EditorProps = {
  documentType: DocumentTemplate['document_type']
  template: DocumentTemplate
  onConfigureCompanySlots: (template: DocumentTemplate) => void
}

type FormState = {
  name: string
  description: string
  sortOrder: string
}

const TYPE_LABELS: Record<DocumentTemplate['document_type'], string> = {
  quote: '报价单',
  contract: '合同',
}

export function DocumentTemplateManagerDialog({
  open,
  onOpenChange,
  documentType,
  templates,
  onConfigureCompanySlots,
}: Props) {
  const typeTemplates = useMemo(
    () => templates.filter((item) => item.document_type === documentType),
    [documentType, templates]
  )
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const selectedTemplate = typeTemplates.find((item) => item.id === selectedTemplateId) || typeTemplates[0] || null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{TYPE_LABELS[documentType]}模板管理</DialogTitle>
          <DialogDescription>维护模板名称、说明、顺序及公司填充位置。模板结构与样式仍由数据库模板系统统一管理。</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border">
            <div className="border-b px-4 py-3 text-sm font-medium">已有模板</div>
            <ScrollArea className="h-[420px] overflow-x-hidden">
              <div className="space-y-2 p-3">
                {typeTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(template.id)}
                    className={`grid w-full cursor-pointer grid-cols-[36px_minmax(0,1fr)_16px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      selectedTemplate?.id === template.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <span className="flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{template.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">{template.template_code || template.key}</span>
                    </span>
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                ))}

                {typeTemplates.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    暂无{TYPE_LABELS[documentType]}模板。
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          {selectedTemplate ? (
            <DocumentTemplateEditor
              key={selectedTemplate.id}
              documentType={documentType}
              template={selectedTemplate}
              onConfigureCompanySlots={onConfigureCompanySlots}
            />
          ) : (
            <div className="flex h-[420px] items-center justify-center rounded-xl border text-sm text-muted-foreground">
              暂无可管理的模板。
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DocumentTemplateEditor({ documentType, template, onConfigureCompanySlots }: EditorProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => toFormState(template))

  const updateMutation = useMutation({
    mutationFn: async () => documentWorkspacesApi.updateTemplate(template.id, {
      name: form.name.trim(),
      description: form.description.trim(),
      sort_order: Number.parseInt(form.sortOrder, 10) || 0,
    }),
    onSuccess: async (response) => {
      if (response.data) {
        setForm(toFormState(response.data))
      }
      await queryClient.invalidateQueries({ queryKey: ['document-templates'] })
      toast.success(`${TYPE_LABELS[documentType]}模板已更新`)
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, '更新文档模板失败'))
    },
  })

  const canSave = Boolean(form.name.trim()) && !updateMutation.isPending

  return (
    <div className="space-y-5 rounded-xl border p-5">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <div className="font-medium">模板信息</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">{template.template_code || template.key}</div>
        </div>
        <Badge variant="outline">{template.template_status === 'published' ? '已发布' : '草稿'}</Badge>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${documentType}-${template.id}-template-name`}>模板名称</Label>
        <Input
          id={`${documentType}-${template.id}-template-name`}
          value={form.name}
          onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${documentType}-${template.id}-template-description`}>模板说明</Label>
        <Textarea
          id={`${documentType}-${template.id}-template-description`}
          value={form.description}
          onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
          placeholder="说明此模板适用的业务场景"
          className="min-h-28 resize-none"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${documentType}-${template.id}-template-sort`}>显示顺序</Label>
        <Input
          id={`${documentType}-${template.id}-template-sort`}
          type="number"
          value={form.sortOrder}
          onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))}
          className="max-w-40"
        />
      </div>

      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium">公司填充位置</div>
            <div className="mt-1 text-xs text-muted-foreground">设置模板中我方公司、客户等选择位置。</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => onConfigureCompanySlots(template)}>
            <Settings2 className="size-4" />
            配置位置
          </Button>
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button type="button" onClick={() => updateMutation.mutate()} disabled={!canSave}>
          {updateMutation.isPending ? '保存中...' : '保存模板'}
        </Button>
      </div>
    </div>
  )
}

function toFormState(template: DocumentTemplate): FormState {
  return {
    name: String(template.name || ''),
    description: String(template.description || ''),
    sortOrder: String(template.sort_order ?? 0),
  }
}

function getErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }
  const source = error as {
    message?: string
    response?: { data?: { message?: string } }
  }
  return source.response?.data?.message || source.message || fallback
}
