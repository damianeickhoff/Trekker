"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";

/**
 * Swipes between months on the recap, the way the calendar swipes between
 * weeks. Wraps the whole page, so the gesture works wherever you happen to be
 * scrolled to.
 */
export function ReviewSwipe({
  previous,
  next,
  children,
}: {
  previous: string | null;
  next: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);

  function onTouchStart(event: React.TouchEvent) {
    const touch = event.touches[0];
    start.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(event: React.TouchEvent) {
    const from = start.current;
    start.current = null;
    if (!from) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - from.x;
    const dy = touch.clientY - from.y;

    // The page scrolls vertically, so only a clearly sideways drag counts.
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const target = dx < 0 ? next : previous;
    if (target) router.push(`/review?p=month&m=${target}`, { scroll: false });
  }

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {children}
    </div>
  );
}
