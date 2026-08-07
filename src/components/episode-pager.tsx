"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/**
 * Swiping sideways between episodes, and the movement that goes with it.
 *
 * An episode is one of a run, and the thing you want after finishing one is
 * almost always the next one — so the page behaves like a page in a book rather
 * than like a record you had to go back to a list to leave.
 *
 * The animation is doing a job, not decorating. A sideways move says "along the
 * same shelf" in a way a fade does not: the outgoing episode leaves in the
 * direction you pushed it, and the incoming one arrives from the other side, so
 * you always know which way you went and therefore how to get back.
 *
 * Touch only. A mouse has no swipe, and the previous/next controls are there
 * for everyone — including anyone who cannot make the gesture at all.
 */

/** How far a finger has to travel before it counts as a swipe, in pixels. */
const THRESHOLD = 60;
/** Past this much vertical movement it is a scroll, and none of our business. */
const SLOPE = 40;

export function EpisodePager({
  previous,
  next,
  children,
}: {
  /** Where the swipes go, or null at either end of the show. */
  previous: string | null;
  next: string | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  /**
   * Which way the page is leaving, and which episode it was leaving *from*.
   *
   * The second half is what makes this safe without an effect to clear it. A
   * new episode arrives as new props, the stored marker no longer matches, and
   * the exit state goes inert on its own — where resetting it from an effect
   * would have been a render caused by a render.
   */
  const here = `${previous}|${next}`;
  const [leaving, setLeaving] = useState<{ direction: "left" | "right"; from: string } | null>(
    null,
  );
  const exit = leaving?.from === here ? leaving.direction : null;

  function go(direction: "left" | "right") {
    const href = direction === "left" ? next : previous;
    if (!href) return;

    setLeaving({ direction, from: here });
    // Long enough for the exit to read, short enough not to feel like waiting.
    // The incoming page plays its own entrance, so the two meet in the middle.
    setTimeout(() => router.push(href), 160);
  }

  return (
    <div
      onTouchStart={(event) => {
        const touch = event.touches[0];
        start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
      }}
      onTouchEnd={(event) => {
        const from = start.current;
        const touch = event.changedTouches[0];
        start.current = null;
        if (!from || !touch) return;

        const dx = touch.clientX - from.x;
        const dy = touch.clientY - from.y;
        // Vertical intent wins: the page scrolls, and a swipe that drifts is
        // almost always a scroll that drifted.
        if (Math.abs(dy) > SLOPE || Math.abs(dx) < THRESHOLD) return;

        go(dx < 0 ? "left" : "right");
      }}
      className={`episode-page ${
        exit === "left"
          ? "episode-page-out-left"
          : exit === "right"
            ? "episode-page-out-right"
            : ""
      }`}
    >
      {children}
    </div>
  );
}
