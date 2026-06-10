import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { productsApi } from '@/api/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImageUploadField from '@/components/ImageUploadField'
import RichTextEditor from '@/components/RichTextEditor'
import { toast } from 'sonner'
import type { Product } from '@/types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product
  mode: 'create' | 'edit'
  defaultCategoryId?: number
}

export default function ProductFormDialog({ open, onOpenChange, product, mode, defaultCategoryId = 1 }: ProductFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category_id: defaultCategoryId,
    summary: '',
    content_html: '',
    small_image: '',
    keywords: '',
    is_featured_home: 0,
    is_visible: 1,
    sort_order: 0,
  })

  useEffect(() => {
    if (product && mode === 'edit') {
      setFormData({
        name: product.name || '',
        code: product.code || '',
        category_id: product.category_id || 1,
        summary: product.summary || '',
        content_html: product.content_html || '',
        small_image: product.small_image || '',
        keywords: product.keywords || '',
        is_featured_home: product.is_featured_home || 0,
        is_visible: product.is_visible || 1,
        sort_order: product.sort_order || 0,
      })
    } else if (mode === 'create') {
      setFormData({
        name: '',
        code: '',
        category_id: defaultCategoryId,
        summary: '',
        content_html: '',
        small_image: '',
        keywords: '',
        is_featured_home: 0,
        is_visible: 1,
        sort_order: 0,
      })
    }
  }, [product, mode, defaultCategoryId])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return productsApi.create(formData)
      } else {
        return productsApi.update(product!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
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
      toast.error('请输入产品名称')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加产品' : '编辑产品'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写产品信息' : '修改产品信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">产品名称 *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="请输入产品名称"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">产品编号</Label>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value })}
              placeholder="请输入产品编号"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="category_id">分类ID</Label>
            <Input
              id="category_id"
              type="number"
              value={formData.category_id}
              onChange={(e) => setFormData({ ...formData, category_id: parseInt(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="summary">摘要</Label>
            <Textarea
              id="summary"
              value={formData.summary}
              onChange={(e) => setFormData({ ...formData, summary: e.target.value })}
              placeholder="请输入摘要"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content_html">详细内容</Label>
            <RichTextEditor
              value={formData.content_html}
              onChange={(content_html) => setFormData({ ...formData, content_html })}
              placeholder="请输入详细内容"
              uploadPurpose="richtext_image"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="small_image">封面图片</Label>
            <ImageUploadField
              id="small_image"
              value={formData.small_image}
              onChange={(small_image) => setFormData({ ...formData, small_image })}
              purpose="product_cover"
              placeholder="请输入封面图片路径"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="keywords">关键词</Label>
            <Input
              id="keywords"
              value={formData.keywords}
              onChange={(e) => setFormData({ ...formData, keywords: e.target.value })}
              placeholder="请输入关键词"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="is_visible">显示状态</Label>
              <Select
                value={formData.is_visible.toString()}
                onValueChange={(value) => setFormData({ ...formData, is_visible: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">显示</SelectItem>
                  <SelectItem value="0">隐藏</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="is_featured_home">推荐</Label>
              <Select
                value={formData.is_featured_home.toString()}
                onValueChange={(value) => setFormData({ ...formData, is_featured_home: parseInt(value) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">是</SelectItem>
                  <SelectItem value="0">否</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">排序</Label>
              <Input
                id="sort_order"
                type="number"
                value={formData.sort_order}
                onChange={(e) => setFormData({ ...formData, sort_order: parseInt(e.target.value) })}
              />
            </div>
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
