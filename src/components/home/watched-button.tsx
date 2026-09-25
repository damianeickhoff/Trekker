"use client";

import { useOptimistic, useTransition } from "react";
import { markWatchedLabel } from "@/lib/marks";
import { markEpisodeWatched } from "@/lib/play-actions";
import { Icon } from "../icon";
import { PRESS } from "../motion";
import { useTickFlash } from "./tick-flash";
import { useOfferWhen } from "./when-menu";

type Target = {
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  /** "S01 · E05 of Lanterns", for the when-menu and the accessible name. */
  label: string;
};

/**
 * Ticks at once, then records. The optimistic state lasts exactly as long as
 * the write: the action's answer carries Home re-rendered from the new rows,
 * which replaces this button with the next episode's in the same place (a tick
 * from Home holds the show's place in Up next, see `heldAt`), or removes the
 * row when nothing more has aired. If the write fails, the tick simply falls
 * back, which is the truth.
 */
function useMarkWatched(target: Target) {
  const offerWhen = useOfferWhen();
  const flash = useTickFlash();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useOptimistic(false);

  function mark() {
    if (ticked || pending) return;
    flash();
    startTransition(async () => {
      setTicked(true);
      const result = await markEpisodeWatched(target.showId, target.seasonNumber, target.episodeNumber);
      if (result?.playId) offerWhen({ playId: result.playId, label: target.label });
    });
  }

  return { ticked, mark };
}

/** The card's primary button. Mark watched is always first and always primary. */
export function WatchedButton({ className, ...target }: Target & { className: string }) {
  const { ticked, mark } = useMarkWatched(target);
  return (
    <button
      type="button"
      onClick={mark}
      aria-pressed={ticked}
      aria-label={markWatchedLabel(target.seasonNumber, target.episodeNumber)}
      className={className}
    >
      <Icon name="check" size={18} />
      {ticked ? "Done" : "Watched"}
    </button>
  );
}

/**
 * The round tick beside each show in Also waiting. It presses, washes under a
 * pointer, and when pressed fills amber over `--fast`, its check scaling in,
 * before the row collapses (`ExitList`) or the next episode takes its place.
 * Amber because it is state: this one is done.
 */
export function TickButton({ size, ...target }: Target & { size: number }) {
  const { ticked, mark } = useMarkWatched(target);
  return (
    <button
      type="button"
      onClick={mark}
      aria-pressed={ticked}
      aria-label={markWatchedLabel(target.seasonNumber, target.episodeNumber)}
      className={`${PRESS} group/tick inline-flex shrink-0 rounded-full border-0 bg-transparent p-0`}
    >
      <span
        className={`inline-flex items-center justify-center rounded-full border-[1.5px] transition-[background-color,border-color,opacity] duration-(--fast) ease-out ${
          ticked ? "border-accent bg-accent text-black" : "border-ink-3 opacity-70 group-hover/tick:bg-ink/10 group-hover/tick:opacity-100"
        }`}
        style={{ width: size, height: size }}
      >
        <Icon
          name="check"
          size={Math.round(size * 0.6)}
          className={`transition-[opacity,scale] duration-(--fast) ease-out ${ticked ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
        />
      </span>
    </button>
  );
}
