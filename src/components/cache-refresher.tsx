"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

declare global {
  interface Window {
    __trekkerFresh?: boolean;
  }
}

/**
 * When the service worker painted this page from its cache, the data on it is
 * whatever it was on the last visit. Once the worker says the server has
 * answered, this re-reads the page's server components, which is one RSC
 * request for rows, and shows a quiet "Updating" until they land.
 */
export function CacheRefresher() {
  const router = useRouter();
  const [updating, startTransition] = useTransition();

  useEffect(() => {
    const refresh = () => {
      if (!window.__trekkerFresh) return;
      window.__trekkerFresh = false;
      startTransition(() => router.refresh());
    };
    refresh();
    window.addEventListener("trekker:fresh", refresh);
    return () => window.removeEventListener("trekker:fresh", refresh);
  }, [router]);

  if (!updating) return null;
  return (
    <div
      role="status"
      className="pointer-events-none fixed left-1/2 top-[calc(10px+env(safe-area-inset-top))] z-(--z-toast) -translate-x-1/2 rounded-full bg-pill px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-white/80"
    >
      Updating
    </div>
  );
}
