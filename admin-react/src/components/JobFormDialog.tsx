import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { jobsApi } from '@/api/jobs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Job } from '@/types'

interface JobFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job?: Job
  mode: 'create' | 'edit'
}

export default function JobFormDialog({ open, onOpenChange, job, mode }: JobFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    description: '',
    requirements: '',
    visible: 1,
    sort_order: 0,
  })

  useEffect(() => {
    if (job && mode === 'edit') {
      setFormData({
        title: job.title || '',
        location: job.location || '',
        description: job.description || '',
        requirements: job.requirements || '',
        visible: job.visible || 1,
        sort_order: job.sort_order || 0,
      })
    } else if (mode === 'create') {
      setFormData({
        title: '',
        location: '',
        description: '',
        requirements: '',
        visible: 1,
        sort_order: 0,
      })
    }
  }, [job, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return jobsApi.create(formData)
      } else {
        return jobsApi.update(job!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
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
      toast.error('请输入职位名称')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加职位' : '编辑职位'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写职位信息' : '修改职位信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">职位名称 *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="请输入职位名称"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">工作地点</Label>
            <Input
              id="location"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="请输入工作地点"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">职位描述</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="请输入职位描述"
              rows={5}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="requirements">任职要求</Label>
            <Textarea
              id="requirements"
              value={formData.requirements}
              onChange={(e) => setFormData({ ...formData, requirements: e.target.value })}
              placeholder="请输入任职要求"
              rows={5}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="visible">显示状态</Label>
              <Select
                value={formData.visible.toString()}
                onValueChange={(value) => setFormData({ ...formData, visible: parseInt(value) })}
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
