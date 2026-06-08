import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { customLabelsApi } from '@/api/custom-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { CustomLabel } from '@/types'

export default function CustomLabelsPage() {
  const queryClient = useQueryClient()
  const [editingLabel, setEditingLabel] = useState<CustomLabel | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({ name: '', content: '' })

  const { data: labelsData, isLoading } = useQuery({
    queryKey: ['custom-labels'],
    queryFn: () => customLabelsApi.list(),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (editingLabel) {
        return customLabelsApi.update(editingLabel.id, formData)
      }
      return customLabelsApi.create(formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-labels'] })
      toast.success('保存成功')
      setDialogOpen(false)
      setEditingLabel(null)
    },
    onError: () => {
      toast.error('保存失败')
    },
  })

  const handleEdit = (label: CustomLabel) => {
    setEditingLabel(label)
    setFormData({ name: label.name, content: label.content || '' })
    setDialogOpen(true)
  }

  const handleAdd = () => {
    setEditingLabel(null)
    setFormData({ name: '', content: '' })
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.name) {
      toast.error('请输入标签名称')
      return
    }
    updateMutation.mutate()
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  const labels = labelsData?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>自定义标签管理</CardTitle>
              <CardDescription>管理网站中的自定义文本标签和内容片段，共 {labels.length} 条</CardDescription>
            </div>
            <Button onClick={handleAdd}>添加标签</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {labels.map((label: any) => (
              <div key={label.id} className="border rounded p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{label.name}</h3>
                    {label.kind_name && (
                      <p className="text-sm text-muted-foreground">类型: {label.kind_name}</p>
                    )}
                    {label.content && (
                      <p className="text-sm mt-2 text-muted-foreground line-clamp-2">{label.content}</p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(label)}>
                    编辑
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingLabel ? '编辑标签' : '添加标签'}</DialogTitle>
            <DialogDescription>
              {editingLabel ? '修改标签内容' : '添加新的自定义标签'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">标签名称 *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入标签名称"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="content">标签内容</Label>
              <Textarea
                id="content"
                value={formData.content}
                onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                placeholder="请输入标签内容"
                rows={6}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? '保存中...' : '保存'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
