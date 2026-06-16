import { useEffect, useState } from 'react'
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import { templateVariantsApi, templatesApi } from '@/api/advanced'
import { languagesApi } from '@/api/languages'
import { productCategoriesApi } from '@/api/product-categories'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import type { ProductCategory, ProductCategoryTranslation, TemplateBinding } from '@/types'

const DEFAULT_TEMPLATE_VALUE = '__default__'

interface ProductCategoryFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: ProductCategory
  currentParentId?: number
  mode: 'create' | 'edit'
}

export default function ProductCategoryFormDialog({
  open,
  onOpenChange,
  category,
  currentParentId = 0,
  mode
}: ProductCategoryFormDialogProps) {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState({
    parent_id: currentParentId,
    dir_name: '',
    detail_rule: '',
    sort_order: 0,
  })
  const [translations, setTranslations] = useState<Record<string, ProductCategoryTranslation>>({})
  const [listTemplateId, setListTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)
  const [contentTemplateId, setContentTemplateId] = useState(DEFAULT_TEMPLATE_VALUE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['product-categories-options'],
    queryFn: () => productCategoriesApi.listOptions(),
  })

  const { data: categoryDetailData } = useQuery({
    queryKey: ['product-category-detail', category?.id, open],
    queryFn: () => productCategoriesApi.get(category!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(category?.id),
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

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = languages.map((item) => item.code)
  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()

  useEffect(() => {
    const source = mode === 'edit' ? (categoryDetailData?.data || category) : null
    if (source && mode === 'edit') {
      setBaseData({
        parent_id: source.parent_id || 0,
        dir_name: source.dir_name || '',
        detail_rule: source.detail_rule || '',
        sort_order: source.sort_order || 0,
      })
      setTranslations(buildInitialTranslations(source, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(source.current_language_code || defaultLanguageCode)
      const bindings = bindingsData?.data || []
      const listBinding = bindings.find((item) => item.target_type === 'column' && item.target_id === source.id && item.template_type === 'list')
      const contentBinding = bindings.find((item) => item.target_type === 'column' && item.target_id === source.id && item.template_type === 'content')
      setListTemplateId(listBinding?.template_id ? String(listBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
      setContentTemplateId(contentBinding?.template_id ? String(contentBinding.template_id) : DEFAULT_TEMPLATE_VALUE)
      return
    }

    if (mode === 'create') {
      setBaseData({
        parent_id: currentParentId,
        dir_name: '',
        detail_rule: '',
        sort_order: 0,
      })
      setTranslations({
        [defaultLanguageCode]: createEmptyTranslation(),
      })
      setActiveLanguage(defaultLanguageCode)
      setListTemplateId(DEFAULT_TEMPLATE_VALUE)
      setContentTemplateId(DEFAULT_TEMPLATE_VALUE)
    }
  }, [category, categoryDetailData, mode, currentParentId, defaultLanguageCode, availableLanguageCodes, bindingsData])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        base: baseData,
        translations,
      }
      if (mode === 'create') {
        const response = await productCategoriesApi.create(payload)
        const categoryId = response.data?.id
        if (!categoryId) {
          throw new Error('分类创建失败')
        }
        await saveTemplateBindings(selectedThemeId, categoryId, listTemplateId, contentTemplateId, [])
        return response
      }
      const response = await productCategoriesApi.update(category!.id, payload)
      await saveTemplateBindings(selectedThemeId, category!.id, listTemplateId, contentTemplateId, bindingsData?.data || [])
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['product-categories'] })
      queryClient.invalidateQueries({ queryKey: ['product-categories-options'] })
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!String(translations[defaultLanguageCode]?.name || '').trim()) {
      toast.error('请输入默认语言的分类名称')
      return
    }
    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<ProductCategoryTranslation>) => {
    setTranslations((previous) => ({
      ...previous,
      [activeLanguage]: {
        ...createEmptyTranslation(),
        ...(previous[activeLanguage] || {}),
        ...patch,
      },
    }))
  }

  const categoryOptions = categoriesData?.data || []
  const templates = templatesData?.data || []
  const listTemplates = templates.filter((item) => item.type === 'list')
  const contentTemplates = templates.filter((item) => item.type === 'content')
  const isEditingWithoutCategory = mode === 'edit' && !category

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加产品分类' : '编辑产品分类'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写产品分类信息' : '修改产品分类信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
            <div className="space-y-3">
              <div>
                <div className="font-medium">语言内容</div>
                <div className="text-sm text-muted-foreground">分类树结构共用，分类名称和 SEO 文案按语言维护。</div>
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
                    value={(translations[language.code] || createEmptyTranslation()).name || ''}
                    onChange={(e) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ name: e.target.value })
                    }}
                    placeholder="请输入分类名称"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`seo_keywords_${language.code}`}>SEO关键词</Label>
                  <Input
                    id={`seo_keywords_${language.code}`}
                    value={(translations[language.code] || createEmptyTranslation()).seo_keywords || ''}
                    onChange={(e) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ seo_keywords: e.target.value })
                    }}
                    placeholder="请输入SEO关键词"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`seo_description_${language.code}`}>SEO描述</Label>
                  <Textarea
                    id={`seo_description_${language.code}`}
                    value={(translations[language.code] || createEmptyTranslation()).seo_description || ''}
                    onChange={(e) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ seo_description: e.target.value })
                    }}
                    placeholder="请输入SEO描述"
                    rows={3}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <div className="rounded border p-4 space-y-4">
            <div>
              <div className="font-medium">基础字段</div>
              <div className="text-sm text-muted-foreground">这些字段不区分语言，所有语言共用同一份数据。</div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="parent_id">父分类</Label>
              <Select
                value={baseData.parent_id.toString()}
                onValueChange={(value) => setBaseData({ ...baseData, parent_id: parseInt(value) })}
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
                placeholder="steam-traps"
              />
            </div>
            <div className="space-y-2">
              <Label>内容页命名规则</Label>
              <Select
                value={baseData.detail_rule || '{id}/index.html'}
                onValueChange={(value) => setBaseData({ ...baseData, detail_rule: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="{id}/index.html">{'{id}/index.html'}</SelectItem>
                  <SelectItem value="{id}.html">{'{id}.html'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sort_order">排序</Label>
              <Input
                id="sort_order"
                type="number"
                value={baseData.sort_order}
                onChange={(e) => setBaseData({ ...baseData, sort_order: parseInt(e.target.value) || 0 })}
              />
            </div>
            <div className="space-y-2">
              <Label>列表模板</Label>
              <Select value={listTemplateId} onValueChange={setListTemplateId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_TEMPLATE_VALUE}>不单独绑定</SelectItem>
                  {listTemplates.map((template) => (
                    <SelectItem key={template.id} value={String(template.id)}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>内容模板</Label>
              <Select value={contentTemplateId} onValueChange={setContentTemplateId}>
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
  bindings: TemplateBinding[]
) {
  if (!themeId) {
    return
  }
  await saveTemplateBinding(themeId, targetId, 'list', listTemplateId, bindings)
  await saveTemplateBinding(themeId, targetId, 'content', contentTemplateId, bindings)
}

async function saveTemplateBinding(
  themeId: number,
  targetId: number,
  templateType: 'list' | 'content',
  templateId: string,
  bindings: TemplateBinding[]
) {
  const existing = bindings.find((item) => item.target_type === 'column' && item.target_id === targetId && item.template_type === templateType)
  if (templateId === DEFAULT_TEMPLATE_VALUE) {
    if (existing?.id) {
      await templatesApi.deleteBinding(existing.id)
    }
    return
  }
  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: 'column',
    target_id: targetId,
    template_type: templateType,
    template_id: Number(templateId),
  })
}

function createEmptyTranslation(patch: Partial<ProductCategoryTranslation> = {}): ProductCategoryTranslation {
  return {
    name: '',
    seo_keywords: '',
    seo_description: '',
    ...patch,
  }
}

function buildInitialTranslations(category: ProductCategory, defaultLanguageCode: string, availableLanguageCodes: string[]) {
  const source = category.translations || {}
  const output: Record<string, ProductCategoryTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation()
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation({
      name: category.name || '',
      seo_keywords: category.seo_keywords || '',
      seo_description: category.seo_description || '',
    })
  }

  return output
}
