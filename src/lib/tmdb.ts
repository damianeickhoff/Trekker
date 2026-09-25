import "server-only";
import { db } from "./db";
import { gate } from "./gates";

/**
 * TMDB, read through a cache table on the data volume.
 *
 * The database is the cache. There is deliberately no `next: { revalidate }`
 * here: Next's fetch cache lives in `.next/cache`, which dies with the
 * container, and it would sit in front of this one answering from a copy the
 * table knows nothing about. Every response is stored in `TmdbCache` with a
 * lifetime for its kind of endpoint, served from there until it expires, and
 * served stale when TMDB cannot be reached.
 *
 * Only background jobs, the one title being opened, and the two searches a
 * person asks for by typing (the smart list editor and a list's Add titles)
 * should reach the network through this. Pages that list things read rows,
 * never this module.
 */

const BASE = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 10_000;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * How long each kind of answer is good for. Details and people barely move;
 * a season gains air dates and names as it runs; trending and search are
 * wanted fresh. Discover backs genre pages and smart lists, which rebuild
 * daily anyway, and providers are what the daily availability pass reads.
 */
export const LIFETIMES = {
  details: 7 * DAY,
  season: DAY,
  trending: HOUR,
  search: HOUR,
  person: 7 * DAY,
  images: 30 * DAY,
  discover: 12 * HOUR,
  providers: DAY,
} as const;

export type CacheKind = keyof typeof LIFETIMES;

export class TmdbNotConfigured extends Error {
  constructor() {
    super("TMDB_API_KEY is not set");
    this.name = "TmdbNotConfigured";
  }
}

export class TmdbError extends Error {
  constructor(
    readonly status: number,
    path: string,
  ) {
    super(`TMDB ${status} for ${path}`);
    this.name = "TmdbError";
  }
}

export function tmdbConfigured() {
  return Boolean(process.env.TMDB_API_KEY?.trim());
}

type Params = Record<string, string | number | undefined>;

/**
 * The path and its parameters in a fixed order, so one question asked with
 * its parameters shuffled is one row. The credential is never part of it.
 */
export function cacheKey(path: string, params: Params = {}): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `${path}?${pairs.join("&")}` : path;
}

/**
 * Two callers asking for the same key while it is on its way share one
 * request. React's fetch dedupe skips fetches that carry their own abort
 * signal, and never applied across requests or to background jobs anyway.
 */
const inFlight = new Map<string, Promise<string>>();

async function fetchText(path: string, params: Params): Promise<string> {
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) throw new TmdbNotConfigured();

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }
  // A v4 read token is a JWT and goes in a header; a v3 key goes in the query.
  const bearer = key.split(".").length === 3;
  if (!bearer) url.searchParams.set("api_key", key);

  await gate.take("tmdb");
  const res = await fetch(url, {
    headers: bearer ? { Authorization: `Bearer ${key}` } : {},
    cache: "no-store",
    // A socket that opens and then says nothing has no timeout of its own.
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new TmdbError(res.status, path);
  return res.text();
}

export type ReadOptions = {
  /** Skip a fresh cache entry and ask TMDB. The refresh job uses this. */
  force?: boolean;
};

/**
 * One TMDB answer: from the cache when fresh, otherwise from the network and
 * then stored. When the network fails, a stale entry is returned rather than
 * the error; only a miss with nothing cached at all throws.
 */
export async function tmdbGet<T>(
  kind: CacheKind,
  path: string,
  params: Params = {},
  options: ReadOptions = {},
): Promise<T> {
  const key = cacheKey(path, params);
  const cached = await db.tmdbCache.findUnique({ where: { key } });
  if (cached && !options.force && cached.expiresAt.getTime() > Date.now()) {
    return JSON.parse(cached.body) as T;
  }

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchText(path, params).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }

  let body: string;
  try {
    body = await pending;
  } catch (error) {
    if (cached) return JSON.parse(cached.body) as T;
    throw error;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + LIFETIMES[kind]);
  await db.tmdbCache.upsert({
    where: { key },
    create: { key, body, fetchedAt: now, expiresAt },
    update: { body, fetchedAt: now, expiresAt },
  });
  return JSON.parse(body) as T;
}

/**
 * Whatever the cache holds for this question, fresh or not, and never the
 * network. For code that must not wait on TMDB: `title-state` works out a
 * show's episode list from here after the job has fetched it.
 */
export async function tmdbPeek<T>(path: string, params: Params = {}): Promise<T | null> {
  const row = await db.tmdbCache.findUnique({ where: { key: cacheKey(path, params) } });
  return row ? (JSON.parse(row.body) as T) : null;
}

// ---------------------------------------------------------------------------
// Types

export type MediaType = "movie" | "tv";

type Paged<T> = { page: number; results: T[]; total_pages: number; total_results: number };

export type TmdbListItem = {
  id: number;
  media_type?: MediaType | "person";
  title?: string;
  name?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  genre_ids?: number[];
  popularity?: number;
};

export type ListItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  /** TMDB's audience average as a percentage, the way posters show it. */
  score: number;
  year: string | null;
  overview: string;
  genreIds: number[];
};

export function normalise(item: TmdbListItem, fallback?: MediaType): ListItem | null {
  const mediaType = item.media_type === "movie" || item.media_type === "tv" ? item.media_type : fallback;
  if (!mediaType) return null;
  const date = item.release_date || item.first_air_date || "";
  return {
    id: item.id,
    mediaType,
    title: item.title || item.name || "Untitled",
    poster: item.poster_path ?? null,
    backdrop: item.backdrop_path ?? null,
    score: Math.round((item.vote_average ?? 0) * 10),
    year: date ? date.slice(0, 4) : null,
    overview: item.overview ?? "",
    genreIds: item.genre_ids ?? [],
  };
}

function normaliseAll(items: TmdbListItem[], fallback?: MediaType): ListItem[] {
  return items.map((i) => normalise(i, fallback)).filter((i): i is ListItem => i !== null);
}

export type CastMember = { id: number; name: string; character: string; profile_path: string | null; order?: number };

export type CrewMember = { id: number; name: string; job: string; department: string; profile_path: string | null };

type Common = {
  id: number;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average: number;
  vote_count: number;
  tagline: string;
  status: string;
  genres: { id: number; name: string }[];
  original_language?: string;
  credits?: { cast: CastMember[]; crew?: CrewMember[] };
  videos?: { results: { key: string; site: string; type: string; official: boolean; name: string }[] };
  external_ids?: { imdb_id?: string | null };
  recommendations?: Paged<TmdbListItem>;
};

export type MovieDetails = Common & {
  title: string;
  runtime: number | null;
  release_date: string;
  belongs_to_collection: { id: number; name: string } | null;
};

export type EpisodeRef = {
  season_number: number;
  episode_number: number;
  air_date: string | null;
  name?: string;
  runtime?: number | null;
};

export type TvDetails = Common & {
  name: string;
  first_air_date: string;
  last_air_date: string | null;
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  last_episode_to_air: EpisodeRef | null;
  next_episode_to_air: EpisodeRef | null;
  networks?: { id: number; name: string }[];
  created_by?: { id: number; name: string; profile_path: string | null }[];
  seasons: {
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster_path: string | null;
    air_date: string | null;
  }[];
};

export type Episode = {
  id: number;
  name: string;
  overview: string;
  season_number: number;
  episode_number: number;
  runtime: number | null;
  still_path: string | null;
  air_date: string | null;
  vote_average: number;
  episode_type?: string | null;
  /** Present on a season's episodes, and on an episode read on its own. */
  guest_stars?: CastMember[];
  crew?: CrewMember[];
};

/** One episode on its own, with the regulars who appear in it. */
export type EpisodeDetails = Episode & {
  credits?: { cast: CastMember[]; guest_stars: CastMember[]; crew: CrewMember[] };
};

/** A show's whole cast and crew across every season, with episode counts. */
export type AggregateCredits = {
  cast: {
    id: number;
    name: string;
    profile_path: string | null;
    roles: { character: string; episode_count: number }[];
    total_episode_count: number;
  }[];
  crew: {
    id: number;
    name: string;
    profile_path: string | null;
    department: string;
    jobs: { job: string; episode_count: number }[];
    total_episode_count: number;
  }[];
};

export type Season = { id: number; name: string; season_number: number; episodes: Episode[] };

export type TmdbImage = {
  file_path: string;
  iso_639_1: string | null;
  vote_average: number;
  aspect_ratio: number;
};

export type Images = { logos?: TmdbImage[]; backdrops?: TmdbImage[]; posters?: TmdbImage[] };

export type TitleLogo = { path: string; ratio: number };

export type PersonDetails = {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_path: string | null;
  combined_credits?: { cast: PersonCredit[]; crew?: PersonCrewCredit[] };
};

export type PersonCredit = TmdbListItem & { character?: string; episode_count?: number };
export type PersonCrewCredit = TmdbListItem & { job?: string; department?: string };

export type ProviderOffer = { provider_id: number; provider_name: string; logo_path: string };

export type RegionOffers = {
  link?: string;
  flatrate?: ProviderOffer[];
  rent?: ProviderOffer[];
  buy?: ProviderOffer[];
  free?: ProviderOffer[];
  ads?: ProviderOffer[];
};

export type ProvidersAnswer = { results?: Record<string, RegionOffers> };

/** TMDB's release types: 2 limited cinema, 3 cinema, 4 digital, among others. */
export type ReleaseDatesAnswer = {
  results?: { iso_3166_1: string; release_dates: { release_date: string; type: number }[] }[];
};

// ---------------------------------------------------------------------------
// Endpoints

/**
 * What a title page needs in one request. Reviews are left out: they were most
 * of the previous app's 400 KB detail payloads for one rail of one page.
 * Images are their own request with a longer lifetime.
 */
const DETAIL_APPEND = "credits,videos,external_ids,recommendations";

/** Exposed so `title-state` can peek at exactly the key the job wrote. */
export function tvDetailsKey(id: number) {
  return { path: `/tv/${id}`, params: { append_to_response: DETAIL_APPEND } };
}

export function seasonKey(tvId: number, season: number) {
  return { path: `/tv/${tvId}/season/${season}`, params: {} };
}

export function getTvDetails(id: number, options?: ReadOptions) {
  const { path, params } = tvDetailsKey(id);
  return tmdbGet<TvDetails>("details", path, params, options);
}

export function getMovieDetails(id: number, options?: ReadOptions) {
  return tmdbGet<MovieDetails>("details", `/movie/${id}`, { append_to_response: DETAIL_APPEND }, options);
}

export function getSeason(tvId: number, season: number, options?: ReadOptions) {
  const { path, params } = seasonKey(tvId, season);
  return tmdbGet<Season>("season", path, params, options);
}

/**
 * One episode with its credits: the regulars who are in it and its guest
 * stars. Kept like a season, since both move while a show is airing.
 */
export function getEpisode(tvId: number, season: number, episode: number, options?: ReadOptions) {
  return tmdbGet<EpisodeDetails>(
    "season",
    `/tv/${tvId}/season/${season}/episode/${episode}`,
    { append_to_response: "credits" },
    options,
  );
}

/** Everyone who was ever in a show, with how many episodes each. The cast page reads this. */
export function getAggregateCredits(tvId: number, options?: ReadOptions) {
  return tmdbGet<AggregateCredits>("details", `/tv/${tvId}/aggregate_credits`, {}, options);
}

/**
 * Artwork, title treatments included. `include_image_language` is what makes
 * TMDB return logos at all: `en` for lettered ones, `null` for the wordless.
 */
export function getImages(mediaType: MediaType, id: number, options?: ReadOptions) {
  return tmdbGet<Images>("images", `/${mediaType}/${id}/images`, { include_image_language: "en,null" }, options);
}

/**
 * The title's own lettering, when TMDB has one. English lettering beats the
 * no-language symbol, which reads as decoration rather than as the title; PNG
 * beats SVG, because TMDB's SVGs are inconsistently cropped.
 */
export function pickLogo(images: Images | null | undefined): TitleLogo | null {
  const rank = (i: TmdbImage) =>
    (i.iso_639_1 === "en" ? 2 : 0) + (i.file_path.toLowerCase().endsWith(".svg") ? 0 : 1);
  const best = (images?.logos ?? [])
    .filter((i) => i.aspect_ratio > 0)
    .sort((a, b) => rank(b) - rank(a) || b.vote_average - a.vote_average)[0];
  return best ? { path: best.file_path, ratio: best.aspect_ratio } : null;
}

/** Details and the title treatment together, for a title page's hero. */
export async function getDetailsWithLogo(mediaType: MediaType, id: number) {
  const [details, images] = await Promise.all([
    mediaType === "tv" ? getTvDetails(id) : getMovieDetails(id),
    getImages(mediaType, id).catch(() => null),
  ]);
  return { details, logo: pickLogo(images) };
}

export async function getTrending(mediaType: "all" | MediaType, window: "day" | "week" = "week") {
  const data = await tmdbGet<Paged<TmdbListItem>>("trending", `/trending/${mediaType}/${window}`);
  return normaliseAll(data.results, mediaType === "all" ? undefined : mediaType);
}

export async function searchMulti(query: string, page = 1) {
  const data = await tmdbGet<Paged<TmdbListItem>>("search", "/search/multi", { query: query.trim(), page });
  return {
    items: normaliseAll(data.results.filter((r) => r.media_type === "movie" || r.media_type === "tv")),
    page: data.page,
    totalPages: Math.min(data.total_pages, 500),
  };
}

/** People by name, for a smart list's People section. Actors and directors, most known first. */
export async function searchPeople(query: string) {
  const data = await tmdbGet<Paged<{ id: number; name: string; profile_path: string | null; known_for_department?: string; popularity?: number }>>(
    "search",
    "/search/person",
    { query: query.trim() },
  );
  return data.results
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
    .map((p) => ({ id: p.id, name: p.name, profilePath: p.profile_path, department: p.known_for_department ?? null }));
}

export async function discover(mediaType: MediaType, params: Params = {}) {
  const data = await tmdbGet<Paged<TmdbListItem>>("discover", `/discover/${mediaType}`, params);
  return {
    items: normaliseAll(data.results, mediaType),
    page: data.page,
    // TMDB refuses pages past 500.
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results ?? 0,
  };
}

/** Every region's offers in one answer; `offersFor` picks one region. */
export function getWatchProviders(mediaType: MediaType, id: number, options?: ReadOptions) {
  return tmdbGet<ProvidersAnswer>("providers", `/${mediaType}/${id}/watch/providers`, {}, options);
}

/**
 * One region's offers. Free and ad-supported are one answer to a viewer: it
 * can be watched without paying.
 */
export function offersFor(all: ProvidersAnswer | null, region: string) {
  const offers = all?.results?.[region];
  if (!offers) return null;
  return {
    link: offers.link ?? null,
    stream: offers.flatrate ?? [],
    rent: offers.rent ?? [],
    buy: offers.buy ?? [],
    free: [...(offers.free ?? []), ...(offers.ads ?? [])],
  };
}

/** Every country's release dates for a film. Settled facts; kept like details. */
export function getReleaseDates(id: number, options?: ReadOptions) {
  return tmdbGet<ReleaseDatesAnswer>("details", `/movie/${id}/release_dates`, {}, options);
}

/**
 * When a film reaches cinemas and streaming in one region, as YYYY-MM-DD.
 *
 * The cinema date is the earliest wide release there, then a limited one, then
 * the film's own primary date, which is what TMDB shows everywhere and is
 * usually the home market's opening. There is no such fallback for streaming:
 * an unknown digital date is left unknown rather than guessed.
 */
export function releaseDatesFor(
  answer: ReleaseDatesAnswer | null,
  region: string,
  primary: string | null | undefined,
): { releaseDate: string | null; streamingDate: string | null } {
  const dates = answer?.results?.find((r) => r.iso_3166_1 === region)?.release_dates ?? [];
  const earliest = (...types: number[]) =>
    dates
      .filter((d) => types.includes(d.type) && d.release_date)
      .map((d) => d.release_date.slice(0, 10))
      .sort()[0] ?? null;
  return {
    releaseDate: earliest(3) ?? earliest(2) ?? (primary || null),
    streamingDate: earliest(4),
  };
}

/**
 * A person, and their `Person` row: the cast rail and the actor page read
 * that row, and the actor hero uses the backdrop of what they are best known for.
 */
export async function getPerson(id: number, options?: ReadOptions) {
  const person = await tmdbGet<PersonDetails>(
    "person",
    `/person/${id}`,
    { append_to_response: "combined_credits" },
    options,
  );

  const weight = (c: PersonCredit) => (c.popularity ?? 0) + (c.episode_count ?? 0);
  const known = (person.combined_credits?.cast ?? [])
    .filter((c) => c.backdrop_path && (c.media_type === "movie" || c.media_type === "tv"))
    // Popularity with a nudge for long runs, so a lead in a long show outranks
    // a one-episode cameo in something briefly famous.
    .sort((a, b) => weight(b) - weight(a))[0];

  const row = {
    name: person.name,
    profilePath: person.profile_path,
    knownForMediaType: known?.media_type ?? null,
    knownForTitleId: known?.id ?? null,
    knownForBackdrop: known?.backdrop_path ?? null,
    bio: person.biography || null,
    fetchedAt: new Date(),
  };
  await db.person.upsert({ where: { tmdbId: id }, create: { tmdbId: id, ...row }, update: row });
  return person;
}

/**
 * Whatever the cache holds for a person, and never the network: following
 * someone from their page draws the line from the answer that page just read.
 */
export function peekPerson(id: number) {
  return tmdbPeek<PersonDetails>(`/person/${id}`, { append_to_response: "combined_credits" });
}

/** TMDB's status words, folded into the four `TitleState` understands. */
export function showStatus(status: string | undefined): "returning" | "ended" | "cancelled" | "upcoming" {
  switch (status) {
    case "Ended":
      return "ended";
    case "Canceled":
    case "Cancelled":
      return "cancelled";
    case "In Production":
    case "Planned":
    case "Pilot":
      return "upcoming";
    default:
      return "returning";
  }
}

export type CollectionAnswer = {
  id: number;
  name: string;
  parts?: { id: number; title?: string; release_date?: string }[];
};

/**
 * A franchise as TMDB groups it. Kept like details: a collection gains an
 * entry a year at most. Only the badges page asks, for collections someone
 * has two films of.
 */
export function collectionKey(id: number) {
  return { path: `/collection/${id}`, params: {} };
}

export function getCollection(id: number, options?: ReadOptions) {
  return tmdbGet<CollectionAnswer>("details", `/collection/${id}`, {}, options);
}

/** The details keys a film's and a show's pages read, for peeking at facts without the network. */
export function movieDetailsKey(id: number) {
  return { path: `/movie/${id}`, params: { append_to_response: DETAIL_APPEND } };
}
