import type { ReactNode } from 'react'
import { AiConversationComposer, type AiConversationComposerSubmitPayload } from '@/components/ai-chat/AiConversationComposer'
import {
  ChatWorkspaceShell,
  type ChatWorkspaceShellMessage,
  type ChatWorkspaceStatusBadge,
} from '@/components/ai-chat/ChatWorkspaceShell'
import type { AiChatPanelConfig } from '@/components/ai-chat/ai-chat-panel-config'
import type { AiToolDefinition } from '@/types'

export type AiChatPanelMessage = ChatWorkspaceShellMessage

type AiChatPanelProps = {
  config: AiChatPanelConfig
  messages: AiChatPanelMessage[]
  onSubmit: (payload: AiConversationComposerSubmitPayload) => void
  isSubmitting?: boolean
  submitDisabled?: boolean
  onStop?: () => void
  sidebar?: ReactNode
  statusBadges?: ChatWorkspaceStatusBadge[]
  availableTools?: AiToolDefinition[]
  selectedToolNames?: string[]
  onToolSelectionChange?: (toolNames: string[]) => void
  composerHeader?: ReactNode
  className?: string
}

export function AiChatPanel({
  config,
  messages,
  onSubmit,
  isSubmitting = false,
  submitDisabled = false,
  onStop,
  sidebar,
  statusBadges,
  availableTools = [],
  selectedToolNames = [],
  onToolSelectionChange = () => {},
  composerHeader,
  className,
}: AiChatPanelProps) {
  return (
    <ChatWorkspaceShell
      className={className}
      layout={config.layout}
      sidebarPosition={config.sidebarPosition}
      messages={messages}
      emptyTitle={config.emptyTitle}
      emptyDescription={config.emptyDescription}
      sidebar={sidebar}
      statusBadges={statusBadges}
      composer={(
        <AiConversationComposer
          placeholder={config.placeholder}
          availableTools={availableTools}
          selectedToolNames={selectedToolNames}
          enableTools={config.enableTools}
          enableMentions={config.enableMentions}
          submitDisabled={submitDisabled || isSubmitting}
          submitStatus={isSubmitting ? 'submitted' : 'ready'}
          onStop={onStop}
          onToolSelectionChange={onToolSelectionChange}
          onSubmit={onSubmit}
        />
      )}
    >
      {composerHeader}
    </ChatWorkspaceShell>
  )
}
