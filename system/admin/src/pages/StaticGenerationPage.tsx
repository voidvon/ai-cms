import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import {
  staticGenerationApi,
  type BuildResult,
  type DatabaseCheckpointResult,
} from '@/api/static-generation'
import { AdminButton as Button } from '@/components/AdminButton'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { Language } from '@/types'

const DEFAULT_DEV_SITE_PORT = 1231

export default function StaticGenerationPage() {
  const [building, setBuilding] = useState(false)
  const [activeBuildAction, setActiveBuildAction] = useState<string | null>(null)
  const [generatedPageCount, setGeneratedPageCount] = useState(0)
  const [lastBuild, setLastBuild] = useState<BuildResult | null>(null)
  const [lastCheckpoint, setLastCheckpoint] = useState<DatabaseCheckpointResult | null>(null)
  const generatedPageTargetRef = useRef(0)
  const generatedPageDisplayRef = useRef(0)
  const generatedPageAnimationRef = useRef<number | null>(null)
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = languagesData?.data || []
  const enabledLanguages = useMemo(
    () => languages.filter((item) => Number(item.is_enabled || 0) === 1),
    [languages]
  )
  const enabledStandaloneLanguages = useMemo(
    () => enabledLanguages.filter((item) => item.site?.site_mode === 'standalone'),
    [enabledLanguages]
  )
  const enabledSubdirLanguages = useMemo(
    () => enabledLanguages.filter((item) => item.site?.site_mode !== 'standalone'),
    [enabledLanguages]
  )
  const standaloneLanguages = useMemo(
    () => languages.filter((item) => item.site?.site_mode === 'standalone'),
    [languages]
  )
  const subdirLanguages = useMemo(
    () => languages.filter((item) => item.site?.site_mode !== 'standalone'),
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

  const animateGeneratedPageCount = () => {
    const distance = generatedPageTargetRef.current - generatedPageDisplayRef.current
    if (distance === 0) {
      generatedPageAnimationRef.current = null
      return
    }

    const step = Math.sign(distance) * Math.max(1, Math.ceil(Math.abs(distance) / 24))
    const nextCount = distance > 0
      ? Math.min(generatedPageDisplayRef.current + step, generatedPageTargetRef.current)
      : Math.max(generatedPageDisplayRef.current + step, generatedPageTargetRef.current)
    generatedPageDisplayRef.current = nextCount
    setGeneratedPageCount(nextCount)
    generatedPageAnimationRef.current = window.requestAnimationFrame(animateGeneratedPageCount)
  }

  const adjustGeneratedPageCount = (adjustment: number) => {
    generatedPageTargetRef.current = Math.max(generatedPageTargetRef.current + adjustment, 0)
    if (generatedPageAnimationRef.current === null) {
      generatedPageAnimationRef.current = window.requestAnimationFrame(animateGeneratedPageCount)
    }
  }

  const resetGeneratedPageCount = () => {
    if (generatedPageAnimationRef.current !== null) {
      window.cancelAnimationFrame(generatedPageAnimationRef.current)
    }
    generatedPageAnimationRef.current = null
    generatedPageTargetRef.current = 0
    generatedPageDisplayRef.current = 0
    setGeneratedPageCount(0)
  }

  useEffect(() => () => {
    if (generatedPageAnimationRef.current !== null) {
      window.cancelAnimationFrame(generatedPageAnimationRef.current)
    }
  }, [])

  const runBuildStream = (section: string, languageCode?: string) => {
    let currentTargetWrittenFiles = 0

    return staticGenerationApi.buildStream(
      section,
      {
        onProgress: (event) => {
          if (event.type === 'target_started') {
            currentTargetWrittenFiles = 0
            return
          }
          if (event.type === 'file_written' && event.target) {
            currentTargetWrittenFiles += 1
            adjustGeneratedPageCount(1)
            return
          }
          if (event.type === 'target_completed' && typeof event.filesWritten === 'number') {
            const countAdjustment = Math.max(event.filesWritten, 0) - currentTargetWrittenFiles
            if (countAdjustment !== 0) {
              adjustGeneratedPageCount(countAdjustment)
            }
            currentTargetWrittenFiles = 0
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
    )
  }

  const buildMutation = useMutation({
    mutationFn: ({ section, languageCode }: { section: string; languageCode?: string }) =>
      runBuildStream(section, languageCode),
    onSuccess: (data) => {
      if (data.success) {
        setLastBuild(data)
        const buildScope = data.languageCode
          ? `语言 ${getLanguageDisplayName(languages.find((item) => item.code === data.languageCode), data.languageCode)}`
          : '全部已启用语言'
        toast.success(`生成成功：${buildScope}，文件数：${data.totalFiles || 0}，记录数：${data.totalRecords || 0}`)
      } else {
        toast.error(data.message || '生成失败')
      }
      setBuilding(false)
      setActiveBuildAction(null)
      resetGeneratedPageCount()
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '生成失败'))
      setBuilding(false)
      setActiveBuildAction(null)
      resetGeneratedPageCount()
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

  const handleBuild = (section: string, languageCode: string | undefined, actionKey: string) => {
    if (languageCode) {
      const language = languages.find((item) => item.code === languageCode)
      if (language && Number(language.is_enabled || 0) !== 1) {
        toast.error(`语言 ${getLanguageDisplayName(language)} 已停用，不能生成`)
        return
      }
    }
    setBuilding(true)
    setActiveBuildAction(actionKey)
    resetGeneratedPageCount()
    setLastBuild(null)
    buildMutation.mutate({ section, languageCode })
  }

  const handleBuildLanguageGroup = async (targetLanguages: Language[], label: string, actionKey: string) => {
    if (targetLanguages.length === 0) {
      toast.error(`当前没有启用的${label}`)
      return
    }

    setBuilding(true)
    setActiveBuildAction(actionKey)
    resetGeneratedPageCount()
    setLastBuild(null)

    const languageBuilds: NonNullable<NonNullable<BuildResult['result']>['languageBuilds']> = []
    let totalFiles = 0
    let totalRecords = 0

    try {
      for (const language of targetLanguages) {
        const result = await runBuildStream('all', language.code)
        totalFiles += result.totalFiles || 0
        totalRecords += result.totalRecords || 0
        languageBuilds.push(...(result.result?.languageBuilds || []))
      }

      const combinedResult: BuildResult = {
        success: true,
        totalFiles,
        totalRecords,
        languageCode: null,
        result: { languageBuilds },
      }
      setLastBuild(combinedResult)
      toast.success(`${label}生成成功：${targetLanguages.length} 个语言，文件数：${totalFiles}，记录数：${totalRecords}`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, `${label}生成失败`))
    } finally {
      setBuilding(false)
      setActiveBuildAction(null)
      resetGeneratedPageCount()
    }
  }

  const getBuildButtonLabel = (label: string, actionKey: string) => (
    activeBuildAction === actionKey ? `${label} ${generatedPageCount}` : label
  )

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="space-y-4 pb-4">
        <Card>
        <CardContent className="space-y-6">
          <LanguageOutputGroup
            title="独立站点"
            languages={standaloneLanguages}
            building={building}
            action={(
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBuildLanguageGroup(enabledStandaloneLanguages, '独立站点', 'standalone-all')}
                  disabled={building || enabledStandaloneLanguages.length === 0}
                >
                  {getBuildButtonLabel('全部生成', 'standalone-all')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleBuild('all', undefined, 'all-sites')}
                  disabled={building}
                >
                  {getBuildButtonLabel('生成全站', 'all-sites')}
                </Button>
              </>
            )}
            onBuildLanguage={(languageCode) => handleBuild('all', languageCode, `language:${languageCode}`)}
            getBuildButtonLabel={getBuildButtonLabel}
          />
          <LanguageOutputGroup
            title="子站点"
            languages={subdirLanguages}
            building={building}
            action={(
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBuildLanguageGroup(enabledSubdirLanguages, '子站点', 'subdir-all')}
                disabled={building || enabledSubdirLanguages.length === 0}
              >
                {getBuildButtonLabel('全部生成', 'subdir-all')}
              </Button>
            )}
            onBuildLanguage={(languageCode) => handleBuild('all', languageCode, `language:${languageCode}`)}
            getBuildButtonLabel={getBuildButtonLabel}
          />
          {outputDirConflicts.length > 0 ? (
            <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              存在语言输出目录冲突，以下语言会互相覆盖：
              {outputDirConflicts.map(([outputDir, conflictLanguages]) => (
                <div key={outputDir}>
                  <code className="mx-1 rounded bg-white px-1.5 py-0.5 text-xs">{outputDir}</code>
                  {conflictLanguages.map((item) => getLanguageDisplayName(item)).join(' / ')}
                </div>
              ))}
            </div>
          ) : null}

          <div className="pt-4 border-t space-y-3">
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
                    <Badge variant="outline">
                      {getLanguageDisplayName(
                        languages.find((language) => language.code === item.languageCode),
                        item.languageCode
                      )}
                    </Badge>
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

function LanguageOutputGroup({
  title,
  languages,
  building,
  action,
  onBuildLanguage,
  getBuildButtonLabel,
}: {
  title: string
  languages: Language[]
  building: boolean
  action?: ReactNode
  onBuildLanguage: (languageCode: string) => void
  getBuildButtonLabel: (label: string, actionKey: string) => string
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Badge variant="outline">{languages.length}</Badge>
        {action}
      </div>
      {languages.length > 0 ? (
        <div className="grid w-full max-w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 md:w-fit md:grid-cols-[7rem_3.5rem_fit-content(24rem)_auto]">
          {languages.map((language) => {
            const disabled = Number(language.is_enabled || 0) !== 1
            const outputDir = language.site?.output_dir || 'html'
            const targetUrl = getLanguageTargetUrl(language)
            return (
              <div
                key={language.id}
                className="col-span-full grid min-h-11 grid-cols-subgrid items-center gap-y-2 border-t py-2 text-sm first:border-t-0"
              >
                <Badge
                  className="w-fit max-w-full truncate"
                  variant={language.is_default ? 'default' : 'outline'}
                  title={getLanguageDisplayName(language)}
                >
                  {getLanguageDisplayName(language)}
                </Badge>
                <div className="flex min-h-5 items-center">
                  {disabled ? <Badge variant="secondary">停用</Badge> : null}
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 text-muted-foreground">输出到</span>
                  {targetUrl ? (
                    <a
                      className="min-w-0 truncate rounded bg-muted px-2 py-0.5 font-mono text-xs text-primary underline-offset-4 hover:underline"
                      href={targetUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={`打开目标网站：${targetUrl}`}
                    >
                      {outputDir}
                    </a>
                  ) : (
                    <code className="min-w-0 truncate rounded bg-muted px-2 py-0.5 text-xs" title={outputDir}>
                      {outputDir}
                    </code>
                  )}
                </div>
                <Button
                  className="justify-self-end"
                  size="sm"
                  variant="outline"
                  onClick={() => onBuildLanguage(language.code)}
                  disabled={building || disabled}
                >
                  {getBuildButtonLabel('生成', `language:${language.code}`)}
                </Button>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">暂无语言</div>
      )}
    </div>
  )
}

function getLanguageDisplayName(language?: Language | null, fallbackCode = '') {
  return language?.name || language?.native_name || language?.code || fallbackCode || '未知语言'
}

function getLanguageTargetUrl(language: Language) {
  const site = language.site
  if (!site) {
    return ''
  }

  const devHost = getDevPreviewHost(site.bind_host)
  const siteMode = String(site.site_mode || '').trim()

  if (siteMode === 'standalone') {
    const port = Number(site.access_port || 0) || DEFAULT_DEV_SITE_PORT
    return `http://${devHost}:${port}/`
  }

  const pathPrefix = normalizePathPrefix(site.path_prefix)
  return `http://${devHost}:${DEFAULT_DEV_SITE_PORT}${pathPrefix === '/' ? '/' : `${pathPrefix}/`}`
}

function getDevPreviewHost(bindHost?: string | null) {
  const host = String(bindHost || '').trim()
  if (host && host !== '0.0.0.0' && host !== '::') {
    return host
  }

  if (typeof window !== 'undefined' && window.location.hostname) {
    return window.location.hostname
  }

  return '127.0.0.1'
}

function normalizePathPrefix(value?: string | null) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === '/') {
    return '/'
  }
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized}`
  return withLeadingSlash.replace(/\/+$/g, '')
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
