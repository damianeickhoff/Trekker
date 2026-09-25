import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_REQUEST_DAILY_CAP, autoRequestNew } from "@/lib/auto-request";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { queue, rebuildSmartLists, runDailyPass } from "@/lib/refresh";
import { DEFAULT_FILTERS } from "@/lib/smart-filters";
import { film, freshUser, T0 } from "./helpers/db";

/**
 * Auto-request on a smart list: only what is new to the list at a rebuild,
 * by Request all's rule, twenty a day, never twice, and only with the switch
 * on and Overseerr connected. TMDB and Overseerr are fakes, Plex is not
 * connected; nothing leaves the process.
 */

const SEERR = "http://seerr.test";

/** One fetch for the lot: TMDB's discover answers `catalogue`, Overseerr records what it is asked for. */
function stubNetwork(catalogue: () => number[], seerrStatuses: { tmdbId: number; mediaType: string; status: number }[] = []) {
  const requested: { mediaType: string; mediaId: number }[] = [];
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "api.themoviedb.org") {
      if (url.pathname === "/3/discover/movie") {
        const ids = catalogue();
        return json({
          page: 1,
          total_pages: 1,
          total_results: ids.length,
          results: ids.map((id) => ({ id, title: `Film ${id}`, poster_path: null, vote_average: 7, release_date: "2020-01-01", genre_ids: [] })),
        });
      }
      return new Response("{}", { status: 404 });
    }
    if (url.origin === SEERR) {
      if (url.pathname === "/api/v1/media") return json({ pageInfo: { pages: 1 }, results: seerrStatuses });
      if (url.pathname === "/api/v1/request" && init?.method === "POST") {
        requested.push(JSON.parse(String(init.body)));
        return json({ id: requested.length });
      }
    }
    throw new Error(`Unexpected fetch to ${url.href}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  process.env.TMDB_API_KEY = "test-key";
  return requested;
}

afterEach(async () => {
  await queue.idle();
  vi.unstubAllGlobals();
  delete process.env.TMDB_API_KEY;
});

let userId: string;
beforeEach(async () => {
  // The only account, so the instance's admin, whose connections the job uses.
  userId = (await freshUser()).id;
});

const connect = () => db.user.update({ where: { id: userId }, data: { seerrUrl: SEERR, seerrApiKey: "key" } });
const smartList = (autoRequest: boolean) =>
  db.mediaList.create({ data: { userId, name: "Films", kind: "smart", autoRequest, filters: JSON.stringify(DEFAULT_FILTERS) } });
const movies = (...ids: number[]) => ids.map((tmdbId) => ({ mediaType: "movie" as const, tmdbId }));

describe("which titles a rebuild calls new", () => {
  it("draws the line on the first build, then names only what arrived since", async () => {
    let ids = [1, 2, 3];
    stubNetwork(() => ids);
    const list = await smartList(true);
    expect((await rebuildSmartLists()).fresh).toEqual([]);

    ids = [1, 4, 2, 5];
    await db.tmdbCache.deleteMany({});
    expect((await rebuildSmartLists()).fresh).toEqual([{ listId: list.id, titles: movies(4, 5) }]);
  });

  it("names nothing for a list with the switch off", async () => {
    let ids = [1];
    stubNetwork(() => ids);
    await smartList(false);
    await rebuildSmartLists();
    ids = [1, 2];
    await db.tmdbCache.deleteMany({});
    expect((await rebuildSmartLists()).fresh).toEqual([]);
  });
});

describe("what gets asked for", () => {
  it("skips the seen, what Plex or Overseerr has, and what streams on a paid service; records the rest once", async () => {
    await db.user.update({ where: { id: userId }, data: { providers: "8", region: "GB" } });
    const list = await smartList(true);
    await recordPlay(userId, { ...film({ tmdbId: 10 }), watchedAt: T0 });
    await db.availability.createMany({
      data: [
        { mediaType: "movie", tmdbId: 11, onPlex: true },
        { mediaType: "movie", tmdbId: 12, overseerrStatus: "requested" },
        { mediaType: "movie", tmdbId: 13, providers: JSON.stringify({ GB: { link: null, stream: [{ id: 1796, name: "Netflix" }], free: [] } }) },
        { mediaType: "movie", tmdbId: 14, providers: JSON.stringify({ GB: { link: null, stream: [{ id: 337, name: "Disney+" }], free: [] } }) },
      ],
    });
    const titles = movies(10, 11, 12, 13, 14, 15);
    const file = vi.fn<(userId: string, mediaType: string, tmdbId: number) => Promise<{ ok: true }>>(async () => ({ ok: true }));

    expect(await autoRequestNew([{ listId: list.id, titles }], file)).toEqual({ filed: 2, failed: 0 });
    expect(file.mock.calls.map((c) => c[2])).toEqual([14, 15]);
    const rows = await db.mediaListRequest.findMany({ where: { listId: list.id }, orderBy: { tmdbId: "asc" } });
    expect(rows.map((r) => [r.mediaType, r.tmdbId])).toEqual([
      ["movie", 14],
      ["movie", 15],
    ]);

    // Gone from the list and back again: still not asked for twice.
    file.mockClear();
    expect(await autoRequestNew([{ listId: list.id, titles }], file)).toEqual({ filed: 0, failed: 0 });
    expect(file).not.toHaveBeenCalled();
  });

  it("stops at twenty a list a day, and counts only what Overseerr accepted", async () => {
    const list = await smartList(true);
    const titles = movies(...Array.from({ length: 30 }, (_, i) => 100 + i));
    // The first is turned down, so it is neither counted nor recorded.
    const file = vi.fn(async (_userId: string, _mediaType: string, tmdbId: number) =>
      tmdbId === 100 ? { ok: false as const, error: "no" } : { ok: true as const },
    );
    const morning = new Date("2026-09-23T04:00:00");
    expect(await autoRequestNew([{ listId: list.id, titles }], file, morning)).toEqual({ filed: AUTO_REQUEST_DAILY_CAP - 1, failed: 1 });

    // Later the same day there is room for one more.
    expect(await autoRequestNew([{ listId: list.id, titles: movies(500, 501) }], file, new Date("2026-09-23T15:00:00"))).toEqual({
      filed: 1,
      failed: 0,
    });
    // The next day, twenty again.
    expect(await autoRequestNew([{ listId: list.id, titles: movies(501) }], file, new Date("2026-09-24T04:00:00"))).toEqual({
      filed: 1,
      failed: 0,
    });
    expect(await db.mediaListRequest.count({ where: { listId: list.id } })).toBe(AUTO_REQUEST_DAILY_CAP + 1);
  });

  it("asks for nothing on a list with the switch off", async () => {
    const list = await smartList(false);
    const file = vi.fn(async () => ({ ok: true as const }));
    expect(await autoRequestNew([{ listId: list.id, titles: movies(1) }], file)).toEqual({ filed: 0, failed: 0 });
    expect(file).not.toHaveBeenCalled();
  });
});

describe("the daily pass", () => {
  it("files a request with Overseerr for what is new, after the availability sweep", async () => {
    await connect();
    let ids = [1, 2];
    // Overseerr already has 4; the sweep has to see that before anything is filed.
    const requested = stubNetwork(() => ids, [{ tmdbId: 4, mediaType: "movie", status: 2 }]);
    const list = await smartList(true);
    await runDailyPass();
    expect(requested).toEqual([]);

    ids = [1, 2, 3, 4];
    await db.tmdbCache.deleteMany({});
    const result = await runDailyPass();
    expect(result.autoRequests).toEqual({ filed: 1, failed: 0 });
    expect(requested).toEqual([{ mediaType: "movie", mediaId: 3 }]);
    expect(await db.mediaListRequest.findMany({ where: { listId: list.id }, select: { tmdbId: true } })).toEqual([{ tmdbId: 3 }]);
  });

  it("files nothing without Overseerr connected", async () => {
    let ids = [1];
    const requested = stubNetwork(() => ids);
    await smartList(true);
    await runDailyPass();
    ids = [1, 2];
    await db.tmdbCache.deleteMany({});
    expect((await runDailyPass()).autoRequests).toEqual({ filed: 0, failed: 0 });
    expect(requested).toEqual([]);
  });
});
