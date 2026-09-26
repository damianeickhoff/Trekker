"use client";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

/** Back in view after longer than this, and Home may be out of date. */
const STALE_MS = 15_000;
/** Mounted again after this: a copy restored from the router's cache, not React's development double mount. */
const RESTORED_MS = 1_000;

/** When this browser first drew each render, by the server's name for it. */
const firstSeen = new Map<string, number>();

/**
 * Home is only as current as the render it shows, and two ways of reaching it
 * show an old one. Going back from a title restores Home from the router's
 * cache, as it was before the title was opened, so an episode ticked there, or
 * logged by Plex meanwhile, is missing from Up next and Recently watched while
 * the title itself has it. And the installed app, brought back from the
 * background, is still the page it was left on, however long ago.
 *
 * `render` is a name the server gives each render. The age is this browser's
 * own, from when it first drew that render, rather than the server's clock
 * against the phone's, which may disagree by more than the threshold and would
 * then refresh for ever. The first mount of a render does nothing; the same
 * render mounted again is a restored copy and is re-read, as is any Home coming
 * back into view after a while. One RSC request of indexed
 * reads, so erring towards it costs little.
 */
export function FreshHome({ render }: { render: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    const seen = firstSeen.get(render);
    if (seen === undefined) firstSeen.set(render, Date.now());
    const check = (after: number) => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - (firstSeen.get(render) ?? Date.now()) < after) return;
      startTransition(() => router.refresh());
    };
    const onVisible = () => check(STALE_MS);
    if (seen !== undefined) check(RESTORED_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router, render]);

  return null;
}
