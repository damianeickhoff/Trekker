"use client";

import { useMemo, useState } from "react";
import { Clock, Filter, Tv } from "lucide-react";
import { MediaCard } from "./media-card";

export type WatchlistEntry = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  addedAt: string;
  runtime: number | null;
  streaming: string[];
  /** Overseerr's state, when it has anything to say about this one. */
  request?: "pending" | "partial" | "available";
};

type Kind = "all" | "tv" | "movie";
type Sort = "added" | "title" | "score" | "shortest" | "longest";

const KINDS: { value: Kind; label: string }[] = [
  { value: "all", label: "All" },
  { value: "tv", label: "Shows" },
  { value: "movie", label: "Movies" },
];

const SORTS: { value: Sort; label: string }[] = [
  { value: "added", label: "Recently added" },
  { value: "title", label: "A–Z" },
  { value: "score", label: "Best rated" },
  { value: "shortest", label: "Shortest first" },
  { value: "longest", label: "Longest first" },
];

export function WatchlistGrid({ items }: { items: WatchlistEntry[] }) {
  const [kind, setKind] = useState<Kind>("all");
  const [sort, setSort] = useState<Sort>("added");
  const [streamingOnly, setStreamingOnly] = useState(false);

  // Nothing to filter by if no row has been looked up yet — offering the
  // toggle then would just empty the page for no visible reason.
  const anyStreaming = items.some((item) => item.streaming.length > 0);

  const shown = useMemo(() => {
    const filtered = items.filter(
      (item) =>
        (kind === "all" || item.mediaType === kind) &&
        (!streamingOnly || item.streaming.length > 0),
    );

    // Unknown runtimes sort last either way: they are missing data, not short
    // films, and burying them keeps the top of the list trustworthy.
    const byRuntime = (a: WatchlistEntry, b: WatchlistEntry, direction: number) => {
      if (a.runtime === null) return 1;
      if (b.runtime === null) return -1;
      return (a.runtime - b.runtime) * direction;
    };

    return filtered.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title);
        case "score":
          return (b.score ?? 0) - (a.score ?? 0);
        case "shortest":
          return byRuntime(a, b, 1);
        case "longest":
          return byRuntime(a, b, -1);
        default:
          return b.addedAt.localeCompare(a.addedAt);
      }
    });
  }, [items, kind, sort, streamingOnly]);

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-ink-700 bg-ink-900/60 p-1">
          {KINDS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setKind(option.value)}
              aria-pressed={kind === option.value}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${
                kind === option.value
                  ? "bg-flare-600 text-white"
                  : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {anyStreaming && (
          <button
            type="button"
            onClick={() => setStreamingOnly((v) => !v)}
            aria-pressed={streamingOnly}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm transition ${
              streamingOnly
                ? "border-fresh-500 bg-fresh-500/15 text-fresh-500"
                : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            <Tv size={14} />
            Streaming now
          </button>
        )}

        {/*
          On a phone this is the icon and nothing else — a fixed square with the
          select stretched invisibly across it, so it stays on the same row as
          the filters instead of wrapping onto one of its own. The select is
          still the real control, so the native picker and keyboard both work;
          only its own label is hidden, and the options are given an explicit
          colour so the dropdown itself stays readable.
        */}
        <label className="relative ml-auto inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border border-ink-700 bg-ink-900/60 transition hover:bg-ink-800 sm:h-auto sm:w-auto sm:justify-start">
          <Filter size={15} className="pointer-events-none text-ink-300 sm:ml-3" aria-hidden />
          <span className="sr-only">Sort</span>
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
            className="absolute inset-0 h-full w-full appearance-none bg-transparent text-transparent sm:relative sm:inset-auto sm:h-auto sm:w-auto sm:py-2 sm:pr-3 sm:pl-2 sm:text-sm sm:text-ink-100 [&>option]:text-ink-100"
          >
            {SORTS.map((option) => (
              <option key={option.value} value={option.value} className="bg-ink-900">
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="mt-8 text-center text-sm text-ink-400">
          Nothing on your watchlist matches that.
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-3 gap-x-1.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {shown.map((item) => (
            <div key={item.id}>
              <MediaCard
                item={{
                  id: item.tmdbId,
                  mediaType: item.mediaType,
                  title: item.title,
                  poster: item.poster,
                  backdrop: null,
                  score: item.score ?? 0,
                  year: null,
                  overview: "",
                }}
                request={item.request}
              />
              <p className="mt-1 flex items-center gap-1 truncate text-[11px] text-ink-500">
                {item.runtime && (
                  <>
                    <Clock size={11} className="shrink-0" />
                    {item.mediaType === "tv" ? `${item.runtime}m/ep` : `${item.runtime}m`}
                  </>
                )}
                {item.streaming.length > 0 && (
                  <span className="truncate text-fresh-500">
                    {item.runtime ? "· " : ""}
                    {item.streaming[0]}
                  </span>
                )}
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
