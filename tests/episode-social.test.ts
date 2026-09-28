import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { describePlay, recordPlay, removePlayById } from "@/lib/plays";
import { commentsFor } from "@/lib/social";
import { addComment } from "@/lib/title-writes";
import { commentText, toTraktComment, traktClientFor, traktThread, type RawComment } from "@/lib/trakt-comments";
import { cleanLine, cleanNote, placeSuggestions, sourceWords, timesWatched, viewingDay } from "@/lib/viewing-words";
import { viewingsOf } from "@/lib/viewings";
import { at, episode, film, freshUser, hours } from "./helpers/db";

/**
 * An episode's own page as a place to talk and to remember: its comments kept
 * apart from the show's, what Trakt said about it, and each viewing with where
 * it was and a line about it.
 */

let userId: string;

beforeEach(async () => {
  userId = (await freshUser()).id;
});

describe("episode comments", () => {
  it("keeps an episode's thread apart from the show's and from its neighbours", async () => {
    await addComment(userId, "tv", 1396, "The whole show, in one word: tense");
    await addComment(userId, "tv", 1396, "That ending", { season: 1, episode: 3 });
    await addComment(userId, "tv", 1396, "Slower", { season: 1, episode: 4 });

    const show = await commentsFor(userId, "tv", 1396);
    const three = await commentsFor(userId, "tv", 1396, { season: 1, episode: 3 });
    expect(show.map((c) => c.body)).toEqual(["The whole show, in one word: tense"]);
    expect(three.map((c) => c.body)).toEqual(["That ending"]);
    expect(three[0].own).toBe(true);
  });

  it("files a film's comment under the film whatever numbers come with it", async () => {
    await addComment(userId, "movie", 550, "First rule", { season: 2, episode: 5 });
    const row = await db.comment.findFirstOrThrow({ where: { userId, tmdbId: 550 } });
    expect([row.seasonNumber, row.episodeNumber]).toEqual([0, 0]);
    expect((await commentsFor(userId, "movie", 550)).length).toBe(1);
  });
});

describe("a viewing's words", () => {
  it("says the day the way the rows do, with the year once it is not this one", () => {
    expect(viewingDay("2026-09-28", "2026-09-28")).toBe("Today");
    expect(viewingDay("2026-09-27", "2026-09-28")).toBe("Yesterday");
    expect(viewingDay("2026-09-23", "2026-09-28")).toBe("Wed 23 Sep");
    expect(viewingDay("2025-09-23", "2026-09-28")).toBe("Tue 23 Sep 2025");
  });

  it("counts the viewings and names the sources that reported one", () => {
    expect([1, 2, 3].map(timesWatched)).toEqual(["Once", "Twice", "3 times"]);
    expect(sourceWords("plex")).toBe("From Plex");
    expect(sourceWords("trakt")).toBe("From Trakt");
    expect(sourceWords("manual")).toBeNull();
    expect(sourceWords("backfill")).toBeNull();
  });

  it("cleans a place to one short line and a note to a few, and stores nothing for blank", () => {
    expect(cleanLine("  Netflix \n on the  sofa ", 40)).toBe("Netflix on the sofa");
    expect(cleanLine("   ", 40)).toBeNull();
    expect(cleanLine("x".repeat(60), 40)).toHaveLength(40);
    expect(cleanNote("with Jason\r\n\n\n\nfell  asleep ")).toBe("with Jason\n\nfell asleep");
    expect(cleanNote(42)).toBeNull();
  });

  it("offers Plex, then the services paid for, then places used before, each once", () => {
    expect(placeSuggestions({ plex: true, services: ["Netflix", "Disney+"], used: ["netflix", "Cinema", "plex"] })).toEqual([
      "Plex",
      "Netflix",
      "Disney+",
      "Cinema",
    ]);
    expect(placeSuggestions({ plex: false, services: [], used: [] })).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => `Place ${i}`);
    expect(placeSuggestions({ plex: false, services: [], used: many })).toHaveLength(8);
  });
});

describe("an episode's viewings", () => {
  it("lists every viewing newest first, with where and the note once described", async () => {
    const first = await recordPlay(userId, { ...episode(1, 1), watchedAt: at(0) });
    await recordPlay(userId, { ...episode(1, 1), watchedAt: at(hours(24 * 30)), source: "plex", sourceRef: "rk:1" });
    await describePlay(userId, first.playId!, { place: "Netflix", note: "with Jason" });

    const rows = await viewingsOf(userId, { mediaType: "tv", tmdbId: 1396, season: 1, episode: 1 });
    expect(rows).toHaveLength(2);
    expect(rows[0].source).toBe("plex");
    expect(rows[1]).toMatchObject({ id: first.playId, place: "Netflix", note: "with Jason", source: "manual" });
  });

  it("lists a film's viewings, and none of a show's that shares its TMDB number", async () => {
    const seen = await recordPlay(userId, { ...film(), watchedAt: at(0) });
    await recordPlay(userId, { ...episode(1, 1), tmdbId: 550, watchedAt: at(0) });
    await describePlay(userId, seen.playId!, { place: "Cinema", note: null });

    const rows = await viewingsOf(userId, { mediaType: "movie", tmdbId: 550 });
    expect(rows.map((r) => [r.id, r.place])).toEqual([[seen.playId, "Cinema"]]);
  });

  it("describes only the person's own viewing", async () => {
    const mine = await recordPlay(userId, { ...episode(1, 1), watchedAt: at(0) });
    const other = (await freshUser()).id;
    expect(await describePlay(other, mine.playId!, { place: "Somewhere", note: null })).toBe(false);
    expect((await db.play.findUniqueOrThrow({ where: { id: mine.playId! } })).place).toBeNull();
  });

  it("removes the viewing picked, not the latest, and the watched row follows", async () => {
    const early = await recordPlay(userId, { ...episode(1, 2), watchedAt: at(0) });
    const late = await recordPlay(userId, { ...episode(1, 2), watchedAt: at(hours(24 * 10)) });

    expect(await removePlayById(userId, early.playId!)).toBe(true);
    const left = await db.play.findMany({ where: { userId, seasonNumber: 1, episodeNumber: 2 } });
    expect(left.map((p) => p.id)).toEqual([late.playId]);
    const row = await db.watchedEpisode.findFirstOrThrow({ where: { userId, seasonNumber: 1, episodeNumber: 2 } });
    expect(row.plays).toBe(1);
    expect(row.watchedAt.getTime()).toBe(at(hours(24 * 10)).getTime());

    expect(await removePlayById(userId, late.playId!)).toBe(true);
    expect(await db.watchedEpisode.findFirst({ where: { userId, seasonNumber: 1, episodeNumber: 2 } })).toBeNull();
  });

  it("buries a synced viewing it removes, so the next sync does not bring it back", async () => {
    const synced = await recordPlay(userId, { ...episode(1, 3), watchedAt: at(0), source: "plex", sourceRef: "rk:9:1" });
    await removePlayById(userId, synced.playId!);
    expect(await db.deletedPlay.findFirst({ where: { userId, source: "plex", sourceRef: "rk:9:1" } })).not.toBeNull();
  });

  it("will not remove somebody else's viewing", async () => {
    const mine = await recordPlay(userId, { ...episode(1, 4), watchedAt: at(0) });
    const other = (await freshUser()).id;
    expect(await removePlayById(other, mine.playId!)).toBe(false);
    expect(await db.play.findUnique({ where: { id: mine.playId! } })).not.toBeNull();
  });
});

describe("Trakt's words", () => {
  const raw = (overrides: Partial<RawComment> = {}): RawComment => ({
    id: 42,
    comment: "Best episode of the season.",
    created_at: "2026-09-20T21:00:00.000Z",
    likes: 12,
    replies: 3,
    user_stats: { rating: 9 },
    user: { username: "sean", name: "Sean R", ids: { slug: "sean" } },
    ...overrides,
  });

  it("veils a comment with a spoiler tag anywhere in it, and drops the tags", () => {
    expect(commentText("Wow. [spoiler]He dies[/spoiler] Wow.")).toEqual({ body: "Wow. He dies Wow.", spoiler: true });
    expect(commentText("Plain\r\n\n\n\nwords")).toEqual({ body: "Plain\n\nwords", spoiler: false });
  });

  it("names the writer, links them and the comment, and keeps only a real rating", () => {
    const c = toTraktComment(raw(), "2026-09-28");
    expect(c).toMatchObject({ author: "Sean R", authorUrl: "https://trakt.tv/users/sean", likes: 12, replies: 3, rating: 9, spoiler: false });
    expect(c.url).toBe("https://trakt.tv/comments/42");
    expect(toTraktComment(raw({ user: { username: "sean", name: null, ids: { slug: null } } }), "2026-09-28")).toMatchObject({
      author: "sean",
      authorUrl: null,
    });
    expect(toTraktComment(raw({ user_stats: { rating: 0 }, spoiler: true }), "2026-09-28")).toMatchObject({ rating: null, spoiler: true });
  });
});

describe("Trakt's thread for an episode", () => {
  let calls: string[];
  let traktDown: boolean;
  let known: boolean;

  beforeEach(() => {
    calls = [];
    traktDown = false;
    known = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        if (url.hostname !== "api.trakt.tv") throw new Error(`Unexpected fetch to ${url.hostname}`);
        calls.push(url.pathname);
        if (traktDown) throw new Error("offline");
        if (url.pathname.startsWith("/search/tmdb/")) {
          const kind = url.searchParams.get("type");
          const body = !known
            ? []
            : kind === "movie"
              ? [{ type: "movie", movie: { ids: { trakt: 432, slug: "fight-club-1999" } } }]
              : [{ type: "show", show: { ids: { trakt: 1388, slug: "breaking-bad" } } }];
          return new Response(JSON.stringify(body), { status: 200 });
        }
        const body = [
          { id: 1, comment: "Great.", created_at: "2026-09-20T21:00:00Z", likes: 5, user: { username: "a", ids: { slug: "a" } } },
          { id: 2, comment: "[spoiler]Walt[/spoiler] lives", created_at: "2026-09-21T21:00:00Z", likes: 1, user: { username: "b" } },
        ];
        return new Response(JSON.stringify(body), { status: 200, headers: { "x-pagination-item-count": "57" } });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("looks the show up once, reads the most liked, and links the episode on Trakt", async () => {
    const thread = await traktThread("key", { kind: "episode", showId: 91001, season: 1, episode: 3 }, "2026-09-28");
    expect(thread).not.toBeNull();
    expect(thread!.total).toBe(57);
    expect(thread!.comments.map((c) => [c.id, c.spoiler])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(thread!.url).toBe("https://trakt.tv/shows/breaking-bad/seasons/1/episodes/3");
    expect(calls).toEqual(["/search/tmdb/91001", "/shows/1388/seasons/1/episodes/3/comments/likes"]);

    // Another episode of the same show asks only for its thread.
    await traktThread("key", { kind: "episode", showId: 91001, season: 1, episode: 4 }, "2026-09-28");
    expect(calls.filter((c) => c.startsWith("/search/")).length).toBe(1);

    // The same episode again, inside the hour, asks nothing.
    const before = calls.length;
    await traktThread("key", { kind: "episode", showId: 91001, season: 1, episode: 3 }, "2026-09-28");
    expect(calls.length).toBe(before);
  });

  it("serves the last answer when Trakt is down, and nothing when there never was one", async () => {
    await traktThread("key", { kind: "episode", showId: 91002, season: 2, episode: 1 }, "2026-09-28");
    await db.tmdbCache.updateMany({ where: { key: { startsWith: "trakt:" } }, data: { expiresAt: new Date(0) } });
    traktDown = true;
    const stale = await traktThread("key", { kind: "episode", showId: 91002, season: 2, episode: 1 }, "2026-09-28");
    expect(stale?.comments).toHaveLength(2);
    expect(await traktThread("key", { kind: "episode", showId: 91003, season: 1, episode: 1 }, "2026-09-28")).toBeNull();
  });

  it("reads a film's thread by the film's own Trakt id, kept apart from a show with the same TMDB number", async () => {
    const film = await traktThread("key", { kind: "movie", tmdbId: 91005 }, "2026-09-28");
    expect(film?.url).toBe("https://trakt.tv/movies/fight-club-1999");
    expect(film?.total).toBe(57);
    await traktThread("key", { kind: "episode", showId: 91005, season: 1, episode: 1 }, "2026-09-28");
    expect(calls).toEqual([
      "/search/tmdb/91005",
      "/movies/432/comments/likes",
      "/search/tmdb/91005",
      "/shows/1388/seasons/1/episodes/1/comments/likes",
    ]);
  });

  it("has nothing to show for a show Trakt does not know", async () => {
    known = false;
    expect(await traktThread("key", { kind: "episode", showId: 91004, season: 1, episode: 1 }, "2026-09-28")).toBeNull();
    expect(calls).toEqual(["/search/tmdb/91004"]);
  });

  it("asks with the person's own client id, else the instance's, never someone else's", async () => {
    const before = process.env.TRAKT_CLIENT_ID;
    try {
      delete process.env.TRAKT_CLIENT_ID;
      expect(await traktClientFor(userId)).toBeNull();
      process.env.TRAKT_CLIENT_ID = "instance-key";
      expect(await traktClientFor(userId)).toBe("instance-key");
    } finally {
      if (before === undefined) delete process.env.TRAKT_CLIENT_ID;
      else process.env.TRAKT_CLIENT_ID = before;
    }
  });
});
