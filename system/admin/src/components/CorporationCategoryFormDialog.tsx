import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { corporationCategoriesApi, templateVariantsApi, templatesApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { CorporationCategory, TemplateBinding } from '@/types'

const DEFAULT_TEMPLATE_VALUE = '__default__'

interface CorporationCategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CorporationCategory
  currentParentId?: number
  mode: 'create' | 'edit'
}

export default function CorporationCategoryFormDialog({
  open,
  onOpenChange,
  category,
  currentParentId = 0,
  mode
}: CorporationCategoryFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    parent_id: 0,
    sort_order: 0,
  })
  const [contentTemplateId, setContentTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  const { data: categoriesData } = useQuery({
    queryKey: ['corporation-categories'],
    queryFn: () => corporationCategoriesApi.list(),
  })

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
    enabled: open && Boolean(selectedThemeId) && mode === 'edit' && Boolean(category?.id),
  })

  useEffect(() => {
    if (category && mode === 'edit') {
      setFormData({
        name: category.name || '',
        parent_id: category.parent_id || 0,
        sort_order: category.sort_order || 0,
      })
      const contentBinding = (bindingsData?.data || []).find((item) => item.target_type === 'column' && item.target_id === category.id && item.template_type === 'content')
      setContentTemplateId(contentBinding?.template_id ? String(contentBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
    } else if (mode === 'create') {
      setFormData({
        name: '',
        parent_id: currentParentId,
        sort_order: 0,
      })
      setContentTemplateId(DEFAULT_TEMPLATE_VALUE)
    }
  }, [category, currentParentId, mode, bindingsData])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        const response = await corporationCategoriesApi.create(formData)
        const categoryId = response.data?.id
        if (!categoryId) {
          throw new Error('分类创建失败')
        }
        await saveTemplateBinding(selectedThemeId, categoryId, contentTemplateId, [])
        return response
      } else {
        const response = await corporationCategoriesApi.update(category!.id, formData)
        await saveTemplateBinding(selectedThemeId, category!.id, contentTemplateId, bindingsData?.data || [])
        return response
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporation-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('请输入分类名称')
      return
    }
    mutation.mutate()
  }

  const categoryOptions = categoriesData?.data || []
  const contentTemplates = (templatesData?.data || []).filter((item) => item.type === 'content')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加公司分类' : '编辑公司分类'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写公司信息分类' : '修改公司信息分类'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">分类名称 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="请输入分类名称"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="parent_id">父分类</Label>
            <Select
              value={formData.parent_id.toString()}
              onValueChange={(value) => setFormData({ ...formData, parent_id: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">顶级分类</SelectItem>
                {categoryOptions.map((cat: CorporationCategory) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="sort_order">排序</Label>
            <Input
              id="sort_order"
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>内容模板</Label>
            <Select value={contentTemplateId} onValueChange={setContentTemplateId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
                {contentTemplates.map((template) => (
                  <SelectItem key={template.id} value={String(template.id)}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

async function saveTemplateBinding(
  themeId: number | undefined,
  targetId: number,
  templateId: string,
  bindings: TemplateBinding[]
) {
  if (!themeId) {
    return
  }
  const existing = bindings.find((item) => item.target_type === 'column' && item.target_id === targetId && item.template_type === 'content')
  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    if (existing?.id) {
      await templatesApi.deleteBinding(existing.id)
    }
    return
  }
  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: 'column',
    target_id: targetId,
    template_type: 'content',
    template_id: Number(templateId),
  })
}
