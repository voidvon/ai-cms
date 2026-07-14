import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Pencil, Plus, RefreshCw, Star, Trash2 } from 'lucide-react'
import { aiModelsApi } from '@/api/ai-models'
import AiModelFormDialog from '@/components/AiModelFormDialog'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { toast } from 'sonner'
import type { AiModelConfig } from '@/types'

export default function AiModelsPage() {
  const queryClient = useQueryClient()
  const [formOpen, setFormOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<AiModelConfig | undefined>()
  const [deletingModel, setDeletingModel] = useState<AiModelConfig | null>(null)

  const modelsQuery = useQuery({
    queryKey: ['ai-models'],
    queryFn: () => aiModelsApi.list(),
  })

  const models = useMemo(() => modelsQuery.data?.data || [], [modelsQuery.data])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['ai-models'] })
    await queryClient.invalidateQueries({ queryKey: ['ai-capabilities'] })
  }

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => aiModelsApi.setDefault(id),
    onSuccess: async () => {
      await refresh()
      toast.success('默认模型已切换')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '默认模型切换失败')),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ model, checked }: { model: AiModelConfig; checked: boolean }) => (
      aiModelsApi.update(model.id, { is_enabled: checked ? 1 : 0 })
    ),
    onSuccess: async (_, variables) => {
      await refresh()
      toast.success(`${variables.model.name} 已${variables.checked ? '启用' : '停用'}`)
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '模型状态更新失败')),
  })

  const testMutation = useMutation({
    mutationFn: (model: AiModelConfig) => aiModelsApi.test(model.id),
    onSuccess: (response, model) => {
      toast.success(`${model.name} 连接成功，耗时 ${response.data?.duration_ms || 0} ms`)
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '模型连接测试失败')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => aiModelsApi.delete(id),
    onSuccess: async () => {
      await refresh()
      setDeletingModel(null)
      toast.success('模型配置已删除')
    },
    onError: (error: unknown) => toast.error(getApiErrorMessage(error, '模型配置删除失败')),
  })

  const handleCreate = () => {
    setEditingModel(undefined)
    setFormOpen(true)
  }

  const handleEdit = (model: AiModelConfig) => {
    setEditingModel(model)
    setFormOpen(true)
  }

  if (modelsQuery.isLoading) {
    return <div>加载中...</div>
  }

  if (modelsQuery.error) {
    return <div>加载失败: {(modelsQuery.error as Error).message}</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>AI 模型管理</CardTitle>
              <CardDescription>动态配置 OpenAI 兼容接口、默认模型、图片模型和思考程度。</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => void modelsQuery.refetch()} aria-label="刷新模型列表">
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button type="button" onClick={handleCreate}>
                <Plus className="mr-2 h-4 w-4" />
                新增模型
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden overflow-x-auto md:block">
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>配置</TableHead>
                <TableHead>模型</TableHead>
                <TableHead>思考</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {models.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                    暂无模型配置，请先新增一个默认模型。
                  </TableCell>
                </TableRow>
              ) : models.map((model) => (
                <TableRow key={model.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {model.is_default ? <Badge>默认</Badge> : null}
                    </div>
                    <div className="mt-1 max-w-[320px] truncate font-mono text-xs text-muted-foreground">
                      {model.base_url || 'OpenAI 官方接口'}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs">{model.model}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      图片：{model.image_model || '自动选择'}
                    </div>
                  </TableCell>
                  <TableCell>{formatReasoningEffort(model.reasoning_effort)}</TableCell>
                  <TableCell className="font-mono text-xs">{model.masked_api_key || '未配置'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={Number(model.is_enabled || 0) === 1}
                        disabled={Boolean(model.is_default) || toggleMutation.isPending}
                        onCheckedChange={(checked) => toggleMutation.mutate({ model, checked })}
                        aria-label={`切换 ${model.name} 启用状态`}
                      />
                      <span className="text-xs text-muted-foreground">{model.is_enabled ? '启用' : '停用'}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex min-w-[310px] items-center justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={testMutation.isPending}
                        onClick={() => testMutation.mutate(model)}
                      >
                        <CheckCircle2 className="mr-1 h-4 w-4" />
                        测试
                      </Button>
                      {!model.is_default ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={!model.is_enabled || setDefaultMutation.isPending}
                          onClick={() => setDefaultMutation.mutate(model.id)}
                        >
                          <Star className="mr-1 h-4 w-4" />
                          设为默认
                        </Button>
                      ) : null}
                      <Button type="button" variant="ghost" size="sm" onClick={() => handleEdit(model)}>
                        <Pencil className="mr-1 h-4 w-4" />
                        编辑
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={Boolean(model.is_default)}
                        onClick={() => setDeletingModel(model)}
                        aria-label={`删除 ${model.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            </Table>
          </div>

          <div className="divide-y border-y md:hidden">
            {models.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                暂无模型配置，请先新增一个默认模型。
              </div>
            ) : models.map((model) => (
              <div key={model.id} className="space-y-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{model.name}</span>
                      {model.is_default ? <Badge>默认</Badge> : null}
                    </div>
                    <div className="mt-1 break-all font-mono text-xs text-muted-foreground">
                      {model.base_url || 'OpenAI 官方接口'}
                    </div>
                  </div>
                  <Switch
                    checked={Number(model.is_enabled || 0) === 1}
                    disabled={Boolean(model.is_default) || toggleMutation.isPending}
                    onCheckedChange={(checked) => toggleMutation.mutate({ model, checked })}
                    aria-label={`切换 ${model.name} 启用状态`}
                  />
                </div>

                <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
                  <dt className="text-muted-foreground">文本模型</dt>
                  <dd className="break-all font-mono text-xs">{model.model}</dd>
                  <dt className="text-muted-foreground">图片模型</dt>
                  <dd className="break-all text-xs">{model.image_model || '自动选择'}</dd>
                  <dt className="text-muted-foreground">思考程度</dt>
                  <dd>{formatReasoningEffort(model.reasoning_effort)}</dd>
                  <dt className="text-muted-foreground">API Key</dt>
                  <dd className="break-all font-mono text-xs">{model.masked_api_key || '未配置'}</dd>
                </dl>

                <div className="flex flex-wrap items-center gap-1 border-t pt-3">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={testMutation.isPending}
                    onClick={() => testMutation.mutate(model)}
                  >
                    <CheckCircle2 className="mr-1 h-4 w-4" />
                    测试
                  </Button>
                  {!model.is_default ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!model.is_enabled || setDefaultMutation.isPending}
                      onClick={() => setDefaultMutation.mutate(model.id)}
                    >
                      <Star className="mr-1 h-4 w-4" />
                      设为默认
                    </Button>
                  ) : null}
                  <Button type="button" variant="ghost" size="sm" onClick={() => handleEdit(model)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    编辑
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={Boolean(model.is_default)}
                    onClick={() => setDeletingModel(model)}
                    aria-label={`删除 ${model.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {formOpen ? (
        <AiModelFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          model={editingModel}
        />
      ) : null}

      <AlertDialog open={Boolean(deletingModel)} onOpenChange={(open) => !open && setDeletingModel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除模型配置</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除“{deletingModel?.name}”吗？此操作不会删除历史对话，但无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingModel && deleteMutation.mutate(deletingModel.id)}
              disabled={deleteMutation.isPending}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatReasoningEffort(value: AiModelConfig['reasoning_effort']) {
  return { low: '低', medium: '中', high: '高' }[value]
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const value = error && typeof error === 'object'
    ? error as { response?: { data?: { message?: string } }; message?: string }
    : null
  return value?.response?.data?.message || value?.message || fallback
}
