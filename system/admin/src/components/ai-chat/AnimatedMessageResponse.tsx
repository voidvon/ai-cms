"use client";

import { MessageResponse, type MessageResponseProps } from "@/components/ai-elements/message";
import { useEffect, useMemo, useRef, useState } from "react";

const MIN_REVEAL_DURATION_MS = 180;
const MAX_REVEAL_DURATION_MS = 1200;
const MS_PER_CHARACTER = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export type AnimatedMessageResponseProps = Omit<
  MessageResponseProps,
  "children"
> & {
  text: string;
  animate?: boolean;
  placeholder?: string;
};

export function AnimatedMessageResponse({
  text,
  animate = true,
  placeholder = "...",
  ...props
}: AnimatedMessageResponseProps) {
  const characters = useMemo(() => Array.from(text || ""), [text]);
  const previousTextRef = useRef(text || "");
  const visibleCountRef = useRef(animate ? 0 : characters.length);
  const frameRef = useRef<number | null>(null);
  const [visibleCount, setVisibleCount] = useState(() =>
    animate ? 0 : characters.length
  );

  useEffect(() => {
    visibleCountRef.current = visibleCount;
  }, [visibleCount]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (!animate) {
      previousTextRef.current = text || "";
      visibleCountRef.current = characters.length;
      setVisibleCount(characters.length);
      return;
    }

    const previousText = previousTextRef.current;
    previousTextRef.current = text || "";

    if (characters.length === 0) {
      visibleCountRef.current = 0;
      setVisibleCount(0);
      return;
    }

    const previousLength = Array.from(previousText).length;
    const startCount = text.startsWith(previousText)
      ? Math.min(visibleCountRef.current, previousLength, characters.length)
      : 0;
    const remaining = characters.length - startCount;

    if (remaining <= 0) {
      visibleCountRef.current = characters.length;
      setVisibleCount(characters.length);
      return;
    }

    visibleCountRef.current = startCount;
    setVisibleCount(startCount);

    const duration = clamp(
      remaining * MS_PER_CHARACTER,
      MIN_REVEAL_DURATION_MS,
      MAX_REVEAL_DURATION_MS
    );
    const startTime = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - startTime) / duration, 1);
      const nextCount = Math.min(
        startCount + Math.ceil(remaining * progress),
        characters.length
      );

      visibleCountRef.current = nextCount;
      setVisibleCount(nextCount);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
  }, [animate, characters.length, text]);

  const visibleText = useMemo(
    () => characters.slice(0, visibleCount).join(""),
    [characters, visibleCount]
  );
  const isAnimating = animate && visibleCount < characters.length;

  return (
    <MessageResponse
      isAnimating={isAnimating}
      mode={isAnimating ? "streaming" : "static"}
      {...props}
    >
      {visibleText || placeholder}
    </MessageResponse>
  );
}
