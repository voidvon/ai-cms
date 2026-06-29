import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Settings2, Trash2 } from 'lucide-react'
import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { AdminGroup } from '@/types'

interface GroupFormState {
  id?: number
  code: string
  name: string
  permissionFlags: string[]
  isSystem: boolean
}

const EMPTY_FORM: GroupFormState = {
  code: '',
  name: '',
  permissionFlags: [],
  isSystem: false,
}

export default function AdminGroupsDialog() {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<GroupFormState>(EMPTY_FORM)
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null)

  const { data: groupsResponse } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: () => adminApi.listGroups(),
  })

  const { data: permissionsResponse } = useQuery({
    queryKey: ['admin-permissions'],
    queryFn: () => adminApi.listPermissions(),
  })

  const groups = groupsResponse?.data || []
  const permissions = permissionsResponse?.data || []

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedId) || null,
    [groups, selectedId]
  )

  useEffect(() => {
    if (!open) {
      return
    }

    if (selectedId === 'new') {
      return
    }

    if (!selectedId && groups.length > 0) {
      hydrateForm(groups[0], setSelectedId, setForm)
      return
    }

    if (selectedId && !selectedGroup && groups.length > 0) {
      hydrateForm(groups[0], setSelectedId, setForm)
    }
  }, [groups, open, selectedGroup, selectedId])

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.code.trim()) {
        throw new Error('请输入用户组标识')
      }
      if (!form.name.trim()) {
        throw new Error('请输入用户组名称')
      }

      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        permission_flags: form.permissionFlags,
      }

      if (selectedId === 'new' || !form.id) {
        return adminApi.createGroup(payload)
      }

      return adminApi.updateGroup(form.id, payload)
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['admins'] })
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] })

      const saved = response.data
      if (saved) {
        hydrateForm(saved, setSelectedId, setForm)
      }
      toast.success(selectedId === 'new' ? '用户组已创建' : '用户组已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '用户组保存失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteGroup(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-groups'] })
      await queryClient.invalidateQueries({ queryKey: ['admins'] })
      await queryClient.invalidateQueries({ queryKey: ['currentUser'] })
      toast.success('用户组已删除')
      setSelectedId(null)
      setForm(EMPTY_FORM)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '用户组删除失败')
    },
  })

  const handleCreate = () => {
    setSelectedId('new')
    setForm(EMPTY_FORM)
  }

  const handleSelect = (group: AdminGroup) => {
    hydrateForm(group, setSelectedId, setForm)
  }

  const togglePermission = (flag: string, checked: boolean) => {
    setForm((current) => {
      const nextFlags = checked
        ? Array.from(new Set([...current.permissionFlags, flag])).sort()
        : current.permissionFlags.filter((item) => item !== flag)

      return {
        ...current,
        permissionFlags: nextFlags,
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Settings2 className="mr-2 h-4 w-4" />
          用户组
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[86vh] max-w-[980px] gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>用户组管理</DialogTitle>
          <DialogDescription>管理后台账号组、成员归属和后台权限。</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-[620px] grid-cols-[300px_minmax(0,1fr)]">
          <div className="border-r bg-muted/20">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <div>
                <div className="text-sm font-semibold">用户组</div>
                <div className="text-xs text-muted-foreground">管理后台账号组与权限</div>
              </div>
              <Button size="sm" onClick={handleCreate}>
                <Plus className="mr-1 h-4 w-4" />
                新增
              </Button>
            </div>
            <div className="max-h-[calc(86vh-146px)] space-y-2 overflow-y-auto p-3">
              {groups.length === 0 ? (
                <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  暂无用户组
                </div>
              ) : (
                groups.map((group) => {
                  const active = group.id === selectedId
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => handleSelect(group)}
                      className={[
                        'w-full rounded-lg border px-3 py-3 text-left transition-colors',
                        active ? 'border-primary bg-primary/5' : 'bg-background hover:bg-accent/40'
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{group.name}</div>
                        {group.is_system ? <Badge variant="secondary">系统</Badge> : null}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{group.code}</div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{group.member_count || 0} 个管理员</span>
                        <span>{parsePermissionFlags(group.permission_flags).length} 项权限</span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="border-b px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold">
                    {selectedId === 'new' ? '新增用户组' : selectedGroup ? `编辑 ${selectedGroup.name}` : '编辑用户组'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    修改用户组名称、标识和后台权限。
                  </div>
                </div>
                {form.id && !form.isSystem ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteMutation.mutate(form.id!)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    删除
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="group-name">用户组名称</Label>
                  <Input
                    id="group-name"
                    value={form.name}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="例如：内容编辑"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="group-code">用户组标识</Label>
                  <Input
                    id="group-code"
                    value={form.code}
                    onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
                    placeholder="例如：content_editor"
                  />
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="text-sm font-medium">权限设置</div>
                  <div className="text-xs text-muted-foreground">
                    当前已选择 {form.permissionFlags.length} 项权限
                  </div>
                </div>
                <div className="space-y-2 rounded-lg border p-3">
                  {permissions.map((permission) => {
                    const checked = form.permissionFlags.includes(permission.flag)
                    return (
                      <div
                        key={permission.flag}
                        className="flex items-start justify-between gap-3 rounded-md border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{permission.label}</div>
                          <div className="text-xs text-muted-foreground">{permission.description}</div>
                        </div>
                        <Switch
                          checked={checked}
                          onCheckedChange={(value) => togglePermission(permission.flag, value)}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between border-t px-5 py-3">
              <div className="text-xs text-muted-foreground">
                {form.isSystem ? '系统默认用户组不可删除。' : '删除用户组前需要先移走组内管理员。'}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  关闭
                </Button>
                <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                  <Save className="mr-2 h-4 w-4" />
                  {saveMutation.isPending ? '保存中...' : '保存用户组'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function hydrateForm(
  group: AdminGroup,
  setSelectedId: (value: number) => void,
  setForm: (value: GroupFormState) => void
) {
  setSelectedId(group.id)
  setForm({
    id: group.id,
    code: group.code || '',
    name: group.name || '',
    permissionFlags: parsePermissionFlags(group.permission_flags),
    isSystem: group.is_system === 1,
  })
}

function parsePermissionFlags(value?: string) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}
