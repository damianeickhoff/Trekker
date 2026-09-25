"use client";

import { useCallback, useEffect, useState } from "react";
import { carouselStart, carouselStep, dueIn, type CarouselEvent, type CarouselState } from "@/lib/spotlight";

/**
 * Runs the spotlight's carousel (`lib/spotlight.ts`) in the page: one
 * `setTimeout` at a time for the current slide's dwell, set again whenever the
 * state changes, never an animation loop. It starts once hydrated, with
 * reduced motion (no advancing) and the tab's visibility read then and
 * followed after.
 */
export function useCarousel(count: number) {
  const [state, setState] = useState<CarouselState>(() => carouselStart(count));
  const send = useCallback((e: CarouselEvent) => setState((s) => carouselStep(s, e, performance.now())), []);

  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const hidden = () => document.visibilityState === "hidden";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion and the tab's visibility exist only in the browser, and the clock starts at hydration
    send({ type: "begin", still: motion.matches, hidden: hidden() });
    const onMotion = () => send({ type: "still", on: motion.matches });
    const onVisibility = () => send({ type: "hidden", on: hidden() });
    motion.addEventListener("change", onMotion);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [send]);

  useEffect(() => {
    const wait = dueIn(state, performance.now());
    if (wait === null) return;
    const timer = setTimeout(() => send({ type: "tick" }), wait);
    return () => clearTimeout(timer);
  }, [state, send]);

  return [state, send] as const;
}
