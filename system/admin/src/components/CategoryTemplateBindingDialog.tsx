import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Template, TemplateBinding } from '@/types'

const DEFAULT_VALUE = '__default__'

interface CategoryTemplateBindingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  targetType: TemplateBinding['target_type']
  targetId?: number
  targetName?: string
  templateTypes: TemplateBinding['template_type'][]
}

export default function CategoryTemplateBindingDialog({
  open,
  onOpenChange,
  targetType,
  targetId,
  targetName,
  templateTypes,
}: CategoryTemplateBindingDialogProps) {
  const queryClient = useQueryClient()
  const [selectedTemplates, setSelectedTemplates] = useState<Record<string, string>>({})
  const { data: selectedThemeData } = useQuery({
    queryKey: ['selected-theme'],
    queryFn: () => templateVariantsApi.getSelected(),
    enabled: open,
  })
  const selectedThemeId = selectedThemeData?.data?.id

  const { data: templatesData } = useQuery({
    queryKey: ['templates', selectedThemeId ?? 0],
    queryFn: () => templatesApi.list(undefined, selectedThemeId),
    enabled: open && Boolean(selectedThemeId),
  })

  const { data: bindingsData } = useQuery({
    queryKey: ['template-bindings', selectedThemeId ?? 0],
    queryFn: () => templatesApi.listBindings(selectedThemeId),
    enabled: open && Boolean(selectedThemeId),
  })

  const templates = templatesData?.data || []
  const bindings = bindingsData?.data || []
  const targetBindings = useMemo(() => {
    return bindings.filter((binding) => (
      binding.target_type === targetType &&
      binding.target_id === targetId
    ))
  }, [bindings, targetId, targetType])

  useEffect(() => {
    if (!open) {
      return
    }
    const nextValues: Record<string, string> = {}
    for (const type of templateTypes) {
      const binding = targetBindings.find((item) => item.template_type === type)
      nextValues[type] = binding?.template_id ? String(binding.template_id) : DEFAULT_VALUE
    }
    setSelectedTemplates(nextValues)
  }, [open, targetBindings, templateTypes])

  const saveMutation = useMutation({
    mutationFn: async () => {
      for (const type of templateTypes) {
        const selected = selectedTemplates[type] || DEFAULT_VALUE
        const existing = targetBindings.find((item) => item.template_type === type)
        if (selected === DEFAULT_VALUE) {
          if (existing?.id) {
            await templatesApi.deleteBinding(existing.id)
          }
          continue
        }
        await templatesApi.saveBinding({
          theme_id: selectedThemeId,
          target_type: targetType,
          target_id: targetId ?? null,
          template_type: type,
          template_id: Number(selected),
        })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template-bindings', selectedThemeId ?? 0] })
      toast.success('模板绑定已保存')
      onOpenChange(false)
    },
    onError: () => toast.error('模板绑定保存失败'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>模板绑定</DialogTitle>
          <DialogDescription>{targetName ? `为「${targetName}」选择生成模板` : '为当前分类选择生成模板'}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {templateTypes.map((type) => (
            <div key={type} className="space-y-2">
              <Label>{formatTemplateType(type)}</Label>
              <Select
                value={selectedTemplates[type] || DEFAULT_VALUE}
                onValueChange={(value) => setSelectedTemplates({ ...selectedTemplates, [type]: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_VALUE}>不单独绑定</SelectItem>
                  {templates
                    .filter((template: Template) => template.type === type)
                    .map((template: Template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function formatTemplateType(type: TemplateBinding['template_type']) {
  if (type === 'list') return '列表模板'
  if (type === 'content') return '内容模板'
  return '首页模板'
}
