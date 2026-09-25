"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * A smart list just saved is being built by the queue, from answers the
 * editor's preview already cached, so it lands in seconds. While the page
 * says so it re-reads itself every few seconds, for a minute at most; the
 * list's rows are the only thing it waits on.
 */
export function BuildWatcher() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 20 || document.visibilityState !== "visible") {
        if (tries > 20) clearInterval(timer);
        return;
      }
      router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
