"use client";

import { useState, useTransition } from "react";
import { BUCKET_NAMES } from "@/lib/popcorn";
import { rateEpisode, rateTitle } from "@/lib/title-actions";
import { Icon } from "../icon";
import { Bucket } from "../popcorn";
import { usePopover } from "./popover";
import { PRESS } from "../motion";

export type RatingTarget =
  | { kind: "title"; mediaType: "movie" | "tv"; tmdbId: number }
  | { kind: "episode"; showId: number; season: number; episode: number };

function save(target: RatingTarget, score: number | null) {
  return target.kind === "title"
    ? rateTitle(target.mediaType, target.tmdbId, score)
    : rateEpisode(target.showId, target.season, target.episode, score);
}

/**
 * The five buckets, the chosen one lifted on amber. Choosing it again clears
 * the rating. The choice shows at once and is written behind it; a failed
 * write puts the old one back, which is the truth.
 */
export function PopcornPicker({
  target,
  initial,
  size = 40,
  tone = "surface",
  stacked = false,
}: {
  target: RatingTarget;
  initial: number | null;
  size?: number;
  /** `dark` on the pill-coloured menu, which is dark in both themes. */
  tone?: "surface" | "dark";
  /** The label under the buckets rather than beside them, for a narrow menu. */
  stacked?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  function choose(n: number) {
    const before = value;
    const next = n === value ? null : n;
    setValue(next);
    startTransition(async () => {
      if (!(await save(target, next))) setValue(before);
    });
  }

  const idle = tone === "dark" ? "bg-white/12 text-white/70" : "bg-surface-2 text-ink-3";
  const label = value ? `${BUCKET_NAMES[value - 1]} · ${value} of 5` : "Not rated yet";

  return (
    <div className={`flex gap-1.5 ${stacked ? "flex-col items-start" : "items-center"}`}>
      <div role="group" aria-label="Your rating" className="flex items-center gap-1.5">
        {BUCKET_NAMES.map((name, i) => {
          const n = i + 1;
          const on = value === n;
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              aria-label={`${name}, ${n} of 5`}
              onClick={() => choose(n)}
              className={`${PRESS} inline-flex shrink-0 items-center justify-center rounded-full border-0 ${on ? "bg-accent text-black" : idle}`}
              style={{ width: size, height: size }}
            >
              <Bucket level={n} size={Math.round(size * 0.6)} />
            </button>
          );
        })}
      </div>
      <span
        className={`whitespace-nowrap text-xs ${stacked ? "" : "ml-1.5"} ${tone === "dark" ? "text-white/70" : "text-ink-2"}`}
      >
        {label}
      </span>
    </div>
  );
}

/**
 * "Your rating" in a hero's score row: the bucket shown, and the picker in a
 * menu under it. Before any rating it asks rather than showing an empty one.
 *
 * The other figures in the row are read-only, so this one has to look like
 * something to press: the bucket and its name sit in a pill of the hero's
 * glass with a chevron that says a menu opens, lighter under the pointer and
 * lighter still, pressed in a little, while held. The whole thing is one real
 * button, label included, so it is announced as "Your rating" and a button.
 * It takes the score row's two tracks like the figures do (`ScoreRow`): the
 * pill centred in the first, level with the figures beside it, and its label
 * on the second, in line with theirs, 9px under the pill's ring.
 */
export function YourRating({ target, initial }: { target: RatingTarget; initial: number | null }) {
  const { open, setOpen, ref, shown, state } = usePopover();
  const name = initial ? BUCKET_NAMES[initial - 1] : null;
  return (
    <div ref={ref} className="relative row-span-2 grid grid-rows-subgrid">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={name ? `Your rating: ${name}. Change it` : "Your rating: not rated. Rate it"}
        onClick={() => setOpen((o) => !o)}
        className="group row-span-2 grid grid-rows-subgrid justify-items-start rounded-[10px] border-0 bg-transparent p-0 text-white outline-none focus-visible:shadow-[0_0_0_2px_var(--accent)]"
      >
        <span
          data-pill=""
          className={`-ml-2.5 inline-flex h-[30px] items-center self-center gap-1.5 rounded-full py-1 pl-2.5 pr-2 ring-1 ring-white/20 transition-[scale,background-color] duration-(--fast) ease-out group-hover:bg-white/22 group-active:bg-white/30 motion-safe:group-active:scale-[0.97] ${
            open ? "bg-white/22" : "bg-white/12"
          }`}
        >
          {initial ? (
            <>
              <Bucket level={initial} size={22} />
              <span className="font-display text-lg font-extrabold tracking-[-0.02em]">{name}</span>
            </>
          ) : (
            <>
              <Bucket level={2} size={22} className="opacity-60" />
              <span className="font-display text-lg font-extrabold tracking-[-0.02em]">Rate</span>
            </>
          )}
          <Icon name="chevR" size={16} className={`text-white/78 transition-transform duration-(--fast) ease-out ${open ? "-rotate-90" : "rotate-90"}`} />
        </span>
        <span className="text-left font-mono text-[10px] uppercase tracking-[0.05em] text-white/78">Your rating</span>
      </button>
      {shown && (
        <div
          role="dialog"
          aria-label="Your rating"
          data-state={state}
          className="motion-pop absolute left-1/2 top-[calc(100%+10px)] z-(--z-popover) origin-top -translate-x-1/2 rounded-2xl bg-pill p-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] lg:left-0 lg:origin-top-left lg:translate-x-0"
        >
          <PopcornPicker target={target} initial={initial} tone="dark" size={40} stacked />
        </div>
      )}
    </div>
  );
}

