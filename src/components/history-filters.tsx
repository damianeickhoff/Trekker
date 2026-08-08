"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Narrowing the history.
 *
 * The filter lives in the URL rather than in state, for the same reasons the
 * range filter on the profile does: a reload keeps it, the back button steps
 * through it, and the page can stay a server component that simply reads a
 * different slice. It also means a filtered view is a link somebody can keep.
 */

const SOURCES = [
  ["plex", "From Plex"],
  ["manual", "Ticked here"],
  ["trakt", "Imported"],
] as const;

export function HistoryFilters({ total }: { total: number }) {
  const router = useRouter();
  const params = useSearchParams();

  const q = params.get("q") ?? "";
  const mediaType = params.get("type");
  const source = params.get("source");

  const [term, setTerm] = useState(q);
  const [mirrored, setMirrored] = useState(q);

  /**
   * The field is typed into, so it owns its value — but the URL can also change
   * underneath it, from the back button or the Clear control, and then the field
   * has to follow.
   *
   * Adjusted during render rather than from an effect. React documents this as
   * the way to reset state when a prop changes: it re-renders immediately with
   * the new value and never paints the stale one, where an effect paints the old
   * value first and then corrects it.
   */
  if (q !== mirrored) {
    setMirrored(q);
    setTerm(q);
  }

  /** Rewrites the query string, dropping anything empty so URLs stay short. */
  function apply(changes: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());

    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }

    // `replace`, not `push`: typing four characters should not leave four
    // entries in the history for the back button to walk out through.
    router.replace(next.size > 0 ? `/history?${next}` : "/history", { scroll: false });
  }

  // Matched to the search overlay's debounce, so the two feel like one app.
  useEffect(() => {
    if (term === q) return;
    const timer = setTimeout(() => apply({ q: term.trim() || null }), 250);
    return () => clearTimeout(timer);
    // `apply` closes over `params`, which changes on every navigation; adding it
    // here would re-arm the timer mid-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term, q]);

  const filtered = Boolean(q || mediaType || source);

  return (
    <div className="mt-4">
      <div className="relative">
        <Search
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
        />
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Search your history"
          aria-label="Search your history"
          className="w-full rounded-xl border border-ink-700 bg-ink-900/60 py-2.5 pr-3 pl-9 text-sm outline-none placeholder:text-ink-500 focus:border-flare-500"
        />
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Chip on={mediaType === "movie"} onClick={() => apply({ type: mediaType === "movie" ? null : "movie" })}>
          Films
        </Chip>
        <Chip on={mediaType === "tv"} onClick={() => apply({ type: mediaType === "tv" ? null : "tv" })}>
          Episodes
        </Chip>

        <span className="mx-1 h-4 w-px bg-ink-800" />

        {SOURCES.map(([value, label]) => (
          <Chip
            key={value}
            on={source === value}
            onClick={() => apply({ source: source === value ? null : value })}
          >
            {label}
          </Chip>
        ))}

        {filtered && (
          <button
            type="button"
            onClick={() => router.replace("/history", { scroll: false })}
            className="ml-auto inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-ink-400 transition hover:text-ink-100"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* The count comes from the same `where` the list ran, so it cannot
          disagree with what is underneath it. */}
      {filtered && (
        <p className="mt-2.5 text-xs text-ink-400">
          {total === 0
            ? "Nothing matches that."
            : `${total.toLocaleString("en-GB")} viewing${total === 1 ? "" : "s"} match.`}
        </p>
      )}
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-xs transition ${
        on
          ? "border-flare-500 bg-flare-600/25 text-flare-200 light:text-flare-700"
          : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
