import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { contentItemsApi } from '@/api/content-items'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { buildColumnPathMap } from '@/lib/column-options'
import type { Column, ContentModel, ManagedContentItem, SectionContentItem } from '@/types'

type ContentCandidate = ManagedContentItem | SectionContentItem

interface TopicRelation {
  type: 'column' | 'content'
  model?: string
  column_id: number
  column_name: string
  column_path: string
  content_id?: number
  title?: string
  code?: string
}

interface TopicRelationsEditorProps {
  value: Record<string, unknown>
  onChange: (patch: Record<string, unknown>) => void
  contentModels: ContentModel[]
  columns: Column[]
  defaultLanguageCode: string
}

const GENERIC_RELATION_FIELD_NAME = 'related_content_json'
const LEGACY_RELATION_FIELD_NAMES = [
  'related_product_categories_json',
  'related_products_json',
  'related_resources_json',
  'related_tools_json',
  'related_industries_json',
]

export const TOPIC_RELATION_FIELD_NAMES = new Set<string>([
  GENERIC_RELATION_FIELD_NAME,
  ...LEGACY_RELATION_FIELD_NAMES,
])

export default function TopicRelationsEditor({
  value,
  onChange,
  contentModels,
  columns,
  defaultLanguageCode,
}: TopicRelationsEditorProps) {
  const [selectedColumnId, setSelectedColumnId] = useState('')
  const [selectedContentId, setSelectedContentId] = useState('')

  const columnPathById = useMemo(() => buildColumnPathMap(columns), [columns])
  const modelById = useMemo(
    () => new Map(contentModels.map((model) => [Number(model.id), model])),
    [contentModels],
  )
  const selectableColumns = useMemo(
    () => columns
      .filter((column) => column.column_type === 'list' && resolveColumnModelCode(column, modelById))
      .map((column) => ({
        column,
        modelCode: resolveColumnModelCode(column, modelById) || '',
        path: columnPathById.get(column.id) || column.name,
      })),
    [columnPathById, columns, modelById],
  )

  const selectedColumn = selectableColumns.find((entry) => String(entry.column.id) === selectedColumnId)
  const selectedModelCode = selectedColumn?.modelCode || ''
  const relations = parseRelationArray(value[GENERIC_RELATION_FIELD_NAME])

  const { data: contentItemsData } = useQuery({
    queryKey: ['content-items', selectedModelCode, 'topic-relations', selectedColumnId, defaultLanguageCode],
    queryFn: () => contentItemsApi.list<ContentCandidate>(selectedModelCode, {
      page: 1,
      limit: 100,
      column_id: Number.parseInt(selectedColumnId, 10),
      include_descendants: 1,
      language: defaultLanguageCode,
    }),
    enabled: Boolean(selectedModelCode && selectedColumnId),
  })
  const contentCandidates = contentItemsData?.items || []

  const updateRelations = (nextRelations: TopicRelation[]) => {
    onChange({ [GENERIC_RELATION_FIELD_NAME]: JSON.stringify(nextRelations) })
  }

  const addColumnRelation = () => {
    if (!selectedColumn) {
      return
    }
    const columnId = selectedColumn.column.id
    const exists = relations.some((item) => item.type === 'column' && Number(item.column_id) === Number(columnId))
    if (exists) {
      return
    }
    updateRelations([...relations, buildColumnRelation(selectedColumn.column, selectedColumn.path, selectedColumn.modelCode)])
  }

  const addContentRelation = () => {
    if (!selectedColumn) {
      return
    }
    const contentId = Number.parseInt(selectedContentId, 10)
    const content = contentCandidates.find((item) => Number(item.id) === contentId)
    if (!content) {
      return
    }
    const exists = relations.some((item) => (
      item.type === 'content'
      && item.model === selectedColumn.modelCode
      && Number(item.content_id) === contentId
    ))
    if (exists) {
      return
    }
    updateRelations([...relations, buildContentRelation(selectedColumn.column, selectedColumn.path, selectedColumn.modelCode, content)])
    setSelectedContentId('')
  }

  return (
    <div className="space-y-4 rounded border p-4">
      <div>
        <div className="font-medium">专题关联内容</div>
        <div className="text-sm text-muted-foreground">按栏目选择关联范围，也可以从栏目内选择多条信息。</div>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Select
          value={selectedColumnId}
          onValueChange={(nextColumnId) => {
            setSelectedColumnId(nextColumnId)
            setSelectedContentId('')
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="选择可关联栏目" />
          </SelectTrigger>
          <SelectContent>
            {selectableColumns.map((entry) => (
              <SelectItem key={entry.column.id} value={String(entry.column.id)}>
                {entry.path}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={addColumnRelation} disabled={!selectedColumn}>
          <Plus className="size-4" />
          关联栏目
        </Button>
      </div>

      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
        <Select value={selectedContentId} onValueChange={setSelectedContentId} disabled={!selectedColumn}>
          <SelectTrigger>
            <SelectValue placeholder={selectedColumn ? '选择栏目内信息' : '先选择栏目'} />
          </SelectTrigger>
          <SelectContent>
            {contentCandidates.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>
                {resolveContentTitle(item)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={addContentRelation} disabled={!selectedColumn || !selectedContentId}>
          <Plus className="size-4" />
          关联信息
        </Button>
      </div>

      <div className="space-y-2">
        {relations.length ? relations.map((item) => (
          <div key={resolveRelationKey(item)} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {item.type === 'column' ? item.column_path : item.title || `#${item.content_id}`}
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                <Badge variant="outline">{item.type === 'column' ? '栏目' : '信息'}</Badge>
                <Badge variant="secondary">{item.model || 'unknown'}</Badge>
                {item.type === 'content' ? <Badge variant="outline">{item.column_path}</Badge> : null}
              </div>
            </div>
            <Button
              type="button"
              variant="destructiveGhost"
              size="icon-sm"
              onClick={() => updateRelations(relations.filter((entry) => resolveRelationKey(entry) !== resolveRelationKey(item)))}
              aria-label="移除关联"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )) : (
          <div className="rounded-md border border-dashed bg-background px-3 py-4 text-center text-sm text-muted-foreground">
            暂无关联内容
          </div>
        )}
      </div>
    </div>
  )
}

function resolveColumnModelCode(column: Column, modelById: Map<number, ContentModel>) {
  return column.model_code || modelById.get(Number(column.content_model_id || 0))?.code || ''
}

function buildColumnRelation(column: Column, columnPath: string, modelCode: string): TopicRelation {
  return {
    type: 'column',
    model: modelCode,
    column_id: column.id,
    column_name: column.name,
    column_path: columnPath,
  }
}

function buildContentRelation(column: Column, columnPath: string, modelCode: string, item: ContentCandidate): TopicRelation {
  return {
    type: 'content',
    model: modelCode,
    column_id: Number(item.column_id || column.id),
    column_name: item.column_name || column.name,
    column_path: columnPath,
    content_id: item.id,
    title: resolveContentTitle(item),
    code: 'code' in item ? String(item.code || '') : '',
  }
}

function resolveRelationKey(item: TopicRelation) {
  if (item.type === 'column') {
    return `column:${item.column_id}`
  }
  return `content:${item.model || ''}:${item.content_id || 0}`
}

function parseRelationArray(value: unknown): TopicRelation[] {
  if (Array.isArray(value)) {
    return value.filter(isTopicRelation)
  }
  if (typeof value !== 'string') {
    return []
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return []
  }
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) ? parsed.filter(isTopicRelation) : []
  } catch {
    return []
  }
}

function isTopicRelation(value: unknown): value is TopicRelation {
  if (!value || typeof value !== 'object') {
    return false
  }
  const relation = value as Partial<TopicRelation>
  return (relation.type === 'column' || relation.type === 'content') && Number(relation.column_id || 0) > 0
}

function resolveContentTitle(item: ContentCandidate) {
  if ('title' in item) {
    return String(item.title || `#${item.id}`)
  }
  return String(item.name || `#${item.id}`)
}
