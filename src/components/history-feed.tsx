"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { loadHistoryPage } from "@/lib/history-actions";
import type { HistoryDay } from "@/lib/profile";
import { DayTimeline, TimelinePanel } from "./watch-history";

/**
 * The full history, loading as you go.
 *
 * A pager would have been less code, but the thing being read here is a single
 * continuous run of days — asking someone to click through to reach last March
 * makes them count pages instead of reading. The sentinel sits below the last
 * day; when it comes into view the next page is fetched.
 *
 * The first page is rendered on the server and handed in, so the page is never
 * blank and works before the JavaScript arrives.
 */
export function HistoryFeed({
  initialDays,
  initialMore,
}: {
  initialDays: HistoryDay[];
  initialMore: boolean;
}) {
  const [days, setDays] = useState(initialDays);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(initialMore);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  const loadMore = useCallback(async () => {
    // The guard is a ref-free `loading` check plus the observer disconnecting
    // below; without it a fast scroll fires the same page two or three times.
    if (loading || !more) return;

    setLoading(true);
    setFailed(false);

    try {
      const next = await loadHistoryPage(page + 1);

      setDays((current) => {
        // Belt to the ordering's braces: `getHistoryPage` sorts by id as well
        // as date so pages cannot overlap, but a play arriving twice would show
        // up here as a duplicate React key, and a list that renders is better
        // than one that throws.
        const seen = new Set(current.flatMap((day) => day.plays.map((play) => play.id)));
        const merged = current.map((day) => ({ ...day, plays: [...day.plays] }));

        for (const day of next.days) {
          const plays = day.plays.filter((play) => !seen.has(play.id));
          if (plays.length === 0) continue;
          for (const play of plays) seen.add(play.id);

          const minutes = plays.reduce((sum, play) => sum + play.runtime, 0);
          const last = merged.at(-1);

          // A day can straddle a page boundary. Joining them here is what keeps
          // one date from growing a second heading halfway down the list.
          if (last && last.key === day.key) {
            last.plays = [...last.plays, ...plays];
            last.minutes += minutes;
          } else {
            merged.push({ ...day, plays, minutes });
          }
        }

        return merged;
      });

      setPage(next.page);
      setMore(next.more);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [loading, more, page]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !more || failed) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      // Start fetching before the sentinel is actually on screen, so the next
      // batch is usually there by the time the reader reaches it.
      { rootMargin: "600px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [loadMore, more, failed]);

  return (
    <TimelinePanel>
      <DayTimeline days={days} last={!more} />

      <div ref={sentinel} className="pt-4">
        {failed ? (
          <div className="text-center">
            <p className="text-sm text-ink-400">That did not load.</p>
            <button
              type="button"
              onClick={loadMore}
              className="mt-2 rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-2 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800"
            >
              Try again
            </button>
          </div>
        ) : more ? (
          <p className="flex items-center justify-center gap-2 text-sm text-ink-500">
            <Loader2 size={15} className="animate-spin" />
            Loading more
          </p>
        ) : (
          <p className="text-center text-xs text-ink-600">That is everything.</p>
        )}
      </div>
    </TimelinePanel>
  );
}
