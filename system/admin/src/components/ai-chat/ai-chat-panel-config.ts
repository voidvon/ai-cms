export type AiChatPanelConfig = {
  layout: 'split' | 'stacked'
  sidebarPosition?: 'left' | 'right'
  placeholder: string
  emptyTitle: string
  emptyDescription: string
  enableTools: boolean
  enableMentions: boolean
}

export const AI_CHAT_PANEL_CONFIGS = {
  conversation: {
    layout: 'split',
    sidebarPosition: 'left',
    placeholder: '问问 AI',
    emptyTitle: '开始新的 AI 对话',
    emptyDescription: '可以直接对话，也可以描述你想生成的图片。',
    enableTools: false,
    enableMentions: true,
  },
  document: {
    layout: 'stacked',
    placeholder: '问问 AI',
    emptyTitle: '还没有消息',
    emptyDescription: '发送第一条消息开始对话。',
    enableTools: false,
    enableMentions: false,
  },
} as const satisfies Record<'conversation' | 'document', AiChatPanelConfig>
