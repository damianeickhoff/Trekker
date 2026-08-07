import "server-only";
import { mapLimit } from "./concurrency";
import { GENRES, findGenre, type GenreFilter } from "./genres";
import { watchRegion } from "./region";
import type { Season } from "./seasons";
import { catalogue, tmdbConfigured, type MediaType, type PagedItems } from "./tmdb";

export type CategorySlug =
  | "trending"
  | "popular-tv"
  | "popular-movies"
  | "top-rated-tv"
  | "top-rated-movies"
  | "in-cinemas"
  | "upcoming"
  | "upcoming-tv"
  | "new-shows"
  | SeasonalSlug;

/**
 * Categories that only appear while their season is on. They are ordinary
 * categories in every other respect — each one has its own `/discover/[slug]`
 * page, and nothing stops an old link working in March.
 */
export type SeasonalSlug =
  | "scifi-films"
  | "scifi-essential"
  | "scifi-retro"
  | "scifi-animated"
  | "scifi-series"
  | "horror-fresh"
  | "horror-scariest"
  | "horror-classics"
  | "horror-funny"
  | "horror-series"
  | "holiday-films"
  | "holiday-best"
  | "holiday-family"
  | "holiday-animated"
  | "holiday-series";

type Category = {
  title: string;
  blurb: string;
  /** A function when the query depends on today's date. */
  path: string | (() => string);
  fallbackType?: MediaType;
};

export const CATEGORIES: Record<CategorySlug, Category> = {
  trending: {
    title: "Trending this week",
    blurb: "What everyone is watching right now, movies and shows together.",
    path: "/trending/all/week",
  },
  "popular-tv": {
    title: "Popular shows",
    blurb: "The shows drawing the biggest audiences at the moment.",
    path: "/tv/popular",
    fallbackType: "tv",
  },
  "popular-movies": {
    title: "Popular movies",
    blurb: "The movies drawing the biggest audiences at the moment.",
    path: "/movie/popular",
    fallbackType: "movie",
  },
  "top-rated-tv": {
    title: "Highest rated shows",
    blurb: "The best-reviewed shows of all time, by audience score.",
    path: "/tv/top_rated",
    fallbackType: "tv",
  },
  "top-rated-movies": {
    title: "Highest rated movies",
    blurb: "The best-reviewed movies of all time, by audience score.",
    path: "/movie/top_rated",
    fallbackType: "movie",
  },
  "in-cinemas": {
    title: "In cinemas now",
    blurb: "Movies currently on release.",
    path: "/movie/now_playing",
    fallbackType: "movie",
  },
  upcoming: {
    title: "Coming soon",
    blurb: "Movies with a release date still ahead of them.",
    path: "/movie/upcoming",
    fallbackType: "movie",
  },
  "upcoming-tv": {
    title: "Upcoming shows",
    blurb: "Shows that have not premiered yet, soonest first.",
    // TMDB has no "upcoming" TV list, so discover by future first-air date.
    path: () =>
      `/discover/tv?first_air_date.gte=${today()}&sort_by=popularity.desc`,
    fallbackType: "tv",
  },
  "new-shows": {
    title: "New shows",
    blurb: "Series that have premiered in the last few months.",
    // Premiered recently and actually watched by somebody: without the vote
    // floor this fills up with the hundreds of things TMDB records every week
    // that nobody has ever seen.
    path: () =>
      `/discover/tv?first_air_date.gte=${monthsAgo(4)}&first_air_date.lte=${today()}&sort_by=popularity.desc&vote_count.gte=20`,
    fallbackType: "tv",
  },

  // -- May ------------------------------------------------------------------
  "scifi-films": {
    title: "Out among the stars",
    blurb: "Science fiction, by what everyone is watching.",
    path: "/discover/movie?with_genres=878&sort_by=popularity.desc",
    fallbackType: "movie",
  },
  "scifi-essential": {
    title: "Essential science fiction",
    blurb: "The highest rated of the genre, with enough votes to mean it.",
    path: "/discover/movie?with_genres=878&sort_by=vote_average.desc&vote_count.gte=1500",
    fallbackType: "movie",
  },
  "scifi-retro": {
    title: "Retro futures",
    blurb: "How the last century imagined this one. Nothing after 1989.",
    path: "/discover/movie?with_genres=878&primary_release_date.lte=1989-12-31&sort_by=vote_average.desc&vote_count.gte=300",
    fallbackType: "movie",
  },
  "scifi-animated": {
    title: "Animated futures",
    blurb: "Science fiction that was drawn rather than filmed.",
    path: "/discover/movie?with_genres=878,16&sort_by=popularity.desc",
    fallbackType: "movie",
  },
  "scifi-series": {
    title: "Sci-fi and fantasy series",
    blurb: "Something with more than two hours in it.",
    path: "/discover/tv?with_genres=10765&sort_by=popularity.desc",
    fallbackType: "tv",
  },

  // -- October --------------------------------------------------------------
  "horror-fresh": {
    title: "Fresh nightmares",
    blurb: "Horror from the last few years.",
    // The vote floor keeps the tail of the list from filling up with things
    // nobody has seen; it does not change the head of it.
    path: "/discover/movie?with_genres=27&primary_release_date.gte=2018-01-01&sort_by=popularity.desc&vote_count.gte=100",
    fallbackType: "movie",
  },
  "horror-scariest": {
    title: "The scariest ever made",
    blurb: "The best rated horror there is, by people who sat through it.",
    path: "/discover/movie?with_genres=27&sort_by=vote_average.desc&vote_count.gte=1200",
    fallbackType: "movie",
  },
  "horror-classics": {
    title: "Before you were born",
    blurb: "The ones everything since has been copying. Nothing after 1989.",
    path: "/discover/movie?with_genres=27&primary_release_date.lte=1989-12-31&sort_by=vote_average.desc&vote_count.gte=250",
    fallbackType: "movie",
  },
  "horror-funny": {
    title: "Scared, but laughing",
    blurb: "Horror comedy, for when the room will not take the real thing.",
    path: "/discover/movie?with_genres=27,35&sort_by=popularity.desc",
    fallbackType: "movie",
  },
  "horror-series": {
    title: "Bumps in the night, weekly",
    blurb: "Horror series to work through in the dark.",
    // TMDB has no horror genre for television — the whole category lives under
    // Mystery, which is mostly police procedurals. The keyword is what actually
    // finds Stranger Things and The Walking Dead rather than CSI.
    path: "/discover/tv?with_keywords=315058&sort_by=popularity.desc&vote_count.gte=50",
    fallbackType: "tv",
  },

  // -- December -------------------------------------------------------------
  "holiday-films": {
    title: "Christmas films",
    blurb: "The ones that come out of the loft every December.",
    // Keyword alone is not enough: TMDB tags anything with a Christmas scene in
    // it, so sorting by popularity hands the row to the Harry Potter films.
    // Narrowing to comedy is what turns it back into Elf and Home Alone — the
    // sincere ones are next door under "Worth rewatching".
    path: "/discover/movie?with_keywords=207317&with_genres=35&sort_by=popularity.desc&vote_count.gte=50",
    fallbackType: "movie",
  },
  "holiday-best": {
    title: "Worth rewatching",
    blurb: "The best rated of the Christmas pile.",
    path: "/discover/movie?with_keywords=207317&sort_by=vote_average.desc&vote_count.gte=150",
    fallbackType: "movie",
  },
  "holiday-family": {
    title: "For the whole room",
    blurb: "Family films, for when there are too many ages on the sofa.",
    path: "/discover/movie?with_genres=10751&sort_by=popularity.desc",
    fallbackType: "movie",
  },
  "holiday-animated": {
    title: "Animated and cosy",
    blurb: "Drawn, warm, and rarely longer than ninety minutes.",
    path: "/discover/movie?with_genres=16,10751&sort_by=popularity.desc",
    fallbackType: "movie",
  },
  "holiday-series": {
    title: "Festive episodes",
    blurb: "Series that put a tree up.",
    path: "/discover/tv?with_keywords=207317&sort_by=popularity.desc",
    fallbackType: "tv",
  },
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** A plain `YYYY-MM-DD` some months back, for "recently" windows. */
function monthsAgo(months: number) {
  const date = new Date();
  date.setMonth(date.getMonth() - months);
  return date.toISOString().slice(0, 10);
}

/** Which collections belong to which costume, in the order they are shown. */
export const SEASON_PICKS: Record<Season, SeasonalSlug[]> = {
  scifi: [
    "scifi-films",
    "scifi-essential",
    "scifi-series",
    "scifi-retro",
    "scifi-animated",
  ],
  horror: [
    "horror-fresh",
    "horror-scariest",
    "horror-series",
    "horror-classics",
    "horror-funny",
  ],
  holiday: [
    "holiday-films",
    "holiday-best",
    "holiday-family",
    "holiday-animated",
    "holiday-series",
  ],
};

/** The heading over the seasonal band on the discover page. */
export const SEASON_BAND: Record<
  Season,
  { title: string; description: string; tone: "cool" | "warm"; leadGenre: string }
> = {
  scifi: {
    title: "Sci-Fi Month",
    description: "It is May, so the whole galaxy is on the table.",
    tone: "cool",
    leadGenre: "sci-fi",
  },
  horror: {
    title: "Horror Month",
    description: "It is October. Put the lights out and pick one.",
    tone: "warm",
    leadGenre: "horror",
  },
  holiday: {
    title: "The holidays",
    description: "December: something warm, with the tree on.",
    tone: "warm",
    leadGenre: "family",
  },
};

export type SeasonPick = {
  slug: SeasonalSlug;
  title: string;
  blurb: string;
  items: PagedItems["items"];
};

/**
 * The season's collections, narrowed to whichever medium the page is showing.
 *
 * Collections that come back empty are dropped rather than rendered as a bare
 * heading — some of these are keyword searches, and a keyword TMDB has since
 * retired should quietly cost us a row rather than leave a hole in the page.
 */
export async function fetchSeasonPicks(
  season: Season,
  filter: "all" | MediaType,
): Promise<SeasonPick[]> {
  const wanted = SEASON_PICKS[season].filter(
    (slug) => filter === "all" || CATEGORIES[slug].fallbackType === filter,
  );

  const results = await mapLimit(wanted, 4, async (slug) => {
    const data = await fetchCategory(slug).catch(() => null);
    if (!data || data.items.length === 0) return null;

    return {
      slug,
      title: CATEGORIES[slug].title,
      blurb: CATEGORIES[slug].blurb,
      items: data.items,
    } satisfies SeasonPick;
  });

  return results.filter((pick): pick is SeasonPick => pick !== null);
}

// The genre list lives in its own module so client components can read it too.
// Re-exported because everything server-side already imports it from this file,
// and there is no reason to make callers care where it moved to.
export { GENRES, findGenre, type GenreFilter };

/** Discover feed for a genre, optionally narrowed to movies or shows. */
export async function fetchGenre(
  slug: string,
  filter: GenreFilter,
  page = 1,
): Promise<PagedItems | null> {
  const genre = findGenre(slug);
  if (!genre) return null;

  const wantMovies = filter !== "tv";
  const wantTv = filter !== "movie" && genre.tvId !== null;

  const [movies, shows] = await Promise.all([
    wantMovies
      ? catalogue(`/discover/movie?with_genres=${genre.movieId}`, "movie", page).catch(
          () => null,
        )
      : null,
    wantTv
      ? catalogue(`/discover/tv?with_genres=${genre.tvId}`, "tv", page).catch(() => null)
      : null,
  ]);

  if (!movies && !shows) return null;

  // Interleave so a mixed view is not "all movies, then all shows".
  const items: PagedItems["items"] = [];
  const a = movies?.items ?? [];
  const b = shows?.items ?? [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) items.push(a[i]);
    if (b[i]) items.push(b[i]);
  }

  return {
    items,
    page,
    totalPages: Math.max(movies?.totalPages ?? 1, shows?.totalPages ?? 1),
    totalResults: (movies?.totalResults ?? 0) + (shows?.totalResults ?? 0),
  };
}

export function isCategory(slug: string): slug is CategorySlug {
  return slug in CATEGORIES;
}

/* ==========================================================================
 * Browsing by hand
 *
 * The categories above are fixed questions with fixed answers. This is the same
 * TMDB endpoint they mostly use, with the query left open — "sci-fi, the
 * seventies, on my services, well reviewed" is a question the fixed list can
 * never quite ask.
 * ======================================================================== */

export type DiscoverFilters = {
  kind: MediaType;
  /** Slug from `GENRES`, or null for no genre restriction. */
  genre: string | null;
  /** Inclusive release-year bounds. */
  fromYear: number | null;
  toYear: number | null;
  /** TMDB audience score out of 10. */
  minScore: number | null;
  maxRuntime: number | null;
  /** TMDB provider ids the results must be streaming on. */
  providers: number[];
  sort: "popularity" | "rating" | "newest";
};

export const DEFAULT_DISCOVER: DiscoverFilters = {
  kind: "movie",
  genre: null,
  fromYear: null,
  toYear: null,
  minScore: null,
  maxRuntime: null,
  providers: [],
  sort: "popularity",
};

/**
 * The vote floor that has to accompany a rating sort.
 *
 * `vote_average.desc` on its own returns a wall of titles with four votes and a
 * perfect ten. The fixed categories all carry a floor of their own for exactly
 * this reason; this is the same trick applied generically.
 */
const VOTE_FLOOR = { movie: 300, tv: 100 };

const SORTS: Record<DiscoverFilters["sort"], Record<MediaType, string>> = {
  popularity: { movie: "popularity.desc", tv: "popularity.desc" },
  rating: { movie: "vote_average.desc", tv: "vote_average.desc" },
  newest: { movie: "primary_release_date.desc", tv: "first_air_date.desc" },
};

export function buildDiscoverPath(filters: DiscoverFilters): string {
  const params = new URLSearchParams();
  const isMovie = filters.kind === "movie";

  params.set("sort_by", SORTS[filters.sort][filters.kind]);

  const genre = filters.genre ? findGenre(filters.genre) : null;
  if (genre) {
    const id = isMovie ? genre.movieId : genre.tvId;
    // A genre with no television equivalent simply does not narrow a TV search,
    // rather than returning nothing at all.
    if (id !== null) params.set("with_genres", String(id));
  }

  const dateField = isMovie ? "primary_release_date" : "first_air_date";
  if (filters.fromYear) params.set(`${dateField}.gte`, `${filters.fromYear}-01-01`);
  if (filters.toYear) params.set(`${dateField}.lte`, `${filters.toYear}-12-31`);

  if (filters.minScore) params.set("vote_average.gte", String(filters.minScore));
  if (filters.maxRuntime) params.set("with_runtime.lte", String(filters.maxRuntime));

  if (filters.sort === "rating" || filters.minScore) {
    params.set("vote_count.gte", String(VOTE_FLOOR[filters.kind]));
  }

  if (filters.providers.length > 0) {
    // `with_watch_providers` is only meaningful alongside a region, and it is
    // an OR — any one of them will do, which is what "on my services" means.
    params.set("with_watch_providers", filters.providers.join("|"));
    params.set("watch_region", watchRegion());
  }

  return `/discover/${filters.kind}?${params.toString()}`;
}

/** Reads filters back out of a URL, ignoring anything that does not parse. */
export function parseDiscoverFilters(search: Record<string, string | undefined>): DiscoverFilters {
  const year = (value: string | undefined) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 1870 && parsed <= 2100 ? parsed : null;
  };

  const score = Number(search.score);
  const runtime = Number(search.runtime);

  return {
    kind: search.kind === "tv" ? "tv" : "movie",
    genre: search.genre && findGenre(search.genre) ? search.genre : null,
    fromYear: year(search.from),
    toYear: year(search.to),
    minScore: Number.isFinite(score) && score > 0 && score <= 10 ? score : null,
    maxRuntime: Number.isFinite(runtime) && runtime > 0 ? runtime : null,
    providers: (search.providers ?? "")
      .split(",")
      .map(Number)
      .filter((id) => Number.isInteger(id) && id > 0),
    sort:
      search.sort === "rating" || search.sort === "newest"
        ? search.sort
        : "popularity",
  };
}

export function fetchDiscover(filters: DiscoverFilters, page = 1): Promise<PagedItems> {
  return catalogue(buildDiscoverPath(filters), filters.kind, page);
}

/** Backdrops for the sign-in slideshow. Fails soft: no key, no slideshow. */
export async function getAuthSlides(count = 6) {
  if (!tmdbConfigured()) return [];

  const data = await catalogue("/movie/popular", "movie").catch(() => null);
  if (!data) return [];

  return data.items
    .filter((item) => item.backdrop)
    .slice(0, count)
    .map((item) => ({
      id: item.id,
      title: item.title,
      backdrop: item.backdrop!,
      year: item.year,
    }));
}

export function fetchCategory(slug: CategorySlug, page = 1): Promise<PagedItems> {
  const category = CATEGORIES[slug];
  const path = typeof category.path === "function" ? category.path() : category.path;
  return catalogue(path, category.fallbackType, page);
}

/**
 * One backdrop per genre for the picker tiles. Cached by the TMDB layer, so
 * this is a handful of requests on a cold cache and free afterwards.
 */
export async function getGenreArtwork() {
  const entries = await Promise.all(
    GENRES.map(async (genre) => {
      const data = await catalogue(
        `/discover/movie?with_genres=${genre.movieId}&sort_by=popularity.desc`,
        "movie",
      ).catch(() => null);

      const withArt = data?.items.find((item) => item.backdrop);
      return [genre.slug, withArt?.backdrop ?? null] as const;
    }),
  );

  return new Map(entries);
}
