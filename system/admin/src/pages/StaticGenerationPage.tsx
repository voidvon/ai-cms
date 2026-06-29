import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { templateVariantsApi } from '@/api/advanced'
import {
  staticGenerationApi,
  type BuildResult,
  type DatabaseCheckpointResult,
  type StaticBuildProgressEvent,
  type StaticSectionGroup,
} from '@/api/static-generation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Language } from '@/types'

export default function StaticGenerationPage() {
  const [building, setBuilding] = useState(false)
  const [lastBuild, setLastBuild] = useState<BuildResult | null>(null)
  const [lastCheckpoint, setLastCheckpoint] = useState<DatabaseCheckpointResult | null>(null)
  const [buildScopeLabel, setBuildScopeLabel] = useState('')
  const [buildEvents, setBuildEvents] = useState<StaticBuildProgressEvent[]>([])
  const [recentFiles, setRecentFiles] = useState<Array<{ path: string; type: string; languageCode?: string | null }>>([])
  const { data: selectedThemeData } = useQuery({
    queryKey: ['selected-theme'],
    queryFn: () => templateVariantsApi.getSelected(),
  })
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const { data: sectionGroupsData } = useQuery({
    queryKey: ['static-build-sections'],
    queryFn: () => staticGenerationApi.listSections(),
  })

  const languages = languagesData?.data || []
  const sectionGroups = sectionGroupsData?.data || []
  const enabledLanguages = useMemo(
    () => languages.filter((item) => Number(item.is_enabled || 0) === 1),
    [languages]
  )
  const outputDirConflicts = useMemo(() => {
    const grouped = new Map<string, Language[]>()
    for (const language of enabledLanguages) {
      const outputDir = String(language.site?.output_dir || '').trim() || 'html'
      const existing = grouped.get(outputDir) || []
      existing.push(language)
      grouped.set(outputDir, existing)
    }
    return Array.from(grouped.entries()).filter(([, items]) => items.length > 1)
  }, [enabledLanguages])

  const buildMutation = useMutation({
    mutationFn: ({ section, languageCode }: { section: string; languageCode?: string }) =>
      staticGenerationApi.buildStream(
        section,
        {
          onStarted: ({ normalizedSection, languageCode: currentLanguageCode }) => {
            const scope = currentLanguageCode ? `语言 ${currentLanguageCode}` : '全部已启用语言'
            setBuildScopeLabel(`${scope} / ${normalizedSection}`)
            setBuildEvents([])
            setRecentFiles([])
          },
          onProgress: (event) => {
            setBuildEvents((current) => {
              const next = [...current, event]
              return next.slice(-60)
            })
            if (event.type === 'file_written' && event.relativePath) {
              setRecentFiles((current) => {
                const next = [
                  {
                    path: event.relativePath || '',
                    type: event.fileType || 'file',
                    languageCode: event.languageCode,
                  },
                  ...current,
                ]
                return next.slice(0, 30)
              })
            }
          },
          onCompleted: (result) => {
            setLastBuild(result)
          },
          onError: (error) => {
            throw new Error(error.message || '生成失败')
          },
        },
        languageCode
      ),
    onSuccess: (data) => {
      if (data.success) {
        setLastBuild(data)
        const buildScope = data.languageCode ? `语言 ${data.languageCode}` : '全部已启用语言'
        toast.success(`生成成功：${buildScope}，文件数：${data.totalFiles || 0}，记录数：${data.totalRecords || 0}`)
      } else {
        toast.error(data.message || '生成失败')
      }
      setBuilding(false)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '生成失败'))
      setBuilding(false)
    },
  })

  const checkpointMutation = useMutation({
    mutationFn: () => staticGenerationApi.checkpointDatabaseWal(),
    onSuccess: (data) => {
      if (data.success && data.data) {
        setLastCheckpoint(data.data)
        toast.success(
          data.data.releasedBytes > 0
            ? `数据库日志已清理，释放 ${formatBytes(data.data.releasedBytes)}`
            : '数据库日志已检查，当前没有可释放的 WAL 空间'
        )
        return
      }
      toast.error(data.message || '数据库日志清理失败')
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '数据库日志清理失败'))
    },
  })

  const handleBuild = (section: string, languageCode?: string) => {
    setBuilding(true)
    setLastBuild(null)
    buildMutation.mutate({ section, languageCode })
  }

  const activeTargets = useMemo(() => {
    return buildEvents
      .filter((event) => event.type === 'target_started' || event.type === 'assets_started')
      .slice(-6)
      .reverse()
  }, [buildEvents])

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="space-y-4 pb-4">
        <Card>
        <CardHeader>
          <CardTitle>静态页面生成</CardTitle>
          <CardDescription>
            生成静态 HTML 文件。当前默认主题：{selectedThemeData?.data?.template_name || '未选择'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="rounded border p-4 space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">语言输出目录</h3>
              <Badge variant="outline">{enabledLanguages.length} 个启用语言</Badge>
            </div>
            <div className="space-y-2">
              {enabledLanguages.map((language) => (
                <div key={language.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={language.is_default ? 'default' : 'outline'}>
                    {language.code}
                  </Badge>
                  <span>{language.name}</span>
                  <Badge variant="outline">
                    {language.site?.site_mode === 'standalone' ? '独立站点' : '子目录站点'}
                  </Badge>
                  <span className="text-muted-foreground">输出到</span>
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{language.site?.output_dir || 'html'}</code>
                  {language.site?.site_mode === 'standalone' ? (
                    <>
                      <span className="text-muted-foreground">访问端口</span>
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{language.site?.bind_host || '127.0.0.1'}:{language.site?.access_port || '-'}</code>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">路径前缀</span>
                      <code className="rounded bg-muted px-2 py-0.5 text-xs">{language.site?.path_prefix || '/'}</code>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleBuild('all', language.code)}
                    disabled={building}
                  >
                    仅生成该语言
                  </Button>
                </div>
              ))}
            </div>
            {outputDirConflicts.length > 0 ? (
              <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                存在语言输出目录冲突，以下语言会互相覆盖：
                {outputDirConflicts.map(([outputDir, conflictLanguages]) => (
                  <div key={outputDir}>
                    <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">{outputDir}</code>
                    {conflictLanguages.map((item) => item.code).join(' / ')}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {sectionGroups.map((section) => (
            <div key={section.title} className="space-y-2">
              <h3 className="font-semibold">{section.title}</h3>
              <div className="flex flex-wrap gap-2">
                {section.items.map((item) => (
                  <Button
                    key={item.value}
                    variant="outline"
                    onClick={() => handleBuild(item.value)}
                    disabled={building}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          ))}

          <div className="pt-4 border-t">
            <h3 className="font-semibold mb-2">全站生成</h3>
            <Button onClick={() => handleBuild('all')} disabled={building}>
              {building ? '生成中...' : '生成全站'}
            </Button>
          </div>

          {building || recentFiles.length > 0 || activeTargets.length > 0 ? (
            <div className="rounded border p-4 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">实时生成进度</h3>
                {building ? <Badge>进行中</Badge> : <Badge variant="outline">已完成</Badge>}
                {buildScopeLabel ? (
                  <code className="rounded bg-muted px-2 py-0.5 text-xs">{buildScopeLabel}</code>
                ) : null}
              </div>

              {activeTargets.length > 0 ? (
                <div className="space-y-2 text-sm">
                  {activeTargets.map((event, index) => (
                    <div key={`${event.timestamp || 'evt'}-${index}`} className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{event.languageCode || 'default'}</Badge>
                      <span>{event.target?.label || event.assetType || event.type}</span>
                      {event.target?.group ? (
                        <span className="text-muted-foreground">{event.target.group}</span>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {recentFiles.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">最近输出文件</div>
                  <div className="max-h-80 space-y-2 overflow-y-auto rounded border bg-muted/20 p-3 text-xs">
                    {recentFiles.map((item, index) => (
                      <div key={`${item.path}-${index}`} className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{item.languageCode || 'shared'}</Badge>
                        <Badge variant="secondary">{item.type}</Badge>
                        <code>{item.path}</code>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="pt-4 border-t space-y-3">
            <div>
              <h3 className="font-semibold">数据库日志清理</h3>
              <p className="text-sm text-muted-foreground">
                `site.sqlite-wal` 是 SQLite 的写前日志，不是普通缓存。点击后会执行 checkpoint 并尝试截断 WAL 文件。
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => checkpointMutation.mutate()}
              disabled={checkpointMutation.isPending || building}
            >
              {checkpointMutation.isPending ? '清理中...' : '清理数据库日志'}
            </Button>
            {lastCheckpoint ? (
              <div className="rounded border p-4 space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">WAL</Badge>
                  <span className="text-muted-foreground">
                    {formatBytes(lastCheckpoint.beforeWalSize)} -&gt; {formatBytes(lastCheckpoint.afterWalSize)}
                  </span>
                  <span className="text-muted-foreground">释放 {formatBytes(lastCheckpoint.releasedBytes)}</span>
                </div>
                <div className="text-muted-foreground">
                  数据库文件：{formatBytes(lastCheckpoint.beforeDbSize)} -&gt; {formatBytes(lastCheckpoint.afterDbSize)}
                </div>
              </div>
            ) : null}
          </div>

          {lastBuild?.result?.languageBuilds?.length ? (
            <div className="rounded border p-4 space-y-3">
              <h3 className="font-semibold">最近一次生成结果</h3>
              <div className="space-y-2 text-sm">
                {lastBuild.result.languageBuilds.map((item) => (
                  <div key={`${item.languageCode}-${item.outputRoot}`} className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.languageCode}</Badge>
                    <code className="rounded bg-muted px-2 py-0.5 text-xs">{item.outputRoot}</code>
                    <span className="text-muted-foreground">文件数 {item.totalFiles}</span>
                    <span className="text-muted-foreground">记录数 {item.totalRecords}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </CardContent>
        </Card>
      </div>
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

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}
