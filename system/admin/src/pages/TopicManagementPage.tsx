import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { columnsApi } from '@/api/columns'
import { languagesApi } from '@/api/languages'
import { topicProfilesApi, type TopicProfile, type TopicProfilePayload } from '@/api/topic-profiles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { buildColumnTreeOptions } from '@/lib/column-options'
import { toast } from 'sonner'
import type { Column } from '@/types'

const EMPTY_PROFILE: TopicProfilePayload = {
  topic_type: '',
  primary_keyword: '',
  keyword_group: '',
  related_columns_json: '[]',
  related_products_json: '[]',
  related_resources_json: '[]',
  related_articles_json: '[]',
  module_config_json: '{}',
  sort_order: 0,
}

export default function TopicManagementPage() {
  const queryClient = useQueryClient()
  const [selectedColumnId, setSelectedColumnId] = useState('')
  const [form, setForm] = useState<TopicProfilePayload>(EMPTY_PROFILE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const defaultLanguageCode = languagesData?.data?.find((item) => item.is_default === 1)?.code || 'zh-CN'

  const { data: columnsData, isLoading: columnsLoading } = useQuery({
    queryKey: ['columns', defaultLanguageCode],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode }),
  })
  const { data: profilesData } = useQuery({
    queryKey: ['topic-profiles', defaultLanguageCode],
    queryFn: () => topicProfilesApi.list({ language: defaultLanguageCode }),
  })

  const columns = columnsData?.data || []
  const topicColumns = useMemo(() => resolveTopicColumns(columns), [columns])
  const topicOptions = useMemo(
    () => buildColumnTreeOptions(topicColumns, { selectableColumnIds: topicColumns.map((column) => column.id) }),
    [topicColumns],
  )
  const profilesByColumnId = useMemo(() => {
    return new Map((profilesData?.data || []).map((profile) => [profile.column_id, profile]))
  }, [profilesData?.data])
  const selectedProfile = selectedColumnId
    ? profilesByColumnId.get(Number.parseInt(selectedColumnId, 10)) || null
    : null
  const selectedColumn = selectedColumnId
    ? topicColumns.find((column) => column.id === Number.parseInt(selectedColumnId, 10)) || null
    : null

  useEffect(() => {
    if (!selectedColumnId && topicOptions.length > 0) {
      setSelectedColumnId(topicOptions[0].value)
    }
  }, [selectedColumnId, topicOptions])

  useEffect(() => {
    setForm(profileToForm(selectedProfile))
  }, [selectedProfile])

  const saveMutation = useMutation({
    mutationFn: async () => topicProfilesApi.save(Number.parseInt(selectedColumnId, 10), form, { language: defaultLanguageCode }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-profiles'] })
      toast.success('专题配置已保存')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '保存失败')
    },
  })

  const handleSave = () => {
    if (!selectedColumnId) {
      toast.error('请先选择栏目')
      return
    }
    saveMutation.mutate()
  }

  if (columnsLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>专题管理</CardTitle>
          <CardDescription>
            专题只绑定栏目，不创建内容模型；这里维护栏目作为专题页时的关联内容和聚合配置。
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">专题栏目</CardTitle>
            <CardDescription>来自热门系列栏目树。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {topicOptions.length > 0 ? (
              <Select value={selectedColumnId} onValueChange={setSelectedColumnId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择专题栏目" />
                </SelectTrigger>
                <SelectContent>
                  {topicOptions.map((option) => {
                    const hasProfile = profilesByColumnId.has(Number.parseInt(option.value, 10))
                    return (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}{hasProfile ? ' · 已配置' : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            ) : (
              <div className="text-sm text-muted-foreground">未找到 `/topics/` 热门系列栏目树。</div>
            )}

            {selectedColumn ? (
              <div className="space-y-2 rounded border p-3 text-sm">
                <div className="font-medium">{selectedColumn.name}</div>
                <div className="text-muted-foreground">{selectedColumn.route_path || '-'}</div>
                <Badge variant={selectedProfile ? 'default' : 'outline'}>
                  {selectedProfile ? '已配置' : '未配置'}
                </Badge>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">专题配置</CardTitle>
            <CardDescription>关联内容使用 JSON 存储，后续可升级为可视化选择器。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="topic_type">专题类型</Label>
                <Input
                  id="topic_type"
                  value={form.topic_type}
                  onChange={(event) => setForm({ ...form, topic_type: event.target.value })}
                  placeholder="product_family / product_type / solution"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="primary_keyword">主关键词</Label>
                <Input
                  id="primary_keyword"
                  value={form.primary_keyword}
                  onChange={(event) => setForm({ ...form, primary_keyword: event.target.value })}
                  placeholder="steam traps"
                />
              </div>
            </div>

            <JsonTextarea
              id="keyword_group"
              label="关键词组"
              value={form.keyword_group}
              onChange={(value) => setForm({ ...form, keyword_group: value })}
              placeholder="可填写换行文本或 JSON 字符串"
              rows={4}
            />
            <JsonTextarea
              id="related_columns_json"
              label="关联栏目 JSON"
              value={form.related_columns_json}
              onChange={(value) => setForm({ ...form, related_columns_json: value })}
            />
            <JsonTextarea
              id="related_products_json"
              label="关联产品 JSON"
              value={form.related_products_json}
              onChange={(value) => setForm({ ...form, related_products_json: value })}
            />
            <JsonTextarea
              id="related_resources_json"
              label="关联资料 JSON"
              value={form.related_resources_json}
              onChange={(value) => setForm({ ...form, related_resources_json: value })}
            />
            <JsonTextarea
              id="related_articles_json"
              label="关联文章 JSON"
              value={form.related_articles_json}
              onChange={(value) => setForm({ ...form, related_articles_json: value })}
            />
            <JsonTextarea
              id="module_config_json"
              label="模块配置 JSON"
              value={form.module_config_json}
              onChange={(value) => setForm({ ...form, module_config_json: value })}
            />

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={!selectedColumnId || saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存专题配置'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function JsonTextarea({
  id,
  label,
  value,
  onChange,
  placeholder = '[]',
  rows = 3,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  )
}

function resolveTopicColumns(columns: Column[]) {
  const byId = new Map(columns.map((column) => [column.id, column]))
  const root = columns.find((column) => (
    Number(column.parent_id || 0) <= 0
    && String(column.dir_name || '').trim() === 'topics'
    && String(column.route_path || '').trim() === '/topics/'
  ))
  if (!root) {
    return []
  }

  return columns.filter((column) => {
    let current: Column | undefined = column
    while (current) {
      if (current.id === root.id) {
        return true
      }
      const parentId = Number(current.parent_id || 0)
      current = parentId > 0 ? byId.get(parentId) : undefined
    }
    return false
  })
}

function profileToForm(profile: TopicProfile | null): TopicProfilePayload {
  if (!profile) {
    return { ...EMPTY_PROFILE }
  }
  return {
    topic_type: profile.topic_type || '',
    primary_keyword: profile.primary_keyword || '',
    keyword_group: profile.keyword_group || '',
    related_columns_json: profile.related_columns_json || '[]',
    related_products_json: profile.related_products_json || '[]',
    related_resources_json: profile.related_resources_json || '[]',
    related_articles_json: profile.related_articles_json || '[]',
    module_config_json: profile.module_config_json || '{}',
    sort_order: Number(profile.sort_order || 0),
  }
}
