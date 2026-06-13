import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { languagesApi } from '@/api/languages'
import { newsApi } from '@/api/news'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ImageUploadField from '@/components/ImageUploadField'
import RichTextEditor from '@/components/RichTextEditor'
import { toast } from 'sonner'
import type { News, NewsTranslation } from '@/types'

interface NewsFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  news?: News
  mode: 'create' | 'edit'
  defaultCategoryId?: number
}

export default function NewsFormDialog({ open, onOpenChange, news, mode, defaultCategoryId = 1 }: NewsFormDialogProps) {
  const queryClient = useQueryClient()
  const [activeLanguage, setActiveLanguage] = useState('zh-CN')
  const [baseData, setBaseData] = useState({
    category_id: defaultCategoryId,
    picture: '',
    is_featured_home: 0,
    created_at: '',
  })
  const [translations, setTranslations] = useState<Record<string, NewsTranslation>>({})

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })

  const { data: newsDetailData } = useQuery({
    queryKey: ['news-detail', news?.id, open],
    queryFn: () => newsApi.get(news!.id, { include_translations: 1 }),
    enabled: open && mode === 'edit' && Boolean(news?.id),
  })

  const languages = languagesData?.data || []
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || 'zh-CN'
  const availableLanguageCodes = languages.map((item) => item.code)
  const currentTranslation = translations[activeLanguage] || createEmptyTranslation()

  useEffect(() => {
    const source = mode === 'edit' ? (newsDetailData?.data || news) : null

    if (source && mode === 'edit') {
      setBaseData({
        category_id: source.category_id || defaultCategoryId,
        picture: source.picture || source.image || '',
        is_featured_home: source.is_featured_home || source.is_featured || 0,
        created_at: source.created_at || '',
      })
      setTranslations(buildInitialTranslations(source, defaultLanguageCode, availableLanguageCodes))
      setActiveLanguage(source.current_language_code || defaultLanguageCode)
      return
    }

    if (mode === 'create') {
      setBaseData({
        category_id: defaultCategoryId,
        picture: '',
        is_featured_home: 0,
        created_at: '',
      })
      setTranslations({
        [defaultLanguageCode]: createEmptyTranslation({ publish_status: 'published' }),
      })
      setActiveLanguage(defaultLanguageCode)
    }
  }, [news, newsDetailData, mode, defaultCategoryId, defaultLanguageCode])

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        base: baseData,
        translations,
      }
      if (mode === 'create') {
        return newsApi.create(payload)
      }
      return newsApi.update(news!.id, payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['news'] })
      queryClient.invalidateQueries({ queryKey: ['news-detail'] })
      toast.success(mode === 'create' ? '创建成功' : '更新成功')
      onOpenChange(false)
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '操作失败')
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!String(translations[defaultLanguageCode]?.title || '').trim()) {
      toast.error('请输入默认语言的标题')
      return
    }
    mutation.mutate()
  }

  const updateTranslation = (patch: Partial<NewsTranslation>) => {
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
          <DialogTitle>{mode === 'create' ? '添加新闻' : '编辑新闻'}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? '填写新闻信息' : '修改新闻信息'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs value={activeLanguage} onValueChange={setActiveLanguage} className="rounded border p-4">
            <div className="space-y-3">
              <div>
                <div className="font-medium">语言内容</div>
                <div className="text-sm text-muted-foreground">当前对标题、摘要、正文和关键词做多语言。</div>
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
                    <Label htmlFor={`title_${language.code}`}>标题 {language.code === defaultLanguageCode ? '*' : ''}</Label>
                    <Input
                      id={`title_${language.code}`}
                      value={(translations[language.code] || createEmptyTranslation()).title || ''}
                      onChange={(e) => {
                        setActiveLanguage(language.code)
                        updateTranslation({ title: e.target.value })
                      }}
                      placeholder="请输入标题"
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
              <Label htmlFor="category_id">分类ID</Label>
              <Input
                id="category_id"
                type="number"
                value={baseData.category_id}
                onChange={(e) => setBaseData({ ...baseData, category_id: parseInt(e.target.value) })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="picture">封面图片</Label>
              <ImageUploadField
                id="picture"
                value={baseData.picture}
                onChange={(picture) => setBaseData({ ...baseData, picture })}
                purpose="news_cover"
                placeholder="请输入封面图片路径"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                <Label htmlFor="created_at">创建时间</Label>
                <Input
                  id="created_at"
                  value={baseData.created_at}
                  onChange={(e) => setBaseData({ ...baseData, created_at: e.target.value })}
                  placeholder="2026-06-13T12:00:00.000Z"
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

function createEmptyTranslation(patch: Partial<NewsTranslation> = {}): NewsTranslation {
  return {
    title: '',
    summary: '',
    content_html: '',
    keywords: '',
    publish_status: 'draft',
    ...patch,
  }
}

function buildInitialTranslations(news: News, defaultLanguageCode: string, availableLanguageCodes: string[]) {
  const source = news.translations || {}
  const output: Record<string, NewsTranslation> = {}

  for (const code of availableLanguageCodes) {
    output[code] = createEmptyTranslation(source[code] || {})
  }

  if (!output[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation()
  }

  if (!source[defaultLanguageCode]) {
    output[defaultLanguageCode] = createEmptyTranslation({
      title: news.title || '',
      summary: news.summary || '',
      content_html: news.content_html || '',
      keywords: news.keywords || '',
      publish_status: 'published',
    })
  }

  return output
}
