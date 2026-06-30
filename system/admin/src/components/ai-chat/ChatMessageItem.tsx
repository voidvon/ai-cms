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

export type ChatMessageItemProps = {
  role: ChatMessageRole;
  text?: string;
  parts?: ChatMessagePart[];
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
  pending = false,
  error = false,
  pendingLabel = "AI 正在整理回复...",
}: ChatMessageItemProps) {
  const normalizedText = String(text || "").trim();
  const isAssistant = role === "assistant";
  const shouldShowPending = isAssistant && pending && !normalizedText;
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
          <AnimatedMessageResponse text={normalizedText} />
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
