"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { toggleWatchlist } from "@/lib/actions";

/**
 * "Not tonight, but keep it."
 *
 * The picks page is the one place in the app where you are shown something you
 * did not go looking for, so it is the one place where "I'll watch that some
 * other time" is the most likely reaction — and until now the only way to act
 * on it was to open the title and come back.
 *
 * Deliberately not `TrackButtons`: that is a full tracking widget with watched
 * state, play counts and a date menu behind it, none of which belongs on a
 * suggestion. This is one button that does one thing.
 *
 * The state is kept locally and optimistically. The action revalidates the tree
 * on its way out, so the server will catch up on its own; waiting for that
 * before moving the icon would put a visible pause on a button whose entire job
 * is to feel instant.
 */
export function SavePickButton({
  item,
  initialSaved,
  compact = false,
}: {
  item: {
    mediaType: "movie" | "tv";
    tmdbId: number;
    title: string;
    poster: string | null;
    score: number | null;
  };
  initialSaved: boolean;
  /** The icon-only version, for the rows where there is no width for words. */
  compact?: boolean;
}) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();

  const Icon = pending ? Loader2 : saved ? BookmarkCheck : Bookmark;
  const label = saved ? "On your watchlist" : "Save for later";

  function toggle(event: React.MouseEvent) {
    // Every one of these sits inside a link to the title, and saving something
    // is not a request to go and look at it.
    event.preventDefault();
    event.stopPropagation();

    const next = !saved;
    setSaved(next);

    startTransition(async () => {
      const result = await toggleWatchlist({
        mediaType: item.mediaType,
        tmdbId: item.tmdbId,
        title: item.title,
        poster: item.poster,
        score: item.score,
      }).catch(() => null);

      // Put it back if the server disagreed — a bookmark that silently did
      // nothing is worse than one that visibly bounced.
      if (result) setSaved(result.inWatchlist);
      else setSaved(!next);
    });
  }

  const tone = saved
    ? "border-flare-500/60 bg-flare-600/20 text-flare-300"
    : "border-ink-600/70 bg-ink-900/70 text-ink-200 hover:border-flare-500 hover:text-flare-300 light:bg-white/85";

  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={saved}
        aria-label={label}
        title={label}
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${tone}`}
      >
        <Icon size={15} className={pending ? "animate-spin" : ""} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${tone}`}
    >
      <Icon size={15} className={pending ? "animate-spin" : ""} />
      {saved ? "Saved" : "Save for later"}
    </button>
  );
}
