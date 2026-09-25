import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { plexWebUrl, titleKey } from "./marks";
import { parseProviders, regionFor, subscribedAmong, summaryFor } from "./providers";
import { instanceAdmin } from "./title";
import {
  discover,
  getImages,
  getMovieDetails,
  getTvDetails,
  getWatchProviders,
  offersFor,
  pickLogo,
  tmdbConfigured,
  tmdbPeek,
  type MovieDetails,
  type TitleLogo,
  type TvDetails,
} from "./tmdb";
import { episodeLength, filmLength } from "./runtime";
import {
  choose,
  collect,
  quizParams,
  rank,
  reasonFor,
  THIN,
  type Candidate,
  type Pool,
  type PoolPage,
  type Ranked,
  type ViewerFacts,
} from "./what-to-watch-picks";
import { openTime, type Audience, type KindId, type TimeChoice, type Vibe } from "./what-to-watch-quiz";
import type { MediaType } from "./smart-query";

/**
 * "What to watch", asked and answered. TMDB through the read-through cache, in
 * a bounded fan-out; the viewer from rows. The ranking itself is pure, in
 * `what-to-watch-picks.ts`.
 */

const FAN_OUT = 4;

type Viewer = { providers: number[]; region: string };

async function viewerOf(userId: string): Promise<Viewer> {
  const me = await db.user.findUnique({ where: { id: userId }, select: { region: true, providers: true } });
  return { providers: parseProviders(me?.providers), region: regionFor(me?.region) };
}

const today = () => new Date().toISOString().slice(0, 10);

function mediaFor(kind: KindId): MediaType[] {
  return kind === "both" ? ["movie", "tv"] : [kind];
}

type Ask = { medium: MediaType; pool: Pool; restricted: boolean; page: number };

/**
 * Per medium: two pages of what is popular, one of what is best reviewed, and
 * one of the popular query narrowed to the viewer's services. That last one is
 * also the answer to "can I watch this tonight": a per-title availability call
 * for forty candidates would be forty requests for a badge.
 */
function asks(media: MediaType[], hasProviders: boolean): Ask[] {
  return media.flatMap((medium) => [
    { medium, pool: "popular" as const, restricted: false, page: 1 },
    { medium, pool: "popular" as const, restricted: false, page: 2 },
    { medium, pool: "acclaimed" as const, restricted: false, page: 1 },
    ...(hasProviders ? [{ medium, pool: "popular" as const, restricted: true, page: 1 }] : []),
  ]);
}

async function gather(
  a: { audience: Audience; vibe: Vibe; time: TimeChoice; media: MediaType[]; viewer: Viewer; loose: boolean },
): Promise<PoolPage[]> {
  const day = today();
  const pages = await mapLimit(asks(a.media, a.viewer.providers.length > 0), FAN_OUT, async (ask): Promise<PoolPage | null> => {
    const params = quizParams({
      medium: ask.medium,
      pool: ask.pool,
      audience: a.audience,
      vibe: a.vibe,
      time: a.time,
      loose: a.loose,
      providers: ask.restricted ? a.viewer.providers : [],
      region: a.viewer.region,
      today: day,
    });
    const data = await discover(ask.medium, { ...params, page: ask.page > 1 ? ask.page : undefined }).catch(() => null);
    return data ? { pool: ask.pool, restricted: ask.restricted, page: ask.page, items: data.items } : null;
  });
  return pages.filter((p): p is PoolPage => p !== null);
}

/** What the rows say about the viewer and these candidates, in a handful of `IN (...)` queries. */
async function factsFor(userId: string, viewer: Viewer, candidates: Candidate[], rejected: string[]): Promise<ViewerFacts> {
  const ids = (m: MediaType) => [...new Set(candidates.filter((c) => c.item.mediaType === m).map((c) => c.item.id))];
  const films = ids("movie");
  const shows = ids("tv");
  const either = [
    ...(films.length ? [{ mediaType: "movie", tmdbId: { in: films } }] : []),
    ...(shows.length ? [{ mediaType: "tv", tmdbId: { in: shows } }] : []),
  ];

  const [watched, states, dropped, listed, availability] = await Promise.all([
    films.length ? db.watchedMovie.findMany({ where: { userId, movieId: { in: films } }, select: { movieId: true } }) : [],
    shows.length
      ? db.titleState.findMany({
          where: { userId, showId: { in: shows }, watchedCount: { gt: 0 } },
          select: { showId: true, watchedCount: true, airedCount: true },
        })
      : [],
    shows.length ? db.droppedShow.findMany({ where: { userId, showId: { in: shows } }, select: { showId: true } }) : [],
    either.length ? db.watchlistItem.findMany({ where: { userId, OR: either }, select: { mediaType: true, tmdbId: true } }) : [],
    either.length
      ? db.availability.findMany({ where: { OR: either }, select: { mediaType: true, tmdbId: true, onPlex: true, providers: true } })
      : [],
  ]);

  const partway = new Map<string, number>();
  const finished = new Set<string>(dropped.map((d) => titleKey("tv", d.showId)));
  for (const s of states) {
    const key = titleKey("tv", s.showId);
    if (s.airedCount > 0 && s.watchedCount >= s.airedCount) finished.add(key);
    else partway.set(key, s.watchedCount);
  }

  // As the person page's "On your services" reads it: on the Plex server, or
  // streaming on something they pay for, as far as the daily job has looked.
  const available = new Set(
    availability
      .filter((a) => {
        if (a.onPlex) return true;
        const offers = summaryFor(a.providers, viewer.region);
        return offers ? subscribedAmong(viewer.providers, [...offers.stream, ...offers.free]).length > 0 : false;
      })
      .map((a) => titleKey(a.mediaType, a.tmdbId)),
  );

  return {
    watchedFilms: new Set(watched.map((w) => titleKey("movie", w.movieId))),
    partway,
    finished,
    watchlist: new Set(listed.map((l) => titleKey(l.mediaType, l.tmdbId))),
    available,
    rejected: new Set(rejected),
  };
}

export type Pick = {
  entry: Ranked;
  reason: string;
  /** "Series · 8 × 58 min · HBO Max", "Film · 1 h 52 · On Plex". */
  medium: "Series" | "Film";
  runtime: number | null;
  episodes: number | null;
  services: string[];
  onPlex: boolean;
  plexUrl: string | null;
  /** The episode Play would start, for a show: the first one not seen. */
  next: { season: number; episode: number } | null;
};

export type Picks = {
  top: Pick[];
  wildcard: Pick | null;
  logo: TitleLogo | null;
  /** The viewer has named no services, so nothing could be preferred on that count. */
  noProviders: boolean;
};

/**
 * Tonight's answers. Asks the strict question first, and when fewer than
 * `THIN` candidates survive, asks again with the length, the start of the era
 * and the quality floor dropped; the mood's genre stays, because without it the
 * answer stops answering the question.
 */
export async function findPicks(
  userId: string,
  a: { audience: Audience; vibe: Vibe; kind: KindId; time: TimeChoice },
  seed: number,
  rejected: string[] = [],
): Promise<Picks> {
  const viewer = await viewerOf(userId);
  const empty: Picks = { top: [], wildcard: null, logo: null, noProviders: viewer.providers.length === 0 };
  if (!tmdbConfigured()) return empty;

  const media = mediaFor(a.kind);
  const pool = collect(await gather({ ...a, media, viewer, loose: false }));
  let facts = await factsFor(userId, viewer, [...pool.values()], rejected);
  let ranked = rank(pool.values(), a.vibe, facts);
  if (ranked.length < THIN) {
    // The strict pass wins where both have a title: its placing was earned
    // against the filters actually asked for.
    const loose = collect(await gather({ ...a, media, viewer, loose: true }));
    for (const [key, c] of pool) loose.set(key, c);
    facts = await factsFor(userId, viewer, [...loose.values()], rejected);
    ranked = rank(loose.values(), a.vibe, facts);
  }

  const chosen = choose(ranked, seed);
  if (chosen.top.length === 0) return empty;

  const admin = await instanceAdmin();
  const entries = chosen.wildcard ? [...chosen.top, chosen.wildcard] : chosen.top;
  const detailed = await mapLimit(entries, FAN_OUT, (entry) =>
    detail(userId, entry, viewer, { ...a }, admin?.plexMachineId ?? null),
  );
  const logo = await getImages(entries[0].item.mediaType, entries[0].item.id)
    .then(pickLogo)
    .catch(() => null);

  return {
    top: detailed.slice(0, chosen.top.length),
    wildcard: chosen.wildcard ? detailed[detailed.length - 1] : null,
    logo,
    noProviders: viewer.providers.length === 0,
  };
}

/**
 * What a pick's card says beyond the list row: its length, the viewer's own
 * services that carry it, and where Play would start. Details come through the
 * cache, kept a week; the providers only when the job's row has not looked.
 */
async function detail(
  userId: string,
  entry: Ranked,
  viewer: Viewer,
  a: { audience: Audience; vibe: Vibe; time: TimeChoice },
  machineId: string | null,
): Promise<Pick> {
  const { mediaType, id } = entry.item;
  const [details, row, state] = await Promise.all([
    (mediaType === "tv" ? getTvDetails(id) : getMovieDetails(id)).catch(() => null),
    db.availability.findUnique({ where: { mediaType_tmdbId: { mediaType, tmdbId: id } } }),
    mediaType === "tv"
      ? db.titleState.findUnique({
          where: { userId_showId: { userId, showId: id } },
          select: { nextSeason: true, nextEpisode: true },
        })
      : null,
  ]);

  let offers = summaryFor(row?.providers, viewer.region);
  if (!offers && viewer.providers.length) {
    const all = await getWatchProviders(mediaType, id).catch(() => null);
    const found = all ? offersFor(all, viewer.region) : null;
    if (found) {
      offers = {
        link: found.link,
        stream: found.stream.map((p) => ({ id: p.provider_id, name: p.provider_name })),
        free: found.free.map((p) => ({ id: p.provider_id, name: p.provider_name })),
      };
    }
  }
  const services = offers ? subscribedAmong(viewer.providers, [...offers.stream, ...offers.free]) : [];
  const onPlex = row?.onPlex ?? false;
  const runtime =
    mediaType === "tv" ? episodeLength(details as TvDetails | null) : filmLength(details as MovieDetails | null);

  return {
    entry,
    reason: reasonFor(entry, { ...a, runtime, services, onPlex }),
    medium: mediaType === "tv" ? "Series" : "Film",
    runtime,
    episodes: mediaType === "tv" ? ((details as TvDetails | null)?.number_of_episodes ?? null) : null,
    services,
    onPlex,
    plexUrl: onPlex ? plexWebUrl(machineId, row?.plexRatingKey) : null,
    next:
      mediaType === "tv"
        ? state?.nextSeason && state.nextEpisode
          ? { season: state.nextSeason, episode: state.nextEpisode }
          : entry.partway === null
            ? { season: 1, episode: 1 }
            : null
        : null,
  };
}

/**
 * A poster for each mood tile, from the cache only, read under the answer that
 * puts no limit on length: that is the first page the results ask for when the
 * length is left open, so the rows serve both. Every mood gets an entry, with
 * or without a poster, so every mood is a tile. No two tiles share a poster.
 *
 * Never waits on the network. It used to ask TMDB for every mood before the
 * question drew anything, eight or ten discover requests four at a time, each
 * allowed ten seconds: on a cold cache the question stood on its skeleton with
 * no tiles at all. Moods with nothing cached are asked for behind the page
 * instead, so the next visit has their artwork and the results find the rows.
 */
export async function vibeArtwork(audience: Audience, kind: KindId): Promise<Record<string, string | null>> {
  const empty = Object.fromEntries(audience.vibes.map((v) => [v.value, null])) as Record<string, string | null>;
  if (!tmdbConfigured()) return empty;
  const medium: MediaType = kind === "tv" ? "tv" : "movie";
  const time = openTime(kind);
  // The region only reaches a query narrowed to services, which this is not.
  const region = regionFor(null);
  const day = today();
  const asks = audience.vibes.map((vibe) =>
    quizParams({ medium, pool: "popular", audience, vibe, time, loose: false, providers: [], region, today: day }),
  );
  const pages = await Promise.all(
    asks.map((params) => tmdbPeek<{ results?: { poster_path?: string | null }[] }>(`/discover/${medium}`, params)),
  );

  const missing = asks.filter((_, i) => pages[i] === null);
  // Deliberately not awaited, and bounded like any other fan-out; the client
  // shares a request already in flight, so two visitors ask once.
  if (missing.length) void mapLimit(missing, FAN_OUT, (params) => discover(medium, params).catch(() => null));

  const used = new Set<string>();
  const out = { ...empty };
  audience.vibes.forEach((vibe, i) => {
    const poster = (pages[i]?.results ?? []).map((r) => r.poster_path).find((p): p is string => Boolean(p) && !used.has(p!));
    if (poster) used.add(poster);
    out[vibe.value] = poster ?? null;
  });
  return out;
}
