"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import styles from "./reveal.module.css";

/**
 * Shows its children the first time they come into view, and stays shown:
 * content that fades back out on the way past is infuriating to re-read. One
 * IntersectionObserver each, disconnected on first sight; nothing measures.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Milliseconds, to stagger siblings. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      // A little before the fold, so the rise is under way as it is read.
      { rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`${styles.reveal} ${shown ? styles.shown : ""} ${className}`}
      style={delay ? ({ "--reveal-delay": `${delay}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

/** The count lives in `count.tsx`, so Home can use it without this stylesheet. */
export { Count } from "../count";

/**
 * Swipes between months on phones, as the calendar swipes between weeks: left
 * for the next, right for the one before. Wraps the page, so the gesture works
 * wherever it is scrolled to; only a clearly sideways drag counts. The address
 * is replaced, as the stepper's links replace it, so Back leaves the review.
 */
export function MonthSwipe({
  previous,
  next,
  children,
}: {
  previous: string | null;
  next: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const start = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
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
        const month = dx < 0 ? next : previous;
        if (month) router.replace(monthHref(month), { scroll: false });
      }}
    >
      {children}
    </div>
  );
}

const monthHref = (month: string) => `/review?p=month&m=${month}`;
