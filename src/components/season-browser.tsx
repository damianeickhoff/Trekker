"use client";

import Image from "next/image";
import Link from "next/link";
import {
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  Eraser,
  Loader2,
  RotateCcw,
  TriangleAlert,
  Tv,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  catchUpTo,
  logRewatch,
  logSeasonRewatch,
  removeWatch,
  setEpisodeWatchedAt,
  setSeasonWatched,
  toggleEpisodeWatched,
} from "@/lib/actions";
import { Rail } from "./rail";
import { type CatchUpWhen } from "./catch-up-menu";
import { CatchUpDialog } from "./catch-up-dialog";
import { WatchDial } from "./watch-dial";
import { Popover } from "./popover";
import { onEpisodeChange, publishEpisodeChanges } from "@/lib/episode-sync";
import { WatchedDateMenu } from "./watched-date-menu";

type Episode = {
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  runtime: number | null;
  airDate: string | null;
  still: string | null;
  score: number;
};

export type SeasonMeta = {
  seasonNumber: number;
  name: string;
  episodeCount: number;
  /** TMDB's audience average as a percentage, or 0 where nobody has voted. */
  score: number;
};


/**
 * The whole-season tick, and the menu behind it.
 *
 * Deliberately the same ring the episodes use. A season is a bag of episodes,
 * and "have I seen this one" is the same question at a different size — giving
 * it a different shape would have made it look like a different kind of answer.
 */
/**
 * TMDB air dates are plain `YYYY-MM-DD`, so they are compared as dates rather
 * than instants — anything that turns one into a timestamp puts today's episode
 * on the wrong side of the line for half the world. No date means unannounced.
 */
function hasAired(airDate: string | null) {
  return Boolean(airDate) && airDate! <= new Date().toISOString().slice(0, 10);
}

function SeasonCheck({
  watched,
  total,
  full,
  busy,
  ready,
  onOpen,
  onMarkToday,
  onMarkAired,
  onRewatch,
  onClear,
}: {
  /** What the dial fills from: episodes logged, out of what the season has. */
  watched: number;
  total: number;
  /** Every episode the season has is already logged. */
  full: boolean;
  busy: boolean;
  /** The season's episodes are loaded, so the actions have something to act on. */
  ready: boolean;
  onOpen: () => void;
  onMarkToday: () => void;
  onMarkAired: () => void;
  onRewatch: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={full ? "This season is fully watched" : "Mark this season watched"}
        onClick={() => {
          // Opening the season is what loads its episodes, and every action in
          // here needs them.
          onOpen();
          setOpen((value) => !value);
        }}
        className="shrink-0 rounded-full transition disabled:opacity-50"
      >
        <WatchDial watched={watched} total={total} busy={busy} />
      </button>

      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} align="end" width={268}>
          <div role="menu">
            {!ready ? (
              <p className="ios-dim px-3 py-4 text-center text-xs text-ink-400">
                Loading this season…
              </p>
            ) : full ? (
              <>
                <SeasonMenuRow
                  icon={RotateCcw}
                  label="Watched it again"
                  note="Logs a second viewing of every released episode. Anything watched in the last half hour is left alone."
                  onClick={() => {
                    setOpen(false);
                    onRewatch();
                  }}
                />
                <SeasonMenuRow
                  icon={Eraser}
                  tone="danger"
                  label="Unwatch the season"
                  note="Removes every watch of these episodes, rewatch counts included."
                  onClick={() => {
                    setOpen(false);
                    onClear();
                  }}
                />
              </>
            ) : (
              <>
                <SeasonMenuRow
                  icon={CheckCheck}
                  label="Watched — as of today"
                  note="Every released episode, logged now. Anything already on record keeps its own date."
                  onClick={() => {
                    setOpen(false);
                    onMarkToday();
                  }}
                />
                <SeasonMenuRow
                  icon={CalendarClock}
                  label="Watched — on their air dates"
                  note="For a season you followed live: each episode is dated the day it went out."
                  onClick={() => {
                    setOpen(false);
                    onMarkAired();
                  }}
                />
              </>
            )}
          </div>
        </Popover>
      )}
    </>
  );
}

function SeasonMenuRow({
  icon: Icon,
  label,
  note,
  tone,
  onClick,
}: {
  icon: typeof CheckCheck;
  label: string;
  note: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-2.5 border-b border-white/10 px-3 py-3 text-left text-sm transition last:border-0 hover:bg-white/10 light:border-ink-800 max-sm:border-white/10 light:hover:bg-black/5 ${
        tone === "danger" ? "text-red-400" : "text-ink-100"
      }`}
    >
      <Icon size={15} className="mt-0.5 shrink-0" />
      <span>
        {label}
        <span className="ios-dim mt-0.5 block text-xs text-ink-400">{note}</span>
      </span>
    </button>
  );
}

/**
 * A full stop that does not end a sentence: an initial, or a title like "Dr."
 *
 * Not exhaustive, and cannot be — telling "St. Louis" from "the corner shop on
 * Baker St." needs to understand the sentence. This is the short list of the
 * ones that actually turn up in episode synopses, and being wrong about a rare
 * one costs a synopsis cut a few words early.
 */
const ABBREVIATION = /(?:mr|mrs|ms|dr|prof|st|jr|sr|vs|etc|no|inc|ltd|approx)$/i;

/**
 * The first sentence of an episode synopsis.
 *
 * The row is there to say which episode this is, and the opening sentence
 * always does that; what follows is usually a subplot nobody is scanning for.
 *
 * Splitting on the first `.` is not enough — "Dr. Bishop returns" would become
 * "Dr." — so each candidate is checked against the word before it, and skipped
 * when that word is a single capital letter or one of the abbreviations above.
 */
function firstSentence(text: string) {
  const terminator = /[.!?]+(?=s|$)/g;

  let match: RegExpExecArray | null;
  while ((match = terminator.exec(text)) !== null) {
    const before = text.slice(0, match.index);
    const word = before.match(/[A-Za-z]+$/)?.[0] ?? "";

    if (word.length === 1 && word === word.toUpperCase()) continue;
    if (ABBREVIATION.test(word)) continue;

    return text.slice(0, match.index + match[0].length);
  }

  return text;
}

function scoreTone(score: number) {
  if (score >= 70) return "text-emerald-400 light:text-emerald-700";
  if (score >= 50) return "text-amber-400 light:text-amber-700";
  return "text-red-400 light:text-red-700";
}

export function SeasonBrowser({
  showId,
  showName,
  showPoster,
  seasons,
  watchedCounts,
  signedIn,
  initialSeason,
}: {
  showId: number;
  showName: string;
  showPoster: string | null;
  seasons: SeasonMeta[];
  watchedCounts: Record<number, number>;
  signedIn: boolean;
  /** Season to open on, so a viewer resumes where they left off. */
  initialSeason?: number;
}) {
  const [active, setActive] = useState(initialSeason ?? seasons[0]?.seasonNumber ?? 1);
  /**
   * Whether the active season's episodes are showing.
   *
   * Open to begin with, on the season the viewer is up to: arriving at a show
   * you are part-way through and being met by a closed list would mean a tap
   * before you could see anything, and the season is already the right one.
   */
  const [expanded, setExpanded] = useState(true);
  const [loaded, setLoaded] = useState<{
    season: number;
    episodes: Episode[];
    watched: Set<number>;
    /** Episode number → the most recent time it was watched. */
    watchedAt: Record<number, string>;
    /** Episode number → how many times, for the ones seen more than once. */
    plays: Record<number, number>;
    /** Episode number → thumbs up (true) or down (false). */
    ratings: Record<number, boolean>;
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  /**
   * Which episode's "when did you watch it?" menu is open, and whether it was
   * already watched when it opened. That distinction is what decides whether
   * "unwatch" belongs in the menu: an episode you have only just ticked has
   * nothing to take back yet.
   */
  const [askWhen, setAskWhen] = useState<{ episode: number; existing: boolean } | null>(null);
  /**
   * Which whole-season action is waiting to be confirmed.
   *
   * The controls are icons, which is what keeps the header from turning into a
   * row of sentences — but an icon gives no warning of what it is about to do
   * to a season's worth of history, so the two that write in bulk say it in
   * words first. Marking is left immediate: it is the ordinary one, it only
   * fills gaps, and clearing undoes it.
   */
  const [confirm, setConfirm] = useState<"clear" | "rewatch" | null>(null);
  /**
   * The episode whose "you skipped a few" question is open.
   *
   * Asked at the moment of marking rather than offered as a permanent control
   * on every row — see `CatchUpDialog` for why that control had to go.
   */
  const [catchUpFor, setCatchUpFor] = useState<Episode | null>(null);
  const [pending, startTransition] = useTransition();
  const activeTab = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // The seasons used to be a strip that scrolled sideways, and this pulled the
  // resumed one into view. A column has nowhere to scroll to and the resumed
  // season is already open, so there is nothing left to do here — the ref stays
  // only to mark which row that is.

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/tv/${showId}/season/${active}`, { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? `Request failed (${r.status})`);
        }
        return r.json() as Promise<{
          episodes: Episode[];
          watched: number[];
          watchedAt: Record<number, string>;
          plays: Record<number, number>;
          ratings: Record<number, boolean>;
        }>;
      })
      .then((data) =>
        setLoaded({
          season: active,
          episodes: data.episodes,
          watched: new Set(data.watched),
          watchedAt: data.watchedAt ?? {},
          plays: data.plays ?? {},
          ratings: data.ratings ?? {},
        }),
      )
      .catch((err: Error) => {
        if (err.name === "AbortError") return;
        console.error("Could not load season", err);
        setLoaded({
          season: active,
          episodes: [],
          watched: new Set(),
          watchedAt: {},
          plays: {},
          ratings: {},
          error: err.message,
        });
      });

    return () => controller.abort();
  }, [showId, active, attempt]);

  // Anything loaded for a different season is stale — show the spinner instead.
  const current = loaded?.season === active ? loaded : null;
  const loading = current === null;
  const episodes = current?.episodes ?? null;
  const watched = current?.watched ?? new Set<number>();
  const watchedAt = current?.watchedAt ?? {};
  const plays = current?.plays ?? {};
  // Measured against aired episodes only: a season half-way through its run is
  // "done" when there is nothing left released to watch.
  const airedCount = episodes?.filter((e) => hasAired(e.airDate)).length ?? 0;
  /** The season the strip is pointing at, for the dial that sits beside it. */
  const activeSeason = seasons.find((s) => s.seasonNumber === active) ?? null;
  // Resolved from the loaded season rather than held in state, so it follows
  // along if the list reloads underneath an open dialog.


  function setWatched(
    next: Set<number>,
    dates?: Record<number, string>,
    counts?: Record<number, number>,
  ) {
    // The difference this call makes, told to the "watch next" row above so the
    // two views of the same episodes never disagree. Announced from here rather
    // than from each of the eight callers, because this is the funnel they all
    // go through.
    const changes = [];
    for (const number of next) {
      if (!watched.has(number)) {
        changes.push({ showId, seasonNumber: active, episodeNumber: number, watched: true });
      }
    }
    for (const number of watched) {
      if (!next.has(number)) {
        changes.push({ showId, seasonNumber: active, episodeNumber: number, watched: false });
      }
    }
    publishEpisodeChanges(changes);

    setLoaded((prev) =>
      prev
        ? {
            ...prev,
            watched: next,
            watchedAt: dates ?? prev.watchedAt,
            plays: counts ?? prev.plays,
          }
        : prev,
    );
  }

  /**
   * Anything the row above changes, applied here as it happens.
   *
   * Written straight to the loaded season rather than through `setWatched`,
   * which announces — sending it back where it came from would be a loop.
   */
  useEffect(
    () =>
      onEpisodeChange((changes) => {
        setLoaded((prev) => {
          if (!prev) return prev;

          const mine = changes.filter(
            (change) => change.showId === showId && change.seasonNumber === prev.season,
          );
          if (mine.length === 0) return prev;

          const next = new Set(prev.watched);
          for (const change of mine) {
            if (change.watched) next.add(change.episodeNumber);
            else next.delete(change.episodeNumber);
          }
          return { ...prev, watched: next };
        });
      }),
    [showId],
  );

  /**
   * @param prompt Whether to follow up with the row's "when did you watch it?"
   *   menu. The dialog passes false: it carries a date menu of its own, and the
   *   row's would open silently behind it, since the dialog sits above it.
   */
  function toggleOne(ep: Episode, prompt = true) {
    // Nothing to log until it has aired.
    if (!hasAired(ep.airDate) && !watched.has(ep.episodeNumber)) return;

    // Already watched: the tick opens the menu rather than undoing anything.
    // Unmarking on a single tap was too easy to do by accident, and the menu is
    // where both the date and "unwatch" now live.
    if (watched.has(ep.episodeNumber)) {
      if (!prompt) return;
      setAskWhen(
        askWhen?.episode === ep.episodeNumber
          ? null
          : { episode: ep.episodeNumber, existing: true },
      );
      return;
    }

    // Anything aired and unlogged before this one, in this season.
    const behind = (episodes ?? []).filter(
      (e) =>
        e.episodeNumber < ep.episodeNumber &&
        hasAired(e.airDate) &&
        !watched.has(e.episodeNumber),
    ).length;

    if (behind > 0) {
      setCatchUpFor(ep);
      return;
    }

    markOne(ep, prompt);
  }

  /** The plain version: one episode, logged now. */
  function markOne(ep: Episode, prompt = true) {
    const next = new Set(watched);
    const dates = { ...watchedAt };
    const counts = { ...plays };

    next.add(ep.episodeNumber);
    dates[ep.episodeNumber] = new Date().toISOString();
    counts[ep.episodeNumber] = 1;

    setWatched(next, dates, counts);
    // Already logged at the current time; the menu only exists to correct it.
    // Just logged, so there is nothing to take back — only a date to correct.
    if (prompt) setAskWhen({ episode: ep.episodeNumber, existing: false });

    startTransition(async () => {
      await toggleEpisodeWatched({
        showId,
        showName,
        showPoster,
        episode: {
          seasonNumber: active,
          episodeNumber: ep.episodeNumber,
          episodeName: ep.name,
          runtime: ep.runtime,
          airDate: ep.airDate,
        },
      });
    });
  }

  /** Logs another viewing of one episode, from inside the menu. */
  function watchAgain(ep: Episode) {
    setAskWhen(null);

    startTransition(async () => {
      const res = await logRewatch({
        mediaType: "tv",
        tmdbId: showId,
        title: showName,
        poster: showPoster,
        seasonNumber: active,
        episodeNumber: ep.episodeNumber,
        episodeName: ep.name,
        runtime: ep.runtime,
      });

      // Taken from the answer rather than incremented: watching the same
      // episode twice within half an hour is one viewing reported twice, and
      // the count must not claim otherwise.
      setWatched(
        watched,
        { ...watchedAt, [ep.episodeNumber]: new Date(res.lastWatchedAt).toISOString() },
        { ...plays, [ep.episodeNumber]: res.plays },
      );
    });
  }

  /**
   * Takes an episode back off, from inside the menu.
   *
   * "last" leaves the earlier viewings alone, which is what someone undoing a
   * mis-tap on a rewatched episode means; "all" is the deliberate clear.
   */
  function unwatch(ep: Episode, mode: "last" | "all") {
    setAskWhen(null);

    const seen = plays[ep.episodeNumber] ?? 1;
    // How many viewings survive: all but one for "last", none for "all".
    const remaining = mode === "all" ? 0 : Math.max(0, seen - 1);

    const next = new Set(watched);
    const dates = { ...watchedAt };
    const counts = { ...plays };

    if (remaining === 0) {
      next.delete(ep.episodeNumber);
      delete dates[ep.episodeNumber];
      delete counts[ep.episodeNumber];
    } else {
      counts[ep.episodeNumber] = remaining;
    }

    setWatched(next, dates, counts);

    startTransition(async () => {
      const res = await removeWatch({
        mediaType: "tv",
        tmdbId: showId,
        seasonNumber: active,
        episodeNumber: ep.episodeNumber,
        mode,
      });

      // The optimistic guess above is right in every ordinary case; this is
      // what corrects it when it is not, and supplies the date of whatever
      // viewing is now the most recent.
      setLoaded((prev) => {
        if (!prev || prev.season !== active) return prev;

        const nextWatched = new Set(prev.watched);
        const nextDates = { ...prev.watchedAt };
        const nextCounts = { ...prev.plays };

        if (res.plays === 0) {
          nextWatched.delete(ep.episodeNumber);
          delete nextDates[ep.episodeNumber];
          delete nextCounts[ep.episodeNumber];
        } else {
          nextWatched.add(ep.episodeNumber);
          nextCounts[ep.episodeNumber] = res.plays;
          if (res.lastWatchedAt) {
            nextDates[ep.episodeNumber] = new Date(res.lastWatchedAt).toISOString();
          }
        }

        return { ...prev, watched: nextWatched, watchedAt: nextDates, plays: nextCounts };
      });
    });
  }

  /**
   * Everything up to and including this episode — this season, or every season
   * before it as well.
   *
   * Dated by air date rather than by the clock. Filling in a run of episodes is
   * a claim about the past, and stamping thirty of them with this minute makes
   * a history that is wrong in a way the app then shows back to you on the
   * calendar and in the stats.
   */
  function catchUp(ep: Episode, scope: "season" | "all") {
    const when: CatchUpWhen = "aired";
    setAskWhen(null);
    setCatchUpFor(null);

    // Ticks appear at once, but only the ticks: the dates these episodes end up
    // with are the server's to decide — today's for "now", each episode's own
    // air date for "aired" — so they are read back rather than guessed. Leaving
    // that read out is what made this look as though it logged no date at all:
    // the rows went green and then had nothing to show under them.
    setWatched(
      new Set([
        ...watched,
        ...(episodes ?? [])
          .filter((e) => e.episodeNumber <= ep.episodeNumber && hasAired(e.airDate))
          .map((e) => e.episodeNumber),
      ]),
    );

    startTransition(async () => {
      await catchUpTo({
        showId,
        showName,
        showPoster,
        seasonNumber: active,
        episodeNumber: ep.episodeNumber,
        when,
        scope,
      });

      setAttempt((n) => n + 1);
      // Earlier seasons changed too, so the tab counts need re-reading.
      router.refresh();
    });
  }

  
  function correctDate(episodeNumber: number, date: Date) {
    setAskWhen(null);
    setWatched(new Set(watched), { ...watchedAt, [episodeNumber]: date.toISOString() });

    startTransition(async () => {
      const res = await setEpisodeWatchedAt({
        showId,
        seasonNumber: active,
        episodeNumber,
        watchedAt: date.toISOString(),
      });

      // The picked date is shown straight away, but on an episode watched more
      // than once it is not always the answer: correcting the latest viewing to
      // something older than another one leaves that other one as the latest.
      if (res.lastWatchedAt) {
        setWatched(new Set(watched), {
          ...watchedAt,
          [episodeNumber]: new Date(res.lastWatchedAt).toISOString(),
        });
      }
    });
  }

  /** The season's episodes in the shape the bulk actions want. */
  function airedEpisodes() {
    return (episodes ?? [])
      .filter((e) => hasAired(e.airDate))
      .map((e) => ({
        seasonNumber: active,
        episodeNumber: e.episodeNumber,
        episodeName: e.name,
        runtime: e.runtime,
        airDate: e.airDate,
      }));
  }

  /**
   * Fills the gaps: every released episode not already on record.
   *
   * Everything already there keeps exactly what it has — an episode watched
   * three times still says three, and keeps the date it was really watched.
   */
  function markSeason() {
    if (!episodes) return;
    const aired = episodes.filter((e) => hasAired(e.airDate));

    const counts: Record<number, number> = {};
    const dates: Record<number, string> = {};
    const now = new Date().toISOString();
    for (const e of aired) {
      const seen = watched.has(e.episodeNumber);
      counts[e.episodeNumber] = seen ? (plays[e.episodeNumber] ?? 1) : 1;
      dates[e.episodeNumber] = seen ? (watchedAt[e.episodeNumber] ?? now) : now;
    }

    setWatched(new Set(aired.map((e) => e.episodeNumber)), dates, counts);

    startTransition(async () => {
      await setSeasonWatched({
        showId,
        showName,
        showPoster,
        seasonNumber: active,
        watched: true,
        episodes: airedEpisodes(),
      });
      // The season tabs carry their own counts, rendered on the server.
      router.refresh();
    });
  }

  /**
   * The same fill, dated by when each episode went out.
   *
   * For a season you watched as it aired and are only now telling Trekker
   * about: stamping thirty episodes with this minute makes a history that is
   * wrong everywhere it is later shown back to you — the calendar, the stats,
   * "on this day".
   */
  function markSeasonByAirDate() {
    const aired = (episodes ?? []).filter((e) => hasAired(e.airDate));
    const last = aired[aired.length - 1];
    if (!last) return;

    setWatched(new Set(aired.map((e) => e.episodeNumber)));

    startTransition(async () => {
      await catchUpTo({
        showId,
        showName,
        showPoster,
        seasonNumber: active,
        episodeNumber: last.episodeNumber,
        when: "aired",
        scope: "season",
      });
      setAttempt((n) => n + 1);
      router.refresh();
    });
  }

  /**
   * The opposite, and deliberately not the same button.
   *
   * Folding both into one toggle meant the label had to guess which one you
   * wanted, and on a part-watched season it guessed wrong: "unmark whole
   * season" on a season you are six episodes into describes neither what you
   * have nor what it would do. What it actually removes is every episode of
   * this season you have on record, however many that is, which is what the
   * confirmation now says out loud.
   */
  function clearSeason() {
    setConfirm(null);
    setWatched(new Set(), {}, {});

    startTransition(async () => {
      await setSeasonWatched({
        showId,
        showName,
        showPoster,
        seasonNumber: active,
        watched: false,
        episodes: [],
      });
      router.refresh();
    });
  }

  /**
   * Another viewing of the whole season.
   *
   * No optimistic guess here, unlike everything else in this file: the server
   * skips anything logged in the last half hour, so the honest counts are the
   * ones it comes back with. Re-reading the season is cheap and cannot be
   * contradicted by the next page load.
   */
  function rewatchSeason() {
    if (!episodes) return;
    setConfirm(null);

    startTransition(async () => {
      await logSeasonRewatch({
        showId,
        showName,
        showPoster,
        seasonNumber: active,
        episodes: airedEpisodes(),
      });

      setAttempt((n) => n + 1);
      router.refresh();
    });
  }

  /**
   * One season: its header, its episodes, and every menu and dialog they open.
   *
   * Declared here rather than inlined because the list below renders it under
   * whichever season is expanded, and burying a hundred lines of JSX inside a
   * `map` would have hidden the shape of the list itself.
   */
  const panel = (
    <>
      {loading ? (
        <div className="card mt-4 grid place-items-center py-16 text-ink-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : current?.error ? (
        <div className="card mt-4 grid place-items-center gap-3 px-6 py-12 text-center">
          <p className="text-sm font-medium">Could not load these episodes</p>
          <p className="max-w-sm text-xs text-ink-400">{current.error}</p>
          <button
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-xl bg-flare-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-flare-500"
          >
            Try again
          </button>
        </div>
      ) : (
        // Deliberately not `overflow-hidden`. Clipping a child against a
        // rounded, backdrop-blurred box leaves a hairline of the card's own
        // background at fractional device pixels — which is what showed under
        // the last row on hover. The children round themselves to the card's
        // inner radius instead, so nothing needs clipping.
        <div className="card season-panel mt-4">
          {/*
            The header carries everything that is about the season rather than
            about one episode: what it is, how far through it you are, how it
            scores, and the three things you can do to the whole of it. They
            used to be a row of full-sentence buttons floating above the card,
            which said the same words on every show and pushed the episodes
            down the screen.
          */}
          <div className="empty:hidden">
            {confirm && (
              <div
                className={`flex flex-wrap items-center gap-x-2.5 gap-y-2 border-t px-3 py-2.5 sm:px-4 ${
                  confirm === "clear"
                    ? "border-red-500/25 bg-red-500/8"
                    : "border-flare-500/25 bg-flare-600/8"
                }`}
              >
                <TriangleAlert
                  size={14}
                  className={`shrink-0 ${
                    confirm === "clear" ? "text-red-400" : "ios-bright text-flare-400"
                  }`}
                />
                <span className="ios-dim min-w-0 flex-1 text-xs text-ink-300">
                  {confirm === "clear" ? (
                    <>
                      Remove every watch of the {watched.size} logged episode
                      {watched.size === 1 ? "" : "s"} in this season? Rewatch counts go with
                      them.
                    </>
                  ) : (
                    <>
                      Log another viewing of all {airedCount} released episode
                      {airedCount === 1 ? "" : "s"}? Anything watched in the last half hour is
                      left alone.
                    </>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={confirm === "clear" ? clearSeason : rewatchSeason}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition ${
                      confirm === "clear"
                        ? "bg-red-500/90 hover:bg-red-500"
                        : "bg-flare-600 hover:bg-flare-500"
                    }`}
                  >
                    {confirm === "clear" ? "Clear them" : "Log it"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm(null)}
                    className="rounded-lg border border-ink-700 max-sm:border-white/15 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800 max-sm:bg-white/10 max-sm:border-white/15 max-sm:hover:bg-white/10 hover:text-ink-100"
                  >
                    Cancel
                  </button>
                </span>
              </div>
            )}
          </div>

          <ul className="divide-y divide-ink-800 max-sm:divide-white/10">
          {episodes?.map((ep) => {
            const isWatched = watched.has(ep.episodeNumber);
            const aired = hasAired(ep.airDate);
            return (
              // The last row is rounded to match the card it sits in. Relying on
              // the card's `overflow: hidden` alone leaves a hairline of card
              // background under the row at fractional device pixels, which is
              // what the hover made visible.
              <li
                key={ep.episodeNumber}
                className="flex gap-3 p-3 transition last:rounded-b-[15px] hover:bg-ink-800/60 max-sm:hover:bg-white/5 sm:gap-4 sm:p-4"
              >
                {/* The artwork and the text open the episode; the verdict
                    buttons deliberately sit outside them. A button inside a
                    button is invalid markup, and a thumbs-up that also opened a
                    dialog would be maddening. */}
                <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
                  {/*
                    On a phone too, not only from `sm` up. A list of episode
                    titles with no artwork is the hardest thing in the app to
                    scan, and the phone is where most of the scanning happens.
                    It is narrower there so the row does not become mostly
                    picture, and it keeps 16:9 rather than being cropped.
                  */}
                  <Link
                    href={`/title/tv/${showId}/episode/${active}/${ep.episodeNumber}`}
                    aria-label={`About ${ep.name}`}
                    className="relative h-[54px] w-24 shrink-0 overflow-hidden rounded-lg bg-ink-800 max-sm:bg-white/10 sm:h-[63px] sm:w-28"
                  >
                    {ep.still ? (
                      <Image
                        src={`https://image.tmdb.org/t/p/w300${ep.still}`}
                        alt=""
                        fill
                        sizes="(min-width: 640px) 112px, 96px"
                        className={`object-cover transition ${
                          // Seen ones step back so the row reads as a list of
                          // what is left, without needing a second tick.
                          isWatched ? "opacity-55" : ""
                        }`}
                      />
                    ) : (
                      <span className="grid h-full place-items-center ios-dim text-ink-400">
                        <Tv size={15} />
                      </span>
                    )}
                  </Link>

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/title/tv/${showId}/episode/${active}/${ep.episodeNumber}`}
                      className="block w-full text-left"
                    >
                      <span className="block text-sm font-medium">
                        <span className="mr-2 font-mono text-xs ios-bright text-flare-400">
                          {String(active).padStart(2, "0")}×
                          {String(ep.episodeNumber).padStart(2, "0")}
                        </span>
                        {ep.name}
                      </span>
                      {ep.overview && (
                        <span className="ios-dim mt-1 line-clamp-1 block text-xs text-ink-400">
                          {firstSentence(ep.overview)}
                        </span>
                      )}
                      <span className="mt-1 block font-mono text-[11px] text-ink-100">
                        {ep.airDate ?? "TBA"}
                        {ep.runtime ? ` · ${ep.runtime}m` : ""}
                        {ep.score > 0 ? ` · ${ep.score}%` : ""}
                      </span>
                    </Link>

                  </div>

                </div>

                {signedIn && (
                  <div className="flex shrink-0 items-center gap-1.5 self-center">

                    <div className="relative">
                    <button
                      onClick={() => toggleOne(ep)}
                      disabled={!aired && !isWatched}
                      aria-label={
                        !aired && !isWatched
                          ? "Not aired yet"
                          : isWatched
                            ? "Change when you watched it, or unwatch"
                            : "Mark watched"
                      }
                      aria-pressed={isWatched}
                      title={!aired && !isWatched ? "This episode has not aired yet" : undefined}
                      className={`grid h-7 w-7 place-items-center rounded-full border transition ${
                        isWatched
                          ? "border-white/25 bg-white/85 text-neutral-900 light:border-neutral-900 light:bg-neutral-900 light:text-white"
                          : "border-white/20 bg-black/50 text-white light:border-ink-600 light:bg-white light:text-ink-100 hover:bg-black/70 light:hover:bg-ink-800"
                      }`}
                    >
                      {isWatched && <Check size={13} />}
                    </button>

                    {askWhen?.episode === ep.episodeNumber && (
                      <WatchedDateMenu
                        align="right"
                        releaseDate={ep.airDate}
                        onClose={() => setAskWhen(null)}
                        onPick={(date) => correctDate(ep.episodeNumber, date)}
                        // Only for an episode that was already on record when
                        // the menu opened — one ticked a second ago has nothing
                        // to watch again or take back yet.
                        onWatchAgain={askWhen.existing ? () => watchAgain(ep) : undefined}
                        onUnwatch={askWhen.existing ? () => unwatch(ep, "last") : undefined}
                        unwatchLabel={
                          (plays[ep.episodeNumber] ?? 1) > 1
                            ? "Remove last watch"
                            : "Unwatch episode"
                        }
                        unwatchAllLabel={`Remove all ${plays[ep.episodeNumber] ?? 1} watches`}
                        onUnwatchAll={
                          askWhen.existing && (plays[ep.episodeNumber] ?? 1) > 1
                            ? () => unwatch(ep, "all")
                            : undefined
                        }
                      />
                    )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          </ul>
        </div>
      )}

      {/* One dialog for the whole list, driven by which episode is open. Its
          tracking state and handlers are the same ones the rows use, so
          marking something watched in here updates the row behind it. */}
      {catchUpFor && (
        <CatchUpDialog
          episodeLabel={`S${String(active).padStart(2, "0")}E${String(
            catchUpFor.episodeNumber,
          ).padStart(2, "0")}`}
          inSeason={
            (episodes ?? []).filter(
              (e) =>
                e.episodeNumber < catchUpFor.episodeNumber &&
                hasAired(e.airDate) &&
                !watched.has(e.episodeNumber),
            ).length
          }
          /**
           * Earlier seasons are counted from what the page already knows — the
           * per-season totals in the header — rather than by fetching every one
           * of them to be exact. It is a count in a sentence, not a promise;
           * the server works out precisely which episodes to fill in.
           */
          before={
            (episodes ?? []).filter(
              (e) =>
                e.episodeNumber < catchUpFor.episodeNumber &&
                hasAired(e.airDate) &&
                !watched.has(e.episodeNumber),
            ).length +
            seasons
              .filter((s) => s.seasonNumber < active)
              .reduce(
                (sum, s) => sum + Math.max(0, s.episodeCount - (watchedCounts[s.seasonNumber] ?? 0)),
                0,
              )
          }
          onClose={() => setCatchUpFor(null)}
          onPick={(choice) => {
            const episode = catchUpFor;
            setCatchUpFor(null);
            if (choice === "one") markOne(episode);
            else catchUp(episode, choice);
          }}
        />
      )}

    </>
  );

  return (
    <div className="mt-4">
      {/*
        Two shapes for the same list, chosen by width rather than by a branch.

        Desktop keeps the strip of season tabs it has always had: there is room
        for it, and the episodes appear underneath in a panel that never moves.
        A phone gets a column of collapsible rows instead — the strip asked the
        reader to find season nine by dragging a row sideways, and gave no sense
        of how many there were.

        Only one season is open at a time either way, which is not a new
        limitation but the existing design carried forward: a season's episodes
        are fetched when it is chosen, and this component has always held exactly
        one season's worth.
      */}
      <div className="hidden items-center gap-3 sm:flex">
      <Rail className="min-w-0 flex-1">
        {seasons.map((s) => {
          const done = watchedCounts[s.seasonNumber] ?? 0;
          const isActive = s.seasonNumber === active;
          return (
            <button
              key={s.seasonNumber}
              onClick={() => {
                setActive(s.seasonNumber);
                setExpanded(true);
                setConfirm(null);
                setCatchUpFor(null);
              }}
              className={`rail-item rounded-xl border px-3.5 py-2 text-sm transition ${
                isActive
                  ? "border-flare-500 bg-flare-600/20 text-ink-100"
                  : "border-ink-700 max-sm:border-white/15 text-ink-300 hover:bg-ink-800 max-sm:bg-white/10"
              }`}
            >
              {s.name}
              {s.score > 0 && (
                <span
                  className={`ml-2 font-mono text-[11px] font-normal tabular-nums ${scoreTone(
                    s.score,
                  )}`}
                  title="Audience score for this season"
                >
                  {s.score}%
                </span>
              )}
              <span className="ml-2 font-mono text-xs text-ink-400">
                {done}/{s.episodeCount}
              </span>
            </button>
          );
        })}
      </Rail>

      {/* The whole-season control, once, for the season on screen — the same
          dial the phone puts on every row, where a column has the room for it
          and a strip does not. */}
      {signedIn && activeSeason && (
        <SeasonCheck
          watched={watchedCounts[activeSeason.seasonNumber] ?? 0}
          total={activeSeason.episodeCount}
          full={
            (watchedCounts[activeSeason.seasonNumber] ?? 0) >= activeSeason.episodeCount &&
            activeSeason.episodeCount > 0
          }
          busy={pending}
          ready={Boolean(episodes)}
          onOpen={() => setExpanded(true)}
          onMarkToday={markSeason}
          onMarkAired={markSeasonByAirDate}
          onRewatch={() => setConfirm("rewatch")}
          onClear={() => setConfirm("clear")}
        />
      )}
      </div>

      <div className="flex flex-col gap-2">
        {seasons.map((s) => {
          const done = watchedCounts[s.seasonNumber] ?? 0;
          const isCurrent = s.seasonNumber === active;
          const isOpen = isCurrent && expanded;
          return (
            <div
              key={s.seasonNumber}
              className="season-block max-sm:overflow-hidden max-sm:rounded-xl max-sm:border max-sm:border-ink-700 max-sm:border-white/15"
            >
              <div
                className={`flex items-center pr-3 transition sm:hidden ${
                  isOpen ? "bg-white/5" : "hover:bg-white/5"
                }`}
              >
              <button
                ref={isOpen ? activeTab : undefined}
                aria-expanded={isOpen}
                onClick={() => {
                  if (isCurrent) {
                    setExpanded((open) => !open);
                  } else {
                    setActive(s.seasonNumber);
                    setExpanded(true);
                  }
                  // Whatever was half-confirmed was about the season you just
                  // left, and the counts in it are about to be wrong. The
                  // catch-up menu is keyed by episode number, which would
                  // otherwise land on whatever happens to be episode four here.
                  setConfirm(null);
                  setCatchUpFor(null);
                }}
                className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm"
              >
                <ChevronDown
                  size={16}
                  className={`shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`}
                />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {s.name}
                  {s.score > 0 && (
                    <span
                      className={`ml-2 font-mono text-[11px] font-normal tabular-nums ${scoreTone(
                        s.score,
                      )}`}
                      title="Audience score for this season"
                    >
                      {s.score}%
                    </span>
                  )}
                </span>
                <span className="ios-dim shrink-0 font-mono text-xs text-ink-400">
                  {done}/{s.episodeCount}
                </span>
              </button>

              {/*
                One control for the whole season, in the same shape as the ticks
                on the episodes inside it: an empty ring while there is something
                left to log, a filled one once there is not. It replaces the
                three icon buttons that used to sit inside the open card, which
                were only reachable once you had opened the season and said the
                same three things on every one of them.
              */}
              {signedIn && (
                <SeasonCheck
                  watched={done}
                  total={s.episodeCount}
                  full={done >= s.episodeCount && s.episodeCount > 0}
                  busy={pending && isCurrent}
                  ready={isCurrent && Boolean(episodes)}
                  onOpen={() => {
                    if (!isCurrent) {
                      setActive(s.seasonNumber);
                      setExpanded(true);
                    }
                  }}
                  onMarkToday={markSeason}
                  onMarkAired={markSeasonByAirDate}
                  onRewatch={() => setConfirm("rewatch")}
                  onClear={() => setConfirm("clear")}
                />
              )}
              </div>

              {/*
                The panel is rendered once, inside the row for the season it
                belongs to. On a phone that is exactly where it should appear;
                on desktop every row above is hidden, so it lands directly under
                the strip — which is where it always was. Collapsing only hides
                it at phone widths, because the strip has nothing to collapse.
              */}
              {isCurrent && (
                <div className={`sm:mt-2 ${expanded ? "" : "max-sm:hidden"}`}>{panel}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
