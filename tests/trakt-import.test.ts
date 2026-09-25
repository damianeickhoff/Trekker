import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { fetchTraktBundle, parseTraktExport, type TraktBundle } from "@/lib/trakt";
import { importBundle } from "@/lib/trakt-import";
import { freshUser } from "./helpers/db";

/**
 * The Trakt import on fixtures: an export zip read by shape, the API's six
 * answers, and the bundle written in, deduplicated against what is already
 * logged. TMDB is not configured, so titles come from Trakt.
 */

const W1 = "2024-03-01T20:00:00.000Z";
const W2 = "2024-03-02T21:00:00.000Z";

const watchedMovies = [{ plays: 2, last_watched_at: W1, movie: { title: "Heat", year: 1995, ids: { trakt: 1, tmdb: 949 } } }];
const watchedShows = [
  {
    last_watched_at: W2,
    show: { title: "Breaking Bad", year: 2008, ids: { trakt: 2, tmdb: 1396 } },
    seasons: [
      { number: 0, episodes: [{ number: 1, plays: 1, last_watched_at: W2 }] },
      { number: 1, episodes: [{ number: 1, plays: 1, last_watched_at: W1 }, { number: 2, plays: 1, last_watched_at: W2 }] },
    ],
  },
];
const ratings = [
  { rated_at: W1, rating: 7, type: "movie", movie: { title: "Heat", year: 1995, ids: { tmdb: 949 } } },
  { rated_at: W1, rating: 10, type: "show", show: { title: "Breaking Bad", year: 2008, ids: { tmdb: 1396 } } },
  { rated_at: W1, rating: 1, type: "movie", movie: { title: "Bad", year: 2000, ids: { tmdb: 5 } } },
  // An episode's rating is not a show's, and is left out.
  { rated_at: W1, rating: 9, type: "episode", show: { title: "Breaking Bad", ids: { tmdb: 1396 } }, episode: { season: 1, number: 1 } },
];
const watchlist = [
  // Watched in the same export: not put on the watchlist.
  { listed_at: W1, type: "movie", movie: { title: "Heat", year: 1995, ids: { tmdb: 949 } } },
  { listed_at: W1, type: "movie", movie: { title: "Dune", year: 2021, ids: { tmdb: 438631 } } },
  { listed_at: W2, type: "show", show: { title: "Severance", year: 2022, ids: { tmdb: 95396 } } },
];
// A custom list's rows look like the watchlist's; only the file name tells them apart.
const customList = [{ listed_at: W1, rank: 1, type: "movie", movie: { title: "Nope", ids: { tmdb: 762504 } } }];

/** A zip of stored members, which is all the reader needs to meet. */
function zip(files: Record<string, unknown>) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, body] of Object.entries(files)) {
    const data = Buffer.from(JSON.stringify(body));
    const nameBytes = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

function exportZip() {
  return zip({
    "trakt/watched-movies.json": watchedMovies,
    "trakt/watched-shows.json": watchedShows,
    "trakt/ratings-movies.json": ratings.filter((r) => r.type === "movie"),
    "trakt/ratings-shows.json": ratings.filter((r) => r.type !== "movie"),
    "trakt/watchlist.json": watchlist,
    "trakt/lists/favourites.json": customList,
    "trakt/readme.txt": "not json",
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("reading Trakt", () => {
  it("reads an export zip by the shape of its rows", () => {
    const bundle = parseTraktExport(exportZip(), "trakt-export.zip");
    expect(bundle.movies.map((m) => m.movie.ids?.tmdb)).toEqual([949]);
    expect(bundle.shows[0].seasons.map((s) => s.number)).toEqual([0, 1]);
    expect(bundle.ratings.map((r) => [r.type, r.rating])).toEqual([
      ["movie", 7],
      ["movie", 1],
      ["show", 10],
    ]);
    expect(bundle.watchlist.map((w) => w.type)).toEqual(["movie", "movie", "show"]);
  });

  it("folds the play history in when an export has no watched lists", () => {
    const history = [
      { watched_at: W1, type: "movie", movie: { title: "Heat", ids: { tmdb: 949 } } },
      { watched_at: W2, type: "movie", movie: { title: "Heat", ids: { tmdb: 949 } } },
      { watched_at: W1, type: "episode", show: { title: "Breaking Bad", ids: { tmdb: 1396 } }, episode: { season: 1, number: 3 } },
    ];
    const bundle = parseTraktExport(zip({ "history.json": history }), "export.zip");
    expect(bundle.movies).toEqual([{ last_watched_at: W2, movie: { title: "Heat", year: null, ids: { tmdb: 949 } } }]);
    expect(bundle.shows[0].seasons).toEqual([{ number: 1, episodes: [{ number: 3, last_watched_at: W1 }] }]);
  });

  it("refuses a file with nothing in it to import", () => {
    expect(() => parseTraktExport(Buffer.from("not a zip at all, not even close"), "x.zip")).toThrow(/not a zip/);
    expect(() => parseTraktExport(zip({ "a.json": [{ hello: 1 }] }), "x.zip")).toThrow(/Nothing to import/);
  });

  it("asks the public profile for history, ratings and the watchlist with the client id", async () => {
    const asked: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input));
        if (url.hostname !== "api.trakt.tv") throw new Error(`Unexpected fetch to ${url.hostname}`);
        asked.push(url.pathname);
        expect((init?.headers as Record<string, string>)["trakt-api-key"]).toBe("client-1");
        const answers: Record<string, unknown> = {
          "/users/someone/watched/movies": watchedMovies,
          "/users/someone/watched/shows": watchedShows,
          "/users/someone/ratings/movies": ratings.filter((r) => r.type === "movie"),
          "/users/someone/ratings/shows": ratings.filter((r) => r.type === "show"),
          "/users/someone/watchlist/movies": watchlist.filter((w) => w.type === "movie"),
        };
        const body = answers[url.pathname];
        // The watchlist of shows fails: optional parts leave themselves empty.
        return body === undefined ? new Response("", { status: 500 }) : new Response(JSON.stringify(body), { status: 200 });
      }),
    );
    const bundle = await fetchTraktBundle("someone", "client-1");
    expect(asked).toHaveLength(6);
    expect(bundle.movies).toHaveLength(1);
    expect(bundle.ratings).toHaveLength(3);
    expect(bundle.watchlist).toHaveLength(2);
  });
});

describe("writing an import", () => {
  const bundle = () => parseTraktExport(exportZip(), "trakt-export.zip") as TraktBundle;

  it("logs history with its dates, ratings as popcorn and the watchlist", async () => {
    const user = await freshUser();
    const summary = await importBundle(user.id, bundle());
    expect(summary).toMatchObject({ films: 1, episodes: 2, ratings: 3, saved: 2 });

    const plays = await db.play.findMany({ where: { userId: user.id }, orderBy: { watchedAt: "asc" } });
    expect(plays.map((p) => [p.mediaType, p.tmdbId, p.seasonNumber, p.episodeNumber, p.watchedAt.toISOString(), p.source])).toEqual([
      ["movie", 949, null, null, W1, "trakt"],
      ["tv", 1396, 1, 1, W1, "trakt"],
      ["tv", 1396, 1, 2, W2, "trakt"],
    ]);

    // ceil(score / 20) on Trakt's tens: 7 is 70, full; 10 golden; 1 spilled.
    const rated = await db.rating.findMany({ where: { userId: user.id }, orderBy: { tmdbId: "asc" } });
    expect(rated.map((r) => [r.tmdbId, r.score, r.legacyScore])).toEqual([
      [5, 1, 10],
      [949, 4, 70],
      [1396, 5, 100],
    ]);

    const saved = await db.watchlistItem.findMany({ where: { userId: user.id }, orderBy: { tmdbId: "asc" } });
    expect(saved.map((s) => [s.mediaType, s.tmdbId, s.title])).toEqual([
      ["tv", 95396, "Severance"],
      ["movie", 438631, "Dune"],
    ]);
    expect((await db.user.findUnique({ where: { id: user.id } }))!.watchedEpisodeCount).toBe(2);
  });

  it("doubles nothing already logged, adopts an import's undated play, and changes nothing when run again", async () => {
    const user = await freshUser();
    // Ticked here by hand: the user's own word, left alone.
    await recordPlay(user.id, { mediaType: "movie", tmdbId: 949, title: "Heat", watchedAt: new Date("2025-01-01T12:00:00Z") });
    // Carried over by the backfill with no id: Trakt's date is the better one.
    await recordPlay(user.id, {
      mediaType: "tv",
      tmdbId: 1396,
      title: "Breaking Bad",
      seasonNumber: 1,
      episodeNumber: 1,
      watchedAt: new Date("2025-02-02T12:00:00Z"),
      source: "backfill",
    });
    // Already rated here: never replaced.
    await db.rating.create({ data: { userId: user.id, mediaType: "movie", tmdbId: 949, title: "Heat", score: 2 } });

    const first = await importBundle(user.id, bundle());
    expect(first).toMatchObject({ films: 0, episodes: 1, ratings: 2 });

    const plays = await db.play.findMany({ where: { userId: user.id }, orderBy: [{ mediaType: "asc" }, { episodeNumber: "asc" }] });
    expect(plays).toHaveLength(3);
    expect(plays.find((p) => p.mediaType === "movie")).toMatchObject({ source: "manual", watchedAt: new Date("2025-01-01T12:00:00Z") });
    expect(plays.find((p) => p.episodeNumber === 1)).toMatchObject({ source: "trakt", watchedAt: new Date(W1) });
    expect((await db.rating.findFirst({ where: { userId: user.id, tmdbId: 949 } }))!.score).toBe(2);
    // Watched already, so not put on the watchlist either.
    expect(await db.watchlistItem.count({ where: { userId: user.id, tmdbId: 949 } })).toBe(0);

    const second = await importBundle(user.id, bundle());
    expect(second).toMatchObject({ films: 0, episodes: 0, ratings: 0, saved: 0 });
    expect(await db.play.count({ where: { userId: user.id } })).toBe(3);
    expect(await db.rating.count({ where: { userId: user.id } })).toBe(3);
    expect(await db.watchlistItem.count({ where: { userId: user.id } })).toBe(2);
  });
});
