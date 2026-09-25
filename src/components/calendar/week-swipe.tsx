"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * A sideways swipe across the week moves a week: left for the next, right for
 * the one before. Only a clearly horizontal gesture counts, so scrolling down
 * the agenda with a slightly crooked thumb never changes the week.
 */
export function WeekSwipe({
  previous,
  next,
  className,
  children,
}: {
  previous: string;
  next: string;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      className={className}
      onTouchStart={(e) => {
        const t = e.touches[0];
        start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null;
      }}
      onTouchEnd={(e) => {
        const from = start.current;
        start.current = null;
        if (!from) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - from.x;
        const dy = t.clientY - from.y;
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        router.push(`/calendar?w=${dx < 0 ? next : previous}`, { scroll: false });
      }}
    >
      {children}
    </div>
  );
}

/*
 * Which week was on screen last, and when, for the next week to know which
 * way it was travelled. A week's start is an ISO date, so later sorts after.
 * Anything older than a few seconds is a fresh visit, not a step.
 */
let lastWeek: { start: string; at: number } | null = null;

/**
 * The week's days, arriving from the side travelled towards: 16px from the
 * right after Next or a swipe to the left, from the left after Previous, and
 * a fade, over `--base` (`div[data-travel]` in `globals.css`). The first
 * week a visit shows simply appears.
 */
export function WeekArrival({ start, className, children }: { start: string; className: string; children: ReactNode }) {
  // Read at mount, and only in the browser: the server has no last week, and must draw what the first paint draws.
  const [way] = useState<"next" | "prev" | null>(() => {
    const was = typeof window === "undefined" ? null : lastWeek;
    if (!was || was.start === start || performance.now() - was.at > 10_000) return null;
    return start > was.start ? "next" : "prev";
  });
  useEffect(() => {
    lastWeek = { start, at: performance.now() };
  }, [start]);
  return (
    <div
      data-travel={way ?? undefined}
      style={way ? ({ "--motion-from": way === "next" ? "16px" : "-16px" } as CSSProperties) : undefined}
      className={className}
    >
      {children}
    </div>
  );
}
