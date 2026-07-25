import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, LoaderCircle, Power, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

import { adminApi } from '@/api/admin'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export default function SystemVersionControl() {
  const queryClient = useQueryClient()
  const versionQuery = useQuery({
    queryKey: ['system-version'],
    queryFn: () => adminApi.getSystemVersion(),
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  })
  const status = versionQuery.data?.data

  const updateMutation = useMutation({
    mutationFn: adminApi.installSystemUpdate,
    onSuccess: async (response) => {
      const result = response.data
      toast.success(result?.message || '系统更新完成')
      await queryClient.invalidateQueries({ queryKey: ['system-version'] })

      if (result?.restarting) {
        window.setTimeout(() => window.location.reload(), 5000)
      }
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, '系统更新失败'))
    },
  })

  const restartMutation = useMutation({
    mutationFn: adminApi.restartSystem,
    onSuccess: (response) => {
      toast.success(response.data?.message || '系统正在重启')
      window.setTimeout(() => window.location.reload(), 5000)
    },
    onError: (error: unknown) => {
      toast.error(resolveApiErrorMessage(error, '系统重启失败'))
    },
  })

  const currentVersion = status?.current_version ? `v${status.current_version}` : 'v…'
  const latestVersion = status?.latest_version ? `v${status.latest_version}` : '暂不可用'
  const isUpdating = updateMutation.isPending || Boolean(status?.update_in_progress)
  const isRestarting = restartMutation.isPending
  const isBusy = isUpdating || isRestarting
  const canInstall = Boolean(status?.has_update && status?.can_update && !isBusy)
  const canRestart = Boolean(status?.can_restart && !isBusy)

  const handleRestart = () => {
    if (!window.confirm('确定要重启系统吗？重启期间后台将短暂断开。')) return
    restartMutation.mutate()
  }

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          void versionQuery.refetch()
        }
      }}
    >
      <PopoverTrigger
        render={
          <button
          type="button"
          className="relative inline-flex h-6 items-center rounded-md px-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label={`当前系统版本 ${currentVersion}${status?.has_update ? '，有新版本可用' : ''}`}
          />
        }
      >
        {currentVersion}
        {status?.has_update ? (
          <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-500 ring-2 ring-sidebar" aria-hidden="true" />
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-80 p-0">
        <div className="space-y-3 p-4">
          <div>
            <div className="text-sm font-semibold">系统版本</div>
            <div className="mt-1 text-xs text-muted-foreground">
              {status?.has_update ? '发现可用的新版本' : status?.checking_error ? '版本检查暂不可用' : '当前已经是最新版本'}
            </div>
          </div>

          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md bg-muted/60 p-3 text-sm">
            <span className="text-muted-foreground">当前版本</span>
            <span className="text-right font-medium">{currentVersion}</span>
            <span className="text-muted-foreground">最新版本</span>
            <span className="text-right font-medium">{latestVersion}</span>
          </div>

          {status?.checking_error ? (
            <p className="text-xs leading-5 text-destructive">{status.checking_error}</p>
          ) : null}

          {status && !status.update_supported ? (
            <p className="text-xs leading-5 text-amber-600 dark:text-amber-400">
              当前安装缺少可信的构建版本信息，不能使用在线更新。
            </p>
          ) : null}

          <div className="flex items-start justify-between gap-3 text-xs text-muted-foreground">
            <span>
              更新时会校验发布包，并保留数据库、静态站点、上传文件和环境配置。
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 shrink-0"
              onClick={() => void versionQuery.refetch()}
              disabled={versionQuery.isFetching || isBusy}
              aria-label="重新检查版本"
              title="重新检查版本"
            >
              <RefreshCw className={versionQuery.isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>

          {status?.release_url ? (
            <a
              href={status.release_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              查看 GitHub Release
              <ExternalLink className="size-3" />
            </a>
          ) : null}
        </div>

        <div className="border-t p-3">
          <Button
            type="button"
            className="w-full"
            onClick={() => updateMutation.mutate()}
            disabled={!canInstall}
          >
            {isUpdating ? <LoaderCircle className="animate-spin" /> : null}
            {getUpdateButtonLabel(status, isUpdating)}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="mt-2 w-full"
            onClick={handleRestart}
            disabled={!canRestart}
          >
            {isRestarting ? <LoaderCircle className="animate-spin" /> : <Power />}
            {isRestarting ? '正在重启…' : status?.can_restart ? '重启系统' : '无系统重启权限'}
          </Button>
          {status?.has_update && status.can_update ? (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              安装完成后服务将自动重启，期间后台会短暂断开。
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function getUpdateButtonLabel(
  status: Awaited<ReturnType<typeof adminApi.getSystemVersion>>['data'] | undefined,
  isUpdating: boolean,
) {
  if (isUpdating) return '正在更新…'
  if (!status) return '正在检查…'
  if (!status.update_supported) return '缺少有效构建版本'
  if (!status.can_update) return '无系统更新权限'
  if (status.checking_error) return '暂时无法更新'
  if (!status.has_update) return '当前已是最新版本'
  return '立即更新'
}

function resolveApiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback
  const value = error as {
    message?: string
    response?: { data?: { message?: string } }
  }
  return value.response?.data?.message || value.message || fallback
}
