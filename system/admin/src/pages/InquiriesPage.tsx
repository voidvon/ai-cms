import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Loader2, RefreshCw, Search, Settings, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { inquiriesApi } from '@/api/inquiries'
import { AdminDataTable } from '@/components/AdminDataTable'
import { TableActionButton } from '@/components/TableActionButton'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ADMIN_CONFIG } from '@/config'
import { formatRelativeTime } from '@/lib/datetime'
import type { Inquiry, InquirySettings, InquiryStatus, InquiryType } from '@/types'

type DashboardHeaderContext = {
  titleSlotElement: HTMLDivElement | null
}

const INQUIRY_TYPE_LABELS: Record<InquiryType, string> = {
  product: '产品询价',
  technical: '技术咨询',
  service: '服务支持',
  other: '其他',
}

const INQUIRY_STATUS_LABELS: Record<InquiryStatus, string> = {
  new: '待处理',
  processing: '跟进中',
  quoted: '已报价',
  closed: '已完成',
  invalid: '无效',
}

export default function InquiriesPage() {
  const { titleSlotElement } = useOutletContext<DashboardHeaderContext>()
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [keywordInput, setKeywordInput] = useState('')
  const [statusInput, setStatusInput] = useState<InquiryStatus | 'all'>('all')
  const [typeInput, setTypeInput] = useState<InquiryType | 'all'>('all')
  const [filters, setFilters] = useState({
    keyword: '',
    status: 'all' as InquiryStatus | 'all',
    inquiryType: 'all' as InquiryType | 'all',
  })
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Inquiry | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const listQuery = useQuery({
    queryKey: ['inquiries', page, filters.keyword, filters.status, filters.inquiryType],
    queryFn: () => inquiriesApi.list({
      page,
      limit: ADMIN_CONFIG.pagination.pageSize,
      keyword: filters.keyword || undefined,
      status: filters.status,
      inquiry_type: filters.inquiryType,
    }),
  })

  const detailQuery = useQuery({
    queryKey: ['inquiry', selectedId],
    queryFn: () => inquiriesApi.get(selectedId!),
    enabled: selectedId !== null,
  })

  const selectedInquiry = detailQuery.data?.data || null

  const updateMutation = useMutation({
    mutationFn: ({ id, status, internalNote }: { id: number; status: InquiryStatus; internalNote: string }) => inquiriesApi.update(id, {
      status,
      internal_note: internalNote,
    }),
    onSuccess: async (response, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      queryClient.setQueryData(['inquiry', variables.id], response)
      toast.success('询价已更新')
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '更新失败'))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => inquiriesApi.delete(id),
    onSuccess: async (_, deletedId) => {
      if (selectedId === deletedId) setSelectedId(null)
      setDeleteTarget(null)
      await queryClient.invalidateQueries({ queryKey: ['inquiries'] })
      toast.success('询价已删除')
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '删除失败'))
    },
  })

  const result = listQuery.data?.data
  const items = result?.items || []
  const pagination = result?.pagination

  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setFilters({
      keyword: keywordInput.trim(),
      status: statusInput,
      inquiryType: typeInput,
    })
  }

  return (
    <>
    {titleSlotElement ? createPortal(
      <div className="flex items-center">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="overflow-hidden rounded-[var(--radius)]!"
          aria-label="询价通知设置"
          title="询价通知设置"
          onClick={() => setSettingsOpen(true)}
        >
          <Settings />
        </Button>
      </div>,
      titleSlotElement,
    ) : null}
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <AdminDataTable
        fill
        toolbar={(
          <form className="flex items-center gap-2" onSubmit={applyFilters}>
            <Input
              className="w-[260px]"
              value={keywordInput}
              onChange={(event) => setKeywordInput(event.target.value)}
              placeholder="搜索编号、联系人、公司或需求"
              aria-label="搜索询价"
            />
            <Select value={typeInput} onValueChange={(value) => setTypeInput(value as InquiryType | 'all')}>
              <SelectTrigger className="w-[140px]" aria-label="询价类型">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {Object.entries(INQUIRY_TYPE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusInput} onValueChange={(value) => setStatusInput(value as InquiryStatus | 'all')}>
              <SelectTrigger className="w-[140px]" aria-label="处理状态">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部状态</SelectItem>
                {Object.entries(INQUIRY_STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" size="icon" aria-label="搜索" title="搜索">
              <Search />
            </Button>
            <Button type="button" variant="outline" size="icon" aria-label="刷新" title="刷新" onClick={() => void listQuery.refetch()}>
              <RefreshCw className={listQuery.isFetching ? 'animate-spin' : ''} />
            </Button>
          </form>
        )}
        columns={(
          <>
            <TableHead className="w-[180px]">编号</TableHead>
            <TableHead className="w-[120px]">类型</TableHead>
            <TableHead className="w-[140px]">姓名</TableHead>
            <TableHead>公司</TableHead>
            <TableHead>联系方式</TableHead>
            <TableHead>具体需求</TableHead>
            <TableHead className="w-[100px]">状态</TableHead>
            <TableHead className="w-[130px]">提交时间</TableHead>
            <TableHead className="w-[96px] text-right">操作</TableHead>
          </>
        )}
        columnCount={9}
        isLoading={listQuery.isLoading}
        isEmpty={items.length === 0}
        error={listQuery.error ? `加载失败：${(listQuery.error as Error).message}` : null}
        emptyMessage="暂无询价"
        pagination={pagination ? {
          page: pagination.page,
          totalPages: pagination.totalPages,
          total: pagination.total,
          pageSize: pagination.limit,
          onPageChange: setPage,
        } : null}
      >
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="whitespace-nowrap font-mono text-xs">{item.reference_no}</TableCell>
            <TableCell>{INQUIRY_TYPE_LABELS[item.inquiry_type]}</TableCell>
            <TableCell className="font-medium">{item.contact_name}</TableCell>
            <TableCell>{item.company || '-'}</TableCell>
            <TableCell>
              <div className="max-w-[240px] truncate">{item.email || item.phone || '-'}</div>
            </TableCell>
            <TableCell>
              <div className="max-w-[360px] truncate" title={item.requirements}>{item.requirements}</div>
            </TableCell>
            <TableCell><InquiryStatusBadge status={item.status} /></TableCell>
            <TableCell className="whitespace-nowrap">{formatRelativeTime(item.created_at)}</TableCell>
            <TableCell>
              <div className="flex justify-end gap-1">
                <TableActionButton tooltip="查看" aria-label="查看询价" variant="outline" size="icon-sm" onClick={() => setSelectedId(item.id)}>
                  <Eye />
                </TableActionButton>
                <TableActionButton tooltip="删除" aria-label="删除询价" variant="destructive" size="icon-sm" onClick={() => setDeleteTarget(item)}>
                  <Trash2 />
                </TableActionButton>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </AdminDataTable>

      <InquiryDetailDialog
        key={selectedInquiry?.id || 'loading'}
        inquiry={selectedInquiry}
        loading={detailQuery.isLoading}
        open={selectedId !== null}
        onOpenChange={(open) => { if (!open) setSelectedId(null) }}
        onSave={(status, note) => {
          if (selectedId !== null) updateMutation.mutate({ id: selectedId, status, internalNote: note })
        }}
        saving={updateMutation.isPending}
        onDelete={() => { if (selectedInquiry) setDeleteTarget(selectedInquiry) }}
      />

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent className="rounded-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>删除询价</AlertDialogTitle>
            <AlertDialogDescription>
              确认删除 {deleteTarget?.reference_no || '这条询价'}？删除后无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id) }}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <InquirySettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
    </>
  )
}

function InquiryDetailDialog({
  inquiry,
  loading,
  open,
  onOpenChange,
  onSave,
  saving,
  onDelete,
}: {
  inquiry: Inquiry | null
  loading: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (status: InquiryStatus, internalNote: string) => void
  saving: boolean
  onDelete: () => void
}) {
  const [status, setStatus] = useState<InquiryStatus>(inquiry?.status || 'new')
  const [internalNote, setInternalNote] = useState(inquiry?.internal_note || '')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto rounded-lg sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>询价详情</DialogTitle>
          <DialogDescription>{inquiry?.reference_no || '正在加载...'}</DialogDescription>
        </DialogHeader>
        {loading || !inquiry ? (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              <DetailField label="询价类型" value={INQUIRY_TYPE_LABELS[inquiry.inquiry_type]} />
              <DetailField label="姓名" value={inquiry.contact_name} />
              <DetailField label="公司名称" value={inquiry.company || '-'} />
              <DetailField label="邮箱" value={inquiry.email || '-'} href={inquiry.email ? `mailto:${inquiry.email}` : undefined} />
              <DetailField label="电话" value={inquiry.phone || '-'} href={inquiry.phone ? `tel:${inquiry.phone}` : undefined} />
              <DetailField label="提交时间" value={formatRelativeTime(inquiry.created_at)} />
              <DetailField label="飞书通知" value={getNotificationStatusLabel(inquiry.notification_status)} />
            </div>
            <div className="space-y-1.5">
              <div className="text-xs text-muted-foreground">具体需求</div>
              <div className="whitespace-pre-wrap rounded-md border bg-muted/30 p-3 leading-6">{inquiry.requirements}</div>
            </div>
            <div className="grid gap-4 border-t pt-4 sm:grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="inquiry-status">处理状态</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as InquiryStatus)}>
                  <SelectTrigger id="inquiry-status"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INQUIRY_STATUS_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="inquiry-note">内部备注</Label>
                <Textarea
                  id="inquiry-note"
                  value={internalNote}
                  onChange={(event) => setInternalNote(event.target.value)}
                  maxLength={5000}
                  rows={4}
                />
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="destructive" onClick={onDelete} disabled={!inquiry || saving}>删除</Button>
          <Button type="button" onClick={() => onSave(status, internalNote)} disabled={!inquiry || saving}>
            {saving ? <Loader2 className="animate-spin" /> : null}
            {saving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DetailField({ label, value, href }: { label: string; value: string; href?: string }) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      {href ? <a className="break-all text-primary hover:underline" href={href}>{value}</a> : <div className="break-words">{value}</div>}
    </div>
  )
}

function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  const variant = status === 'invalid'
    ? 'destructive'
    : status === 'new'
      ? 'default'
      : status === 'closed'
        ? 'outline'
        : 'secondary'
  return <Badge variant={variant}>{INQUIRY_STATUS_LABELS[status]}</Badge>
}

function InquirySettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const settingsQuery = useQuery({
    queryKey: ['inquiry-settings'],
    queryFn: inquiriesApi.getSettings,
    enabled: open,
  })
  const settings = settingsQuery.data?.data || null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-lg sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>询价通知设置</DialogTitle>
          <DialogDescription>飞书机器人通知</DialogDescription>
        </DialogHeader>
        {settingsQuery.error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {getApiErrorMessage(settingsQuery.error, '设置加载失败')}
          </div>
        ) : settingsQuery.isLoading || !settings ? (
          <div className="flex h-32 items-center justify-center text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : (
          <InquirySettingsForm key={settings.updated_at || 'settings'} settings={settings} onSaved={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function InquirySettingsForm({ settings, onSaved }: { settings: InquirySettings; onSaved: () => void }) {
  const queryClient = useQueryClient()
  const [webhookUrl, setWebhookUrl] = useState(settings.feishu_webhook_url)
  const [enabled, setEnabled] = useState(settings.feishu_enabled === 1)
  const [showWebhook, setShowWebhook] = useState(false)

  const saveMutation = useMutation({
    mutationFn: () => inquiriesApi.updateSettings({
      feishu_webhook_url: webhookUrl.trim(),
      feishu_enabled: enabled,
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['inquiry-settings'] })
      toast.success('询价通知设置已保存')
      onSaved()
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '保存失败')),
  })

  const testMutation = useMutation({
    mutationFn: () => inquiriesApi.testFeishuWebhook(webhookUrl.trim()),
    onSuccess: () => toast.success('测试消息已发送'),
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '测试消息发送失败')),
  })

  return (
    <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); saveMutation.mutate() }}>
      <div className="flex items-center justify-between rounded-md border px-3 py-2.5">
        <Label htmlFor="feishu-notification-enabled">飞书通知</Label>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{enabled ? '已启用' : '已禁用'}</span>
          <Switch id="feishu-notification-enabled" checked={enabled} onCheckedChange={setEnabled} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="feishu-webhook-url">Webhook 地址</Label>
        <div className="flex gap-2">
          <Input
            id="feishu-webhook-url"
            type={showWebhook ? 'text' : 'password'}
            value={webhookUrl}
            onChange={(event) => setWebhookUrl(event.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={showWebhook ? '隐藏 Webhook 地址' : '显示 Webhook 地址'}
            title={showWebhook ? '隐藏 Webhook 地址' : '显示 Webhook 地址'}
            onClick={() => setShowWebhook((value) => !value)}
          >
            {showWebhook ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          disabled={!webhookUrl.trim() || testMutation.isPending || saveMutation.isPending}
          onClick={() => testMutation.mutate()}
        >
          {testMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          发送测试消息
        </Button>
        <Button type="submit" disabled={saveMutation.isPending || testMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="animate-spin" /> : null}
          保存
        </Button>
      </DialogFooter>
    </form>
  )
}

function getNotificationStatusLabel(status: Inquiry['notification_status']) {
  return {
    pending: '等待发送',
    sent: '已发送',
    failed: '发送失败',
    disabled: '未启用',
  }[status] || '-'
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const response = 'response' in error && error.response && typeof error.response === 'object'
    ? error.response
    : null
  const data = response && 'data' in response && response.data && typeof response.data === 'object'
    ? response.data
    : null
  if (data && 'message' in data && typeof data.message === 'string') return data.message
  if ('message' in error && typeof error.message === 'string') return error.message
  return fallback
}
