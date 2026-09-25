"use client";

import { useLayoutEffect, useOptimistic, useRef, useState, useTransition } from "react";
import {
  markEpisodeWatched,
  markFilmWatched,
  markSeasonWatched,
  removeLastViewing,
  unmarkEpisodeWatched,
} from "@/lib/title-actions";
import { markWatchedLabel } from "@/lib/marks";
import { TickMark } from "../artwork";
import { useTickFlash } from "../home/tick-flash";
import { useOfferWhen } from "../home/when-menu";
import { Icon } from "../icon";
import { PRESS } from "../motion";
import { MENU, MENU_ITEM, menuOrigin, usePopover } from "./popover";

/*
 * Every "I watched this" control on the title pages. Each ticks at once and
 * records behind it; the action's answer carries the page re-rendered from the
 * new rows, which replaces the optimistic state with the real one. A failed
 * write simply falls back. A new viewing offers the "when?" menu, as on Home.
 */

type Episode = { showId: number; season: number; episode: number; label: string };

/** The hero's "Mark E05 watched". The next render brings the next episode's button. */
export function MarkNextButton({ className, text, ...target }: Episode & { className: string; text: string }) {
  const offerWhen = useOfferWhen();
  const flash = useTickFlash();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useOptimistic(false);

  function mark() {
    if (ticked || pending) return;
    flash();
    startTransition(async () => {
      setTicked(true);
      const result = await markEpisodeWatched(target.showId, target.season, target.episode);
      if (result?.playId) offerWhen({ playId: result.playId, label: target.label });
    });
  }

  return (
    <button type="button" onClick={mark} aria-pressed={ticked} aria-label={markWatchedLabel(target.season, target.episode)} className={className}>
      <Icon name="check" size={18} />
      {ticked ? "Done" : text}
    </button>
  );
}

/*
 * Ticks that turn on in the same commit (Mark whole season's answer) are
 * numbered in the order they render, which is down each column, so they pop
 * in one after another, 30ms apart and no more than ten steps in all
 * (`tick-pop` in `globals.css`). The count starts again on the next frame.
 */
let cascade = 0;
let cascadeReset = false;
function nextInCascade() {
  if (!cascadeReset) {
    cascadeReset = true;
    requestAnimationFrame(() => {
      cascade = 0;
      cascadeReset = false;
    });
  }
  return cascade++;
}

/**
 * The round tick on an episode row: marks it, or with it already ticked, takes
 * every viewing of it back off, since the tick says "I have seen this". A
 * tick that turns on after the row is drawn pops in, a small `tick-flash`,
 * in turn with any others turning on with it; a row drawn ticked is still.
 */
export function EpisodeTick({ watched, ...target }: Episode & { watched: boolean }) {
  const offerWhen = useOfferWhen();
  const [, startTransition] = useTransition();
  const [on, setOn] = useOptimistic(watched);
  const button = useRef<HTMLButtonElement>(null);
  const was = useRef(on);

  // Before paint, so the new tick's first frame is already the pop's first.
  useLayoutEffect(() => {
    const el = button.current;
    if (el && on && !was.current) {
      el.style.setProperty("--cascade", String(nextInCascade()));
      el.dataset.pop = "";
    }
    was.current = on;
  }, [on]);

  function toggle() {
    startTransition(async () => {
      setOn(!on);
      if (on) {
        await unmarkEpisodeWatched(target.showId, target.season, target.episode);
      } else {
        const result = await markEpisodeWatched(target.showId, target.season, target.episode);
        if (result?.playId) offerWhen({ playId: result.playId, label: target.label });
      }
    });
  }

  return (
    <button
      ref={button}
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? `Unmark ${target.label}` : markWatchedLabel(target.season, target.episode)}
      className={`${PRESS} tick-pop inline-flex shrink-0 rounded-full border-0 bg-transparent p-0`}
    >
      <TickMark on={on} size={28} />
    </button>
  );
}

/** "Mark whole season": the aired gaps only, never a second pass through what is seen. */
export function MarkSeasonButton({ showId, season, label }: { showId: number; season: number; label: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markSeasonWatched(showId, season)))}
      className={`${PRESS} shrink-0 whitespace-nowrap border-0 bg-transparent p-0 text-xs font-semibold text-ink-2 hover:text-ink disabled:opacity-60 lg:text-[13px]`}
    >
      {pending ? "Marking…" : label}
    </button>
  );
}

type Watchable =
  | { kind: "film"; tmdbId: number; label: string }
  | { kind: "episode"; showId: number; season: number; episode: number; label: string };

/**
 * One-tap Mark watched for a film or a single episode. Once watched it says
 * so, and pressing it offers another viewing or taking the latest one back,
 * rather than a second press silently meaning either.
 */
export function WatchToggle({
  target,
  watched,
  className,
  menuClassName = "left-0",
}: {
  target: Watchable;
  watched: string | null;
  className: string;
  menuClassName?: string;
}) {
  const offerWhen = useOfferWhen();
  const flash = useTickFlash();
  const [pending, startTransition] = useTransition();
  const [ticked, setTicked] = useOptimistic(false);
  const { open, setOpen, ref, shown, state } = usePopover();
  const [failed, setFailed] = useState(false);

  function mark() {
    setOpen(false);
    flash();
    startTransition(async () => {
      setTicked(true);
      const result =
        target.kind === "film"
          ? await markFilmWatched(target.tmdbId)
          : await markEpisodeWatched(target.showId, target.season, target.episode);
      setFailed(result === null);
      if (result?.playId) offerWhen({ playId: result.playId, label: target.label });
    });
  }

  function undo() {
    setOpen(false);
    startTransition(async () => {
      await removeLastViewing(
        target.kind === "film"
          ? { mediaType: "movie", tmdbId: target.tmdbId }
          : { mediaType: "tv", tmdbId: target.showId, season: target.season, episode: target.episode },
      );
    });
  }

  if (!watched && !ticked) {
    return (
      <button
        type="button"
        onClick={mark}
        disabled={pending}
        aria-label={target.kind === "film" ? markWatchedLabel() : markWatchedLabel(target.season, target.episode)}
        className={className}
      >
        <Icon name="check" size={18} />
        {failed ? "Not out yet" : "Mark watched"}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative flex min-w-0 grow lg:grow-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={className}
      >
        <Icon name="check" size={18} />
        {ticked ? "Done" : `Watched ${watched}`}
      </button>
      {shown && (
        <div role="menu" data-state={state} className={`${MENU} top-[calc(100%+8px)] w-60 ${menuClassName} ${menuOrigin(menuClassName)}`}>
          <button type="button" role="menuitem" onClick={mark} className={MENU_ITEM}>
            <Icon name="plus" size={18} />
            Watched it again
          </button>
          <button type="button" role="menuitem" onClick={undo} className={MENU_ITEM}>
            <Icon name="x" size={18} />
            Remove the last viewing
          </button>
        </div>
      )}
    </div>
  );
}
