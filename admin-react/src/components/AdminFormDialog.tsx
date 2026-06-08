import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Admin } from '@/types'

interface AdminFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  admin?: Admin
  mode: 'create' | 'edit' | 'password'
}

export default function AdminFormDialog({ open, onOpenChange, admin, mode }: AdminFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    confirmPassword: '',
  })

  useEffect(() => {
    if (admin && (mode === 'edit' || mode === 'password')) {
      setFormData({
        username: admin.username || '',
        password: '',
        confirmPassword: '',
      })
    } else if (mode === 'create') {
      setFormData({
        username: '',
        password: '',
        confirmPassword: '',
      })
    }
  }, [admin, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('两次输入的密码不一致')
        }
        return adminApi.create({ username: formData.username, password: formData.password })
      } else if (mode === 'password') {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('两次输入的密码不一致')
        }
        return adminApi.updatePassword(admin!.id, { password: formData.password })
      } else {
        return adminApi.update(admin!.id, { username: formData.username })
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success(mode === 'create' ? '创建成功' : mode === 'password' ? '密码修改成功' : '更新成功')
      onOpenChange(false)
      setFormData({ username: '', password: '', confirmPassword: '' })
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (mode !== 'password' && !formData.username) {
      toast.error('请输入用户名')
      return
    }
    if ((mode === 'create' || mode === 'password') && !formData.password) {
      toast.error('请输入密码')
      return
    }
    mutation.mutate()
  }

  const getTitle = () => {
    if (mode === 'create') return '添加管理员'
    if (mode === 'password') return '修改密码'
    return '编辑管理员'
  }

  const getDescription = () => {
    if (mode === 'create') return '创建新的管理员账号'
    if (mode === 'password') return '修改管理员密码'
    return '修改管理员信息'
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{getTitle()}</DialogTitle>
          <DialogDescription>{getDescription()}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode !== 'password' && (
            <div className="space-y-2">
              <Label htmlFor="username">用户名 *</Label>
              <Input
                id="username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                placeholder="请输入用户名"
              />
            </div>
          )}
          {(mode === 'create' || mode === 'password') && (
            <>
              <div className="space-y-2">
                <Label htmlFor="password">密码 *</Label>
                <Input
                  id="password"
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="请输入密码"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">确认密码 *</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="请再次输入密码"
                />
              </div>
            </>
          )}
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
