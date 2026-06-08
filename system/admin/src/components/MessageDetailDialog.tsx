import { useMutation, useQueryClient } from '@tanstack/react-query'
import { messagesApi } from '@/api/messages'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Message } from '@/types'

interface MessageDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  message?: Message
}

export default function MessageDetailDialog({ open, onOpenChange, message }: MessageDetailDialogProps) {
  const queryClient = useQueryClient()

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!message) return
      return messagesApi.update(message.id, { status: 1 })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] })
      toast.success('已标记为已处理')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleMarkAsProcessed = () => {
    updateMutation.mutate()
  }

  if (!message) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>留言详情</DialogTitle>
          <DialogDescription>
            查看留言详细信息
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>状态</Label>
            <div>
              {message.status === 1 ? (
                <Badge>已处理</Badge>
              ) : (
                <Badge variant="secondary">未处理</Badge>
              )}
            </div>
          </div>
          <div className="space-y-2">
            <Label>姓名</Label>
            <div>{message.name || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>公司</Label>
            <div>{message.company || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>电话</Label>
            <div>{message.phone || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>邮箱</Label>
            <div>{message.email || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>留言内容</Label>
            <div className="whitespace-pre-wrap">{message.message || '-'}</div>
          </div>
          <div className="space-y-2">
            <Label>创建时间</Label>
            <div>{new Date(message.created_at).toLocaleString('zh-CN')}</div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          {message.status === 0 && (
            <Button onClick={handleMarkAsProcessed} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? '处理中...' : '标记为已处理'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
