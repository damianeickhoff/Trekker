"use client";

import { Check, ThumbsDown, ThumbsUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rateEpisode, setEpisodeWatchedAt, toggleEpisodeWatched } from "@/lib/actions";
import { publishEpisodeChanges } from "@/lib/episode-sync";
import { WatchedDateMenu } from "./watched-date-menu";

/**
 * The three things you can say about an episode you are looking at: that you
 * have seen it, when, and what you thought.
 *
 * All of it lives here now rather than in the season list. A list is for
 * finding an episode; deciding things about one is what its own page is for,
 * and the row was carrying four controls per line to avoid admitting that.
 */
export function EpisodeControls({
  showId,
  showName,
  showPoster,
  seasonNumber,
  episodeNumber,
  episodeName,
  runtime,
  airDate,
  initialWatched,
  initialRating,
  aired,
  signedIn,
}: {
  showId: number;
  showName: string;
  showPoster: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string;
  runtime: number | null;
  airDate: string | null;
  initialWatched: boolean;
  /** Thumbs up, thumbs down, or no verdict yet. */
  initialRating?: boolean;
  aired: boolean;
  signedIn: boolean;
}) {
  const [watched, setWatched] = useState(initialWatched);
  const [rating, setRating] = useState<boolean | undefined>(initialRating);
  const [askWhen, setAskWhen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const episode = { seasonNumber, episodeNumber, episodeName, runtime, airDate };

  function announce(next: boolean) {
    publishEpisodeChanges([{ showId, seasonNumber, episodeNumber, watched: next }]);
  }

  function toggle() {
    if (!aired && !watched) return;

    const next = !watched;
    setWatched(next);
    announce(next);
    // Only a fresh mark has a date worth correcting; taking one back is done.
    setAskWhen(next);

    startTransition(async () => {
      await toggleEpisodeWatched({ showId, showName, showPoster, episode });
      router.refresh();
    });
  }

  function moveTo(date: Date) {
    setAskWhen(false);
    startTransition(async () => {
      await setEpisodeWatchedAt({
        showId,
        seasonNumber,
        episodeNumber,
        watchedAt: date.toISOString(),
      });
      router.refresh();
    });
  }

  function rate(liked: boolean) {
    // Tapping the verdict it already carries takes it back off.
    const next = rating === liked ? undefined : liked;
    setRating(next);

    startTransition(async () => {
      if (next !== undefined) await rateEpisode({ showId, seasonNumber, episodeNumber, liked: next });
      router.refresh();
    });
  }

  if (!signedIn) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {/* Only once it has been seen: a verdict on something you have not
          watched is not a verdict, it is a guess. */}
      {watched && (
        <>
          <Verdict liked active={rating === true} disabled={pending} onClick={() => rate(true)} />
          <Verdict
            liked={false}
            active={rating === false}
            disabled={pending}
            onClick={() => rate(false)}
          />
        </>
      )}

      <div className="relative">
        <button
          type="button"
          onClick={toggle}
          disabled={pending || (!aired && !watched)}
          aria-label={watched ? "Watched — change the date" : "Mark watched"}
          className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-95 disabled:opacity-40 ${
            watched
              ? "border-white/25 bg-white/85 text-neutral-900 light:border-neutral-900 light:bg-neutral-900 light:text-white"
              : "border-white/20 bg-black/50 text-white light:border-ink-600 light:bg-white light:text-ink-100 hover:bg-black/50 light:hover:bg-ink-800"
          }`}
        >
          {watched && <Check size={17} />}
        </button>

        {askWhen && (
          <WatchedDateMenu
            releaseDate={airDate}
            onClose={() => setAskWhen(false)}
            onPick={moveTo}
          />
        )}
      </div>

    </div>
  );
}

function Verdict({
  liked,
  active,
  disabled,
  onClick,
}: {
  liked: boolean;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = liked ? ThumbsUp : ThumbsDown;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={liked ? "Liked it" : "Did not like it"}
      className={`grid h-9 w-9 place-items-center rounded-full border transition active:scale-95 disabled:opacity-60 ${
        active
          ? liked
            ? "border-fresh-500/60 bg-fresh-500/15 text-fresh-500"
            : "border-red-500/60 bg-red-500/15 text-red-400"
          : "border-white/20 bg-black/40 text-white/70 hover:text-white light:border-ink-600 light:bg-white light:text-ink-400 light:hover:text-ink-100"
      }`}
    >
      <Icon size={15} />
    </button>
  );
}
