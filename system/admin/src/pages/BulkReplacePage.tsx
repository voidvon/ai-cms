import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { bulkReplaceApi } from '@/api/bulk-replace'
import { languagesApi } from '@/api/languages'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
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
import type {
  BulkReplaceExecutePayload,
  BulkReplaceFieldOption,
  BulkReplaceMatchItem,
  BulkReplacePreviewPayload,
  BulkReplaceResult,
  Language,
} from '@/types'

const CONTENT_MAIN_SCOPE = 'content_main'
const CONTENT_TRANSLATION_SCOPE = 'content_translation'

export default function BulkReplacePage() {
  const [target, setTarget] = useState<'content' | 'template'>('content')
  const [contentScope, setContentScope] = useState<'content_main' | 'content_translation'>(CONTENT_TRANSLATION_SCOPE)
  const [modelCode, setModelCode] = useState('')
  const [fieldName, setFieldName] = useState('')
  const [languageCode, setLanguageCode] = useState('')
  const [templateField, setTemplateField] = useState('tsx_source')
  const [templateType, setTemplateType] = useState('all')
  const [search, setSearch] = useState('')
  const [replace, setReplace] = useState('')
  const [matchMode, setMatchMode] = useState<'plain' | 'regex'>('plain')
  const [replaceMode, setReplaceMode] = useState<'replace' | 'overwrite'>('replace')
  const [matchCase, setMatchCase] = useState(false)
  const [previewResult, setPreviewResult] = useState<BulkReplaceResult | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const { data: optionsData, isLoading: optionsLoading } = useQuery({
    queryKey: ['bulk-replace-options'],
    queryFn: () => bulkReplaceApi.options(),
  })
  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const contentModels = optionsData?.data?.contentModels || []
  const selectedModel = useMemo(
    () => contentModels.find((item) => item.code === modelCode) || contentModels[0] || null,
    [contentModels, modelCode]
  )
  const fieldOptions = useMemo<BulkReplaceFieldOption[]>(() => {
    if (!selectedModel) {
      return []
    }
    return contentScope === CONTENT_MAIN_SCOPE ? selectedModel.mainFields : selectedModel.translationFields
  }, [selectedModel, contentScope])
  const enabledLanguages = useMemo(
    () => (languagesData?.data || []).filter((item: Language) => Number(item.is_enabled || 0) === 1),
    [languagesData]
  )

  const previewMutation = useMutation({
    mutationFn: (payload: BulkReplacePreviewPayload) => bulkReplaceApi.preview(payload),
    onSuccess: (response) => {
      setPreviewResult(response.data || null)
      toast.success(`预览完成，命中 ${response.data?.total_rows || 0} 条记录`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '预览失败'))
    },
  })

  const executeMutation = useMutation({
    mutationFn: (payload: BulkReplaceExecutePayload) => bulkReplaceApi.execute(payload),
    onSuccess: (response) => {
      setPreviewResult(response.data || null)
      setConfirmOpen(false)
      toast.success(`批量替换完成，影响 ${response.data?.total_rows || 0} 条记录`)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '执行失败'))
    },
  })

  const isBusy = previewMutation.isPending || executeMutation.isPending

  const effectiveModelCode = modelCode || selectedModel?.code || ''
  const effectiveFieldName = fieldName || fieldOptions[0]?.field_name || ''

  const buildPayload = (): BulkReplacePreviewPayload => ({
    target,
    scope: target === 'content' ? contentScope : undefined,
    model_code: target === 'content' ? effectiveModelCode : undefined,
    field_name: target === 'content' ? effectiveFieldName : undefined,
    language_code: target === 'content' && contentScope === CONTENT_TRANSLATION_SCOPE && languageCode ? languageCode : undefined,
    template_field: target === 'template' ? templateField : undefined,
    template_type: target === 'template' && templateType !== 'all' ? templateType : undefined,
    search,
    replace,
    match_mode: matchMode,
    replace_mode: replaceMode,
    match_case: matchCase,
  })

  const handlePreview = () => {
    const payload = buildPayload()
    previewMutation.mutate(payload)
  }

  const handleExecute = () => {
    executeMutation.mutate({
      ...buildPayload(),
      confirm_execution: true,
    })
  }

  if (optionsLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="h-full overflow-y-auto pr-1">
      <div className="space-y-4 pb-4">
        <Card>
          <CardHeader>
            <CardTitle>批量替换</CardTitle>
            <CardDescription>
              参考帝国 CMS 的批量替换思路，但这里直接作用数据库真源，不在静态生成阶段做全文兜底。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs
              value={target}
              onValueChange={(value) => {
                setTarget(value as 'content' | 'template')
                setPreviewResult(null)
              }}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="content">内容字段替换</TabsTrigger>
                <TabsTrigger value="template">模板源码替换</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>字段作用域</Label>
                    <Select
                      value={contentScope}
                      onValueChange={(value) => {
                        setContentScope(value as 'content_main' | 'content_translation')
                        setFieldName('')
                        setPreviewResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={CONTENT_MAIN_SCOPE}>主表字段</SelectItem>
                        <SelectItem value={CONTENT_TRANSLATION_SCOPE}>翻译字段</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>内容模型</Label>
                    <Select
                      value={effectiveModelCode}
                      onValueChange={(value) => {
                        setModelCode(value)
                        setFieldName('')
                        setPreviewResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择内容模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {contentModels.map((item) => (
                          <SelectItem key={item.code} value={item.code}>
                            {item.name} ({item.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>字段</Label>
                    <Select
                      value={effectiveFieldName}
                      onValueChange={(value) => {
                        setFieldName(value)
                        setPreviewResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="请选择字段" />
                      </SelectTrigger>
                      <SelectContent>
                        {fieldOptions.map((item) => (
                          <SelectItem key={item.field_name} value={item.field_name}>
                            {item.field_label} ({item.field_name})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>语言</Label>
                    <Select
                      value={languageCode || 'all'}
                      onValueChange={(value) => {
                        setLanguageCode(value === 'all' ? '' : value)
                        setPreviewResult(null)
                      }}
                      disabled={contentScope !== CONTENT_TRANSLATION_SCOPE}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">所有语言</SelectItem>
                        {enabledLanguages.map((item) => (
                          <SelectItem key={item.id} value={item.code}>
                            {item.name} ({item.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="template" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>模板字段</Label>
                    <Select
                      value={templateField}
                      onValueChange={(value) => {
                        setTemplateField(value)
                        setPreviewResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(optionsData?.data?.templateFields || []).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>模板类型</Label>
                    <Select
                      value={templateType}
                      onValueChange={(value) => {
                        setTemplateType(value)
                        setPreviewResult(null)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部类型</SelectItem>
                        {(optionsData?.data?.templateTypes || []).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="search">原字符 / 表达式</Label>
                <Textarea
                  id="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={replaceMode === 'overwrite' ? '覆盖模式下可留空' : '输入待替换内容'}
                  className="min-h-[120px]"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="replace">新字符</Label>
                <Textarea
                  id="replace"
                  value={replace}
                  onChange={(event) => setReplace(event.target.value)}
                  placeholder="输入替换后的内容"
                  className="min-h-[120px]"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>匹配方式</Label>
                <Select
                  value={matchMode}
                  onValueChange={(value) => {
                    setMatchMode(value as 'plain' | 'regex')
                    setPreviewResult(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="plain">普通文本</SelectItem>
                    <SelectItem value="regex">正则表达式</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>更新方式</Label>
                <Select
                  value={replaceMode}
                  onValueChange={(value) => {
                    setReplaceMode(value as 'replace' | 'overwrite')
                    setPreviewResult(null)
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="replace">替换命中内容</SelectItem>
                    <SelectItem value="overwrite">整字段覆盖</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="match_case">大小写敏感</Label>
                <button
                  id="match_case"
                  type="button"
                  onClick={() => {
                    setMatchCase((current) => !current)
                    setPreviewResult(null)
                  }}
                  className={`flex h-10 w-full items-center justify-between rounded-md border px-3 text-sm ${
                    matchCase ? 'border-foreground' : 'border-input text-muted-foreground'
                  }`}
                >
                  <span>{matchCase ? '区分大小写' : '忽略大小写'}</span>
                  <Badge variant={matchCase ? 'default' : 'outline'}>{matchCase ? 'ON' : 'OFF'}</Badge>
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handlePreview} disabled={isBusy}>
                {previewMutation.isPending ? '预览中...' : '预览命中'}
              </Button>
              <Button
                variant="destructive"
                disabled={isBusy || !previewResult || previewResult.total_rows === 0}
                onClick={() => setConfirmOpen(true)}
              >
                {executeMutation.isPending ? '执行中...' : '执行替换'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>预览结果</CardTitle>
            <CardDescription>
              先看命中统计与样例，再决定是否执行。这里只展示前 50 条样例。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {previewResult ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">命中记录 {previewResult.total_rows}</Badge>
                  <Badge variant="outline">命中次数 {previewResult.total_hits}</Badge>
                  {previewResult.target === 'content' && previewResult.model_name ? (
                    <Badge variant="outline">{previewResult.model_name}</Badge>
                  ) : null}
                  {previewResult.field_label ? (
                    <Badge variant="outline">{previewResult.field_label}</Badge>
                  ) : null}
                  {previewResult.template_field ? (
                    <Badge variant="outline">{previewResult.template_field}</Badge>
                  ) : null}
                </div>

                <div className="rounded border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>附加信息</TableHead>
                        <TableHead>命中前</TableHead>
                        <TableHead>替换后</TableHead>
                        <TableHead>次数</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewResult.matches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center">
                            没有命中
                          </TableCell>
                        </TableRow>
                      ) : (
                        previewResult.matches.map((item) => (
                          <PreviewRow key={`${item.id}-${item.language_code || item.code || ''}`} item={item} />
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="text-sm text-muted-foreground">尚未执行预览。</div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认执行批量替换</AlertDialogTitle>
            <AlertDialogDescription>
              这会直接修改数据库真源，不会改 `html/` 产物。当前预览命中 {previewResult?.total_rows || 0} 条记录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleExecute}>确认执行</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function PreviewRow({ item }: { item: BulkReplaceMatchItem }) {
  return (
    <TableRow>
      <TableCell>{item.id}</TableCell>
      <TableCell className="max-w-[220px] whitespace-pre-wrap break-words text-xs text-muted-foreground">
        {item.language_code ? `语言: ${item.language_code}` : ''}
        {item.name ? `\n名称: ${item.name}` : ''}
        {item.code ? `\n编码: ${item.code}` : ''}
        {item.type ? `\n类型: ${item.type}` : ''}
      </TableCell>
      <TableCell className="max-w-[320px] whitespace-pre-wrap break-words text-xs">{item.before_excerpt}</TableCell>
      <TableCell className="max-w-[320px] whitespace-pre-wrap break-words text-xs">{item.after_excerpt}</TableCell>
      <TableCell>{item.hit_count}</TableCell>
    </TableRow>
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
