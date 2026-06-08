import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/api/contacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import type { Contact } from '@/types'

interface ContactFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  contact?: Contact
  mode: 'create' | 'edit'
}

export default function ContactFormDialog({ open, onOpenChange, contact, mode }: ContactFormDialogProps) {
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState({
    office_name: '',
    address: '',
    phone: '',
    fax: '',
    contact_person: '',
    email: '',
    postal_code: '',
  })

  useEffect(() => {
    if (contact && mode === 'edit') {
      setFormData({
        office_name: contact.office_name || '',
        address: contact.address || '',
        phone: contact.phone || '',
        fax: contact.fax || '',
        contact_person: contact.contact_person || '',
        email: contact.email || '',
        postal_code: contact.postal_code || '',
      })
    } else if (mode === 'create') {
      setFormData({
        office_name: '',
        address: '',
        phone: '',
        fax: '',
        contact_person: '',
        email: '',
        postal_code: '',
      })
    }
  }, [contact, mode])

  const mutation = useMutation({
    mutationFn: async () => {
      if (mode === 'create') {
        return contactsApi.create(formData)
      } else {
        return contactsApi.update(contact!.id, formData)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.office_name) {
      toast.error('请输入办事处名称')
      return
    }
    mutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加办事处' : '编辑办事处'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写办事处联系信息' : '修改办事处联系信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="office_name">办事处名称 *</Label>
            <Input
              id="office_name"
              value={formData.office_name}
              onChange={(e) => setFormData({ ...formData, office_name: e.target.value })}
              placeholder="请输入办事处名称"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="address">地址</Label>
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="请输入地址"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="postal_code">邮政编码</Label>
            <Input
              id="postal_code"
              value={formData.postal_code}
              onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
              placeholder="请输入邮政编码"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">电话</Label>
            <Input
              id="phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="请输入电话"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fax">传真</Label>
            <Input
              id="fax"
              value={formData.fax}
              onChange={(e) => setFormData({ ...formData, fax: e.target.value })}
              placeholder="请输入传真"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact_person">联系人</Label>
            <Input
              id="contact_person"
              value={formData.contact_person}
              onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
              placeholder="请输入联系人"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="请输入邮箱"
            />
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
