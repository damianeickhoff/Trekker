"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Reveals its children the first time they scroll into view — the recap is
 * meant to be read a beat at a time rather than landing all at once.
 *
 * It stays revealed afterwards: content that fades back out on the way past is
 * infuriating to re-read, and impossible to copy from.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  /** Milliseconds, for staggering siblings. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // No observer (or a very old browser): show everything rather than hiding
    // the whole page behind a feature that never fires.
    if (typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setShown(true), 0);
      return () => clearTimeout(timer);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      // Fires slightly before the element reaches the fold, so the animation is
      // already under way by the time it is properly in view.
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "reveal-in" : ""} ${className}`}
      style={{ "--reveal-delay": `${delay}ms` } as React.CSSProperties}
    >
      {children}
    </div>
  );
}

/**
 * Counts up to a number once it is on screen. Purely decorative, so it starts
 * at the final value for anyone who has asked for less motion.
 */
export function Count({
  to,
  duration = 1100,
  format = (value: number) => value.toLocaleString("en-GB"),
}: {
  to: number;
  duration?: number;
  format?: (value: number) => string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<number | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const still =
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (still || typeof IntersectionObserver === "undefined") {
      const timer = setTimeout(() => setValue(to), 0);
      return () => clearTimeout(timer);
    }

    let frame = 0;
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();

      const started = performance.now();
      const step = (now: number) => {
        const progress = Math.min(1, (now - started) / duration);
        // Ease out: fast at first, settling on the real figure.
        setValue(Math.round(to * (1 - Math.pow(1 - progress, 3))));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [to, duration]);

  // Renders the final figure on the server, so the number is right with no JS
  // and never flashes a zero.
  return (
    <span ref={ref} className="tabular-nums">
      {format(value ?? to)}
    </span>
  );
}
