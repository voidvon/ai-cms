"use client";

import { useState } from "react";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Download, Loader2 } from "lucide-react";
import { resolveAssetUrl } from "@/lib/assets";
import { toast } from "sonner";
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
import type { AiGeneratedImage, AiMentionItem } from "@/types";
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
  images?: AiGeneratedImage[];
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
  const displayParts = Array.isArray(metadata?.displayParts) ? metadata.displayParts : [];
  const reasoningParts = parts.filter(isChatReasoningPart);
  const toolParts = parts.filter(isChatToolPart);
  const sourceParts = parts.filter(isChatSourcePart);
  const reasoningText = reasoningParts.map((part) => part.text || "").join("\n").trim();
  const shouldShowPending = isAssistant && pending && !normalizedText && !reasoningText;
  const isReasoningStreaming = reasoningParts.some(
    (part) => part.state === "streaming"
  );
  const images = Array.isArray(metadata?.images) ? metadata.images : [];
  const [downloadingAssetId, setDownloadingAssetId] = useState<number | null>(null);

  const handleDownloadImage = async (image: AiGeneratedImage) => {
    const src = resolveAssetUrl(image.relative_path, { publicUrl: image.public_url });
    if (!src || downloadingAssetId !== null) {
      return;
    }

    setDownloadingAssetId(image.asset_id);
    try {
      const { blob, mimeType } = await fetchImageDownloadBlob(src, image.relative_path);
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = buildImageDownloadName(image, mimeType);
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      toast.error("图片下载失败，请稍后重试");
    } finally {
      setDownloadingAssetId(null);
    }
  };

  return (
    <Message from={role}>
      <MessageContent
        className={
          error
            ? "rounded-2xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-destructive shadow-sm"
            : isAssistant
              ? "w-full bg-transparent px-0 py-0 shadow-none"
            : "rounded-2xl border border-border/60 bg-background px-4 py-3 shadow-sm group-[.is-user]:!rounded-3xl group-[.is-user]:border-0 group-[.is-user]:bg-muted/60 group-[.is-user]:text-foreground group-[.is-user]:shadow-none"
        }
      >
        {shouldShowPending ? (
          <Shimmer className="text-sm text-muted-foreground" duration={1.6}>
            {pendingLabel}
          </Shimmer>
        ) : error ? (
          <MessageResponse>{normalizedText}</MessageResponse>
        ) : isAssistant ? (
          <MessageResponse
            isAnimating={streaming}
            mode={streaming ? "streaming" : "static"}
          >
            {normalizedText}
          </MessageResponse>
        ) : displayParts.length > 0 ? (
          <ReadonlyMessageParts parts={displayParts} fallbackText={normalizedText} />
        ) : (
          <AnimatedMessageResponse animate={false} text={normalizedText} />
        )}
      </MessageContent>

      {images.length > 0 ? (
        <div className="grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {images.map((image) => {
            const src = resolveAssetUrl(image.relative_path, { publicUrl: image.public_url });
            return (
              <figure key={`${image.asset_id}:${image.relative_path}`} className="group relative overflow-hidden border bg-muted/20">
                <a href={src} target="_blank" rel="noreferrer" title="打开原图">
                  <img src={src} alt={image.alt || "AI 生成图片"} className="aspect-square w-full object-contain" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleDownloadImage(image)}
                  disabled={downloadingAssetId !== null}
                  title="下载图片"
                  aria-label="下载图片"
                  className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-md bg-background/90 text-foreground opacity-0 shadow-sm transition hover:bg-background group-hover:opacity-100 focus:opacity-100"
                >
                  {downloadingAssetId === image.asset_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                </button>
              </figure>
            );
          })}
        </div>
      ) : null}

      {isAssistant && reasoningText ? (
        <Reasoning defaultOpen={isReasoningStreaming} isStreaming={isReasoningStreaming}>
          <ReasoningTrigger getThinkingMessage={getReasoningStatusLabel} />
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

function getReasoningStatusLabel(isStreaming: boolean, duration?: number) {
  if (isStreaming) return <Shimmer duration={1}>正在思考...</Shimmer>;
  if (duration === undefined) return <span>思考摘要</span>;
  return <span>已思考 {duration} 秒</span>;
}

async function fetchImageDownloadBlob(primaryUrl: string, relativePath: string) {
  const fallbackUrl = String(relativePath || "").startsWith("/")
    ? new URL(relativePath, window.location.origin).toString()
    : "";
  const candidates = Array.from(new Set([primaryUrl, fallbackUrl].filter(Boolean)));

  for (const url of candidates) {
    try {
      const response = await fetch(url, { credentials: "include" });
      if (response.ok) {
        return {
          blob: await response.blob(),
          mimeType: response.headers.get("content-type"),
        };
      }
    } catch {
      // Try the same-origin compatibility URL when the asset host blocks CORS.
    }
  }

  throw new Error("image download failed");
}

function buildImageDownloadName(image: AiGeneratedImage, responseMimeType?: string | null) {
  const mimeType = String(image.mime_type || responseMimeType || "").split(";", 1)[0].toLowerCase();
  const extension = mimeType === "image/jpeg"
    ? "jpg"
    : mimeType === "image/png"
      ? "png"
      : mimeType === "image/gif"
        ? "gif"
        : "webp";
  return `ai-image-${image.asset_id}.${extension}`;
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
