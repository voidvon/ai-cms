import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/api/contacts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
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
import ContactFormDialog from '@/components/ContactFormDialog'
import { toast } from 'sonner'
import type { Contact } from '@/types'

export default function ContactsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | undefined>()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => contactsApi.list(),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => contactsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success('删除成功')
      setDeleteDialogOpen(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除失败')
    },
  })

  const handleAdd = () => {
    setEditingContact(undefined)
    setFormOpen(true)
  }

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact)
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

  const contacts = data?.data || []

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>联系方式管理</CardTitle>
              <CardDescription>管理不同办事处/分支机构的联系信息，共 {contacts.length} 条记录</CardDescription>
            </div>
            <Button onClick={handleAdd}>添加办事处</Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>办事处名称</TableHead>
                <TableHead>地址</TableHead>
                <TableHead>电话</TableHead>
                <TableHead>传真</TableHead>
                <TableHead>联系人</TableHead>
                <TableHead>邮箱</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : (
                contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>{contact.id}</TableCell>
                    <TableCell className="font-medium">{contact.office_name}</TableCell>
                    <TableCell>{contact.address || '-'}</TableCell>
                    <TableCell>{contact.phone || '-'}</TableCell>
                    <TableCell>{contact.fax || '-'}</TableCell>
                    <TableCell>{contact.contact_person || '-'}</TableCell>
                    <TableCell>{contact.email || '-'}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleEdit(contact)}>
                        编辑
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(contact.id)}>
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

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        contact={editingContact}
        mode={editingContact ? 'edit' : 'create'}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              此操作无法撤销。确定要删除这个联系方式吗？
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
