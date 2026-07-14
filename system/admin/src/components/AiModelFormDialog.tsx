import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Save } from 'lucide-react'
import { aiModelsApi } from '@/api/ai-models'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { toast } from 'sonner'
import type { AiModelConfig } from '@/types'

type FormState = {
  name: string
  base_url: string
  api_key: string
  model: string
  image_model: string
  reasoning_effort: 'low' | 'medium' | 'high'
  is_enabled: boolean
  is_default: boolean
}

const EMPTY_FORM: FormState = {
  name: '',
  base_url: '',
  api_key: '',
  model: '',
  image_model: '',
  reasoning_effort: 'medium',
  is_enabled: true,
  is_default: false,
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  model?: AiModelConfig
}

export default function AiModelFormDialog({ open, onOpenChange, model }: Props) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(() => createInitialForm(model))
  const [showApiKey, setShowApiKey] = useState(false)
  const isEditing = Boolean(model?.id)

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) {
        throw new Error('请输入配置名称')
      }
      if (!form.model.trim()) {
        throw new Error('请输入模型名称')
      }
      if (!isEditing && !form.api_key.trim()) {
        throw new Error('请输入 API Key')
      }

      const payload = {
        name: form.name.trim(),
        provider: 'openai_compatible' as const,
        base_url: form.base_url.trim(),
        api_key: form.api_key.trim(),
        model: form.model.trim(),
        image_model: form.image_model.trim(),
        reasoning_effort: form.reasoning_effort,
        is_enabled: form.is_enabled ? 1 : 0,
        is_default: form.is_default ? 1 : 0,
      }

      return isEditing && model
        ? aiModelsApi.update(model.id, payload)
        : aiModelsApi.create(payload)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['ai-models'] })
      await queryClient.invalidateQueries({ queryKey: ['ai-capabilities'] })
      toast.success(isEditing ? '模型配置已更新' : '模型配置已创建')
      onOpenChange(false)
    },
    onError: (error: unknown) => {
      toast.error(getApiErrorMessage(error, '模型配置保存失败'))
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? '编辑模型配置' : '新增模型配置'}</DialogTitle>
          <DialogDescription>
            配置 OpenAI 兼容接口、默认文本模型、图片模型和思考程度。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ai-model-name">配置名称</Label>
            <Input
              id="ai-model-name"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="例如：生产 GPT-5"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model-provider">接口协议</Label>
            <Input id="ai-model-provider" value="OpenAI 兼容接口" disabled />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ai-model-base-url">Base URL</Label>
            <Input
              id="ai-model-base-url"
              value={form.base_url}
              onChange={(event) => setForm((current) => ({ ...current, base_url: event.target.value }))}
              placeholder="留空使用 OpenAI 官方地址，或填写 https://example.com/v1"
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ai-model-api-key">API Key</Label>
            <div className="relative">
              <Input
                id="ai-model-api-key"
                type={showApiKey ? 'text' : 'password'}
                value={form.api_key}
                onChange={(event) => setForm((current) => ({ ...current, api_key: event.target.value }))}
                placeholder={isEditing ? `留空保留现有密钥（${model?.masked_api_key || '已配置'}）` : '请输入 API Key'}
                className="pr-10"
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-8 w-8"
                onClick={() => setShowApiKey((value) => !value)}
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            {isEditing ? <p className="text-xs text-muted-foreground">只有输入新值时才会替换现有密钥。</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model-model">文本模型</Label>
            <Input
              id="ai-model-model"
              value={form.model}
              onChange={(event) => setForm((current) => ({ ...current, model: event.target.value }))}
              placeholder="例如：gpt-5"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ai-model-image-model">图片模型</Label>
            <Input
              id="ai-model-image-model"
              value={form.image_model}
              onChange={(event) => setForm((current) => ({ ...current, image_model: event.target.value }))}
              placeholder="可选，例如：gpt-image-1"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-model-reasoning">思考程度</Label>
            <Select
              value={form.reasoning_effort}
              onValueChange={(value: 'low' | 'medium' | 'high') => (
                setForm((current) => ({ ...current, reasoning_effort: value }))
              )}
            >
              <SelectTrigger id="ai-model-reasoning">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="medium">中</SelectItem>
                <SelectItem value="high">高</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <div>
              <Label htmlFor="ai-model-enabled">启用模型</Label>
              <p className="text-xs text-muted-foreground">停用后不能设为默认模型。</p>
            </div>
            <Switch
              id="ai-model-enabled"
              checked={form.is_enabled}
              disabled={form.is_default}
              onCheckedChange={(checked) => setForm((current) => ({ ...current, is_enabled: checked }))}
            />
          </div>

          {!isEditing ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 sm:col-span-2">
              <div>
                <Label htmlFor="ai-model-default">设为默认模型</Label>
                <p className="text-xs text-muted-foreground">首个模型会自动成为默认模型。</p>
              </div>
              <Switch
                id="ai-model-default"
                checked={form.is_default}
                onCheckedChange={(checked) => setForm((current) => ({
                  ...current,
                  is_default: checked,
                  is_enabled: checked ? true : current.is_enabled,
                }))}
              />
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveMutation.isPending ? '保存中...' : '保存配置'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function createInitialForm(model?: AiModelConfig): FormState {
  if (!model) {
    return EMPTY_FORM
  }
  return {
    name: model.name || '',
    base_url: model.base_url || '',
    api_key: '',
    model: model.model || '',
    image_model: model.image_model || '',
    reasoning_effort: model.reasoning_effort || 'medium',
    is_enabled: Number(model.is_enabled || 0) === 1,
    is_default: Number(model.is_default || 0) === 1,
  }
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const value = error && typeof error === 'object'
    ? error as { response?: { data?: { message?: string } }; message?: string }
    : null
  return value?.response?.data?.message || value?.message || fallback
}
