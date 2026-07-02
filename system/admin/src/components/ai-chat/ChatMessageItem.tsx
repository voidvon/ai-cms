"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "@/components/ai-elements/tool";
import { AnimatedMessageResponse } from "@/components/ai-chat/AnimatedMessageResponse";
import type { AiMentionItem } from "@/types";
import type {
  DynamicToolUIPart,
  SourceDocumentUIPart,
  SourceUrlUIPart,
  ToolUIPart,
  UIMessage,
} from "ai";

type ChatMessageRole = "user" | "assistant";
type ChatMessagePart = UIMessage["parts"][number];
type ChatToolPart = ToolUIPart | DynamicToolUIPart;
type ChatSourcePart = SourceUrlUIPart | SourceDocumentUIPart;

export type AiConversationDisplayPart =
  | { type: "text"; text: string }
  | { type: "mention"; mention: AiMentionItem }
  | { type: "tool"; name: string; category?: string };

export type ChatMessageMetadata = {
  displayParts?: AiConversationDisplayPart[];
  mentions?: AiMentionItem[];
  toolNames?: string[];
};

export type ChatMessageItemProps = {
  role: ChatMessageRole;
  text?: string;
  parts?: ChatMessagePart[];
  metadata?: ChatMessageMetadata;
  streaming?: boolean;
  pending?: boolean;
  error?: boolean;
  pendingLabel?: string;
};

function getRoleLabel(role: ChatMessageRole) {
  return role === "user" ? "You" : "Assistant";
}

export function ChatMessageItem({
  role,
  text = "",
  parts = [],
  metadata,
  streaming = false,
  pending = false,
  error = false,
  pendingLabel = "AI 正在整理回复...",
}: ChatMessageItemProps) {
  const normalizedText = String(text || "").trim();
  const isAssistant = role === "assistant";
  const shouldShowPending = isAssistant && pending && !normalizedText;
  const displayParts = Array.isArray(metadata?.displayParts) ? metadata.displayParts : [];
  const reasoningParts = parts.filter(isChatReasoningPart);
  const toolParts = parts.filter(isChatToolPart);
  const sourceParts = parts.filter(isChatSourcePart);
  const reasoningText = reasoningParts.map((part) => part.text || "").join("\n").trim();
  const isReasoningStreaming = reasoningParts.some(
    (part) => part.state === "streaming"
  );

  return (
    <Message from={role}>
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        {getRoleLabel(role)}
      </div>
      <MessageContent
        className={
          error
            ? "rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive shadow-sm"
            : "rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm group-[.is-user]:border-transparent group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
        }
      >
        {shouldShowPending ? (
          <Shimmer className="text-sm text-muted-foreground" duration={1.6}>
            {pendingLabel}
          </Shimmer>
        ) : error ? (
          <MessageResponse>{normalizedText}</MessageResponse>
        ) : isAssistant ? (
          <AnimatedMessageResponse animate={streaming} text={normalizedText} />
        ) : displayParts.length > 0 ? (
          <ReadonlyMessageParts parts={displayParts} fallbackText={normalizedText} />
        ) : (
          <AnimatedMessageResponse animate={false} text={normalizedText} />
        )}
      </MessageContent>

      {isAssistant && reasoningText ? (
        <Reasoning defaultOpen={isReasoningStreaming} isStreaming={isReasoningStreaming}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoningText}</ReasoningContent>
        </Reasoning>
      ) : null}

      {isAssistant && sourceParts.length > 0 ? (
        <Sources>
          <SourcesTrigger count={sourceParts.length} />
          <SourcesContent>
            {sourceParts.map((part) => (
              <Source
                key={part.sourceId}
                href={part.type === "source-url" ? part.url : undefined}
                title={part.title}
              >
                <span className="block font-medium">
                  {part.title || part.sourceId}
                </span>
              </Source>
            ))}
          </SourcesContent>
        </Sources>
      ) : null}

      {isAssistant && toolParts.length > 0
        ? toolParts.map((part) => (
            <Tool key={getChatToolKey(part)}>
              <ToolHeader
                state={part.state}
                title={getChatToolTitle(part)}
                toolName={isDynamicToolUIPart(part) ? part.toolName : undefined}
                type={part.type}
              />
              <ToolContent>
                {"input" in part && part.input !== undefined ? (
                  <ToolInput input={part.input} />
                ) : null}
                {"output" in part || "errorText" in part ? (
                  <ToolOutput
                    errorText={"errorText" in part ? part.errorText : undefined}
                    output={"output" in part ? part.output : undefined}
                  />
                ) : null}
              </ToolContent>
            </Tool>
          ))
        : null}
    </Message>
  );
}

function ReadonlyMessageParts({
  parts,
  fallbackText,
}: {
  parts: AiConversationDisplayPart[];
  fallbackText: string;
}) {
  const visibleParts = parts.filter((part) => {
    if (part.type === "text") {
      return part.text.length > 0;
    }
    if (part.type === "mention") {
      return Boolean(part.mention?.title);
    }
    return Boolean(part.name);
  });

  if (visibleParts.length === 0) {
    return <AnimatedMessageResponse animate={false} text={fallbackText} />;
  }

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-7">
      {visibleParts.map((part, index) => {
        if (part.type === "text") {
          return <span key={`text-${index}`}>{part.text}</span>;
        }

        if (part.type === "mention") {
          return (
            <span
              key={`mention-${part.mention.type}-${part.mention.id}-${index}`}
              className="mx-0.5 inline-flex max-w-full items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/15 px-2 py-0.5 align-baseline text-xs font-medium text-primary-foreground"
              title={part.mention.subtitle || part.mention.summary || part.mention.title}
            >
              @{part.mention.title}
            </span>
          );
        }

        return (
          <span
            key={`tool-${part.name}-${index}`}
            className="mx-0.5 inline-flex max-w-full items-center rounded-full border border-primary-foreground/20 bg-primary-foreground/15 px-2 py-0.5 align-baseline text-xs font-medium text-primary-foreground"
            title={part.category || part.name}
          >
            /{part.name}
          </span>
        );
      })}
    </div>
  );
}

function isChatToolPart(part: ChatMessagePart): part is ChatToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isChatSourcePart(part: ChatMessagePart): part is ChatSourcePart {
  return part.type === "source-url" || part.type === "source-document";
}

function isChatReasoningPart(
  part: ChatMessagePart
): part is Extract<ChatMessagePart, { type: "reasoning" }> {
  return part.type === "reasoning";
}

function isDynamicToolPart(part: ChatToolPart): part is DynamicToolUIPart {
  return part.type === "dynamic-tool";
}

function getChatToolTitle(part: ChatToolPart) {
  if (isDynamicToolPart(part)) {
    return part.title || part.toolName;
  }

  return part.type.slice(5);
}

function getChatToolKey(part: ChatToolPart) {
  if (isDynamicToolPart(part)) {
    return `${part.toolCallId}:${part.state}`;
  }

  return `${part.type}:${part.toolCallId}:${part.state}`;
}
