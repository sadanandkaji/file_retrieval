"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Takes a `fullText` that may be updated in bursts (as network chunks arrive)
 * and reveals it to the user at a steady pace, word by word — the same
 * "typewriter" feel you get in Claude or ChatGPT, regardless of how choppy
 * the underlying network stream is.
 *
 * When `isStreaming` is false (e.g. loading history), the full text is
 * shown instantly with no animation.
 */
export default function StreamingMessage({
  fullText,
  isStreaming,
  speedMs = 18,
}: {
  fullText: string;
  isStreaming: boolean;
  speedMs?: number;
}) {
  const [visibleLength, setVisibleLength] = useState(() => (isStreaming ? 0 : fullText.length));
  const targetRef = useRef(fullText);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  targetRef.current = fullText;

  useEffect(() => {
    if (!isStreaming) {
      // Not a live message (e.g. loaded from history) — show it instantly.
      setVisibleLength(fullText.length);
      return;
    }

    function tick() {
      setVisibleLength((prev) => {
        const target = targetRef.current;
        if (prev >= target.length) return prev;

        // Reveal a small cluster of characters per tick (roughly word-sized)
        // rather than one char at a time, so long answers don't feel sluggish.
        const remaining = target.length - prev;
        const step = remaining > 40 ? 3 : 1;
        return Math.min(prev + step, target.length);
      });
      timerRef.current = setTimeout(tick, speedMs);
    }

    timerRef.current = setTimeout(tick, speedMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStreaming, speedMs, fullText.length]);

  const shown = fullText.slice(0, visibleLength);
  const stillRevealing = isStreaming && visibleLength < fullText.length;

  return (
    <span>
      {shown}
      {stillRevealing && (
        <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[#1B2430]/40 animate-pulse rounded-sm" />
      )}
    </span>
  );
}