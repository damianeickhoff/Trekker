"use client";

import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AchievementState } from "@/lib/achievements";
import { AchievementGroup } from "./achievements";
import { EmptyState } from "./ui";

const SHOW_KEYS = ["all", "todo", "done"] as const;
type ShowKey = (typeof SHOW_KEYS)[number];

const LABELS: Record<ShowKey, string> = {
  all: "All",
  todo: "In progress",
  done: "Earned",
};

/**
 * The walls, with the two things that narrow them.
 *
 * Held in component state rather than in the URL, unlike the profile's range
 * filter: the whole board is already on the page, so filtering and searching are
 * local work, and a round trip to the server to hide half of what it just sent
 * would be slower for no gain. Searching in particular has to answer on every
 * keystroke to be worth having.
 */
export function AchievementBoard({
  achievements,
  categories,
}: {
  achievements: AchievementState[];
  /** Category order, decided server-side so the catalogue stays the authority. */
  categories: string[];
}) {
  const [show, setShow] = useState<ShowKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const done = achievements.filter((a) => a.unlocked).length;
    return { all: achievements.length, todo: achievements.length - done, done };
  }, [achievements]);

  const needle = query.trim().toLowerCase();

  const matching = useMemo(() => {
    return achievements.filter((item) => {
      if (show === "done" && !item.unlocked) return false;
      if (show === "todo" && item.unlocked) return false;
      if (needle === "") return true;

      // Name, description and the category it sits in — someone typing
      // "october" should find the horror one, and "habits" the whole group.
      return (
        item.name.toLowerCase().includes(needle) ||
        item.description.toLowerCase().includes(needle) ||
        item.category.toLowerCase().includes(needle)
      );
    });
  }, [achievements, show, needle]);

  const groups = categories
    .map((category) => ({
      category,
      items: matching.filter((item) => item.category === category),
      // The real score for the category, so a narrowed view does not head every
      // group with "0 / 5" as though nothing in it had been earned.
      tally: {
        earned: achievements.filter((a) => a.category === category && a.unlocked).length,
        total: achievements.filter((a) => a.category === category).length,
      },
    }))
    .filter((group) => group.items.length > 0);

  return (
    <>
      <div className="mt-8 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div
          role="tablist"
          aria-label="Which achievements to show"
          className="flex gap-1 rounded-2xl border border-ink-800/80 bg-ink-900/40 p-1 backdrop-blur-sm"
        >
          {SHOW_KEYS.map((key) => {
            const current = key === show;

            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={current}
                onClick={() => setShow(key)}
                className={`flex-1 rounded-xl px-3 py-2 text-center text-sm whitespace-nowrap transition ${
                  current
                    ? "bg-flare-600 font-semibold text-white shadow-[0_8px_20px_-10px] shadow-flare-600/80"
                    : "text-ink-300 hover:bg-ink-800/70 hover:text-ink-100"
                }`}
              >
                {LABELS[key]}
                <span
                  className={`ml-1.5 font-mono text-xs tabular-nums ${
                    current ? "text-white/70" : "text-ink-500"
                  }`}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-500"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search achievements…"
            aria-label="Search achievements"
            className="w-full rounded-2xl border border-ink-800/80 bg-ink-900/40 py-2.5 pr-9 pl-9 text-sm backdrop-blur-sm transition outline-none placeholder:text-ink-500 focus:border-flare-500 [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-lg p-1.5 text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title={needle !== "" ? "Nothing matches" : show === "done" ? "No badges yet" : "All done"}
            body={
              needle !== ""
                ? `No achievement mentions “${query.trim()}”. Try a shorter search.`
                : show === "done"
                  ? "Nothing has been unlocked so far. Watch something and it will start filling in."
                  : "There is nothing left to chase — the whole set is yours."
            }
          />
        </div>
      ) : (
        groups.map((group) => (
          <AchievementGroup
            key={group.category}
            category={group.category}
            items={group.items}
            tally={group.tally}
          />
        ))
      )}
    </>
  );
}
