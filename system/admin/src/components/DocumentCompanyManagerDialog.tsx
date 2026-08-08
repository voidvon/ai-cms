import { useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { documentWorkspacesApi } from '@/api/document-workspaces'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AdminButton as Button } from '@/components/AdminButton'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import type { DocumentCompany } from '@/types'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  companies: DocumentCompany[]
}

type FormState = {
  id: number | null
  name: string
  contact: string
  phone: string
  email: string
  address: string
  notes: string
}

const EMPTY_FORM: FormState = {
  id: null,
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
}

export function DocumentCompanyManagerDialog({ open, onOpenChange, companies }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    if (!open) {
      setForm(EMPTY_FORM)
    }
  }, [open])

  const selectedCompany = useMemo(
    () => companies.find((item) => item.id === form.id) || null,
    [companies, form.id]
  )

  const createMutation = useMutation({
    mutationFn: async () => documentWorkspacesApi.createCompany({
      name: form.name,
      contact: form.contact,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-companies'] })
      setForm(EMPTY_FORM)
      toast.success('公司已新增')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '新增公司失败')
    },
  })

  const updateMutation = useMutation({
    mutationFn: async () => documentWorkspacesApi.updateCompany(Number(form.id), {
      name: form.name,
      contact: form.contact,
      phone: form.phone,
      email: form.email,
      address: form.address,
      notes: form.notes,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['document-companies'] })
      toast.success('公司已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '更新公司失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => documentWorkspacesApi.deleteCompany(id),
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({ queryKey: ['document-companies'] })
      if (form.id === id) {
        setForm(EMPTY_FORM)
      }
      toast.success('公司已删除')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '删除公司失败')
    },
  })

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('请输入公司名称')
      return
    }

    if (form.id) {
      await updateMutation.mutateAsync()
      return
    }
    await createMutation.mutateAsync()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>公司管理</DialogTitle>
          <DialogDescription>维护常用公司资料，创建报价单和销售合同时可直接选择填充。</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-6 md:grid-cols-[280px_minmax(0,1fr)]">
          <div className="min-w-0 overflow-hidden rounded-xl border">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div className="text-sm font-medium">已有公司</div>
              <Button type="button" variant="outline" size="sm" onClick={() => setForm(EMPTY_FORM)}>
                <Plus className="size-4" />
                新建
              </Button>
            </div>
            <ScrollArea className="h-[420px] overflow-x-hidden">
              <div className="space-y-2 p-3">
                {companies.map((company) => (
                  <button
                    key={company.id}
                    type="button"
                    onClick={() => setForm({
                      id: company.id,
                      name: company.name,
                      contact: company.contact || '',
                      phone: company.phone || '',
                      email: company.email || '',
                      address: company.address || '',
                      notes: company.notes || '',
                    })}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_16px] items-center gap-3 overflow-hidden rounded-lg border px-3 py-3 text-left transition hover:border-primary/40 ${
                      selectedCompany?.id === company.id ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{company.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {company.contact || company.phone || company.email || '暂无联系方式'}
                      </div>
                    </div>
                    <Pencil className="size-4 text-muted-foreground" />
                  </button>
                ))}
                {companies.length === 0 ? (
                  <div className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
                    还没有公司，先新建一个。
                  </div>
                ) : null}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-4 rounded-xl border p-4">
            <div className="grid gap-2">
              <Label htmlFor="company-name">公司名称</Label>
              <Input
                id="company-name"
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="例如：上海某某工业有限公司"
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="company-contact">联系人</Label>
                <Input
                  id="company-contact"
                  value={form.contact}
                  onChange={(event) => setForm((current) => ({ ...current, contact: event.target.value }))}
                  placeholder="请输入联系人"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-phone">联系电话</Label>
                <Input
                  id="company-phone"
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="请输入联系电话"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="company-email">邮箱</Label>
                <Input
                  id="company-email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="请输入邮箱"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="company-address">地址</Label>
                <Input
                  id="company-address"
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="请输入地址"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="company-notes">备注</Label>
              <Textarea
                id="company-notes"
                value={form.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                placeholder="可记录补充说明"
                rows={6}
              />
            </div>

            <DialogFooter className="justify-between sm:justify-between">
              <div>
                {form.id ? (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => deleteMutation.mutate(Number(form.id))}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="size-4" />
                    删除
                  </Button>
                ) : null}
              </div>
              <Button
                type="button"
                onClick={() => void submit()}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {form.id ? '保存修改' : '新增公司'}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
