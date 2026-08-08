"use client";

import { useState } from "react";
import type { NormalisedItem } from "@/lib/tmdb";
import { MediaCard, type WatchStatus } from "./media-card";
import { Rail } from "./rail";

export type Credit = NormalisedItem & { character?: string };

const PREVIEW = 10;

/**
 * A person's credits: the ten most recent in a rail, with everything else one
 * tap away. Someone with two hundred credits should not get two hundred
 * posters by default.
 */
export function CreditSection({
  title,
  items,
  statuses,
}: {
  title: string;
  items: Credit[];
  statuses?: Map<string, WatchStatus>;
}) {
  const [showAll, setShowAll] = useState(false);
  const [seenOnly, setSeenOnly] = useState(false);
  if (items.length === 0) return null;

  const seen = statuses
    ? items.filter((item) => statuses.has(`${item.mediaType}-${item.id}`))
    : [];

  const pool = seenOnly ? seen : items;
  // "Show all" would be a lie about a list that is already complete.
  const canExpand = pool.length > PREVIEW;
  const visible = showAll ? pool : pool.slice(0, PREVIEW);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {title} <span className="text-sm font-normal text-ink-500">({items.length})</span>
        </h2>

        <div className="flex items-center gap-3">
          {seen.length > 0 && (
            <button
              type="button"
              onClick={() => setSeenOnly((v) => !v)}
              aria-pressed={seenOnly}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                seenOnly
                  ? "border-fresh-500 bg-fresh-500/15 text-fresh-500"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {seen.length} you have seen
            </button>
          )}
          {canExpand && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="text-sm text-flare-400 transition hover:text-flare-500"
            >
              {showAll ? "Show less" : "Show all"}
            </button>
          )}
        </div>
      </div>

      {showAll ? (
        <div className="grid grid-cols-3 gap-x-1.5 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {visible.map((item) => (
            <CreditCard key={`${item.mediaType}-${item.id}`} item={item} statuses={statuses} />
          ))}
        </div>
      ) : (
        <Rail>
          {visible.map((item) => (
            <div key={`${item.mediaType}-${item.id}`} className="rail-item w-[152px] sm:w-[184px]">
              <CreditCard item={item} statuses={statuses} />
            </div>
          ))}
        </Rail>
      )}
    </section>
  );
}

function CreditCard({
  item,
  statuses,
}: {
  item: Credit;
  statuses?: Map<string, WatchStatus>;
}) {
  return (
    <div>
      <MediaCard item={item} status={statuses?.get(`${item.mediaType}-${item.id}`)} />
      {item.character && (
        <p className="mt-0.5 line-clamp-1 text-[11px] text-ink-500">as {item.character}</p>
      )}
    </div>
  );
}
