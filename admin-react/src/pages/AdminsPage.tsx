import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import AdminFormDialog from '@/components/AdminFormDialog'
import { toast } from 'sonner'
import type { Admin } from '@/types'

export default function AdminsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingAdmin, setEditingAdmin] = useState<Admin | undefined>()
  const [formMode, setFormMode] = useState<'create' | 'edit' | 'password'>('create')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['admins'],
    queryFn: () => adminApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admins'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleAdd = () => {
    setEditingAdmin(undefined)
    setFormMode('create')
    setFormOpen(true)
  }

  const handleEdit = (admin: Admin) => {
    setEditingAdmin(admin)
    setFormMode('edit')
    setFormOpen(true)
  }

  const handleChangePassword = (admin: Admin) => {
    setEditingAdmin(admin)
    setFormMode('password')
    setFormOpen(true)
  }

  const handleDelete = (id: number) => {
    setDeletingId(id)
    setDeleteDialogOpen(true)
  }

  const confirmDelete = () => {
    if (deletingId) {
      deleteMutation.mutate(deletingId)
    }
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const admins = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>管理员</CardTitle>
              <CardDescription>共 {admins.length} 条记录</CardDescription>
            </div>
            <Button onClick={handleAdd}>添加管理员</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead>上次登录</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                admins.map((admin) => (
                  <TableRow key={admin.id}>
                    <TableCell>{admin.id}</TableCell>
                    <TableCell className="font-medium">{admin.username}</TableCell>
                    <TableCell>
                      {admin.last_login_at
                        ? new Date(admin.last_login_at).toLocaleString('zh-CN')
                        : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(admin)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleChangePassword(admin)}>
                        修改密码
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(admin.id)}>
                        删除
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AdminFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        admin={editingAdmin}
        mode={formMode}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这个管理员吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>确定</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
