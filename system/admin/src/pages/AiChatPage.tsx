import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Chat, useChat } from '@ai-sdk/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useDefaultLayout } from 'react-resizable-panels'
import { ArrowLeft, Building2, Check, Eye, FileCog, FilePlus2, FileSignature, Pencil, RefreshCw, Search, Settings2, Stamp, Trash2, X } from 'lucide-react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { documentWorkspacesApi } from '@/api/document-workspaces'
import { createDocumentAgentChatTransport } from '@/api/document-agent'
import {
  AiChatPanel,
  type AiChatPanelMessage,
} from '@/components/ai-chat/AiChatPanel'
import { AI_CHAT_PANEL_CONFIGS } from '@/components/ai-chat/ai-chat-panel-config'
import { DocumentCompanyManagerDialog } from '@/components/DocumentCompanyManagerDialog'
import { DocumentStampManagerDialog } from '@/components/DocumentStampManagerDialog'
import { DocumentTemplateCompanySlotsDialog } from '@/components/DocumentTemplateCompanySlotsDialog'
import { DocumentTemplateManagerDialog } from '@/components/DocumentTemplateManagerDialog'
import { DocumentTemplatePickerDialog } from '@/components/DocumentTemplatePickerDialog'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AdminDataTable } from '@/components/AdminDataTable'
import { TableActionButton } from '@/components/TableActionButton'
import { TableCell, TableHead, TableRow } from '@/components/ui/table'
import { ADMIN_CONFIG } from '@/config'
import { formatRelativeTime } from '@/lib/datetime'
import { useIsMobile } from '@/hooks/use-mobile'
import { toast } from 'sonner'
import type { DocumentCompany, DocumentCompanySlot, DocumentDraft, DocumentDraftStampPlacement, DocumentStamp, DocumentTemplate } from '@/types'
import type { UIMessage } from 'ai'

const DOCUMENT_TYPE_LABELS: Record<'quote' | 'contract', string> = {
  quote: '报价单',
  contract: '销售合同',
}

type DashboardHeaderContext = {
  headerSlotElement: HTMLDivElement | null
  setDocumentTitle: (value: string) => void
  setMainContentPadding: (enabled: boolean) => void
}

type DocumentToolActivity = {
  type: 'tool_called' | 'tool_output'
  toolName?: string
  item?: unknown
}

const DEFAULT_DOCUMENT_PAGE_WIDTH = 794
const DEFAULT_DOCUMENT_PAGE_PADDING = 38
const AI_DOCS_PANEL_LAYOUT_STORAGE_ID = 'ai-docs-workspace-layout'
const AI_DOCS_PANEL_IDS = ['document-preview', 'document-conversation']
export default function AiChatPage() {
  const { headerSlotElement, setDocumentTitle, setMainContentPadding } =
    useOutletContext<DashboardHeaderContext>()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const isMobile = useIsMobile(1024)
  const { defaultLayout: workspaceDefaultLayout, onLayoutChanged: handleWorkspaceLayoutChanged } = useDefaultLayout({
    id: AI_DOCS_PANEL_LAYOUT_STORAGE_ID,
    panelIds: AI_DOCS_PANEL_IDS,
    storage: window.localStorage,
    onlySaveAfterUserInteractions: true,
  })
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const mobilePreviewFrameRef = useRef<HTMLIFrameElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const sentInitialMessageDraftIdRef = useRef('')
  const previewFieldSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const previewFieldSaveCountRef = useRef(0)
  const [previewVersion, setPreviewVersion] = useState(0)
  const [, setIsPreviewFieldSaving] = useState(false)
  const [deleteDraftId, setDeleteDraftId] = useState<string>('')
  const [companySlotsTemplate, setCompanySlotsTemplate] = useState<DocumentTemplate | null>(null)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInputValue, setTitleInputValue] = useState('')
  const [renamingDraftId, setRenamingDraftId] = useState('')
  const [renamingDraftTitle, setRenamingDraftTitle] = useState('')
  const [isCompanyManagerOpen, setIsCompanyManagerOpen] = useState(false)
  const [isStampManagerOpen, setIsStampManagerOpen] = useState(false)
  const [isDocumentToolsOpen, setIsDocumentToolsOpen] = useState(false)
  const [isMobileDocumentToolsOpen, setIsMobileDocumentToolsOpen] = useState(false)
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false)
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false)
  const [pendingTemplate, setPendingTemplate] = useState<DocumentTemplate | null>(null)
  const [pendingInitialMessage, setPendingInitialMessage] = useState('')
  const [queuedInitialMessage, setQueuedInitialMessage] = useState<{ draftId: string; text: string } | null>(null)
  const [managedDocumentType, setManagedDocumentType] = useState<DocumentTemplate['document_type'] | null>(null)
  const [documentPage, setDocumentPage] = useState(1)
  const [documentSearchInput, setDocumentSearchInput] = useState('')
  const [documentSearch, setDocumentSearch] = useState('')
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<Record<string, string>>({})
  const [selectedStampIdToApply, setSelectedStampIdToApply] = useState<string>('')
  const [documentToolActivities, setDocumentToolActivities] = useState<DocumentToolActivity[]>([])
  const draftId = String(searchParams.get('draft') || '').trim()

  const { data: templatesData, isLoading: isTemplatesLoading } = useQuery({
    queryKey: ['document-templates'],
    queryFn: () => documentWorkspacesApi.listTemplates(),
  })

  const templates = templatesData?.data || []

  const draftsQuery = useQuery({
    queryKey: ['document-drafts', documentPage, documentSearch],
    queryFn: () => documentWorkspacesApi.listDrafts({
      page: documentPage,
      limit: ADMIN_CONFIG.pagination.pageSize,
      search: documentSearch,
    }),
  })

  const stampsQuery = useQuery({
    queryKey: ['document-stamps'],
    queryFn: () => documentWorkspacesApi.listStamps(),
  })

  const companiesQuery = useQuery({
    queryKey: ['document-companies'],
    queryFn: () => documentWorkspacesApi.listCompanies(),
  })

  const recentDrafts = draftsQuery.data?.data || []
  const draftsPagination = draftsQuery.data?.pagination
  const stamps = (stampsQuery.data?.data || []) as DocumentStamp[]
  const companies = (companiesQuery.data?.data || []) as DocumentCompany[]

  const draftQuery = useQuery({
    queryKey: ['document-draft', draftId],
    queryFn: () => documentWorkspacesApi.getDraft(draftId),
    enabled: Boolean(draftId),
  })

  const currentDraft = draftQuery.data?.data || null
  const initialDocumentChatMessages = useMemo(
    () => toDocumentChatMessages(currentDraft),
    [currentDraft],
  )
  const documentChatTransport = useMemo(
    () => createDocumentAgentChatTransport(draftId),
    [draftId],
  )
  const documentChatInstance = useMemo(() => new Chat({
    id: draftId || 'document-assistant-idle',
    transport: documentChatTransport,
    messages: [],
    onData: (dataPart) => {
      if (dataPart.type === 'data-document-tool-activity') {
        const activity = normalizeDocumentToolActivity(dataPart.data)
        if (activity) {
          setDocumentToolActivities((current) => [...current, activity])
        }
        return
      }

      if (dataPart.type === 'data-document-draft') {
        const nextDraft = getDocumentDraftFromDataPart(dataPart.data)
        if (!nextDraft || nextDraft.id !== draftId) {
          return
        }
        queryClient.setQueryData(['document-draft', draftId], { success: true, data: nextDraft })
        setPreviewVersion((value) => value + 1)
      }
    },
    onError: (error) => {
      setDocumentToolActivities([])
      toast.error(error.message || 'AI 文档助手执行失败')
    },
    onFinish: () => {
      setDocumentToolActivities([])
      setPreviewVersion((value) => value + 1)
      void queryClient.invalidateQueries({ queryKey: ['document-companies'] })
      void queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      void queryClient.invalidateQueries({ queryKey: ['document-draft', draftId] })
    },
  }), [documentChatTransport, draftId, queryClient])
  const documentChat = useChat({
    chat: documentChatInstance,
    experimental_throttle: 0,
  })
  const isDocumentChatStreaming = documentChat.status === 'submitted' || documentChat.status === 'streaming'
  const documentChatMessages = documentChat.messages
  const setDocumentChatMessages = documentChat.setMessages
  const previewHeaderTitle = currentDraft
    ? getDraftDocumentNumber(currentDraft) || currentDraft.title || '未命名文档'
    : ''
  const currentDraftStamps = Array.isArray(currentDraft?.draft_payload?.stamps) ? currentDraft.draft_payload.stamps : []
  const currentTemplate = templates.find((item) => item.id === currentDraft?.document_template_id) || null
  const companySlots = normalizeCompanySlots(currentTemplate?.default_payload?.meta)

  const syncPreviewStampState = (override?: {
    stamps?: DocumentDraftStampPlacement[]
  }) => {
    const nextStamps = override?.stamps || currentDraftStamps
    const postStampState = (frame: HTMLIFrameElement | null) => {
      frame?.contentWindow?.postMessage({
        type: 'document-preview-set-stamps',
        stamps: nextStamps,
      }, window.location.origin)
    }

    postStampState(previewFrameRef.current)
    postStampState(mobilePreviewFrameRef.current)

    window.setTimeout(() => {
      postStampState(previewFrameRef.current)
      postStampState(mobilePreviewFrameRef.current)
    }, 180)
  }

  const syncPreviewEditingState = () => {
    const postEditingState = (frame: HTMLIFrameElement | null) => {
      frame?.contentWindow?.postMessage({
        type: 'document-preview-set-editing',
        enabled: true,
      }, window.location.origin)
    }

    postEditingState(previewFrameRef.current)
    postEditingState(mobilePreviewFrameRef.current)
  }

  const syncPreviewState = () => {
    syncPreviewStampState()
    syncPreviewEditingState()
  }

  useEffect(() => {
    setDocumentTitle(previewHeaderTitle || pendingTemplate?.name || '文档列表')
  }, [pendingTemplate?.name, previewHeaderTitle, setDocumentTitle])

  useEffect(() => {
    setMainContentPadding(false)
    return () => setMainContentPadding(true)
  }, [setMainContentPadding])

  useEffect(() => {
    setTitleInputValue(String(currentDraft?.title || '').trim())
    setIsEditingTitle(false)
  }, [currentDraft?.id, currentDraft?.title])

  useEffect(() => {
    if (!isEditingTitle) {
      return
    }
    titleInputRef.current?.focus()
    titleInputRef.current?.select()
  }, [isEditingTitle])

  const setDraftSearchParam = (nextDraftId: string, options?: { replace?: boolean }) => {
    const normalizedDraftId = String(nextDraftId || '').trim()
    const nextSearchParams = new URLSearchParams(searchParams)
    if (normalizedDraftId) {
      nextSearchParams.set('draft', normalizedDraftId)
    } else {
      nextSearchParams.delete('draft')
    }
    setSearchParams(nextSearchParams, { replace: options?.replace ?? false })
  }

  useEffect(() => {
    setIsMobilePreviewOpen(false)
    setDocumentToolActivities([])
    setPreviewVersion((value) => value + 1)
  }, [draftId])

  useEffect(() => {
    const postEditingState = (frame: HTMLIFrameElement | null) => {
      frame?.contentWindow?.postMessage({
        type: 'document-preview-set-editing',
        enabled: true,
      }, window.location.origin)
    }

    postEditingState(previewFrameRef.current)
    postEditingState(mobilePreviewFrameRef.current)
  }, [isMobilePreviewOpen, previewVersion])

  useEffect(() => {
    if (isDocumentChatStreaming) {
      return
    }

    const currentSignature = getDocumentChatMessagesSignature(documentChatMessages)
    const nextSignature = getDocumentChatMessagesSignature(initialDocumentChatMessages)
    if (currentSignature !== nextSignature) {
      setDocumentChatMessages(initialDocumentChatMessages)
    }
  }, [documentChatMessages, initialDocumentChatMessages, isDocumentChatStreaming, setDocumentChatMessages])

  useEffect(() => {
    setSelectedCompanyIds({})
  }, [currentDraft?.id])

  useEffect(() => {
    if (!isDocumentToolsOpen && !isMobileDocumentToolsOpen) {
      return
    }

    const closeDocumentTools = () => {
      setIsDocumentToolsOpen(false)
      setIsMobileDocumentToolsOpen(false)
    }
    const frameDocuments = [
      previewFrameRef.current?.contentDocument,
      mobilePreviewFrameRef.current?.contentDocument,
    ].filter(Boolean) as Document[]

    frameDocuments.forEach((frameDocument) => frameDocument.addEventListener('pointerdown', closeDocumentTools))
    return () => {
      frameDocuments.forEach((frameDocument) => frameDocument.removeEventListener('pointerdown', closeDocumentTools))
    }
  }, [draftId, isDocumentToolsOpen, isMobileDocumentToolsOpen, isMobilePreviewOpen, previewVersion])

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return
      }
      const data = event.data || {}
      const isKnownPreviewWindow = event.source === previewFrameRef.current?.contentWindow
        || event.source === mobilePreviewFrameRef.current?.contentWindow
      if (!isKnownPreviewWindow) {
        return
      }
      if (!currentDraft?.id || data.draftId !== currentDraft.id) {
        return
      }

      if (data.type === 'document-preview-editing-finished') {
        void previewFieldSaveQueueRef.current.finally(() => {
          setPreviewVersion((value) => value + 1)
        })
        return
      }

      if (data.type === 'document-preview-stamps-change') {
        const nextStamps = Array.isArray(data.stamps) ? data.stamps : []
        await documentWorkspacesApi.updateDraft(currentDraft.id, {
          draft_payload: {
            stamps: nextStamps,
          },
        })
        await queryClient.invalidateQueries({ queryKey: ['document-draft', currentDraft.id] })
        await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
        return
      }

      if (data.type === 'document-preview-item-delete') {
        const itemId = String(data.itemId || '').trim()
        const placeholder = data.placeholder === true
        if (!itemId) {
          return
        }

        previewFieldSaveCountRef.current += 1
        setIsPreviewFieldSaving(true)
        previewFieldSaveQueueRef.current = previewFieldSaveQueueRef.current
          .catch(() => undefined)
          .then(async () => {
            const response = await documentWorkspacesApi.deleteDraftItem(currentDraft.id, itemId, { placeholder })
            if (response.data) {
              queryClient.setQueryData(['document-draft', currentDraft.id], response)
            }
            await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
            setPreviewVersion((value) => value + 1)
          })
          .catch((error) => {
            toast.error(getDocumentErrorMessage(error, '删除表格行失败'))
            setPreviewVersion((value) => value + 1)
          })
          .finally(() => {
            previewFieldSaveCountRef.current = Math.max(previewFieldSaveCountRef.current - 1, 0)
            if (previewFieldSaveCountRef.current === 0) {
              setIsPreviewFieldSaving(false)
            }
          })
        return
      }

      if (data.type !== 'document-preview-field-change') {
        return
      }

      const change = data.change && typeof data.change === 'object' ? data.change : null
      const path = String(change?.path || '').trim()
      if (!path) {
        return
      }

      previewFieldSaveCountRef.current += 1
      setIsPreviewFieldSaving(true)
      previewFieldSaveQueueRef.current = previewFieldSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const response = await documentWorkspacesApi.updateDraftFields(currentDraft.id, [{
            path,
            itemId: String(change?.itemId || '').trim() || undefined,
            createItem: change?.createItem === true,
            value: change?.value == null ? '' : String(change.value),
          }])
          if (response.data) {
            queryClient.setQueryData(['document-draft', currentDraft.id], response)
          }
          await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
        })
        .catch((error) => {
          toast.error(getDocumentErrorMessage(error, '保存文档字段失败'))
        })
        .finally(() => {
          previewFieldSaveCountRef.current = Math.max(previewFieldSaveCountRef.current - 1, 0)
          if (previewFieldSaveCountRef.current === 0) {
            setIsPreviewFieldSaving(false)
          }
        })
    }

    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [currentDraft, queryClient])

  const createDraftMutation = useMutation({
    mutationFn: async ({ template }: { template: DocumentTemplate; message: string }) => {
      const defaultTitle = String(template.default_payload?.title || '').trim()
      return documentWorkspacesApi.createDraft({
        document_type: template.document_type,
        document_template_id: template.id,
        title: defaultTitle
          || String(template.name || '').trim()
          || (template.document_type === 'quote' ? '报价单' : '销售合同'),
      })
    },
    onSuccess: async (response, variables) => {
      const nextDraft = response.data
      if (!nextDraft) {
        return
      }
      setQueuedInitialMessage({ draftId: nextDraft.id, text: variables.message })
      setDraftSearchParam(nextDraft.id)
      await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      await queryClient.invalidateQueries({ queryKey: ['document-draft', nextDraft.id] })
    },
    onError: (error: unknown) => {
      setPendingInitialMessage('')
      toast.error(getDocumentErrorMessage(error, '创建文档失败'))
    },
  })

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string) => {
      return documentWorkspacesApi.deleteDraft(id)
    },
    onSuccess: async (_, deletedId) => {
      if (draftId === deletedId) {
        setDraftSearchParam('', { replace: true })
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

  const updateDraftTitleMutation = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      return documentWorkspacesApi.updateDraft(id, { title })
    },
    onSuccess: async (response) => {
      const nextDraft = response.data
      if (!nextDraft?.id) {
        return
      }
      setIsEditingTitle(false)
      setTitleInputValue(String(nextDraft.title || '').trim())
      setRenamingDraftId('')
      setRenamingDraftTitle('')
      await queryClient.invalidateQueries({ queryKey: ['document-draft', nextDraft.id] })
      await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
      toast.success('文档名称已更新')
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || '修改标题失败')
    },
  })

  const previewUrl = currentDraft ? `${documentWorkspacesApi.getPreviewUrl(currentDraft.id)}?v=${previewVersion}` : ''

  const conversationMessages = useMemo<AiChatPanelMessage[]>(() => {
    if (!currentDraft && !pendingTemplate) {
      return []
    }

    if (!currentDraft && pendingTemplate) {
      const messages: AiChatPanelMessage[] = [{
        id: 'document-assistant-welcome-pending',
        role: 'assistant',
        text: `已选择${pendingTemplate.name}。请告诉我客户名称、产品型号、数量或主要条款，我会在收到消息后创建${DOCUMENT_TYPE_LABELS[pendingTemplate.document_type]}。`,
      }]
      if (pendingInitialMessage) {
        messages.push({
          id: 'document-user-message-pending',
          role: 'user',
          text: pendingInitialMessage,
        })
      }
      return messages
    }

    if (!currentDraft) {
      return []
    }
    const activeDraft = currentDraft

    const chatMessages = documentChatMessages
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .map((message) => ({
        id: message.id,
        role: message.role as 'user' | 'assistant',
        text: getDocumentChatMessageText(message),
        parts: message.parts,
      }))
    const baseMessages: AiChatPanelMessage[] = chatMessages.length === 0
      ? [{
          id: 'document-assistant-welcome',
          role: 'assistant' as const,
          text: `当前已进入${DOCUMENT_TYPE_LABELS[activeDraft.document_type]}工作台。你可以先告诉我客户名称、产品型号和数量，我会先补齐基础草稿。`,
        }]
      : chatMessages

    if (isDocumentChatStreaming) {
      const lastAssistantIndex = baseMessages.findLastIndex((message) => message.role === 'assistant')
      const lastUserIndex = baseMessages.findLastIndex((message) => message.role === 'user')
      if (lastAssistantIndex < lastUserIndex) {
        baseMessages.push({
          id: `document-assistant-pending-${activeDraft.id}`,
          role: 'assistant',
          text: '',
          streaming: true,
          pending: true,
          pendingLabel: getDocumentAgentPendingLabel(documentToolActivities),
        })
      } else if (lastAssistantIndex >= 0) {
        const message = baseMessages[lastAssistantIndex]
        baseMessages[lastAssistantIndex] = {
          ...message,
          streaming: true,
          pending: !message.text?.trim(),
          pendingLabel: getDocumentAgentPendingLabel(documentToolActivities),
        }
      }
    }

    return baseMessages
  }, [currentDraft, documentChatMessages, documentToolActivities, isDocumentChatStreaming, pendingInitialMessage, pendingTemplate])

  useEffect(() => {
    if (
      !queuedInitialMessage
      || currentDraft?.id !== queuedInitialMessage.draftId
      || isDocumentChatStreaming
      || sentInitialMessageDraftIdRef.current === queuedInitialMessage.draftId
    ) {
      return
    }

    sentInitialMessageDraftIdRef.current = queuedInitialMessage.draftId
    const message = queuedInitialMessage.text
    queueMicrotask(() => {
      setQueuedInitialMessage(null)
      setPendingInitialMessage('')
      setPendingTemplate(null)
      setDocumentToolActivities([])
      void documentChat.sendMessage({ text: message })
    })
  }, [currentDraft?.id, documentChat, isDocumentChatStreaming, queuedInitialMessage])

  useEffect(() => {
    if (!currentDraft?.id) {
      return
    }
    syncPreviewStampState()
  }, [currentDraft?.id, currentDraftStamps, previewVersion])

  const handleTemplateSelect = (template: DocumentTemplate) => {
    setPendingTemplate(template)
    setPendingInitialMessage('')
    setQueuedInitialMessage(null)
    setIsTemplatePickerOpen(false)
  }

  const handleDraftSelect = async (nextDraftId: string) => {
    if (!nextDraftId) {
      return
    }
    setDraftSearchParam(nextDraftId)
    await queryClient.invalidateQueries({ queryKey: ['document-draft', nextDraftId] })
  }

  const handleSubmit = async ({ text }: { text?: string }) => {
    const value = String(text || '').trim()
    if (!value || isDocumentChatStreaming || createDraftMutation.isPending) {
      return
    }

    if (!currentDraft?.id) {
      if (!pendingTemplate) {
        return
      }
      setPendingInitialMessage(value)
      createDraftMutation.mutate({ template: pendingTemplate, message: value })
      return
    }

    setDocumentToolActivities([])
    await documentChat.sendMessage({ text: value })
  }

  const handlePrintCurrentDraft = () => {
    const activePreviewFrame = isMobile ? mobilePreviewFrameRef.current : previewFrameRef.current
    const frameWindow = activePreviewFrame?.contentWindow
    if (!frameWindow) {
      return
    }

    frameWindow.focus()
    frameWindow.print()
  }

  const handleApplyStamp = async () => {
    if (!currentDraft?.id || !selectedStampIdToApply) {
      return
    }

    const stamp = stamps.find((item) => item.id === Number(selectedStampIdToApply))
    if (!stamp?.image_path) {
      toast.error('请选择可用印章')
      return
    }

    const contentWidth = DEFAULT_DOCUMENT_PAGE_WIDTH - (DEFAULT_DOCUMENT_PAGE_PADDING * 2)
    const centeredX = Math.max(Math.round((contentWidth - 180) / 2), 0)
    const centeredY = 220

    const nextStamp: DocumentDraftStampPlacement = {
      id: `stamp-${Date.now()}`,
      stampId: stamp.id,
      name: stamp.name,
      imagePath: stamp.image_public_url || stamp.image_path,
      page: 1,
      x: centeredX,
      y: centeredY,
      width: 180,
      height: 180,
      rotation: 0,
    }

    const nextStamps = [...currentDraftStamps, nextStamp]
    const response = await documentWorkspacesApi.updateDraft(currentDraft.id, {
      draft_payload: {
        stamps: nextStamps,
      },
    })
    syncPreviewStampState({
      stamps: nextStamps,
    })
    await queryClient.setQueryData(['document-draft', currentDraft.id], { success: true, data: response.data })
    await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
    toast.success('印章已添加到预览')
  }

  const handleApplyCompany = async (slot: DocumentCompanySlot) => {
    if (!currentDraft?.id) {
      return
    }

    const role = slot.role === 'customer' ? 'customer' : 'seller'
    const selectedId = selectedCompanyIds[slot.key] || ''
    const company = companies.find((item) => item.id === Number(selectedId))
    if (!company) {
      toast.error('请选择公司')
      return
    }

    const existingParty = currentDraft.draft_payload?.[role]
    const nextParty = {
      ...(existingParty && typeof existingParty === 'object' && !Array.isArray(existingParty) ? existingParty : {}),
      name: company.contact || company.name,
      company: company.name,
      contact: company.contact || '',
      address: company.address || '',
      email: company.email || '',
      phone: company.phone || '',
    }

    const response = await documentWorkspacesApi.updateDraft(currentDraft.id, {
      draft_payload: {
        [role]: nextParty,
      },
    })
    await queryClient.setQueryData(['document-draft', currentDraft.id], { success: true, data: response.data })
    await queryClient.invalidateQueries({ queryKey: ['document-drafts'] })
    setPreviewVersion((value) => value + 1)
    toast.success('公司已填充')
  }

  const confirmDeleteDraft = () => {
    if (!deleteDraftId) {
      return
    }
    deleteDraftMutation.mutate(deleteDraftId)
  }

  const beginEditTitle = () => {
    setTitleInputValue(String(currentDraft?.title || '').trim())
    setIsEditingTitle(true)
  }

  const cancelEditTitle = () => {
    setTitleInputValue(String(currentDraft?.title || '').trim())
    setIsEditingTitle(false)
  }

  const submitTitleEdit = async () => {
    if (!currentDraft?.id || updateDraftTitleMutation.isPending) {
      return
    }

    const normalizedTitle = String(titleInputValue || '').trim()
    const currentTitle = String(currentDraft.title || '').trim()
    if (!normalizedTitle) {
      cancelEditTitle()
      return
    }
    if (normalizedTitle === currentTitle) {
      setIsEditingTitle(false)
      return
    }

    await updateDraftTitleMutation.mutateAsync({
      id: currentDraft.id,
      title: normalizedTitle,
    })
  }

  const beginListDraftRename = (draft: DocumentDraft) => {
    setRenamingDraftId(draft.id)
    setRenamingDraftTitle(String(draft.title || '').trim())
  }

  const cancelListDraftRename = () => {
    setRenamingDraftId('')
    setRenamingDraftTitle('')
  }

  const submitListDraftRename = (draft: DocumentDraft) => {
    if (updateDraftTitleMutation.isPending) return
    const normalizedTitle = String(renamingDraftTitle || '').trim()
    if (!normalizedTitle) {
      toast.error('文档名称不能为空')
      return
    }
    if (normalizedTitle === String(draft.title || '').trim()) {
      cancelListDraftRename()
      return
    }
    updateDraftTitleMutation.mutate({ id: draft.id, title: normalizedTitle })
  }

  const headerContent = currentDraft ? (
    <div className="min-w-0">
      <div className="flex items-center justify-end lg:hidden">
        <Button type="button" variant="outline" className="shrink-0" onClick={() => setIsMobilePreviewOpen(true)}>
          <Eye className="size-4" />
          预览
        </Button>
      </div>
      <div className="hidden min-w-0 items-center lg:grid lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-4">
        <div className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
            <div className="min-w-0 text-center">
              <p className="truncate text-sm font-medium">{previewHeaderTitle}</p>
            </div>
            <div className="flex justify-end">
              <Button type="button" variant="outline" className="shrink-0" onClick={handlePrintCurrentDraft}>
                导出
              </Button>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center">
          <div className="group/title flex min-w-0 items-center justify-center">
            {isEditingTitle ? (
              <Input
                ref={titleInputRef}
                value={titleInputValue}
                onChange={(event) => setTitleInputValue(event.target.value)}
                onBlur={() => void submitTitleEdit()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    void submitTitleEdit()
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    cancelEditTitle()
                  }
                }}
                disabled={updateDraftTitleMutation.isPending}
                className="h-8 max-w-full rounded-none border-0 bg-transparent px-0 text-center text-sm font-medium shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            ) : (
              <div className="relative max-w-full">
                <div className="truncate text-center text-sm font-medium">
                  {currentDraft.title || '未命名会话'}
                </div>
                <button
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={beginEditTitle}
                  className="absolute left-full top-1/2 ml-1 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover/title:opacity-100"
                  aria-label="修改标题"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : pendingTemplate ? (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => {
          setPendingTemplate(null)
          setPendingInitialMessage('')
        }}
        disabled={createDraftMutation.isPending}
        aria-label="返回文档列表"
        title="返回文档列表"
      >
        <ArrowLeft className="size-4" />
      </Button>
      <div className="min-w-0 truncate text-sm font-medium">{pendingTemplate.name}</div>
    </div>
  ) : (
    <div className="hidden min-w-0 items-center justify-between gap-3 lg:flex">
      <div className="truncate text-sm font-medium">文档列表</div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={() => void draftsQuery.refetch()}
        disabled={draftsQuery.isFetching}
        aria-label="刷新文档列表"
      >
        <RefreshCw className={`size-4 ${draftsQuery.isFetching ? 'animate-spin' : ''}`} />
      </Button>
    </div>
  )

  const chatWorkspaceSection = currentDraft || pendingTemplate ? (
    <section className="flex h-full min-h-0 flex-col bg-background">
      <AiChatPanel
        config={AI_CHAT_PANEL_CONFIGS.document}
        messages={conversationMessages}
        isSubmitting={isDocumentChatStreaming || createDraftMutation.isPending}
        onStop={() => void documentChat.stop()}
        onSubmit={(payload) => void handleSubmit({ text: payload.text })}
      />
    </section>
  ) : null

  return (
    <div className="h-full">
      {headerSlotElement ? createPortal(headerContent, headerSlotElement) : null}
      <Card className="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 py-0 shadow-none">
        <CardContent className="min-h-0 flex-1 overflow-hidden p-0">
          {!currentDraft && !pendingTemplate ? (
            <div className="flex h-full min-h-0 flex-col bg-background p-4">
              <AdminDataTable
                fill
                toolbar={(
                  <>
                <Button type="button" className="shrink-0" onClick={() => setIsTemplatePickerOpen(true)}>
                  <FilePlus2 className="size-4" />
                  添加文档
                </Button>
                <form
                  className="flex w-48 shrink-0 gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    setDocumentSearch(documentSearchInput.trim())
                    setDocumentPage(1)
                  }}
                >
                  <Input
                    value={documentSearchInput}
                    onChange={(event) => setDocumentSearchInput(event.target.value)}
                    placeholder="搜索文档名称"
                    aria-label="搜索文档名称"
                    className="min-w-0"
                  />
                  <Button type="submit" variant="outline" size="icon" aria-label="搜索文档">
                    <Search className="size-4" />
                  </Button>
                </form>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setManagedDocumentType('quote')}>
                  <FileCog className="size-4" />
                  报价单管理
                </Button>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setManagedDocumentType('contract')}>
                  <FileSignature className="size-4" />
                  合同管理
                </Button>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setIsCompanyManagerOpen(true)}>
                  <Building2 className="size-4" />
                  公司管理
                </Button>
                <Button type="button" variant="outline" className="shrink-0" onClick={() => setIsStampManagerOpen(true)}>
                  <Stamp className="size-4" />
                  印章管理
                </Button>
                  </>
                )}
                columns={(
                  <>
                    <TableHead className="min-w-[240px]">文档名称</TableHead>
                    <TableHead>文档编号</TableHead>
                    <TableHead>类型</TableHead>
                    <TableHead className="min-w-[160px]">客户</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>更新时间</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </>
                )}
                columnCount={7}
                isLoading={draftsQuery.isLoading}
                isEmpty={recentDrafts.length === 0}
                error={draftsQuery.error ? `加载失败: ${draftsQuery.error.message}` : null}
                loadingMessage="正在加载文档..."
                emptyMessage={(
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <FilePlus2 className="size-8" />
                    <div>
                      <div className="font-medium text-foreground">{documentSearch ? '没有匹配的文档' : '还没有文档'}</div>
                      <div className="mt-1 text-sm">{documentSearch ? '请尝试其它名称关键词。' : '点击“添加文档”并选择模板开始创建。'}</div>
                    </div>
                    {!documentSearch ? <Button type="button" size="sm" onClick={() => setIsTemplatePickerOpen(true)}>添加文档</Button> : null}
                  </div>
                )}
                stateCellClassName="h-48"
                pagination={draftsPagination ? {
                  page: draftsPagination.page,
                  totalPages: draftsPagination.totalPages,
                  total: draftsPagination.total,
                  pageSize: ADMIN_CONFIG.pagination.pageSize,
                  onPageChange: setDocumentPage,
                } : null}
              >
                {recentDrafts.map((draft) => (
                      <TableRow key={draft.id}>
                        <TableCell className="max-w-[320px]">
                          {renamingDraftId === draft.id ? (
                            <form
                              className="flex min-w-[220px] items-center gap-1"
                              onSubmit={(event) => {
                                event.preventDefault()
                                submitListDraftRename(draft)
                              }}
                            >
                              <Input
                                autoFocus
                                value={renamingDraftTitle}
                                onChange={(event) => setRenamingDraftTitle(event.target.value)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Escape') {
                                    event.preventDefault()
                                    cancelListDraftRename()
                                  }
                                }}
                                disabled={updateDraftTitleMutation.isPending}
                                aria-label={`重命名文档 ${draft.title || '未命名文档'}`}
                                className="h-8 min-w-0"
                              />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon-sm"
                                disabled={!renamingDraftTitle.trim() || updateDraftTitleMutation.isPending}
                                aria-label="保存文档名称"
                                title="保存"
                              >
                                <Check className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                onClick={cancelListDraftRename}
                                disabled={updateDraftTitleMutation.isPending}
                                aria-label="取消重命名"
                                title="取消"
                              >
                                <X className="size-4" />
                              </Button>
                            </form>
                          ) : (
                            <div className="group/document-title flex min-w-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={() => void handleDraftSelect(draft.id)}
                                className="min-w-0 cursor-pointer truncate text-left font-medium text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                title={draft.title || '未命名文档'}
                              >
                                {draft.title || '未命名文档'}
                              </button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-sm"
                                className="pointer-events-none size-5 shrink-0 text-muted-foreground opacity-0 transition-[color,opacity] hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 group-hover/document-title:pointer-events-auto group-hover/document-title:opacity-100 group-focus-within/document-title:pointer-events-auto group-focus-within/document-title:opacity-100"
                                onClick={() => beginListDraftRename(draft)}
                                disabled={updateDraftTitleMutation.isPending}
                                aria-label={`重命名文档 ${draft.title || '未命名文档'}`}
                                title="重命名"
                              >
                                <Pencil style={{ width: 10, height: 10 }} strokeWidth={1.5} />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">{getDraftDocumentNumber(draft) || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{DOCUMENT_TYPE_LABELS[draft.document_type]}</TableCell>
                        <TableCell className="max-w-[220px] truncate" title={getDraftCustomerName(draft)}>{getDraftCustomerName(draft) || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{getDraftStatusLabel(draft.status)}</TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">{formatRelativeTime(draft.updated_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <TableActionButton
                            variant="destructive"
                            onClick={() => setDeleteDraftId(draft.id)}
                            aria-label={`删除文档 ${draft.title || '未命名文档'}`}
                            tooltip="删除文档"
                          >
                            <Trash2 className="size-4" />
                          </TableActionButton>
                        </TableCell>
                      </TableRow>
                ))}
              </AdminDataTable>
            </div>
          ) : !currentDraft ? (
            chatWorkspaceSection
          ) : (
            isMobile ? chatWorkspaceSection : (
              <ResizablePanelGroup
                id={AI_DOCS_PANEL_LAYOUT_STORAGE_ID}
                orientation="horizontal"
                defaultLayout={workspaceDefaultLayout}
                onLayoutChanged={handleWorkspaceLayoutChanged}
                className="h-full min-h-0"
              >
                <ResizablePanel id="document-preview" defaultSize="65" minSize="45">
                <section className="relative flex h-full min-h-0 flex-col">
                <iframe
                  ref={previewFrameRef}
                  key={`desktop-${previewUrl}`}
                  src={!isMobile ? previewUrl : undefined}
                  title="文档预览"
                  onLoad={syncPreviewState}
                  className="min-h-0 flex-1 bg-transparent"
                />
                <div className="pointer-events-none absolute top-5 right-5 z-10 flex items-center gap-2">
                  <Popover open={isDocumentToolsOpen} onOpenChange={setIsDocumentToolsOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        className="pointer-events-auto h-12 w-12 rounded-full shadow-lg"
                        aria-label="打开文档工具"
                      >
                        <Settings2 className="h-5 w-5" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" side="top" className="pointer-events-auto w-[360px] space-y-3 p-4">
                      <div className="space-y-3">
                        {companySlots.length > 0 ? companySlots.map((slot) => (
                          <div key={slot.key} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                            <Select
                              value={selectedCompanyIds[slot.key] || ''}
                              onValueChange={(value) => setSelectedCompanyIds((current) => ({ ...current, [slot.key]: value || '' }))}
                            >
                              <SelectTrigger className="w-full min-w-0 overflow-hidden">
                                <SelectValue
                                  className="min-w-0 overflow-hidden"
                                  placeholder={slot.role === 'seller' ? '选择我方公司' : '选择采购公司'}
                                />
                              </SelectTrigger>
                              <SelectContent className="w-[268px] min-w-[268px] max-w-[268px]">
                                {companies.map((company) => (
                                  <SelectItem key={`${slot.key}-${company.id}`} value={String(company.id)}>
                                    <span className="block w-[220px] truncate" title={company.name}>{company.name}</span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              onClick={() => void handleApplyCompany(slot)}
                              disabled={!selectedCompanyIds[slot.key]}
                            >
                              填充
                            </Button>
                          </div>
                        )) : (
                          <div className="rounded-lg border border-dashed px-3 py-4 text-xs leading-5 text-muted-foreground">
                            当前模板还没有配置公司填充位置。
                          </div>
                        )}

                      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                        <Select value={selectedStampIdToApply} onValueChange={(value) => setSelectedStampIdToApply(value || '')}>
                          <SelectTrigger className="w-full min-w-0 overflow-hidden">
                            <SelectValue className="min-w-0 overflow-hidden" placeholder="选择印章" />
                          </SelectTrigger>
                          <SelectContent className="w-[268px] min-w-[268px] max-w-[268px]">
                            {stamps.map((stamp) => (
                              <SelectItem key={stamp.id} value={String(stamp.id)}>
                                {stamp.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button type="button" onClick={() => void handleApplyStamp()} disabled={!selectedStampIdToApply}>
                          添加
                        </Button>
                      </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
                </section>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel id="document-conversation" defaultSize="35" minSize="360px" maxSize="55">
                  {chatWorkspaceSection}
                </ResizablePanel>
              </ResizablePanelGroup>
            )
          )}
        </CardContent>
      </Card>

      {isMobile && currentDraft ? (
        <Sheet open={isMobilePreviewOpen} onOpenChange={setIsMobilePreviewOpen}>
          <SheetContent side="right" showCloseButton={false} className="!inset-0 !h-dvh !w-dvw !max-w-none !border-0 flex flex-col gap-0 p-0">
            <SheetHeader className="h-[42px] shrink-0 flex-row items-center justify-between gap-3 border-b px-3 py-0 text-left">
              <SheetTitle className="min-w-0 flex-1 truncate text-base">{previewHeaderTitle || '文档预览'}</SheetTitle>
              <SheetClose
                aria-label="关闭预览"
                render={<Button type="button" variant="ghost" size="icon-sm" className="shrink-0" />}
              >
                <X className="size-4" />
              </SheetClose>
              <SheetDescription className="sr-only">当前文档的移动端预览</SheetDescription>
            </SheetHeader>
            <div className="relative flex min-h-0 flex-1">
              <iframe
                ref={mobilePreviewFrameRef}
                key={`mobile-${previewUrl}`}
                src={isMobilePreviewOpen ? previewUrl : undefined}
                title="移动端文档预览"
                  onLoad={syncPreviewState}
                className="min-h-0 flex-1 bg-transparent"
              />
              <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex items-center gap-2">
                <Popover open={isMobileDocumentToolsOpen} onOpenChange={setIsMobileDocumentToolsOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      className="pointer-events-auto h-12 w-12 rounded-full shadow-lg"
                      aria-label="打开内容填充工具"
                    >
                      <Settings2 className="h-5 w-5" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="end"
                    side="top"
                    className="pointer-events-auto max-h-[70vh] w-[min(360px,calc(100vw-2rem))] space-y-3 overflow-y-auto p-4"
                  >
                    <div className="space-y-3">
                      {companySlots.length > 0 ? companySlots.map((slot) => (
                        <div key={`mobile-${slot.key}`} className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                          <Select
                            value={selectedCompanyIds[slot.key] || ''}
                            onValueChange={(value) => setSelectedCompanyIds((current) => ({ ...current, [slot.key]: value || '' }))}
                          >
                            <SelectTrigger className="w-full min-w-0 overflow-hidden">
                              <SelectValue
                                className="min-w-0 overflow-hidden"
                                placeholder={slot.role === 'seller' ? '选择我方公司' : '选择采购公司'}
                              />
                            </SelectTrigger>
                            <SelectContent className="max-w-(--anchor-width)">
                              {companies.map((company) => (
                                <SelectItem key={`mobile-${slot.key}-${company.id}`} value={String(company.id)}>
                                  <span className="block max-w-[180px] truncate sm:max-w-[220px]" title={company.name}>{company.name}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            onClick={() => void handleApplyCompany(slot)}
                            disabled={!selectedCompanyIds[slot.key]}
                          >
                            填充
                          </Button>
                        </div>
                      )) : (
                        <div className="rounded-lg border border-dashed px-3 py-4 text-xs leading-5 text-muted-foreground">
                          当前模板还没有配置公司填充位置。
                        </div>
                      )}
                    </div>

                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                  <Select value={selectedStampIdToApply} onValueChange={(value) => setSelectedStampIdToApply(value || '')}>
                        <SelectTrigger className="w-full min-w-0 overflow-hidden">
                          <SelectValue className="min-w-0 overflow-hidden" placeholder="选择印章" />
                        </SelectTrigger>
                        <SelectContent className="max-w-(--anchor-width)">
                          {stamps.map((stamp) => (
                            <SelectItem key={`mobile-stamp-${stamp.id}`} value={String(stamp.id)}>
                              {stamp.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        onClick={() => void handleApplyStamp()}
                        disabled={!selectedStampIdToApply}
                      >
                        添加
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

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

      <DocumentTemplatePickerDialog
        open={isTemplatePickerOpen}
        onOpenChange={setIsTemplatePickerOpen}
        templates={templates}
        isLoading={isTemplatesLoading}
        onSelect={handleTemplateSelect}
      />
      {managedDocumentType ? (
        <DocumentTemplateManagerDialog
          open
          onOpenChange={(open) => {
            if (!open) {
              setManagedDocumentType(null)
            }
          }}
          documentType={managedDocumentType}
          templates={templates}
          onConfigureCompanySlots={setCompanySlotsTemplate}
        />
      ) : null}
      <DocumentStampManagerDialog
        open={isStampManagerOpen}
        onOpenChange={setIsStampManagerOpen}
        stamps={stamps}
      />
      <DocumentCompanyManagerDialog
        open={isCompanyManagerOpen}
        onOpenChange={setIsCompanyManagerOpen}
        companies={companies}
      />
      <DocumentTemplateCompanySlotsDialog
        open={Boolean(companySlotsTemplate)}
        onOpenChange={(open) => {
          if (!open) {
            setCompanySlotsTemplate(null)
          }
        }}
        template={companySlotsTemplate}
      />
    </div>
  )
}

function getDraftDocumentNumber(draft?: DocumentDraft | null) {
  const payload = draft?.draft_payload || {}
  const fieldName = draft?.document_type === 'contract' ? 'contractNumber' : 'quoteNumber'
  return String(payload[fieldName] || '').trim()
}

function toDocumentChatMessages(draft?: DocumentDraft | null): UIMessage[] {
  if (!draft) {
    return []
  }

  return draft.messages.map((message, index) => ({
    id: `${draft.id}-${message.created_at}-${index}`,
    role: message.role,
    parts: [{ type: 'text', text: message.text }],
  }))
}

function getDocumentChatMessageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
}

function getDocumentChatMessagesSignature(messages: UIMessage[]) {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => `${message.role}:${getDocumentChatMessageText(message)}`)
    .join('|')
}

function normalizeDocumentToolActivity(value: unknown): DocumentToolActivity | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const activity = value as Record<string, unknown>
  if (activity.type !== 'tool_called' && activity.type !== 'tool_output') {
    return null
  }

  return {
    type: activity.type,
    toolName: String(activity.toolName || '').trim() || undefined,
    item: activity.item,
  }
}

function getDocumentDraftFromDataPart(value: unknown): DocumentDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const draft = (value as { draft?: unknown }).draft
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) {
    return null
  }

  return draft as DocumentDraft
}

function getDocumentAgentPendingLabel(
  activities: DocumentToolActivity[],
) {
  const latestActivity = activities[activities.length - 1]
  if (!latestActivity) {
    return 'AI 正在分析文档...'
  }
  if (latestActivity.type === 'tool_output') {
    return '文档操作已完成，正在继续处理...'
  }

  const toolName = String(latestActivity.toolName || '').trim()
  const summary = getDocumentToolSummary(latestActivity.item)
  if (summary) {
    return `正在${summary}...`
  }

  const labels: Record<string, string> = {
    get_document_workspace_context: '正在读取文档上下文...',
    set_document_customer: '正在更新客户信息...',
    set_document_seller: '正在更新我方信息...',
    replace_document_items: '正在更新文档明细...',
    set_document_terms: '正在更新文档条款...',
    apply_document_patch: '正在更新文档...',
  }
  return labels[toolName] || '正在更新文档...'
}

function getDocumentToolSummary(item: unknown) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return ''
  }
  const source = item as Record<string, unknown>
  const rawItem = source.rawItem && typeof source.rawItem === 'object' && !Array.isArray(source.rawItem)
    ? source.rawItem as Record<string, unknown>
    : null
  const argumentsJson = rawItem?.arguments
  if (typeof argumentsJson !== 'string' || !argumentsJson.trim()) {
    return ''
  }

  try {
    const parsed = JSON.parse(argumentsJson)
    return String(parsed?.summary || '').trim()
  } catch {
    return ''
  }
}

function getDraftCustomerName(draft?: DocumentDraft | null) {
  const customer = draft?.draft_payload?.customer
  if (!customer || typeof customer !== 'object' || Array.isArray(customer)) {
    return ''
  }
  const source = customer as Record<string, unknown>
  return String(source.company || source.name || '').trim()
}

function getDraftStatusLabel(status?: string) {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'completed' || normalized === 'published') {
    return '已完成'
  }
  return '草稿'
}

function getDocumentErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') {
    return fallback
  }
  const source = error as {
    message?: string
    response?: { data?: { message?: string } }
  }
  return source.response?.data?.message || source.message || fallback
}

function normalizeCompanySlots(meta: unknown): DocumentCompanySlot[] {
  const source = meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {}
  const rawSlots = Array.isArray(source.companySlots) ? source.companySlots : []

  return rawSlots
    .map((item, index) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null
      }
      const entry = item as Record<string, unknown>
      const key = String(entry.key || `company-${index + 1}`).trim()
      const role = String(entry.role || '').trim() || (index === 0 ? 'seller' : 'customer')
      const label = String(entry.label || '').trim() || `公司 ${index + 1}`
      if (!key) {
        return null
      }
      return { key, role, label }
    })
    .filter(Boolean) as DocumentCompanySlot[]
}
