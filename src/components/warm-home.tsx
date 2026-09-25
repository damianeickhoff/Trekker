"use client";

import { useEffect } from "react";

/**
 * Asks the service worker to cache Home's shell once someone is signed in.
 * Signing in reaches Home by client navigation, which the worker never sees,
 * so without this the first launch after signing in would not be shell-first.
 * The worker does nothing when the shell is already cached.
 */
export function WarmHome() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.active?.postMessage({ type: "warm-home" }))
      .catch(() => {});
  }, []);
  return null;
}
