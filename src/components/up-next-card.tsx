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
 * Marking asks when, and writes nothing until it has an answer.
 *
 * It used to log at the current time and then offer the menu as a correction,
 * which is how the film button still works — and here that was wrong twice
 * over. A mis-tap was a real viewing in the log, to be noticed and taken back.
 * And "up next" is ordered most-recently-watched first, so the write moved the
 * show to the front of the list and the front of the list is the hero rather
 * than a tile: the tile was unmounted mid-answer, taking the open menu with it.
 * That is why marking from the rail appeared never to ask at all.
 *
 * Asking first removes both. Nothing is written while the menu is open, so
 * nothing can reorder the list underneath it, and dismissing it costs nothing.
 */
function useLogEpisode(item: UpNext) {
  /**
   * The episode this card logged, if it is still the one on show.
   *
   * Keyed by episode because the server hands back the *next* one: once the
   * list catches up, this card is about something else and the button goes back
   * to offering to mark it. Until then the date is the confirmation that the
   * press landed.
   */
  const [logged, setLogged] = useState<{ key: string; at: Date } | null>(null);
  const [askWhen, setAskWhen] = useState(false);
  const [pending, startTransition] = useTransition();

  const episodeKey = `${item.seasonNumber}-${item.episodeNumber}`;
  const done = logged?.key === episodeKey;

  const episode = {
    seasonNumber: item.seasonNumber,
    episodeNumber: item.episodeNumber,
    episodeName: item.episodeName,
    runtime: item.runtime,
  };

  /** The press: it opens the question rather than answering it. */
  function ask() {
    setAskWhen((open) => !open);
  }

  /**
   * The answer. Which write it is depends on whether this card has already
   * logged the episode it is showing — the menu says so too, through `mode`.
   */
  function pick(date: Date) {
    setAskWhen(false);

    if (done) {
      setLogged({ key: episodeKey, at: date });
      startTransition(async () => {
        const res = await setEpisodeWatchedAt({
          showId: item.showId,
          seasonNumber: item.seasonNumber,
          episodeNumber: item.episodeNumber,
          watchedAt: date.toISOString(),
        });
        // The picked date is shown straight away, but it is not always the
        // answer: dating this viewing behind an older one leaves that one last.
        if (res.lastWatchedAt) setLogged({ key: episodeKey, at: new Date(res.lastWatchedAt) });
      });
      return;
    }

    setLogged({ key: episodeKey, at: date });
    startTransition(async () => {
      const res = await toggleEpisodeWatched({
        showId: item.showId,
        showName: item.showName,
        showPoster: item.showPoster,
        episode,
        watchedAt: date.toISOString(),
      });
      // Nothing in this rail is unreleased, so a refusal should not happen —
      // but showing a date for a viewing that was never written would be worse
      // than the press appearing to do nothing.
      if (!res.watched) setLogged(null);
    });
  }

  /** Only offered while this card is still showing what it logged. */
  function undo() {
    setAskWhen(false);
    setLogged(null);
    startTransition(async () => {
      await toggleEpisodeWatched({
        showId: item.showId,
        showName: item.showName,
        showPoster: item.showPoster,
        episode,
      });
    });
  }

  return {
    done,
    watchedAt: logged?.at ?? null,
    askWhen,
    setAskWhen,
    pending,
    ask,
    pick,
    undo,
  };
}

/** Wide hero treatment for the first thing waiting for you. */
export function FeaturedUpNext({ item }: { item: UpNext }) {
  const { done, watchedAt, askWhen, setAskWhen, pending, ask, pick, undo } =
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
              onClick={ask}
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
                // Asking before anything is written, unless this card has just
                // logged the episode it is still showing — then it is the older
                // question, and taking it back is on offer with it.
                mode={done ? "correct" : "log"}
                onClose={() => setAskWhen(false)}
                onPick={pick}
                onUnwatch={done ? undo : undefined}
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
  const { done, watchedAt, askWhen, setAskWhen, pending, ask, pick, undo } =
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
            onClick={ask}
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
              // See the hero's copy of this.
              mode={done ? "correct" : "log"}
              onClose={() => setAskWhen(false)}
              onPick={pick}
              onUnwatch={done ? undo : undefined}
            />
          )}
        </div>
      </div>
    </div>
  );
}
