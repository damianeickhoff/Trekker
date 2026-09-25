import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { todayKey } from "./dates";
import { db } from "./db";
import { seasonKey, showStatus, tmdbPeek, tvDetailsKey, type Season, type TvDetails } from "./tmdb";

/**
 * Where each person is in each show, as rows.
 *
 * Writes come from two sides and meet in `recomputeTitleState`: `recordPlay`
 * after a viewing (no network, a handful of indexed queries), and the refresh
 * job after it has fetched a show (`storeShowEpisodes` first, then this for
 * every follower). The read here is Up next, two indexed queries with no TMDB
 * anywhere near it; the calendar and Landing soon join these rows to
 * `ShowEpisode` in `calendar.ts`.
 */

type Client = Prisma.TransactionClient | typeof db;

/** The show facts the aired half carries, from the cached details. */
export type AiredFacts = {
  showName: string;
  showPoster: string | null;
  backdrop: string | null;
  status: ReturnType<typeof showStatus>;
  lastAirDate: string | null;
  premiereDate: string | null;
};

export function airedFacts(details: TvDetails): AiredFacts {
  return {
    showName: details.name,
    showPoster: details.poster_path,
    backdrop: details.backdrop_path,
    status: showStatus(details.status),
    lastAirDate: details.last_episode_to_air?.air_date ?? details.last_air_date ?? null,
    premiereDate: details.first_air_date || null,
  };
}

/**
 * Copies a show's episode list out of the TMDB cache into `ShowEpisode`.
 *
 * Numbered seasons only: specials are season zero, and counting them makes a
 * finished show read as unfinished and puts a behind-the-scenes clip at the
 * front of Up next. A season missing from the cache keeps whatever rows it had,
 * so a partly failed refresh narrows nothing. Returns the details it read, or
 * null when the show has never been fetched.
 */
export async function storeShowEpisodes(showId: number): Promise<TvDetails | null> {
  const { path, params } = tvDetailsKey(showId);
  const details = await tmdbPeek<TvDetails>(path, params);
  if (!details) return null;

  const numbered = details.seasons.filter((s) => s.season_number > 0).map((s) => s.season_number);
  const seasons: Season[] = [];
  for (const n of numbered) {
    const key = seasonKey(showId, n);
    const season = await tmdbPeek<Season>(key.path, key.params);
    if (season) seasons.push(season);
  }

  const rows = seasons.flatMap((season) =>
    season.episodes
      .filter((e) => e.season_number > 0)
      .map((e) => ({
        showId,
        seasonNumber: e.season_number,
        episodeNumber: e.episode_number,
        name: e.name || `Episode ${e.episode_number}`,
        airDate: e.air_date || null,
        runtime: e.runtime && e.runtime > 0 ? e.runtime : null,
        still: e.still_path,
        episodeType: e.episode_type ?? null,
      })),
  );

  await db.$transaction([
    // Seasons TMDB no longer lists go; seasons it lists but we could not read stay.
    db.showEpisode.deleteMany({ where: { showId, seasonNumber: { notIn: numbered } } }),
    db.showEpisode.deleteMany({
      where: { showId, seasonNumber: { in: seasons.map((s) => s.season_number) } },
    }),
    // Chunked in spirit by season; a single show never approaches SQLite's
    // bound-variable ceiling in one statement of this width.
    db.showEpisode.createMany({ data: rows }),
  ]);

  return details;
}

type Describe = { showName?: string; showPoster?: string | null };

/**
 * What a recompute does to the row's place in Up next (see `heldAt` in the
 * schema). `follow`: a viewing from anywhere but Home, which reorders as it
 * should. `hold`: a viewing logged or redated from Home, which must not move
 * the row out from under the thumb that ticked it. Left out: the refresh job,
 * which learns about episodes, not viewings, and leaves the place alone.
 */
export type PlaceChange = "follow" | "hold";

/**
 * The warmth a row is held at for `today`. The first Home tick of the day
 * freezes the warmth the row had just before it; later ticks that day keep
 * what was frozen.
 */
export function heldPlace(
  existing: { lastWatchedAt: Date | null; heldAt: Date | null; heldOn: string | null } | null,
  fallback: Date | null,
  today: string,
): { heldAt: Date | null; heldOn: string } {
  if (existing?.heldOn === today) return { heldAt: existing.heldAt, heldOn: today };
  return { heldAt: existing ? existing.lastWatchedAt : fallback, heldOn: today };
}

/**
 * Brings one person's row for one show up to date from rows alone.
 *
 * `facts` is passed by the refresh job, which has just read the details, and
 * marks the aired half as computed. Without it the show facts already on the
 * row are kept, which is the `recordPlay` path: a viewing changes what is next
 * and how much is watched, never whether the show has ended.
 *
 * The next episode is the first numbered episode, in order, with no viewing
 * beside it. Whether it is Up next or merely landing soon is a comparison of
 * its air date with today, made by the reads rather than stored, so a row does
 * not go stale at midnight.
 *
 * A show with no viewings left is deleted, unless it is on the watchlist: then
 * it stays, at zero, so the calendar can show its premiere.
 */
export async function recomputeTitleState(
  tx: Client,
  userId: string,
  showId: number,
  options: { facts?: AiredFacts; describe?: Describe; today?: string; place?: PlaceChange } = {},
): Promise<void> {
  const today = options.today ?? todayKey();

  const [watched, episodes, existing] = await Promise.all([
    tx.watchedEpisode.findMany({
      where: { userId, showId },
      select: {
        seasonNumber: true,
        episodeNumber: true,
        watchedAt: true,
        lastWatchedAt: true,
        showName: true,
        showPoster: true,
      },
    }),
    tx.showEpisode.findMany({
      where: { showId, seasonNumber: { gt: 0 } },
      orderBy: [{ seasonNumber: "asc" }, { episodeNumber: "asc" }],
    }),
    tx.titleState.findUnique({ where: { userId_showId: { userId, showId } } }),
  ]);

  if (watched.length === 0) {
    const listed = await tx.watchlistItem.findUnique({
      where: { userId_mediaType_tmdbId: { userId, mediaType: "tv", tmdbId: showId } },
      select: { title: true, poster: true },
    });
    if (!listed) {
      await tx.titleState.deleteMany({ where: { userId, showId } });
      return;
    }
    options.describe ??= { showName: listed.title, showPoster: listed.poster };
  }

  const seen = new Set(watched.map((w) => `${w.seasonNumber}:${w.episodeNumber}`));
  const next = episodes.find((e) => !seen.has(`${e.seasonNumber}:${e.episodeNumber}`)) ?? null;

  let lastWatchedAt: Date | null = null;
  for (const w of watched) {
    const at = w.lastWatchedAt ?? w.watchedAt;
    if (!lastWatchedAt || at > lastWatchedAt) lastWatchedAt = at;
  }

  const newest = watched.reduce<(typeof watched)[number] | null>(
    (best, w) => (!best || (w.lastWatchedAt ?? w.watchedAt) > (best.lastWatchedAt ?? best.watchedAt) ? w : best),
    null,
  );

  const facts = options.facts;
  const showName =
    facts?.showName ?? options.describe?.showName ?? existing?.showName ?? newest?.showName ?? "Untitled";
  const showPoster =
    facts?.showPoster ?? options.describe?.showPoster ?? existing?.showPoster ?? newest?.showPoster ?? null;

  const place =
    options.place === "hold"
      ? heldPlace(existing, lastWatchedAt, today)
      : options.place === "follow"
        ? { heldAt: null, heldOn: null }
        : { heldAt: existing?.heldAt ?? null, heldOn: existing?.heldOn ?? null };

  const data = {
    showName,
    showPoster,
    backdrop: facts ? facts.backdrop : (existing?.backdrop ?? null),
    status: facts?.status ?? existing?.status ?? "returning",
    lastAirDate: facts ? facts.lastAirDate : (existing?.lastAirDate ?? null),
    premiereDate: facts ? facts.premiereDate : (existing?.premiereDate ?? null),
    watchedCount: watched.filter((w) => w.seasonNumber > 0).length,
    // Without an episode list these are unknown, and a stale count is better
    // than a zero that would read as "nothing has aired".
    airedCount: episodes.length
      ? episodes.filter((e) => e.airDate !== null && e.airDate <= today).length
      : (existing?.airedCount ?? 0),
    totalCount: episodes.length || (existing?.totalCount ?? 0),
    nextSeason: next?.seasonNumber ?? null,
    nextEpisode: next?.episodeNumber ?? null,
    nextTitle: next?.name ?? null,
    nextAirDate: next?.airDate ?? null,
    nextRuntime: next?.runtime ?? null,
    nextStill: next?.still ?? null,
    lastWatchedAt,
    ...place,
    airedAt: facts ? new Date() : (existing?.airedAt ?? null),
  };

  await tx.titleState.upsert({
    where: { userId_showId: { userId, showId } },
    create: { userId, showId, ...data },
    update: data,
  });
}

/**
 * The refresh job's half: after a show's episode list has been stored, every
 * follower's row is recomputed with the new facts. `alsoFor` names people who
 * should get a row even if they have none yet, which is the backfill.
 */
export async function recomputeFollowers(showId: number, facts: AiredFacts | null, alsoFor: string[] = []) {
  const followers = await db.titleState.findMany({ where: { showId }, select: { userId: true } });
  const users = new Set([...followers.map((f) => f.userId), ...alsoFor]);
  for (const userId of users) {
    await recomputeTitleState(db, userId, showId, { facts: facts ?? undefined });
  }
}

// ---------------------------------------------------------------------------
// Reads

export type UpNextRow = {
  showId: number;
  showName: string;
  showPoster: string | null;
  backdrop: string | null;
  seasonNumber: number;
  episodeNumber: number;
  episodeName: string | null;
  airDate: string | null;
  runtime: number | null;
  still: string | null;
  watchedCount: number;
  airedCount: number;
  totalCount: number;
  /** The show's latest aired episode, for `/waiting`'s "Recently aired". */
  lastAirDate: string | null;
};

const upNextSelect = {
  showId: true,
  showName: true,
  showPoster: true,
  backdrop: true,
  nextSeason: true,
  nextEpisode: true,
  nextTitle: true,
  nextAirDate: true,
  nextRuntime: true,
  nextStill: true,
  watchedCount: true,
  airedCount: true,
  totalCount: true,
  lastAirDate: true,
} as const;

function toUpNext(row: {
  showId: number;
  showName: string;
  showPoster: string | null;
  backdrop: string | null;
  nextSeason: number | null;
  nextEpisode: number | null;
  nextTitle: string | null;
  nextAirDate: string | null;
  nextRuntime: number | null;
  nextStill: string | null;
  watchedCount: number;
  airedCount: number;
  totalCount: number;
  lastAirDate: string | null;
}): UpNextRow {
  return {
    showId: row.showId,
    showName: row.showName,
    showPoster: row.showPoster,
    backdrop: row.backdrop,
    seasonNumber: row.nextSeason ?? 0,
    episodeNumber: row.nextEpisode ?? 0,
    episodeName: row.nextTitle,
    airDate: row.nextAirDate,
    runtime: row.nextRuntime,
    still: row.nextStill,
    watchedCount: row.watchedCount,
    airedCount: row.airedCount,
    totalCount: row.totalCount,
    lastAirDate: row.lastAirDate,
  };
}

/** Shows given up on: the rows stay, but nothing should keep suggesting them. */
export async function droppedIds(userId: string): Promise<number[]> {
  const rows = await db.droppedShow.findMany({ where: { userId }, select: { showId: true } });
  return rows.map((r) => r.showId);
}

/** A row's warmth for ordering: what it is held at today, else its latest viewing. */
export function upNextWarmth(
  row: { lastWatchedAt: Date | null; heldAt: Date | null; heldOn: string | null },
  today: string,
): number {
  const at = row.heldOn === today ? row.heldAt : row.lastWatchedAt;
  return at ? at.getTime() : 0;
}

/**
 * Shows with an aired episode waiting, warmest first. The first is the Up next
 * card; the rest are Also waiting.
 *
 * Ordered here rather than in SQL because the key depends on the day: a row
 * held by a Home tick orders by `heldAt` today and by `lastWatchedAt` from
 * tomorrow, which no stored column can say without a write at midnight. The
 * candidates are only shows with an episode out and unseen, a narrow select of
 * at most a few hundred rows on `(userId, ...)`, so reading them all is cheap.
 * Ties fall back to the show id, so two renders never disagree.
 */
export async function getUpNext(userId: string, take = 10, today = todayKey()): Promise<UpNextRow[]> {
  const dropped = await droppedIds(userId);
  const rows = await db.titleState.findMany({
    where: {
      userId,
      watchedCount: { gt: 0 },
      nextAirDate: { not: null, lte: today },
      showId: dropped.length ? { notIn: dropped } : undefined,
    },
    select: { ...upNextSelect, lastWatchedAt: true, heldAt: true, heldOn: true },
  });
  return rows
    .map((row) => ({ row, warmth: upNextWarmth(row, today) }))
    .sort((a, b) => b.warmth - a.warmth || a.row.showId - b.row.showId)
    .slice(0, take)
    .map(({ row }) => toUpNext(row));
}
