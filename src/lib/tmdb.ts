import "server-only";

const BASE = "https://api.themoviedb.org/3";

export class TmdbNotConfigured extends Error {
  constructor() {
    super("TMDB_API_KEY is not set");
    this.name = "TmdbNotConfigured";
  }
}

export function tmdbConfigured() {
  return Boolean(process.env.TMDB_API_KEY);
}

/**
 * Calls TMDB. Accepts either a v3 API key or a v4 read access token
 * (tokens are JWTs, so they contain dots and are sent as a bearer header).
 */
async function tmdb<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
  revalidate = 60 * 60,
): Promise<T> {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new TmdbNotConfigured();

  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const isV4Token = key.split(".").length === 3;
  if (!isV4Token) url.searchParams.set("api_key", key);

  const res = await fetch(url, {
    headers: isV4Token ? { Authorization: `Bearer ${key}` } : {},
    next: { revalidate },
  });

  if (!res.ok) {
    throw new Error(`TMDB ${res.status} for ${path}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

// Re-exported for server callers; client components must import it from
// "@/lib/images" directly, since this module is server-only.
export { img } from "./images";

export type MediaType = "movie" | "tv";

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
};

export type NormalisedItem = {
  id: number;
  mediaType: MediaType;
  title: string;
  poster: string | null;
  backdrop: string | null;
  score: number;
  year: string | null;
  overview: string;
  /**
   * TMDB's genre ids, as the list endpoints return them. Optional because the
   * detail endpoints return named genres instead and several callers build one
   * of these by hand from a database row; only "what to watch" reads it, and
   * only to judge how well a title matches the mood that was asked for.
   */
  genreIds?: number[];
};

export function normalise(item: TmdbListItem, fallbackType?: MediaType): NormalisedItem | null {
  const mediaType = (item.media_type === "movie" || item.media_type === "tv"
    ? item.media_type
    : fallbackType) as MediaType | undefined;
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

type Paged<T> = { page: number; results: T[]; total_pages: number; total_results: number };

export async function trending(mediaType: "all" | MediaType, window: "day" | "week" = "week") {
  const data = await tmdb<Paged<TmdbListItem>>(`/trending/${mediaType}/${window}`, {}, 60 * 30);
  return data.results
    .map((r) => normalise(r, mediaType === "all" ? undefined : mediaType))
    .filter((r): r is NormalisedItem => r !== null);
}

export async function popular(mediaType: MediaType, page = 1) {
  const data = await tmdb<Paged<TmdbListItem>>(`/${mediaType}/popular`, { page });
  return data.results
    .map((r) => normalise(r, mediaType))
    .filter((r): r is NormalisedItem => r !== null);
}

export async function topRated(mediaType: MediaType, page = 1) {
  const data = await tmdb<Paged<TmdbListItem>>(`/${mediaType}/top_rated`, { page });
  return data.results
    .map((r) => normalise(r, mediaType))
    .filter((r): r is NormalisedItem => r !== null);
}

export async function searchMulti(query: string, page = 1) {
  const data = await tmdb<Paged<TmdbListItem>>("/search/multi", { query, page }, 60 * 5);
  return data.results
    .filter((r) => r.media_type === "movie" || r.media_type === "tv")
    .map((r) => normalise(r))
    .filter((r): r is NormalisedItem => r !== null);
}

export type PagedItems = {
  items: NormalisedItem[];
  page: number;
  totalPages: number;
  totalResults: number;
};

/** Generic paged list fetch, used by the discover category pages. */
export async function catalogue(
  path: string,
  fallbackType: MediaType | undefined,
  page = 1,
): Promise<PagedItems> {
  const data = await tmdb<Paged<TmdbListItem>>(path, { page }, 60 * 30);
  return {
    items: data.results
      .map((r) => normalise(r, fallbackType))
      .filter((r): r is NormalisedItem => r !== null),
    page: data.page,
    // TMDB refuses pages beyond 500.
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results,
  };
}

export async function searchPaged(query: string, page = 1): Promise<PagedItems> {
  const data = await tmdb<Paged<TmdbListItem>>("/search/multi", { query, page }, 60 * 5);
  return {
    items: data.results
      .filter((r) => r.media_type === "movie" || r.media_type === "tv")
      .map((r) => normalise(r))
      .filter((r): r is NormalisedItem => r !== null),
    page: data.page,
    totalPages: Math.min(data.total_pages, 500),
    totalResults: data.total_results,
  };
}

export type CastSearchResult = {
  id: number;
  name: string;
  profile: string | null;
  /** "Acting", "Directing" … as TMDB files them. */
  department: string | null;
  /** The two things they are best known for, for telling namesakes apart. */
  knownFor: string;
};

/**
 * People on TMDB — actors, directors, the rest of the crew.
 *
 * A separate call rather than reading them out of `/search/multi`, which does
 * return people but ranks them against titles and carries none of the detail
 * that makes one Chris Evans distinguishable from another. Cached for five
 * minutes, matching the other searches.
 */
export async function searchCast(query: string, take = 4): Promise<CastSearchResult[]> {
  type Raw = {
    id: number;
    name: string;
    profile_path: string | null;
    known_for_department?: string;
    known_for?: TmdbListItem[];
  };

  const data = await tmdb<Paged<Raw>>("/search/person", { query }, 60 * 5);

  return data.results.slice(0, take).map((person) => ({
    id: person.id,
    name: person.name,
    profile: person.profile_path ?? null,
    department: person.known_for_department ?? null,
    knownFor: (person.known_for ?? [])
      .map((item) => item.title || item.name)
      .filter((title): title is string => Boolean(title))
      .slice(0, 2)
      .join(" · "),
  }));
}

export type Credits = {
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
};

export type Review = {
  id: string;
  author: string;
  content: string;
  created_at: string;
  author_details: { rating: number | null; avatar_path: string | null };
};

export type MovieDetail = {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  runtime: number | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  tagline: string;
  status: string;
  genres: { id: number; name: string }[];
  /** The franchise this film is part of, when TMDB files it under one. */
  belongs_to_collection: { id: number; name: string } | null;
  credits: Credits;
  reviews: Paged<Review>;
  recommendations: Paged<TmdbListItem>;
};

export type TvDetail = {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  last_air_date: string | null;
  vote_average: number;
  vote_count: number;
  tagline: string;
  status: string;
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  last_episode_to_air: { season_number: number; episode_number: number } | null;
  next_episode_to_air: { season_number: number; episode_number: number; air_date: string } | null;
  genres: { id: number; name: string }[];
  seasons: {
    id: number;
    season_number: number;
    name: string;
    episode_count: number;
    poster_path: string | null;
    air_date: string | null;
    /** TMDB's audience average for the season, 0–10. Zero where nobody voted. */
    vote_average?: number;
  }[];
  credits: Credits;
  reviews: Paged<Review>;
  recommendations: Paged<TmdbListItem>;
};

/**
 * Audience score for a single title, used to backfill rows logged before the
 * score was stored. Cached for a day — these barely move.
 */
export async function getScore(mediaType: MediaType, id: number): Promise<number | null> {
  try {
    const data = await tmdb<{ vote_average?: number }>(
      `/${mediaType}/${id}`,
      {},
      60 * 60 * 24,
    );
    return data.vote_average ? Math.round(data.vote_average * 10) : null;
  } catch {
    return null;
  }
}

export type Video = {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at?: string;
};

export type Videos = { results: Video[] };

/**
 * The trailer worth linking to: an official YouTube trailer if there is one,
 * then any trailer, then a teaser. TMDB's list is unordered and full of clips,
 * featurettes and behind-the-scenes reels, which are not what anyone means.
 */
export function pickTrailer(videos: Videos | undefined): Video | null {
  const youtube = (videos?.results ?? []).filter((v) => v.site === "YouTube" && v.key);

  return (
    youtube.find((v) => v.type === "Trailer" && v.official) ??
    youtube.find((v) => v.type === "Trailer") ??
    youtube.find((v) => v.type === "Teaser") ??
    null
  );
}

export type TmdbImage = {
  file_path: string;
  /** `null` means the artwork carries no lettering in any language. */
  iso_639_1: string | null;
  vote_average: number;
  width: number;
  height: number;
  aspect_ratio: number;
};

type Appended = {
  external_ids?: { imdb_id?: string | null };
  videos?: Videos;
  images?: { posters?: TmdbImage[]; backdrops?: TmdbImage[]; logos?: TmdbImage[] };
};

/** A title treatment: the film's own lettering, ready to stand in for the `h1`. */
export type TitleLogo = { path: string; ratio: number };

/**
 * The film's own title treatment, when TMDB has one.
 *
 * Coverage is good for anything well known and patchy below that, so every
 * caller has to be ready for `null` and fall back to type — this is the reason
 * the heading stays in the markup either way rather than being replaced.
 *
 * English lettering is preferred over the no-language entries: a logo filed
 * under no language is usually the wordless symbol (the Batman bat, the Star
 * Trek delta), which reads as decoration rather than as the title. Among the
 * candidates, PNG wins over SVG — the SVGs in TMDB's library are inconsistently
 * cropped, and some carry their own padding, which throws the alignment out.
 */
export function pickLogo(images: Appended["images"]): TitleLogo | null {
  const ranked = (images?.logos ?? [])
    .filter((image) => image.aspect_ratio > 0)
    .sort((a, b) => {
      const language = score(b) - score(a);
      if (language !== 0) return language;
      return b.vote_average - a.vote_average;
    });

  const best = ranked[0];
  return best ? { path: best.file_path, ratio: best.aspect_ratio } : null;

  function score(image: TmdbImage) {
    const png = image.file_path.toLowerCase().endsWith(".svg") ? 0 : 1;
    return (image.iso_639_1 === "en" ? 2 : 0) + png;
  }
}

/**
 * `include_image_language` is what makes the extra artwork show up at all —
 * without it TMDB returns only the images tagged for the request language.
 * `en` brings back the English title treatments the hero prefers, and `null`
 * the wordless ones it falls back to.
 */
const DETAIL_PARAMS = {
  append_to_response: "credits,reviews,recommendations,external_ids,videos,images",
  include_image_language: "null,en",
};

export function getMovie(id: number) {
  return tmdb<MovieDetail & Appended>(`/movie/${id}`, DETAIL_PARAMS);
}

export function getTv(id: number) {
  return tmdb<TvDetail & Appended>(`/tv/${id}`, DETAIL_PARAMS);
}

/** Recommendations for a single title, used to build the "you may like" feed. */
export async function getRecommendations(mediaType: MediaType, id: number) {
  const data = await tmdb<Paged<TmdbListItem>>(
    `/${mediaType}/${id}/recommendations`,
    {},
    60 * 60 * 6,
  );
  return data.results
    .map((r) => normalise(r, mediaType))
    .filter((r): r is NormalisedItem => r !== null);
}

/**
 * How many episodes have actually been released. TMDB's `number_of_episodes`
 * counts everything ordered, including episodes that have not aired, which
 * makes progress read as though you are behind when you are up to date.
 */
export function countAiredEpisodes(show: TvDetail) {
  const seasons = show.seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const last = show.last_episode_to_air;
  if (!last) return 0;

  let total = 0;
  for (const season of seasons) {
    if (season.season_number < last.season_number) {
      total += season.episode_count;
    } else if (season.season_number === last.season_number) {
      total += Math.min(last.episode_number, season.episode_count);
    }
  }
  return total;
}

export type Episode = {
  id: number;
  name: string;
  overview: string;
  episode_number: number;
  season_number: number;
  runtime: number | null;
  still_path: string | null;
  air_date: string | null;
  vote_average: number;
};

/**
 * Wide artwork for one thing, and nothing else.
 *
 * A still for an episode, a backdrop for a film — whichever the caller has. Both
 * are deliberately lean: no `append_to_response`, and cached for a week, because
 * a feed asks for a dozen of these at once and neither answer ever changes after
 * release. `getMovie` would drag credits, reviews and recommendations along for
 * one string.
 */
export async function getEpisodeStill(
  showId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<string | null> {
  const data = await tmdb<{ still_path?: string | null }>(
    `/tv/${showId}/season/${seasonNumber}/episode/${episodeNumber}`,
    {},
    60 * 60 * 24 * 7,
  ).catch(() => null);

  return data?.still_path ?? null;
}

export async function getBackdrop(
  mediaType: MediaType,
  id: number,
): Promise<string | null> {
  const data = await tmdb<{ backdrop_path?: string | null }>(
    `/${mediaType}/${id}`,
    {},
    60 * 60 * 24 * 7,
  ).catch(() => null);

  return data?.backdrop_path ?? null;
}

export type Person = {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  known_for_department: string;
  profile_path: string | null;
  combined_credits: {
    cast: (TmdbListItem & { character?: string; episode_count?: number; popularity?: number })[];
  };
};

export function getPerson(id: number) {
  return tmdb<Person>(`/person/${id}`, { append_to_response: "combined_credits" });
}

export function getEpisode(tvId: number, seasonNumber: number, episodeNumber: number) {
  return tmdb<Episode & { crew: { id: number; name: string; job: string }[] }>(
    `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
  );
}

export type EpisodePerson = {
  id: number;
  name: string;
  character: string;
  profile: string | null;
};

export type EpisodeDetail = {
  episodeNumber: number;
  seasonNumber: number;
  name: string;
  overview: string;
  runtime: number | null;
  airDate: string | null;
  still: string | null;
  score: number;
  votes: number;
  /** Series regulars in this episode, then whoever guest starred in it. */
  cast: EpisodePerson[];
  guests: EpisodePerson[];
  directors: string[];
  writers: string[];
};

/**
 * One episode, with who was in it.
 *
 * `credits` is appended rather than taken from the endpoint's own `guest_stars`
 * alone: that field holds only the people brought in for this episode, and a
 * cast list that omits the series regulars is a strange thing to show. Both are
 * returned separately so the dialog can say which is which.
 */
export async function getEpisodeDetail(
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
): Promise<EpisodeDetail | null> {
  type Raw = Episode & {
    vote_count?: number;
    crew?: { id: number; name: string; job: string }[];
    guest_stars?: { id: number; name: string; character: string; profile_path: string | null }[];
    credits?: {
      cast?: { id: number; name: string; character: string; profile_path: string | null }[];
      guest_stars?: { id: number; name: string; character: string; profile_path: string | null }[];
      crew?: { id: number; name: string; job: string }[];
    };
  };

  const data = await tmdb<Raw>(
    `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
    { append_to_response: "credits" },
    60 * 60 * 24,
  ).catch(() => null);

  if (!data) return null;

  const person = (p: {
    id: number;
    name: string;
    character: string;
    profile_path: string | null;
  }): EpisodePerson => ({
    id: p.id,
    name: p.name,
    character: p.character,
    profile: p.profile_path,
  });

  const crew = data.credits?.crew ?? data.crew ?? [];

  return {
    episodeNumber: data.episode_number,
    seasonNumber: data.season_number,
    name: data.name,
    overview: data.overview,
    runtime: data.runtime,
    airDate: data.air_date,
    still: data.still_path,
    score: Math.round((data.vote_average ?? 0) * 10),
    votes: data.vote_count ?? 0,
    cast: (data.credits?.cast ?? []).slice(0, 12).map(person),
    guests: (data.credits?.guest_stars ?? data.guest_stars ?? []).slice(0, 12).map(person),
    directors: crew.filter((c) => c.job === "Director").map((c) => c.name),
    writers: crew
      .filter((c) => c.job === "Writer" || c.job === "Screenplay" || c.job === "Story")
      .map((c) => c.name),
  };
}

export type WatchProvider = { provider_id: number; provider_name: string; logo_path: string };

export type WatchOffers = {
  /** Where TMDB's data says these offers apply, e.g. "NL". */
  region: string;
  /** Deep link into JustWatch for the full, always-current listing. */
  link: string | null;
  stream: WatchProvider[];
  rent: WatchProvider[];
  buy: WatchProvider[];
  free: WatchProvider[];
};

/**
 * Where a title can legally be watched, from TMDB's JustWatch feed.
 *
 * The data is per country, and TMDB's terms require linking back to JustWatch
 * rather than presenting the listing as ours. Cached for six hours — catalogues
 * move, but not by the minute.
 */
export async function getWatchProviders(
  mediaType: MediaType,
  id: number,
  region: string,
): Promise<WatchOffers | null> {
  type Offers = {
    link?: string;
    flatrate?: WatchProvider[];
    rent?: WatchProvider[];
    buy?: WatchProvider[];
    free?: WatchProvider[];
    ads?: WatchProvider[];
  };

  const data = await tmdb<{ results?: Record<string, Offers> }>(
    `/${mediaType}/${id}/watch/providers`,
    {},
    60 * 60 * 6,
  ).catch(() => null);

  const offers = data?.results?.[region];
  if (!offers) return null;

  return {
    region,
    link: offers.link ?? null,
    stream: offers.flatrate ?? [],
    rent: offers.rent ?? [],
    buy: offers.buy ?? [],
    // TMDB splits genuinely free from ad-supported; for a viewer they are the
    // same answer — you can watch it without paying.
    free: [...(offers.free ?? []), ...(offers.ads ?? [])],
  };
}

/**
 * Just the length, without the credits/reviews/videos payload the full detail
 * calls drag along — this runs once per watchlist row.
 *
 * For a show it is the length of one episode, since "how long is this?" for
 * something you have not started is really "have I got an evening for it?".
 */
export async function getRuntime(mediaType: MediaType, id: number): Promise<number | null> {
  const data = await tmdb<{
    runtime?: number | null;
    episode_run_time?: number[];
    last_episode_to_air?: { runtime?: number | null } | null;
    next_episode_to_air?: { runtime?: number | null } | null;
  }>(`/${mediaType}/${id}`, {}, 60 * 60 * 24 * 7).catch(() => null);

  if (mediaType === "movie") {
    return data?.runtime && data.runtime > 0 ? data.runtime : null;
  }

  // `episode_run_time` is the obvious field and increasingly an empty array:
  // TMDB has been retiring it, and a lot of shows now carry the length on the
  // episodes instead. Falling back to an actual episode is what stops a show
  // showing no length at all while its neighbours show one.
  const candidates = [
    data?.episode_run_time?.[0],
    data?.last_episode_to_air?.runtime,
    data?.next_episode_to_air?.runtime,
  ];

  return candidates.find((minutes) => typeof minutes === "number" && minutes > 0) ?? null;
}

/**
 * The handful of facts the achievements need — genre, language, age, franchise
 * — without the credits, reviews and video payloads the full detail calls drag
 * along. Hundreds of titles get asked about at once, so the difference matters.
 * Cached for a week: none of this changes after release.
 */
export type TitleFacts = {
  title: string;
  genres: string[];
  originalLanguage: string | null;
  releaseDate: string | null;
  runtime: number | null;
  collection: { id: number; name: string } | null;
};

export async function getTitleFacts(
  mediaType: MediaType,
  id: number,
): Promise<TitleFacts | null> {
  type Lean = {
    title?: string;
    name?: string;
    genres?: { id: number; name: string }[];
    original_language?: string;
    release_date?: string;
    first_air_date?: string;
    runtime?: number | null;
    episode_run_time?: number[];
    belongs_to_collection?: { id: number; name: string } | null;
  };

  const data = await tmdb<Lean>(`/${mediaType}/${id}`, {}, 60 * 60 * 24 * 7).catch(() => null);
  if (!data) return null;

  const runtime = mediaType === "movie" ? data.runtime : data.episode_run_time?.[0];

  return {
    title: data.title || data.name || "Untitled",
    genres: (data.genres ?? []).map((g) => g.name),
    originalLanguage: data.original_language ?? null,
    releaseDate: data.release_date || data.first_air_date || null,
    runtime: runtime && runtime > 0 ? runtime : null,
    collection: data.belongs_to_collection ?? null,
  };
}

export type CollectionParts = {
  id: number;
  name: string;
  parts: { id: number; title: string; releaseDate: string | null }[];
};

/**
 * Every film in a franchise. Used to answer "have I seen all of them?", so
 * unreleased entries are dropped — an announced sequel should not make a
 * finished collection read as incomplete.
 */
export async function getCollection(id: number): Promise<CollectionParts | null> {
  type Raw = {
    id: number;
    name: string;
    parts?: { id: number; title?: string; name?: string; release_date?: string }[];
  };

  const data = await tmdb<Raw>(`/collection/${id}`, {}, 60 * 60 * 24).catch(() => null);
  if (!data) return null;

  const today = new Date().toISOString().slice(0, 10);

  return {
    id: data.id,
    name: data.name,
    parts: (data.parts ?? [])
      .filter((p) => p.release_date && p.release_date <= today)
      .map((p) => ({
        id: p.id,
        title: p.title || p.name || "Untitled",
        releaseDate: p.release_date ?? null,
      })),
  };
}

export function getSeason(tvId: number, seasonNumber: number) {
  return tmdb<{ id: number; name: string; episodes: Episode[] }>(
    `/tv/${tvId}/season/${seasonNumber}`,
  );
}
