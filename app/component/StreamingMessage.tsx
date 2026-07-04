"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Takes a `fullText` that may be updated in bursts (as network chunks arrive)
 * and reveals it to the user at a steady pace, word by word — the same
 * "typewriter" feel you get in Claude or ChatGPT, regardless of how choppy
 * the underlying network stream is.
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
  const [visibleLength, setVisibleLength] = useState(0);
  const targetRef = useRef(fullText);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  targetRef.current = fullText;

  useEffect(() => {
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
  }, [speedMs]);

  // If streaming has fully stopped and we've caught up, snap to the end.
  useEffect(() => {
    if (!isStreaming && visibleLength < fullText.length) {
      const t = setTimeout(() => setVisibleLength(fullText.length), 400);
      return () => clearTimeout(t);
    }
  }, [isStreaming, fullText, visibleLength]);

  const shown = fullText.slice(0, visibleLength);
  const stillRevealing = visibleLength < fullText.length;

  return (
    <span>
      {shown}
      {(isStreaming || stillRevealing) && (
        <span className="inline-block w-1.5 h-4 ml-0.5 -mb-0.5 bg-[#1B2430]/40 animate-pulse rounded-sm" />
      )}
    </span>
  );
}
