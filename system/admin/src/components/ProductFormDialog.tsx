import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { toast } from 'sonner'
import type { Product, ProductTranslation } from '@/types'

interface ProductFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  product?: Product
  mode: 'create' | 'edit'
  defaultCategoryId?: number
}

export default function ProductFormDialog({ open, onOpenChange, product, mode, defaultCategoryId = 1 }: ProductFormDialogProps) {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState({
    code: '',
    category_id: defaultCategoryId,
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

  const { data: productDetailData } = useQuery({
    queryKey: ['product-detail', product?.id, open],
    queryFn: () => productsApi.get(product!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(product?.id),
  })

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = languages.map((item) => item.code)
  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()

  useEffect(() => {
    const source = mode === 'edit' ? (productDetailData?.data || product) : null

    if (source && mode === 'edit') {
      setBaseData({
        code: source.code || '',
        category_id: source.category_id || 1,
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
        category_id: defaultCategoryId,
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
  }, [product, productDetailData, mode, defaultCategoryId, defaultLanguageCode])

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
                  <div className="space-y-2">
                    <Label htmlFor={`translation_name_${language.code}`}>产品名称 {language.code === defaultLanguageCode ? '*' : ''}</Label>
                    <Input
                      id={`translation_name_${language.code}`}
                      value={(translations[language.code] || createEmptyTranslation()).name || ''}
                      onChange={(e) => {
                        setActiveLanguage(language.code)
                        updateTranslation({ name: e.target.value })
                      }}
                      placeholder="请输入产品名称"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>发布状态</Label>
                    <Select
                      value={(translations[language.code] || createEmptyTranslation()).publish_status || 'draft'}
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
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`summary_${language.code}`}>摘要</Label>
                  <Textarea
                    id={`summary_${language.code}`}
                    value={(translations[language.code] || createEmptyTranslation()).summary || ''}
                    onChange={(e) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ summary: e.target.value })
                    }}
                    placeholder="请输入摘要"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>详细内容</Label>
                  <RichTextEditor
                    value={(translations[language.code] || createEmptyTranslation()).content_html || ''}
                    onChange={(content_html) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ content_html })
                    }}
                    placeholder="请输入详细内容"
                    uploadPurpose="richtext_image"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`keywords_${language.code}`}>关键词</Label>
                  <Input
                    id={`keywords_${language.code}`}
                    value={(translations[language.code] || createEmptyTranslation()).keywords || ''}
                    onChange={(e) => {
                      setActiveLanguage(language.code)
                      updateTranslation({ keywords: e.target.value })
                    }}
                    placeholder="请输入关键词"
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
              <Label htmlFor="code">产品编号</Label>
              <Input
                id="code"
                value={baseData.code}
                onChange={(e) => setBaseData({ ...baseData, code: e.target.value })}
                placeholder="请输入产品编号"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category_id">分类ID</Label>
              <Input
                id="category_id"
                type="number"
                value={baseData.category_id}
                onChange={(e) => setBaseData({ ...baseData, category_id: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="images">产品图片</Label>
              <ImagesUploadField
                id="images"
                value={baseData.images}
                onChange={(images) => setBaseData({ ...baseData, images })}
                purpose="product_cover"
                placeholder="请输入产品图片路径"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="is_visible">显示状态</Label>
                <Select
                  value={baseData.is_visible.toString()}
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
              <div className="space-y-2">
                <Label htmlFor="is_featured_home">推荐</Label>
                <Select
                  value={baseData.is_featured_home.toString()}
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
              <div className="space-y-2">
                <Label htmlFor="sort_order">排序</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={baseData.sort_order}
                  onChange={(e) => setBaseData({ ...baseData, sort_order: parseInt(e.target.value) })}
                />
              </div>
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
