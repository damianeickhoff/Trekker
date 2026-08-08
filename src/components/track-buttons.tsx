"use client";

import { Check, ChevronDown, Clock, Eye, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  logRewatch,
  removeWatch,
  setMovieWatchedAt,
  toggleMovieWatched,
} from "@/lib/actions";
import type { SaveState } from "@/lib/lists";
import { SaveButton } from "./save-button";
import { WatchedDateMenu } from "./watched-date-menu";

type Base = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster?: string | null;
  runtime?: number | null;
  score?: number | null;
  /** TMDB release date. A film that is not out yet cannot be marked watched. */
  releaseDate?: string | null;
};

export function TrackButtons({
  item,
  initialWatched,
  initialWatchedAt,
  initialPlays = 0,
  saveState,
  signedIn,
}: {
  item: Base;
  initialWatched: boolean;
  initialWatchedAt?: Date | string | null;
  /** How many times it has been watched. Drives the "3×" chip and the unwatch wording. */
  initialPlays?: number;
  /** Which lists already hold this, and whether it is a favourite. */
  saveState: SaveState;
  signedIn: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [, setWatchedAt] = useState<Date | null>(
    initialWatchedAt ? new Date(initialWatchedAt) : null,
  );
  const [plays, setPlays] = useState(initialPlays);
  const [askWhen, setAskWhen] = useState(false);
  // Marking a film watched prunes it from the watchlist server-side, and the
  // Save menu has to be told so its tick disappears with it.
  const [watchlistCleared, setWatchlistCleared] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  // Plain date comparison: TMDB release dates carry no time or zone. A blank
  // one means unannounced, which is not something you have seen either.
  const released =
    Boolean(item.releaseDate) && item.releaseDate! <= new Date().toISOString().slice(0, 10);

  if (!signedIn) {
    return (
      <button
        onClick={() => router.push("/login")}
        className="ios-primary mx-auto rounded-xl bg-flare-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_-10px] shadow-flare-600/80 transition active:scale-[0.98] hover:bg-flare-500 sm:mx-0"
      >
        Sign in to track this
      </button>
    );
  }

  return (
    // Equal widths, structurally rather than by hand: `grid-flow-col` puts every
    // child in one row and `auto-cols-fr` gives each the same fraction of it, so
    // the two are identical whatever the labels say — "Mark watched" and
    // "12 Jan 2026 · 3×" are very different lengths, and sizing to content made
    // the row look like it had been assembled by accident. A fixed width would
    // have done it too, but only until a label outgrew the number I picked.
    //
    // On a phone the grid is the full width; on desktop it shrinks to fit, and
    // `1fr` there resolves to the widest child applied to both. Either way a
    // show — which has no watched pill — leaves one column, so Save takes the
    // whole row rather than half of it.
    //
    // The heart is deliberately not here: it lives with the trailer and the
    // overflow menu, which is where the icon-only controls belong.
    <div className="flex w-full gap-2.5 sm:grid sm:w-auto sm:auto-cols-fr sm:grid-flow-col">
      {/*
        The floor is shared with the watch button below, and is the whole point
        of it: on desktop `auto-cols-fr` sizes both columns to the widest child,
        so a label wider than "Mark watched" grew this control *and* Save beside
        it. "Not released yet" was that label. A floor both states clear means
        the row measures the same whichever one is showing — and the shorter
        wording is what the smart-list filter already calls this.
      */}
      {item.mediaType === "movie" && !released && !watched && (
        <span className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-ink-700 px-4 py-3.5 text-sm font-medium whitespace-nowrap text-ink-400 sm:min-w-[10.5rem] sm:flex-none">
          <Clock size={16} />
          Not out yet
        </span>
      )}
      {item.mediaType === "movie" && (released || watched) && (
        <div className="relative min-w-0 flex-1 sm:min-w-[10.5rem] sm:flex-none">
          <button
            disabled={pending}
            onClick={() => {
              // Once something is watched this is no longer a toggle: pressing
              // it again means "again", not "undo". So the pill opens the date
              // menu, which is where taking it back now lives — the same place
              // episodes have always kept it.
              if (watched) {
                setAskWhen((v) => !v);
                return;
              }

              startTransition(async () => {
                const res = await toggleMovieWatched({
                  movieId: item.tmdbId,
                  title: item.title,
                  poster: item.poster,
                  runtime: item.runtime ?? 0,
                  score: item.score,
                  releaseDate: item.releaseDate,
                });
                setWatched(res.watched);
                setWatchedAt(res.watched ? new Date() : null);
                setPlays(res.watched ? 1 : 0);
                // Already logged at the current time; the menu is only there in
                // case that is wrong.
                setAskWhen(res.watched);
                if (res.watched) setWatchlistCleared(true);
                // The date now lives under the synopsis, rendered by the
                // server, so it only moves when the server is asked again.
                router.refresh();
              });
            }}
            // Weight rather than decoration: a soft vertical gradient, a
            // hairline of light along the inside of the top edge, and a shadow
            // tinted with the button's own colour so it reads as lit rather
            // than as a flat rectangle dropped on the artwork.
            // One flat fill and a soft pool of its own colour underneath, so the
            // button sits above the artwork rather than being drawn on top of
            // it. No gradient and no inner highlight — those read as a plastic
            // bevel at this size, and the shape is doing the work instead.
            //
            // The same purple whether or not it has been watched: the tick, the
            // date and the chevron already say which state it is in, and
            // swapping the colour underneath them made the two states look like
            // two different buttons.
            // The transparent border is load-bearing: the watchlist button beside
            // this one has a real one, and without a matching box the two ended
            // up two pixels different in height.
            className={`ios-primary ${
              // Filled once it means something. Unwatched it is an invitation and
              // sits back; watched it is a statement and comes forward.
              watched ? "ios-primary-on" : ""
            } inline-flex w-full items-center justify-center gap-2 rounded-xl border border-transparent bg-flare-600 px-4 py-3.5 text-sm font-semibold text-white shadow-[0_10px_28px_-10px] shadow-flare-600/80 transition active:scale-[0.98] max-sm:px-3 hover:bg-flare-500 disabled:opacity-60`}
          >
            {pending ? (
              <Loader2 size={16} className="shrink-0 animate-spin" />
            ) : watched ? (
              <Check size={16} className="shrink-0" />
            ) : (
              <Eye size={16} className="shrink-0" />
            )}
            <span className="truncate">{watched ? "Watched" : "Watch"}</span>

            {/* A "1×" would be noise on everything ever logged; the count only
                earns its place once there is more than one. */}
            {watched && plays > 1 && (
              <span className="shrink-0 font-mono text-xs tabular-nums opacity-70">
                · {plays}×
              </span>
            )}

            {watched && (
              <ChevronDown size={15} className="-mr-1 ml-0.5 shrink-0 opacity-70" />
            )}
          </button>

          {askWhen && (
            <WatchedDateMenu
              releaseDate={item.releaseDate}
              onClose={() => setAskWhen(false)}
              onPick={(date) => {
                setAskWhen(false);
                setWatchedAt(date);
                startTransition(async () => {
                  const res = await setMovieWatchedAt(item.tmdbId, date.toISOString());
                  // The picked date is shown straight away, but it is not always
                  // the answer: correcting the latest viewing to something older
                  // than another one leaves that other one as the latest.
                  if (res.lastWatchedAt) setWatchedAt(new Date(res.lastWatchedAt));
                });
              }}
              onWatchAgain={() => {
                setAskWhen(false);
                startTransition(async () => {
                  const res = await logRewatch({
                    mediaType: "movie",
                    tmdbId: item.tmdbId,
                    title: item.title,
                    poster: item.poster,
                    runtime: item.runtime ?? 0,
                    score: item.score,
                  });
                  // Taken from the answer rather than incremented: a second
                  // press inside the duplicate window logs nothing, and a
                  // button that counted anyway would be contradicted by the
                  // next page load.
                  setPlays(res.plays);
                  setWatchedAt(new Date(res.lastWatchedAt));
                });
              }}
              unwatchLabel={plays > 1 ? "Remove last watch" : "Unwatch"}
              onUnwatch={() => {
                setAskWhen(false);
                startTransition(async () => {
                  const res = await removeWatch({
                    mediaType: "movie",
                    tmdbId: item.tmdbId,
                    mode: "last",
                  });
                  setPlays(res.plays);
                  setWatched(res.watched);
                  // Falls back to the viewing before the one just removed, so
                  // the pill stops showing a date that no longer exists.
                  setWatchedAt(res.lastWatchedAt ? new Date(res.lastWatchedAt) : null);
                });
              }}
              unwatchAllLabel={`Remove all ${plays} watches`}
              onUnwatchAll={
                plays > 1
                  ? () => {
                      setAskWhen(false);
                      startTransition(async () => {
                        await removeWatch({
                          mediaType: "movie",
                          tmdbId: item.tmdbId,
                          mode: "all",
                        });
                        setPlays(0);
                        setWatched(false);
                        setWatchedAt(null);
                      });
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}

      <SaveButton
        item={{
          mediaType: item.mediaType,
          tmdbId: item.tmdbId,
          title: item.title,
          poster: item.poster,
          score: item.score,
          year: item.releaseDate?.slice(0, 4) ?? null,
        }}
        initial={saveState}
        watchlistCleared={watchlistCleared}
      />
    </div>
  );
}
