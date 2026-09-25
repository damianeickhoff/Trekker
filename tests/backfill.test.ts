import { afterEach, describe, expect, it } from "vitest";
import { addDays, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { ensureBackfill, queue, refreshShow, runReturningPass, startBackfill } from "@/lib/refresh";
import { getAgenda, getLandingSoon } from "@/lib/calendar";
import { getUpNext } from "@/lib/title-state";
import { episode, freshUser, T0 } from "./helpers/db";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * The import backfill and the refresh job, end to end against a stubbed TMDB:
 * the progress counter on User, the TitleState rows it leaves behind, and the
 * reads the dashboard and calendar make from them.
 */

const today = todayKey();
let stub: ReturnType<typeof stubTmdb> | null = null;

afterEach(async () => {
  await queue.idle();
  stub?.restore();
  stub = null;
});

/** A show with season 1 fully aired and season 2 part-way through. */
function tmdbShow(id: number, name: string, status = "Returning Series") {
  const s1 = Array.from({ length: 3 }, (_, i) => ({
    id: id * 100 + i,
    name: `${name} 1.${i + 1}`,
    overview: "",
    season_number: 1,
    episode_number: i + 1,
    runtime: 50,
    still_path: null,
    air_date: addDays(today, -100 + i * 7),
    vote_average: 0,
  }));
  const s2 = [
    { ...s1[0], id: id * 100 + 10, name: `${name} 2.1`, season_number: 2, episode_number: 1, air_date: addDays(today, -1) },
    { ...s1[0], id: id * 100 + 11, name: `${name} 2.2`, season_number: 2, episode_number: 2, air_date: addDays(today, 6) },
  ];
  return {
    [`/tv/${id}`]: {
      id,
      name,
      status,
      poster_path: `/p${id}.jpg`,
      backdrop_path: `/b${id}.jpg`,
      last_air_date: addDays(today, -1),
      last_episode_to_air: { season_number: 2, episode_number: 1, air_date: addDays(today, -1) },
      next_episode_to_air: { season_number: 2, episode_number: 2, air_date: addDays(today, 6) },
      episode_run_time: [50],
      seasons: [
        { id: 1, season_number: 0, name: "Specials", episode_count: 2, poster_path: null, air_date: null },
        { id: 2, season_number: 1, name: "Season 1", episode_count: 3, poster_path: null, air_date: null },
        { id: 3, season_number: 2, name: "Season 2", episode_count: 2, poster_path: null, air_date: null },
      ],
    },
    [`/tv/${id}/season/1`]: { id: 1, name: "Season 1", season_number: 1, episodes: s1 },
    [`/tv/${id}/season/2`]: { id: 2, name: "Season 2", season_number: 2, episodes: s2 },
  };
}

describe("the import backfill", () => {
  it("counts shows, reports progress as it goes, and finishes with a row per show", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 10, title: "Ten" }), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 3, { tmdbId: 20, title: "Twenty" }), watchedAt: T0 });
    await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: 30, title: "Thirty" } });

    // Show 20 is held until the test lets it go, so progress can be seen mid-way.
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const twenty = tmdbShow(20, "Twenty");
    stub = stubTmdb({
      ...tmdbShow(10, "Ten"),
      ...twenty,
      "/tv/20": () => held.then(() => twenty["/tv/20"]),
      ...tmdbShow(30, "Thirty", "In Production"),
    });

    const first = await ensureBackfill(userId);
    expect(first.running).toBe(true);

    // Wait until the two unblocked shows are done.
    for (let i = 0; i < 200; i++) {
      const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
      if (u.backfillDone >= 2) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const midway = await ensureBackfill(userId);
    expect(midway).toEqual({ running: true, total: 3, done: 2 });

    release();
    await startBackfill(userId);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ backfillTotal: 3, backfillDone: 3 });
    expect(user.backfillFinishedAt).not.toBeNull();
    expect(await ensureBackfill(userId)).toEqual({ running: false, total: 3, done: 3 });

    const states = await db.titleState.findMany({ where: { userId }, orderBy: { showId: "asc" } });
    expect(states.map((s) => [s.showId, s.nextSeason, s.nextEpisode, s.airedCount, s.totalCount, s.status])).toEqual([
      [10, 1, 2, 4, 5, "returning"],
      [20, 1, 1, 4, 5, "returning"],
      [30, 1, 1, 4, 5, "upcoming"],
    ]);
    expect(states.every((s) => s.airedAt !== null)).toBe(true);
    // Specials never make it into the episode list.
    expect(await db.showEpisode.count({ where: { seasonNumber: 0 } })).toBe(0);
  });

  it("finishes, with the watched half written, when TMDB has no answer for a show", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 40, title: "Forty" }), watchedAt: T0 });
    stub = stubTmdb({});

    await startBackfill(userId);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ backfillTotal: 1, backfillDone: 1 });
    expect(user.backfillFinishedAt).not.toBeNull();
    expect(await db.titleState.findUnique({ where: { userId_showId: { userId, showId: 40 } } })).toMatchObject({
      watchedCount: 1,
      airedAt: null,
    });
  });
});

describe("badges after an import", () => {
  /** Unlocks are written behind the page; wait for the first one to land. */
  async function unlocked(userId: string) {
    for (let i = 0; i < 300; i++) {
      const n = await db.unlockedAchievement.count({ where: { userId } });
      if (n > 0) return n;
      await new Promise((r) => setTimeout(r, 10));
    }
    return 0;
  }

  it("the backfill evaluates them once, so the level is right before Badges is opened", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 10, title: "Ten" }), watchedAt: T0, source: "trakt" });
    stub = stubTmdb(tmdbShow(10, "Ten"));
    expect(await db.unlockedAchievement.count({ where: { userId } })).toBe(0);

    await startBackfill(userId);
    const keys = (await db.unlockedAchievement.findMany({ where: { userId }, select: { key: true } })).map((r) => r.key);
    expect(keys).toContain("first-contact");
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.levelSyncedAt!.getTime()).toBeGreaterThanOrEqual(user.backfillFinishedAt!.getTime());
  });

  it("a backfill that finished before any evaluation is evaluated on the next visit, once", async () => {
    const userId = (await freshUser()).id;
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 10, title: "Ten" }), watchedAt: T0, source: "trakt" });
    await db.user.update({
      where: { id: userId },
      data: { backfillTotal: 1, backfillDone: 1, backfillFinishedAt: T0, levelSyncedAt: null },
    });

    expect(await ensureBackfill(userId)).toEqual({ running: false, total: 1, done: 1 });
    expect(await unlocked(userId)).toBeGreaterThan(0);
    for (let i = 0; i < 300; i++) {
      if ((await db.user.findUniqueOrThrow({ where: { id: userId } })).levelSyncedAt) break;
      await new Promise((r) => setTimeout(r, 10));
    }
    const synced = (await db.user.findUniqueOrThrow({ where: { id: userId } })).levelSyncedAt;
    expect(synced).not.toBeNull();

    // Up to date now, so another visit starts nothing.
    await ensureBackfill(userId);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).levelSyncedAt).toEqual(synced);
  });
});

describe("reads from TitleState", () => {
  it("serve Up next, Landing soon and the week agenda, leaving dropped shows out", async () => {
    const userId = (await freshUser()).id;
    stub = stubTmdb({ ...tmdbShow(10, "Ten"), ...tmdbShow(20, "Twenty") });
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 10, title: "Ten" }), watchedAt: T0 });
    for (const n of [1, 2, 3]) {
      await recordPlay(userId, { ...episode(1, n, { tmdbId: 20, title: "Twenty" }), watchedAt: new Date(T0.getTime() + n * 3_600_000) });
    }
    await recordPlay(userId, { ...episode(2, 1, { tmdbId: 20, title: "Twenty" }), watchedAt: new Date(T0.getTime() + 5 * 3_600_000) });
    await Promise.all([refreshShow(10, { alsoFor: [userId] }), refreshShow(20, { alsoFor: [userId] })]);

    expect((await getUpNext(userId)).map((r) => [r.showId, r.seasonNumber, r.episodeNumber])).toEqual([[10, 1, 2]]);
    // Both shows have S2E2 next week, whichever episode each person is on.
    expect((await getLandingSoon(userId, today)).map((r) => [r.tmdbId, r.episodeNumber, r.date])).toEqual([
      [10, 2, addDays(today, 6)],
      [20, 2, addDays(today, 6)],
    ]);

    const week = await getAgenda(userId, today, addDays(today, 7));
    expect(week.map((e) => [e.tmdbId, e.seasonNumber, e.episodeNumber])).toEqual([
      [10, 2, 2],
      [20, 2, 2],
    ]);

    await db.droppedShow.create({ data: { userId, showId: 10, showName: "Ten" } });
    expect(await getUpNext(userId)).toEqual([]);
    expect((await getAgenda(userId, today, addDays(today, 7))).map((e) => e.tmdbId)).toEqual([20]);
  });

  it("re-fetches only shows that can still change in the six-hourly pass", async () => {
    const userId = (await freshUser()).id;
    stub = stubTmdb({ ...tmdbShow(10, "Ten"), ...tmdbShow(50, "Fifty", "Ended") });
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 10, title: "Ten" }), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 50, title: "Fifty" }), watchedAt: T0 });
    await startBackfill(userId);
    const before = stub.count("/tv/50");

    const result = await runReturningPass();
    expect(result).toEqual({ shows: 1, ok: 1, films: 0 });
    expect(stub.count("/tv/50")).toBe(before);
    expect(stub.count("/tv/10")).toBe(2);
  });
});
