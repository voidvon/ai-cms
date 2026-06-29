import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import apiClient from '@/api/client'
import { Button } from '@/components/ui/button'
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

interface LlmsWarning {
  level: 'error' | 'warning'
  code: string
  message: string
}

interface LlmsGroup {
  title: string
  count: number
}

interface LlmsIndexGroup {
  title: string
  count: number
  total_count: number
}

interface LlmsPagePreview {
  title: string
  section: string
  public_url: string
  markdown_url: string
  summary: string
}

interface LlmsDiagnostics {
  generated_at: string
  site_url: string
  normalized_site_url: string
  total_pages: number
  llms_index_entry_count: number
  llms_url: string
  llms_full_url: string
  warnings: LlmsWarning[]
  groups: LlmsGroup[]
  llms_index_groups: LlmsIndexGroup[]
  recent_pages: LlmsPagePreview[]
}

interface BuildResult {
  success: boolean
  totalFiles?: number
  totalRecords?: number
  message?: string
}

const buildClient = axios.create({
  withCredentials: true,
  timeout: 300000,
})

export default function LlmsDiagnosticsPage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['llms-diagnostics'],
    queryFn: async () => {
      const response = await apiClient.get<{ success: boolean; data: LlmsDiagnostics }>('/llms/diagnostics')
      return response.data.data
    },
  })

  const rebuildMutation = useMutation({
    mutationFn: async () => {
      const response = await buildClient.post<BuildResult>('/admin/build/generate?section=llms', {})
      return response.data
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`重建完成，文件数：${result.totalFiles}，页面数：${result.totalRecords}`)
        queryClient.invalidateQueries({ queryKey: ['llms-diagnostics'] })
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
    return <div>LLMS 诊断信息加载失败</div>
  }

  return (
    <div className="space-y-4 overflow-auto">
      <Card>
        <CardHeader>
          <CardTitle>LLMS 诊断</CardTitle>
          <CardDescription>检查 llms.txt、llms-full.txt 和页面级 Markdown 导出状态</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="站点地址" value={data.normalized_site_url || '未配置'} />
          <MetricCard label="Markdown 页面数" value={String(data.total_pages)} />
          <MetricCard label="llms.txt 条目数" value={String(data.llms_index_entry_count)} />
          <MetricCard label="llms.txt" value={data.llms_url || '未生成'} />
          <MetricCard label="llms-full.txt" value={data.llms_full_url || '未生成'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>生成信息</CardTitle>
          <CardDescription>当前导出入口与最近一次诊断时间</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div><span className="font-medium">诊断时间：</span>{formatRelativeTime(data.generated_at)}</div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => rebuildMutation.mutate()} disabled={rebuildMutation.isPending}>
              {rebuildMutation.isPending ? '重建中...' : '立即重建 LLMS'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>llms.txt 分组</CardTitle>
          <CardDescription>展示最终写入 llms.txt 的精选条目数量</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>分组</TableHead>
                <TableHead>写入数</TableHead>
                <TableHead>总页面数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.llms_index_groups.map((group) => (
                <TableRow key={group.title}>
                  <TableCell>{group.title}</TableCell>
                  <TableCell>{group.count}</TableCell>
                  <TableCell>{group.total_count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Markdown 总量</CardTitle>
          <CardDescription>展示页面级 Markdown 实际导出规模</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>分组</TableHead>
                <TableHead>页面数</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.groups.map((group) => (
                <TableRow key={group.title}>
                  <TableCell>{group.title}</TableCell>
                  <TableCell>{group.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>告警</CardTitle>
          <CardDescription>缺失配置或不完整内容会在这里提示</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {data.warnings.length === 0 ? (
            <div className="text-sm text-muted-foreground">当前没有发现 LLMS 相关告警。</div>
          ) : data.warnings.map((warning) => (
            <div key={warning.code} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <Badge variant={warning.level === 'error' ? 'destructive' : 'secondary'}>
                  {warning.level === 'error' ? '错误' : '警告'}
                </Badge>
                <span className="font-medium">{warning.code}</span>
              </div>
              <div className="mt-2 text-sm">{warning.message}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>最近页面预览</CardTitle>
          <CardDescription>抽样显示前 20 个已导出的公开页面及其 Markdown 路径</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>标题</TableHead>
                <TableHead>分组</TableHead>
                <TableHead>公开地址</TableHead>
                <TableHead>Markdown 地址</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent_pages.map((item) => (
                <TableRow key={item.markdown_url}>
                  <TableCell>
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs text-muted-foreground">{item.summary}</div>
                  </TableCell>
                  <TableCell>{item.section}</TableCell>
                  <TableCell className="break-all">{item.public_url}</TableCell>
                  <TableCell className="break-all">{item.markdown_url}</TableCell>
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
