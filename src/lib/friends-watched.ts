import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { avatarUrl } from "./avatar";
import { dateParts, todayKey } from "./dates";
import { db } from "./db";
import type { Person } from "./friends";
import { episodeCode } from "./marks";

/**
 * Friends who watched: on a film, a show, an episode, and beside each episode
 * in a season's list.
 *
 * A viewing is part of a profile, and profiles are private until both sides
 * agree (`canSeeProfile` in `friends.ts`), so only accepted friends count, and
 * the condition is part of the query that reads the rows rather than a list
 * of ids fetched first: there is no moment at which a stranger's rows are in
 * hand to be filtered. Rows only; nothing here asks TMDB.
 */

/** Accepted friends of `userId`, from either end of the request. Never `userId` themselves. */
export function friendOf(userId: string): Prisma.UserWhereInput {
  return {
    id: { not: userId },
    OR: [
      { sentRequests: { some: { addresseeId: userId, status: "accepted" } } },
      { receivedRequests: { some: { requesterId: userId, status: "accepted" } } },
    ],
  };
}

const PERSON = { id: true, name: true, avatarSetAt: true } as const;

const personOf = (u: { id: string; name: string; avatarSetAt: Date | null }): Person => ({
  id: u.id,
  name: u.name,
  avatar: avatarUrl(u),
});

/** The latest viewing: a rewatch moves `lastWatchedAt` and leaves `watchedAt` as the first. */
const latest = (w: { watchedAt: Date; lastWatchedAt: Date | null }) => w.lastWatchedAt ?? w.watchedAt;

// ---------------------------------------------------------------------------
// The words

/** "12 Aug", with the year once it is not this one. */
export function friendDay(at: Date, today = todayKey()): string {
  const key = todayKey(at);
  const p = dateParts(key);
  return `${p.day} ${p.month.slice(0, 3)}${key.slice(0, 4) === today.slice(0, 4) ? "" : ` ${p.year}`}`;
}

/** "12 Aug", "12 Aug · rewatched", "12 Aug · ×3": the last viewing, and how many there were. */
export function viewingLine(w: { at: Date; plays: number }, today = todayKey()): string {
  const again = w.plays > 2 ? `×${w.plays}` : w.plays === 2 ? "rewatched" : null;
  return [friendDay(w.at, today), again].filter(Boolean).join(" · ");
}

/** "Finished", or the furthest episode and when: "S02 · E04 · 12 Aug". */
export function progressLine(p: ShowProgress, today = todayKey()): string {
  if (p.finished || !p.furthest) return "Finished";
  return `${episodeCode(p.furthest.season, p.furthest.episode)} · ${friendDay(p.furthest.at, today)}`;
}

/** "Jason", "Jason and Soraya", "Jason, Soraya and Tom". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/**
 * An episode row's faces: at most `max`, then "+n" for the rest. The label
 * names everyone, drawn or not, since a screen reader has no faces to count.
 */
export function avatarStack(people: Person[], max = 3) {
  return {
    shown: people.slice(0, max),
    more: Math.max(people.length - max, 0),
    label: `Watched by ${namesList(people.map((p) => p.name))}`,
  };
}

// ---------------------------------------------------------------------------
// A film, and one episode

export type FriendViewed = {
  friend: Person;
  /** Their latest viewing. */
  at: Date;
  plays: number;
  /** Their popcorn, 1 to 5, where they gave one. */
  score: number | null;
};

const newestFirst = <T extends { at: Date }>(rows: T[]) => rows.sort((a, b) => b.at.getTime() - a.at.getTime());

/** Friends who have seen a film, most recent viewing first. */
export async function friendsWhoWatchedFilm(userId: string, tmdbId: number): Promise<FriendViewed[]> {
  const rows = await db.watchedMovie.findMany({
    where: { movieId: tmdbId, user: friendOf(userId) },
    select: {
      plays: true,
      watchedAt: true,
      lastWatchedAt: true,
      user: { select: { ...PERSON, ratings: { where: { mediaType: "movie", tmdbId }, select: { score: true }, take: 1 } } },
    },
  });
  return newestFirst(
    rows.map((r) => ({ friend: personOf(r.user), at: latest(r), plays: r.plays, score: r.user.ratings[0]?.score ?? null })),
  );
}

/** Friends who have seen one episode, most recent viewing first, with their rating of that episode. */
export async function friendsWhoWatchedEpisode(
  userId: string,
  showId: number,
  season: number,
  episode: number,
): Promise<FriendViewed[]> {
  const rows = await db.watchedEpisode.findMany({
    where: { showId, seasonNumber: season, episodeNumber: episode, user: friendOf(userId) },
    select: {
      plays: true,
      watchedAt: true,
      lastWatchedAt: true,
      user: {
        select: {
          ...PERSON,
          episodeRatings: {
            where: { showId, seasonNumber: season, episodeNumber: episode },
            select: { score: true },
            take: 1,
          },
        },
      },
    },
  });
  return newestFirst(
    rows.map((r) => ({
      friend: personOf(r.user),
      at: latest(r),
      plays: r.plays,
      // A rating kept from the current app may be a like with no bucket; that is no rating to show.
      score: r.user.episodeRatings[0]?.score ?? null,
    })),
  );
}

// ---------------------------------------------------------------------------
// A show

export type ShowProgress = {
  finished: boolean;
  /** Their furthest episode in the numbered seasons, and when they last saw it. */
  furthest: { season: number; episode: number; at: Date } | null;
  /** Their latest viewing of any episode, for the order. */
  at: Date;
};

export type FriendProgress = ShowProgress & { friend: Person; score: number | null };

type WatchedRow = { seasonNumber: number; episodeNumber: number; watchedAt: Date; lastWatchedAt: Date | null };

/**
 * How far one person is, from their watched rows and the show's aired
 * episodes. Finished means every aired episode of the numbered seasons, so a
 * season announced but not out does not unfinish anybody, and specials never
 * count either way, as in the progress panel. Null when nothing numbered is seen.
 */
export function progressOf(rows: WatchedRow[], aired: Set<string>): ShowProgress | null {
  const numbered = rows.filter((r) => r.seasonNumber > 0);
  if (numbered.length === 0) return null;
  const seen = new Set(numbered.map((r) => `${r.seasonNumber}:${r.episodeNumber}`));
  const finished = aired.size > 0 && [...aired].every((k) => seen.has(k));
  const far = numbered.reduce((a, b) =>
    b.seasonNumber > a.seasonNumber || (b.seasonNumber === a.seasonNumber && b.episodeNumber > a.episodeNumber) ? b : a,
  );
  return {
    finished,
    furthest: { season: far.seasonNumber, episode: far.episodeNumber, at: latest(far) },
    at: new Date(Math.max(...numbered.map((r) => latest(r).getTime()))),
  };
}

/**
 * Friends who have started a show, each with how far they are and their
 * rating of it, most recent viewing first. The aired list is the show's
 * stored episodes (`ShowEpisode`), read once for everybody; a show the
 * refresh job has not listed yet has none, and then nobody reads as finished
 * rather than everybody.
 */
export async function friendsProgress(userId: string, showId: number, today = todayKey()): Promise<FriendProgress[]> {
  const [people, aired] = await Promise.all([
    db.user.findMany({
      where: { ...friendOf(userId), episodes: { some: { showId, seasonNumber: { gt: 0 } } } },
      select: {
        ...PERSON,
        episodes: {
          where: { showId, seasonNumber: { gt: 0 } },
          select: { seasonNumber: true, episodeNumber: true, watchedAt: true, lastWatchedAt: true },
        },
        ratings: { where: { mediaType: "tv", tmdbId: showId }, select: { score: true }, take: 1 },
      },
    }),
    db.showEpisode.findMany({
      where: { showId, seasonNumber: { gt: 0 }, airDate: { lte: today } },
      select: { seasonNumber: true, episodeNumber: true },
    }),
  ]);
  const airedKeys = new Set(aired.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));
  const out: FriendProgress[] = [];
  for (const p of people) {
    const progress = progressOf(p.episodes, airedKeys);
    if (progress) out.push({ ...progress, friend: personOf(p), score: p.ratings[0]?.score ?? null });
  }
  return newestFirst(out);
}

/**
 * Who has seen each episode of one season, most recent viewing first within
 * an episode: the faces on the episode list, from one query for the season.
 */
export async function friendsBySeasonEpisode(userId: string, showId: number, season: number): Promise<Map<number, Person[]>> {
  const rows = await db.watchedEpisode.findMany({
    where: { showId, seasonNumber: season, user: friendOf(userId) },
    select: { episodeNumber: true, watchedAt: true, lastWatchedAt: true, user: { select: PERSON } },
  });
  rows.sort((a, b) => latest(b).getTime() - latest(a).getTime());
  const out = new Map<number, Person[]>();
  for (const r of rows) {
    const list = out.get(r.episodeNumber) ?? [];
    list.push(personOf(r.user));
    out.set(r.episodeNumber, list);
  }
  return out;
}
