import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { mediaApi } from '@/api/media'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { toast } from 'sonner'
import type { MediaAsset } from '@/types'

const LIMIT = 50

const MEDIA_PURPOSE_META = {
  product_cover: { label: '产品封面' },
  news_cover: { label: '新闻封面' },
  richtext_image: { label: '富文本图片' },
  attachment: { label: '附件' },
} as const

const PURPOSE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  ...Object.entries(MEDIA_PURPOSE_META).map(([value, meta]) => ({
    value,
    label: meta.label,
  })),
]

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '使用中' },
  { value: 'orphaned', label: '孤儿资源' },
]

export default function MediaAssetsPage() {
  const queryClient = useQueryClient()
  const [page, setPage] = useState(1)
  const [purpose, setPurpose] = useState('all')
  const [status, setStatus] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['media-assets', page, LIMIT, purpose, status],
    queryFn: () => mediaApi.list({ page, limit: LIMIT, purpose, status }),
  })

  const cleanupMutation = useMutation({
    mutationFn: () => mediaApi.cleanupOrphaned(purpose),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      const deletedRows = response.data?.deletedRows || 0
      const deletedFiles = response.data?.deletedFiles || 0
      toast.success(`已清理 ${deletedRows} 条孤儿资源，删除 ${deletedFiles} 个文件`)
      setPage(1)
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || '清理失败')
    },
  })

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  const items: MediaAsset[] = data?.items || []
  const pagination = data?.pagination

  return (
    <div className="h-full min-h-0">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>附件管理</CardTitle>
              <CardDescription>查看本地媒体资产，按类型筛选并清理孤儿资源。</CardDescription>
            </div>
            <Button
              variant="outline"
              onClick={() => cleanupMutation.mutate()}
              disabled={cleanupMutation.isPending}
            >
              {cleanupMutation.isPending ? '清理中...' : '清理孤儿资源'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 flex-col space-y-4">
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
              <div className="text-sm font-medium">状态</div>
              <Select
                value={status}
                onValueChange={(value) => {
                  setStatus(value)
                  setPage(1)
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
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
                  <TableHead>状态</TableHead>
                  <TableHead>本地文件</TableHead>
                  <TableHead>创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center">
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
                            src={item.relative_path}
                            alt={item.original_name || '资源预览'}
                            title={item.original_name || item.relative_path}
                          >
                            <button
                              type="button"
                              className="flex h-14 w-20 items-center justify-center overflow-hidden rounded border bg-muted/20 transition-colors hover:bg-muted/40"
                              aria-label={`预览 ${item.original_name || '图片'}`}
                            >
                              <img
                                src={item.relative_path}
                                alt={item.original_name || '资源预览'}
                                className="h-full w-full object-contain"
                              />
                            </button>
                          </ImagePreview>
                        ) : (
                          <span className="text-sm text-muted-foreground">非图片</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[220px] truncate">
                        {item.original_name || '-'}
                      </TableCell>
                      <TableCell>{formatFileSize(item.file_size)}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'orphaned' ? 'secondary' : 'outline'}>
                          {item.status === 'orphaned' ? '孤儿资源' : '使用中'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={item.file_exists ? 'outline' : 'destructive'}>
                          {item.file_exists ? '存在' : '缺失'}
                        </Badge>
                      </TableCell>
                      <TableCell>{formatRelativeTime(item.created_at)}</TableCell>
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
