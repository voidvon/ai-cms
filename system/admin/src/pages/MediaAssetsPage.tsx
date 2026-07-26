import { useEffect, useState } from 'react'
import { Copy, Download, ExternalLink, Eye, FileUp, RefreshCw, Search, Trash2 } from 'lucide-react'
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
import { AdminDataTable } from '@/components/AdminDataTable'
import { TableActionButton } from '@/components/TableActionButton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { ADMIN_CONFIG } from '@/config'
import { formatRelativeTime } from '@/lib/datetime'
import { resolveMediaAssetUrl } from '@/lib/assets'
import { toast } from 'sonner'
import type { Language, MediaAsset } from '@/types'

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
    title: '附件',
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
    uploadSuccess: '附件上传成功',
    uploadError: '附件上传失败',
    deleteSuccess: '附件已删除',
    fixedPurpose: null,
    showPurposeFilter: true,
  },
  pdfs: {
    title: 'PDF',
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
  const [replaceTarget, setReplaceTarget] = useState<MediaAsset | null>(null)
  const [selectedReplacementFile, setSelectedReplacementFile] = useState<File | null>(null)
  const [downloadingAssetId, setDownloadingAssetId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<MediaAsset | null>(null)
  const effectivePurpose = config.fixedPurpose || purpose
  const showLanguageColumn = mode === 'pdfs'
  const isCompactPdfPage = mode === 'pdfs'

  const { data, isLoading, error } = useQuery({
    queryKey: ['media-assets', mode, page, ADMIN_CONFIG.pagination.pageSize, effectivePurpose, usage, keyword],
    queryFn: () => mediaApi.list({
      page,
      limit: ADMIN_CONFIG.pagination.pageSize,
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

  const replaceMutation = useMutation({
    mutationFn: async ({ asset, file }: { asset: MediaAsset; file: File }) => mediaApi.replace(asset.id, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['media-assets'] })
      setReplaceTarget(null)
      setSelectedReplacementFile(null)
      toast.success('资源替换成功，原 URL 保持不变')
    },
    onError: (mutationError: any) => {
      toast.error(mutationError.response?.data?.message || mutationError.message || '资源替换失败')
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

  const downloadAsset = async (asset: MediaAsset) => {
    setDownloadingAssetId(asset.id)
    try {
      const blob = await mediaApi.download(asset.id)
      const objectUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = asset.original_name || `media-${asset.id}${asset.file_ext || ''}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(objectUrl)
    } catch (downloadError: any) {
      toast.error(downloadError.response?.data?.message || downloadError.message || '下载失败')
    } finally {
      setDownloadingAssetId(null)
    }
  }

  const items: MediaAsset[] = data?.items || []
  const pagination = data?.pagination

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        <AdminDataTable
          fill
          toolbar={(
            <>
            <Button type="button" onClick={() => setUploadDialogOpen(true)}>
              <FileUp className="size-4" />
              {config.uploadButton}
            </Button>
            {config.showPurposeFilter ? (
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
            ) : null}

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

            <form className="flex items-center gap-2" onSubmit={handleSearchSubmit}>
              <Input
                value={keywordInput}
                onChange={(event) => setKeywordInput(event.target.value)}
                placeholder={isCompactPdfPage ? '标题、编号、文件名' : '文件名、路径或 MIME'}
              />
              <Button type="submit" variant="outline" size="icon" aria-label="查询">
                <Search className="size-4" />
              </Button>
            </form>
            </>
          )}
          columns={(
            <>
              <TableHead>ID</TableHead>
              <TableHead>类型</TableHead>
              {showLanguageColumn ? <TableHead>标题</TableHead> : null}
              {showLanguageColumn ? <TableHead>编号</TableHead> : null}
              {!showLanguageColumn ? <TableHead>文件名</TableHead> : null}
              <TableHead>大小</TableHead>
              {showLanguageColumn ? <TableHead>语言</TableHead> : null}
              <TableHead>使用位置</TableHead>
              <TableHead>来源</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </>
          )}
          columnCount={showLanguageColumn ? 10 : 8}
          isLoading={isLoading}
          isEmpty={items.length === 0}
          error={error ? `加载失败: ${(error as Error).message}` : null}
          emptyMessage={config.emptyLabel}
          pagination={pagination ? {
            page: pagination.page,
            totalPages: pagination.totalPages,
            total: pagination.total || 0,
            pageSize: ADMIN_CONFIG.pagination.pageSize,
            onPageChange: setPage,
          } : null}
        >
          {items.map((item) => (
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
                        <TableCell className="group w-[260px] max-w-[260px]">
                          <div className="flex min-w-0 items-center">
                            <a
                              href={getMediaAssetPublicUrl(item)}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
                              title={item.original_name || item.relative_path}
                            >
                              {item.original_name || item.relative_path}
                            </a>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className="ml-1 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                              onClick={() => copyText(getMediaAssetPublicUrl(item), '已复制完整 URL')}
                              aria-label={`复制 ${item.original_name || item.relative_path} 的完整 URL`}
                            >
                              <Copy className="size-4" />
                            </Button>
                          </div>
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
                        {renderAssetSourceBadge(item)}
                      </TableCell>
                      <TableCell>{formatRelativeTime(item.created_at)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <TableActionButton
                            asChild
                            variant="ghost"
                            aria-label={`打开 ${item.original_name || item.relative_path}`}
                            tooltip="打开 URL"
                          >
                            <a href={getMediaAssetPublicUrl(item)} target="_blank" rel="noreferrer">
                              <ExternalLink className="size-4" />
                            </a>
                          </TableActionButton>
                          <TableActionButton
                            variant="ghost"
                            onClick={() => copyText(getMediaAssetPublicUrl(item), '已复制完整 URL')}
                            aria-label={`复制 ${item.original_name || item.relative_path} 的完整 URL`}
                            tooltip="复制 URL"
                          >
                            <Copy className="size-4" />
                          </TableActionButton>
                          <TableActionButton
                            variant="ghost"
                            disabled={!isLocalMediaAsset(item)}
                            onClick={() => setReplaceTarget(item)}
                            aria-label={`替换 ${item.original_name || item.relative_path}`}
                            tooltip={isLocalMediaAsset(item) ? '替换资源' : '原 URL 索引不支持本地替换'}
                          >
                            <RefreshCw className="size-4" />
                          </TableActionButton>
                          <TableActionButton
                            variant="ghost"
                            disabled={downloadingAssetId === item.id || !isLocalMediaAsset(item)}
                            onClick={() => downloadAsset(item)}
                            aria-label={`下载 ${item.original_name || item.relative_path}`}
                            tooltip={isLocalMediaAsset(item) ? '下载文件' : '原 URL 索引请直接打开 URL'}
                          >
                            <Download className="size-4" />
                          </TableActionButton>
                          <TableActionButton
                            variant="destructive"
                            onClick={() => setDeleteTarget(item)}
                            aria-label={`删除 ${item.original_name || item.relative_path}`}
                            tooltip="删除"
                          >
                            <Trash2 className="size-4" />
                          </TableActionButton>
                        </div>
                      </TableCell>
                    </TableRow>
          ))}
        </AdminDataTable>
      </div>

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

      <Dialog
        open={Boolean(replaceTarget)}
        onOpenChange={(open) => {
          if (!open && !replaceMutation.isPending) {
            setReplaceTarget(null)
            setSelectedReplacementFile(null)
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>替换资源</DialogTitle>
            <DialogDescription>
              上传新文件后将覆盖原文件，资源 ID、URL 和已有引用保持不变。新文件必须为 {replaceTarget?.file_ext || '相同'} 扩展名。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded border bg-muted/20 p-3 text-sm text-muted-foreground">
              {replaceTarget?.original_name || replaceTarget?.relative_path || '-'}
            </div>
            <div className="space-y-2">
              <Label htmlFor="media-replacement-file">新文件</Label>
              <Input
                id="media-replacement-file"
                type="file"
                accept={replaceTarget?.file_ext || undefined}
                disabled={replaceMutation.isPending}
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  event.target.value = ''
                  setSelectedReplacementFile(file || null)
                }}
              />
              {selectedReplacementFile ? (
                <div className="text-xs text-muted-foreground">
                  {selectedReplacementFile.name}，{formatFileSize(selectedReplacementFile.size)}
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={replaceMutation.isPending}
              onClick={() => {
                setReplaceTarget(null)
                setSelectedReplacementFile(null)
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={replaceMutation.isPending || !selectedReplacementFile}
              onClick={() => {
                if (replaceTarget && selectedReplacementFile) {
                  replaceMutation.mutate({ asset: replaceTarget, file: selectedReplacementFile })
                }
              }}
            >
              <RefreshCw className="size-4" />
              {replaceMutation.isPending ? '替换中...' : '确认替换'}
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
          <AdminDataTable
            columns={(
              <>
                <TableHead>位置</TableHead>
                <TableHead>表</TableHead>
                <TableHead>字段</TableHead>
                <TableHead>ID</TableHead>
              </>
            )}
            columnCount={4}
            isEmpty={!usageAsset?.usage_references?.length}
            emptyMessage="未记录使用位置"
            tableContainerClassName="max-h-[55vh]"
          >
            {usageAsset?.usage_references?.map((reference, index) => (
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
          </AdminDataTable>
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

function isLocalMediaAsset(item?: MediaAsset | null) {
  return item?.is_local_file ?? item?.storage_driver === 'local'
}

function renderAssetSourceBadge(item: MediaAsset) {
  if (item.is_original_url) {
    return <Badge variant="outline">原 URL</Badge>
  }
  return (
    <Badge variant={item.file_exists ? 'outline' : 'destructive'}>
      {item.file_exists ? '存在' : '缺失'}
    </Badge>
  )
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
