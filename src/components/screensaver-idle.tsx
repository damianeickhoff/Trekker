"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { createIdleTimer } from "@/lib/idle-timer";
import { useBell } from "./bell/bell-provider";

/** What counts as someone being here. Pointer movement included: it is only a timestamp. */
const INPUT = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel", "scroll"] as const;

/**
 * Starts the screensaver after the account's idle minutes without input, on
 * any signed-in page. The minutes ride on the bell's answer, so this asks the
 * server nothing; zero, the default, means it does nothing at all.
 *
 * Input only notes the time (`createIdleTimer`), so there is no polling and no
 * timer churn. A hidden tab or anything in full screen, a trailer with two
 * minutes left, never gives way to it; either one starts the wait again.
 */
export function ScreensaverIdle() {
  const minutes = useBell().data?.me?.screensaverIdle ?? 0;
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!minutes) return;
    const timer = createIdleTimer(
      minutes * 60_000,
      () => {
        const here = window.location.pathname + window.location.search;
        router.push(`/screensaver?from=${encodeURIComponent(here)}`);
      },
      { shouldFire: () => document.visibilityState === "visible" && !document.fullscreenElement },
    );
    const onInput = () => timer.activity();
    const onVisible = () => document.visibilityState === "visible" && timer.activity();
    for (const name of INPUT) window.addEventListener(name, onInput, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      timer.stop();
      for (const name of INPUT) window.removeEventListener(name, onInput, { capture: true });
      document.removeEventListener("visibilitychange", onVisible);
    };
    // A new page is input too: the wait starts over from it.
  }, [minutes, router, pathname]);

  return null;
}
