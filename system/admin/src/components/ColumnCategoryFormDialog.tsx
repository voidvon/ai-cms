import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { columnCategoriesApi } from '@/api/column-categories'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import { languagesApi } from '@/api/languages'
import { Button } from '@/components/ui/button'
import ImagesUploadField from '@/components/ImagesUploadField'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { Column, ColumnCategory, ColumnCategoryTranslation, TemplateBinding } from '@/types'

const DEFAULT_TEMPLATE_VALUE = '__default__'

interface ColumnCategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  rootColumn: Column | null
  category?: ColumnCategory
  currentParentId?: number
  mode: 'create' | 'edit'
}

const FORM_META_BY_DRIVER: Record<string, {
  title: string
  description: string
  dirPlaceholder: string
  detailRuleOptions: string[]
  supportsListTemplate: boolean
  supportsSeo: boolean
}> = {
  managed_category: {
    title: '栏目分类',
    description: '填写列表型栏目分类信息',
    dirPlaceholder: 'steam-traps',
    detailRuleOptions: ['{id}/index.html', '{id}.html'],
    supportsListTemplate: true,
    supportsSeo: true,
  },
  section: {
    title: '栏目分类',
    description: '填写列表型栏目分类信息',
    dirPlaceholder: 'industry-news',
    detailRuleOptions: ['detail/{id}.html', '{id}.html'],
    supportsListTemplate: true,
    supportsSeo: false,
  },
  page_tree: {
    title: '单页栏目',
    description: '填写单页栏目信息',
    dirPlaceholder: 'about-us',
    detailRuleOptions: [],
    supportsListTemplate: false,
    supportsSeo: false,
  },
}

export default function ColumnCategoryFormDialog({
  open,
  onOpenChange,
  rootColumn,
  category,
  currentParentId = 0,
  mode,
}: ColumnCategoryFormDialogProps) {
  const renderDriver = String(rootColumn?.column_semantics?.render_driver || '')
  const rootColumnId = Number(rootColumn?.column_semantics?.root_column_id || rootColumn?.id || 0)
  const meta = FORM_META_BY_DRIVER[renderDriver] || FORM_META_BY_DRIVER.section
  const isSinglePageTree = renderDriver === 'page_tree'
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState({
    parent_id: currentParentId,
    dir_name: '',
    images: [] as string[],
    detail_rule: '',
    sort_order: 0,
  })
  const [singleName, setSingleName] = useState('')
  const [translations, setTranslations] = useState<Record<string, ColumnCategoryTranslation>>({})
  const [listTemplateId, setListTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)
  const [contentTemplateId, setContentTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)
  const [singleTemplateId, setSingleTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
    enabled: open && !isSinglePageTree,
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['column-categories', rootColumnId, 'options'],
    queryFn: () => columnCategoriesApi.listOptions(rootColumnId),
    enabled: open && rootColumnId > 0,
  })

  const { data: categoryDetailData } = useQuery({
    queryKey: ['column-categories', rootColumnId, 'detail', category?.id, open],
    queryFn: () => columnCategoriesApi.get(rootColumnId, category!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(category?.id) && rootColumnId > 0,
  })

  const { data: selectedThemeData } = useQuery({
    queryKey: ['selected-theme'],
    queryFn: () => templateVariantsApi.getSelected(),
    enabled: open,
  })
  const selectedThemeId = selectedThemeData?.data?.id

  const { data: templatesData } = useQuery({
    queryKey: ['templates', selectedThemeId ?? 0],
    queryFn: () => templatesApi.list(undefined, selectedThemeId),
    enabled: open && Boolean(selectedThemeId),
  })

  const { data: bindingsData } = useQuery({
    queryKey: ['template-bindings', selectedThemeId ?? 0],
    queryFn: () => templatesApi.listBindings(selectedThemeId),
    enabled: open && Boolean(selectedThemeId) && mode === 'edit' && Boolean(category?.id),
  })

  const languages = useMemo(() => languagesData?.data || [], [languagesData?.data])
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = useMemo(() => languages.map((item) => item.code), [languages])

  useEffect(() => {
    const source = mode === 'edit' ? (categoryDetailData?.data || category) : null
    if (source && mode === 'edit') {
      setBaseData({
        parent_id: source.parent_id || 0,
        dir_name: source.dir_name || '',
        images: Array.isArray(source.images) ? source.images : [],
        detail_rule: source.detail_rule || '',
        sort_order: source.sort_order || 0,
      })
      if (isSinglePageTree) {
        setTranslations({})
        setSingleName(source.name || '')
      } else {
        setTranslations(buildInitialTranslations(source, defaultLanguageCode, availableLanguageCodes, meta.supportsSeo))
        setActiveLanguage(source.current_language_code || defaultLanguageCode)
        setSingleName('')
      }
      const bindings = bindingsData?.data || []
      const listBinding = bindings.find((item) => item.target_type === 'column' && item.target_id === source.id && item.template_type === 'list')
      const contentBinding = bindings.find((item) => item.target_type === 'column' && item.target_id === source.id && item.template_type === 'content')
      const singleBinding = bindings.find((item) => item.target_type === 'column' && item.target_id === source.id && item.template_type === 'single')
      setListTemplateId(listBinding?.template_id ? String(listBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
      setContentTemplateId(contentBinding?.template_id ? String(contentBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
      setSingleTemplateId(singleBinding?.template_id ? String(singleBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
      return
    }

    if (mode === 'create') {
      setBaseData({
        parent_id: currentParentId,
        dir_name: '',
        images: [],
        detail_rule: '',
        sort_order: 0,
      })
      if (isSinglePageTree) {
        setTranslations({})
        setSingleName('')
      } else {
        setTranslations({
          [defaultLanguageCode]: createEmptyTranslation(meta.supportsSeo),
        })
        setActiveLanguage(defaultLanguageCode)
        setSingleName('')
      }
      setListTemplateId(DEFAULT_TEMPLATE_VALUE)
      setContentTemplateId(DEFAULT_TEMPLATE_VALUE)
      setSingleTemplateId(DEFAULT_TEMPLATE_VALUE)
    }
  }, [category, categoryDetailData?.data, mode, currentParentId, isSinglePageTree, defaultLanguageCode, availableLanguageCodes.join('|'), bindingsData?.data, meta.supportsSeo])

  const mutation = useMutation({
    mutationFn: async () => {
      if (rootColumnId <= 0) {
        throw new Error('根栏目不存在')
      }
      const payload = isSinglePageTree
        ? {
            name: singleName,
            ...baseData,
          }
        : {
            base: baseData,
            translations,
          }
      if (mode === 'create') {
        const response = await columnCategoriesApi.create(rootColumnId, payload)
        const categoryId = response.data?.id
        if (!categoryId) {
          throw new Error('分类创建失败')
        }
        await saveTemplateBindings(selectedThemeId, categoryId, listTemplateId, contentTemplateId, singleTemplateId, bindingsData?.data || [], meta.supportsListTemplate, isSinglePageTree)
        return response
      }
      const response = await columnCategoriesApi.update(rootColumnId, category!.id, payload)
      await saveTemplateBindings(selectedThemeId, category!.id, listTemplateId, contentTemplateId, singleTemplateId, bindingsData?.data || [], meta.supportsListTemplate, isSinglePageTree)
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['column-categories'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (isSinglePageTree) {
      if (!String(singleName || '').trim()) {
        toast.error('请输入栏目名称')
        return
      }
      if (singleTemplateId === DEFAULT_TEMPLATE_VALUE) {
        toast.error('请选择单页模板')
        return
      }
    } else if (!String(translations[defaultLanguageCode]?.name || '').trim()) {
      toast.error('请输入默认语言的分类名称')
      return
    } else if (meta.supportsListTemplate && listTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择列表模板')
      return
    } else if (contentTemplateId === DEFAULT_TEMPLATE_VALUE) {
      toast.error('请选择内容模板')
      return
    }
    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<ColumnCategoryTranslation>) => {
    setTranslations((previous) => ({
      ...previous,
      [activeLanguage]: {
        ...createEmptyTranslation(meta.supportsSeo),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
  }

  const categoryOptions = categoriesData?.data || []
  const templates = templatesData?.data || []
  const listTemplates = templates.filter((item) => item.type === 'list')
  const contentTemplates = templates.filter((item) => item.type === 'content')
  const singleTemplates = templates.filter((item) => item.type === 'single')
  const isEditingWithoutCategory = mode === 'edit' && !category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? `添加${meta.title}` : `编辑${meta.title}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? meta.description : `修改${meta.title}信息`}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!isSinglePageTree ? (
            <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
              <div className="space-y-3">
                <div>
                  <div className="font-medium">语言内容</div>
                  <div className="text-sm text-muted-foreground">分类树结构共用，分类名称按语言维护。</div>
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
                    <Label htmlFor={`name_${language.code}`}>分类名称 {language.code === defaultLanguageCode ? '*' : ''}</Label>
                    <Input
                      id={`name_${language.code}`}
                      value={(translations[language.code] || createEmptyTranslation(meta.supportsSeo)).name || ''}
                      onChange={(e) => {
                        setActiveLanguage(language.code)
                        updateTranslation({ name: e.target.value })
                      }}
                      placeholder="请输入分类名称"
                    />
                  </div>
                  {meta.supportsSeo ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor={`seo_title_${language.code}`}>SEO标题</Label>
                        <Input
                          id={`seo_title_${language.code}`}
                          value={(translations[language.code] || createEmptyTranslation(meta.supportsSeo)).seo_title || ''}
                          onChange={(e) => {
                            setActiveLanguage(language.code)
                            updateTranslation({ seo_title: e.target.value })
                          }}
                          placeholder="请输入SEO标题"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`seo_description_${language.code}`}>SEO描述</Label>
                        <Textarea
                          id={`seo_description_${language.code}`}
                          value={(translations[language.code] || createEmptyTranslation(meta.supportsSeo)).seo_description || ''}
                          onChange={(e) => {
                            setActiveLanguage(language.code)
                            updateTranslation({ seo_description: e.target.value })
                          }}
                          placeholder="请输入SEO描述"
                          rows={3}
                        />
                      </div>
                    </>
                  ) : null}
                </TabsContent>
              ))}
            </Tabs>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="name">栏目名称 *</Label>
              <Input
                id="name"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                placeholder="请输入栏目名称"
              />
            </div>
          )}

          <div className="rounded border p-4 space-y-4">
            <div>
              <div className="font-medium">基础字段</div>
              <div className="text-sm text-muted-foreground">这些字段不区分语言，所有语言共用同一份数据。</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_id">父分类</Label>
              <Select
                value={baseData.parent_id.toString()}
                onValueChange={(value) => setBaseData({ ...baseData, parent_id: parseInt(value, 10) })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">顶级分类</SelectItem>
                  {categoryOptions.map((cat: any) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {'　'.repeat(cat.depth || 0)}{cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="dir_name">栏目目录名</Label>
              <Input
                id="dir_name"
                value={baseData.dir_name}
                onChange={(e) => setBaseData({ ...baseData, dir_name: e.target.value })}
                placeholder={meta.dirPlaceholder}
              />
            </div>
            <div className="space-y-2">
              <Label>栏目图片</Label>
              <ImagesUploadField
                value={baseData.images}
                onChange={(images) => setBaseData({ ...baseData, images })}
                purpose="column_image"
                placeholder="请输入栏目图片路径"
              />
            </div>
            {meta.detailRuleOptions.length > 0 ? (
              <div className="space-y-2">
                <Label>内容页命名规则</Label>
                <Select
                  value={baseData.detail_rule || meta.detailRuleOptions[0]}
                  onValueChange={(value) => setBaseData({ ...baseData, detail_rule: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meta.detailRuleOptions.map((item) => (
                      <SelectItem key={item} value={item}>{item}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="sort_order">排序</Label>
              <Input
                id="sort_order"
                type="number"
                value={baseData.sort_order}
                onChange={(e) => setBaseData({ ...baseData, sort_order: parseInt(e.target.value, 10) || 0 })}
              />
            </div>
            {meta.supportsListTemplate ? (
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
            {isSinglePageTree ? (
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={mutation.isPending || isEditingWithoutCategory}>
              {mutation.isPending ? '提交中...' : '确定'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

async function saveTemplateBindings(
  themeId: number | undefined,
  targetId: number,
  listTemplateId: string,
  contentTemplateId: string,
  singleTemplateId: string,
  bindings: TemplateBinding[],
  supportsListTemplate: boolean,
  isSinglePageTree: boolean,
) {
  if (!themeId) {
    return
  }
  if (isSinglePageTree) {
    await saveTemplateBinding(themeId, targetId, 'single', singleTemplateId, bindings)
    await deleteTemplateBindingIfExists(targetId, 'content', bindings)
    await deleteTemplateBindingIfExists(targetId, 'list', bindings)
    return
  }
  if (supportsListTemplate) {
    await saveTemplateBinding(themeId, targetId, 'list', listTemplateId, bindings)
  }
  await saveTemplateBinding(themeId, targetId, 'content', contentTemplateId, bindings)
  await deleteTemplateBindingIfExists(targetId, 'single', bindings)
}

async function saveTemplateBinding(
  themeId: number,
  targetId: number,
  templateType: 'list' | 'content' | 'single',
  templateId: string,
  _bindings: TemplateBinding[],
) {
  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    throw new Error(`missing required ${templateType} template binding`)
  }
  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: 'column',
    target_id: targetId,
    template_type: templateType,
    template_id: Number(templateId),
  })
}

async function deleteTemplateBindingIfExists(
  targetId: number,
  templateType: 'list' | 'content' | 'single',
  bindings: TemplateBinding[],
) {
  const existing = bindings.find((item) => item.target_type === 'column' && item.target_id === targetId && item.template_type === templateType)
  if (existing?.id) {
    await templatesApi.deleteBinding(existing.id)
  }
}

function createEmptyTranslation(supportsSeo: boolean, patch: Partial<ColumnCategoryTranslation> = {}): ColumnCategoryTranslation {
  return {
    name: '',
    ...(supportsSeo ? { seo_title: '', seo_description: '' } : {}),
    ...patch,
  }
}

function buildInitialTranslations(
  category: ColumnCategory,
  defaultLanguageCode: string,
  availableLanguageCodes: string[],
  supportsSeo: boolean,
) {
  const source = category.translations || {}
  const output: Record<string, ColumnCategoryTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(supportsSeo, source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation(supportsSeo)
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation(supportsSeo, {
      name: category.name || '',
      seo_title: category.seo_title || '',
      seo_description: category.seo_description || '',
    })
  }

  return output
}
