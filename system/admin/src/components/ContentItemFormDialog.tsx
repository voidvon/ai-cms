import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contentModelsApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { contentItemsApi } from '@/api/content-items'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImageUploadField from '@/components/ImageUploadField'
import ImagesUploadField from '@/components/ImagesUploadField'
import RichTextEditor from '@/components/RichTextEditor'
import { getFieldLabel, isFieldEditable, isFieldVisible, mapFieldsByName } from '@/lib/content-model-fields'
import { toast } from 'sonner'
import type {
  ContentModel,
  ManagedContentItem,
  ManagedContentTranslation,
  SectionContentItem,
  SectionContentTranslation,
} from '@/types'

type ContentItem = ManagedContentItem | SectionContentItem
type ContentItemTranslation = ManagedContentTranslation | SectionContentTranslation
type TranslationNameField = 'title' | 'name'

interface FormModelCapabilities {
  translationNameField: TranslationNameField
  translationNameLabel: string
  translationNamePlaceholder: string
  requiredNameError: string
  languageDescription: string
  codeFieldLabel: string
  primaryImageFieldName: 'picture' | 'images'
  primaryImageFieldLabel: string
  primaryImagePurpose: 'news_cover' | 'product_cover'
  supportsVisibility: boolean
  supportsSortOrder: boolean
  supportsCreatedAt: boolean
}

const FORM_MODEL_CAPABILITIES = {
  news: {
    translationNameField: 'title',
    translationNameLabel: '标题',
    translationNamePlaceholder: '请输入标题',
    requiredNameError: '请输入默认语言的标题',
    languageDescription: '当前对标题、摘要、正文和 SEO 内容做多语言。',
    codeFieldLabel: '内容编号',
    primaryImageFieldName: 'picture',
    primaryImageFieldLabel: '封面图片',
    primaryImagePurpose: 'news_cover',
    supportsVisibility: false,
    supportsSortOrder: false,
    supportsCreatedAt: true,
  },
  product: {
    translationNameField: 'name',
    translationNameLabel: '名称',
    translationNamePlaceholder: '请输入名称',
    requiredNameError: '请输入默认语言的名称',
    languageDescription: '当前对名称、摘要、正文和 SEO 内容做多语言。',
    codeFieldLabel: '产品编号',
    primaryImageFieldName: 'images',
    primaryImageFieldLabel: '产品图片',
    primaryImagePurpose: 'product_cover',
    supportsVisibility: true,
    supportsSortOrder: true,
    supportsCreatedAt: false,
  },
} satisfies Record<string, FormModelCapabilities>

type SupportedModelCode = keyof typeof FORM_MODEL_CAPABILITIES

interface ContentItemFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  item?: ContentItem
  mode: 'create' | 'edit'
  modelCode: SupportedModelCode
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
  const [baseData, setBaseData] = useState<Record<string, unknown>>(createEmptyBaseData(modelCode, defaultColumnId))
  const [translations, setTranslations] = useState<Record<string, ContentItemTranslation>>({})

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const languages = useMemo(() => languagesData?.data || [], [languagesData?.data])
  const defaultLanguageCode = languages.find((language) => language.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = useMemo(() => languages.map((language) => language.code), [languages])

  const { data: itemDetailData } = useQuery({
    queryKey: ['content-items', modelCode, 'detail', item?.id, open],
    queryFn: () => contentItemsApi.get<ContentItem>(modelCode, item!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(item?.id),
  })

  const { data: columnsData } = useQuery({
    queryKey: ['columns', defaultLanguageCode],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode }),
  })
  const { data: contentModelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })

  const contentModel = (contentModelsData?.data || []).find((entry: ContentModel) => entry.code === modelCode)
  const modelColumns = (columnsData?.data || []).filter((column) => (
    Number(column.content_model_id || 0) === Number(contentModel?.id || 0)
    && column.column_type === 'list'
  ))
  const fieldMap = mapFieldsByName(contentModel?.fields || [])
  const meta = getModelMeta(modelCode)
  const capabilities = getFormModelCapabilities(modelCode)

  useEffect(() => {
    const source = mode === 'edit' ? (itemDetailData?.data || item) : null

    if (source && mode === 'edit') {
      setBaseData(createBaseDataFromItem(modelCode, source))
      setTranslations(buildInitialTranslations(modelCode, source, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(source.requested_language_code || source.current_language_code || defaultLanguageCode)
      return
    }

    if (mode === 'create') {
      setBaseData(createEmptyBaseData(modelCode, defaultColumnId))
      setTranslations({
        [defaultLanguageCode]: createEmptyTranslation(modelCode, { publish_status: 'published' }),
      })
      setActiveLanguage(defaultLanguageCode)
    }
  }, [item, itemDetailData?.data, mode, modelCode, defaultColumnId, defaultLanguageCode, availableLanguageCodes.join('|')])

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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const defaultTranslation = translations[defaultLanguageCode] || createEmptyTranslation(modelCode)
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
        ...createEmptyTranslation(modelCode),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
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
                {isFieldVisible(fieldMap, 'code') ? (
                  <div className="space-y-2">
                    <Label htmlFor="code">{getFieldLabel(fieldMap, 'code', capabilities.codeFieldLabel)}</Label>
                    <Input
                      id="code"
                      value={String(baseData.code || '')}
                      disabled={!isFieldEditable(fieldMap, 'code')}
                      onChange={(e) => setBaseData({ ...baseData, code: e.target.value })}
                      placeholder="请输入产品编号"
                    />
                  </div>
                ) : null}
                {isFieldVisible(fieldMap, 'column_id') ? (
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
                        {modelColumns.map((column) => (
                          <SelectItem key={column.id} value={String(column.id)}>
                            {column.name}
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
                {capabilities.primaryImageFieldName === 'picture' && isFieldVisible(fieldMap, 'picture') ? (
                  <div className="space-y-2">
                    <Label htmlFor="picture">{getFieldLabel(fieldMap, 'picture', capabilities.primaryImageFieldLabel)}</Label>
                    <div className={!isFieldEditable(fieldMap, 'picture') ? 'pointer-events-none opacity-70' : ''}>
                      <ImageUploadField
                        id="picture"
                        value={String(baseData.picture || '')}
                        onChange={(picture) => setBaseData({ ...baseData, picture })}
                        purpose={capabilities.primaryImagePurpose}
                        placeholder="请输入封面图片路径"
                      />
                    </div>
                  </div>
                ) : null}
                {capabilities.primaryImageFieldName === 'images' && isFieldVisible(fieldMap, 'images') ? (
                  <div className="space-y-2">
                    <Label htmlFor="images">{getFieldLabel(fieldMap, 'images', capabilities.primaryImageFieldLabel)}</Label>
                    <div className={!isFieldEditable(fieldMap, 'images') ? 'pointer-events-none opacity-70' : ''}>
                      <ImagesUploadField
                        id="images"
                        value={Array.isArray(baseData.images) ? baseData.images as string[] : []}
                        onChange={(images) => setBaseData({ ...baseData, images })}
                        purpose={capabilities.primaryImagePurpose}
                        placeholder="请输入产品图片路径"
                      />
                    </div>
                  </div>
                ) : null}
                {modelCode === 'product' && isFieldVisible(fieldMap, 'spec_options_json') ? (
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

                {capabilities.supportsCreatedAt ? (
                  <div className="grid grid-cols-2 gap-4">
                    {isFieldVisible(fieldMap, 'is_featured_home') ? (
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
                    {isFieldVisible(fieldMap, 'created_at') ? (
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
                    {capabilities.supportsVisibility && isFieldVisible(fieldMap, 'is_visible') ? (
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
                    {isFieldVisible(fieldMap, 'is_featured_home') ? (
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
                    {capabilities.supportsSortOrder && isFieldVisible(fieldMap, 'sort_order') ? (
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
              </div>
            </TabsContent>

            {languages.map((language) => {
              const translation = translations[language.code] || createEmptyTranslation(modelCode)
              return (
                <TabsContent key={language.id} value={language.code}>
                  <div className="grid gap-4 md:grid-cols-2">
                    {isFieldVisible(fieldMap, 'name') ? (
                      <div className="space-y-2">
                        <Label htmlFor={`translation_name_${language.code}`}>
                          {getFieldLabel(fieldMap, 'name', capabilities.translationNameLabel)} {language.code === defaultLanguageCode ? '*' : ''}
                        </Label>
                        <Input
                          id={`translation_name_${language.code}`}
                          value={capabilities.translationNameField === 'title'
                            ? String((translation as SectionContentTranslation).title || '')
                            : String((translation as ManagedContentTranslation).name || '')
                          }
                          disabled={!isFieldEditable(fieldMap, 'name')}
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
                    {isFieldVisible(fieldMap, 'publish_status') ? (
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

                  {isFieldVisible(fieldMap, 'summary') ? (
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
                  {isFieldVisible(fieldMap, 'content_html') ? (
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
                  {isFieldVisible(fieldMap, 'seo_title') ? (
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
                  {isFieldVisible(fieldMap, 'seo_description') ? (
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

function getModelMeta(modelCode: SupportedModelCode) {
  const capabilities = getFormModelCapabilities(modelCode)
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

function createEmptyBaseData(modelCode: SupportedModelCode, defaultColumnId?: number) {
  const capabilities = getFormModelCapabilities(modelCode)
  if (capabilities.supportsCreatedAt) {
    return {
      column_id: defaultColumnId,
      custom_url: '',
      picture: '',
      is_featured_home: 0,
      created_at: '',
    }
  }

  return {
    code: '',
    column_id: defaultColumnId,
    custom_url: '',
    images: [] as string[],
    spec_options_json: [] as string[],
    is_featured_home: 0,
    is_visible: 1,
    sort_order: 0,
  }
}

function createBaseDataFromItem(modelCode: SupportedModelCode, item: ContentItem) {
  const capabilities = getFormModelCapabilities(modelCode)
  if (capabilities.supportsCreatedAt) {
    const sectionItem = item as SectionContentItem
    return {
      column_id: sectionItem.column_id || undefined,
      custom_url: sectionItem.custom_url || '',
      picture: sectionItem.picture || sectionItem.image || '',
      is_featured_home: sectionItem.is_featured_home || sectionItem.is_featured || 0,
      created_at: sectionItem.created_at || '',
    }
  }

  const managedItem = item as ManagedContentItem
  return {
    code: managedItem.code || '',
    column_id: managedItem.column_id || undefined,
    custom_url: managedItem.custom_url || '',
    images: Array.isArray(managedItem.images) ? managedItem.images : [],
    spec_options_json: Array.isArray(managedItem.spec_options) ? managedItem.spec_options : [],
    is_featured_home: managedItem.is_featured_home || 0,
    is_visible: managedItem.is_visible || 1,
    sort_order: managedItem.sort_order || 0,
  }
}

function createEmptyTranslation(modelCode: SupportedModelCode, patch: Partial<ContentItemTranslation> = {}): ContentItemTranslation {
  const capabilities = getFormModelCapabilities(modelCode)
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
  modelCode: SupportedModelCode,
  item: ContentItem,
  defaultLanguageCode: string,
  availableLanguageCodes: string[],
) {
  const capabilities = getFormModelCapabilities(modelCode)
  const source = item.translations || {}
  const output: Record<string, ContentItemTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(modelCode, source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation(modelCode)
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = capabilities.translationNameField === 'title'
      ? createEmptyTranslation(modelCode, {
          title: (item as SectionContentItem).title || '',
          summary: item.summary || '',
          content_html: item.content_html || '',
          seo_title: item.seo_title || '',
          seo_description: item.seo_description || '',
          publish_status: 'published',
        })
      : createEmptyTranslation(modelCode, {
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

function getFormModelCapabilities(modelCode: SupportedModelCode): FormModelCapabilities {
  return FORM_MODEL_CAPABILITIES[modelCode]
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
