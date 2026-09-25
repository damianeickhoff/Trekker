"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-renders Home every few seconds while the backfill card is on screen, and
 * not at all while the tab is hidden. Home reads rows only, so each refresh is
 * a handful of indexed queries; when the backfill finishes, the card is not
 * rendered any more and this goes with it.
 */
export function BackfillRefresher({ every = 4000 }: { every?: number }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      timer ??= setInterval(() => router.refresh(), every);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());

    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, every]);

  return null;
}
