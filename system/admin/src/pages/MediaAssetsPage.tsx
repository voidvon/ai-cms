import { useRef, useState } from 'react'
import { Copy, Eye, FileUp, Link as LinkIcon, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import ImagePreview from '@/components/ImagePreview'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/datetime'
import { resolveMediaAssetUrl } from '@/lib/assets'
import { toast } from 'sonner'
import type { MediaAsset } from '@/types'

const LIMIT = 50

const MEDIA_PURPOSE_META = {
  product_cover: { label: '产品封面' },
  news_cover: { label: '新闻封面' },
  richtext_image: { label: '富文本图片' },
  column_image: { label: '栏目图片' },
  attachment: { label: '附件' },
} as const

const PURPOSE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  ...Object.entries(MEDIA_PURPOSE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
]

const USAGE_OPTIONS = [
  { value: 'all', label: '全部使用位置' },
  { value: 'active', label: '有使用位置' },
  { value: 'orphaned', label: '无使用位置' },
]

export default function MediaAssetsPage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [page, setPage] = useState(1)
  const [purpose, setPurpose] = useState('all')
  const [usage, setUsage] = useState('all')
  const [latestUploadedAsset, setLatestUploadedAsset] = useState<MediaAsset | null>(null)
  const [usageAsset, setUsageAsset] = useState<MediaAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['media-assets', page, LIMIT, purpose, usage],
    queryFn: () => mediaApi.list({ page, limit: LIMIT, purpose, usage }),
  })

  const cleanupMutation = useMutation({
    mutationFn: () => mediaApi.cleanupOrphaned(purpose),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      const deletedRows = response.data?.deletedRows || 0
      const deletedFiles = response.data?.deletedFiles || 0
      toast.success(`已清理 ${deletedRows} 条未使用资源，删除 ${deletedFiles} 个文件`)
      setPage(1)
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || '清理失败')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => mediaApi.upload(file, 'attachment'),
    onSuccess: (response) => {
      setLatestUploadedAsset(response.data)
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setPurpose('attachment')
      setUsage('all')
      setPage(1)
      toast.success('附件上传成功')
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || mutationError.message || '附件上传失败')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (asset: MediaAsset) => mediaApi.delete(asset.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setDeleteTarget(null)
      toast.success('附件已删除')
    },
    onError: (mutationError: any) => {
      const references = mutationError.response?.data?.data?.usage_references
      if (Array.isArray(references) && references.length > 0 && deleteTarget) {
        setUsageAsset({ ...deleteTarget, usage_references: references, usage_count: references.length })
      }
      toast.error(mutationError.response?.data?.message || mutationError.message || '删除失败')
    },
  })

  const handleSelectFile = () => {
    if (!uploadMutation.isPending) {
      fileInputRef.current?.click()
    }
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    uploadMutation.mutate(file)
  }

  const copyText = async (value: string, successMessage: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(successMessage)
    } catch {
      toast.error('复制失败，请手动复制')
    }
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const items: MediaAsset[] = data?.items || []
  const pagination = data?.pagination
  const latestRelativeUrl = latestUploadedAsset?.relative_path || ''
  const latestPublicUrl = getMediaAssetPublicUrl(latestUploadedAsset)

  return (
    <div className="h-full min-h-0">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>附件管理</CardTitle>
              <CardDescription>上传附件、直接获取 URL，并查看本地媒体资产使用位置。</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
            >
              {cleanupMutation.isPending ? '清理中...' : '清理未使用资源'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
          <Card className="border-dashed shadow-none">
            <CardContent className="space-y-4 p-4">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
              />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-sm font-medium">直接上传附件</div>
                  <div className="text-sm text-muted-foreground">
                    支持图片、PDF、Office、压缩包、音视频等常见文件，上传后可直接复制 URL。
                  </div>
                </div>
                <Button type="button" onClick={handleSelectFile} disabled={uploadMutation.isPending}>
                  <FileUp className="size-4" />
                  {uploadMutation.isPending ? '上传中...' : '上传附件'}
                </Button>
              </div>

              {latestUploadedAsset ? (
                <div className="grid gap-3 rounded-lg border bg-muted/20 p-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="latest-relative-url">相对 URL</Label>
                    <div className="flex gap-2">
                      <Input id="latest-relative-url" readOnly value={latestRelativeUrl} />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyText(latestRelativeUrl, '已复制相对 URL')}
                      >
                        <Copy className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="latest-absolute-url">完整 URL</Label>
                    <div className="flex gap-2">
                      <Input id="latest-absolute-url" readOnly value={latestPublicUrl} />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => copyText(latestPublicUrl, '已复制完整 URL')}
                      >
                        <LinkIcon className="size-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground md:col-span-2">
                    最近上传：{latestUploadedAsset.original_name || '-'}，{formatFileSize(latestUploadedAsset.file_size)}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <div className="grid gap-3 md:grid-cols-[220px_220px_minmax(0,1fr)]">
            <div className="space-y-2">
              <div className="text-sm font-medium">资源类型</div>
              <Select
                value={purpose}
                onValueChange={(value) => {
                  setPurpose(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PURPOSE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="text-sm font-medium">使用位置</div>
              <Select
                value={usage}
                onValueChange={(value) => {
                  setUsage(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USAGE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end justify-end text-sm text-muted-foreground">
              共 {pagination?.total || 0} 条
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>预览</TableHead>
                  <TableHead>文件名</TableHead>
                  <TableHead>大小</TableHead>
                  <TableHead>使用位置</TableHead>
                  <TableHead>本地文件</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center">
                      暂无资源
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell>{formatPurpose(item.purpose)}</TableCell>
                      <TableCell>
                        {isImageAsset(item) ? (
                          <ImagePreview
                            src={getMediaAssetPublicUrl(item)}
                            alt={item.original_name || '资源预览'}
                            title={item.original_name || item.relative_path}
                          >
                            <button
                              type="button"
                              className="flex h-14 w-20 items-center justify-center overflow-hidden rounded border bg-muted/20 transition-colors hover:bg-muted/40"
                              aria-label={`预览 ${item.original_name || '图片'}`}
                            >
                              <img
                                src={getMediaAssetPublicUrl(item)}
                                alt={item.original_name || '资源预览'}
                                className="h-full w-full object-contain"
                              />
                            </button>
                          </ImagePreview>
                        ) : (
                          <span className="text-sm text-muted-foreground">非图片</span>
                        )}
                      </TableCell>
                      <TableCell className="group max-w-[260px]">
                        <span className="inline">
                          <a
                            href={getMediaAssetPublicUrl(item)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                            title={item.original_name || item.relative_path}
                          >
                            {item.original_name || item.relative_path}
                          </a>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="ml-1 inline-flex align-middle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                            onClick={() => copyText(getMediaAssetPublicUrl(item), '已复制完整 URL')}
                            aria-label={`复制 ${item.original_name || item.relative_path} 的完整 URL`}
                          >
                            <Copy className="size-4" />
                          </Button>
                        </span>
                      </TableCell>
                      <TableCell>{formatFileSize(item.file_size)}</TableCell>
                      <TableCell>
                        {item.usage_count ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setUsageAsset(item)}
                          >
                            <Eye className="size-4" />
                            {item.usage_count} 处
                          </Button>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.file_exists ? 'outline' : 'destructive'}>
                          {item.file_exists ? '存在' : '缺失'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatRelativeTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant="destructiveGhost"
                          size="icon-sm"
                          onClick={() => setDeleteTarget(item)}
                          aria-label={`删除 ${item.original_name || item.relative_path}`}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {pagination && (
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm text-muted-foreground">
                第 {pagination.page} / {pagination.totalPages} 页
              </div>
              {pagination.totalPages > 1 && (
                <Pagination className="mx-0 w-auto justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        size="default"
                        className={pagination.page === 1 ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (pagination.page > 1) {
                            setPage(pagination.page - 1)
                          }
                        }}
                      >
                        上一页
                      </PaginationLink>
                    </PaginationItem>
                    {buildPaginationItems(pagination.page, pagination.totalPages).map((item, index) => (
                      item === 'ellipsis' ? (
                        <PaginationItem key={`ellipsis-${index}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={item}>
                          <PaginationLink
                            href="#"
                            isActive={item === pagination.page}
                            onClick={(event) => {
                              event.preventDefault()
                              setPage(item)
                            }}
                          >
                            {item}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    ))}
                    <PaginationItem>
                      <PaginationLink
                        href="#"
                        size="default"
                        className={pagination.page === pagination.totalPages ? 'pointer-events-none opacity-50' : ''}
                        onClick={(event) => {
                          event.preventDefault()
                          if (pagination.page < pagination.totalPages) {
                            setPage(pagination.page + 1)
                          }
                        }}
                      >
                        下一页
                      </PaginationLink>
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(usageAsset)} onOpenChange={(open) => !open && setUsageAsset(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>使用位置</DialogTitle>
            <DialogDescription>{usageAsset?.relative_path}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-auto rounded border">
            {usageAsset?.usage_references?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>位置</TableHead>
                    <TableHead>表</TableHead>
                    <TableHead>字段</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageAsset.usage_references.map((reference, index) => (
                    <TableRow key={`${reference.table}-${reference.field}-${reference.record_id || reference.entry_id || index}`}>
                      <TableCell className="max-w-[260px]">
                        <div className="truncate font-medium">{reference.label || '-'}</div>
                        {reference.model_name ? (
                          <div className="text-xs text-muted-foreground">{reference.model_name}</div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{reference.table}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{reference.field}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {reference.entry_id ? `entry ${reference.entry_id}` : reference.record_id || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">未记录使用位置</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除附件</AlertDialogTitle>
            <AlertDialogDescription>
              删除后会移除附件记录和本地文件。提交删除时会重新检查使用位置，如果仍被内容、栏目或模板引用，将不会删除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
            {deleteTarget?.original_name || deleteTarget?.relative_path || '-'}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(event) => {
                event.preventDefault()
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget)
                }
              }}
            >
              {deleteMutation.isPending ? '删除中...' : '删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatPurpose(purpose: string) {
  if (purpose in MEDIA_PURPOSE_META) {
    return MEDIA_PURPOSE_META[purpose as keyof typeof MEDIA_PURPOSE_META].label
  }
  return purpose || '-'
}

function isImageAsset(item: MediaAsset) {
  return String(item.mime_type || '').startsWith('image/')
    || ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'].includes(String(item.file_ext || '').toLowerCase())
}

function getMediaAssetPublicUrl(item?: MediaAsset | null) {
  return resolveMediaAssetUrl(item) || new URL('/', window.location.origin).toString()
}

function formatFileSize(size: number) {
  const bytes = Number(size || 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function buildPaginationItems(currentPage: number, totalPages: number): Array<number | 'ellipsis'> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1)
  }

  const items: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, currentPage - 1)
  const end = Math.min(totalPages - 1, currentPage + 1)

  if (start > 2) {
    items.push('ellipsis')
  }

  for (let page = start; page <= end; page += 1) {
    items.push(page)
  }

  if (end < totalPages - 1) {
    items.push('ellipsis')
  }

  items.push(totalPages)
  return items
}
