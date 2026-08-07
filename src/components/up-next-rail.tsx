"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, ChevronRight, Loader2, Tv } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { setEpisodeWatchedAt, toggleEpisodeWatched } from "@/lib/actions";
import { img } from "@/lib/images";
import type { RailEpisode } from "@/lib/up-next-rail";
import { catchUpTo } from "@/lib/actions";
import { onEpisodeChange, publishEpisodeChanges } from "@/lib/episode-sync";
import { CatchUpDialog } from "./catch-up-dialog";
import { Rail } from "./rail";
import { WatchedDateMenu } from "./watched-date-menu";

/**
 * "Watch next" — the episodes ahead of you, as a row you can push along.
 *
 * The row answers one question, which is why it is the first thing under the
 * progress card: what do I put on now. It opens on the first episode you have
 * not seen and comes back to it every time one is ticked, so the answer is
 * always in the same place rather than drifting off to the left as you work
 * through a season.
 *
 * It runs across the whole show, not a window of it. The season you are up to
 * arrives with the page and the rest are fetched as you scroll towards them, in
 * both directions — a season back is as reachable as a season on. Fetching them
 * all up front would have meant a request per season before anything could
 * render, on a row nobody scrolls to the end of; fetching none up front would
 * have meant a spinner where the answer should be.
 */

/** How close to an end the scroll gets before the next season is asked for. */
const REACH = 600;

/** TMDB air dates are plain `YYYY-MM-DD`; comparing them as dates keeps
    today's episode on the right side of the line in every timezone. */
function hasAired(airDate: string | null) {
  return Boolean(airDate) && airDate! <= new Date().toISOString().slice(0, 10);
}

const keyOf = (e: { seasonNumber: number; episodeNumber: number }) =>
  `${e.seasonNumber}-${e.episodeNumber}`;

export function UpNextRail({
  showId,
  showName,
  showPoster,
  seasons,
  seasonSizes,
  watchedCounts,
  initialSeason,
  initialEpisodes,
  initialWatched,
  signedIn,
}: {
  showId: number;
  showName: string;
  showPoster: string | null;
  /** Every season number with episodes, ascending. */
  seasons: number[];
  /** Season number → how many episodes it has, for counting what is behind. */
  seasonSizes: Record<number, number>;
  /** Season number → how many of them are already logged. */
  watchedCounts: Record<number, number>;
  /** The one that arrived with the page. */
  initialSeason: number;
  initialEpisodes: RailEpisode[];
  /** Keys shaped `${season}-${episode}` for everything already on record. */
  initialWatched: string[];
  signedIn: boolean;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const [loaded, setLoaded] = useState<Record<number, RailEpisode[]>>({
    [initialSeason]: initialEpisodes,
  });
  const [busy, setBusy] = useState<number | null>(null);
  const [watched, setWatched] = useState(() => new Set(initialWatched));
  /** Which card's "when did you watch it?" menu is open. */
  const [askWhen, setAskWhen] = useState<string | null>(null);
  const [season, setSeason] = useState(initialSeason);
  /** The episode whose "you skipped a few" question is open. */
  const [catchUpFor, setCatchUpFor] = useState<RailEpisode | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  /** Everything loaded so far, in show order. */
  const episodes = useMemo(
    () =>
      Object.keys(loaded)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((number) => loaded[number] ?? []),
    [loaded],
  );

  const seasonScores = useMemo(() => {
    const scores: Record<number, number> = {};
    for (const [number, list] of Object.entries(loaded)) {
      const scored = list.filter((episode) => episode.score > 0);
      if (scored.length === 0) continue;
      scores[Number(number)] = Math.round(
        scored.reduce((sum, episode) => sum + episode.score, 0) / scored.length,
      );
    }
    return scores;
  }, [loaded]);

  /**
   * Pull in a season the reader is heading towards.
   *
   * The same endpoint the episode list below uses, so a season fetched by either
   * is already in the browser's cache for the other.
   */
  const load = useCallback(
    async (number: number) => {
      if (loaded[number]) return;
      setBusy((current) => (current === null ? number : current));

      try {
        const response = await fetch(`/api/tv/${showId}/season/${number}`);
        if (!response.ok) throw new Error(String(response.status));
        const data = (await response.json()) as {
          episodes: RailEpisode[];
          watched: number[];
        };

        setLoaded((prev) => ({ ...prev, [number]: data.episodes }));
        // Whatever is already on record for that season, so a card does not
        // arrive claiming to be unwatched when it is not.
        setWatched((prev) => {
          const next = new Set(prev);
          for (const episode of data.watched) next.add(`${number}-${episode}`);
          return next;
        });
      } catch {
        // A season that will not load simply is not in the row. The list below
        // reports its own failures; a second complaint here would be noise.
        setLoaded((prev) => ({ ...prev, [number]: [] }));
      } finally {
        setBusy(null);
      }
    },
    [loaded, showId],
  );

  /**
   * The first thing you have not seen, which is where the row belongs.
   *
   * Recomputed from `watched` rather than remembered, so ticking one moves it on
   * by itself — that is the whole of "come back to the next unwatched episode".
   */
  const next = episodes.find((e) => !watched.has(keyOf(e)) && hasAired(e.airDate));

  /**
   * Where the row should sit: the next thing to watch, or — when there is
   * nothing left released — the last thing you saw.
   *
   * Caught up, the first answer does not exist, and the row fell back to
   * wherever it happened to be scrolled: the first episode of the season, which
   * is the one place you are certainly finished with.
   */
  const lastSeen = [...episodes].reverse().find((e) => watched.has(keyOf(e)));
  const anchor = next ?? lastSeen;
  const nextKey = anchor ? keyOf(anchor) : null;

  /** Bring an episode to the left edge of the strip, without moving the page.

      `scrollIntoView` would scroll every scrollable ancestor, which on a phone
      drags the whole page down to this row. Setting `scrollLeft` from the
      measured offset moves only the strip. */
  const bring = useCallback((id: string, behavior: ScrollBehavior) => {
    const card = cards.current.get(id);
    const box = strip.current;
    if (!card || !box) return;

    // Measured from where things actually are on screen, then turned back into
    // a scroll position. `offsetLeft` is relative to the nearest *positioned*
    // ancestor — which for these cards is the rail's wrapper, not the scrolling
    // box — so the old subtraction was mixing two coordinate spaces and landing
    // a few pixels from where it started.
    const gutter = parseFloat(getComputedStyle(box).paddingLeft) || 0;
    const delta = card.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollTo({ left: box.scrollLeft + delta - gutter, behavior });
  }, []);

  /**
   * Open on the episode you left off at, and return to it whenever that moves.
   *
   * The first placement is instant and the rest are smooth. Smoothly gliding to
   * the right card on arrival meant the row was briefly showing the wrong one,
   * and on a fresh page that reads as it having simply started in the wrong
   * place — which is what "does not open where I left off" was.
   *
   * It also has to wait for the cards to have a width. On the frame this first
   * runs the images have no intrinsic size yet, every card measures the same,
   * and the offset it scrolls to belongs to nothing. A layout effect after the
   * strip has been laid out is late enough.
   */
  /**
   * The episode the row still owes the reader a view of, until it has managed
   * to show it.
   *
   * Placing it once on mount was not enough, and this is why: the cards get
   * their width from stills that are still downloading, so the first
   * measurement puts every card in the same place and the scroll lands on
   * nothing. Waiting a frame or two only moved the guess. Instead the request
   * is held here and re-applied every time the strip's layout changes — which
   * is exactly when the stills arrive — until the reader takes over.
   */
  const owed = useRef<string | null>(null);
  const placed = useRef(false);

  useEffect(() => {
    if (!nextKey) return;

    // Marking an episode opens its "when did you watch it?" menu, and moving
    // the row would take the card — and the menu hanging off it — out from
    // under the reader's thumb. The move waits for the menu to close.
    if (askWhen) return;

    if (!placed.current) {
      // The first placement is instant: the row should open on the right
      // episode, not glide to it while the reader watches.
      placed.current = true;
      owed.current = nextKey;
      bring(nextKey, "auto");
      return;
    }

    // Everything after is a change to something already on screen, so it moves.
    owed.current = null;
    bring(nextKey, "smooth");
  }, [nextKey, askWhen, bring]);

  /**
   * Two jobs on one scroll handler: say which season is under the reader's eye,
   * and fetch the next one along before they reach the end of this one.
   */
  useEffect(() => {
    const box = strip.current;
    if (!box) return;

    /**
      * Card positions, measured once per layout rather than per scroll frame.
      *
      * Reading `offsetLeft` off a hundred cards on every frame of a flick
      * forces the browser to re-run layout each time, which is what made the row
      * feel like it was dragging against something.
      */
    let marks: { left: number; season: number }[] = [];
    const measure = () => {
      marks = episodes.map((episode) => ({
        left: (cards.current.get(keyOf(episode))?.offsetLeft ?? 0) - box.offsetLeft,
        season: episode.seasonNumber,
      }));
    };

    let frame = 0;
    const read = () => {
      frame = 0;

      const edge = box.scrollLeft + box.offsetWidth * 0.25;
      let nearest = marks[0];
      for (const mark of marks) {
        if (mark.left <= edge) nearest = mark;
        else break;
      }
      if (nearest) setSeason(nearest.season);

      const numbers = Object.keys(loaded).map(Number);
      const highest = Math.max(...numbers);
      const lowest = Math.min(...numbers);

      if (box.scrollWidth - box.scrollLeft - box.offsetWidth < REACH) {
        const after = seasons.find((number) => number > highest);
        if (after !== undefined) void load(after);
      }

      if (box.scrollLeft < REACH) {
        const before = [...seasons].reverse().find((number) => number < lowest);
        if (before !== undefined) void load(before);
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };

    const settle = () => {
      measure();
      read();
      if (owed.current) bring(owed.current, "auto");
    };

    settle();

    // Cards change width as their stills arrive, so the marks are taken again
    // whenever the strip's contents resize rather than only on mount.
    const observer = new ResizeObserver(settle);
    observer.observe(box);
    for (const child of box.children) observer.observe(child);

    // The moment the reader touches the row it is theirs; nothing should pull
    // it back underneath them afterwards.
    const release = () => {
      owed.current = null;
      placed.current = true;
    };

    box.addEventListener("scroll", onScroll, { passive: true });
    box.addEventListener("pointerdown", release, { passive: true });
    box.addEventListener("wheel", release, { passive: true });
    return () => {
      observer.disconnect();
      box.removeEventListener("scroll", onScroll);
      box.removeEventListener("pointerdown", release);
      box.removeEventListener("wheel", release);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [episodes, loaded, seasons, load, bring]);

  function episodeInput(episode: RailEpisode) {
    return {
      seasonNumber: episode.seasonNumber,
      episodeNumber: episode.episodeNumber,
      episodeName: episode.name,
      runtime: episode.runtime,
      airDate: episode.airDate,
    };
  }

  /** Aired but unlogged episodes before this one, inside its own season. */
  function behindInSeason(episode: RailEpisode) {
    return (loaded[episode.seasonNumber] ?? []).filter(
      (e) =>
        e.episodeNumber < episode.episodeNumber &&
        hasAired(e.airDate) &&
        !watched.has(keyOf(e)),
    ).length;
  }

  /** The same, counting every earlier season from what the page already knows. */
  function behindEverywhere(episode: RailEpisode) {
    const earlier = seasons
      .filter((number) => number < episode.seasonNumber)
      .reduce(
        (sum, number) =>
          sum + Math.max(0, (seasonSizes[number] ?? 0) - (watchedCounts[number] ?? 0)),
        0,
      );

    return behindInSeason(episode) + earlier;
  }

  /** Marking an episode with gaps behind it asks what to do about them. */
  function requestMark(episode: RailEpisode) {
    if (behindInSeason(episode) > 0 || behindEverywhere(episode) > 0) {
      setCatchUpFor(episode);
      return;
    }
    mark(episode);
  }

  /**
   * Everything up to and including this one. Dated by air date rather than by
   * the clock, for the reason the season list gives: filling in a run of
   * episodes is a claim about the past.
   */
  function catchUp(episode: RailEpisode, scope: "season" | "all") {
    setCatchUpFor(null);

    const filled = episodes.filter((candidate) => {
      if (candidate.seasonNumber > episode.seasonNumber) return false;
      if (scope === "season" && candidate.seasonNumber !== episode.seasonNumber) return false;
      if (
        candidate.seasonNumber === episode.seasonNumber &&
        candidate.episodeNumber > episode.episodeNumber
      ) {
        return false;
      }
      return hasAired(candidate.airDate);
    });

    setWatched((prev) => {
      const next = new Set(prev);
      for (const candidate of filled) next.add(keyOf(candidate));
      return next;
    });
    announce(
      filled.map((candidate) => ({
        seasonNumber: candidate.seasonNumber,
        episodeNumber: candidate.episodeNumber,
        watched: true,
      })),
    );

    startTransition(async () => {
      await catchUpTo({
        showId,
        showName,
        showPoster,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        when: "aired",
        scope,
      });
      router.refresh();
    });
  }

  // Anything the season list below changes, applied here as it happens.
  useEffect(
    () =>
      onEpisodeChange((changes) => {
        const mine = changes.filter((change) => change.showId === showId);
        if (mine.length === 0) return;

        setWatched((prev) => {
          const next = new Set(prev);
          for (const change of mine) {
            const id = `${change.seasonNumber}-${change.episodeNumber}`;
            if (change.watched) next.add(id);
            else next.delete(id);
          }
          return next;
        });
      }),
    [showId],
  );

  function announce(changes: { seasonNumber: number; episodeNumber: number; watched: boolean }[]) {
    publishEpisodeChanges(changes.map((change) => ({ showId, ...change })));
  }

  function mark(episode: RailEpisode, when?: Date) {
    // Applied here first: the row re-sorts itself around what you have seen, and
    // waiting for the server to say so would leave it a beat behind your thumb.
    setWatched((prev) => new Set(prev).add(keyOf(episode)));
    announce([
      {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watched: true,
      },
    ]);

    // Logged at the current time, so the only thing left to say about it is
    // "actually, it was earlier" — which is what this menu is for.
    setAskWhen(when ? null : keyOf(episode));

    startTransition(async () => {
      await toggleEpisodeWatched({
        showId,
        showName,
        showPoster,
        episode: episodeInput(episode),
        watchedAt: when ? when.toISOString() : undefined,
      });
      router.refresh();
    });
  }

  function unmark(episode: RailEpisode) {
    setWatched((prev) => {
      const next = new Set(prev);
      next.delete(keyOf(episode));
      return next;
    });
    announce([
      {
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watched: false,
      },
    ]);
    setAskWhen(null);

    startTransition(async () => {
      await toggleEpisodeWatched({
        showId,
        showName,
        showPoster,
        episode: episodeInput(episode),
      });
      router.refresh();
    });
  }

  function moveTo(episode: RailEpisode, when: Date) {
    setAskWhen(null);
    startTransition(async () => {
      await setEpisodeWatchedAt({
        showId,
        seasonNumber: episode.seasonNumber,
        episodeNumber: episode.episodeNumber,
        watchedAt: when.toISOString(),
      });
      router.refresh();
    });
  }

  if (episodes.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Watch next</h2>

        {/* The season, and how it scores, on the far side of the heading —
            following the scroll rather than the show. */}
        <p className="flex shrink-0 items-center gap-2 text-sm">
          {seasonScores[season] > 0 && (
            <span
              className={`font-mono text-xs font-semibold tabular-nums ${tone(seasonScores[season])}`}
              title="Average audience score across this season"
            >
              {seasonScores[season]}%
            </span>
          )}
          <span className="ios-dim text-ink-400">Season {season}</span>
        </p>
      </div>

      <Rail scrollRef={strip} artHeight="124px">
        {episodes.map((episode) => {
          const id = keyOf(episode);
          const seen = watched.has(id);
          const aired = hasAired(episode.airDate);
          const still = img.still(episode.still, "w300");

          return (
            <div
              key={id}
              ref={(node) => {
                if (node) cards.current.set(id, node);
                else cards.current.delete(id);
              }}
              className="rail-item w-[220px]"
            >
              {/*
                The whole still is the watch control, not just the badge on it.
                It is the biggest thing on the card and the only one anybody aims
                at with a thumb; leaving it inert while a 40px circle carried the
                action was asking for precision the card does not need.

                Nothing to press on an episode that has not aired — there is no
                date on which you watched something that does not exist yet.
              */}
              <div
                className={`relative aspect-video overflow-hidden rounded-xl ${
                  aired ? "bg-white/10 light:bg-ink-800" : "bg-white/5 light:bg-ink-700/60"
                }`}
              >
                {still ? (
                  <Image
                    src={still}
                    alt=""
                    fill
                    sizes="220px"
                    className={`object-cover transition ${seen ? "opacity-45" : ""}`}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-white/25 light:text-ink-400">
                    <Tv size={22} />
                  </div>
                )}

                {signedIn && aired && (
                  <button
                    type="button"
                    onClick={() =>
                      seen ? setAskWhen(askWhen === id ? null : id) : requestMark(episode)
                    }
                    aria-label={
                      seen
                        ? `Change when you watched ${episode.name}`
                        : `Mark ${episode.name} watched`
                    }
                    className="absolute inset-0"
                  >
                    <span
                      className={`absolute right-2 bottom-2 grid h-7 w-7 place-items-center rounded-full border shadow-lg shadow-black/40 backdrop-blur-md transition ${
                        seen
                          ? "border-white/25 bg-white/85 text-neutral-900 light:border-neutral-900 light:bg-neutral-900 light:text-white"
                          : "border-white/20 bg-black/50 text-white light:border-ink-600 light:bg-white light:text-ink-100"
                      }`}
                    >
                      {seen && <Check size={13} />}
                    </span>
                  </button>
                )}

                {/* Outside the button above, so the menu's own taps are not the
                    watch control's. */}
                {askWhen === id && (
                  <div className="absolute right-2 bottom-2">
                    <WatchedDateMenu
                      align="right"
                      releaseDate={episode.airDate}
                      onClose={() => setAskWhen(null)}
                      onPick={(date) => moveTo(episode, date)}
                      onUnwatch={() => unmark(episode)}
                    />
                  </div>
                )}

                {!aired && (
                  <span className="absolute top-2 left-2 rounded-full border border-white/15 bg-black/45 px-2 py-0.5 text-[10px] font-medium text-white/75 backdrop-blur-sm light:border-ink-600 light:bg-white/85 light:text-ink-300">
                    Not aired
                  </span>
                )}
              </div>

              {/* The way into the episode itself — its synopsis, its still, its
                  own rating. The chevron is there to say so; a title that opens
                  something with nothing to mark it reads as a caption. */}
              <Link
                href={`/title/tv/${showId}/episode/${episode.seasonNumber}/${episode.episodeNumber}`}
                className="mt-2 block w-full text-left"
              >
                <span className="flex items-center gap-1 text-sm font-medium">
                  Episode {episode.episodeNumber}
                  <ChevronRight size={14} className="shrink-0 opacity-60" />
                </span>
                <span className="ios-dim line-clamp-1 block text-xs text-ink-400">
                  {episode.name}
                </span>
              </Link>
            </div>
          );
        })}

        {busy !== null && (
          <div className="rail-item grid w-[220px] place-items-center">
            <Loader2 className="animate-spin text-ink-400" size={20} />
          </div>
        )}
      </Rail>

      {/* Resolved from the loaded episodes rather than held in state, so it
          follows along if a season reloads underneath an open dialog. */}
      {catchUpFor && (
        <CatchUpDialog
          episodeLabel={`S${String(catchUpFor.seasonNumber).padStart(2, "0")}E${String(
            catchUpFor.episodeNumber,
          ).padStart(2, "0")}`}
          inSeason={behindInSeason(catchUpFor)}
          before={behindEverywhere(catchUpFor)}
          onClose={() => setCatchUpFor(null)}
          onPick={(choice) => {
            const episode = catchUpFor;
            setCatchUpFor(null);
            if (choice === "one") mark(episode);
            else catchUp(episode, choice);
          }}
        />
      )}

    </section>
  );
}

/** The same three bands the rest of the app reads scores in. */
function tone(score: number) {
  if (score >= 70) return "text-emerald-400 light:text-emerald-700";
  if (score >= 50) return "text-amber-400 light:text-amber-700";
  return "text-red-400 light:text-red-700";
}
