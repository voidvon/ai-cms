import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { metaTypesApi } from '@/api/custom-labels'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'

export default function MetaTypesPage() {
  const queryClient = useQueryClient()
  const [editingMeta, setEditingMeta] = useState<any>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [formData, setFormData] = useState({ title: '', meta_keywords: '', meta_descriptions: '' })

  const { data: metaData, isLoading } = useQuery({
    queryKey: ['meta-types'],
    queryFn: () => metaTypesApi.list(),
  })

  const updateMutation = useMutation({
    mutationFn: async () => {
      return metaTypesApi.update(editingMeta.id, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meta-types'] })
      toast.success('保存成功')
      setDialogOpen(false)
      setEditingMeta(null)
    },
    onError: () => {
      toast.error('保存失败')
    },
  })

  const handleEdit = (meta: any) => {
    setEditingMeta(meta)
    setFormData({
      title: meta.title || '',
      meta_keywords: meta.meta_keywords || '',
      meta_descriptions: meta.meta_descriptions || ''
    })
    setDialogOpen(true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    updateMutation.mutate()
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  const metaTypes = metaData?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>SEO元数据类型管理</CardTitle>
          <CardDescription>管理不同页面类型的SEO元数据，共 {metaTypes.length} 条</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {metaTypes.map((meta: any) => (
              <div key={meta.id} className="border rounded p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">ID: {meta.id}</h3>
                    {meta.title && <p className="text-sm mt-1">标题: {meta.title}</p>}
                    {meta.meta_keywords && (
                      <p className="text-sm text-muted-foreground mt-1">关键词: {meta.meta_keywords}</p>
                    )}
                    {meta.meta_descriptions && (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        描述: {meta.meta_descriptions}
                      </p>
                    )}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => handleEdit(meta)}>
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
            <DialogTitle>编辑元数据</DialogTitle>
            <DialogDescription>修改SEO元数据信息</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">页面标题</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="请输入页面标题"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta_keywords">Meta关键词</Label>
              <Input
                id="meta_keywords"
                value={formData.meta_keywords}
                onChange={(e) => setFormData({ ...formData, meta_keywords: e.target.value })}
                placeholder="关键词1, 关键词2, 关键词3"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta_descriptions">Meta描述</Label>
              <Textarea
                id="meta_descriptions"
                value={formData.meta_descriptions}
                onChange={(e) => setFormData({ ...formData, meta_descriptions: e.target.value })}
                placeholder="请输入页面描述"
                rows={4}
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
