/**
 * The genres a smart list can ask for, with no server in sight: the editor is
 * a client component and needs the same list the query builder reads.
 *
 * TMDB keeps one genre list for films and another for television, and they do
 * not line up. Each entry pairs the film id with the television genre that
 * means the same thing, or null where television has none. A null is not a
 * gap to paper over: horror and romance simply are not television genres on
 * TMDB, and the query builder drops the shows half rather than guess.
 */
export type Genre = { slug: string; label: string; movieId: number; tvId: number | null };

export const GENRES: Genre[] = [
  { slug: "horror", label: "Horror", movieId: 27, tvId: null },
  { slug: "thriller", label: "Thriller", movieId: 53, tvId: 9648 },
  { slug: "mystery", label: "Mystery", movieId: 9648, tvId: 9648 },
  { slug: "sci-fi", label: "Sci-fi", movieId: 878, tvId: 10765 },
  { slug: "crime", label: "Crime", movieId: 80, tvId: 80 },
  { slug: "drama", label: "Drama", movieId: 18, tvId: 18 },
  { slug: "comedy", label: "Comedy", movieId: 35, tvId: 35 },
  { slug: "fantasy", label: "Fantasy", movieId: 14, tvId: 10765 },
  { slug: "action", label: "Action", movieId: 28, tvId: 10759 },
  { slug: "adventure", label: "Adventure", movieId: 12, tvId: 10759 },
  { slug: "animation", label: "Animation", movieId: 16, tvId: 16 },
  { slug: "documentary", label: "Documentary", movieId: 99, tvId: 99 },
  { slug: "family", label: "Family", movieId: 10751, tvId: 10751 },
  { slug: "romance", label: "Romance", movieId: 10749, tvId: null },
];

export function findGenre(slug: string): Genre | null {
  return GENRES.find((g) => g.slug === slug) ?? null;
}
