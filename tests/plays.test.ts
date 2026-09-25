import { beforeEach, describe, expect, it } from "vitest";
import { addDays, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { recordPlay, removePlay } from "@/lib/plays";
import { getUpNext } from "@/lib/title-state";
import { at, episode, film, freshUser, hours, minutes, seedEpisodes, T0 } from "./helpers/db";

/**
 * `plays.ts` is the only writer of the play log, the watched tables, the
 * watched half of `TitleState` and the counts on `User`. These tests are about
 * those four staying in step, and about the duplicate windows that decide when
 * a report is a new viewing at all.
 */

let userId: string;
const today = todayKey();

beforeEach(async () => {
  userId = (await freshUser()).id;
});

async function state(showId = 1396) {
  return db.titleState.findUnique({ where: { userId_showId: { userId, showId } } });
}

describe("recordPlay keeps TitleState and WatchedEpisode in step", () => {
  beforeEach(async () => {
    // Season 1 aired weeks ago; season 2 starts next week.
    await seedEpisodes(1396, [
      { season: 1, count: 3, airedFrom: addDays(today, -60) },
      { season: 2, count: 2, airedFrom: addDays(today, 7) },
    ]);
  });

  it("creates the row with the next episode and counts on the first viewing", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });

    const row = await state();
    expect(row).toMatchObject({
      showName: "Breaking Bad",
      watchedCount: 1,
      airedCount: 3,
      totalCount: 5,
      nextSeason: 1,
      nextEpisode: 2,
      nextTitle: "S1E2",
    });
    expect(row?.lastWatchedAt).toEqual(T0);
    expect(await db.watchedEpisode.count({ where: { userId } })).toBe(1);
  });

  it("moves the next episode on, and into the future once the aired ones are done", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 2), watchedAt: at(hours(1)) });
    await recordPlay(userId, { ...episode(1, 3), watchedAt: at(hours(2)) });

    const row = await state();
    expect(row).toMatchObject({ watchedCount: 3, nextSeason: 2, nextEpisode: 1, nextAirDate: addDays(today, 7) });
    // Caught up: nothing aired is waiting, so it leaves Up next.
    expect(await getUpNext(userId)).toHaveLength(0);
  });

  it("puts a show with an aired episode waiting on Up next", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    const upNext = await getUpNext(userId);
    expect(upNext.map((r) => [r.showId, r.seasonNumber, r.episodeNumber])).toEqual([[1396, 1, 2]]);
  });

  it("keeps the counts on User true", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ watchedEpisodeCount: 1, watchedMovieCount: 1, playCount: 2, minutesWatched: 47 + 139 });
  });

  it("removePlay reverses it: the episode is next again and the counts drop", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 2), watchedAt: at(hours(1)) });

    const result = await removePlay(userId, { mediaType: "tv", tmdbId: 1396, seasonNumber: 1, episodeNumber: 2 });
    expect(result.remaining).toBe(0);

    expect(await state()).toMatchObject({ watchedCount: 1, nextSeason: 1, nextEpisode: 2 });
    expect(await db.watchedEpisode.count({ where: { userId } })).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ watchedEpisodeCount: 1, playCount: 1 });
  });

  it("removing the last viewing of a show removes its row, unless it is on the watchlist", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    await removePlay(userId, { mediaType: "tv", tmdbId: 1396, seasonNumber: 1, episodeNumber: 1 });
    expect(await state()).toBeNull();

    await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: 1396, title: "Breaking Bad" } });
    await recordPlay(userId, { ...episode(1, 1), watchedAt: at(hours(5)) });
    await removePlay(userId, { mediaType: "tv", tmdbId: 1396, seasonNumber: 1, episodeNumber: 1 });
    expect(await state()).toMatchObject({ watchedCount: 0, nextSeason: 1, nextEpisode: 1 });
  });

  it("'last' removes only the newest of several viewings", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 1), watchedAt: at(hours(48)) });

    const result = await removePlay(userId, { mediaType: "tv", tmdbId: 1396, seasonNumber: 1, episodeNumber: 1 }, "last");
    expect(result).toEqual({ remaining: 1, lastWatchedAt: T0 });
    const row = await db.watchedEpisode.findFirstOrThrow({ where: { userId } });
    expect(row.plays).toBe(1);
    expect((await state())?.watchedCount).toBe(1);
  });

  it("still writes the watched half for a show with no episode list yet", async () => {
    await recordPlay(userId, { ...episode(1, 1, { tmdbId: 999 }), watchedAt: T0 });
    expect(await state(999)).toMatchObject({ watchedCount: 1, nextEpisode: null, airedAt: null });
  });
});

describe("the duplicate-play windows", () => {
  it("suppresses a second report of the same episode inside thirty minutes", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    const again = await recordPlay(userId, { ...episode(1, 1), watchedAt: at(minutes(29)) });

    expect(again.created).toBe(false);
    expect(await db.play.count({ where: { userId } })).toBe(1);
    expect((await db.user.findUniqueOrThrow({ where: { id: userId } })).playCount).toBe(1);
  });

  it("counts the same episode as a rewatch outside thirty minutes", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    const again = await recordPlay(userId, { ...episode(1, 1), watchedAt: at(minutes(31)) });

    expect(again).toMatchObject({ created: true, isRewatch: true, plays: 2 });
    expect((await db.watchedEpisode.findFirstOrThrow({ where: { userId } })).plays).toBe(2);
    // Still one distinct episode as far as progress goes.
    expect((await state())?.watchedCount).toBe(1);
  });

  it("never treats different episodes as duplicates, however close", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
    const next = await recordPlay(userId, { ...episode(1, 2), watchedAt: at(minutes(1)) });
    expect(next.created).toBe(true);
  });

  it("gives films four hours either way", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    expect((await recordPlay(userId, { ...film(), watchedAt: at(hours(3.9)) })).created).toBe(false);
    expect((await recordPlay(userId, { ...film(), watchedAt: at(-hours(3.9)) })).created).toBe(false);
    expect((await recordPlay(userId, { ...film(), watchedAt: at(hours(4.1)) })).created).toBe(true);
  });

  it("ignores a source id it has already logged, whenever it arrives", async () => {
    const input = { ...film(), watchedAt: T0, source: "plex" as const, sourceRef: "abc:1" };
    await recordPlay(userId, input);
    const again = await recordPlay(userId, { ...input, watchedAt: at(hours(200)) });
    expect(again.created).toBe(false);
    expect(await db.play.count({ where: { userId } })).toBe(1);
  });

  it("does not bring back a sourced viewing that was deleted on purpose", async () => {
    const input = { ...episode(1, 1), watchedAt: T0, source: "plex" as const, sourceRef: "rk:1" };
    await recordPlay(userId, input);
    await removePlay(userId, { mediaType: "tv", tmdbId: 1396, seasonNumber: 1, episodeNumber: 1 });

    const resync = await recordPlay(userId, input);
    expect(resync.created).toBe(false);
    expect(await db.play.count({ where: { userId } })).toBe(0);
    expect(await state()).toBeNull();
  });

  it("lets a sourced report adopt an imported row rather than doubling it", async () => {
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0, source: "trakt" });
    const plex = await recordPlay(userId, {
      ...episode(1, 1),
      watchedAt: at(hours(30)),
      source: "plex",
      sourceRef: "rk:9",
    });
    expect(plex.created).toBe(false);
    const plays = await db.play.findMany({ where: { userId } });
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ source: "plex", sourceRef: "rk:9" });
  });
});
