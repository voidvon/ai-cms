import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const PAGE_SIZE = 20

export default function DashboardPage() {
  const [topPagesOpen, setTopPagesOpen] = useState(false)
  const [page, setPage] = useState(1)
  const [pathInput, setPathInput] = useState('')
  const [ipInput, setIpInput] = useState('')
  const [filters, setFilters] = useState({ path: '', ip: '' })

  const summaryQuery = useQuery({
    queryKey: ['dashboard-access-log-summary'],
    queryFn: () => adminApi.getAccessLogSummary(),
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard-access-logs', page, filters.path, filters.ip],
    queryFn: () => adminApi.listAccessLogs({
      page,
      limit: PAGE_SIZE,
      path: filters.path || undefined,
      ip: filters.ip || undefined,
    }),
  })

  const items = data?.data?.items || []
  const pagination = data?.data?.pagination
  const summary = summaryQuery.data?.data
  const metrics = summary?.metrics
  const topPages = summary?.top_pages || []
  const total = pagination?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const applyFilters = () => {
    setPage(1)
    setFilters({
      path: pathInput.trim(),
      ip: ipInput.trim(),
    })
  }

  const refreshLogs = () => {
    void refetch()
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-4">
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
            <CardDescription>近 24 小时独立 IP</CardDescription>
            <CardTitle>{metrics?.recent_unique_ips ?? 0}</CardTitle>
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
          <Input
            className="w-[260px]"
            value={pathInput}
            onChange={(event) => setPathInput(event.target.value)}
            placeholder="按页面路径筛选，例如 /contact.html"
          />
          <Input
            className="w-[220px]"
            value={ipInput}
            onChange={(event) => setIpInput(event.target.value)}
            placeholder="按 IP 筛选，例如 203.0.113.9"
          />
          <Button onClick={applyFilters}>查询</Button>
          <Button variant="outline" onClick={refreshLogs}>刷新</Button>
        </div>

        {isLoading ? <div>加载中...</div> : null}
        {error ? <div>加载失败: {(error as Error).message}</div> : null}

        {!isLoading && !error ? (
          <div className="space-y-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>页面</TableHead>
                  <TableHead className="w-[160px] min-w-[160px]">IP</TableHead>
                  <TableHead className="w-[88px] min-w-[88px]">状态</TableHead>
                  <TableHead className="w-[180px] min-w-[180px]">时间</TableHead>
                  <TableHead>来源</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center">
                      暂无访问记录
                    </TableCell>
                  </TableRow>
                ) : items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.page_path}</TableCell>
                    <TableCell className="w-[160px] min-w-[160px] whitespace-nowrap">{item.client_ip}</TableCell>
                    <TableCell className="w-[88px] min-w-[88px]">
                      <Badge variant={item.status_code >= 400 ? 'destructive' : 'outline'}>
                        {item.status_code}
                      </Badge>
                    </TableCell>
                    <TableCell className="w-[180px] min-w-[180px] whitespace-nowrap">
                      {new Date(item.visited_at).toLocaleString('zh-CN')}
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
                  <TableRow key={item.page_path}>
                    <TableCell className="font-medium">{item.page_path}</TableCell>
                    <TableCell>{item.visits}</TableCell>
                    <TableCell>{item.unique_ips}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {item.last_visited_at ? new Date(item.last_visited_at).toLocaleString('zh-CN') : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
