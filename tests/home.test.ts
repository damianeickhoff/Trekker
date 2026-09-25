import { beforeEach, describe, expect, it } from "vitest";
import { addDays, localMidday, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { getRecentlyWatched, markEpisodeFromHome } from "@/lib/home";
import { recordPlay, redatePlay } from "@/lib/plays";
import { getUpNext } from "@/lib/title-state";
import { at, episode, film, freshUser, hours, seedEpisodes, T0 } from "./helpers/db";

/**
 * Home's one write: the card's Mark watched and the Also waiting ticks both go
 * through `recordPlay`, so ticking moves `TitleState` on and keeps the counts
 * on User true, and the "when?" menu moves the same play without doubling it.
 */

const today = todayKey();
let userId: string;

beforeEach(async () => {
  userId = (await freshUser()).id;
  await seedEpisodes(1396, [{ season: 1, count: 4, airedFrom: addDays(today, -60) }]);
  await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });
});

describe("Mark watched from the card", () => {
  it("moves the card on to the next episode and updates the cached counts", async () => {
    const [card] = await getUpNext(userId);
    expect([card.seasonNumber, card.episodeNumber]).toEqual([1, 2]);

    const result = await markEpisodeFromHome(userId, card.showId, card.seasonNumber, card.episodeNumber);
    expect(result).toMatchObject({ created: true, plays: 1 });

    const state = await db.titleState.findUniqueOrThrow({ where: { userId_showId: { userId, showId: 1396 } } });
    expect(state).toMatchObject({ watchedCount: 2, nextSeason: 1, nextEpisode: 3, nextTitle: "S1E3" });
    const [next] = await getUpNext(userId);
    expect(next.episodeNumber).toBe(3);

    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ watchedEpisodeCount: 2, playCount: 2, minutesWatched: 47 + 45 });
    // Name, artwork and runtime came from the rows, not from TMDB.
    const play = await db.play.findUniqueOrThrow({ where: { id: result!.playId! } });
    expect(play).toMatchObject({ title: "Breaking Bad", poster: "/bb.jpg", episodeName: "S1E2", runtime: 45 });
  });

  it("treats a double tap as one viewing", async () => {
    await markEpisodeFromHome(userId, 1396, 1, 2);
    const again = await markEpisodeFromHome(userId, 1396, 1, 2);
    expect(again).toMatchObject({ created: false, playId: null });
    expect(await db.play.count({ where: { userId, tmdbId: 1396, episodeNumber: 2 } })).toBe(1);
  });

  it("refuses a show that is not this person's", async () => {
    expect(await markEpisodeFromHome(userId, 999, 1, 1)).toBeNull();
    expect(await db.play.count({ where: { userId } })).toBe(1);
  });
});

describe("When did you watch it?", () => {
  it("moves the play to midday on the chosen day, and the watched row with it", async () => {
    const result = await markEpisodeFromHome(userId, 1396, 1, 2);
    const yesterday = addDays(today, -1);
    expect(await redatePlay(userId, result!.playId!, localMidday(yesterday))).toBe(true);

    const play = await db.play.findUniqueOrThrow({ where: { id: result!.playId! } });
    expect(play.watchedAt).toEqual(localMidday(yesterday));
    const row = await db.watchedEpisode.findFirstOrThrow({ where: { userId, episodeNumber: 2 } });
    expect(row.watchedAt).toEqual(localMidday(yesterday));
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.playCount).toBe(2);
  });

  it("will not move somebody else's play, or into the future", async () => {
    const result = await markEpisodeFromHome(userId, 1396, 1, 2);
    const stranger = (await freshUser()).id;
    expect(await redatePlay(stranger, result!.playId!, localMidday(addDays(today, -1)))).toBe(false);
    expect(await redatePlay(userId, result!.playId!, localMidday(addDays(today, 2)))).toBe(false);
  });
});

describe("Recently watched", () => {
  it("is one poster per title, newest first, straight off the play log", async () => {
    await recordPlay(userId, { ...film(), watchedAt: new Date(T0.getTime() + 60_000) });
    await recordPlay(userId, { ...episode(1, 2), watchedAt: new Date(T0.getTime() + 3_600_000) });
    const recent = await getRecentlyWatched(userId);
    expect(recent.map((r) => [r.mediaType, r.tmdbId, r.episodeNumber])).toEqual([
      ["tv", 1396, 2],
      ["movie", 550, null],
    ]);
    expect(typeof recent[0].watchedAt).toBe("string");
  });
});

describe("Up next holds still while it is ticked through", () => {
  const show = (tmdbId: number, title: string) => (n: number, overrides: Record<string, unknown> = {}) =>
    episode(1, n, { tmdbId, title, poster: null, ...overrides });
  const a = show(100, "A");
  const b = show(200, "B");
  const c = show(300, "C");
  const order = async (day = today) => (await getUpNext(userId, 10, day)).map((r) => [r.showId, r.episodeNumber]);

  beforeEach(async () => {
    await seedEpisodes(100, [{ season: 1, count: 4, airedFrom: addDays(today, -60) }]);
    await seedEpisodes(200, [{ season: 1, count: 2, airedFrom: addDays(today, -60) }]);
    await seedEpisodes(300, [{ season: 1, count: 4, airedFrom: addDays(today, -60) }]);
    await recordPlay(userId, { ...c(1), watchedAt: at(hours(1)) });
    await recordPlay(userId, { ...b(1), watchedAt: at(hours(2)) });
    await recordPlay(userId, { ...a(1), watchedAt: at(hours(3)) });
  });

  it("advances a ticked row in place, and a redate from the menu keeps it there", async () => {
    expect(await order()).toEqual([[100, 2], [200, 2], [300, 2], [1396, 2]]);

    const result = await markEpisodeFromHome(userId, 300, 1, 2);
    // Ordered by the latest viewing alone, C would now be the card.
    expect(await order()).toEqual([[100, 2], [200, 2], [300, 3], [1396, 2]]);

    await redatePlay(userId, result!.playId!, localMidday(addDays(today, -1)), { holdPlace: true });
    expect(await order()).toEqual([[100, 2], [200, 2], [300, 3], [1396, 2]]);

    // Ticking again the same day keeps the place the first tick froze.
    await markEpisodeFromHome(userId, 300, 1, 3);
    expect(await order()).toEqual([[100, 2], [200, 2], [300, 4], [1396, 2]]);
  });

  it("drops a row only when nothing more has aired, and the rest move up", async () => {
    await markEpisodeFromHome(userId, 200, 1, 2);
    expect(await order()).toEqual([[100, 2], [300, 2], [1396, 2]]);
  });

  it("holds the card too", async () => {
    await markEpisodeFromHome(userId, 1396, 1, 2);
    await markEpisodeFromHome(userId, 100, 1, 2);
    expect(await order()).toEqual([[100, 3], [200, 2], [300, 2], [1396, 3]]);
  });

  it("reorders for a viewing from anywhere else, and for Home's ticks from the next day", async () => {
    await markEpisodeFromHome(userId, 300, 1, 2);
    expect((await order())[0]).toEqual([100, 2]);
    // Tomorrow the tick counts like any other viewing.
    expect((await order(addDays(today, 1)))[0]).toEqual([300, 3]);

    // A title page or Plex is new information, and moves the row at once.
    await recordPlay(userId, { ...episode(1, 2), watchedAt: new Date() });
    expect((await order())[0]).toEqual([1396, 3]);
  });
});
