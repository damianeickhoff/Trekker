import "server-only";
import { db } from "./db";
import { plexWebUrl, titleKey, type Mark } from "./marks";
import { recordPlay, type PlayResult } from "./plays";
import { mapLimit } from "./concurrency";
import { cacheKey, movieDetailsKey, seasonKey, tmdbPeek, tvDetailsKey, type MovieDetails, type Season, type TvDetails } from "./tmdb";

/**
 * Home's reads beyond Up next, and the one write its buttons make. Rows only:
 * the one place TMDB is consulted is the cache table, for the card's score and
 * network, and never the network.
 */

// ---------------------------------------------------------------------------
// Marks on artwork

/**
 * Availability for a batch of titles in one query, keyed by `titleKey`.
 * Titles the daily job has not looked at have no row and no mark, which is
 * the honest answer for something nobody has asked about.
 */
export async function marksFor(titles: { mediaType: string; tmdbId: number }[]): Promise<Record<string, Mark>> {
  const ids = (type: string) => [...new Set(titles.filter((t) => t.mediaType === type).map((t) => t.tmdbId))];
  const movies = ids("movie");
  const shows = ids("tv");
  if (movies.length + shows.length === 0) return {};
  const rows = await db.availability.findMany({
    where: {
      OR: [
        ...(movies.length ? [{ mediaType: "movie", tmdbId: { in: movies } }] : []),
        ...(shows.length ? [{ mediaType: "tv", tmdbId: { in: shows } }] : []),
      ],
    },
    select: { mediaType: true, tmdbId: true, onPlex: true, overseerrStatus: true },
  });
  const out: Record<string, Mark> = {};
  for (const r of rows) {
    // On Plex wins: once it is on the server, the request has done its job.
    out[titleKey(r.mediaType, r.tmdbId)] = r.onPlex ? "plex" : r.overseerrStatus === "requested" ? "requested" : null;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Recently watched

export type RecentItem = {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  /** ISO: this crosses the Next data cache, which keeps JSON, not Dates. */
  watchedAt: string;
};

/** How far back the rail reads before collapsing rewatches and marathons. */
const RECENT_SCAN = 80;

/**
 * The last titles watched, one poster each, newest first. Straight off the
 * play log, whose rows carry their own title and poster, so this is one read
 * on `(userId, watchedAt)` bounded by `take`. A binge of one show is one poster.
 */
export async function getRecentlyWatched(userId: string, take = 14): Promise<RecentItem[]> {
  const plays = await db.play.findMany({
    where: { userId },
    orderBy: { watchedAt: "desc" },
    take: RECENT_SCAN,
    select: {
      mediaType: true,
      tmdbId: true,
      title: true,
      poster: true,
      seasonNumber: true,
      episodeNumber: true,
      watchedAt: true,
    },
  });
  const seen = new Set<string>();
  const out: RecentItem[] = [];
  for (const p of plays) {
    const key = titleKey(p.mediaType, p.tmdbId);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      mediaType: p.mediaType === "tv" ? "tv" : "movie",
      tmdbId: p.tmdbId,
      title: p.title,
      poster: p.poster,
      seasonNumber: p.seasonNumber,
      episodeNumber: p.episodeNumber,
      watchedAt: p.watchedAt.toISOString(),
    });
    if (out.length === take) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The Up next card's extras

export type CardExtras = {
  /** TMDB audience score as a percentage, when enough people have voted. */
  audience: number | null;
  /** Friends' popcorn average, 1 to 5, to one decimal. */
  friends: number | null;
  network: string | null;
  plexUrl: string | null;
  /** The next episode's synopsis, from the cached season, or null. */
  overview: string | null;
};

/**
 * What the card shows beyond the row: audience score and network from the
 * cached details (the row does not carry them; the job keeps the cache), the
 * episode's synopsis from the cached season the same job fetched, the
 * friends' average, and a Plex link when the daily job found the show there.
 */
export async function getCardExtras(
  userId: string,
  showId: number,
  episode?: { seasonNumber: number; episodeNumber: number },
): Promise<CardExtras> {
  const { path, params } = tvDetailsKey(showId);
  const season = episode ? seasonKey(showId, episode.seasonNumber) : null;
  const [details, seasonAnswer, friendships, availability, admin] = await Promise.all([
    tmdbPeek<TvDetails>(path, params),
    season ? tmdbPeek<Season>(season.path, season.params) : null,
    db.friendship.findMany({
      where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    }),
    db.availability.findUnique({
      where: { mediaType_tmdbId: { mediaType: "tv", tmdbId: showId } },
      select: { onPlex: true, plexRatingKey: true },
    }),
    // The Plex connection lives on the oldest account.
    db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { plexMachineId: true } }),
  ]);

  const friendIds = friendships.map((f) => (f.requesterId === userId ? f.addresseeId : f.requesterId));
  const ratings = friendIds.length
    ? await db.rating.findMany({
        where: { userId: { in: friendIds }, mediaType: "tv", tmdbId: showId },
        select: { score: true },
      })
    : [];

  const audience =
    details && details.vote_count >= 10 && details.vote_average > 0 ? Math.round(details.vote_average * 10) : null;
  const friends = ratings.length
    ? Math.round((ratings.reduce((sum, r) => sum + r.score, 0) / ratings.length) * 10) / 10
    : null;
  const plexUrl = availability?.onPlex ? plexWebUrl(admin?.plexMachineId, availability.plexRatingKey) : null;

  const overview =
    seasonAnswer?.episodes?.find((e) => e.episode_number === episode?.episodeNumber)?.overview?.trim() || null;

  return { audience, friends, network: details?.networks?.[0]?.name ?? null, plexUrl, overview };
}

/**
 * Each show's first network, for the rows of Also waiting, keyed by show id.
 * `TitleState` does not carry it, so it comes from the cached details the
 * refresh job keeps, in one query; a show whose details were never fetched
 * simply has none.
 */
export async function networksFor(showIds: number[]): Promise<Record<number, string>> {
  if (showIds.length === 0) return {};
  const keys = new Map(
    showIds.map((id) => {
      const { path, params } = tvDetailsKey(id);
      return [cacheKey(path, params), id] as const;
    }),
  );
  const rows = await db.tmdbCache.findMany({ where: { key: { in: [...keys.keys()] } }, select: { key: true, body: true } });
  const out: Record<number, string> = {};
  for (const row of rows) {
    const name = (JSON.parse(row.body) as TvDetails).networks?.[0]?.name;
    const id = keys.get(row.key);
    if (name && id !== undefined) out[id] = name;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The write

/**
 * Marks one episode watched from Home. Name, artwork and runtime come from the
 * rows the card was drawn from, so this never waits on TMDB; everything else
 * is `recordPlay`, which moves `TitleState` on to the next episode and
 * re-derives the counts in the same transaction, holding the show's place. Null when the show is not one
 * of this person's.
 */
export async function markEpisodeFromHome(
  userId: string,
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<PlayResult | null> {
  const [state, episode] = await Promise.all([
    db.titleState.findUnique({
      where: { userId_showId: { userId, showId } },
      select: { showName: true, showPoster: true },
    }),
    db.showEpisode.findUnique({
      where: { showId_seasonNumber_episodeNumber: { showId, seasonNumber, episodeNumber } },
      select: { name: true, runtime: true },
    }),
  ]);
  if (!state) return null;

  return recordPlay(userId, {
    mediaType: "tv",
    tmdbId: showId,
    seasonNumber,
    episodeNumber,
    title: state.showName,
    poster: state.showPoster,
    episodeName: episode?.name ?? null,
    runtime: episode?.runtime ?? null,
    source: "manual",
    // Ticked where the row is drawn: it advances in place rather than jumping
    // to the card, and the next render agrees with what the tick showed.
    holdPlace: true,
  });
}

// ---------------------------------------------------------------------------
// Backdrops for the wide cards

/**
 * Backdrops for films, from the cached details and never the network: the
 * watchlist row a film arrives on has a poster but no backdrop, and the daily
 * job has usually read its details already. A film nobody has looked at yet
 * keeps its poster, cropped, until it has.
 */
export async function filmBackdrops(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)];
  const found = await mapLimit(unique, 6, async (id) => {
    const { path, params } = movieDetailsKey(id);
    const details = await tmdbPeek<MovieDetails>(path, params).catch(() => null);
    return [id, details?.backdrop_path ?? null] as const;
  });
  return new Map(found.filter((f): f is readonly [number, string] => f[1] !== null));
}
