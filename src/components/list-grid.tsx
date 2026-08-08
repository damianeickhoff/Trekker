"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { loadMoreSmartList, removeFromList } from "@/lib/list-actions";
import type { ListItemView } from "@/lib/lists";
import { MediaCard } from "./media-card";

/**
 * A list in full, as a grid, filled in as you scroll.
 *
 * Two different things are being paced here and it is worth keeping them apart.
 * The first is *rendering*: however many titles the server sent, only a screen
 * or two of posters are put into the DOM to start with, and more are revealed
 * as the bottom comes into view. That costs nothing and is what keeps a list of
 * three hundred from laying out three hundred images before it will paint.
 *
 * The second is *fetching*, and only a smart list does it: once the rendered
 * window reaches the end of what was cached, the next twenty are asked for from
 * TMDB. That is the one with a bill attached, so it is the one hedged about
 * with guards — one request in flight at a time, a hard stop the moment the
 * server says there is no more, and a ceiling in the server action itself so
 * that a stuck observer firing in a loop cannot turn into a crawl through five
 * hundred pages of TMDB. The observer is disconnected outright when there is
 * nothing left to load, rather than being left running to fire into a no-op.
 *
 * The remove button only appears on a manual list, and only on hover or focus:
 * the posters are the content, and a permanent × on every one of them turns a
 * page you are browsing into a page you are editing. On a touch screen there is
 * no hover, so it is simply always there — which is the right answer anyway,
 * since there is no other way to reach it.
 */

/** Posters in the DOM before any scrolling. Two rows on a phone, one on a desktop. */
const INITIAL_VISIBLE = 24;

/** How many more are revealed, or fetched, per step. */
const STEP = 20;

/** How far ahead of the fold to start, so the next batch is ready on arrival. */
const LOOKAHEAD = "600px";

export function ListGrid({
  items,
  removeFrom,
  loadMoreFrom,
  requests,
}: {
  items: ListItemView[];
  /** A manual list's id — the only kind you can take titles off. */
  removeFrom?: string;
  /** A smart list's id, which is what makes scrolling fetch rather than reveal. */
  loadMoreFrom?: string;
  requests?: Record<string, "pending" | "partial" | "available">;
}) {
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  /**
   * Only what has been fetched *beyond* the server's own list, never a copy of
   * it. Mirroring the prop into state would mean syncing the two every time the
   * page revalidated; keeping them separate and concatenating at render time
   * means changes from the server just flow through.
   */
  const [fetched, setFetched] = useState<ListItemView[]>([]);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);
  const [exhausted, setExhausted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [, startTransition] = useTransition();

  const sentinel = useRef<HTMLDivElement>(null);
  // A ref rather than the `loading` state: the observer can fire twice before a
  // re-render lands, and only a ref is current enough to catch the second one.
  const busy = useRef(false);

  /**
   * Memoised, and not as a micro-optimisation: `advance` closes over this, and
   * the effect below closes over `advance`. A fresh array on every render would
   * give both a new identity every render, which tears down and rebuilds the
   * IntersectionObserver each time — an observer that is destroyed and recreated
   * constantly is worse than no observer at all, and this is the exact page
   * where that would bite.
   */
  const all = useMemo(() => [...items, ...fetched], [items, fetched]);

  const shown = all
    .filter((item) => !item.itemId || !removed.has(item.itemId))
    .slice(0, visible);

  const moreToReveal = visible < all.length;
  const canFetch = Boolean(loadMoreFrom) && !exhausted;
  const finished = !moreToReveal && !canFetch;

  const advance = useCallback(() => {
    // Everything already fetched is not yet on screen: this step is free.
    if (visible < all.length) {
      setVisible((current) => current + STEP);
      return;
    }

    if (!loadMoreFrom || exhausted || busy.current) return;

    busy.current = true;
    setLoading(true);

    startTransition(async () => {
      const result = await loadMoreSmartList({
        listId: loadMoreFrom,
        offset: all.length,
      }).catch(() => ({ items: [], done: true }));

      // Deduplicated defensively: a list refreshed underneath us could hand back
      // something already on screen, and two cards with the same key is a crash
      // rather than a cosmetic problem.
      const already = new Set(all.map((item) => `${item.mediaType}-${item.id}`));
      const additions = result.items.filter(
        (item) => !already.has(`${item.mediaType}-${item.id}`),
      );

      setFetched((current) => [...current, ...additions]);
      setVisible((current) => current + STEP);
      if (result.done || additions.length === 0) setExhausted(true);

      setLoading(false);
      busy.current = false;
    });
  }, [all, visible, loadMoreFrom, exhausted]);

  useEffect(() => {
    const node = sentinel.current;
    // Nothing left to do: the observer is taken down rather than left running
    // to fire into a function that would return immediately.
    if (!node || finished) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) advance();
      },
      { rootMargin: LOOKAHEAD },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [advance, finished]);

  if (shown.length === 0) {
    return <p className="mt-8 text-center text-sm text-ink-400">Nothing on this list.</p>;
  }

  return (
    <>
      <div className="mt-5 grid grid-cols-3 gap-x-1.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {shown.map((item) => (
          <div key={`${item.mediaType}-${item.id}`} className="group/item relative">
            <MediaCard item={item} request={requests?.[`${item.mediaType}-${item.id}`]} />

            {removeFrom && item.itemId && (
              <button
                type="button"
                aria-label={`Remove ${item.title} from this list`}
                onClick={() => {
                  const itemId = item.itemId!;
                  setRemoved((current) => new Set(current).add(itemId));
                  startTransition(async () => {
                    const result = await removeFromList({ listId: removeFrom, itemId });
                    // Put it back if the server would not have it.
                    if (!result.removed) {
                      setRemoved((current) => {
                        const next = new Set(current);
                        next.delete(itemId);
                        return next;
                      });
                    }
                  });
                }}
                className="absolute top-2 right-2 grid h-7 w-7 place-items-center rounded-full border border-white/20 bg-ink-950/70 text-white opacity-100 backdrop-blur-xs transition hover:border-red-400 hover:bg-red-600/80 md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100"
              >
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Sits below the grid and is watched rather than pressed. It is still a
          button: an observer is no use to anyone driving the page from the
          keyboard, and this is their way to the rest of it. */}
      {!finished && (
        <div ref={sentinel} className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={advance}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:border-flare-500 hover:text-ink-100 disabled:opacity-60"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? "Finding more…" : "Show more"}
          </button>
        </div>
      )}

      {/* Worth saying on a smart list, where the end could equally be TMDB
          running out or the ceiling being reached, and the reader has no way to
          tell. On a manual list running out is self-evident and says itself. */}
      {loadMoreFrom && exhausted && (
        <p className="mt-6 text-center text-xs text-ink-500">
          That is as far as this list goes. Change the filters to reach different titles.
        </p>
      )}
    </>
  );
}
