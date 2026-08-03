import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { contentModelsApi, templateVariantsApi, templatesApi } from '@/api/advanced'
import { columnsApi } from '@/api/columns'
import { contentItemsApi } from '@/api/content-items'
import { languagesApi } from '@/api/languages'
import { topicProfilesApi, type TopicProfile, type TopicProfilePayload } from '@/api/topic-profiles'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import RichTextEditor from '@/components/RichTextEditor'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar'
import { SidebarTreeMenu, type SidebarTreeMenuItem } from '@/components/SidebarTreeMenu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useIsMobile } from '@/hooks/use-mobile'
import { isContentManagementModel } from '@/lib/content-models'
import { resolveTopicColumns } from '@/lib/topic-columns'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { Column, ContentModel, ManagedContentItem, TemplateBinding } from '@/types'

type ListedContentItem = ManagedContentItem

interface RelatedContentRef {
  model: string
  id: number
}

interface TopicLanguageDraft {
  name: string
  profile: TopicProfilePayload
}

interface TopicColumnTreeNode {
  column: Column
  children: TopicColumnTreeNode[]
}

const EMPTY_PROFILE: TopicProfilePayload = {
  seo_title: '',
  intro_html: '',
  topic_keyword: '',
  related_content_json: '[]',
  publish_status: 'draft',
  sort_order: 0,
}
const NO_TOPIC_TEMPLATE_VALUE = '__none__'
const BASE_TAB_VALUE = 'base'

export default function TopicManagementPage() {
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const [selectedColumnId, setSelectedColumnId] = useState('')
  const [contentPickerOpen, setContentPickerOpen] = useState(false)
  const [contentPickerModelCode, setContentPickerModelCode] = useState('')
  const [contentPickerKeyword, setContentPickerKeyword] = useState('')
  const [topicTemplateId, setTopicTemplateId] = useState(NO_TOPIC_TEMPLATE_VALUE)
  const [topicRoutePath, setTopicRoutePath] = useState('')
  const [languageDrafts, setLanguageDrafts] = useState<Record<string, TopicLanguageDraft>>({})
  const [baseRelatedContentJson, setBaseRelatedContentJson] = useState('[]')
  const [activeTab, setActiveTab] = useState(BASE_TAB_VALUE)

  const { data: languagesData } = useQuery({
    queryKey: ['languages'],
    queryFn: () => languagesApi.list(),
  })
  const languages = useMemo(() => (languagesData?.data || []).filter((item) => item.is_enabled !== 0), [languagesData?.data])
  const defaultLanguageCode = languages.find((item) => item.is_default === 1)?.code || languages[0]?.code || 'zh-CN'
  const selectedTab = activeTab || BASE_TAB_VALUE
  const activeLanguageCode = selectedTab === BASE_TAB_VALUE ? defaultLanguageCode : selectedTab
  const fillEditorHeight = !isMobile

  const { data: columnsData, isLoading: columnsLoading } = useQuery({
    queryKey: ['columns', defaultLanguageCode, 'topic-management'],
    queryFn: () => columnsApi.list({ language: defaultLanguageCode, include_translations: 1 }),
  })
  const profileQueries = useQueries({
    queries: languages.map((language) => ({
      queryKey: ['topic-profiles', language.code],
      queryFn: () => topicProfilesApi.list({ language: language.code }),
      enabled: Boolean(language.code),
    })),
  })
  const { data: modelsData } = useQuery({
    queryKey: ['content-models'],
    queryFn: () => contentModelsApi.list(),
  })
  const { data: themesData } = useQuery({
    queryKey: ['themes'],
    queryFn: () => templateVariantsApi.list(),
  })

  const columns = columnsData?.data || []
  const contentModels = useMemo(
    () => (modelsData?.data || []).filter(isContentManagementModel),
    [modelsData?.data],
  )
  const selectedTheme = useMemo(
    () => (themesData?.data || []).find((item) => item.is_selected === 1) || (themesData?.data || [])[0] || null,
    [themesData?.data],
  )
  const selectedThemeId = selectedTheme?.id || 0
  const { data: topicTemplatesData } = useQuery({
    queryKey: ['templates', selectedThemeId, 'topic'],
    queryFn: () => templatesApi.list('topic', selectedThemeId),
    enabled: Boolean(selectedThemeId),
  })
  const { data: templateBindingsData } = useQuery({
    queryKey: ['template-bindings', selectedThemeId],
    queryFn: () => templatesApi.listBindings(selectedThemeId),
    enabled: Boolean(selectedThemeId),
  })
  const topicTemplates = topicTemplatesData?.data || []
  const templateBindings = templateBindingsData?.data || []
  const topicColumns = useMemo(() => resolveTopicColumns(columns), [columns])
  const relatedContentRefs = useMemo(() => parseRelatedContentRefs(baseRelatedContentJson), [baseRelatedContentJson])
  const contentPickerModel = useMemo(
    () => contentModels.find((model) => model.code === contentPickerModelCode) || contentModels[0] || null,
    [contentModels, contentPickerModelCode],
  )
  const profileMapsByLanguage = useMemo(() => {
    const output = new Map<string, Map<number, TopicProfile>>()
    languages.forEach((language, index) => {
      const profiles = profileQueries[index]?.data?.data || []
      output.set(language.code, new Map(profiles.map((profile) => [profile.column_id, profile])))
    })
    return output
  }, [
    languages,
    JSON.stringify(profileQueries.map((query) => (query.data?.data || []).map((profile) => [
      profile.column_id,
      profile.current_language_code,
      profile.is_language_fallback,
      profile.updated_at,
    ]))),
  ])
  const selectedColumn = selectedColumnId
    ? topicColumns.find((column) => column.id === Number.parseInt(selectedColumnId, 10)) || null
    : null
  const selectedTopicTemplateBinding = useMemo(() => {
    if (!selectedColumn) {
      return null
    }
    return templateBindings.find((binding) => (
      binding.target_type === 'column'
      && binding.target_id === selectedColumn.id
      && binding.template_type === 'topic'
    )) || null
  }, [selectedColumn, templateBindings])

  useEffect(() => {
    if (!selectedColumnId && topicColumns.length > 0) {
      setSelectedColumnId(String(topicColumns[0].id))
    }
  }, [selectedColumnId, topicColumns])

  useEffect(() => {
    if (activeTab !== BASE_TAB_VALUE && !languages.some((language) => language.code === activeTab)) {
      setActiveTab(BASE_TAB_VALUE)
    }
  }, [activeTab, languages])

  useEffect(() => {
    if (!selectedColumn) {
      setTopicRoutePath('')
      setLanguageDrafts({})
      return
    }
    setTopicRoutePath(selectedColumn.dir_name || '')
    const nextDrafts: Record<string, TopicLanguageDraft> = {}
    for (const language of languages) {
      const profile = profileMapsByLanguage.get(language.code)?.get(selectedColumn.id) || null
      nextDrafts[language.code] = {
        name: resolveTopicColumnTranslationName(selectedColumn, language.code, defaultLanguageCode),
        profile: profileToForm(profile, { ignoreFallback: true }),
      }
    }
    setLanguageDrafts(nextDrafts)
    setBaseRelatedContentJson(resolveSharedRelatedContentJson(selectedColumn.id, languages, profileMapsByLanguage, defaultLanguageCode))
  }, [
    selectedColumn?.id,
    selectedColumn?.dir_name,
    languages.map((language) => language.code).join('|'),
    JSON.stringify(selectedColumn?.translations || {}),
    JSON.stringify(Array.from(profileMapsByLanguage.entries()).map(([language, map]) => [
      language,
      Array.from(map.values()).map((profile) => [profile.column_id, profile.updated_at, profile.current_language_code, profile.is_language_fallback]),
    ])),
  ])

  useEffect(() => {
    setTopicTemplateId(selectedTopicTemplateBinding?.template_id ? String(selectedTopicTemplateBinding.template_id) : NO_TOPIC_TEMPLATE_VALUE)
  }, [selectedTopicTemplateBinding])

  useEffect(() => {
    if (!contentPickerModelCode && contentModels.length > 0) {
      setContentPickerModelCode(contentModels[0].code)
    }
  }, [contentModels, contentPickerModelCode])

  const { data: contentItemsData, isLoading: contentItemsLoading } = useQuery({
    queryKey: ['content-items', contentPickerModel?.code || '', 'topic-picker', activeLanguageCode],
    queryFn: () => contentItemsApi.list<ListedContentItem>(contentPickerModel!.code, {
      page: 1,
      limit: 50,
      language: activeLanguageCode,
    }),
    enabled: contentPickerOpen && Boolean(contentPickerModel?.code),
  })
  const filteredContentItems = useMemo(
    () => filterContentItems(contentItemsData?.items || [], contentPickerKeyword),
    [contentItemsData?.items, contentPickerKeyword],
  )

  const saveCurrentTopicConfig = async () => {
    if (!selectedColumn) {
      throw new Error('请先选择栏目')
    }
    const defaultDraft = languageDrafts[defaultLanguageCode] || createEmptyLanguageDraft()
    if (!defaultDraft.name.trim()) {
      throw new Error('请输入专题名称')
    }
    if (!topicRoutePath.trim()) {
      throw new Error('请输入栏目标识')
    }
    await columnsApi.update(
      selectedColumn.id,
      buildTopicColumnTranslationsPayload(
        selectedColumn,
        languageDrafts,
        languages.map((language) => language.code),
        topicRoutePath,
      ),
    )
    const savedProfiles = await Promise.all(languages.map(async (language) => {
      const draft = languageDrafts[language.code] || createEmptyLanguageDraft()
      const existingProfile = profileMapsByLanguage.get(language.code)?.get(selectedColumn.id) || null
      const profileToSave = {
        ...draft.profile,
        related_content_json: baseRelatedContentJson,
      }
      const shouldSave = language.code === defaultLanguageCode
        ? shouldSaveTopicProfileDraft(profileToSave, existingProfile, { includeRelatedContent: true })
        : shouldSaveTopicProfileDraft(profileToSave, existingProfile, { includeRelatedContent: false })
      if (!shouldSave) {
        return null
      }
      return topicProfilesApi.save(selectedColumn.id, profileToSave, { language: language.code })
    }))
    await saveTopicTemplateBinding({
      themeId: selectedThemeId,
      columnId: selectedColumn.id,
      templateId: topicTemplateId,
      currentBinding: selectedTopicTemplateBinding,
    })
    return savedProfiles
  }

  const saveMutation = useMutation({
    mutationFn: saveCurrentTopicConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['topic-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('专题配置已保存')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '保存失败')
    },
  })
  const generateTopicMutation = useMutation({
    mutationFn: async () => {
      await saveCurrentTopicConfig()
      if (!selectedColumn) {
        throw new Error('请先选择栏目')
      }
      return topicProfilesApi.generate(selectedColumn.id, { language: activeLanguageCode })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['columns'] })
      queryClient.invalidateQueries({ queryKey: ['topic-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['template-bindings'] })
      toast.success('专题页面已生成')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || error.message || '专题页面生成失败')
    },
  })

  const handleSave = () => {
    if (!selectedColumnId) {
      toast.error('请先选择栏目')
      return
    }
    saveMutation.mutate()
  }

  const handleOpenTopic = () => {
    if (!selectedColumn) {
      toast.error('请先选择栏目')
      return
    }
    const url = buildTopicOpenUrl(selectedColumn, languages.find((language) => language.code === activeLanguageCode) || null)
    if (!url) {
      toast.error('当前专题栏目缺少访问路径')
      return
    }
    window.open(url, '_blank', 'noopener,noreferrer')
  }

  const handleGenerateTopic = () => {
    if (!selectedColumnId) {
      toast.error('请先选择栏目')
      return
    }
    generateTopicMutation.mutate()
  }

  const updateRelatedContent = (refs: RelatedContentRef[]) => {
    setBaseRelatedContentJson(JSON.stringify(refs))
  }

  const addRelatedContent = (modelCode: string, itemId: number) => {
    if (relatedContentRefs.some((ref) => ref.model === modelCode && ref.id === itemId)) {
      return
    }
    updateRelatedContent([...relatedContentRefs, { model: modelCode, id: itemId }])
  }

  const removeRelatedContent = (modelCode: string, itemId: number) => {
    updateRelatedContent(relatedContentRefs.filter((ref) => !(ref.model === modelCode && ref.id === itemId)))
  }

  const updateLanguageDraft = (languageCode: string, patch: Partial<TopicLanguageDraft>) => {
    setLanguageDrafts((previous) => {
      const current = previous[languageCode] || createEmptyLanguageDraft()
      return {
        ...previous,
        [languageCode]: {
          ...current,
          ...patch,
          profile: patch.profile || current.profile,
        },
      }
    })
  }

  const updateLanguageProfile = (languageCode: string, patch: Partial<TopicProfilePayload>) => {
    setLanguageDrafts((previous) => {
      const current = previous[languageCode] || createEmptyLanguageDraft()
      return {
        ...previous,
        [languageCode]: {
          ...current,
          profile: {
            ...current.profile,
            ...patch,
          },
        },
      }
    })
  }

  if (columnsLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="h-[calc(100vh-6rem)] min-h-0">
      <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <TopicSidebar
          columns={topicColumns}
          selectedColumnId={selectedColumnId}
          onSelect={(column) => setSelectedColumnId(String(column.id))}
        />

        <div className="flex min-h-0 flex-col">
          <div className={cn('min-h-0 flex-1 overflow-auto', fillEditorHeight ? 'flex flex-col gap-4' : 'space-y-4')}>
            <Tabs
              value={selectedTab}
              onValueChange={setActiveTab}
              className={cn('space-y-4', fillEditorHeight && 'flex min-h-0 flex-1 flex-col')}
            >
              <div className="w-full max-w-full shrink-0 overflow-x-auto overscroll-x-contain pb-1">
                <TabsList className="w-max min-w-full justify-start">
                  <TabsTrigger className="flex-none" value={BASE_TAB_VALUE}>基础数据</TabsTrigger>
                  {languages.map((language) => (
                    <TabsTrigger className="flex-none" key={language.id} value={language.code}>
                      {language.name}{language.code === defaultLanguageCode ? ' *' : ''}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>

              <TabsContent value={BASE_TAB_VALUE}>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>专题模板</Label>
                      <Select value={topicTemplateId} onValueChange={setTopicTemplateId}>
                        <SelectTrigger>
                          <SelectValue placeholder="选择专题模板" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_TOPIC_TEMPLATE_VALUE}>不绑定专题模板</SelectItem>
                          {topicTemplates.map((template) => (
                            <SelectItem key={template.id} value={String(template.id)}>
                              {template.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="topic_route_path">栏目标识</Label>
                      <Input
                        id="topic_route_path"
                        value={topicRoutePath}
                        onChange={(event) => setTopicRoutePath(event.target.value)}
                        placeholder="example"
                        autoComplete="off"
                        spellCheck={false}
                      />
                    </div>
                  </div>

                  <RelatedContentPicker
                    models={contentModels}
                    selectedRefs={relatedContentRefs}
                    onRemove={removeRelatedContent}
                    onOpenPicker={() => setContentPickerOpen(true)}
                  />
                </div>
              </TabsContent>

              {languages.map((language) => {
                const draft = languageDrafts[language.code] || createEmptyLanguageDraft()
                return (
                  <TabsContent
                    key={language.id}
                    value={language.code}
                    className={cn('space-y-4', fillEditorHeight && 'min-h-0 flex-1 flex-col data-[state=active]:flex')}
                  >
                    <div className="grid shrink-0 gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor={`topic_name_${language.code}`}>专题名称 {language.code === defaultLanguageCode ? '*' : ''}</Label>
                        <Input
                          id={`topic_name_${language.code}`}
                          value={draft.name}
                          onChange={(event) => updateLanguageDraft(language.code, { name: event.target.value })}
                          placeholder="请输入专题名称"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>发布状态</Label>
                        <Select
                          value={draft.profile.publish_status || 'draft'}
                          onValueChange={(value: 'draft' | 'published') => updateLanguageProfile(language.code, { publish_status: value })}
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
                      <div className="space-y-2">
                        <Label htmlFor={`seo_title_${language.code}`}>SEO Title</Label>
                        <Input
                          id={`seo_title_${language.code}`}
                          value={draft.profile.seo_title}
                          onChange={(event) => updateLanguageProfile(language.code, { seo_title: event.target.value })}
                          placeholder="用于 HTML title 标签，留空则使用专题名称"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor={`topic_keyword_${language.code}`}>优化关键词</Label>
                        <Textarea
                          id={`topic_keyword_${language.code}`}
                          value={draft.profile.topic_keyword}
                          onChange={(event) => updateLanguageProfile(language.code, { topic_keyword: event.target.value })}
                          placeholder="每行一个或用逗号分隔，用于专题介绍和页面内容优化参考"
                          rows={4}
                        />
                      </div>
                    </div>

                    <div className={cn('space-y-2', fillEditorHeight && 'flex min-h-0 flex-1 flex-col')}>
                      <Label>专题介绍</Label>
                      <RichTextEditor
                        value={draft.profile.intro_html}
                        onChange={(intro_html) => updateLanguageProfile(language.code, { intro_html })}
                        placeholder="请输入专题页面介绍，可用于围绕主要 SEO 关键词组织内容"
                        uploadPurpose="richtext_image"
                        fillAvailableHeight={fillEditorHeight}
                        className={fillEditorHeight ? 'min-h-0 flex-1' : undefined}
                      />
                    </div>
                  </TabsContent>
                )
              })}
            </Tabs>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleGenerateTopic}
                disabled={!selectedColumnId || saveMutation.isPending || generateTopicMutation.isPending}
                aria-label="生成静态页面"
                title="生成静态页面"
              >
                <RefreshCw className={generateTopicMutation.isPending ? 'animate-spin' : ''} />
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleOpenTopic}
                disabled={!selectedColumnId}
              >
                <ExternalLink />
                打开
              </Button>
              <Button onClick={handleSave} disabled={!selectedColumnId || saveMutation.isPending}>
                {saveMutation.isPending ? '保存中...' : '保存专题配置'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <RelatedContentPickerDialog
        open={contentPickerOpen}
        onOpenChange={setContentPickerOpen}
        models={contentModels}
        selectedModel={contentPickerModel}
        selectedModelCode={contentPickerModelCode}
        onSelectModel={(modelCode) => {
          setContentPickerModelCode(modelCode)
          setContentPickerKeyword('')
        }}
        keyword={contentPickerKeyword}
        onKeywordChange={setContentPickerKeyword}
        items={filteredContentItems}
        loading={contentItemsLoading}
        selectedRefs={relatedContentRefs}
        onAdd={addRelatedContent}
      />
    </div>
  )
}

function createEmptyLanguageDraft(): TopicLanguageDraft {
  return {
    name: '',
    profile: { ...EMPTY_PROFILE },
  }
}

function resolveTopicColumnTranslationName(column: Column, languageCode: string, defaultLanguageCode: string) {
  const translationName = String(column.translations?.[languageCode]?.name || '').trim()
  if (translationName) {
    return translationName
  }
  if (languageCode === defaultLanguageCode) {
    return String(column.name || '').trim()
  }
  return ''
}

function buildTopicColumnTranslationsPayload(
  column: Column,
  drafts: Record<string, TopicLanguageDraft>,
  languageCodes: string[],
  routePath: string,
) {
  const translations: Record<string, { name: string }> = {}
  for (const languageCode of languageCodes) {
    const existingTranslation = column.translations?.[languageCode]
    translations[languageCode] = {
      ...existingTranslation,
      name: String(drafts[languageCode]?.name || existingTranslation?.name || '').trim(),
    }
  }
  return {
    parent_id: column.parent_id || 0,
    content_model_id: column.content_model_id || null,
    dir_name: routePath.trim(),
    detail_rule: column.detail_rule || '',
    sort_order: column.sort_order || 0,
    is_visible: column.is_visible ?? 1,
    translations,
  }
}

function resolveSharedRelatedContentJson(
  columnId: number,
  languages: Array<{ code: string }>,
  profileMapsByLanguage: Map<string, Map<number, TopicProfile>>,
  defaultLanguageCode: string,
) {
  const defaultProfile = profileMapsByLanguage.get(defaultLanguageCode)?.get(columnId) || null
  if (defaultProfile && !defaultProfile.is_language_fallback) {
    return defaultProfile.related_content_json || '[]'
  }
  for (const language of languages) {
    const profile = profileMapsByLanguage.get(language.code)?.get(columnId) || null
    if (profile && !profile.is_language_fallback && parseRelatedContentRefs(profile.related_content_json).length > 0) {
      return profile.related_content_json || '[]'
    }
  }
  return '[]'
}

function shouldSaveTopicProfileDraft(
  profile: TopicProfilePayload,
  existingProfile: TopicProfile | null,
  { includeRelatedContent = true }: { includeRelatedContent?: boolean } = {},
) {
  if (existingProfile && !existingProfile.is_language_fallback) {
    return true
  }
  return Boolean(
    profile.seo_title.trim()
    || profile.intro_html.trim()
    || profile.topic_keyword.trim()
    || profile.publish_status === 'published'
    || (includeRelatedContent && parseRelatedContentRefs(profile.related_content_json).length > 0)
    || Number(profile.sort_order || 0) !== 0
  )
}

async function saveTopicTemplateBinding({
  themeId,
  columnId,
  templateId,
  currentBinding,
}: {
  themeId: number
  columnId: number
  templateId: string
  currentBinding: TemplateBinding | null
}) {
  if (!themeId) {
    return
  }
  if (!templateId || templateId === NO_TOPIC_TEMPLATE_VALUE) {
    if (currentBinding?.id) {
      await templatesApi.deleteBinding(currentBinding.id)
    }
    return
  }
  await templatesApi.saveBinding({
    theme_id: themeId,
    target_type: 'column',
    target_id: columnId,
    template_type: 'topic',
    template_id: Number(templateId),
  })
}

function TopicSidebar({
  columns,
  selectedColumnId,
  onSelect,
}: {
  columns: Column[]
  selectedColumnId: string
  onSelect: (column: Column) => void
}) {
  const columnTree = useMemo(() => buildTopicColumnTree(columns), [columns])
  const items = columnTree.map((node) => toTopicSidebarItem(node, selectedColumnId, onSelect))

  return (
    <Sidebar collapsible="none" className="min-h-0 w-full overflow-hidden bg-transparent">
      <SidebarContent>
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            {items.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">暂无专题</p>
            ) : (
              <SidebarTreeMenu items={items} />
            )}
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

function buildTopicColumnTree(columns: Column[]): TopicColumnTreeNode[] {
  const nodes = new Map<number, TopicColumnTreeNode>()
  const roots: TopicColumnTreeNode[] = []

  for (const column of columns) {
    nodes.set(column.id, { column, children: [] })
  }

  for (const node of nodes.values()) {
    const parent = nodes.get(Number(node.column.parent_id || 0))
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  const sortNodes = (items: TopicColumnTreeNode[]) => {
    items.sort((left, right) => compareTopicColumns(left.column, right.column))
    items.forEach((item) => sortNodes(item.children))
  }
  sortNodes(roots)
  return roots
}

function toTopicSidebarItem(
  node: TopicColumnTreeNode,
  selectedColumnId: string,
  onSelect: (column: Column) => void,
): SidebarTreeMenuItem {
  return {
    id: node.column.id,
    label: node.column.name || '未命名专题',
    active: selectedColumnId === String(node.column.id),
    onSelect: () => onSelect(node.column),
    defaultOpen: true,
    className: 'h-9',
    children: node.children.map((child) => toTopicSidebarItem(child, selectedColumnId, onSelect)),
  }
}

function compareTopicColumns(left: Column, right: Column) {
  const sortOrderDifference = Number(left.sort_order || 0) - Number(right.sort_order || 0)
  return sortOrderDifference || left.id - right.id
}

function RelatedContentPicker({
  models,
  selectedRefs,
  onRemove,
  onOpenPicker,
}: {
  models: ContentModel[]
  selectedRefs: RelatedContentRef[]
  onRemove: (modelCode: string, itemId: number) => void
  onOpenPicker: () => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium">关联内容</div>
          <div className="text-sm text-muted-foreground">已选择 {selectedRefs.length} 条内容。</div>
        </div>
        <Button type="button" variant="outline" onClick={onOpenPicker}>
          新增
        </Button>
      </div>

      <div className="rounded border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>内容模型</TableHead>
              <TableHead>ID</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {selectedRefs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-muted-foreground">暂未选择关联内容</TableCell>
              </TableRow>
            ) : (
              selectedRefs.map((ref) => (
                <TableRow key={`${ref.model}:${ref.id}`}>
                  <TableCell>{resolveModelName(models, ref.model)}</TableCell>
                  <TableCell>{ref.id}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => onRemove(ref.model, ref.id)}
                    >
                      移除
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function RelatedContentPickerDialog({
  open,
  onOpenChange,
  models,
  selectedModel,
  selectedModelCode,
  onSelectModel,
  keyword,
  onKeywordChange,
  items,
  loading,
  selectedRefs,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  models: ContentModel[]
  selectedModel: ContentModel | null
  selectedModelCode: string
  onSelectModel: (modelCode: string) => void
  keyword: string
  onKeywordChange: (keyword: string) => void
  items: ListedContentItem[]
  loading: boolean
  selectedRefs: RelatedContentRef[]
  onAdd: (modelCode: string, itemId: number) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>新增关联内容</DialogTitle>
          <DialogDescription>按内容模型和关键词筛选内容，选择后会加入专题关联列表。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            <Label>内容模型</Label>
            <Select value={selectedModelCode} onValueChange={onSelectModel}>
              <SelectTrigger>
                <SelectValue placeholder="选择内容模型" />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model.id} value={model.code}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topic-content-picker-keyword">筛选关键词</Label>
            <Input
              id="topic-content-picker-keyword"
              value={keyword}
              onChange={(event) => onKeywordChange(event.target.value)}
              placeholder="按标题、栏目或 ID 过滤"
            />
          </div>
        </div>

        <div className="max-h-[55vh] overflow-auto rounded border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>标题</TableHead>
                <TableHead>栏目</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!selectedModel ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">暂无内容模型</TableCell>
                </TableRow>
              ) : loading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">加载中...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">未找到可选择内容</TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const added = selectedRefs.some((ref) => ref.model === selectedModel.code && ref.id === item.id)
                  return (
                    <TableRow key={`${selectedModel.code}:${item.id}`}>
                      <TableCell>{item.id}</TableCell>
                      <TableCell className="font-medium">{resolveContentItemName(item) || '-'}</TableCell>
                      <TableCell>{item.column_name || item.column_id || '-'}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          variant={added ? 'secondary' : 'default'}
                          disabled={added}
                          onClick={() => onAdd(selectedModel.code, item.id)}
                        >
                          {added ? '已添加' : '添加'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function profileToForm(profile: TopicProfile | null, { ignoreFallback = false } = {}): TopicProfilePayload {
  if (!profile || (ignoreFallback && profile.is_language_fallback)) {
    return { ...EMPTY_PROFILE }
  }
  return {
    seo_title: profile.seo_title || '',
    intro_html: profile.intro_html || '',
    topic_keyword: profile.topic_keyword || '',
    related_content_json: profile.related_content_json || '[]',
    publish_status: profile.publish_status === 'published' ? 'published' : 'draft',
    sort_order: Number(profile.sort_order || 0),
  }
}

function buildTopicOpenUrl(column: Column, language: { site?: { path_prefix?: string | null } | null } | null) {
  const routePath = normalizePublicUrl(column.route_path || '')
  if (!routePath) {
    return ''
  }
  return prefixLanguagePath(routePath, language?.site?.path_prefix || '/')
}

function prefixLanguagePath(value: string, pathPrefix: string) {
  const normalizedPrefix = normalizePublicUrl(pathPrefix || '/').replace(/\/$/g, '') || '/'
  if (normalizedPrefix === '/') {
    return value
  }
  if (value === normalizedPrefix || value.startsWith(`${normalizedPrefix}/`)) {
    return value
  }
  return value === '/' ? `${normalizedPrefix}/` : `${normalizedPrefix}${value}`
}

function normalizePublicUrl(value: string) {
  const trimmed = String(value || '').trim()
  if (!trimmed) {
    return ''
  }
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  const collapsed = normalized.replace(/\/{2,}/g, '/')
  return collapsed.replace(/\/index\.html$/i, '/')
}

function parseRelatedContentRefs(value: string): RelatedContentRef[] {
  try {
    const parsed = JSON.parse(value || '[]')
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map((item) => ({
        model: String(item?.model || '').trim(),
        id: Number(item?.id || 0),
      }))
      .filter((item) => item.model && item.id > 0)
  } catch {
    return []
  }
}

function resolveContentItemName(item: ListedContentItem) {
  return String(item.name || '')
}

function filterContentItems(items: ListedContentItem[], keyword: string) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) {
    return items
  }
  return items.filter((item) => {
    const searchableText = [
      item.id,
      resolveContentItemName(item),
      item.column_name,
      item.column_id,
    ].map((value) => String(value || '').toLowerCase()).join(' ')
    return searchableText.includes(normalizedKeyword)
  })
}

function resolveModelName(models: ContentModel[], modelCode: string) {
  return models.find((model) => model.code === modelCode)?.name || modelCode
}
