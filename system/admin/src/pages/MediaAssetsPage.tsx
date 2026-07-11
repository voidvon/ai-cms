import { useEffect, useState } from 'react'
import { Copy, Download, Eye, FileUp, Search, Trash2 } from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { mediaApi } from '@/api/media'
import type { PdfDocumentType } from '@/api/media'
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import type { Language, MediaAsset } from '@/types'

const LIMIT = 50

const MEDIA_PURPOSE_META = {
  product_cover: { label: '产品封面' },
  news_cover: { label: '新闻封面' },
  richtext_image: { label: '富文本图片' },
  column_image: { label: '栏目图片' },
  pdf_document: { label: 'PDF 文档' },
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

const PDF_DOCUMENT_TYPE_OPTIONS: Array<{ value: PdfDocumentType; label: string }> = [
  { value: 'sales_brochure', label: '销售手册' },
  { value: 'installation_guide', label: '安装说明' },
  { value: 'technical_information', label: '技术信息' },
]

type MediaAssetsPageProps = {
  mode?: 'attachments' | 'pdfs'
}

const PAGE_CONFIG = {
  attachments: {
    title: '附件管理',
    description: '上传附件、直接获取 URL，并查看本地媒体资产使用位置。',
    uploadTitle: '直接上传附件',
    uploadDescription: '支持图片、PDF、Office、压缩包、音视频等常见文件，上传后可直接复制 URL。',
    uploadButton: '上传附件',
    uploadPending: '上传中...',
    uploadPurpose: 'attachment',
    uploadAccept: undefined,
    latestLabel: '最近上传',
    emptyLabel: '暂无资源',
    deleteTitle: '确认删除附件',
    deleteDescription: '删除后会移除附件记录和本地文件。提交删除时会重新检查使用位置，如果仍被内容、栏目或模板引用，将不会删除。',
    cleanupButton: '清理未使用资源',
    cleanupSuccessPrefix: '已清理',
    uploadSuccess: '附件上传成功',
    uploadError: '附件上传失败',
    deleteSuccess: '附件已删除',
    fixedPurpose: null,
    showPurposeFilter: true,
  },
  pdfs: {
    title: 'PDF 管理',
    description: '集中管理总站引用和用户查询用的 PDF 文档，可上传、下载、复制 URL 和删除。',
    uploadTitle: '上传 PDF 文档',
    uploadDescription: '仅支持 PDF 文件，上传后会进入 /uploads/pdfs/，可用于站内引用和用户下载查询。',
    uploadButton: '上传 PDF',
    uploadPending: '上传中...',
    uploadPurpose: 'pdf_document',
    uploadAccept: 'application/pdf,.pdf',
    latestLabel: '最近上传',
    emptyLabel: '暂无 PDF 文档',
    deleteTitle: '确认删除 PDF',
    deleteDescription: '删除后会移除 PDF 记录和本地文件。提交删除时会重新检查使用位置，如果仍被内容、栏目或模板引用，将不会删除。',
    cleanupButton: '清理未使用 PDF',
    cleanupSuccessPrefix: '已清理',
    uploadSuccess: 'PDF 上传成功',
    uploadError: 'PDF 上传失败',
    deleteSuccess: 'PDF 已删除',
    fixedPurpose: 'pdf_document',
    showPurposeFilter: false,
  },
} as const

export default function MediaAssetsPage({ mode = 'attachments' }: MediaAssetsPageProps) {
  const queryClient = useQueryClient()
  const config = PAGE_CONFIG[mode]
  const [page, setPage] = useState(1)
  const [purpose, setPurpose] = useState(config.fixedPurpose || 'all')
  const [usage, setUsage] = useState('all')
  const [keywordInput, setKeywordInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [selectedPdfLanguageId, setSelectedPdfLanguageId] = useState('')
  const [selectedPdfDocumentType, setSelectedPdfDocumentType] = useState<PdfDocumentType>('sales_brochure')
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false)
  const [selectedUploadFile, setSelectedUploadFile] = useState<File | null>(null)
  const [usageAsset, setUsageAsset] = useState<MediaAsset | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null)
  const effectivePurpose = config.fixedPurpose || purpose
  const showLanguageColumn = mode === 'pdfs'
  const isCompactPdfPage = mode === 'pdfs'

  const { data, isLoading, error } = useQuery({
    queryKey: ['media-assets', mode, page, LIMIT, effectivePurpose, usage, keyword],
    queryFn: () => mediaApi.list({
      page,
      limit: LIMIT,
      purpose: effectivePurpose,
      usage,
      q: keyword || undefined,
      pdf_search: mode === 'pdfs' ? 1 : undefined,
    }),
  })

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages: Language[] = languagesData?.data || []
  const enabledLanguages = languages.filter((language) => Number(language.is_enabled || 0) === 1)

  useEffect(() => {
    if (mode !== 'pdfs' || selectedPdfLanguageId || enabledLanguages.length === 0) {
      return
    }
    const defaultLanguage = enabledLanguages.find((language) => Number(language.is_default || 0) === 1) || enabledLanguages[0]
    setSelectedPdfLanguageId(String(defaultLanguage.id))
  }, [mode, selectedPdfLanguageId, enabledLanguages])

  const cleanupMutation = useMutation({
    mutationFn: () => mediaApi.cleanupOrphaned(effectivePurpose),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      const deletedRows = response.data?.deletedRows || 0
      const deletedFiles = response.data?.deletedFiles || 0
      toast.success(`${config.cleanupSuccessPrefix} ${deletedRows} 条未使用资源，删除 ${deletedFiles} 个文件`)
      setPage(1)
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || '清理失败')
    },
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => mediaApi.upload(file, config.uploadPurpose, {
      languageId: mode === 'pdfs' ? Number(selectedPdfLanguageId || 0) || null : null,
      pdfDocumentType: mode === 'pdfs' ? selectedPdfDocumentType : null,
    }),
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setPurpose(config.fixedPurpose || config.uploadPurpose)
      setUsage('all')
      setPage(1)
      setSelectedUploadFile(null)
      setUploadDialogOpen(false)
      toast.success(config.uploadSuccess)
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || mutationError.message || config.uploadError)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (asset: MediaAsset) => mediaApi.delete(asset.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setDeleteTarget(null)
      toast.success(config.deleteSuccess)
    },
    onError: (mutationError: any) => {
      const references = mutationError.response?.data?.data?.usage_references
      if (Array.isArray(references) && references.length > 0 && deleteTarget) {
        setUsageAsset({ ...deleteTarget, usage_references: references, usage_count: references.length })
      }
      toast.error(mutationError.response?.data?.message || mutationError.message || '删除失败')
    },
  })

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setSelectedUploadFile(file || null)
  }

  const handleUploadSubmit = () => {
    if (!selectedUploadFile) {
      toast.error('请选择要上传的文件')
      return
    }
    uploadMutation.mutate(selectedUploadFile)
  }

  const handleSearchSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setKeyword(keywordInput.trim())
    setPage(1)
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

  return (
    <div className="h-full min-h-0">
      <Card className={isCompactPdfPage ? 'flex h-full min-h-0 flex-col overflow-hidden border-0 bg-transparent shadow-none' : 'flex h-full min-h-0 flex-col overflow-hidden'}>
        <CardHeader className={isCompactPdfPage ? 'space-y-0 p-0 pb-3' : 'space-y-3 p-4'}>
          {!isCompactPdfPage ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle>{config.title}</CardTitle>
                <CardDescription className="mt-1">{config.description}</CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => setUploadDialogOpen(true)}>
                  <FileUp className="size-4" />
                  {config.uploadButton}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => cleanupMutation.mutate()}
                  disabled={cleanupMutation.isPending}
                >
                  {cleanupMutation.isPending ? '清理中...' : config.cleanupButton}
                </Button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            {isCompactPdfPage ? (
              <div className="flex flex-wrap gap-2 pb-0">
                <Button type="button" size="sm" onClick={() => setUploadDialogOpen(true)}>
                  <FileUp className="size-4" />
                  {config.uploadButton}
                </Button>
              </div>
            ) : null}
            {config.showPurposeFilter ? (
              <div className="w-44 space-y-1">
                <Label className="text-xs">资源类型</Label>
                <Select
                  value={purpose}
                  onValueChange={(value) => {
                    setPurpose(value)
                    setPage(1)
                  }}
                >
                  <SelectTrigger className="h-8">
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
            ) : null}

            <div className="w-44 space-y-1">
              {!isCompactPdfPage ? <Label className="text-xs">使用位置</Label> : null}
              <Select
                value={usage}
                onValueChange={(value) => {
                  setUsage(value)
                  setPage(1)
                }}
              >
                <SelectTrigger className="h-8">
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

            <form className="min-w-64 flex-1 space-y-1" onSubmit={handleSearchSubmit}>
              {!isCompactPdfPage ? <Label className="text-xs">查询</Label> : null}
              <div className="flex gap-2">
                <Input
                  className="h-8"
                  value={keywordInput}
                  onChange={(event) => setKeywordInput(event.target.value)}
                  placeholder={isCompactPdfPage ? '标题、编号、文件名' : '文件名、路径或 MIME'}
                />
                <Button type="submit" variant="outline" size="icon-sm" aria-label="查询">
                  <Search className="size-4" />
                </Button>
              </div>
            </form>

            <div className="pb-2 text-sm text-muted-foreground">
              共 {pagination?.total || 0} 条
            </div>
          </div>
        </CardHeader>
        <CardContent className={isCompactPdfPage ? 'flex min-h-0 flex-1 flex-col space-y-3 p-0' : 'flex min-h-0 flex-1 flex-col space-y-3 p-4 pt-0'}>

          <div className="min-h-0 flex-1 overflow-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>类型</TableHead>
                  {showLanguageColumn ? <TableHead>标题</TableHead> : null}
                  {showLanguageColumn ? <TableHead>编号</TableHead> : null}
                  {!showLanguageColumn ? <TableHead>文件名</TableHead> : null}
                  <TableHead>大小</TableHead>
                  {showLanguageColumn ? <TableHead>语言</TableHead> : null}
                  <TableHead>使用位置</TableHead>
                  <TableHead>本地文件</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={showLanguageColumn ? 10 : 8} className="text-center">
                      {config.emptyLabel}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell className={showLanguageColumn ? 'whitespace-nowrap' : undefined}>
                        {showLanguageColumn ? (
                          <span className="text-sm">{formatPdfDocumentType(item.pdf_document_type)}</span>
                        ) : (
                          formatPurpose(item.purpose)
                        )}
                      </TableCell>
                      {showLanguageColumn ? (
                        <TableCell className="max-w-[260px]">
                          <span className="block truncate text-sm" title={item.pdf_title || item.original_name || ''}>
                            {item.pdf_title || '-'}
                          </span>
                        </TableCell>
                      ) : null}
                      {showLanguageColumn ? (
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.pdf_document_code || '-'}
                        </TableCell>
                      ) : null}
                      {!showLanguageColumn ? (
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
                      ) : null}
                      <TableCell>{formatFileSize(item.file_size)}</TableCell>
                      {showLanguageColumn ? (
                        <TableCell className="whitespace-nowrap text-sm">
                          {item.language_name || item.language_code || '未设置'}
                        </TableCell>
                      ) : null}
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
                          variant="ghost"
                          size="icon-sm"
                          asChild
                          aria-label={`下载 ${item.original_name || item.relative_path}`}
                        >
                          <a href={getMediaAssetPublicUrl(item)} download={item.original_name || undefined}>
                            <Download className="size-4" />
                          </a>
                        </Button>
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

      <Dialog
        open={uploadDialogOpen}
        onOpenChange={(open) => {
          setUploadDialogOpen(open)
          if (!open) {
            setSelectedUploadFile(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{config.uploadTitle}</DialogTitle>
            <DialogDescription>{config.uploadDescription}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {mode === 'pdfs' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="pdf-dialog-type">类型</Label>
                  <Select value={selectedPdfDocumentType} onValueChange={(value) => setSelectedPdfDocumentType(value as PdfDocumentType)}>
                    <SelectTrigger id="pdf-dialog-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PDF_DOCUMENT_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pdf-dialog-language">语言</Label>
                  <Select value={selectedPdfLanguageId || 'none'} onValueChange={(value) => setSelectedPdfLanguageId(value === 'none' ? '' : value)}>
                    <SelectTrigger id="pdf-dialog-language">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">未设置</SelectItem>
                      {enabledLanguages.map((language) => (
                        <SelectItem key={language.id} value={String(language.id)}>
                          {formatLanguageLabel(language)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="media-upload-file">文件</Label>
              <Input
                id="media-upload-file"
                type="file"
                accept={config.uploadAccept}
                onChange={handleFileChange}
              />
              {selectedUploadFile ? (
                <div className="text-xs text-muted-foreground">
                  {selectedUploadFile.name}，{formatFileSize(selectedUploadFile.size)}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setUploadDialogOpen(false)}
              disabled={uploadMutation.isPending}
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleUploadSubmit}
              disabled={uploadMutation.isPending || !selectedUploadFile}
            >
              <FileUp className="size-4" />
              {uploadMutation.isPending ? config.uploadPending : config.uploadButton}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <AlertDialogTitle>{config.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {config.deleteDescription}
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

function getMediaAssetPublicUrl(item?: MediaAsset | null) {
  return resolveMediaAssetUrl(item) || new URL('/', window.location.origin).toString()
}

function formatLanguageLabel(language: Language) {
  const name = language.name || language.native_name || language.code
  return `${name} (${language.code})`
}

function formatPdfDocumentType(value?: string | null) {
  return PDF_DOCUMENT_TYPE_OPTIONS.find((option) => option.value === value)?.label || '未设置'
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
