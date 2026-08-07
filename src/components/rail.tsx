"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Horizontal scroller. Keeps native touch/trackpad scrolling, and adds arrow
 * buttons on pointer devices where dragging a row sideways is awkward.
 */
export function Rail({
  children,
  className = "",
  scrollRef,
  artHeight,
}: {
  children: React.ReactNode;
  className?: string;
  /**
   * How tall the pictures in this rail are, in CSS length units.
   *
   * Given, the edge fade is limited to that band so the captions underneath
   * stay at full strength — see `.rail-fade-art`. Left out, the fade covers the
   * whole row, which is right for a rail that is nothing but artwork.
   */
  artHeight?: string;
  /**
   * The scrolling element itself, handed back to a caller that needs to drive
   * it — `UpNextRail` brings the next unwatched episode to the left edge, and
   * reads which season is under the reader's eye from the same box.
   */
  scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    const max = el.scrollWidth - el.clientWidth;
    // A row that does not overflow has no start or end to reach: treat it as
    // being at both, so neither arrow is rendered.
    const scrollable = max > 1;

    setEdges({
      start: !scrollable || el.scrollLeft <= 1,
      end: !scrollable || el.scrollLeft >= max - 1,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // ResizeObserver fires on observe, which gives us the initial measurement
    // without setting state synchronously inside the effect body. Children are
    // observed too: posters loading changes the scroll width but not the
    // container's size, so watching only the container would leave the arrows
    // stuck in their initial state.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    for (const child of el.children) observer.observe(child);

    el.addEventListener("scroll", measure, { passive: true });
    // Smooth scrolling keeps moving after the last `scroll` event on some
    // browsers, so settle the state once it has actually stopped.
    el.addEventListener("scrollend", measure);
    // Image decode finishes after layout; `load` does not bubble, so capture.
    el.addEventListener("load", measure, { capture: true });
    window.addEventListener("resize", measure);

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
      el.removeEventListener("scrollend", measure);
      el.removeEventListener("load", measure, { capture: true });
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  function nudge(direction: -1 | 1) {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.round(el.clientWidth * 0.8), behavior: "smooth" });
  }

  return (
    <div className={`group/rail relative ${className}`}>
      {/* Bleeds to the viewport edge, then re-adds the layout's own gutter, so
          the first card lines up with the headings above it at every width.
          The matching scroll-padding is essential: without it a snapped item
          aligns to the scrollport edge and swallows that gutter. */}
      <div
        ref={(node) => {
          ref.current = node;
          if (scrollRef) scrollRef.current = node;
        }}
        // The fade sits on whichever side still has content behind it, so a row
        // that fits shows no fade at all and a scrolled one never hard-cuts an
        // item against the gutter.
        style={artHeight ? ({ "--rail-art": artHeight } as React.CSSProperties) : undefined}
        className={`rail -mx-4 scroll-pl-4 px-4 sm:-mx-6 sm:scroll-pl-6 sm:px-6 lg:-mx-2 lg:scroll-pl-2 lg:px-2 ${
          artHeight ? "rail-fade-art" : ""
        } ${edges.start ? "" : "rail-fade-start"} ${edges.end ? "" : "rail-fade-end"}`}
      >
        {children}
      </div>

      {/* Rendered only when there is somewhere to scroll to — an arrow hidden
          with opacity alone can still be left visible by a stale style. */}
      {!edges.start && <Arrow side="left" onClick={() => nudge(-1)} />}
      {!edges.end && <Arrow side="right" onClick={() => nudge(1)} />}
    </div>
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Scroll left" : "Scroll right"}
      className={`absolute top-[38%] z-10 hidden h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-ink-700 bg-ink-900/90 text-ink-100 opacity-0 shadow-lg shadow-ink-950/60 backdrop-blur transition group-hover/rail:opacity-100 hover:border-flare-500 hover:text-flare-400 focus-visible:opacity-100 md:grid ${
        side === "left" ? "-left-4" : "-right-4"
      }`}
    >
      <Icon size={20} />
    </button>
  );
}
