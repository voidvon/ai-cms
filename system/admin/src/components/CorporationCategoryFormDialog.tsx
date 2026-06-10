import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { corporationCategoriesApi } from '@/api/advanced'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { CorporationCategory } from '@/types'

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
    is_external: 0,
    external_url: '',
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['corporation-categories'],
    queryFn: () => corporationCategoriesApi.list(),
  })

  useEffect(() => {
    if (category && mode === 'edit') {
      setFormData({
        name: category.name || '',
        parent_id: category.parent_id || 0,
        sort_order: category.sort_order || 0,
        is_external: category.is_external || 0,
        external_url: category.external_url || '',
      })
    } else if (mode === 'create') {
      setFormData({
        name: '',
        parent_id: currentParentId,
        sort_order: 0,
        is_external: 0,
        external_url: '',
      })
    }
  }, [category, currentParentId, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return corporationCategoriesApi.create(formData)
      } else {
        return corporationCategoriesApi.update(category!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['corporation-categories'] })
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
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
            <Label htmlFor="is_external">链接类型</Label>
            <Select
              value={formData.is_external.toString()}
              onValueChange={(value) => setFormData({ ...formData, is_external: parseInt(value) })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">内部页面</SelectItem>
                <SelectItem value="1">外部链接</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {formData.is_external === 1 && (
            <div className="space-y-2">
              <Label htmlFor="external_url">外部链接地址</Label>
              <Input
                id="external_url"
                value={formData.external_url}
                onChange={(e) => setFormData({ ...formData, external_url: e.target.value })}
                placeholder="https://"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sort_order">排序</Label>
            <Input
              id="sort_order"
              type="number"
              value={formData.sort_order}
              onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })}
            />
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
