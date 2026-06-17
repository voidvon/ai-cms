import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { contentModelsApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { languagesApi } from '@/api/languages'
import { productsApi } from '@/api/products'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImagesUploadField from '@/components/ImagesUploadField'
import RichTextEditor from '@/components/RichTextEditor'
import { getFieldLabel, isFieldEditable, isFieldVisible, mapFieldsByName } from '@/lib/content-model-fields'
import { toast } from 'sonner'
import type { Product, ProductTranslation } from '@/types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product
  mode: 'create' | 'edit'
  defaultColumnId?: number
}

export default function ProductFormDialog({ open, onOpenChange, product, mode, defaultColumnId }: ProductFormDialogProps) {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState({
    code: '',
    column_id: undefined as number | undefined,
    custom_url: '',
    images: [] as string[],
    is_featured_home: 0,
    is_visible: 1,
    sort_order: 0,
  })
  const [translations, setTranslations] = useState<Record<string, ProductTranslation>>({})

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const languages = useMemo(() => languagesData?.data || [], [languagesData?.data])
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = useMemo(() => languages.map((item) => item.code), [languages])

  const { data: productDetailData } = useQuery({
    queryKey: ['product-detail', product?.id, open],
    queryFn: () => productsApi.get(product!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(product?.id),
  })

  const { data: columnsData } = useQuery({
    queryKey: ['columns', defaultLanguageCode],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode }),
  })
  const { data: contentModelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })

  const productModel = (contentModelsData?.data || []).find((item) => item.code === 'product')
  const productColumns = (columnsData?.data || []).filter((item) => (
    Number(item.content_model_id || 0) === Number(productModel?.id || 0)
    && (item.source_type === 'product_root' || item.source_type === 'product_category')
  ))
  const fieldMap = mapFieldsByName(productModel?.fields || [])
  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()

  useEffect(() => {
    const source = mode === 'edit' ? (productDetailData?.data || product) : null

    if (source && mode === 'edit') {
      setBaseData({
        code: source.code || '',
        column_id: source.column_id || undefined,
        custom_url: source.custom_url || '',
        images: Array.isArray(source.images) ? source.images : [],
        is_featured_home: source.is_featured_home || 0,
        is_visible: source.is_visible || 1,
        sort_order: source.sort_order || 0,
      })
      setTranslations(buildInitialTranslations(source, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(source.current_language_code || defaultLanguageCode)
      return
    }

    if (mode === 'create') {
      setBaseData({
        code: '',
        column_id: defaultColumnId,
        custom_url: '',
        images: [],
        is_featured_home: 0,
        is_visible: 1,
        sort_order: 0,
      })
      setTranslations({
        [defaultLanguageCode]: createEmptyTranslation({ publish_status: 'published' }),
      })
      setActiveLanguage(defaultLanguageCode)
    }
  }, [product, productDetailData?.data, mode, defaultColumnId, defaultLanguageCode, availableLanguageCodes.join('|')])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        base: baseData,
        translations,
      }
      if (mode === 'create') {
        return productsApi.create(payload)
      }
      return productsApi.update(product!.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product-detail'] })
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
      toast.error('请输入默认语言的产品名称')
      return
    }
    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<ProductTranslation>) => {
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
      <DialogContent className="w-[80vw] max-w-[80vw] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? '添加产品' : '编辑产品'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写产品信息' : '修改产品信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
            <div className="space-y-3">
              <div>
                <div className="font-medium">语言内容</div>
                <div className="text-sm text-muted-foreground">当前只对名称、摘要、正文和关键词做多语言。</div>
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
                <div className="grid gap-4 md:grid-cols-2">
                  {isFieldVisible(fieldMap, 'name') ? (
                    <div className="space-y-2">
                      <Label htmlFor={`translation_name_${language.code}`}>{getFieldLabel(fieldMap, 'name', '产品名称')} {language.code === defaultLanguageCode ? '*' : ''}</Label>
                      <Input
                        id={`translation_name_${language.code}`}
                        value={(translations[language.code] || createEmptyTranslation()).name || ''}
                        disabled={!isFieldEditable(fieldMap, 'name')}
                        onChange={(e) => {
                          setActiveLanguage(language.code)
                          updateTranslation({ name: e.target.value })
                        }}
                        placeholder="请输入产品名称"
                      />
                    </div>
                  ) : null}
                  {isFieldVisible(fieldMap, 'publish_status') ? (
                    <div className="space-y-2">
                      <Label>{getFieldLabel(fieldMap, 'publish_status', '发布状态')}</Label>
                      <Select
                        value={(translations[language.code] || createEmptyTranslation()).publish_status || 'draft'}
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
                      value={(translations[language.code] || createEmptyTranslation()).summary || ''}
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
                      value={(translations[language.code] || createEmptyTranslation()).content_html || ''}
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
                {isFieldVisible(fieldMap, 'keywords') ? (
                  <div className="space-y-2">
                    <Label htmlFor={`keywords_${language.code}`}>{getFieldLabel(fieldMap, 'keywords', '关键词')}</Label>
                    <Input
                      id={`keywords_${language.code}`}
                      value={(translations[language.code] || createEmptyTranslation()).keywords || ''}
                      disabled={!isFieldEditable(fieldMap, 'keywords')}
                      onChange={(e) => {
                        setActiveLanguage(language.code)
                        updateTranslation({ keywords: e.target.value })
                      }}
                      placeholder="请输入关键词"
                    />
                  </div>
                ) : null}
              </TabsContent>
            ))}
          </Tabs>

          <div className="rounded border p-4 space-y-4">
            <div>
              <div className="font-medium">基础字段</div>
              <div className="text-sm text-muted-foreground">这些字段不区分语言，所有语言共用同一份数据。</div>
            </div>
            {isFieldVisible(fieldMap, 'code') ? (
              <div className="space-y-2">
                <Label htmlFor="code">{getFieldLabel(fieldMap, 'code', '产品编号')}</Label>
                <Input
                  id="code"
                  value={baseData.code}
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
                    <SelectValue placeholder="请选择产品栏目" />
                  </SelectTrigger>
                  <SelectContent>
                    {productColumns.map((column) => (
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
                value={baseData.custom_url}
                onChange={(e) => setBaseData({ ...baseData, custom_url: e.target.value })}
                placeholder="留空则按栏目规则生成，例如 abcd/index.html"
              />
            </div>
            {isFieldVisible(fieldMap, 'images') ? (
              <div className="space-y-2">
                <Label htmlFor="images">{getFieldLabel(fieldMap, 'images', '产品图片')}</Label>
                <div className={!isFieldEditable(fieldMap, 'images') ? 'pointer-events-none opacity-70' : ''}>
                  <ImagesUploadField
                    id="images"
                    value={baseData.images}
                    onChange={(images) => setBaseData({ ...baseData, images })}
                    purpose="product_cover"
                    placeholder="请输入产品图片路径"
                  />
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-4">
              {isFieldVisible(fieldMap, 'is_visible') ? (
                <div className="space-y-2">
                  <Label htmlFor="is_visible">{getFieldLabel(fieldMap, 'is_visible', '显示状态')}</Label>
                  <Select
                    value={baseData.is_visible.toString()}
                    disabled={!isFieldEditable(fieldMap, 'is_visible')}
                    onValueChange={(value) => setBaseData({ ...baseData, is_visible: parseInt(value) })}
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
                    value={baseData.is_featured_home.toString()}
                    disabled={!isFieldEditable(fieldMap, 'is_featured_home')}
                    onValueChange={(value) => setBaseData({ ...baseData, is_featured_home: parseInt(value) })}
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
              {isFieldVisible(fieldMap, 'sort_order') ? (
                <div className="space-y-2">
                  <Label htmlFor="sort_order">{getFieldLabel(fieldMap, 'sort_order', '排序')}</Label>
                  <Input
                    id="sort_order"
                    type="number"
                    disabled={!isFieldEditable(fieldMap, 'sort_order')}
                    value={baseData.sort_order}
                    onChange={(e) => setBaseData({ ...baseData, sort_order: parseInt(e.target.value) })}
                  />
                </div>
              ) : null}
            </div>
          </div>
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

function createEmptyTranslation(patch: Partial<ProductTranslation> = {}): ProductTranslation {
  return {
    name: '',
    summary: '',
    content_html: '',
    keywords: '',
    publish_status: 'draft',
    ...patch,
  }
}

function buildInitialTranslations(product: Product, defaultLanguageCode: string, availableLanguageCodes: string[]) {
  const source = product.translations || {}
  const output: Record<string, ProductTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation()
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation({
      name: product.name || '',
      summary: product.summary || '',
      content_html: product.content_html || '',
      keywords: product.keywords || '',
      publish_status: 'published',
    })
  }

  return output
}
