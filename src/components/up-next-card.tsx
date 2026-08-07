"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronDown, Loader2, Tv } from "lucide-react";
import { useState, useTransition } from "react";
import { setEpisodeWatchedAt, toggleEpisodeWatched } from "@/lib/actions";
import type { UpNext } from "@/lib/continue-watching";
import { formatWatched } from "@/lib/dates";
import { WatchedDateMenu } from "./watched-date-menu";

/**
 * The logging half of an up-next card, shared by the hero and the rail tile.
 *
 * Marking something watched from here used to be a one-way button with nothing
 * behind it — no way to say "actually I saw that on Sunday", and no date shown
 * afterwards, which made it the only place in the app where logging an episode
 * behaved differently from everywhere else. This is the same arrangement the
 * title pages use: log at the current time, then offer the menu to correct it.
 */
function useLogEpisode(item: UpNext) {
  // Keyed by episode: once the server hands us the *next* episode, the button
  // resets itself rather than staying stuck on "Logged".
  const [loggedKey, setLoggedKey] = useState<string | null>(null);
  const [watchedAt, setWatchedAt] = useState<Date | null>(null);
  const [askWhen, setAskWhen] = useState(false);
  const [pending, startTransition] = useTransition();

  const episodeKey = `${item.seasonNumber}-${item.episodeNumber}`;
  const done = loggedKey === episodeKey;

  const episode = {
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    episodeName: item.episodeName,
    runtime: item.runtime,
  };

  function log() {
    // Already logged: the button reopens the menu rather than logging twice.
    if (done) {
      setAskWhen((v) => !v);
      return;
    }

    startTransition(async () => {
      await toggleEpisodeWatched({
        showId: item.showId,
        showName: item.showName,
        showPoster: item.showPoster,
        episode,
      });
      setLoggedKey(episodeKey);
      setWatchedAt(new Date());
      setAskWhen(true);
    });
  }

  function correct(date: Date) {
    setAskWhen(false);
    setWatchedAt(date);
    startTransition(async () => {
      const res = await setEpisodeWatchedAt({
        showId: item.showId,
        seasonNumber: item.seasonNumber,
        episodeNumber: item.episodeNumber,
        watchedAt: date.toISOString(),
      });
      if (res.lastWatchedAt) setWatchedAt(new Date(res.lastWatchedAt));
    });
  }

  function undo() {
    setAskWhen(false);
    startTransition(async () => {
      await toggleEpisodeWatched({
        showId: item.showId,
        showName: item.showName,
        showPoster: item.showPoster,
        episode,
      });
      setLoggedKey(null);
      setWatchedAt(null);
    });
  }

  return { done, watchedAt, askWhen, setAskWhen, pending, log, correct, undo };
}

/** Wide hero treatment for the first thing waiting for you. */
export function FeaturedUpNext({ item }: { item: UpNext }) {
  const { done, watchedAt, askWhen, setAskWhen, pending, log, correct, undo } =
    useLogEpisode(item);

  const still = item.still ? `https://image.tmdb.org/t/p/w780${item.still}` : null;
  const poster = item.showPoster ? `https://image.tmdb.org/t/p/w342${item.showPoster}` : null;
  const art = still ?? poster;

  // Artwork and scrims are direct children of the one rounded, clipping box.
  // Wrapping them in an inner layer meant two rounded rectangles had to agree
  // at every corner, and at fractional device pixels they never quite did —
  // which is the hairline that kept showing along the bottom curves.
  return (
    <div className="relative isolate flex min-h-[300px] overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/40 sm:min-h-[340px]">
      {art && (
        <Image
          src={art}
          alt=""
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 1100px"
          className="object-cover"
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/5 to-transparent" />

      <div className="relative mt-auto flex w-full flex-col gap-4 p-5 sm:p-7">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.2em] text-white/70 uppercase">
            Up next
          </p>
          <Link
            href={`/title/tv/${item.showId}`}
            className="mt-1.5 block text-2xl font-semibold tracking-tight text-white hover:underline sm:text-4xl"
          >
            {item.showName}
          </Link>
          <p className="mt-1.5 text-sm text-white/80">
            <span className="font-mono font-semibold text-white">
              S{String(item.seasonNumber).padStart(2, "0")}E
              {String(item.episodeNumber).padStart(2, "0")}
            </span>{" "}
            · {item.episodeName}
          </p>
          <p className="mt-1 text-xs text-white/60">
            {item.watchedCount} of {item.totalEpisodes} episodes watched
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <div className="relative">
            <button
              disabled={pending}
              onClick={log}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-70"
            >
              {pending ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Check size={15} strokeWidth={3} />
              )}
              {done ? (watchedAt ? formatWatched(watchedAt) : "Logged") : "Mark watched"}
              {done && <ChevronDown size={15} className="-mr-1 opacity-70" />}
            </button>

            {askWhen && (
              <WatchedDateMenu
                onClose={() => setAskWhen(false)}
                onPick={correct}
                onUnwatch={undo}
              />
            )}
          </div>

          <Link
            href={`/title/tv/${item.showId}`}
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/20"
          >
            All episodes
          </Link>
        </div>
      </div>
    </div>
  );
}

export function UpNextCard({ item }: { item: UpNext }) {
  const { done, watchedAt, askWhen, setAskWhen, pending, log, correct, undo } =
    useLogEpisode(item);

  const still = item.still ? `https://image.tmdb.org/t/p/w300${item.still}` : null;
  const poster = item.showPoster ? `https://image.tmdb.org/t/p/w185${item.showPoster}` : null;

  return (
    <div className="rail-item card w-[268px] overflow-hidden">
      <Link href={`/title/tv/${item.showId}`} className="block">
        <div className="relative aspect-16/9 bg-ink-800">
          {still ? (
            <Image src={still} alt="" fill sizes="268px" className="object-cover" />
          ) : poster ? (
            <Image src={poster} alt="" fill sizes="268px" className="object-cover blur-sm" />
          ) : (
            <div className="grid h-full place-items-center text-ink-600">
              <Tv size={22} />
            </div>
          )}
          <div className="scrim-b absolute inset-0" />
          <p className="absolute right-3 bottom-2 left-3 truncate text-xs font-medium text-white">
            {item.showName}
          </p>
        </div>
      </Link>

      <div className="p-3">
        <p className="font-mono text-xs text-flare-400">
          S{String(item.seasonNumber).padStart(2, "0")}E
          {String(item.episodeNumber).padStart(2, "0")}
        </p>
        <p className="mt-0.5 line-clamp-1 text-sm font-medium">{item.episodeName}</p>
        <p className="mt-1.5 text-[11px] text-ink-400">
          {item.watchedCount} of {item.totalEpisodes} episodes watched
        </p>

        <div className="relative">
          <button
            disabled={pending}
            onClick={log}
            // One colour for both states, as everywhere else something can be
            // marked watched: the tick and the date already carry the state.
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-flare-600 py-2 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
          >
            {pending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Check size={13} strokeWidth={3} />
            )}
            {done ? (watchedAt ? formatWatched(watchedAt) : "Logged") : "Mark watched"}
            {done && <ChevronDown size={13} className="opacity-70" />}
          </button>

          {askWhen && (
            <WatchedDateMenu
              align="right"
              onClose={() => setAskWhen(false)}
              onPick={correct}
              onUnwatch={undo}
            />
          )}
        </div>
      </div>
    </div>
  );
}
