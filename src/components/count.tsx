"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A figure that counts. The server renders the final figure, so it is right
 * without script and never flashes a zero; the count writes the span's text
 * node each frame rather than re-rendering, and is the one script-driven
 * animation in the app (STYLE.md, Motion). With reduced motion it simply
 * stays the figure.
 *
 * `on="view"` (Your review's opening figure): up from zero the first time it
 * is on screen. `on="change"` (the challenge strip's counts): never on load,
 * only from the old figure to the new one when it changes after mount, over
 * `--slow` unless told otherwise.
 *
 * `once`, inside a `CountScope`: a figure that has counted once in this
 * scope does not count again when it is drawn afresh (the profile's figures,
 * which cross over to a new range's rather than counting up a second time).
 */
export function Count({ to, duration, on = "view", once }: { to: number; duration?: number; on?: "view" | "change"; once?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useContext(Counted);
  const was = useRef<number | null>(null);
  const final = to.toLocaleString("en-GB");
  const ms = duration ?? (on === "view" ? 1200 : 400);

  useEffect(() => {
    // The text node React rendered, written in place so React still owns it.
    const text = ref.current?.firstChild;
    const before = was.current;
    was.current = to;
    if (!ref.current || !text) return;
    // Whatever a count cut short left there, the figure is the real one until a new count starts.
    text.nodeValue = final;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const run = (from: number) => {
      const started = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - started) / ms);
        // Ease out: quick at first, settling on the real figure.
        text.nodeValue = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3))).toLocaleString("en-GB");
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    if (on === "change") {
      if (before !== null && before !== to) run(before);
      return () => cancelAnimationFrame(frame);
    }

    if (to <= 0) return;
    if (once && counted?.has(once)) return;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      if (once) counted?.add(once);
      run(0);
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, ms, final, on, once, counted]);

  return (
    <span ref={ref} className="tabular-nums">
      {final}
    </span>
  );
}

const Counted = createContext<Set<string> | null>(null);

/** Where `Count once` remembers what has counted: one page's visit, from its mount to its unmount. */
export function CountScope({ children }: { children: ReactNode }) {
  const [seen] = useState(() => new Set<string>());
  return <Counted.Provider value={seen}>{children}</Counted.Provider>;
}
