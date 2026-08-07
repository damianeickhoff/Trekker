/**
 * The genre list, and nothing that touches a server.
 *
 * Split out of `catalogue.ts` — which is `server-only` — because the filter bar
 * is a client component and needs the same list to build its dropdown. Same
 * reasoning as `images.ts`: shared constants have no business being locked to
 * the server just because their neighbours are.
 */

/**
 * TMDB keeps separate genre lists per media type, and the ids overlap. These
 * are the pairs that exist on both sides, so one tile can search both.
 */
export const GENRES: {
  slug: string;
  label: string;
  movieId: number;
  tvId: number | null;
}[] = [
  { slug: "action", label: "Action", movieId: 28, tvId: 10759 },
  { slug: "comedy", label: "Comedy", movieId: 35, tvId: 35 },
  { slug: "horror", label: "Horror", movieId: 27, tvId: null },
  { slug: "drama", label: "Drama", movieId: 18, tvId: 18 },
  { slug: "sci-fi", label: "Sci-fi & fantasy", movieId: 878, tvId: 10765 },
  { slug: "thriller", label: "Thriller", movieId: 53, tvId: 9648 },
  { slug: "animation", label: "Animation", movieId: 16, tvId: 16 },
  { slug: "documentary", label: "Documentary", movieId: 99, tvId: 99 },
  { slug: "romance", label: "Romance", movieId: 10749, tvId: null },
  { slug: "crime", label: "Crime", movieId: 80, tvId: 80 },
  { slug: "family", label: "Family", movieId: 10751, tvId: 10751 },
  { slug: "mystery", label: "Mystery", movieId: 9648, tvId: 9648 },
];

export function findGenre(slug: string) {
  return GENRES.find((g) => g.slug === slug) ?? null;
}

export type GenreFilter = "all" | "movie" | "tv";
