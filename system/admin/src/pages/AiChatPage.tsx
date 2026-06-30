import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bot, Loader2, MessageSquareText, RefreshCw, ScrollText, Send, Trash2 } from 'lucide-react'
import { documentWorkspacesApi } from '@/api/document-workspaces'
import { ChatMessageItem } from '@/components/ai-chat/ChatMessageItem'
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from '@/components/ai-elements/prompt-input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import type { DocumentDraftConversationState, DocumentTemplate } from '@/types'

const DOCUMENT_TYPE_LABELS: Record<'quote' | 'contract', string> = {
  quote: '报价单',
  contract: '销售合同',
}

export default function AiChatPage() {
  const queryClient = useQueryClient()
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const [selectedDocumentType, setSelectedDocumentType] = useState<'quote' | 'contract'>('quote')
  const [draftId, setDraftId] = useState<string>('')
  const [inputValue, setInputValue] = useState('')
  const [previewVersion, setPreviewVersion] = useState(0)
  const [deleteDraftId, setDeleteDraftId] = useState<string>('')
  const [conversationState, setConversationState] = useState<DocumentDraftConversationState>({
    missing_fields: [],
    suggested_questions: [],
  })

  const { data: templatesData, isLoading: isTemplatesLoading } = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => documentWorkspacesApi.listTemplates(),
  })

  const templates = templatesData?.data || []
  const groupedTemplates = useMemo(() => {
    return {
      quote: templates.filter((item) => item.document_type === 'quote'),
      contract: templates.filter((item) => item.document_type === 'contract'),
    }
  }, [templates])

  const draftsQuery = useQuery({
    queryKey: ['document-drafts'],
    queryFn: () => documentWorkspacesApi.listDrafts(30),
  })

  const recentDrafts = draftsQuery.data?.data || []

  const draftQuery = useQuery({
    queryKey: ['document-draft', draftId],
    queryFn: () => documentWorkspacesApi.getDraft(draftId),
    enabled: Boolean(draftId),
  })

  const currentDraft = draftQuery.data?.data || null

  const createDraftMutation = useMutation({
    mutationFn: async (template: DocumentTemplate) => {
      return documentWorkspacesApi.createDraft({
        document_type: template.document_type,
        document_template_id: template.id,
        title: template.document_type === 'quote' ? '报价单' : '销售合同',
      })
    },
    onSuccess: async (response) => {
      const nextDraft = response.data
      if (!nextDraft) {
        return
      }
      setDraftId(nextDraft.id)
      setPreviewVersion((value) => value + 1)
      setConversationState({
        missing_fields: [],
        suggested_questions: [],
      })
      await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      await queryClient.invalidateQueries({ queryKey: ['document-draft', nextDraft.id] })
    },
  })

  const sendMessageMutation = useMutation({
    mutationFn: async ({ id, message }: { id: string; message: string }) => {
      return documentWorkspacesApi.sendMessage(id, message)
    },
    onSuccess: async (response) => {
      if (!response.data?.draft?.id) {
        return
      }
      setInputValue('')
      setConversationState({
        missing_fields: response.data.missing_fields || [],
        suggested_questions: response.data.suggested_questions || [],
      })
      setPreviewVersion((value) => value + 1)
      await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      await queryClient.setQueryData(['document-draft', response.data.draft.id], { success: true, data: response.data.draft })
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return documentWorkspacesApi.deleteDraft(id)
    },
    onSuccess: async (_, deletedId) => {
      if (draftId === deletedId) {
        setDraftId('')
        setInputValue('')
        setPreviewVersion((value) => value + 1)
        setConversationState({
          missing_fields: [],
          suggested_questions: [],
        })
      }
      setDeleteDraftId('')
      await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      queryClient.removeQueries({ queryKey: ['document-draft', deletedId] })
      toast.success('草稿已删除')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '删除草稿失败')
    },
  })

  const previewUrl = currentDraft ? `${documentWorkspacesApi.getPreviewUrl(currentDraft.id)}?v=${previewVersion}` : ''

  const handleTemplateSelect = async (template: DocumentTemplate) => {
    await createDraftMutation.mutateAsync(template)
  }

  const handleDraftSelect = async (nextDraftId: string) => {
    if (!nextDraftId) {
      return
    }
    setDraftId(nextDraftId)
    setConversationState({
      missing_fields: [],
      suggested_questions: [],
    })
    setPreviewVersion((value) => value + 1)
    await queryClient.invalidateQueries({ queryKey: ['document-draft', nextDraftId] })
  }

  const handleSubmit = async ({ text }: { text?: string }) => {
    const value = String(text || inputValue || '').trim()
    if (!value || !currentDraft?.id) {
      return
    }
    await sendMessageMutation.mutateAsync({
      id: currentDraft.id,
      message: value,
    })
  }

  const handlePrintCurrentDraft = () => {
    const frameWindow = previewFrameRef.current?.contentWindow
    if (!frameWindow) {
      return
    }

    frameWindow.focus()
    frameWindow.print()
  }

  const confirmDeleteDraft = () => {
    if (!deleteDraftId) {
      return
    }
    deleteDraftMutation.mutate(deleteDraftId)
  }

  return (
    <div className="h-[calc(100vh-9rem)] min-h-0">
      <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b bg-muted/20">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2 text-xl">
                <ScrollText className="h-5 w-5 text-primary" />
                AI 文档工作台
              </CardTitle>
              <CardDescription>
                先选模板，再通过右侧 AI 对话完善报价单或合同内容；左侧预览会实时生效。
              </CardDescription>
            </div>
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {currentDraft ? '预览模式' : '选择模板'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          {!currentDraft ? (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="flex h-full min-h-0 flex-col border-b bg-background lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">选择文档模板</p>
                    <p className="truncate text-xs text-muted-foreground">
                      从左侧模板开始新的报价单或销售合同草稿
                    </p>
                  </div>
                  <Badge variant="secondary" className="rounded-full px-3 py-1">
                    选择模板
                  </Badge>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">
                  <div className="mb-5 flex gap-2">
                    <Button
                      variant={selectedDocumentType === 'quote' ? 'default' : 'outline'}
                      onClick={() => setSelectedDocumentType('quote')}
                    >
                      报价单
                    </Button>
                    <Button
                      variant={selectedDocumentType === 'contract' ? 'default' : 'outline'}
                      onClick={() => setSelectedDocumentType('contract')}
                    >
                      销售合同
                    </Button>
                  </div>

                  <div className="grid gap-4">
                    {(groupedTemplates[selectedDocumentType] || []).map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => void handleTemplateSelect(template)}
                        className="bg-background px-5 py-4 text-left transition hover:bg-muted/20"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-semibold">{template.name}</h3>
                              {Number(template.is_default || 0) === 1 ? <Badge variant="secondary">默认</Badge> : null}
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {template.description || '进入后可继续通过 AI 对话补全客户、产品、价格和条款信息。'}
                            </p>
                          </div>
                          <Badge variant="outline">{DOCUMENT_TYPE_LABELS[template.document_type]}</Badge>
                        </div>
                      </button>
                    ))}

                    {isTemplatesLoading ? (
                      <div className="flex items-center gap-2 border border-dashed px-4 py-6 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在加载文档模板...
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="flex h-full min-h-0 flex-col bg-background">
                <div className="flex items-center justify-between border-b px-4 py-4">
                  <div>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquareText className="h-4 w-4 text-primary" />
                      继续旧草稿
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      像会话记录一样继续之前的报价单或合同。
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => void draftsQuery.refetch()}
                    disabled={draftsQuery.isFetching}
                  >
                    <RefreshCw className={`h-4 w-4 ${draftsQuery.isFetching ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                  {recentDrafts.length === 0 ? (
                    <div className="flex h-full min-h-[220px] items-center justify-center border border-dashed bg-muted/10 px-6 text-center text-sm leading-6 text-muted-foreground">
                      还没有历史草稿。先从左侧选择模板开始。
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {recentDrafts.map((draft) => (
                        <div
                          key={draft.id}
                          className="group relative border border-border/70 bg-background transition hover:border-primary/40 hover:bg-muted/20"
                        >
                          <button
                            type="button"
                            onClick={() => void handleDraftSelect(draft.id)}
                            className="block w-full px-4 py-4 text-left"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{DOCUMENT_TYPE_LABELS[draft.document_type]}</Badge>
                                  <span className="truncate text-sm font-medium">{draft.title || '未命名草稿'}</span>
                                </div>
                                <p className="truncate text-sm text-muted-foreground">
                                  {draft.document_template_name || '-'}
                                </p>
                                <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                                  {draft.messages[draft.messages.length - 1]?.text
                                    || String(draft.draft_payload?.customer?.company || draft.draft_payload?.customer?.name || '暂无对话记录')}
                                </p>
                              </div>
                              <div className="shrink-0 pr-9 text-right">
                                <div className="mt-2 text-xs text-muted-foreground">
                                  {formatDraftTime(draft.updated_at)}
                                </div>
                              </div>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="invisible absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive group-hover:visible"
                            onClick={() => setDeleteDraftId(draft.id)}
                            aria-label={`删除草稿 ${draft.title || '未命名草稿'}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[1.2fr_0.8fr]">
              <section className="flex h-full min-h-0 flex-col border-b bg-stone-100 lg:border-b-0 lg:border-r">
                <div className="flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{currentDraft.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {currentDraft.document_template_name} · {DOCUMENT_TYPE_LABELS[currentDraft.document_type]}
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={handlePrintCurrentDraft}>
                    打印 / 导出 PDF
                  </Button>
                </div>
                <iframe
                  ref={previewFrameRef}
                  key={previewUrl}
                  src={previewUrl}
                  title="文档预览"
                  className="min-h-0 flex-1 bg-white"
                />
              </section>

              <section className="flex h-full min-h-0 flex-col bg-background">
                <div className="border-b px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MessageSquareText className="h-4 w-4 text-primary" />
                    AI 对话
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    告诉 AI 客户、产品、数量、价格、付款条款或交期，左侧预览会按当前模板更新。
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
                  <div className="space-y-5">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">当前识别</p>
                      <div className="mt-3 grid gap-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">客户</span>
                          <span className="text-right font-medium">
                            {String(
                              currentDraft.draft_payload?.customer?.company
                              || currentDraft.draft_payload?.customer?.name
                              || '-'
                            )}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">产品行数</span>
                          <span className="font-medium">
                            {Array.isArray(currentDraft.draft_payload?.items) ? currentDraft.draft_payload.items.length : 0}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">币种</span>
                          <span className="font-medium">{String(currentDraft.draft_payload?.pricing?.currency || '-')}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">交期</span>
                          <span className="text-right font-medium">{String(currentDraft.draft_payload?.terms?.delivery || '-')}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">付款</span>
                          <span className="text-right font-medium">{String(currentDraft.draft_payload?.terms?.payment || '-')}</span>
                        </div>
                      </div>
                    </div>

                    {conversationState.missing_fields.length > 0 || conversationState.suggested_questions.length > 0 ? (
                      <div className="rounded-2xl border bg-muted/20 p-4">
                        {conversationState.missing_fields.length > 0 ? (
                          <div className="space-y-2">
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">待补充字段</p>
                            <div className="flex flex-wrap gap-2">
                              {conversationState.missing_fields.map((field) => (
                                <Badge key={field} variant="outline">{field}</Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {conversationState.suggested_questions.length > 0 ? (
                          <div className={conversationState.missing_fields.length > 0 ? 'mt-4 space-y-2' : 'space-y-2'}>
                            <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">建议下一问</p>
                            <div className="flex flex-col gap-2">
                              {conversationState.suggested_questions.map((question) => (
                                <button
                                  key={question}
                                  type="button"
                                  className="rounded-xl border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/40"
                                  onClick={() => setInputValue(question)}
                                >
                                  {question}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {currentDraft.messages.length === 0 ? (
                      <ChatMessageItem
                        role="assistant"
                        text={`当前已进入${DOCUMENT_TYPE_LABELS[currentDraft.document_type]}工作台。你可以先告诉我客户名称、产品型号和数量，我会先补齐基础草稿。`}
                      />
                    ) : (
                      currentDraft.messages.map((message, index) => (
                        <ChatMessageItem
                          key={`${message.created_at}-${index}`}
                          role={message.role}
                          text={message.text}
                        />
                      ))
                    )}

                    {sendMessageMutation.isPending ? (
                      <ChatMessageItem pending role="assistant" />
                    ) : null}
                  </div>
                </div>

                <div className="border-t bg-background/95 px-4 py-4 backdrop-blur">
                  <PromptInput onSubmit={({ text }) => void handleSubmit({ text: text || inputValue })}>
                    <PromptInputBody>
                      <PromptInputTextarea
                        value={inputValue}
                        onChange={(event) => setInputValue(event.target.value)}
                        placeholder={`例如：客户是上海某工厂，${currentDraft.document_type === 'quote' ? '报价' : '合同'}里先加入 BSA2T-25 两台，含税，交期两周`}
                      />
                    </PromptInputBody>
                    <PromptInputFooter>
                      <PromptInputTools>
                        <div className="rounded-full border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                          当前模板：{currentDraft.document_template_name}
                        </div>
                      </PromptInputTools>
                      <PromptInputSubmit
                        disabled={!inputValue.trim() || sendMessageMutation.isPending}
                        status={sendMessageMutation.isPending ? 'submitted' : 'ready'}
                      >
                        {!sendMessageMutation.isPending ? <Send className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                      </PromptInputSubmit>
                    </PromptInputFooter>
                  </PromptInput>
                </div>
              </section>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={Boolean(deleteDraftId)} onOpenChange={(open) => { if (!open) setDeleteDraftId('') }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除草稿</AlertDialogTitle>
            <AlertDialogDescription>
              删除后，该报价单或合同草稿及其对话记录将无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteDraftMutation.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteDraft} disabled={deleteDraftMutation.isPending}>
              {deleteDraftMutation.isPending ? '删除中...' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function formatDraftTime(value?: string) {
  if (!value) {
    return '-'
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
