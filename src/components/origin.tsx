"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";

/**
 * Where the reader was before they started opening titles.
 *
 * A title page is a place you go *from* somewhere. Follow a recommendation off
 * one show onto another, and another, and "back" one entry at a time walks you
 * out the way you came in — through four title pages you have already read —
 * when what you meant was "take me back to where I was". This remembers that
 * place: the last page that was not a title page — and, since the query string
 * is where the discover pages keep which page of results you were reading, the
 * search along with it. Without it "back to where I was" landed on page one.
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

/** The whole address to return to, query string and all. */
export function useOrigin() {
  // The server has no session, so it always renders the fallback — and the
  // client's first paint must agree with it or hydration complains.
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => FALLBACK,
  );
}

/**
 * Just the path of it, for the two callers that are asking "which page is this?"
 * rather than "where do I go?" — matching a tab, and checking whether the origin
 * is the page you are already standing on. Both would be thrown by a query
 * string neither of them cares about.
 */
export function useOriginPath() {
  return useOrigin().split("?")[0];
}

export function OriginProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The tracker reads the search params, and a component that does so cannot
        be rendered until the request's URL is known — which in a layout that
        wraps every page means opting the whole app out of static rendering.
        Suspended on its own, it is the only thing that waits, and it draws
        nothing, so there is nothing to wait for on screen either.
      */}
      <Suspense fallback={null}>
        <OriginTracker />
      </Suspense>
      {children}
    </>
  );
}

/** Records the route. Renders nothing; see `OriginProvider` for why it is split out. */
function OriginTracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();

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
    if (!isTitlePage(pathname)) set(search ? `${pathname}?${search}` : pathname);
  }, [pathname, search]);

  return null;
}
