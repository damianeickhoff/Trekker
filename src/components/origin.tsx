"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * Where the reader was before they started opening titles.
 *
 * A title page is a place you go *from* somewhere. Follow a recommendation off
 * one show onto another, and another, and "back" one entry at a time walks you
 * out the way you came in — through four title pages you have already read —
 * when what you meant was "take me back to where I was". This remembers that
 * place: the last page that was not a title page.
 *
 * It also answers a second question the tab bar had no way to answer. On a title
 * page none of the four tabs matches the path, so none of them lit up and the
 * bar quietly stopped saying where you were. It can light the tab belonging to
 * wherever this chain started, which is the honest answer.
 *
 * Built as an external store rather than as React state, because that is what it
 * is: one value, shared by the back button and the navigation bar, that changes
 * in response to something outside the render — the route. Holding it in state
 * would have meant setting that state from an effect on every navigation, which
 * is the cascading-render pattern `useSyncExternalStore` exists to replace.
 *
 * Persisted to `sessionStorage`, so a reload in the middle of a chain does not
 * lose the thread. Per tab, and gone when the tab is, which is the right
 * lifetime for "where was I a moment ago".
 */

const KEY = "trekker:origin";
const FALLBACK = "/discover";

/** Pages that are somewhere you arrive rather than somewhere you set off from. */
function isTitlePage(pathname: string) {
  return pathname.startsWith("/title/") || pathname.startsWith("/person/");
}

let current = FALLBACK;
let restored = false;
const listeners = new Set<() => void>();

function set(next: string) {
  if (next === current) return;
  current = next;
  try {
    sessionStorage.setItem(KEY, next);
  } catch {
    // Private mode, or storage full. The value still works for this page's
    // lifetime; all that is lost is surviving a reload.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOrigin() {
  // The server has no session, so it always renders the fallback — and the
  // client's first paint must agree with it or hydration complains.
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => FALLBACK,
  );
}

export function OriginProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    // Whatever an earlier page in this tab left behind, picked up once.
    if (!restored) {
      restored = true;
      try {
        const stored = sessionStorage.getItem(KEY);
        if (stored) set(stored);
      } catch {
        // Nothing to restore; the fallback stands.
      }
    }

    // Only non-title pages are origins. Landing on a title page directly — a
    // shared link, a cold start — leaves whatever was there before, or the
    // fallback, which is the best answer available.
    if (!isTitlePage(pathname)) set(pathname);
  }, [pathname]);

  return children;
}
