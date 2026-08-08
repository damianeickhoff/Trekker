import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { toCsv, type CsvValue } from "@/lib/export-csv";
import { EXPORTABLE_USER_FIELDS } from "@/lib/export-fields";

/**
 * Your data, on the way out.
 *
 * A route rather than a server action for one reason: only a route handler can
 * set `Content-Disposition`, and without it this is a JSON response the
 * browser renders rather than a file it saves.
 *
 *   /api/export?format=json                  everything, for a real backup
 *   /api/export?format=csv&table=plays       one sheet, for a spreadsheet
 *   /api/export?format=trakt                 shaped to re-import elsewhere
 *
 * The whole log is streamed in pages rather than read at once. `better-sqlite3`
 * is a *synchronous* driver, so one `findMany` over five thousand rows blocks
 * the event loop for the entire server — not just this request — for as long as
 * it takes. Paging keeps each blocking read short.
 */

export const dynamic = "force-dynamic";

/** How many rows to pull per read. Small enough to stay responsive. */
const PAGE = 1000;

type Json = Record<string, unknown>;

/** Reads a table in pages, oldest id first, so nothing is held all at once. */
async function* paged<T extends { id: string }>(
  read: (cursor: string | undefined) => Promise<T[]>,
): AsyncGenerator<T[]> {
  let cursor: string | undefined;

  for (;;) {
    const rows = await read(cursor);
    if (rows.length === 0) return;

    yield rows;
    if (rows.length < PAGE) return;
    cursor = rows[rows.length - 1].id;
  }
}

/** `take`/`cursor`/`skip` for a keyset walk. */
function page(cursor: string | undefined) {
  return {
    take: PAGE,
    orderBy: { id: "asc" } as const,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

/* ========================================================================== */

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "json";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "csv") {
    const table = url.searchParams.get("table") ?? "plays";
    const sheet = await csvFor(user.id, table);
    if (!sheet) return NextResponse.json({ error: `Unknown table "${table}"` }, { status: 400 });

    return new NextResponse(sheet, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="trekker-${table}-${stamp}.csv"`,
      },
    });
  }

  if (format === "trakt") {
    const payload = await traktShaped(user.id);
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="trekker-trakt-${stamp}.json"`,
      },
    });
  }

  if (format !== "json") {
    return NextResponse.json({ error: `Unknown format "${format}"` }, { status: 400 });
  }

  return new NextResponse(fullExport(user.id), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="trekker-${stamp}.json"`,
    },
  });
}

/* -------------------------------------------------------------------------- */

/**
 * Everything the account owns, streamed.
 *
 * `deletedPlays` is in here and belongs in here, however odd it looks: it is
 * the record of viewings deliberately removed, and it is what stops the next
 * Plex sync putting them all back. An export that dropped it would restore
 * into a state the user had already corrected once.
 */
function fullExport(userId: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const write = (text: string) => controller.enqueue(encoder.encode(text));

      /** One array, written a page at a time so it never exists in memory whole. */
      const streamArray = async <T extends { id: string }>(
        key: string,
        read: (cursor: string | undefined) => Promise<T[]>,
        first: boolean,
      ) => {
        write(`${first ? "" : ","}\n  ${JSON.stringify(key)}: [`);
        let started = false;
        for await (const rows of paged(read)) {
          for (const row of rows) {
            write(`${started ? "," : ""}\n    ${JSON.stringify(row)}`);
            started = true;
          }
        }
        write(started ? "\n  ]" : "]");
      };

      try {
        const account = await db.user.findUnique({
          where: { id: userId },
          select: EXPORTABLE_USER_FIELDS,
        });

        write("{\n");
        // Versioned so a future importer can tell what it is looking at.
        write(`  "version": 1,\n`);
        write(`  "exportedAt": ${JSON.stringify(new Date().toISOString())},\n`);
        write(`  "account": ${JSON.stringify(account)},`);

        await streamArray("plays", (c) => db.play.findMany({ where: { userId }, ...page(c) }), true);
        await streamArray(
          "watchedMovies",
          (c) => db.watchedMovie.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "watchedEpisodes",
          (c) => db.watchedEpisode.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "deletedPlays",
          (c) => db.deletedPlay.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "ratings",
          (c) => db.rating.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "episodeRatings",
          (c) => db.episodeRating.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "watchlist",
          (c) => db.watchlistItem.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "favourites",
          (c) => db.favourite.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "droppedShows",
          (c) => db.droppedShow.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "achievements",
          (c) => db.unlockedAchievement.findMany({ where: { userId }, ...page(c) }),
          false,
        );
        await streamArray(
          "challenges",
          (c) => db.challengeRun.findMany({ where: { userId }, ...page(c) }),
          false,
        );

        // Lists carry their items, which is how anyone would expect to read
        // them back — a flat table of items keyed by list id would be correct
        // and useless.
        const lists = await db.mediaList.findMany({
          where: { userId },
          include: { items: true },
        });
        write(`,\n  "lists": ${JSON.stringify(lists)}\n}`);

        controller.close();
      } catch (error) {
        console.error("Export failed", error);
        controller.error(error);
      }
    },
  });
}

/* -------------------------------------------------------------------------- */

/**
 * The watch history in the shape Trakt's own export uses.
 *
 * Worth having because `parseTraktExport` discriminates rows by *shape* rather
 * than by filename, so a file of these drops straight into the import panel
 * that already exists — here, or in any other app that reads Trakt exports.
 *
 * It is lossy, and the UI says so: a Trakt row carries a play count and a last
 * watched date, so the individual dates of a rewatch, where a play came from,
 * ratings, reviews and lists all fall away. The JSON export is the backup.
 */
async function traktShaped(userId: string) {
  const [movies, episodes] = await Promise.all([
    db.watchedMovie.findMany({ where: { userId } }),
    db.watchedEpisode.findMany({ where: { userId }, orderBy: [{ showId: "asc" }] }),
  ]);

  const shows = new Map<
    number,
    { title: string; plays: number; last: Date; seasons: Map<number, Json[]> }
  >();

  for (const row of episodes) {
    const show = shows.get(row.showId) ?? {
      title: row.showName,
      plays: 0,
      last: row.lastWatchedAt ?? row.watchedAt,
      seasons: new Map<number, Json[]>(),
    };

    show.plays += row.plays;
    const last = row.lastWatchedAt ?? row.watchedAt;
    if (last > show.last) show.last = last;

    const season = show.seasons.get(row.seasonNumber) ?? [];
    season.push({
      number: row.episodeNumber,
      plays: row.plays,
      last_watched_at: last.toISOString(),
    });
    show.seasons.set(row.seasonNumber, season);
    shows.set(row.showId, show);
  }

  return [
    ...movies.map((row) => ({
      plays: row.plays,
      last_watched_at: (row.lastWatchedAt ?? row.watchedAt).toISOString(),
      movie: {
        title: row.title,
        year: row.watchedAt.getUTCFullYear(),
        ids: { tmdb: row.movieId },
      },
    })),
    ...[...shows.entries()].map(([showId, show]) => ({
      plays: show.plays,
      last_watched_at: show.last.toISOString(),
      show: { title: show.title, ids: { tmdb: showId } },
      seasons: [...show.seasons.entries()]
        .sort(([a], [b]) => a - b)
        .map(([number, episodes]) => ({
          number,
          episodes: episodes.sort(
            (a, b) => Number(a.number ?? 0) - Number(b.number ?? 0),
          ),
        })),
    })),
  ];
}

/* -------------------------------------------------------------------------- */

/** One sheet, built whole: a spreadsheet is not something anyone streams. */
async function csvFor(userId: string, table: string): Promise<string | null> {
  const columns = <T,>(...cols: [string, (row: T) => CsvValue][]) => cols;

  switch (table) {
    case "plays":
      return toCsv(
        columns<Awaited<ReturnType<typeof db.play.findMany>>[number]>(
          ["watchedAt", (r) => r.watchedAt],
          ["mediaType", (r) => r.mediaType],
          ["tmdbId", (r) => r.tmdbId],
          ["title", (r) => r.title],
          ["season", (r) => r.seasonNumber],
          ["episode", (r) => r.episodeNumber],
          ["episodeName", (r) => r.episodeName],
          ["runtime", (r) => r.runtime],
          ["source", (r) => r.source],
        ),
        await db.play.findMany({ where: { userId }, orderBy: { watchedAt: "asc" } }),
      );

    case "ratings":
      return toCsv(
        columns<Awaited<ReturnType<typeof db.rating.findMany>>[number]>(
          ["mediaType", (r) => r.mediaType],
          ["tmdbId", (r) => r.tmdbId],
          ["title", (r) => r.title],
          ["score", (r) => r.score],
          ["review", (r) => r.review],
          ["updatedAt", (r) => r.updatedAt],
        ),
        await db.rating.findMany({ where: { userId }, orderBy: { updatedAt: "asc" } }),
      );

    case "watchlist":
      return toCsv(
        columns<Awaited<ReturnType<typeof db.watchlistItem.findMany>>[number]>(
          ["mediaType", (r) => r.mediaType],
          ["tmdbId", (r) => r.tmdbId],
          ["title", (r) => r.title],
          ["runtime", (r) => r.runtime],
          ["score", (r) => r.score],
          ["streaming", (r) => r.streaming],
          ["addedAt", (r) => r.addedAt],
        ),
        await db.watchlistItem.findMany({ where: { userId }, orderBy: { addedAt: "asc" } }),
      );

    case "favourites":
      return toCsv(
        columns<Awaited<ReturnType<typeof db.favourite.findMany>>[number]>(
          ["mediaType", (r) => r.mediaType],
          ["tmdbId", (r) => r.tmdbId],
          ["title", (r) => r.title],
          ["score", (r) => r.score],
          ["addedAt", (r) => r.addedAt],
        ),
        await db.favourite.findMany({ where: { userId }, orderBy: { addedAt: "asc" } }),
      );

    default:
      return null;
  }
}
