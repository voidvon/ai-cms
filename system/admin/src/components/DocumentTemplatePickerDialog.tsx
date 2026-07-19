import { FileText, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import type { DocumentTemplate } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: DocumentTemplate[]
  isLoading?: boolean
  creatingTemplateId?: number | null
  onSelect: (template: DocumentTemplate) => void
}

const TYPE_LABELS: Record<DocumentTemplate['document_type'], string> = {
  quote: '报价单',
  contract: '销售合同',
}

export function DocumentTemplatePickerDialog({
  open,
  onOpenChange,
  templates,
  isLoading = false,
  creatingTemplateId = null,
  onSelect,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>选择文档模板</DialogTitle>
          <DialogDescription>选择一种模板创建文档，创建后可继续通过 AI 补充客户、产品、价格和条款。</DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
          {templates.map((template) => {
            const isCreating = creatingTemplateId === template.id
            return (
              <button
                key={template.id}
                type="button"
                onClick={() => onSelect(template)}
                disabled={creatingTemplateId != null}
                className="group flex w-full cursor-pointer items-start gap-4 rounded-lg border bg-background p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  {isCreating ? <Loader2 className="size-5 animate-spin" /> : <FileText className="size-5" />}
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-foreground">{template.name}</span>
                    <Badge variant="outline">{TYPE_LABELS[template.document_type]}</Badge>
                  </span>
                  <span className="block text-sm leading-6 text-muted-foreground">
                    {template.description || '使用此模板创建新的 AI 文档。'}
                  </span>
                </span>
                <span className="shrink-0 self-center text-sm font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  {isCreating ? '创建中' : '选择'}
                </span>
              </button>
            )
          })}

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed px-4 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              正在加载文档模板...
            </div>
          ) : null}

          {!isLoading && templates.length === 0 ? (
            <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              暂无可用文档模板。
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
