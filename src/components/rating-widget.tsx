"use client";

import { useState, useTransition } from "react";
import { clearRating, rateTitle } from "@/lib/actions";
import type { RatingContext } from "@/lib/rating-context";

function tone(score: number) {
  if (score >= 70) return "text-emerald-400 light:text-emerald-700";
  if (score >= 50) return "text-amber-400 light:text-amber-700";
  return "text-red-400 light:text-red-700";
}

function verdict(score: number) {
  if (score >= 90) return "One of the greats";
  if (score >= 70) return "Good";
  if (score >= 50) return "Watchable";
  if (score >= 30) return "Weak";
  return "Bad";
}

/**
 * The line under the verdict. A score means more next to someone else's than on
 * its own, so this leads with friends where there are any, falls back to the
 * audience, and only talks about the slider when there is nothing to compare to.
 */
function compare(score: number | null, context?: RatingContext) {
  const friends = context?.friendsAverage ?? null;
  const audience = context?.audience ?? null;

  if (score === null) {
    if (friends !== null && context) {
      const others = context.friendsCount - 1;
      const who =
        others > 0
          ? `${context.friendName} and ${others} other${others === 1 ? "" : "s"}`
          : context.friendName;
      return `${who} gave it ${friends}%. Where do you land?`;
    }
    if (audience !== null) return `The audience says ${audience}%. Where do you land?`;
    return "Drag the slider and it saves itself.";
  }

  if (friends !== null) {
    const gap = score - friends;
    if (Math.abs(gap) <= 3) return `Dead on your friends' ${friends}%.`;
    return gap > 0
      ? `${gap} points above your friends, who gave it ${friends}%.`
      : `${-gap} points below your friends, who gave it ${friends}%.`;
  }

  if (audience !== null) {
    const gap = score - audience;
    if (Math.abs(gap) <= 3) return `Right where the audience landed, at ${audience}%.`;
    return gap > 0
      ? `${gap} points kinder than the audience's ${audience}%.`
      : `${-gap} points harsher than the audience's ${audience}%.`;
  }

  return "Drag to change it, or clear it below.";
}
export function RatingWidget({
  mediaType,
  tmdbId,
  title,
  poster,
  initialScore,
  initialReview,
  signedIn,
  context,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster?: string | null;
  initialScore: number | null;
  /**
   * Not editable here any more, but still carried: `rateTitle` overwrites the
   * whole row, so a score saved without it would silently wipe a review the
   * user wrote earlier.
   */
  initialReview: string | null;
  signedIn: boolean;
  context?: RatingContext;
}) {
  const [score, setScore] = useState<number | null>(initialScore);
  // Slider position while dragging, before anything is committed.
  const [draft, setDraft] = useState(initialScore ?? 70);
  const [pending, startTransition] = useTransition();

  if (!signedIn) return null;

  const shown = score ?? draft;
  const rated = score !== null;

  function commit(next: number) {
    setScore(next);
    startTransition(async () => {
      await rateTitle({
        mediaType,
        tmdbId,
        title,
        poster,
        score: next,
        review: initialReview ?? undefined,
      });
    });
  }

  function clear() {
    setScore(null);
    startTransition(async () => {
      await clearRating({ mediaType, tmdbId });
    });
  }

  /**
   * One layout at every width: a line saying where you stand, the number, and
   * the bar. There is no card around it and no dial beside it — this sits in
   * the middle of a page that is already full of panels, and the fewer of them
   * fight for attention the more the one thing you actually own stands out.
   *
   * No "rate" button either: the slider commits when you let go of it, which is
   * what the caption has always promised.
   *
   * Spacing is the caller's: this sits directly under the watch button now, and
   * the gap between the two belongs to whatever is arranging them.
   */
  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-ink-100">
          {rated ? verdict(shown) : `How do you rate this ${mediaType === "tv" ? "show" : "movie"}?`}
        </p>

        <div className="flex shrink-0 items-baseline gap-3">
          {rated && (
            <button
              type="button"
              disabled={pending}
              onClick={clear}
              className="text-xs ios-dim text-ink-400 transition hover:text-red-400 disabled:opacity-60"
            >
              Clear
            </button>
          )}
          {/* Dimmed until it means something: before you have rated anything
              this is the slider's resting position, not your verdict. */}
          <p
            className={`ios-bright text-lg font-semibold tabular-nums ${tone(shown)} ${
              rated ? "" : "opacity-50"
            }`}
          >
            {shown}%
          </p>
        </div>
      </div>

      <p className="ios-dim mt-0.5 text-xs text-ink-400">{compare(score, context)}</p>

      <input
        type="range"
        min={1}
        max={100}
        step={1}
        value={shown}
        disabled={pending}
        aria-label="Your rating as a percentage"
        aria-valuetext={`${shown} percent`}
        onChange={(e) => {
          setDraft(Number(e.target.value));
          if (rated) setScore(Number(e.target.value));
        }}
        onPointerUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => commit(Number((e.target as HTMLInputElement).value))}
        className="rating-slider ios-slider mt-3 w-full disabled:opacity-60"
        style={{ backgroundSize: `${shown}% 100%` }}
      />
    </section>
  );
}
