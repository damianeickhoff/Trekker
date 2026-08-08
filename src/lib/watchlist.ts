import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { regionForUser } from "./region";
import { getRuntime, getWatchProviders, tmdbConfigured } from "./tmdb";

/**
 * A watchlist row carries a little more than it is given when it is added: how
 * long the thing is, and where it currently streams. Both come from TMDB, so
 * they are fetched once and cached on the row rather than on every page view.
 */

export type WatchlistRow = {
  id: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  score: number | null;
  addedAt: Date;
  runtime: number | null;
  /** Provider names, empty when nothing streams it in this region. */
  streaming: string[];
  /** The same offers as TMDB provider ids, for comparing against a subscription. */
  streamingIds: number[];
};

/** How many rows to look up at once, and how many to bring up to date per view. */
const FANOUT = 6;
const PER_VIEW = 24;

/** Streaming catalogues move; a week-old answer is close enough. */
const STALE_AFTER = 7 * 24 * 60 * 60 * 1000;

export async function getWatchlist(userId: string): Promise<WatchlistRow[]> {
  const rows = await db.watchlistItem.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
  });

  const enriched = await enrich(rows, userId);

  return enriched.map((row) => ({
    id: row.id,
    mediaType: row.mediaType === "tv" ? "tv" : "movie",
    tmdbId: row.tmdbId,
    title: row.title,
    poster: row.poster,
    score: row.score,
    addedAt: row.addedAt,
    runtime: row.runtime,
    streaming: row.streaming ? row.streaming.split(",").filter(Boolean) : [],
    streamingIds: row.streamingIds
      ? row.streamingIds.split(",").map(Number).filter(Number.isInteger)
      : [],
  }));
}

type Row = {
  id: string;
  mediaType: string;
  tmdbId: number;
  runtime: number | null;
  streaming: string | null;
  streamingIds: string | null;
  enrichedAt: Date | null;
};

/**
 * Tops up whatever is missing or stale, a bounded number at a time. A long
 * watchlist therefore fills in over a few visits instead of holding the first
 * one open for a hundred round trips.
 */
async function enrich<T extends Row>(rows: T[], userId: string): Promise<T[]> {
  if (!tmdbConfigured()) return rows;

  const cutoff = Date.now() - STALE_AFTER;
  const stale = rows
    .filter(
      (row) =>
        !row.enrichedAt ||
        row.enrichedAt.getTime() < cutoff ||
        // Rows enriched before ids were stored alongside the names.
        (row.streaming !== null && row.streamingIds === null) ||
        // A row that came back without a length is worth another go: TMDB fills
        // these in over time, and a lookup that failed once should not leave a
        // title blank for a week while its neighbours show a runtime.
        row.runtime === null,
    )
    .slice(0, PER_VIEW);

  if (stale.length === 0) return rows;

  const region = await regionForUser(userId);

  const results = await mapLimit(stale, FANOUT, async (row) => {
    const mediaType = row.mediaType === "tv" ? ("tv" as const) : ("movie" as const);

    const [runtime, offers] = await Promise.all([
      row.runtime === null ? getRuntime(mediaType, row.tmdbId) : Promise.resolve(row.runtime),
      getWatchProviders(mediaType, row.tmdbId, region).catch(() => null),
    ]);

    return {
      id: row.id,
      runtime,
      streaming: (offers?.stream ?? []).map((p) => p.provider_name).join(","),
      streamingIds: (offers?.stream ?? []).map((p) => p.provider_id).join(","),
    };
  });

  const patched = new Map(results.map((r) => [r.id, r] as const));

  await Promise.all(
    results.map((r) =>
      db.watchlistItem
        .update({
          where: { id: r.id },
          data: {
            runtime: r.runtime,
            streaming: r.streaming,
            streamingIds: r.streamingIds,
            enrichedAt: new Date(),
          },
        })
        // A row deleted while we were looking it up is not an error worth
        // failing the page for.
        .catch(() => undefined),
    ),
  );

  return rows.map((row) => {
    const update = patched.get(row.id);
    return update
      ? {
          ...row,
          runtime: update.runtime,
          streaming: update.streaming,
          streamingIds: update.streamingIds,
        }
      : row;
  });
}
