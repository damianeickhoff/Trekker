"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/*
 * Moving between episodes with the navigator: the new episode's own content
 * (its still and its details) comes in 12px from the side it was travelled
 * towards, and fades up, over `--base` (`[data-travel]` in `globals.css`), so
 * the reader knows which way they went. The show's backdrop and the page's
 * chrome stay put. Only a press on a navigator link (`data-travel-to`) sets it
 * off; an episode opened any other way, or loaded afresh, is simply there.
 */

let travel: { dir: string; path: string } | null = null;

function onPress(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.<HTMLAnchorElement>("a[data-travel-to]");
  if (link) travel = { dir: link.dataset.travelTo === "prev" ? "prev" : "next", path: new URL(link.href).pathname };
}

export function EpisodeArrival({ className = "", children }: { className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  // Before paint, so the first frame is already the start of the move.
  useLayoutEffect(() => {
    const el = ref.current;
    let spent: ReturnType<typeof setTimeout> | undefined;
    if (el && travel && travel.path === window.location.pathname) {
      el.dataset.travel = travel.dir;
      // Every block on the page arrives in this same commit; after it, the move is spent.
      spent = setTimeout(() => {
        travel = null;
      });
    }
    document.addEventListener("click", onPress, true);
    return () => {
      clearTimeout(spent);
      document.removeEventListener("click", onPress, true);
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
