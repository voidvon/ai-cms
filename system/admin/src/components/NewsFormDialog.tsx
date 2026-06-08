import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { newsApi } from '@/api/news'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { News } from '@/types'

interface NewsFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  news?: News
  mode: 'create' | 'edit'
}

export default function NewsFormDialog({ open, onOpenChange, news, mode }: NewsFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    title: '',
    category_id: 1,
    summary: '',
    content: '',
    photo: '',
    featured: 0,
    sort_order: 0,
  })

  useEffect(() => {
    if (news && mode === 'edit') {
      setFormData({
        title: news.title || '',
        category_id: news.category_id || 1,
        summary: news.summary || '',
        content: news.content || '',
        photo: news.photo || '',
        featured: news.featured || 0,
        sort_order: news.sort_order || 0,
      })
    } else if (mode === 'create') {
      setFormData({
        title: '',
        category_id: 1,
        summary: '',
        content: '',
        photo: '',
        featured: 0,
        sort_order: 0,
      })
    }
  }, [news, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return newsApi.create(formData)
      } else {
        return newsApi.update(news!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title) {
      toast.error('请输入标题')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加新闻' : '编辑新闻'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写新闻信息' : '修改新闻信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">标题 *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="请输入标题"
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
            <Label htmlFor="content">详细内容</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="请输入详细内容"
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="photo">图片路径</Label>
            <Input
              id="photo"
              value={formData.photo}
              onChange={(e) => setFormData({ ...formData, photo: e.target.value })}
              placeholder="请输入图片路径"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="featured">推荐</Label>
              <Select
                value={formData.featured.toString()}
                onValueChange={(value) => setFormData({ ...formData, featured: parseInt(value) })}
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
