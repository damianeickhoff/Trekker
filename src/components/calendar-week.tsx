"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useRef, useTransition } from "react";

/**
 * Week navigation, and the fade that covers the swap.
 *
 * Navigation runs through a transition so the week can fade out while the next
 * one is fetched and fade back in when it arrives — a plain link blanks the
 * whole thing instead. The content is keyed on the week so its staggered
 * entrance replays each time.
 */
export function CalendarWeek({
  weekStart,
  label,
  previous,
  next,
  isCurrentWeek,
  children,
}: {
  weekStart: string;
  label: string;
  previous: string;
  next: string;
  isCurrentWeek: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const swipe = useRef<{ x: number; y: number } | null>(null);

  function go(week: string | null) {
    startTransition(() => {
      router.push(week ? `/calendar?w=${week}` : "/calendar", { scroll: false });
    });
  }

  /**
   * Horizontal swipe steps the week, the way a phone calendar does.
   *
   * Deliberately not a pointer/drag handler: the day rows scroll vertically and
   * the page scrolls with them, so the gesture only counts when it is clearly
   * sideways — a comfortable distance across, and further across than down.
   */
  function onTouchStart(e: React.TouchEvent) {
    const touch = e.touches[0];
    swipe.current = { x: touch.clientX, y: touch.clientY };
  }

  function onTouchEnd(e: React.TouchEvent) {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;

    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    // Swiping left pulls the next week in from the right, and vice versa.
    go(dx < 0 ? next : previous);
  }

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          {label}
          {isCurrentWeek && (
            <span className="rounded-full bg-flare-600/20 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-flare-300 uppercase">
              This week
            </span>
          )}
        </h2>

        <div className="flex items-center gap-1.5">
          {/* Ahead of the arrows: it is the way out of wherever you have
              wandered to, not another step in the same direction. */}
          {!isCurrentWeek && (
            <button
              type="button"
              onClick={() => go(null)}
              className="mr-1 rounded-lg border border-ink-700 px-3 py-2 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              This week
            </button>
          )}
          <Step onClick={() => go(previous)} label="Previous week">
            <ChevronLeft size={17} />
          </Step>
          <Step onClick={() => go(next)} label="Next week">
            <ChevronRight size={17} />
          </Step>
        </div>
      </div>

      {/*
        A floor under the week, so a quiet one does not drag the page up.

        Everything below this — the swipe hint, and on a phone the gap down to
        the tab bar — sits wherever the week's content ends. Step from a full
        week to an empty one and that was a few hundred pixels of travel, which
        reads as the furniture moving rather than the content changing. Measured
        against the viewport rather than in rems because what matters is that the
        page still fills the screen, and that is what a screen's worth is.
      */}
      <div
        key={weekStart}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        className={`flex min-h-[62vh] flex-col transition-opacity duration-200 ${
          pending ? "opacity-0" : "opacity-100"
        }`}
      >
        {children}

        {/* Pushed to the bottom of that floor, so it lands in the same place
            whether the week holds eleven things or none. */}
        <p className="mt-auto pt-6 text-center text-xs text-ink-500 sm:hidden">
          Swipe to change week
        </p>
      </div>
    </>
  );
}

function Step({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-9 w-9 place-items-center rounded-lg border border-ink-700 text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
    >
      {children}
    </button>
  );
}
