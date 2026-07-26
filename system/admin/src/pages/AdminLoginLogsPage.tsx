import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/api/admin'
import { AdminDataTable } from '@/components/AdminDataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { ADMIN_CONFIG } from '@/config'
import { formatRelativeTime } from '@/lib/datetime'

export default function AdminLoginLogsPage() {
  const [page, setPage] = useState(1)
  const [usernameInput, setUsernameInput] = useState('')
  const [ipInput, setIpInput] = useState('')
  const [statusInput, setStatusInput] = useState<'success' | 'failure' | 'all'>('all')
  const [filters, setFilters] = useState({
    username: '',
    ip: '',
    status: 'all' as 'success' | 'failure' | 'all',
  })

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-login-logs', page, filters.username, filters.ip, filters.status],
    queryFn: () => adminApi.listLoginLogs({
      page,
      limit: ADMIN_CONFIG.pagination.pageSize,
      username: filters.username || undefined,
      ip: filters.ip || undefined,
      status: filters.status,
    }),
  })

  const items = data?.data?.items || []
  const pagination = data?.data?.pagination
  const total = pagination?.total || 0
  const totalPages = Math.max(1, Math.ceil(total / ADMIN_CONFIG.pagination.pageSize))

  const applyFilters = () => {
    setPage(1)
    setFilters({
      username: usernameInput.trim(),
      ip: ipInput.trim(),
      status: statusInput,
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>登录日志</CardTitle>
          <CardDescription>记录后台登录的用户名、IP、结果与时间</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminDataTable
            toolbar={(
              <>
            <Input
              className="w-[220px]"
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="按用户名筛选"
            />
            <Input
              className="w-[220px]"
              value={ipInput}
              onChange={(event) => setIpInput(event.target.value)}
              placeholder="按 IP 筛选"
            />
            <Select
              value={statusInput}
              onValueChange={(value: 'success' | 'failure' | 'all') => setStatusInput(value)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部结果</SelectItem>
                <SelectItem value="success">登录成功</SelectItem>
                <SelectItem value="failure">登录失败</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={applyFilters}>查询</Button>
            <Button variant="outline" onClick={() => void refetch()}>刷新</Button>
              </>
            )}
            columns={(
              <>
                <TableHead className="w-[220px]">时间</TableHead>
                <TableHead>用户名</TableHead>
                <TableHead className="w-[180px]">IP</TableHead>
                <TableHead className="w-[120px]">结果</TableHead>
                <TableHead>说明</TableHead>
              </>
            )}
            columnCount={5}
            isLoading={isLoading}
            isEmpty={items.length === 0}
            error={error ? `加载失败: ${(error as Error).message}` : null}
            emptyMessage="暂无登录日志"
            pagination={pagination ? {
              page,
              totalPages,
              total,
              pageSize: ADMIN_CONFIG.pagination.pageSize,
              onPageChange: setPage,
            } : null}
          >
            {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap">
                        {formatRelativeTime(item.created_at)}
                      </TableCell>
                      <TableCell className="font-medium">{item.username || '-'}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.client_ip || '-'}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === 'success' ? 'outline' : 'destructive'}>
                          {item.status === 'success' ? '成功' : '失败'}
                        </Badge>
                      </TableCell>
                      <TableCell>{getFailureReasonLabel(item.failure_code)}</TableCell>
                    </TableRow>
            ))}
          </AdminDataTable>
        </CardContent>
      </Card>
    </div>
  )
}

function getFailureReasonLabel(code?: string | null) {
  if (!code) {
    return '登录成功'
  }

  if (code === 'LOGIN_LOCKED') {
    return '密码错误次数过多，已被锁定'
  }

  if (code === 'INVALID_CREDENTIALS') {
    return '用户名或密码不正确'
  }

  return code
}
