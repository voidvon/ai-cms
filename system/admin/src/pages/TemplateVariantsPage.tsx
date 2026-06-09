import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { templatesApi } from '@/api/advanced'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { TemplateCodeEditor } from '@/components/TemplateCodeEditor'
import { TemplateVariableReference } from '@/components/TemplateVariableReference'
import { toast } from 'sonner'
import type { Template } from '@/types'

const templateTypes: Array<{ value: Template['type']; label: string; description: string }> = [
  { value: 'home', label: '首页模板', description: '生成首页' },
  { value: 'list', label: '列表模板', description: '生成栏目和分页列表' },
  { value: 'content', label: '内容模板', description: '生成详情、单页和表单页面' },
  { value: 'component', label: '组件模板', description: '头部、底部、导航和公共片段' },
]

type TemplateForm = Pick<Template, 'name' | 'code' | 'type' | 'engine' | 'content' | 'sort_order'>

export default function TemplateVariantsPage() {
  const queryClient = useQueryClient()
  const [activeType, setActiveType] = useState<Template['type']>('home')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [formData, setFormData] = useState<TemplateForm>({
    name: '',
    code: '',
    type: 'home',
    engine: 'html',
    content: '',
    sort_order: 0,
  })
  const { data, isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => templatesApi.list(),
  })

  const templates = data?.data || []
  const filteredTemplates = useMemo(
    () => templates.filter((item) => item.type === activeType),
    [templates, activeType],
  )
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === selectedId) || filteredTemplates[0] || null,
    [templates, selectedId, filteredTemplates],
  )

  useEffect(() => {
    if (!selectedTemplate) {
      setSelectedId(null)
      setFormData({ name: '', code: '', type: activeType, engine: 'html', content: '', sort_order: 0 })
      return
    }
    if (selectedTemplate.id !== selectedId) {
      setSelectedId(selectedTemplate.id)
    }
    setFormData({
      name: selectedTemplate.name,
      code: selectedTemplate.code,
      type: selectedTemplate.type,
      engine: selectedTemplate.engine || 'html',
      content: selectedTemplate.content || '',
      sort_order: selectedTemplate.sort_order || 0,
    })
  }, [activeType, selectedId, selectedTemplate])

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!selectedTemplate) {
        throw new Error('未选择模板')
      }
      return templatesApi.update(selectedTemplate.id, formData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('模板已保存为草稿')
    },
    onError: () => toast.error('保存失败'),
  })

  const publishMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) {
        throw new Error('未选择模板')
      }
      await templatesApi.update(selectedTemplate.id, formData)
      return templatesApi.publish(selectedTemplate.id)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      toast.success('模板已发布')
    },
    onError: () => toast.error('发布失败'),
  })

  const createMutation = useMutation({
    mutationFn: () => {
      const code = `${activeType}_${Date.now()}`
      return templatesApi.create({
        name: '新模板',
        code,
        type: activeType,
        engine: 'html',
        content: '',
        sort_order: filteredTemplates.length + 1,
      })
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ['templates'] })
      if (response.data?.id) {
        setSelectedId(response.data.id)
      }
      toast.success('模板已创建')
    },
    onError: () => toast.error('创建失败'),
  })

  if (isLoading) {
    return <div>加载中...</div>
  }

  const selectedTypeInfo = templateTypes.find((item) => item.value === activeType)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>模板管理</CardTitle>
              <CardDescription>按首页、列表、内容、组件四类管理数据库模板。静态生成只读取已发布模板。</CardDescription>
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              新增模板
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 md:grid-cols-4">
            {templateTypes.map((type) => (
              <button
                key={type.value}
                type="button"
                onClick={() => {
                  setActiveType(type.value)
                  setSelectedId(null)
                }}
                className={`rounded border p-3 text-left transition-colors ${activeType === type.value ? 'border-primary bg-muted' : 'hover:bg-muted/60'}`}
              >
                <div className="font-medium">{type.label}</div>
                <div className="mt-1 text-xs text-muted-foreground">{type.description}</div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>{selectedTypeInfo?.label}</CardTitle>
            <CardDescription>当前分类共 {filteredTemplates.length} 个模板</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={`w-full rounded border p-3 text-left transition-colors ${selectedTemplate?.id === template.id ? 'border-primary bg-muted' : 'hover:bg-muted/60'}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium">{template.name}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">{template.code}</div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Badge variant={template.status === 'published' ? 'default' : 'outline'}>
                        {template.status === 'published' ? '已发布' : '草稿'}
                      </Badge>
                    </div>
                  </div>
                </button>
              ))}
              {filteredTemplates.length === 0 && (
                <div className="rounded border p-6 text-center text-sm text-muted-foreground">暂无模板</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{selectedTemplate ? selectedTemplate.name : '未选择模板'}</CardTitle>
                <CardDescription>
                  使用组件引用和占位符编辑模板，双花括号输出转义文本，三花括号输出 HTML。
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => saveMutation.mutate()} disabled={!selectedTemplate || saveMutation.isPending}>
                  保存草稿
                </Button>
                <Button onClick={() => publishMutation.mutate()} disabled={!selectedTemplate || publishMutation.isPending}>
                  发布
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {selectedTemplate ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-[1fr_220px_150px_120px]">
                  <div className="space-y-2">
                    <Label htmlFor="template-name">模板名称</Label>
                    <Input
                      id="template-name"
                      value={formData.name}
                      onChange={(event) => setFormData({ ...formData, name: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-code">模板编码</Label>
                    <Input
                      id="template-code"
                      value={formData.code}
                      onChange={(event) => setFormData({ ...formData, code: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="template-sort">排序</Label>
                    <Input
                      id="template-sort"
                      type="number"
                      value={formData.sort_order}
                      onChange={(event) => setFormData({ ...formData, sort_order: Number(event.target.value) || 0 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>模板引擎</Label>
                    <Select
                      value={formData.engine}
                      onValueChange={(value) => setFormData({ ...formData, engine: value as Template['engine'] })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="html">HTML 占位符</SelectItem>
                        <SelectItem value="tsx">TSX 组件</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="template-content">模板内容</Label>
                  <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
                    <TemplateCodeEditor
                      id="template-content"
                      value={formData.content}
                      engine={formData.engine}
                      onChange={(content) => setFormData({ ...formData, content })}
                    />
                    <TemplateVariableReference type={formData.type} engine={formData.engine} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded border p-8 text-center text-muted-foreground">请选择或新增模板</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
