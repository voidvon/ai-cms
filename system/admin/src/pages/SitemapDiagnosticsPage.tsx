import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import apiClient from '@/api/client'
import { staticGenerationApi, type BuildResult } from '@/api/static-generation'
import { AdminButton as Button } from '@/components/AdminButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/datetime'
import { toast } from 'sonner'

interface SitemapWarning {
  level: 'error' | 'warning'
  code: string
  message: string
  sample_ids?: number[]
}

interface SitemapChunkFile {
  file_name: string
  url_count: number
  lastmod: string
}

interface SitemapDiagnostics {
  generated_at: string
  site_url: string
  normalized_site_url: string
  total_urls: number
  chunk_size: number
  chunk_count: number
  sitemap_index_url: string
  page_type_counts: Record<string, number>
  recent_urls: Array<{ loc: string; lastmod: string }>
  warnings: SitemapWarning[]
  chunk_files: SitemapChunkFile[]
}

export default function SitemapDiagnosticsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['sitemap-diagnostics'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: SitemapDiagnostics }>('/sitemap/diagnostics')
      return response.data.data
    },
  })

  const rebuildMutation = useMutation({
    mutationFn: () => staticGenerationApi.buildStream('all', {}),
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`重建完成，文件数：${result.totalFiles}，记录数：${result.totalRecords}`)
        queryClient.invalidateQueries({ queryKey: ['sitemap-diagnostics'] })
      } else {
        toast.error(result.message || '重建失败')
      }
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '重建失败'))
    },
  })

  if (isLoading) {
    return <div>加载中...</div>
  }

  if (error || !data) {
    return <div>诊断信息加载失败</div>
  }

  return (
    <div className="space-y-4 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>Sitemap 诊断</CardTitle>
          <CardDescription>检查 sitemap 规模、分片状态和时间字段完整性</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="站点地址" value={data.normalized_site_url || '未配置'} />
          <MetricCard label="URL 总数" value={String(data.total_urls)} />
          <MetricCard label="分片数量" value={String(data.chunk_count)} />
          <MetricCard label="分片阈值" value={String(data.chunk_size)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>索引信息</CardTitle>
          <CardDescription>当前 sitemap 索引入口和本次诊断时间</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div><span className="font-medium">索引地址：</span>{data.sitemap_index_url || '未生成'}</div>
          <div><span className="font-medium">诊断时间：</span>{formatRelativeTime(data.generated_at)}</div>
          <div>
            <Button onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
              {rebuildMutation.isPending ? '重建中...' : '立即重建 Sitemap / Robots'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>页面类型统计</CardTitle>
          <CardDescription>按 sitemap URL 类型汇总当前收录规模</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>类型</TableHead>
                <TableHead>数量</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Object.entries(data.page_type_counts).map(([key, value]) => (
                <TableRow key={key}>
                  <TableCell>{renderTypeLabel(key)}</TableCell>
                  <TableCell>{value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>告警</CardTitle>
          <CardDescription>缺失配置或会影响 `lastmod` 精度的数据问题</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.warnings.length === 0 ? (
            <div className="text-sm text-muted-foreground">当前没有发现 sitemap 相关告警。</div>
          ) : data.warnings.map((warning) => (
            <div key={warning.code} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge variant={warning.level === 'error' ? 'destructive' : 'secondary'}>
                  {warning.level === 'error' ? '错误' : '警告'}
                </Badge>
                <span className="font-medium">{warning.code}</span>
              </div>
              <div className="mt-2 text-sm">{warning.message}</div>
              {warning.sample_ids && warning.sample_ids.length > 0 ? (
                <div className="mt-2 text-xs text-muted-foreground">
                  示例 ID: {warning.sample_ids.join(', ')}
                </div>
              ) : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>分片明细</CardTitle>
          <CardDescription>每个 sitemap 分片的 URL 数和最后更新时间</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件名</TableHead>
                <TableHead>URL 数</TableHead>
                <TableHead>最后更新时间</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.chunk_files.map((item) => (
                <TableRow key={item.file_name}>
                  <TableCell>{item.file_name}</TableCell>
                  <TableCell>{item.url_count}</TableCell>
                  <TableCell>{formatRelativeTime(item.lastmod)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近 URL 预览</CardTitle>
          <CardDescription>按 sitemap 当前输出顺序抽样显示前 20 条 URL</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>URL</TableHead>
                <TableHead>Lastmod</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_urls.map((item) => (
                <TableRow key={item.loc}>
                  <TableCell className="break-all">{item.loc}</TableCell>
                  <TableCell>{formatRelativeTime(item.lastmod)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 break-all text-2xl font-semibold">{value}</div>
    </div>
  )
}

function renderTypeLabel(value: string) {
  const labels: Record<string, string> = {
    home: '首页',
    contact: '联系页',
    corporation: '公司栏目',
    section_list: '栏目内容列表',
    section_detail: '栏目内容详情',
    service_list: '服务列表',
    service_detail: '服务详情',
    managed_content_list: '受管内容列表',
    managed_content_detail: '受管内容详情',
    single_page: '手工单页',
    other: '其他',
  }
  return labels[value] || value
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response
    if (response?.data?.message) {
      return response.data.message
    }
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}
