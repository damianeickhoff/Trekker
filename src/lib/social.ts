import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { avatarUrl } from "./avatar";
import { getBackdrop, getEpisodeStill, tmdbConfigured } from "./tmdb";

export type ActivityEntry = {
  key: string;
  userId: string;
  userName: string;
  userAvatar: string | null;
  kind: "movie" | "episode";
  title: string;
  subtitle: string;
  poster: string | null;
  /**
   * Wide artwork: the episode's own still, or the film's backdrop. Null until
   * the caller asks for it — see `withArtwork`.
   */
  image: string | null;
  href: string;
  watchedAt: Date;
  /** True when this was not the first time they watched it. */
  isRewatch: boolean;
  /** The show's or film's id, and where in it — what `withArtwork` looks up. */
  tmdbId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
};

/**
 * Recent activity, newest first. Always scoped to named people — `userIds` for
 * a friends feed, `onlyUserId` for one profile. There is deliberately no
 * "everyone on the instance" mode: watch history is only visible to friends.
 */
export async function getRecentActivity(options?: {
  userIds?: string[];
  onlyUserId?: string;
  take?: number;
}): Promise<ActivityEntry[]> {
  const take = options?.take ?? 12;

  if (options?.userIds?.length === 0) return [];

  const userWhere = options?.onlyUserId
    ? { userId: options.onlyUserId }
    : options?.userIds
      ? { userId: { in: options.userIds } }
      : {};

  // One query over the play log, rather than over-fetching both watched tables
  // and merging them: the log is already the merged, chronological answer. It is
  // also the only source that can show someone going back to a favourite, which
  // is half of what makes a feed worth reading.
  const plays = await db.play.findMany({
    where: userWhere,
    orderBy: { watchedAt: "desc" },
    take,
    include: { user: { select: { id: true, name: true, avatarSetAt: true } } },
  });

  // "Again" means there was an earlier viewing, so the oldest play for a title
  // is never one — checked against first-watched rather than by counting, which
  // would call every play of a thrice-seen film a rewatch including the first.
  const firstSeen = await firstWatchedAmong(plays);

  return plays.map((play) => {
    const isEpisode = play.mediaType === "tv";
    const first = firstSeen.get(playKey(play));

    return {
      key: `play-${play.id}`,
      userId: play.user.id,
      userName: play.user.name,
      userAvatar: avatarUrl(play.user),
      kind: isEpisode ? ("episode" as const) : ("movie" as const),
      title: play.title,
      subtitle: isEpisode
        ? `S${String(play.seasonNumber ?? 0).padStart(2, "0")}E${String(
            play.episodeNumber ?? 0,
          ).padStart(2, "0")} · ${play.episodeName ?? ""}`
        : "Movie",
      poster: play.poster,
      image: null,
      href: isEpisode ? `/title/tv/${play.tmdbId}` : `/title/movie/${play.tmdbId}`,
      watchedAt: play.watchedAt,
      isRewatch: first !== undefined && play.watchedAt.getTime() > first.getTime(),
      // Carried through only so `withArtwork` knows what to ask TMDB for.
      tmdbId: play.tmdbId,
      seasonNumber: play.seasonNumber,
      episodeNumber: play.episodeNumber,
    };
  });
}

/**
 * Fills in the wide artwork for a feed: an episode's own still, a film's
 * backdrop.
 *
 * Separate from `getRecentActivity` because it costs a TMDB request per entry
 * and only the rails that show wide cards need it — a list of posters already
 * has everything it wants. Every answer is cached for a week and the fan-out is
 * bounded, so a feed of a dozen is a dozen cheap, mostly-warm lookups.
 *
 * Anything that fails simply keeps `image: null`, and the card falls back to the
 * poster it already had.
 */
export async function withArtwork(entries: ActivityEntry[]): Promise<ActivityEntry[]> {
  if (entries.length === 0 || !tmdbConfigured()) return entries;

  return mapLimit(entries, 6, async (entry) => {
    const image =
      entry.kind === "episode" && entry.seasonNumber !== null && entry.episodeNumber !== null
        ? await getEpisodeStill(entry.tmdbId, entry.seasonNumber, entry.episodeNumber).catch(
            () => null,
          )
        : await getBackdrop(entry.kind === "episode" ? "tv" : "movie", entry.tmdbId).catch(
            () => null,
          );

    return { ...entry, image };
  });
}

/**
 * The identity a rewatch is measured against: one film, or one *episode*.
 *
 * The season and episode numbers are not optional here. A play's `tmdbId` for
 * television is the show, so grouping on it alone answers "when did they start
 * this series" — which would call every episode after the first one a rewatch.
 */
function playKey(play: {
  userId: string;
  mediaType: string;
  tmdbId: number;
  seasonNumber: number | null;
  episodeNumber: number | null;
}) {
  return `${play.userId}-${play.mediaType}-${play.tmdbId}-${play.seasonNumber ?? ""}-${
    play.episodeNumber ?? ""
  }`;
}

/**
 * When each thing in a page of plays was first watched. Two `in` lists rather
 * than a condition per play: a feed is a dozen rows, but the shape should not
 * depend on that staying true.
 */
async function firstWatchedAmong(
  plays: {
    userId: string;
    mediaType: string;
    tmdbId: number;
    seasonNumber: number | null;
    episodeNumber: number | null;
  }[],
): Promise<Map<string, Date>> {
  if (plays.length === 0) return new Map();

  const rows = await db.play.groupBy({
    by: ["userId", "mediaType", "tmdbId", "seasonNumber", "episodeNumber"],
    where: {
      userId: { in: [...new Set(plays.map((p) => p.userId))] },
      tmdbId: { in: [...new Set(plays.map((p) => p.tmdbId))] },
    },
    _min: { watchedAt: true },
  });

  return new Map(
    rows
      .filter((row) => row._min.watchedAt !== null)
      .map((row) => [playKey(row), row._min.watchedAt!]),
  );
}

export async function getPublicProfile(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, avatarSetAt: true, createdAt: true },
  });

  if (!user) return null;
  return { ...user, avatar: avatarUrl(user) };
}
