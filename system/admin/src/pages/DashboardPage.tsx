import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatRelativeTime } from '@/lib/datetime'
import { toast } from 'sonner'

const PAGE_SIZE = 20
const DEFAULT_USER_AGENT_KIND = 'non_bot'
const DEFAULT_REFERER_MODE = 'all'
const DEFAULT_STATUS_MODE = 'all'

export default function DashboardPage() {
  const [topPagesOpen, setTopPagesOpen] = useState(false)
  const [clearDialogOpen, setClearDialogOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pathInput, setPathInput] = useState('')
  const [ipInput, setIpInput] = useState('')
  const [userAgentKindInput, setUserAgentKindInput] = useState<'non_bot' | 'bot' | 'all'>(DEFAULT_USER_AGENT_KIND)
  const [refererModeInput, setRefererModeInput] = useState<'all' | 'with_referer'>(DEFAULT_REFERER_MODE)
  const [statusModeInput, setStatusModeInput] = useState<'all' | '2xx' | '3xx' | '4xx' | '404' | '5xx'>(DEFAULT_STATUS_MODE)
  const [filters, setFilters] = useState({
    path: '',
    ip: '',
    userAgentKind: DEFAULT_USER_AGENT_KIND as 'non_bot' | 'bot' | 'all',
    refererMode: DEFAULT_REFERER_MODE as 'all' | 'with_referer',
    statusMode: DEFAULT_STATUS_MODE as 'all' | '2xx' | '3xx' | '4xx' | '404' | '5xx',
  })

  const summaryQuery = useQuery({
    queryKey: ['dashboard-access-log-summary'],
    queryFn: () => adminApi.getAccessLogSummary(),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-access-logs', page, filters.path, filters.ip, filters.userAgentKind, filters.refererMode, filters.statusMode],
    queryFn: () => adminApi.listAccessLogs({
      page,
      limit: PAGE_SIZE,
      path: filters.path || undefined,
      ip: filters.ip || undefined,
      userAgentKind: filters.userAgentKind,
      refererMode: filters.refererMode,
      statusMode: filters.statusMode,
    }),
  })

  const items = data?.data?.items || []
  const pagination = data?.data?.pagination
  const summary = summaryQuery.data?.data
  const metrics = summary?.metrics
  const topPages = summary?.top_pages || []
  const total = pagination?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const clearLogsMutation = useMutation({
    mutationFn: () => adminApi.clearAccessLogs(),
    onSuccess: () => {
      toast.success('访问记录已清空')
      setClearDialogOpen(false)
      setPage(1)
      void refetch()
      void summaryQuery.refetch()
    },
    onError: (error: Error) => {
      toast.error(error.message || '清空访问记录失败')
    },
  })

  const applyFilters = () => {
    setPage(1)
    setFilters({
      path: pathInput.trim(),
      ip: ipInput.trim(),
      userAgentKind: userAgentKindInput,
      refererMode: refererModeInput,
      statusMode: statusModeInput,
    })
  }

  const refreshLogs = () => {
    void refetch()
  }

  const confirmClearLogs = () => {
    clearLogsMutation.mutate()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>今日访问量</CardDescription>
            <CardTitle>{metrics?.today_visits ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>近 24 小时访问量</CardDescription>
            <CardTitle>{metrics?.recent_visits ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>近 24 小时独立 IP（排除机器人）</CardDescription>
            <CardTitle>{metrics?.recent_unique_ips ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>404 错误数</CardDescription>
            <CardTitle>{metrics?.total_404_errors ?? 0}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="gap-3 pb-2">
            <div className="space-y-1">
              <CardDescription>累计页面数</CardDescription>
              <CardTitle>{metrics?.total_pages ?? 0}</CardTitle>
            </div>
            <div>
              <Button variant="outline" size="sm" onClick={() => setTopPagesOpen(true)}>
                查看热门页面
              </Button>
            </div>
          </CardHeader>
        </Card>
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={userAgentKindInput}
            onValueChange={(value: 'non_bot' | 'bot' | 'all') => setUserAgentKindInput(value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="non_bot">非爬虫</SelectItem>
              <SelectItem value="bot">爬虫</SelectItem>
              <SelectItem value="all">全部</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={refererModeInput}
            onValueChange={(value: 'all' | 'with_referer') => setRefererModeInput(value)}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部来源</SelectItem>
              <SelectItem value="with_referer">仅有来源</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={statusModeInput}
            onValueChange={(value: 'all' | '2xx' | '3xx' | '4xx' | '404' | '5xx') => setStatusModeInput(value)}
          >
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="2xx">2xx</SelectItem>
              <SelectItem value="3xx">3xx</SelectItem>
              <SelectItem value="4xx">4xx</SelectItem>
              <SelectItem value="404">404</SelectItem>
              <SelectItem value="5xx">5xx</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="w-[260px]"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="按路径或完整 URL 筛选"
          />
          <Input
            className="w-[220px]"
            value={ipInput}
            onChange={(event) => setIpInput(event.target.value)}
            placeholder="按 IP 筛选，例如 203.0.113.9"
          />
          <Button onClick={applyFilters}>查询</Button>
          <Button variant="outline" onClick={refreshLogs}>刷新</Button>
          <Button variant="destructive" onClick={() => setClearDialogOpen(true)}>
            清空
          </Button>
        </div>

        {isLoading ? <div>加载中...</div> : null}
        {error ? <div>加载失败: {(error as Error).message}</div> : null}

        {!isLoading && !error ? (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>页面 URL</TableHead>
                  <TableHead className="w-[160px] min-w-[160px]">IP</TableHead>
                  <TableHead className="w-[88px] min-w-[88px]">访问次数</TableHead>
                  <TableHead className="w-[220px] min-w-[220px] max-w-[220px]">客户端</TableHead>
                  <TableHead className="w-[88px] min-w-[88px]">状态</TableHead>
                  <TableHead className="w-[180px] min-w-[180px]">时间</TableHead>
                  <TableHead>来源</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center">
                      暂无访问记录
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-[360px] truncate font-medium">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="block w-full truncate text-left hover:underline"
                            title={item.page_url || item.page_path}
                          >
                            {item.page_url || item.page_path}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="start"
                          className="w-[520px] max-w-[min(520px,var(--radix-popover-content-available-width))] break-all p-3 text-sm"
                        >
                          {item.page_url || item.page_path}
                        </PopoverContent>
                      </Popover>
                    </TableCell>
                    <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">{item.client_ip}</TableCell>
                    <TableCell className="w-[88px] min-w-[88px]">{item.client_ip_visit_count}</TableCell>
                    <TableCell
                      className="w-[220px] min-w-[220px] max-w-[220px] truncate"
                    >
                      {item.user_agent ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="block w-full truncate text-left hover:underline"
                              title={item.user_agent}
                            >
                              <span className="inline-flex max-w-full items-center gap-2">
                                <Badge variant={getUserAgentBadgeVariant(item.user_agent_kind)}>
                                  {getUserAgentKindLabel(item.user_agent_kind)}
                                </Badge>
                                <span className="truncate">
                                  {item.user_agent_label || item.user_agent}
                                </span>
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-[420px] max-w-[min(420px,var(--radix-popover-content-available-width))] break-all p-3 text-sm"
                          >
                            {item.user_agent}
                          </PopoverContent>
                        </Popover>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="w-[88px] min-w-[88px]">
                      <Badge variant={item.status_code >= 400 ? 'destructive' : 'outline'}>
                        {item.status_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-[180px] min-w-[180px] whitespace-nowrap">
                      {formatRelativeTime(item.visited_at)}
                    </TableCell>
                    <TableCell className="max-w-[280px] truncate">
                      {item.referer || '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <div>
                第 {page} / {totalPages} 页，共 {total} 条
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={page <= 1}
                >
                  上一页
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  disabled={page >= totalPages}
                >
                  下一页
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Dialog open={topPagesOpen} onOpenChange={setTopPagesOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>热门页面</DialogTitle>
            <DialogDescription>按累计访问次数排序，展示当前最常访问的前台页面。</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>页面</TableHead>
                  <TableHead>访问量</TableHead>
                  <TableHead>独立 IP</TableHead>
                  <TableHead>最后访问</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaryQuery.isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">加载中...</TableCell>
                  </TableRow>
                ) : topPages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center">暂无统计数据</TableCell>
                  </TableRow>
                ) : topPages.map((item) => (
                    <TableRow key={item.page_url || item.page_path}>
                      <TableCell className="max-w-[420px] truncate font-medium" title={item.page_url || item.page_path}>
                        {item.page_url || item.page_path}
                      </TableCell>
                      <TableCell>{item.visits}</TableCell>
                      <TableCell>{item.unique_ips}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatRelativeTime(item.last_visited_at)}
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={clearDialogOpen} onOpenChange={setClearDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认清空访问记录</AlertDialogTitle>
            <AlertDialogDescription>
              该操作会删除当前仪表盘访问记录表中的全部数据，且无法恢复。是否继续？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmClearLogs}
              disabled={clearLogsMutation.isPending}
            >
              {clearLogsMutation.isPending ? '清空中...' : '确认清空'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function getUserAgentKindLabel(kind?: 'browser' | 'bot' | 'other') {
  if (kind === 'bot') {
    return '爬虫'
  }

  if (kind === 'browser') {
    return '浏览器'
  }

  return '其他'
}

function getUserAgentBadgeVariant(kind?: 'browser' | 'bot' | 'other') {
  if (kind === 'bot') {
    return 'secondary' as const
  }

  return 'outline' as const
}
