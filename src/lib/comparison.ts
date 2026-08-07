import "server-only";
import { db } from "./db";

/**
 * "What do we both watch?" — the only part of a friend's profile that is about
 * the pair rather than about them. Everything here is a database join; no TMDB.
 */

export type Comparison = {
  sharedShows: number;
  sharedMovies: number;
  /** Shows they have watched that you have not, most-watched first. */
  theirPicks: { showId: number; name: string; poster: string | null; episodes: number }[];
  /** Titles you have both scored, biggest disagreement first. */
  disagreements: {
    key: string;
    mediaType: string;
    tmdbId: number;
    title: string;
    poster: string | null;
    yours: number;
    theirs: number;
  }[];
  /** Average gap between your scores, across everything you have both rated. */
  averageGap: number | null;
  ratedTogether: number;
};

export async function compareWith(viewerId: string, otherId: string): Promise<Comparison> {
  const [mine, theirs, myMovies, theirMovies, myRatings, theirRatings] = await Promise.all([
    db.watchedEpisode.findMany({
      where: { userId: viewerId },
      select: { showId: true },
      distinct: ["showId"],
    }),
    db.watchedEpisode.findMany({
      where: { userId: otherId },
      select: { showId: true, showName: true, showPoster: true },
    }),
    db.watchedMovie.findMany({ where: { userId: viewerId }, select: { movieId: true } }),
    db.watchedMovie.findMany({ where: { userId: otherId }, select: { movieId: true } }),
    db.rating.findMany({ where: { userId: viewerId } }),
    db.rating.findMany({ where: { userId: otherId } }),
  ]);

  const myShows = new Set(mine.map((row) => row.showId));
  const myMovieIds = new Set(myMovies.map((row) => row.movieId));

  // Group their episodes by show, keeping a count so "their picks" can lead
  // with what they have actually put hours into rather than a single pilot.
  const theirShows = new Map<
    number,
    { name: string; poster: string | null; episodes: number }
  >();

  for (const row of theirs) {
    const entry = theirShows.get(row.showId) ?? {
      name: row.showName,
      poster: row.showPoster,
      episodes: 0,
    };
    entry.episodes += 1;
    theirShows.set(row.showId, entry);
  }

  const sharedShows = [...theirShows.keys()].filter((id) => myShows.has(id)).length;
  const sharedMovies = theirMovies.filter((row) => myMovieIds.has(row.movieId)).length;

  const theirPicks = [...theirShows.entries()]
    .filter(([showId]) => !myShows.has(showId))
    .map(([showId, show]) => ({ showId, ...show }))
    .sort((a, b) => b.episodes - a.episodes)
    .slice(0, 6);

  // ---- Ratings -------------------------------------------------------------
  const theirScores = new Map<string, (typeof theirRatings)[number]>(
    theirRatings.map((r) => [`${r.mediaType}-${r.tmdbId}`, r]),
  );

  const both = myRatings
    .map((mine) => {
      const key = `${mine.mediaType}-${mine.tmdbId}`;
      const other = theirScores.get(key);
      if (!other) return null;
      return {
        key,
        mediaType: mine.mediaType,
        tmdbId: mine.tmdbId,
        title: mine.title,
        poster: mine.poster ?? other.poster,
        yours: mine.score,
        theirs: other.score,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const averageGap =
    both.length > 0
      ? Math.round(
          both.reduce((sum, row) => sum + Math.abs(row.yours - row.theirs), 0) / both.length,
        )
      : null;

  const disagreements = both
    .slice()
    .sort((a, b) => Math.abs(b.yours - b.theirs) - Math.abs(a.yours - a.theirs))
    .slice(0, 5);

  return {
    sharedShows,
    sharedMovies,
    theirPicks,
    disagreements,
    averageGap,
    ratedTogether: both.length,
  };
}
