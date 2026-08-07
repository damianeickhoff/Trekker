"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";
import { GENRES } from "@/lib/genres";
import type { DiscoverFilters } from "@/lib/catalogue";

/**
 * The filter bar for browsing.
 *
 * Every control writes to the URL and nothing else, so the page stays a server
 * component and the whole state of the view is one shareable link. Changing a
 * filter always drops back to page one — staying on page seven of a search that
 * no longer exists is never what anybody meant.
 */

/** Decades, as a pair of years. Nobody thinks in `primary_release_date.gte`. */
const DECADES = [2020, 2010, 2000, 1990, 1980, 1970, 1960, 1950];

const SORTS = [
  { value: "popularity", label: "Popular" },
  { value: "rating", label: "Best rated" },
  { value: "newest", label: "Newest" },
];

const SCORES = [
  { value: "", label: "Any score" },
  { value: "6", label: "6+" },
  { value: "7", label: "7+" },
  { value: "8", label: "8+" },
];

const RUNTIMES = [
  { value: "", label: "Any length" },
  { value: "95", label: "Under 95m" },
  { value: "120", label: "Under 2h" },
  { value: "150", label: "Under 2h30" },
];

export function DiscoverFilterBar({
  filters,
  hasProviders,
}: {
  filters: DiscoverFilters;
  hasProviders: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function apply(changes: Record<string, string>) {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    next.delete("page");
    router.replace(`/discover/filter?${next.toString()}`, { scroll: false });
  }

  const decade = filters.fromYear && filters.toYear === filters.fromYear + 9 ? filters.fromYear : null;
  const anyActive =
    filters.genre !== null ||
    filters.fromYear !== null ||
    filters.minScore !== null ||
    filters.maxRuntime !== null ||
    filters.providers.length > 0 ||
    filters.sort !== "popularity";

  const select =
    "rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-1.5 text-sm text-ink-100 light:bg-white";

  return (
    <div className="card space-y-3 p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 p-0.5">
          {(["movie", "tv"] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => apply({ kind: kind === "movie" ? "" : kind })}
              className={`rounded-md px-2.5 py-1 text-sm transition ${
                filters.kind === kind
                  ? "bg-flare-600 font-medium text-white"
                  : "text-ink-300 hover:bg-ink-800"
              }`}
            >
              {kind === "movie" ? "Films" : "Shows"}
            </button>
          ))}
        </div>

        <select
          aria-label="Genre"
          value={filters.genre ?? ""}
          onChange={(event) => apply({ genre: event.target.value })}
          className={select}
        >
          <option value="">Any genre</option>
          {GENRES.map((genre) => (
            <option key={genre.slug} value={genre.slug}>
              {genre.label}
            </option>
          ))}
        </select>

        <select
          aria-label="Decade"
          value={decade === null ? "" : String(decade)}
          onChange={(event) => {
            const year = event.target.value;
            apply({ from: year, to: year ? String(Number(year) + 9) : "" });
          }}
          className={select}
        >
          <option value="">Any decade</option>
          {DECADES.map((year) => (
            <option key={year} value={String(year)}>
              {year}s
            </option>
          ))}
        </select>

        <select
          aria-label="Minimum score"
          value={filters.minScore === null ? "" : String(filters.minScore)}
          onChange={(event) => apply({ score: event.target.value })}
          className={select}
        >
          {SCORES.map((option) => (
            <option key={option.label} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* TMDB has no runtime filter for television — an episode length is not
            what "under two hours" means for a series anyway. */}
        {filters.kind === "movie" && (
          <select
            aria-label="Maximum runtime"
            value={filters.maxRuntime === null ? "" : String(filters.maxRuntime)}
            onChange={(event) => apply({ runtime: event.target.value })}
            className={select}
          >
            {RUNTIMES.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 border-t border-ink-800 pt-3">
        <div className="flex items-center gap-1 rounded-lg border border-ink-700 p-0.5">
          {SORTS.map((sort) => (
            <button
              key={sort.value}
              type="button"
              onClick={() => apply({ sort: sort.value === "popularity" ? "" : sort.value })}
              className={`rounded-md px-2.5 py-1 text-sm transition ${
                filters.sort === sort.value
                  ? "bg-flare-600 font-medium text-white"
                  : "text-ink-300 hover:bg-ink-800"
              }`}
            >
              {sort.label}
            </button>
          ))}
        </div>

        {hasProviders && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.providers.length > 0}
              onChange={(event) => apply({ providers: event.target.checked ? "mine" : "" })}
              className="h-4 w-4 accent-flare-600"
            />
            On my services
          </label>
        )}

        {anyActive && (
          <button
            type="button"
            onClick={() => router.replace("/discover/filter", { scroll: false })}
            className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
          >
            <RotateCcw size={14} />
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
