import "server-only";
import { db } from "./db";
import { likeTerm } from "./like";

/**
 * Searching your own shelves.
 *
 * The search box could find anything on TMDB and nothing you had actually
 * done, so "when did I watch this?" had no answer anywhere in the app and
 * `/history` was a pager with no way in. This is the other half.
 *
 * Reads the *watched* tables rather than `Play`. The log has a row per viewing,
 * so a show watched through would come back two hundred times for one answer,
 * and the answer people want — "seen it, three times, last March" — is already
 * denormalised onto `WatchedMovie` and `WatchedEpisode`. The log stays the
 * place you go for a timeline, not for a lookup.
 */

export type LibraryHit = {
  key: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /**
   * Every way this title is already in your library, in the order they read
   * best: "Watched 3× · rated 82% · on Sci-fi night".
   */
  notes: string[];
  /** Newest thing known about it, for ordering. */
  at: Date | null;
};

/** How many to hand back. The overlay shows a handful, not a page. */
const TAKE = 5;

function key(mediaType: string, tmdbId: number) {
  return `${mediaType === "movie" ? "movie" : "tv"}-${tmdbId}`;
}

export async function searchLibrary(userId: string, raw: string): Promise<LibraryHit[]> {
  const term = likeTerm(raw);
  if (!term) return [];

  const contains = { contains: term };

  const [movies, episodes, watchlist, favourites, ratings, listItems, lists] = await Promise.all([
    db.watchedMovie.findMany({
      where: { userId, title: contains },
      orderBy: { lastWatchedAt: "desc" },
      take: TAKE,
      select: {
        movieId: true,
        title: true,
        poster: true,
        plays: true,
        watchedAt: true,
        lastWatchedAt: true,
      },
    }),
    // Grouped by show below: matching a show name returns one row per episode,
    // and "Breaking Bad" is one answer rather than sixty-two.
    db.watchedEpisode.findMany({
      where: { userId, showName: contains },
      orderBy: { lastWatchedAt: "desc" },
      take: 400,
      select: {
        showId: true,
        showName: true,
        showPoster: true,
        plays: true,
        watchedAt: true,
        lastWatchedAt: true,
      },
    }),
    db.watchlistItem.findMany({
      where: { userId, title: contains },
      orderBy: { addedAt: "desc" },
      take: TAKE,
      select: { mediaType: true, tmdbId: true, title: true, poster: true, addedAt: true },
    }),
    db.favourite.findMany({
      where: { userId, title: contains },
      orderBy: { addedAt: "desc" },
      take: TAKE,
      select: { mediaType: true, tmdbId: true, title: true, poster: true, addedAt: true },
    }),
    // The review text is searched too. "That film where I wrote about the
    // ending" is a real thing people try, and the column is right there.
    db.rating.findMany({
      where: { userId, OR: [{ title: contains }, { review: contains }] },
      orderBy: { updatedAt: "desc" },
      take: TAKE,
      select: {
        mediaType: true,
        tmdbId: true,
        title: true,
        poster: true,
        score: true,
        updatedAt: true,
      },
    }),
    db.mediaListItem.findMany({
      where: { list: { userId }, title: contains },
      orderBy: { addedAt: "desc" },
      take: TAKE,
      select: {
        mediaType: true,
        tmdbId: true,
        title: true,
        poster: true,
        addedAt: true,
        list: { select: { name: true } },
      },
    }),
    db.mediaList.findMany({
      where: { userId, name: contains },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, name: true, kind: true, _count: { select: { items: true } } },
    }),
  ]);

  /**
   * One row per title, however many places it turned up in.
   *
   * A film you have watched, rated and put on a list is one thing you are
   * looking for, and three rows saying its name would be a worse result than
   * one row that says all three.
   */
  const hits = new Map<string, LibraryHit>();

  const add = (
    mediaType: string,
    tmdbId: number,
    title: string,
    poster: string | null,
    note: string,
    at: Date | null,
  ) => {
    const id = key(mediaType, tmdbId);
    const hit = hits.get(id) ?? {
      key: id,
      mediaType: (mediaType === "movie" ? "movie" : "tv") as "movie" | "tv",
      tmdbId,
      title,
      poster,
      notes: [],
      at: null,
    };

    hit.notes.push(note);
    hit.poster ??= poster;
    if (at && (!hit.at || at > hit.at)) hit.at = at;
    hits.set(id, hit);
  };

  for (const row of movies) {
    add(
      "movie",
      row.movieId,
      row.title,
      row.poster,
      row.plays > 1 ? `Watched ${row.plays}×` : "Watched",
      row.lastWatchedAt ?? row.watchedAt,
    );
  }

  const byShow = new Map<number, { row: (typeof episodes)[number]; episodes: number; plays: number }>();
  for (const row of episodes) {
    const seen = byShow.get(row.showId);
    if (seen) {
      seen.episodes += 1;
      seen.plays += row.plays;
      const last = row.lastWatchedAt ?? row.watchedAt;
      const known = seen.row.lastWatchedAt ?? seen.row.watchedAt;
      if (last > known) seen.row = row;
    } else {
      byShow.set(row.showId, { row, episodes: 1, plays: row.plays });
    }
  }

  for (const show of [...byShow.values()].slice(0, TAKE)) {
    add(
      "tv",
      show.row.showId,
      show.row.showName,
      show.row.showPoster,
      `${show.episodes} episode${show.episodes === 1 ? "" : "s"} watched`,
      show.row.lastWatchedAt ?? show.row.watchedAt,
    );
  }

  for (const row of watchlist) {
    add(row.mediaType, row.tmdbId, row.title, row.poster, "On your watchlist", row.addedAt);
  }
  for (const row of favourites) {
    add(row.mediaType, row.tmdbId, row.title, row.poster, "A favourite", row.addedAt);
  }
  for (const row of ratings) {
    add(row.mediaType, row.tmdbId, row.title, row.poster, `Rated ${row.score}%`, row.updatedAt);
  }
  for (const row of listItems) {
    add(row.mediaType, row.tmdbId, row.title, row.poster, `On ${row.list.name}`, row.addedAt);
  }

  /**
   * Ranked by how well the title matches before anything else: somebody typing
   * "heat" wants Heat, not the thing they watched yesterday that happens to
   * have "heat" in the middle of it.
   */
  const lower = term.toLowerCase();
  const rank = (hit: LibraryHit) => {
    const title = hit.title.toLowerCase();
    if (title === lower) return 0;
    if (title.startsWith(lower)) return 1;
    if (new RegExp(`\\b${lower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) return 2;
    return 3;
  };

  const titles = [...hits.values()]
    .sort((a, b) => rank(a) - rank(b) || (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, 6);

  return [
    ...titles,
    // Lists are a different kind of answer, so they come after the titles
    // rather than being ranked against them.
    ...lists.map((list) => ({
      key: `list-${list.id}`,
      mediaType: "tv" as const,
      tmdbId: 0,
      title: list.name,
      poster: null,
      notes: [
        `${list.kind === "smart" ? "Smart list" : "Your list"} · ${list._count.items} title${
          list._count.items === 1 ? "" : "s"
        }`,
      ],
      at: null,
      listId: list.id,
    })),
  ];
}

/** What the overlay renders. Lists carry an id; titles carry a tmdb one. */
export type LibraryResult = Awaited<ReturnType<typeof searchLibrary>>[number] & {
  listId?: string;
};
