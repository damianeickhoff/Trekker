import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { LIFETIMES, cacheKey, getSeason, getTrending, getTvDetails, tmdbGet } from "@/lib/tmdb";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * The TMDB cache is a table, read through, with a lifetime per endpoint. These
 * pin the lifetimes the plan sets and the two behaviours that make it worth
 * having: fresh answers never touch the network, and a failed refetch serves
 * the stale answer instead of an error.
 */

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

let stub: ReturnType<typeof stubTmdb> | null = null;

afterEach(() => {
  stub?.restore();
  stub = null;
  vi.useRealTimers();
});

const show = { id: 1, name: "Show", seasons: [], status: "Returning Series" };

describe("lifetimes", () => {
  it("are the ones the plan sets", () => {
    expect(LIFETIMES.details).toBe(7 * DAY);
    expect(LIFETIMES.season).toBe(DAY);
    expect(LIFETIMES.trending).toBe(HOUR);
    expect(LIFETIMES.search).toBe(HOUR);
    expect(LIFETIMES.person).toBe(7 * DAY);
    expect(LIFETIMES.images).toBe(30 * DAY);
  });

  it("stores each answer with its endpoint's expiry", async () => {
    stub = stubTmdb({ "/tv/1": show, "/tv/1/season/1": { episodes: [] }, "/trending/tv/week": { results: [] } });
    const before = Date.now();
    await getTvDetails(1);
    await getSeason(1, 1);
    await getTrending("tv");

    const rows = await db.tmdbCache.findMany();
    const ttl = (prefix: string) => {
      const row = rows.find((r) => r.key.startsWith(prefix))!;
      return row.expiresAt.getTime() - row.fetchedAt.getTime();
    };
    expect(ttl("/tv/1?")).toBe(7 * DAY);
    expect(ttl("/tv/1/season/1")).toBe(DAY);
    expect(ttl("/trending/tv/week")).toBe(HOUR);
    expect(rows.every((r) => r.fetchedAt.getTime() >= before)).toBe(true);
  });
});

describe("read-through", () => {
  it("answers from the table while fresh, and refetches once expired", async () => {
    stub = stubTmdb({ "/tv/1": show });
    await getTvDetails(1);
    await getTvDetails(1);
    expect(stub.count("/tv/1")).toBe(1);

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 7 * DAY + 1000);
    await getTvDetails(1);
    expect(stub.count("/tv/1")).toBe(2);
  });

  it("goes to the network when forced, whatever the table says", async () => {
    stub = stubTmdb({ "/tv/1": show });
    await getTvDetails(1);
    await getTvDetails(1, { force: true });
    expect(stub.count("/tv/1")).toBe(2);
  });

  it("serves a stale answer when TMDB cannot be reached", async () => {
    let fail = false;
    stub = stubTmdb({ "/tv/1": () => (fail ? new Error("offline") : show) });
    await getTvDetails(1);
    fail = true;
    const stale = await getTvDetails(1, { force: true });
    expect(stale.name).toBe("Show");
  });

  it("throws only when there is nothing cached to fall back on", async () => {
    stub = stubTmdb({ "/tv/2": () => new Error("offline") });
    await expect(getTvDetails(2)).rejects.toThrow("offline");
  });

  it("shares one request between callers asking at the same moment", async () => {
    stub = stubTmdb({ "/tv/1": show });
    await Promise.all([getTvDetails(1), getTvDetails(1), getTvDetails(1)]);
    expect(stub.count("/tv/1")).toBe(1);
  });

  it("keys on the question, not the order it was asked in, and never on the credential", async () => {
    expect(cacheKey("/discover/tv", { b: 2, a: 1 })).toBe(cacheKey("/discover/tv", { a: 1, b: 2 }));
    stub = stubTmdb({ "/discover/tv": { results: [] } });
    await tmdbGet("discover", "/discover/tv", { with_genres: 18 });
    const row = await db.tmdbCache.findFirstOrThrow();
    expect(row.key).not.toContain("test-key");
  });

  it("refuses without a key rather than calling out", async () => {
    await expect(getTvDetails(3)).rejects.toThrow("TMDB_API_KEY");
  });
});
