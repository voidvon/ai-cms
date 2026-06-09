import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { contentModelsApi } from '@/api/advanced'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export default function ContentModelsPage() {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })

  const models = data?.data || []
  const selectedModel = useMemo(
    () => models.find((item) => item.id === selectedId) || models[0] || null,
    [models, selectedId],
  )

  if (isLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>数据模型</CardTitle>
          <CardDescription>管理列表和内容型数据的字段结构。字段会从模型绑定的数据表结构直接读取。</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>模型列表</CardTitle>
            <CardDescription>共 {models.length} 个模型</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {models.map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => setSelectedId(model.id)}
                  className={`w-full rounded border p-3 text-left transition-colors ${selectedModel?.id === model.id ? 'border-primary bg-muted' : 'hover:bg-muted/60'}`}
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{model.name}</div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">{model.code}</div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    表：{model.source_table || '未绑定'} · 字段 {model.fields.length} 个
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{selectedModel?.name || '未选择模型'}</CardTitle>
                <CardDescription>{selectedModel?.description || '查看当前模型字段'}</CardDescription>
              </div>
              {selectedModel && (
                <div className="flex gap-2">
                  <Badge variant="outline">{selectedModel.code}</Badge>
                  <Badge variant="outline">{selectedModel.fields.length} 字段</Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {selectedModel ? (
              <div className="rounded border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>字段</TableHead>
                      <TableHead>显示名</TableHead>
                      <TableHead>字段类型</TableHead>
                      <TableHead>数据库类型</TableHead>
                      <TableHead>属性</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedModel.fields.map((field) => (
                      <TableRow key={field.id}>
                        <TableCell className="font-mono text-xs">{field.field_name}</TableCell>
                        <TableCell>{field.field_label}</TableCell>
                        <TableCell><Badge variant="outline">{formatFieldType(field.field_type)}</Badge></TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{field.db_type || '-'}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {field.is_primary ? <Badge>主键</Badge> : null}
                            {field.is_required ? <Badge variant="outline">必填</Badge> : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="rounded border p-8 text-center text-muted-foreground">暂无模型</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function formatFieldType(type: string) {
  if (type === 'text') return '文本'
  if (type === 'richtext') return '富文本'
  if (type === 'image') return '图片'
  if (type === 'boolean') return '开关'
  if (type === 'datetime') return '时间'
  if (type === 'number') return '数字'
  return type
}
