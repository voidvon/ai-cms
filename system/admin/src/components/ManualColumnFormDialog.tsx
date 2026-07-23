import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { filterTopicColumns } from '@/lib/topic-columns'
import type { Column, ColumnTranslation, ContentModel, Template } from '@/types'

export interface ManualColumnFormValue {
  base: {
    parent_id: number
    column_type: 'link' | 'single' | 'list'
    content_model_id: number
    custom_url: string
    dir_name: string
    route_path: string
    detail_rule: string
    sort_order: number
    is_visible: number
  }
  translations: Record<string, ColumnTranslation>
}

interface ManualColumnFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  presentation?: 'dialog' | 'panel'
  mode: 'create' | 'edit'
  column?: Column | null
  initialKind?: 'link' | 'single'
  forceBasicOnly?: boolean
  columns: Column[]
  contentModels: ContentModel[]
  listTemplates: Template[]
  contentTemplates: Template[]
  singleTemplates: Template[]
  initialListTemplateId: string
  initialContentTemplateId: string
  initialSingleTemplateId: string
  submitting: boolean
  onSubmit: (value: ManualColumnFormValue, templateIds: { listTemplateId: string; contentTemplateId: string; singleTemplateId: string }) => void
}

const DEFAULT_TEMPLATE_VALUE = '__default__'
const BASE_TAB_VALUE = '__base__'
const MODEL_DETAIL_RULE_OPTIONS = {
  news: [
    { value: 'detail/{id}.html', label: 'detail/{id}.html' },
    { value: '{id}.html', label: '{id}.html' },
  ],
  product: [
    { value: '{id}/index.html', label: '{id}/index.html' },
    { value: '{id}.html', label: '{id}.html' },
  ],
} as const

export default function ManualColumnFormDialog({
  open,
  onOpenChange,
  presentation = 'dialog',
  mode,
  column,
  initialKind = 'link',
  forceBasicOnly = false,
  columns,
  contentModels,
  listTemplates,
  contentTemplates,
  singleTemplates,
  initialListTemplateId,
  initialContentTemplateId,
  initialSingleTemplateId,
  submitting,
  onSubmit
}: ManualColumnFormDialogProps) {
  const [activeLanguage, setActiveLanguage] = useState(BASE_TAB_VALUE)
  const [baseData, setBaseData] = useState<ManualColumnFormValue['base']>({
    parent_id: 0,
    column_type: initialKind,
    content_model_id: 0,
    custom_url: '',
    dir_name: '',
    route_path: '',
    detail_rule: '',
    sort_order: 0,
    is_visible: 1
  })
  const [translations, setTranslations] = useState<Record<string, ColumnTranslation>>({})
  const [listTemplateId, setListTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)
  const [contentTemplateId, setContentTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)
  const [singleTemplateId, setSingleTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = useMemo(() => languages.map((item) => item.code), [languages])
  const basicOnly = forceBasicOnly || (mode === 'edit' && column?.column_type === 'list')
  const detailRuleOptions = basicOnly
    ? getDetailRuleOptions(column?.model_code)
    : []
  const nonTopicColumns = useMemo(() => filterTopicColumns(columns), [columns])

  useEffect(() => {
    if (!open) {
      return
    }

    if (mode === 'edit' && column) {
      const nextBaseData: ManualColumnFormValue['base'] = {
        parent_id: Number(column.parent_id || 0),
        column_type: column.column_type === 'single' ? 'single' : (column.column_type === 'list' ? 'list' : 'link'),
        content_model_id: Number(column.content_model_id || 0),
        custom_url: column.custom_url || '',
        dir_name: column.dir_name || '',
        route_path: column.route_path || '',
        detail_rule: column.detail_rule || '',
        sort_order: Number(column.sort_order || 0),
        is_visible: Number(column.is_visible ?? 1)
      }
      setBaseData((previous) => shallowEqualBaseData(previous, nextBaseData) ? previous : nextBaseData)
      setTranslations((previous) => {
        const nextTranslations = buildInitialTranslations(column, defaultLanguageCode, availableLanguageCodes)
        return JSON.stringify(previous) === JSON.stringify(nextTranslations) ? previous : nextTranslations
      })
      setActiveLanguage(BASE_TAB_VALUE)
      setListTemplateId((previous) => previous === (initialListTemplateId || DEFAULT_TEMPLATE_VALUE) ? previous : (initialListTemplateId || DEFAULT_TEMPLATE_VALUE))
      setContentTemplateId((previous) => previous === (initialContentTemplateId || DEFAULT_TEMPLATE_VALUE) ? previous : (initialContentTemplateId || DEFAULT_TEMPLATE_VALUE))
      setSingleTemplateId((previous) => previous === (initialSingleTemplateId || DEFAULT_TEMPLATE_VALUE) ? previous : (initialSingleTemplateId || DEFAULT_TEMPLATE_VALUE))
      return
    }

    const nextBaseData: ManualColumnFormValue['base'] = {
      parent_id: 0,
      column_type: initialKind,
      content_model_id: 0,
      custom_url: '',
      dir_name: '',
      route_path: '',
      detail_rule: '',
      sort_order: 0,
      is_visible: 1
    }
    setBaseData((previous) => shallowEqualBaseData(previous, nextBaseData) ? previous : nextBaseData)
    setTranslations((previous) => {
      const nextTranslations = {
        [defaultLanguageCode]: createEmptyTranslation()
      }
      return JSON.stringify(previous) === JSON.stringify(nextTranslations) ? previous : nextTranslations
    })
    setActiveLanguage(BASE_TAB_VALUE)
    setListTemplateId((previous) => previous === DEFAULT_TEMPLATE_VALUE ? previous : DEFAULT_TEMPLATE_VALUE)
    setContentTemplateId((previous) => previous === DEFAULT_TEMPLATE_VALUE ? previous : DEFAULT_TEMPLATE_VALUE)
    setSingleTemplateId((previous) => previous === DEFAULT_TEMPLATE_VALUE ? previous : DEFAULT_TEMPLATE_VALUE)
  }, [open, mode, column?.id, initialKind, initialListTemplateId, initialContentTemplateId, initialSingleTemplateId, defaultLanguageCode, availableLanguageCodes])

  const parentOptions = useMemo(() => {
    return nonTopicColumns.filter((item) => {
      if (mode === 'edit' && column && item.id === column.id) {
        return false
      }
      return String(item.column_type || 'list') !== 'single'
    })
  }, [nonTopicColumns, mode, column])

  function getDetailRuleOptions(modelCode?: string | null) {
    const normalizedModelCode = String(modelCode || '').trim() as keyof typeof MODEL_DETAIL_RULE_OPTIONS
    return MODEL_DETAIL_RULE_OPTIONS[normalizedModelCode]
      ? [...MODEL_DETAIL_RULE_OPTIONS[normalizedModelCode]]
      : []
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const defaultName = String(translations[defaultLanguageCode]?.name || '').trim()
    if (!defaultName) {
      toast.error('请输入默认语言的栏目名称')
      return
    }
    if (baseData.column_type === 'single') {
      if (singleTemplateId === DEFAULT_TEMPLATE_VALUE) {
        toast.error('请选择单页模板')
        return
      }
    } else {
      if (listTemplateId === DEFAULT_TEMPLATE_VALUE) {
        toast.error('请选择列表模板')
        return
      }
      if (contentTemplateId === DEFAULT_TEMPLATE_VALUE) {
        toast.error('请选择内容模板')
        return
      }
    }
    for (const [languageCode, translation] of Object.entries(translations)) {
      const raw = String(translation?.template_data_json || '').trim()
      if (!raw) {
        continue
      }
      try {
        JSON.parse(raw)
      } catch {
        toast.error(`模板 JSON 数据格式不正确：${languageCode}`)
        return
      }
    }
    onSubmit({
      base: baseData,
      translations,
    }, {
      listTemplateId,
      contentTemplateId,
      singleTemplateId,
    })
  }

  const updateTranslation = (patch: Partial<ColumnTranslation>) => {
    setTranslations((previous) => ({
      ...previous,
      [activeLanguage]: {
        ...createEmptyTranslation(),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
  }

  const handleFormatTemplateDataJson = (languageCode: string) => {
    const raw = String(translations[languageCode]?.template_data_json || '').trim()
    if (!raw) {
      return
    }
    try {
      const parsed = JSON.parse(raw)
      setActiveLanguage(languageCode)
      updateTranslation({ template_data_json: JSON.stringify(parsed, null, 2) })
    } catch {
      toast.error(`模板 JSON 数据格式不正确：${languageCode}`)
    }
  }

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="space-y-4">
            <div className="w-full max-w-full overflow-x-auto overscroll-x-contain pb-1">
              <TabsList className="w-max min-w-full justify-start">
                <TabsTrigger className="flex-none" value={BASE_TAB_VALUE}>基础数据</TabsTrigger>
                {languages.map((language) => (
                  <TabsTrigger className="flex-none" key={language.id} value={language.code}>
                    {language.name}
                    {language.code === defaultLanguageCode ? ' *' : ''}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {languages.map((language) => (
              <TabsContent key={language.id} value={language.code}>
                <div className="space-y-2">
                  <Label htmlFor={`manual-column-name_${language.code}`}>栏目名称 {language.code === defaultLanguageCode ? '*' : ''}</Label>
                  <Input
                    id={`manual-column-name_${language.code}`}
                    value={(translations[language.code] || createEmptyTranslation()).name || ''}
                    onChange={(event) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ name: event.target.value })
                    }}
                    placeholder="请输入栏目名称"
                  />
                </div>

                {!basicOnly && baseData.column_type === 'single' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`manual-column-content_${language.code}`}>页面内容</Label>
                      <Textarea
                        id={`manual-column-content_${language.code}`}
                        className="min-h-[220px]"
                        value={(translations[language.code] || createEmptyTranslation()).content_html || ''}
                        onChange={(event) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ content_html: event.target.value })
                        }}
                        placeholder="请输入单页内容 HTML"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <Label htmlFor={`manual-column-template-data_${language.code}`}>模板 JSON 数据</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleFormatTemplateDataJson(language.code)}
                        >
                          格式化 JSON
                        </Button>
                      </div>
                      <Textarea
                        id={`manual-column-template-data_${language.code}`}
                        className="min-h-[180px] font-mono text-xs"
                        value={(translations[language.code] || createEmptyTranslation()).template_data_json || ''}
                        onChange={(event) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ template_data_json: event.target.value })
                        }}
                        placeholder={'例如：{\n  "heroTitle": "与我们的专家讨论您的需求",\n  "contacts": []\n}'}
                      />
                      <div className="text-xs text-muted-foreground">
                        每种语言可配置一份自定义 JSON。单页模板中可通过 `props.templateData` 读取对象，通过 `props.templateDataJson` 读取原始字符串。
                      </div>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`manual-column-seo-title_${language.code}`}>SEO 标题</Label>
                        <Input
                          id={`manual-column-seo-title_${language.code}`}
                          value={(translations[language.code] || createEmptyTranslation()).seo_title || ''}
                          onChange={(event) => {
                            setActiveLanguage(language.code)
                            updateTranslation({ seo_title: event.target.value })
                          }}
                          placeholder="可选"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`manual-column-seo-description_${language.code}`}>SEO 描述</Label>
                      <Textarea
                        id={`manual-column-seo-description_${language.code}`}
                        value={(translations[language.code] || createEmptyTranslation()).seo_description || ''}
                        onChange={(event) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ seo_description: event.target.value })
                        }}
                        placeholder="可选"
                      />
                    </div>
                  </>
                ) : null}
              </TabsContent>
            ))}
          <TabsContent value={BASE_TAB_VALUE} className="mt-4">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {!basicOnly ? (
              <div className="space-y-2">
                <Label>栏目类型</Label>
                <Select
                  disabled={mode === 'edit'}
                  value={baseData.column_type}
                  onValueChange={(value: 'link' | 'single') => setBaseData({ ...baseData, column_type: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="link">链接栏目</SelectItem>
                    <SelectItem value="single">单页栏目</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              ) : null}
              <div className="space-y-2">
                <Label>父栏目</Label>
                <Select
                  value={String(baseData.parent_id)}
                  onValueChange={(value) => setBaseData({ ...baseData, parent_id: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">顶级栏目</SelectItem>
                    {parentOptions.map((item) => (
                      <SelectItem key={item.id} value={String(item.id)}>
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>内容模型</Label>
                <Select
                  value={String(baseData.content_model_id)}
                  onValueChange={(value) => setBaseData({ ...baseData, content_model_id: Number(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">不绑定</SelectItem>
                    {contentModels.map((model) => (
                      <SelectItem key={model.id} value={String(model.id)}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="manual-column-sort">排序</Label>
                <Input
                  id="manual-column-sort"
                  type="number"
                  value={String(baseData.sort_order)}
                  onChange={(event) => setBaseData({ ...baseData, sort_order: Number.parseInt(event.target.value || '0', 10) || 0 })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="manual-column-show-nav">显示在导航栏</Label>
                <div className="flex items-center space-x-2 h-10">
                  <Switch
                    id="manual-column-show-nav"
                    checked={baseData.is_visible === 1}
                    onCheckedChange={(checked) => setBaseData({ ...baseData, is_visible: checked ? 1 : 0 })}
                  />
                  <Label htmlFor="manual-column-show-nav" className="cursor-pointer">
                    {baseData.is_visible === 1 ? '显示' : '隐藏'}
                  </Label>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {baseData.column_type !== 'single' ? (
                <div className="space-y-2">
                  <Label>列表模板</Label>
                  <Select value={listTemplateId} onValueChange={setListTemplateId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_TEMPLATE_VALUE}>请选择列表模板</SelectItem>
                    {listTemplates.map((template) => (
                      <SelectItem key={template.id} value={String(template.id)}>
                        {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {baseData.column_type === 'single' ? (
                <div className="space-y-2">
                  <Label>单页模板</Label>
                  <Select value={singleTemplateId} onValueChange={setSingleTemplateId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_TEMPLATE_VALUE}>请选择单页模板</SelectItem>
                      {singleTemplates.map((template) => (
                        <SelectItem key={template.id} value={String(template.id)}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>内容模板</Label>
                  <Select value={contentTemplateId} onValueChange={setContentTemplateId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_TEMPLATE_VALUE}>请选择内容模板</SelectItem>
                      {contentTemplates.map((template) => (
                        <SelectItem key={template.id} value={String(template.id)}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            {!basicOnly && baseData.column_type === 'link' ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="manual-column-url">链接地址</Label>
                  <Input
                    id="manual-column-url"
                    value={baseData.custom_url}
                    onChange={(event) => setBaseData({ ...baseData, custom_url: event.target.value })}
                    placeholder="/ 或 https://example.com"
                  />
                </div>
              </>
            ) : !basicOnly ? (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="manual-column-dir-name">栏目目录名</Label>
                  <Input
                    id="manual-column-dir-name"
                    value={baseData.dir_name}
                    onChange={(event) => setBaseData({ ...baseData, dir_name: event.target.value })}
                    placeholder="about-us"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-column-path">完整访问路径</Label>
                  <Input
                    id="manual-column-path"
                    value={baseData.route_path}
                    onChange={(event) => setBaseData({ ...baseData, route_path: event.target.value })}
                    placeholder="/about-us/"
                  />
                </div>
                {detailRuleOptions.length > 0 ? (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="manual-column-detail-rule">内容页命名规则</Label>
                    <Select
                      value={baseData.detail_rule || detailRuleOptions[0].value}
                      onValueChange={(value) => setBaseData({ ...baseData, detail_rule: value })}
                    >
                      <SelectTrigger id="manual-column-detail-rule">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {detailRuleOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          </TabsContent>
          </Tabs>

          <DialogFooter>
            {presentation === 'dialog' ? (
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
            ) : null}
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : mode === 'create' ? '确定' : '保存栏目配置'}
            </Button>
          </DialogFooter>
    </form>
  )

  if (presentation === 'panel') {
    return form
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增栏目' : '编辑栏目'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '可创建链接栏目或单页栏目。' : '修改当前栏目的展示与页面信息。'}
          </DialogDescription>
        </DialogHeader>
        {form}
      </DialogContent>
    </Dialog>
  )
}

function createEmptyTranslation(patch: Partial<ColumnTranslation> = {}): ColumnTranslation {
  return {
    name: '',
    content_html: '',
    template_data_json: '',
    seo_title: '',
    seo_description: '',
    ...patch,
  }
}

function buildInitialTranslations(column: Column, defaultLanguageCode: string, availableLanguageCodes: string[]) {
  const source = column.translations || {}
  const output: Record<string, ColumnTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation()
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation({
      name: column.name || '',
      content_html: column.content_html || '',
      template_data_json: column.template_data_json || '',
      seo_title: column.seo_title || '',
      seo_description: column.seo_description || '',
    })
  }

  return output
}

function shallowEqualBaseData(left: ManualColumnFormValue['base'], right: ManualColumnFormValue['base']) {
  return left.parent_id === right.parent_id
    && left.column_type === right.column_type
    && left.content_model_id === right.content_model_id
    && left.custom_url === right.custom_url
    && left.dir_name === right.dir_name
    && left.route_path === right.route_path
    && left.detail_rule === right.detail_rule
    && left.sort_order === right.sort_order
    && left.is_visible === right.is_visible
}
