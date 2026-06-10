import { useState, useEffect } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { productCategoriesApi } from '@/api/product-categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { ProductCategory } from '@/types'

interface ProductCategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: ProductCategory
  currentParentId?: number
  mode: 'create' | 'edit'
}

export default function ProductCategoryFormDialog({
  open,
  onOpenChange,
  category,
  currentParentId = 0,
  mode
}: ProductCategoryFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    parent_id: currentParentId,
    sort_order: 0,
    seo_keywords: '',
    seo_description: '',
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['product-categories-options'],
    queryFn: () => productCategoriesApi.listOptions(),
  })

  useEffect(() => {
    if (category && mode === 'edit') {
      setFormData({
        name: category.name || '',
        parent_id: category.parent_id || 0,
        sort_order: category.sort_order || 0,
        seo_keywords: category.seo_keywords || '',
        seo_description: category.seo_description || '',
      })
    } else if (mode === 'create') {
      setFormData({
        name: '',
        parent_id: currentParentId,
        sort_order: 0,
        seo_keywords: '',
        seo_description: '',
      })
    }
  }, [category, mode, currentParentId])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return productCategoriesApi.create(formData)
      } else {
        return productCategoriesApi.update(category!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
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
  const isEditingWithoutCategory = mode === 'edit' && !category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加产品分类' : '编辑产品分类'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写产品分类信息' : '修改产品分类信息'}
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
                {categoryOptions.map((cat: any) => (
                  <SelectItem key={cat.id} value={cat.id.toString()}>
                    {'　'.repeat(cat.depth || 0)}{cat.name}
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
            <Label htmlFor="seo_keywords">SEO关键词</Label>
            <Input
              id="seo_keywords"
              value={formData.seo_keywords}
              onChange={(e) => setFormData({ ...formData, seo_keywords: e.target.value })}
              placeholder="请输入SEO关键词"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="seo_description">SEO描述</Label>
            <Textarea
              id="seo_description"
              value={formData.seo_description}
              onChange={(e) => setFormData({ ...formData, seo_description: e.target.value })}
              placeholder="请输入SEO描述"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending || isEditingWithoutCategory}>
              {mutation.isPending ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
