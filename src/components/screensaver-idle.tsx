"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Starts the screensaver once the app has been left alone long enough.
 *
 * Mounted in the layout, so it is watching on every page — which is the whole
 * point: the tab this is meant for is the one somebody put down on the kitchen
 * counter on the discover page and did not come back to.
 *
 * Renders nothing, and does nothing at all until somebody has picked a delay in
 * settings. Zero minutes is the default and means "only when I ask", in which
 * case this listens to nothing and the browser never knows it is here.
 */

/**
 * How often the clock is checked, rather than how precise the delay is.
 *
 * Activity is recorded as a timestamp and read on a timer, instead of resetting
 * a `setTimeout` on every event. `pointermove` fires a hundred times a second
 * while a mouse is moving, and tearing down and rebuilding a timer that often —
 * on every page, for the whole life of the tab — is real work for an answer that
 * was never going to be needed to the second.
 */
const TICK = 15_000;

export function ScreensaverIdle({ minutes }: { minutes: number }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (minutes <= 0) return;
    // Already there, or not signed in yet. The sign-in pages are the one place
    // where a screensaver would be actively unhelpful.
    if (pathname.startsWith("/screensaver") || pathname.startsWith("/login")) return;
    if (pathname.startsWith("/register")) return;

    const after = minutes * 60_000;
    let last = Date.now();

    function stir() {
      last = Date.now();
    }

    /**
     * Watching something is not being idle.
     *
     * A trailer handed the whole window is the case that matters: nobody
     * touches the machine for two minutes and the screensaver would slide in
     * over the top of it. Anything else in fullscreen deserves the same
     * treatment, so the test is the state rather than the element.
     */
    function busy() {
      if (document.fullscreenElement) return true;
      if (document.visibilityState !== "visible") return true;
      return false;
    }

    function check() {
      if (busy()) {
        // Not idle, and not accumulating idleness either — otherwise a film
        // that finishes at the two hour mark is followed straight into the
        // screensaver, from a standing start.
        stir();
        return;
      }

      if (Date.now() - last < after) return;

      // Where they were, so waking up puts them back rather than on the
      // dashboard. It is read back through `safeReturn` on the other side.
      router.push(`/screensaver?from=${encodeURIComponent(pathname)}`);
    }

    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    for (const event of events) window.addEventListener(event, stir, { passive: true });
    document.addEventListener("visibilitychange", stir);

    const timer = setInterval(check, TICK);

    return () => {
      for (const event of events) window.removeEventListener(event, stir);
      document.removeEventListener("visibilitychange", stir);
      clearInterval(timer);
    };
  }, [minutes, pathname, router]);

  return null;
}
