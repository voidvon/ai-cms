import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { MediaPurpose } from '@/api/media'
import { contentModelsApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { contentItemsApi } from '@/api/content-items'
import { languagesApi } from '@/api/languages'
import { topicProfilesApi, type TopicProfile, type TopicProfilePayload } from '@/api/topic-profiles'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImageUploadField from '@/components/ImageUploadField'
import ImagesUploadField from '@/components/ImagesUploadField'
import AttachmentsField from '@/components/AttachmentsField'
import RichTextEditor from '@/components/RichTextEditor'
import { buildColumnTreeOptions } from '@/lib/column-options'
import { getFieldLabel, isFieldEditable, mapFieldsByName } from '@/lib/content-model-fields'
import { toast } from 'sonner'
import type {
  Column,
  ContentModel,
  ContentModelField,
  ManagedContentItem,
  ManagedContentTranslation,
  SectionContentItem,
  SectionContentTranslation,
} from '@/types'

type ContentItem = ManagedContentItem | SectionContentItem
type ContentItemTranslation = ManagedContentTranslation | SectionContentTranslation
type TranslationNameField = 'title' | 'name'

interface TopicColumnNode extends Column {
  children: TopicColumnNode[]
}

interface RelatedContentRef {
  model: string
  id: number
}

interface FormModelCapabilities {
  translationNameField: TranslationNameField
  translationNameLabel: string
  translationNamePlaceholder: string
  requiredNameError: string
  languageDescription: string
  codeFieldLabel: string
  primaryImageFieldName: 'picture' | 'images'
  primaryImageFieldLabel: string
  primaryImagePurpose: MediaPurpose
  supportsVisibility: boolean
  supportsSortOrder: boolean
  supportsCreatedAt: boolean
  supportsSpecOptions: boolean
}

const SYSTEM_FIELD_NAMES = new Set([
  'id',
  'column_id',
  'custom_url',
  'code',
  'images',
  'picture',
  'primary_image',
  'spec_options_json',
  'is_visible',
  'is_featured_home',
  'sort_order',
  'created_at',
  'updated_at',
  'name',
  'title',
  'summary',
  'content_html',
  'seo_title',
  'seo_description',
  'publish_status',
])

interface ContentItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ContentItem
  mode: 'create' | 'edit'
  modelCode: string
  defaultColumnId?: number
}

export default function ContentItemFormDialog({
  open,
  onOpenChange,
  item,
  mode,
  modelCode,
  defaultColumnId,
}: ContentItemFormDialogProps) {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState<Record<string, unknown>>(createEmptyBaseData(defaultColumnId))
  const [translations, setTranslations] = useState<Record<string, ContentItemTranslation>>({})
  const [selectedTopicColumnId, setSelectedTopicColumnId] = useState('')
  const [selectedTopicLanguageCode, setSelectedTopicLanguageCode] = useState('')
  const [topicSelectorOpen, setTopicSelectorOpen] = useState(false)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const languages = useMemo(() => languagesData?.data || [], [languagesData?.data])
  const defaultLanguageCode = languages.find((language) => language.is_default === 1)?.code || 'zh-CN'
  const topicLanguageCode = selectedTopicLanguageCode || defaultLanguageCode
  const availableLanguageCodes = useMemo(() => languages.map((language) => language.code), [languages])

  const { data: itemDetailData } = useQuery({
    queryKey: ['content-items', modelCode, 'detail', item?.id, open],
    queryFn: () => contentItemsApi.get<ContentItem>(modelCode, item!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(item?.id),
  })

  const { data: columnsData } = useQuery({
    queryKey: ['columns', topicLanguageCode],
    queryFn: () => columnsApi.list({ language: topicLanguageCode }),
  })
  const { data: contentModelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })
  const { data: topicProfilesData } = useQuery({
    queryKey: ['topic-profiles', topicLanguageCode],
    queryFn: () => topicProfilesApi.list({ language: topicLanguageCode }),
    enabled: open,
  })

  const contentModels = useMemo(() => contentModelsData?.data || [], [contentModelsData?.data])
  const contentModel = contentModels.find((entry: ContentModel) => entry.code === modelCode)
  const fieldMap = useMemo(() => mapFieldsByName(contentModel?.fields || []), [contentModel?.fields])
  const capabilities = useMemo(
    () => inferFormModelCapabilities(modelCode, contentModel?.fields || []),
    [contentModel?.fields, modelCode],
  )
  const dynamicBaseFields = useMemo(
    () => (contentModel?.fields || []).filter((field) => (
      !SYSTEM_FIELD_NAMES.has(field.field_name)
      && Number(field.is_translatable || 0) === 0
    )),
    [contentModel?.fields],
  )
  const dynamicTranslationFields = useMemo(
    () => (contentModel?.fields || []).filter((field) => (
      !SYSTEM_FIELD_NAMES.has(field.field_name)
      && Number(field.is_translatable || 0) === 1
    )),
    [contentModel?.fields],
  )
  const meta = useMemo(() => getModelMeta(capabilities), [capabilities])
  const allColumns = columnsData?.data || []
  const topicColumns = useMemo(() => resolveTopicColumns(allColumns), [allColumns])
  const selectedTopicColumn = topicColumns.find((column) => column.id === Number.parseInt(selectedTopicColumnId, 10)) || null
  const topicProfiles = topicProfilesData?.data || []
  const topicProfilesByColumnId = useMemo(() => (
    new Map(topicProfiles.map((profile) => [profile.column_id, profile]))
  ), [topicProfiles])
  const currentContentRef = item?.id ? { model: modelCode, id: Number(item.id) } : null
  const linkedTopicColumnIds = useMemo(() => {
    if (!currentContentRef) {
      return new Set<number>()
    }
    return new Set(topicProfiles
      .filter((profile) => relatedContentRefsContains(profile.related_content_json, currentContentRef))
      .map((profile) => profile.column_id))
  }, [currentContentRef?.id, currentContentRef?.model, topicProfiles])
  const modelColumns = allColumns.filter((column) => (
    Number(column.content_model_id || 0) === Number(contentModel?.id || 0)
    && column.column_type === 'list'
  ))
  const modelColumnOptions = useMemo(
    () => buildColumnTreeOptions(allColumns, { selectableColumnIds: modelColumns.map((column) => column.id) }),
    [allColumns, modelColumns],
  )

  useEffect(() => {
    const source = mode === 'edit' ? (itemDetailData?.data || item) : null

    if (source && mode === 'edit') {
      setBaseData(createBaseDataFromItem(source))
      setTranslations(buildInitialTranslations(capabilities, source, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(source.requested_language_code || source.current_language_code || defaultLanguageCode)
      return
    }

    if (mode === 'create') {
      setBaseData(createEmptyBaseData(defaultColumnId))
      setTranslations({
        [defaultLanguageCode]: createEmptyTranslation(capabilities, { publish_status: 'published' }),
      })
      setActiveLanguage(defaultLanguageCode)
    }
  }, [item, itemDetailData?.data, mode, defaultColumnId, defaultLanguageCode, availableLanguageCodes.join('|'), capabilities])

  useEffect(() => {
    if (!selectedTopicColumnId && topicColumns.length > 0) {
      setSelectedTopicColumnId(String(topicColumns[0].id))
    }
  }, [selectedTopicColumnId, topicColumns])

  useEffect(() => {
    if (!selectedTopicLanguageCode && defaultLanguageCode) {
      setSelectedTopicLanguageCode(defaultLanguageCode)
    }
  }, [selectedTopicLanguageCode, defaultLanguageCode])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        base: baseData,
        translations,
      }
      if (mode === 'create') {
        return contentItemsApi.create<ContentItem>(modelCode, payload)
      }
      return contentItemsApi.update<ContentItem>(modelCode, item!.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-items', modelCode] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const addToTopicMutation = useMutation({
    mutationFn: async (topicColumnId: number) => {
      if (!currentContentRef) {
        throw new Error('内容保存后才能关联专题')
      }
      const profile = topicProfilesByColumnId.get(topicColumnId) || null
      const refs = parseRelatedContentRefs(profile?.related_content_json || '[]')
      const exists = refs.some((ref) => ref.model === currentContentRef.model && ref.id === currentContentRef.id)
      const nextRefs = exists ? refs : [...refs, currentContentRef]
      return topicProfilesApi.save(topicColumnId, buildTopicProfilePayload(profile, nextRefs), { language: topicLanguageCode })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['topic-profiles'] })
      toast.success('已添加到专题')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '添加专题失败')
    },
  })

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const defaultTranslation = translations[defaultLanguageCode] || createEmptyTranslation(capabilities)
    const requiredName = capabilities.translationNameField === 'title'
      ? String((defaultTranslation as SectionContentTranslation).title || '').trim()
      : String((defaultTranslation as ManagedContentTranslation).name || '').trim()
    if (!requiredName) {
      toast.error(meta.requiredNameError)
      return
    }
    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<ContentItemTranslation>) => {
    setTranslations((previous) => ({
      ...previous,
      [activeLanguage]: {
        ...createEmptyTranslation(capabilities),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
  }

  const handleAddToTopic = () => {
    const topicColumnId = Number.parseInt(selectedTopicColumnId, 10)
    if (!topicColumnId) {
      toast.error('请选择专题')
      return
    }
    addToTopicMutation.mutate(topicColumnId)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? meta.createTitle : meta.editTitle}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? meta.createDescription : meta.editDescription}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
            <div className="space-y-3">
              <div>
                <div className="font-medium">内容信息</div>
                <div className="text-sm text-muted-foreground">基础信息与多语言内容分栏编辑。</div>
              </div>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="base">基础信息</TabsTrigger>
                {languages.map((language) => (
                  <TabsTrigger key={language.id} value={language.code}>
                    {language.name}
                    {language.code === defaultLanguageCode ? ' *' : ''}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            <TabsContent value="base">
              <div className="rounded border p-4 space-y-4">
                <div>
                  <div className="font-medium">基础字段</div>
                  <div className="text-sm text-muted-foreground">这些字段不区分语言，所有语言共用同一份数据。</div>
                </div>
                {isFormFieldAvailable(fieldMap, 'code') ? (
                  <div className="space-y-2">
                    <Label htmlFor="code">{getFieldLabel(fieldMap, 'code', capabilities.codeFieldLabel)}</Label>
                    <Input
                      id="code"
                      value={String(baseData.code || '')}
                      disabled={!isFieldEditable(fieldMap, 'code')}
                      onChange={(e) => setBaseData({ ...baseData, code: e.target.value })}
                      placeholder={`请输入${capabilities.codeFieldLabel}`}
                    />
                  </div>
                ) : null}
                {isFormFieldAvailable(fieldMap, 'column_id') ? (
                  <div className="space-y-2">
                    <Label>{getFieldLabel(fieldMap, 'column_id', '所属栏目')}</Label>
                    <Select
                      value={baseData.column_id ? String(baseData.column_id) : ''}
                      disabled={!isFieldEditable(fieldMap, 'column_id')}
                      onValueChange={(value) => setBaseData({ ...baseData, column_id: Number.parseInt(value, 10) || undefined })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={meta.columnPlaceholder} />
                      </SelectTrigger>
                      <SelectContent>
                        {modelColumnOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="custom_url">自定义文件名</Label>
                  <Input
                    id="custom_url"
                    value={String(baseData.custom_url || '')}
                    onChange={(e) => setBaseData({ ...baseData, custom_url: e.target.value })}
                    placeholder="留空则按栏目规则生成，例如 abcd/index.html"
                  />
                </div>
                {capabilities.primaryImageFieldName === 'picture' && isFormFieldAvailable(fieldMap, 'picture') ? (
                  <div className="space-y-2">
                    <Label htmlFor="picture">{getFieldLabel(fieldMap, 'picture', capabilities.primaryImageFieldLabel)}</Label>
                    <div className={!isFieldEditable(fieldMap, 'picture') ? 'pointer-events-none opacity-70' : ''}>
                      <ImageUploadField
                        id="picture"
                        value={String(baseData.picture || '')}
                        onChange={(picture) => setBaseData({ ...baseData, picture })}
                        purpose={capabilities.primaryImagePurpose}
                        placeholder={`请输入${capabilities.primaryImageFieldLabel}路径`}
                      />
                    </div>
                  </div>
                ) : null}
                {capabilities.primaryImageFieldName === 'images' && isFormFieldAvailable(fieldMap, 'images') ? (
                  <div className="space-y-2">
                    <Label htmlFor="images">{getFieldLabel(fieldMap, 'images', capabilities.primaryImageFieldLabel)}</Label>
                    <div className={!isFieldEditable(fieldMap, 'images') ? 'pointer-events-none opacity-70' : ''}>
                      <ImagesUploadField
                        id="images"
                        value={Array.isArray(baseData.images) ? baseData.images as string[] : []}
                        onChange={(images) => setBaseData({ ...baseData, images })}
                        purpose={capabilities.primaryImagePurpose}
                        placeholder={`请输入${capabilities.primaryImageFieldLabel}路径`}
                      />
                    </div>
                  </div>
                ) : null}
                {capabilities.supportsSpecOptions && isFormFieldAvailable(fieldMap, 'spec_options_json') ? (
                  <div className="space-y-2">
                    <Label htmlFor="spec_options_json">{getFieldLabel(fieldMap, 'spec_options_json', '产品规格')}</Label>
                    <Textarea
                      id="spec_options_json"
                      value={formatSpecOptionsTextareaValue(baseData.spec_options_json)}
                      disabled={!isFieldEditable(fieldMap, 'spec_options_json')}
                      onChange={(e) => setBaseData({ ...baseData, spec_options_json: parseSpecOptionsTextareaValue(e.target.value) })}
                      placeholder={'每行一个规格，例如：\n1/2" (1232600)\nDN15 (1457130001)'}
                      rows={6}
                    />
                    <div className="text-xs text-muted-foreground">非翻译字段。所有语言共用同一份规格数据，一行一个值。</div>
                  </div>
                ) : null}
                {dynamicBaseFields.length ? (
                  <div className="grid gap-4 md:grid-cols-2">
                    {dynamicBaseFields.map((field) => {
                      const fieldLabel = getFieldLabel(fieldMap, field.field_name, field.field_name)
                      const value = baseData[field.field_name]
                      const commonProps = {
                        disabled: !isFieldEditable(fieldMap, field.field_name),
                      }

                      if (field.field_type === 'textarea') {
                        return (
                          <div key={field.field_name} className="space-y-2 md:col-span-2">
                            <Label htmlFor={field.field_name}>{fieldLabel}</Label>
                            <Textarea
                              id={field.field_name}
                              value={String(value || '')}
                              {...commonProps}
                              onChange={(event) => setBaseData({ ...baseData, [field.field_name]: event.target.value })}
                              rows={4}
                              placeholder={`请输入${fieldLabel}`}
                            />
                          </div>
                        )
                      }

                      if (field.field_type === 'attachments') {
                        return (
                          <div key={field.field_name} className="space-y-2 md:col-span-2">
                            <Label>{fieldLabel}</Label>
                            <AttachmentsField
                              value={Array.isArray(value) ? value as string[] : []}
                              disabled={!isFieldEditable(fieldMap, field.field_name)}
                              onChange={(attachments) => setBaseData({ ...baseData, [field.field_name]: attachments })}
                            />
                          </div>
                        )
                      }

                      return (
                        <div key={field.field_name} className="space-y-2">
                          <Label htmlFor={field.field_name}>{fieldLabel}</Label>
                          <Input
                            id={field.field_name}
                            type={field.field_type === 'number' ? 'number' : 'text'}
                            value={value === null || value === undefined ? '' : String(value)}
                            {...commonProps}
                            onChange={(event) => setBaseData({
                              ...baseData,
                              [field.field_name]: field.field_type === 'number'
                                ? event.target.value
                                : event.target.value,
                            })}
                            placeholder={`请输入${fieldLabel}`}
                          />
                        </div>
                      )
                    })}
                  </div>
                ) : null}

                {capabilities.supportsCreatedAt ? (
                  <div className="grid grid-cols-2 gap-4">
                    {isFormFieldAvailable(fieldMap, 'is_featured_home') ? (
                      <div className="space-y-2">
                        <Label htmlFor="is_featured_home">{getFieldLabel(fieldMap, 'is_featured_home', '推荐')}</Label>
                        <Select
                          value={String(baseData.is_featured_home ?? 0)}
                          disabled={!isFieldEditable(fieldMap, 'is_featured_home')}
                          onValueChange={(value) => setBaseData({ ...baseData, is_featured_home: parseInt(value, 10) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">是</SelectItem>
                            <SelectItem value="0">否</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {isFormFieldAvailable(fieldMap, 'created_at') ? (
                      <div className="space-y-2">
                        <Label htmlFor="created_at">{getFieldLabel(fieldMap, 'created_at', '创建时间')}</Label>
                        <Input
                          id="created_at"
                          value={String(baseData.created_at || '')}
                          disabled={!isFieldEditable(fieldMap, 'created_at')}
                          onChange={(e) => setBaseData({ ...baseData, created_at: e.target.value })}
                          placeholder="2026-06-13T12:00:00.000Z"
                        />
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-4">
                    {capabilities.supportsVisibility && isFormFieldAvailable(fieldMap, 'is_visible') ? (
                      <div className="space-y-2">
                        <Label htmlFor="is_visible">{getFieldLabel(fieldMap, 'is_visible', '显示状态')}</Label>
                        <Select
                          value={String(baseData.is_visible ?? 1)}
                          disabled={!isFieldEditable(fieldMap, 'is_visible')}
                          onValueChange={(value) => setBaseData({ ...baseData, is_visible: parseInt(value, 10) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">显示</SelectItem>
                            <SelectItem value="0">隐藏</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {isFormFieldAvailable(fieldMap, 'is_featured_home') ? (
                      <div className="space-y-2">
                        <Label htmlFor="is_featured_home">{getFieldLabel(fieldMap, 'is_featured_home', '推荐')}</Label>
                        <Select
                          value={String(baseData.is_featured_home ?? 0)}
                          disabled={!isFieldEditable(fieldMap, 'is_featured_home')}
                          onValueChange={(value) => setBaseData({ ...baseData, is_featured_home: parseInt(value, 10) })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">是</SelectItem>
                            <SelectItem value="0">否</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    {capabilities.supportsSortOrder && isFormFieldAvailable(fieldMap, 'sort_order') ? (
                      <div className="space-y-2">
                        <Label htmlFor="sort_order">{getFieldLabel(fieldMap, 'sort_order', '排序')}</Label>
                        <Input
                          id="sort_order"
                          type="number"
                          disabled={!isFieldEditable(fieldMap, 'sort_order')}
                          value={Number(baseData.sort_order ?? 0)}
                          onChange={(e) => setBaseData({ ...baseData, sort_order: parseInt(e.target.value, 10) || 0 })}
                        />
                      </div>
                    ) : null}
                  </div>
                )}
                <div className="space-y-3 rounded border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium">专题关联</div>
                      <div className="text-sm text-muted-foreground">将当前内容添加到某个语言版本的专题栏目。</div>
                    </div>
                    <div className="w-40 space-y-1">
                      <Label>专题语言</Label>
                      <Select value={topicLanguageCode} onValueChange={setSelectedTopicLanguageCode}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {languages.map((language) => (
                            <SelectItem key={language.id} value={language.code}>
                              {language.name}{language.code === defaultLanguageCode ? ' *' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {mode !== 'edit' || !item?.id ? (
                    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                      内容创建后才会生成 ID，请保存后再编辑并添加到专题。
                    </div>
                  ) : topicColumns.length === 0 ? (
                    <div className="rounded border border-dashed p-3 text-sm text-muted-foreground">
                      未找到 `/topics/` 专题栏目树。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                        <Popover open={topicSelectorOpen} onOpenChange={setTopicSelectorOpen}>
                          <PopoverTrigger asChild>
                            <Button type="button" variant="outline" className="justify-between">
                              <span className="truncate">
                                {selectedTopicColumn ? selectedTopicColumn.name : '选择专题'}
                              </span>
                              <span className="ml-3 text-xs text-muted-foreground">展开</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent align="start" className="w-[640px] max-w-[min(640px,var(--radix-popover-content-available-width))] p-0">
                            <TopicCascader
                              columns={topicColumns}
                              value={Number.parseInt(selectedTopicColumnId, 10) || undefined}
                              linkedTopicColumnIds={linkedTopicColumnIds}
                              onValueChange={(column) => {
                                setSelectedTopicColumnId(String(column.id))
                                setTopicSelectorOpen(false)
                              }}
                            />
                          </PopoverContent>
                        </Popover>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleAddToTopic}
                          disabled={addToTopicMutation.isPending || linkedTopicColumnIds.has(Number.parseInt(selectedTopicColumnId, 10))}
                        >
                          {linkedTopicColumnIds.has(Number.parseInt(selectedTopicColumnId, 10)) ? '已关联' : '添加到专题'}
                        </Button>
                      </div>
                      {linkedTopicColumnIds.size > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {topicColumns
                            .filter((column) => linkedTopicColumnIds.has(column.id))
                            .map((column) => (
                              <Badge key={column.id} variant="secondary">{column.name}</Badge>
                            ))}
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>

            {languages.map((language) => {
              const translation = translations[language.code] || createEmptyTranslation(capabilities)
              return (
                <TabsContent key={language.id} value={language.code}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {isFormFieldAvailable(fieldMap, capabilities.translationNameField) ? (
                      <div className="space-y-2">
                        <Label htmlFor={`translation_name_${language.code}`}>
                          {getFieldLabel(fieldMap, capabilities.translationNameField, capabilities.translationNameLabel)} {language.code === defaultLanguageCode ? '*' : ''}
                        </Label>
                        <Input
                          id={`translation_name_${language.code}`}
                          value={capabilities.translationNameField === 'title'
                            ? String((translation as SectionContentTranslation).title || '')
                            : String((translation as ManagedContentTranslation).name || '')
                          }
                          disabled={!isFieldEditable(fieldMap, capabilities.translationNameField)}
                          onChange={(e) => {
                            setActiveLanguage(language.code)
                            updateTranslation(capabilities.translationNameField === 'title'
                              ? { title: e.target.value } as Partial<ContentItemTranslation>
                              : { name: e.target.value } as Partial<ContentItemTranslation>)
                          }}
                          placeholder={capabilities.translationNamePlaceholder}
                        />
                      </div>
                    ) : null}
                    {isFormFieldAvailable(fieldMap, 'publish_status') ? (
                      <div className="space-y-2">
                        <Label>{getFieldLabel(fieldMap, 'publish_status', '发布状态')}</Label>
                        <Select
                          value={String(translation.publish_status || 'draft')}
                          disabled={!isFieldEditable(fieldMap, 'publish_status')}
                          onValueChange={(value: 'draft' | 'published') => {
                            setActiveLanguage(language.code)
                            updateTranslation({ publish_status: value })
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">草稿</SelectItem>
                            <SelectItem value="published">已发布</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  {isFormFieldAvailable(fieldMap, 'summary') ? (
                    <div className="space-y-2">
                      <Label htmlFor={`summary_${language.code}`}>{getFieldLabel(fieldMap, 'summary', '摘要')}</Label>
                      <Textarea
                        id={`summary_${language.code}`}
                        value={String(translation.summary || '')}
                        disabled={!isFieldEditable(fieldMap, 'summary')}
                        onChange={(e) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ summary: e.target.value })
                        }}
                        placeholder="请输入摘要"
                        rows={3}
                      />
                    </div>
                  ) : null}
                  {isFormFieldAvailable(fieldMap, 'content_html') ? (
                    <div className="space-y-2">
                      <Label>{getFieldLabel(fieldMap, 'content_html', '详细内容')}</Label>
                      <RichTextEditor
                        value={String(translation.content_html || '')}
                        readOnly={!isFieldEditable(fieldMap, 'content_html')}
                        onChange={(content_html) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ content_html })
                        }}
                        placeholder="请输入详细内容"
                        uploadPurpose="richtext_image"
                      />
                    </div>
                  ) : null}
                  {dynamicTranslationFields.length ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {dynamicTranslationFields.map((field) => {
                        const fieldLabel = getFieldLabel(fieldMap, field.field_name, field.field_name)
                        const value = (translation as Record<string, unknown>)[field.field_name]
                        const inputId = `${field.field_name}_${language.code}`
                        const commonProps = {
                          disabled: !isFieldEditable(fieldMap, field.field_name),
                        }

                        if (field.field_type === 'textarea' || field.field_type === 'richtext') {
                          return (
                            <div key={field.field_name} className="space-y-2 md:col-span-2">
                              <Label htmlFor={inputId}>{fieldLabel}</Label>
                              <Textarea
                                id={inputId}
                                value={String(value || '')}
                                {...commonProps}
                                onChange={(event) => {
                                  setActiveLanguage(language.code)
                                  updateTranslation({ [field.field_name]: event.target.value } as Partial<ContentItemTranslation>)
                                }}
                                rows={4}
                                placeholder={`请输入${fieldLabel}`}
                              />
                            </div>
                          )
                        }

                        if (field.field_type === 'attachments') {
                          return (
                            <div key={field.field_name} className="space-y-2 md:col-span-2">
                              <Label>{fieldLabel}</Label>
                              <AttachmentsField
                                value={Array.isArray(value) ? value as string[] : []}
                                languageId={language.id}
                                disabled={!isFieldEditable(fieldMap, field.field_name)}
                                onChange={(attachments) => {
                                  setActiveLanguage(language.code)
                                  updateTranslation({ [field.field_name]: attachments } as Partial<ContentItemTranslation>)
                                }}
                              />
                            </div>
                          )
                        }

                        return (
                          <div key={field.field_name} className="space-y-2">
                            <Label htmlFor={inputId}>{fieldLabel}</Label>
                            <Input
                              id={inputId}
                              type={field.field_type === 'number' ? 'number' : 'text'}
                              value={value === null || value === undefined ? '' : String(value)}
                              {...commonProps}
                              onChange={(event) => {
                                setActiveLanguage(language.code)
                                updateTranslation({ [field.field_name]: event.target.value } as Partial<ContentItemTranslation>)
                              }}
                              placeholder={`请输入${fieldLabel}`}
                            />
                          </div>
                        )
                      })}
                    </div>
                  ) : null}
                  {isFormFieldAvailable(fieldMap, 'seo_title') ? (
                    <div className="space-y-2">
                      <Label htmlFor={`seo_title_${language.code}`}>{getFieldLabel(fieldMap, 'seo_title', 'SEO标题')}</Label>
                      <Input
                        id={`seo_title_${language.code}`}
                        value={String(translation.seo_title || '')}
                        disabled={!isFieldEditable(fieldMap, 'seo_title')}
                        onChange={(e) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ seo_title: e.target.value })
                        }}
                        placeholder="请输入SEO标题"
                      />
                    </div>
                  ) : null}
                  {isFormFieldAvailable(fieldMap, 'seo_description') ? (
                    <div className="space-y-2">
                      <Label htmlFor={`seo_description_${language.code}`}>{getFieldLabel(fieldMap, 'seo_description', 'SEO描述')}</Label>
                      <Textarea
                        id={`seo_description_${language.code}`}
                        value={String(translation.seo_description || '')}
                        disabled={!isFieldEditable(fieldMap, 'seo_description')}
                        onChange={(e) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ seo_description: e.target.value })
                        }}
                        placeholder="请输入SEO描述"
                        rows={3}
                      />
                    </div>
                  ) : null}
                </TabsContent>
              )
            })}
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function getModelMeta(capabilities: FormModelCapabilities) {
  return {
    createTitle: '添加内容',
    editTitle: '编辑内容',
    createDescription: '填写内容信息',
    editDescription: '修改内容信息',
    languageDescription: capabilities.languageDescription,
    translationNameField: capabilities.translationNameField,
    translationNameLabel: capabilities.translationNameLabel,
    translationNamePlaceholder: capabilities.translationNamePlaceholder,
    requiredNameError: capabilities.requiredNameError,
    columnPlaceholder: '请选择所属栏目',
  }
}

function isFormFieldAvailable(fieldMap: Map<string, ContentModelField>, fieldName: string, defaultAvailable = true) {
  return fieldMap.has(fieldName) || defaultAvailable
}

function TopicCascader({
  columns,
  value,
  linkedTopicColumnIds,
  onValueChange,
}: {
  columns: Column[]
  value?: number
  linkedTopicColumnIds: Set<number>
  onValueChange: (column: Column) => void
}) {
  const roots = useMemo(() => buildTopicColumnTree(columns), [columns])
  const selectedPath = useMemo(() => resolveTopicPath(columns, value), [columns, value])
  const [activePath, setActivePath] = useState<number[]>([])

  useEffect(() => {
    setActivePath(selectedPath.map((column) => column.id).slice(0, -1))
  }, [selectedPath.map((column) => column.id).join('/')])

  const columnsByParent = useMemo(() => {
    const levels: TopicColumnNode[][] = [roots]
    let currentNodes = roots
    for (const activeId of activePath) {
      const activeNode = currentNodes.find((node) => node.id === activeId)
      if (!activeNode?.children.length) {
        break
      }
      levels.push(activeNode.children)
      currentNodes = activeNode.children
    }
    return levels
  }, [activePath, roots])

  const handleActivate = (levelIndex: number, node: TopicColumnNode) => {
    setActivePath([...activePath.slice(0, levelIndex), node.id])
  }

  return (
    <div className="min-h-[260px]">
      <div className="border-b px-3 py-2 text-sm text-muted-foreground">
        {selectedPath.length ? selectedPath.map((column) => column.name).join(' / ') : '请选择专题'}
      </div>
      <div className="flex max-h-[360px] overflow-x-auto overflow-y-hidden">
        {columnsByParent.map((levelNodes, levelIndex) => (
          <div key={levelIndex} className="min-w-52 border-r last:border-r-0">
            <div className="max-h-[360px] overflow-y-auto p-1">
              {levelNodes.map((node) => {
                const active = activePath[levelIndex] === node.id
                const selected = value === node.id
                const linked = linkedTopicColumnIds.has(node.id)
                return (
                  <div
                    key={node.id}
                    className={[
                      'flex w-full items-stretch justify-between gap-1 rounded text-sm hover:bg-muted',
                      active || selected ? 'bg-muted' : '',
                    ].join(' ')}
                    onMouseEnter={() => node.children.length && handleActivate(levelIndex, node)}
                  >
                    <button
                      type="button"
                      className="min-w-0 flex-1 px-2 py-2 text-left"
                      onClick={() => {
                        if (node.children.length) {
                          handleActivate(levelIndex, node)
                          return
                        }
                        onValueChange(node)
                      }}
                    >
                      <span className="block truncate font-medium">{node.name}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">{node.route_path || `ID ${node.id}`}</span>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 pr-2">
                      {linked ? <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">已关联</Badge> : null}
                      {node.children.length ? (
                        <>
                          <button
                            type="button"
                            className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                            onClick={() => onValueChange(node)}
                          >
                            选中
                          </button>
                          <span className="text-muted-foreground">›</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
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
      const parentId: number = Number(current.parent_id || 0)
      current = parentId > 0 ? byId.get(parentId) : undefined
    }
    return false
  })
}

function buildTopicColumnTree(columns: Column[]) {
  const nodes = new Map<number, TopicColumnNode>()
  const roots: TopicColumnNode[] = []

  for (const column of columns) {
    nodes.set(column.id, { ...column, children: [] })
  }

  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(Number(node.parent_id)) : null
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  sortTopicColumnNodes(roots)
  return roots
}

function sortTopicColumnNodes(nodes: TopicColumnNode[]) {
  nodes.sort((a, b) => {
    const sortPriority = Number(a.sort_order || 0) - Number(b.sort_order || 0)
    return sortPriority !== 0 ? sortPriority : a.id - b.id
  })
  for (const node of nodes) {
    sortTopicColumnNodes(node.children)
  }
}

function resolveTopicPath(columns: Column[], value?: number) {
  if (!value) {
    return []
  }
  const byId = new Map(columns.map((column) => [column.id, column]))
  const path: Column[] = []
  let current = byId.get(value)
  while (current) {
    path.unshift(current)
    const parentId = Number(current.parent_id || 0)
    current = parentId > 0 ? byId.get(parentId) : undefined
  }
  return path
}

function parseRelatedContentRefs(value: string): RelatedContentRef[] {
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((entry) => ({
        model: String(entry?.model || '').trim(),
        id: Number(entry?.id || 0),
      }))
      .filter((entry) => entry.model && entry.id > 0)
  } catch {
    return []
  }
}

function relatedContentRefsContains(value: string, target: RelatedContentRef) {
  return parseRelatedContentRefs(value).some((ref) => ref.model === target.model && ref.id === target.id)
}

function buildTopicProfilePayload(profile: TopicProfile | null, refs: RelatedContentRef[]): TopicProfilePayload {
  return {
    seo_title: profile?.seo_title || '',
    intro_html: profile?.intro_html || '',
    topic_keyword: profile?.topic_keyword || '',
    related_content_json: JSON.stringify(refs),
    sort_order: Number(profile?.sort_order || 0),
  }
}

function createEmptyBaseData(defaultColumnId?: number) {
  return {
    code: '',
    column_id: defaultColumnId,
    custom_url: '',
    picture: '',
    images: [] as string[],
    spec_options_json: [] as string[],
    is_featured_home: 0,
    is_visible: 1,
    sort_order: 0,
    created_at: '',
  }
}

function createBaseDataFromItem(item: ContentItem) {
  const sectionItem = item as SectionContentItem
  const managedItem = item as ManagedContentItem
  return {
    code: managedItem.code || '',
    column_id: item.column_id || undefined,
    custom_url: item.custom_url || '',
    picture: sectionItem.picture || sectionItem.image || managedItem.primary_image || '',
    images: Array.isArray(managedItem.images) ? managedItem.images : [],
    spec_options_json: Array.isArray(managedItem.spec_options) ? managedItem.spec_options : [],
    is_featured_home: item.is_featured_home || sectionItem.is_featured || 0,
    is_visible: managedItem.is_visible || 1,
    sort_order: item.sort_order || 0,
    created_at: sectionItem.created_at || '',
    ...(managedItem.dynamic_fields && typeof managedItem.dynamic_fields === 'object' ? managedItem.dynamic_fields : {}),
  }
}

function createEmptyTranslation(capabilities: FormModelCapabilities, patch: Partial<ContentItemTranslation> = {}): ContentItemTranslation {
  if (capabilities.translationNameField === 'title') {
    return {
      title: '',
      summary: '',
      content_html: '',
      seo_title: '',
      seo_description: '',
      publish_status: 'draft',
      ...patch,
    } as SectionContentTranslation
  }

  return {
    name: '',
    summary: '',
    content_html: '',
    seo_title: '',
    seo_description: '',
    publish_status: 'draft',
    ...patch,
  } as ManagedContentTranslation
}

function buildInitialTranslations(
  capabilities: FormModelCapabilities,
  item: ContentItem,
  defaultLanguageCode: string,
  availableLanguageCodes: string[],
) {
  const source = item.translations || {}
  const output: Record<string, ContentItemTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(capabilities, source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation(capabilities)
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = capabilities.translationNameField === 'title'
      ? createEmptyTranslation(capabilities, {
          title: (item as SectionContentItem).title || '',
          summary: item.summary || '',
          content_html: item.content_html || '',
          seo_title: item.seo_title || '',
          seo_description: item.seo_description || '',
          publish_status: 'published',
        })
      : createEmptyTranslation(capabilities, {
          name: (item as ManagedContentItem).name || '',
          summary: item.summary || '',
          content_html: item.content_html || '',
          seo_title: item.seo_title || '',
          seo_description: item.seo_description || '',
          publish_status: 'published',
        })
  }

  return output
}

function inferFormModelCapabilities(modelCode: string, fields: ContentModelField[]): FormModelCapabilities {
  const fieldMap = mapFieldsByName(fields)
  const hasTitleField = fieldMap.has('title')
  const translationNameField: TranslationNameField = hasTitleField ? 'title' : 'name'
  const translationNameLabel = getFieldLabel(fieldMap, translationNameField, hasTitleField ? '标题' : '名称')
  const primaryImageFieldName: 'picture' | 'images' = fieldMap.has('images') ? 'images' : 'picture'
  const defaultImagePurpose: MediaPurpose = modelCode === 'news'
    ? 'news_cover'
    : modelCode === 'product'
      ? 'product_cover'
      : 'attachment'

  return {
    translationNameField,
    translationNameLabel,
    translationNamePlaceholder: `请输入${translationNameLabel}`,
    requiredNameError: `请输入默认语言的${translationNameLabel}`,
    languageDescription: `当前对${translationNameLabel}、摘要、正文和 SEO 内容做多语言。`,
    codeFieldLabel: getFieldLabel(fieldMap, 'code', '内容编号'),
    primaryImageFieldName,
    primaryImageFieldLabel: getFieldLabel(fieldMap, primaryImageFieldName, primaryImageFieldName === 'images' ? '图片' : '封面图片'),
    primaryImagePurpose: defaultImagePurpose,
    supportsVisibility: fieldMap.has('is_visible'),
    supportsSortOrder: fieldMap.has('sort_order'),
    supportsCreatedAt: fieldMap.has('created_at'),
    supportsSpecOptions: fieldMap.has('spec_options_json'),
  }
}

function formatSpecOptionsTextareaValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item || '').trim()).filter(Boolean).join('\n')
      }
    } catch {
      return value
    }
  }
  return ''
}

function parseSpecOptionsTextareaValue(value: string) {
  return String(value || '')
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter(Boolean)
}
