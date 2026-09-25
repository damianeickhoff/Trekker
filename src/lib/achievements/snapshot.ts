import "server-only";
import { db } from "../db";
import { franchiseProgress, titleFacts } from "../title-facts";
import type { Day, Facts, Snapshot, SnapshotPlay } from "./catalogue";
import { IMPORTED_SOURCES } from "./xp";

/**
 * A whole history as the badges read it, from rows: the watched tables, the
 * play log, ratings, the watchlist and friends as counts, shows finished from
 * `TitleState`, and the shared title facts. One read per table; the play log
 * is the largest and is only ever a few thousand narrow rows.
 */

export type Built = {
  snapshot: Snapshot;
  /**
   * The same history cut down to what arrived with the account: plays from an
   * import, and plays from before its starting line. Whatever this alone meets
   * was the history's doing, so a badge it satisfies is carried, and the shows
   * and franchises it completes belong to the baseline (`achievements/xp.ts`).
   */
  history: Snapshot;
  pending: number;
};

type RawPlay = SnapshotPlay & { source: string; seasonNumber: number | null; episodeNumber: number | null };

/** One bucket per calendar day in the household's time: "was I watching something that day" is about occasions. */
function daysFrom(plays: SnapshotPlay[]): Day[] {
  const perDay = new Map<string, Day>();
  for (const p of plays) {
    const k = `${p.watchedAt.getFullYear()}-${p.watchedAt.getMonth()}-${p.watchedAt.getDate()}`;
    let day = perDay.get(k);
    if (!day) {
      day = { date: p.watchedAt, minutes: 0, films: 0, episodesPerShow: new Map() };
      perDay.set(k, day);
    }
    day.minutes += p.runtime;
    if (p.mediaType === "movie") day.films += 1;
    else day.episodesPerShow.set(p.tmdbId, (day.episodesPerShow.get(p.tmdbId) ?? 0) + 1);
  }
  return [...perDay.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

const bare = ({ mediaType, tmdbId, runtime, watchedAt }: SnapshotPlay): SnapshotPlay => ({ mediaType, tmdbId, runtime, watchedAt });

/**
 * The history alone, rebuilt from its plays. Ratings, the watchlist and
 * friends cannot be imported, so they are left out: a badge that needs them was
 * earned here. Franchise progress keeps TMDB's totals and counts only the films
 * the history saw, so nothing has to be asked for again.
 */
function historyOf(
  s: Snapshot,
  plays: RawPlay[],
  inHistory: (p: RawPlay) => boolean,
  ended: { showId: number; airedCount: number }[],
): Snapshot {
  const kept = plays.filter(inHistory);

  const firstFilm = new Map<number, Date>();
  const firstEpisode = new Map<string, { showId: number; season: number | null; watchedAt: Date }>();
  for (const p of kept) {
    if (p.mediaType === "movie") {
      const at = firstFilm.get(p.tmdbId);
      if (!at || p.watchedAt < at) firstFilm.set(p.tmdbId, p.watchedAt);
    } else {
      const key = `${p.tmdbId}-${p.seasonNumber}-${p.episodeNumber}`;
      const seen = firstEpisode.get(key);
      if (!seen || p.watchedAt < seen.watchedAt) {
        firstEpisode.set(key, { showId: p.tmdbId, season: p.seasonNumber, watchedAt: p.watchedAt });
      }
    }
  }

  const films = s.films.flatMap((f) => {
    const at = firstFilm.get(f.tmdbId);
    return at ? [{ ...f, watchedAt: at }] : [];
  });
  const episodes = [...firstEpisode.values()];
  const shows = new Set(episodes.map((e) => e.showId));

  // Numbered seasons only, as `TitleState` counts them.
  const numbered = new Map<number, number>();
  for (const e of episodes) {
    if (e.season !== null && e.season > 0) numbered.set(e.showId, (numbered.get(e.showId) ?? 0) + 1);
  }

  const perCollection = new Map<number, number>();
  for (const f of films) {
    const id = f.facts?.collectionId;
    if (id) perCollection.set(id, (perCollection.get(id) ?? 0) + 1);
  }

  const typed = kept.map(bare);
  return {
    films,
    episodes: episodes.map(({ showId, watchedAt }) => ({ showId, watchedAt })),
    plays: typed,
    showFacts: new Map([...s.showFacts].filter(([id]) => shows.has(id))),
    showNames: new Map([...s.showNames].filter(([id]) => shows.has(id))),
    ratings: [],
    watchlistCount: 0,
    friendCount: 0,
    days: daysFrom(typed),
    finishedShows: ended.filter((t) => t.airedCount > 0 && (numbered.get(t.showId) ?? 0) >= t.airedCount).length,
    franchises: s.franchises.map((f) => ({ ...f, owned: Math.min(f.owned, perCollection.get(f.id) ?? 0) })),
  };
}

export async function buildSnapshot(userId: string, { offline = false } = {}): Promise<Built> {
  const [films, episodes, plays, ratings, watchlistCount, friendCount, states, account] = await Promise.all([
    db.watchedMovie.findMany({
      where: { userId },
      select: { movieId: true, title: true, runtime: true, score: true, watchedAt: true },
    }),
    db.watchedEpisode.findMany({ where: { userId }, select: { showId: true, showName: true, watchedAt: true } }),
    db.play.findMany({
      where: { userId },
      select: {
        mediaType: true,
        tmdbId: true,
        runtime: true,
        watchedAt: true,
        source: true,
        seasonNumber: true,
        episodeNumber: true,
      },
    }),
    db.rating.findMany({ where: { userId }, select: { score: true, review: true } }),
    db.watchlistItem.count({ where: { userId } }),
    db.friendship.count({ where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] } }),
    db.titleState.findMany({
      where: { userId, status: { in: ["ended", "cancelled"] } },
      select: { showId: true, airedCount: true, watchedCount: true },
    }),
    db.user.findUnique({ where: { id: userId }, select: { levelBaselineAt: true } }),
  ]);

  const showNames = new Map<number, string>();
  for (const e of episodes) if (!showNames.has(e.showId)) showNames.set(e.showId, e.showName);

  const { facts, collectionNames, pending } = await titleFacts(
    [
      ...films.map((f) => ({ mediaType: "movie" as const, tmdbId: f.movieId })),
      ...[...showNames.keys()].map((id) => ({ mediaType: "tv" as const, tmdbId: id })),
    ],
    { offline },
  );

  const snapshotFilms = films.map((f) => ({
    tmdbId: f.movieId,
    title: f.title,
    runtime: f.runtime,
    score: f.score,
    watchedAt: f.watchedAt,
    facts: facts.get(`movie-${f.movieId}`) ?? null,
  }));

  const showFacts = new Map<number, Facts>();
  for (const id of showNames.keys()) {
    const f = facts.get(`tv-${id}`);
    if (f) showFacts.set(id, f);
  }

  const typed: RawPlay[] = plays.map((p) => ({ ...p, mediaType: p.mediaType === "tv" ? ("tv" as const) : ("movie" as const) }));

  // Offline means rows only: the collection answers are cache reads, cheap,
  // but nothing is asked for that is missing.
  const franchises = await franchiseProgress(snapshotFilms, collectionNames, { offline });

  const snapshot: Snapshot = {
    films: snapshotFilms,
    episodes: episodes.map((e) => ({ showId: e.showId, watchedAt: e.watchedAt })),
    plays: typed.map(bare),
    showFacts,
    showNames,
    ratings,
    watchlistCount,
    friendCount,
    days: daysFrom(typed),
    finishedShows: states.filter((s) => s.airedCount > 0 && s.watchedCount >= s.airedCount).length,
    franchises: franchises.franchises,
  };

  // The starting line, or before one is drawn the first thing done here:
  // everything older arrived with the account, whatever its source says.
  let cut = account?.levelBaselineAt ?? null;
  if (!cut) {
    for (const p of typed) {
      if (!IMPORTED_SOURCES.includes(p.source) && (!cut || p.watchedAt < cut)) cut = p.watchedAt;
    }
  }
  const inHistory = (p: RawPlay) => IMPORTED_SOURCES.includes(p.source) || (cut !== null && p.watchedAt < cut);

  return { snapshot, history: historyOf(snapshot, typed, inHistory, states), pending: pending + franchises.pending };
}
