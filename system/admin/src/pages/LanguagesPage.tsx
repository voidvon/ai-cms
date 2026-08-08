import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Globe2, Plus, Trash2 } from 'lucide-react'
import { languagesApi } from '@/api/languages'
import apiClient from '@/api/client'
import LanguageForm from '@/components/LanguageForm'
import { Badge } from '@/components/ui/badge'
import { AdminButton as Button } from '@/components/AdminButton'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { ApiResponse, Language, SiteConfig } from '@/types'

const CREATE_LANGUAGE_VALUE = 'new'

export default function LanguagesPage() {
  const queryClient = useQueryClient()
  const [selectedLanguageId, setSelectedLanguageId] = useState<string>('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingLanguage, setDeletingLanguage] = useState<Language | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = useMemo(() => {
    return [...(data?.data || [])].sort((left, right) => {
      const orderDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0)
      return orderDifference || Number(left.id || 0) - Number(right.id || 0)
    })
  }, [data?.data])
  const defaultLanguageCode = languages.find((language) => language.is_default === 1)?.code || 'zh-CN'
  const fallbackLanguage = languages.find((language) => language.is_fallback === 1)
  const fallbackLanguageCode = fallbackLanguage?.code || defaultLanguageCode

  const { data: siteConfigData, isLoading: siteConfigLoading, error: siteConfigError } = useQuery({
    queryKey: ['site-config', defaultLanguageCode, fallbackLanguageCode],
    enabled: languages.length > 0,
    queryFn: async () => {
      const response = await apiClient.get<ApiResponse<SiteConfig>>('/site-config', {
        params: { language: defaultLanguageCode, include_translations: 1 },
      })
      return response.data
    },
  })
  const siteConfigTranslations = siteConfigData?.data?.translations || {}

  const selectionExists = languages.some((language) => String(language.id) === selectedLanguageId)
  const effectiveSelectedLanguageId = selectedLanguageId === CREATE_LANGUAGE_VALUE || selectionExists
    ? selectedLanguageId
    : languages[0] ? String(languages[0].id) : CREATE_LANGUAGE_VALUE
  const selectedLanguage = languages.find((language) => String(language.id) === effectiveSelectedLanguageId)
  const isCreating = effectiveSelectedLanguageId === CREATE_LANGUAGE_VALUE

  const deleteMutation = useMutation({
    mutationFn: (id: number) => languagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['languages'] })
      setDeleteDialogOpen(false)
      setDeletingLanguage(null)
      setSelectedLanguageId('')
      toast.success('语言已删除')
    },
    onError: (mutationError: unknown) => {
      toast.error(resolveApiErrorMessage(mutationError, '删除失败'))
    },
  })

  const handleDelete = (language: Language) => {
    setDeletingLanguage(language)
    setDeleteDialogOpen(true)
  }

  if (isLoading || siteConfigLoading) {
    return <div>加载中...</div>
  }

  if (error) {
    return <div>加载失败: {(error as Error).message}</div>
  }

  if (siteConfigError) {
    return <div>网站语言配置加载失败: {(siteConfigError as Error).message}</div>
  }

  return (
    <div className="h-[calc(100vh-6rem)] min-h-0">
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">多语言</CardTitle>
                <CardDescription>选择语言后编辑站点配置。</CardDescription>
              </div>
              <Button
                type="button"
                size="icon"
                variant="outline"
                onClick={() => setSelectedLanguageId(CREATE_LANGUAGE_VALUE)}
                aria-label="新增语言"
                title="新增语言"
              >
                <Plus />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto px-3 pb-3">
            <div className="space-y-1">
              {languages.map((language) => {
                const selected = String(language.id) === effectiveSelectedLanguageId
                return (
                  <button
                    key={language.id}
                    type="button"
                    onClick={() => setSelectedLanguageId(String(language.id))}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-md border px-3 py-3 text-left transition-colors',
                      selected ? 'border-primary bg-accent' : 'border-transparent hover:bg-accent/60'
                    )}
                  >
                    <Globe2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{language.name}</span>
                        {language.is_default ? <Badge className="shrink-0">后台</Badge> : null}
                        {language.is_fallback ? <Badge variant="outline" className="shrink-0">兜底</Badge> : null}
                        {language.site?.is_primary ? <Badge variant="outline" className="shrink-0">主站</Badge> : null}
                        {!language.is_enabled ? <Badge variant="secondary" className="shrink-0">停用</Badge> : null}
                      </span>
                      <span className="mt-1 block truncate text-xs text-muted-foreground">
                        {language.code} · {language.site.site_mode === 'standalone' ? '独立站点' : '子目录站点'}
                      </span>
                    </span>
                    {selected ? <Check className="mt-0.5 size-4 shrink-0 text-primary" /> : null}
                  </button>
                )
              })}
              {languages.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">暂无语言配置</div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="flex min-h-0 flex-col">
          <CardHeader className="shrink-0 border-b">
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle>{isCreating ? '新增语言' : selectedLanguage?.name || '语言配置'}</CardTitle>
                <CardDescription>
                  {isCreating ? '配置语言标识、多站点模式和发布目录。' : `编辑 ${selectedLanguage?.code || ''} 的语言和部署设置。`}
                </CardDescription>
              </div>
              {selectedLanguage && !selectedLanguage.is_default && !selectedLanguage.is_fallback && !selectedLanguage.site?.is_primary ? (
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => handleDelete(selectedLanguage)}
                  aria-label={`删除 ${selectedLanguage.name}`}
                  title="删除语言"
                >
                  <Trash2 />
                </Button>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-auto pt-6">
            {isCreating ? (
              <LanguageForm
                mode="create"
                siteConfigTranslations={siteConfigTranslations}
                fallbackLanguageCode={fallbackLanguageCode}
                fallbackLanguageName={fallbackLanguage?.name || fallbackLanguageCode}
                onCancel={() => setSelectedLanguageId(languages[0] ? String(languages[0].id) : CREATE_LANGUAGE_VALUE)}
                onSaved={(language) => setSelectedLanguageId(String(language.id))}
              />
            ) : selectedLanguage ? (
              <LanguageForm
                key={selectedLanguage.id}
                mode="edit"
                language={selectedLanguage}
                siteConfigTranslations={siteConfigTranslations}
                fallbackLanguageCode={fallbackLanguageCode}
                fallbackLanguageName={fallbackLanguage?.name || fallbackLanguageCode}
                onSaved={(language) => setSelectedLanguageId(String(language.id))}
              />
            ) : (
              <div className="flex h-full min-h-48 items-center justify-center text-sm text-muted-foreground">
                请从左侧选择语言。
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除语言 {deletingLanguage?.name} 吗？此操作不会删除现有内容主表，但会影响后续多语言发布。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingLanguage && deleteMutation.mutate(deletingLanguage.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? '删除中...' : '确定'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function resolveApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== 'object' || error === null || !('response' in error)) {
    return fallback
  }
  const response = (error as { response?: { data?: { message?: unknown } } }).response
  return typeof response?.data?.message === 'string' ? response.data.message : fallback
}
