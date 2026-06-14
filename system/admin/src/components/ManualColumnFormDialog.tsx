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
import type { Column, ColumnTranslation, Template } from '@/types'

export interface ManualColumnFormValue {
  base: {
    parent_id: number
    column_kind: 'link' | 'single'
    custom_url: string
    route_path: string
    open_in_new_tab: number
    sort_order: number
    show_in_nav: number
  }
  translations: Record<string, ColumnTranslation>
}

interface ManualColumnFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  column?: Column | null
  initialKind?: 'link' | 'single'
  forceBasicOnly?: boolean
  columns: Column[]
  templates: Template[]
  initialTemplateId: string
  submitting: boolean
  onSubmit: (value: ManualColumnFormValue, templateId: string) => void
}

const DEFAULT_TEMPLATE_VALUE = '__default__'

export default function ManualColumnFormDialog({
  open,
  onOpenChange,
  mode,
  column,
  initialKind = 'link',
  forceBasicOnly = false,
  columns,
  templates,
  initialTemplateId,
  submitting,
  onSubmit
}: ManualColumnFormDialogProps) {
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState<ManualColumnFormValue['base']>({
    parent_id: 0,
    column_kind: initialKind,
    custom_url: '',
    route_path: '',
    open_in_new_tab: 0,
    sort_order: 0,
    show_in_nav: 1
  })
  const [translations, setTranslations] = useState<Record<string, ColumnTranslation>>({})
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = languages.map((item) => item.code)
  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()
  const basicOnly = forceBasicOnly || (mode === 'edit' && column?.column_kind === 'category')

  useEffect(() => {
    if (!open) {
      return
    }

    if (mode === 'edit' && column) {
      setBaseData({
        parent_id: Number(column.parent_id || 0),
        column_kind: column.column_kind === 'single' ? 'single' : 'link',
        custom_url: column.custom_url || '',
        route_path: column.route_path || '',
        open_in_new_tab: Number(column.open_in_new_tab || 0),
        sort_order: Number(column.sort_order || 0),
        show_in_nav: Number(column.show_in_nav ?? 1)
      })
      setTranslations(buildInitialTranslations(column, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(column.current_language_code || defaultLanguageCode)
      setTemplateId(initialTemplateId || DEFAULT_TEMPLATE_VALUE)
      return
    }

    setBaseData({
      parent_id: 0,
      column_kind: initialKind,
      custom_url: '',
      route_path: '',
      open_in_new_tab: 0,
      sort_order: 0,
      show_in_nav: 1
    })
    setTranslations({
      [defaultLanguageCode]: createEmptyTranslation()
    })
    setActiveLanguage(defaultLanguageCode)
    setTemplateId(DEFAULT_TEMPLATE_VALUE)
  }, [open, mode, column, initialKind, initialTemplateId, defaultLanguageCode])

  const parentOptions = useMemo(() => {
    return columns.filter((item) => {
      if (mode === 'edit' && column && item.id === column.id) {
        return false
      }
      return String(item.column_kind || 'category') !== 'single'
    })
  }, [columns, mode, column])

  const contentTemplates = useMemo(
    () => templates.filter((item) => item.type === 'content'),
    [templates]
  )

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    onSubmit({
      base: baseData,
      translations,
    }, templateId)
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '新增栏目' : '编辑栏目'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '可创建链接栏目或单页栏目。' : '修改当前栏目的展示与页面信息。'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
            <div className="space-y-3">
              <div>
                <div className="font-medium">语言内容</div>
                <div className="text-sm text-muted-foreground">栏目名称与单页文案按语言维护，切换标签后编辑对应语言内容。</div>
              </div>
              <TabsList className="w-full justify-start">
                {languages.map((language) => (
                  <TabsTrigger key={language.id} value={language.code}>
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

                {!basicOnly && baseData.column_kind === 'single' ? (
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
                      <div className="space-y-2">
                        <Label htmlFor={`manual-column-seo-keywords_${language.code}`}>SEO 关键词</Label>
                        <Input
                          id={`manual-column-seo-keywords_${language.code}`}
                          value={(translations[language.code] || createEmptyTranslation()).seo_keywords || ''}
                          onChange={(event) => {
                            setActiveLanguage(language.code)
                            updateTranslation({ seo_keywords: event.target.value })
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
          </Tabs>

          <div className="rounded border p-4 space-y-4">
            <div>
              <div className="font-medium">基础字段</div>
              <div className="text-sm text-muted-foreground">这些字段不区分语言，所有语言共用同一份数据。</div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              {!basicOnly ? (
              <div className="space-y-2">
                <Label>栏目类型</Label>
                <Select
                  disabled={mode === 'edit'}
                  value={baseData.column_kind}
                  onValueChange={(value: 'link' | 'single') => setBaseData({ ...baseData, column_kind: value })}
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
                    checked={baseData.show_in_nav === 1}
                    onCheckedChange={(checked) => setBaseData({ ...baseData, show_in_nav: checked ? 1 : 0 })}
                  />
                  <Label htmlFor="manual-column-show-nav" className="cursor-pointer">
                    {baseData.show_in_nav === 1 ? '显示' : '隐藏'}
                  </Label>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              {!basicOnly && baseData.column_kind === 'single' ? (
                <div className="space-y-2">
                  <Label>内容模板</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
                      {contentTemplates.map((template) => (
                        <SelectItem key={template.id} value={String(template.id)}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            {!basicOnly && baseData.column_kind === 'link' ? (
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
                <div className="space-y-2">
                  <Label>打开方式</Label>
                  <Select
                    value={String(baseData.open_in_new_tab)}
                    onValueChange={(value) => setBaseData({ ...baseData, open_in_new_tab: Number(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">当前窗口</SelectItem>
                      <SelectItem value="1">新窗口</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            ) : !basicOnly ? (
              <div className="space-y-2">
                <Label htmlFor="manual-column-path">访问路径</Label>
                <Input
                  id="manual-column-path"
                  value={baseData.route_path}
                  onChange={(event) => setBaseData({ ...baseData, route_path: event.target.value })}
                  placeholder="/contact/"
                />
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? '保存中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function createEmptyTranslation(patch: Partial<ColumnTranslation> = {}): ColumnTranslation {
  return {
    name: '',
    content_html: '',
    seo_title: '',
    seo_keywords: '',
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
      seo_title: column.seo_title || '',
      seo_keywords: column.seo_keywords || '',
      seo_description: column.seo_description || '',
    })
  }

  return output
}
