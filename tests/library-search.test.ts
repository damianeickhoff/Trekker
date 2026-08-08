import { beforeEach, describe, expect, it } from "vitest";
import { likeTerm } from "@/lib/like";
import { historyWhere } from "@/lib/profile";
import { searchLibrary } from "@/lib/library-search";
import { recordPlay } from "@/lib/plays";
import { db } from "@/lib/db";
import { film, freshUser, hours, at, T0 } from "./helpers/db";

describe("likeTerm", () => {
  it("passes an ordinary term through", () => {
    expect(likeTerm("heat")).toBe("heat");
    expect(likeTerm("  Fight Club  ")).toBe("Fight Club");
  });

  /**
   * The bug this exists for. `contains` compiles to `LIKE '%term%'` and Prisma
   * does not escape the term, so a percent sign in the query was a wildcard —
   * searching for "100%" matched very nearly everything.
   */
  it("strips LIKE wildcards", () => {
    expect(likeTerm("100%")).toBe("100");
    expect(likeTerm("%%%")).toBeNull();
    expect(likeTerm("a_b")).toBe("ab");
  });

  it("refuses anything too short to be a search", () => {
    expect(likeTerm("")).toBeNull();
    expect(likeTerm("a")).toBeNull();
    expect(likeTerm(null)).toBeNull();
    expect(likeTerm(undefined)).toBeNull();
    // Two characters is the floor the overlay already enforces.
    expect(likeTerm("ab")).toBe("ab");
  });

  it("caps the length so a query cannot become a payload", () => {
    expect(likeTerm("x".repeat(500))?.length).toBe(100);
  });
});

describe("historyWhere", () => {
  it("is just the user when nothing is asked for", () => {
    expect(historyWhere("u1")).toEqual({ userId: "u1" });
  });

  it("narrows by medium and source", () => {
    expect(historyWhere("u1", { mediaType: "tv", source: "plex" })).toEqual({
      userId: "u1",
      mediaType: "tv",
      source: "plex",
    });
  });

  it("searches the title and the episode name together", () => {
    const where = historyWhere("u1", { q: "ozymandias" });
    expect(where).toMatchObject({
      userId: "u1",
      OR: [{ title: { contains: "ozymandias" } }, { episodeName: { contains: "ozymandias" } }],
    });
  });

  it("ignores a term too short or too wildcard to mean anything", () => {
    // Otherwise this is `LIKE '%%'`, which is the whole table.
    expect(historyWhere("u1", { q: "%" })).toEqual({ userId: "u1" });
    expect(historyWhere("u1", { q: "a" })).toEqual({ userId: "u1" });
  });
});

describe("searchLibrary", () => {
  let userId: string;

  beforeEach(async () => {
    userId = (await freshUser()).id;
  });

  it("finds a film you have watched, with the count", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: at(hours(50)) });

    const hits = await searchLibrary(userId, "fight");

    expect(hits).toHaveLength(1);
    expect(hits[0].title).toBe("Fight Club");
    expect(hits[0].notes).toEqual(["Watched 2×"]);
  });

  /**
   * The point of merging: a title watched *and* rated *and* listed is one thing
   * somebody is looking for, and three rows repeating its name would be a worse
   * answer than one row that says all three.
   */
  it("says everything it knows about a title on one row", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await db.rating.create({
      data: { userId, mediaType: "movie", tmdbId: 550, title: "Fight Club", score: 92 },
    });
    await db.watchlistItem.create({
      data: { userId, mediaType: "movie", tmdbId: 550, title: "Fight Club" },
    });

    const hits = await searchLibrary(userId, "fight club");

    expect(hits).toHaveLength(1);
    expect(hits[0].notes).toEqual(
      expect.arrayContaining(["Watched", "Rated 92%", "On your watchlist"]),
    );
  });

  it("collapses a show to one row rather than one per episode", async () => {
    for (const n of [1, 2, 3]) {
      await recordPlay(userId, {
        mediaType: "tv",
        tmdbId: 1396,
        title: "Breaking Bad",
        seasonNumber: 1,
        episodeNumber: n,
        episodeName: `Episode ${n}`,
        runtime: 47,
        watchedAt: at(hours(n * 24)),
      });
    }

    const hits = await searchLibrary(userId, "breaking");

    expect(hits).toHaveLength(1);
    expect(hits[0].notes).toEqual(["3 episodes watched"]);
  });

  it("searches what you wrote, not only what it is called", async () => {
    await db.rating.create({
      data: {
        userId,
        mediaType: "movie",
        tmdbId: 27205,
        title: "Inception",
        score: 88,
        review: "The spinning top at the end is the whole argument.",
      },
    });

    const hits = await searchLibrary(userId, "spinning top");
    expect(hits.map((h) => h.title)).toContain("Inception");
  });

  it("finds a list by its name", async () => {
    await db.mediaList.create({ data: { userId, name: "Sci-fi night", kind: "manual" } });

    const hits = await searchLibrary(userId, "sci-fi");
    expect(hits[0].title).toBe("Sci-fi night");
    expect(hits[0].notes[0]).toMatch(/Your list/);
  });

  it("returns nothing for a term that is only wildcards", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    expect(await searchLibrary(userId, "%")).toEqual([]);
  });

  it("never reaches into somebody else's shelves", async () => {
    const other = (await freshUser()).id;
    await recordPlay(other, { ...film(), watchedAt: T0 });

    expect(await searchLibrary(userId, "fight")).toEqual([]);
  });
});
