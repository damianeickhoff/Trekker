import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { requestFriend } from "@/lib/friends";
import {
  avatarStack,
  friendDay,
  friendsBySeasonEpisode,
  friendsProgress,
  friendsWhoWatchedEpisode,
  friendsWhoWatchedFilm,
  progressLine,
  progressOf,
  viewingLine,
} from "@/lib/friends-watched";
import { recordPlay } from "@/lib/plays";
import { at, episode, film, freshUser, hours, seedEpisodes } from "./helpers/db";

/**
 * Friends who watched: what a title page may say about a friend's viewing,
 * and, as much, what it must never say about anybody else's.
 */

/** Two people who both asked, which is agreeing. */
async function befriend(a: string, b: string) {
  await requestFriend(a, b);
  await requestFriend(b, a);
}

const day = (n: number) => at(n * 24 * hours(1));

describe("the words", () => {
  it("writes the day, the year only once it is not this one, and how many viewings", () => {
    expect(friendDay(new Date(2026, 7, 12, 20), "2026-09-25")).toBe("12 Aug");
    expect(friendDay(new Date(2025, 7, 12, 20), "2026-09-25")).toBe("12 Aug 2025");
    const when = new Date(2026, 7, 12, 20);
    expect(viewingLine({ at: when, plays: 1 }, "2026-09-25")).toBe("12 Aug");
    expect(viewingLine({ at: when, plays: 2 }, "2026-09-25")).toBe("12 Aug · rewatched");
    expect(viewingLine({ at: when, plays: 3 }, "2026-09-25")).toBe("12 Aug · ×3");
  });

  it("stacks three faces, then counts the rest, and names everyone for a screen reader", () => {
    const people = ["Jason", "Soraya", "Tom", "Eva", "Ruben"].map((name, i) => ({ id: String(i), name, avatar: null }));
    expect(avatarStack(people.slice(0, 2))).toEqual({ shown: people.slice(0, 2), more: 0, label: "Watched by Jason and Soraya" });
    expect(avatarStack(people.slice(0, 3)).more).toBe(0);
    const five = avatarStack(people);
    expect(five.shown.map((p) => p.name)).toEqual(["Jason", "Soraya", "Tom"]);
    expect(five.more).toBe(2);
    expect(five.label).toBe("Watched by Jason, Soraya, Tom, Eva and Ruben");
  });
});

describe("how far a friend is", () => {
  const row = (s: number, e: number, when = day(0)) => ({ seasonNumber: s, episodeNumber: e, watchedAt: when, lastWatchedAt: null });
  const aired = new Set(["1:1", "1:2", "2:1", "2:2"]);

  it("is finished with every aired episode, whatever else is announced or skipped among the specials", () => {
    const p = progressOf([row(1, 1), row(1, 2), row(2, 1), row(2, 2), row(0, 3)], aired)!;
    expect(p.finished).toBe(true);
    expect(progressLine(p, "2026-05-20")).toBe("Finished");
  });

  it("is otherwise at their furthest episode, not their latest, with when they saw it", () => {
    const p = progressOf([row(2, 1, day(1)), row(1, 1, day(5))], aired)!;
    expect(p.finished).toBe(false);
    expect(p.furthest).toMatchObject({ season: 2, episode: 1 });
    expect(p.at).toEqual(day(5));
    expect(progressLine(p, "2026-05-20")).toBe(`S02 · E01 · ${friendDay(day(1), "2026-05-20")}`);
  });

  it("is never finished against a show with no stored episodes, and absent with only specials seen", () => {
    expect(progressOf([row(1, 1)], new Set())!.finished).toBe(false);
    expect(progressOf([row(0, 1)], aired)).toBeNull();
  });
});

describe("friends who watched, from the rows", () => {
  it("lists a film's friends newest first, with rewatches and ratings, and nobody who is not a friend", async () => {
    const [me, anna, eva, stranger, asked] = [await freshUser(), await freshUser(), await freshUser(), await freshUser(), await freshUser()];
    await befriend(me.id, anna.id);
    await befriend(eva.id, me.id);
    // A request not yet answered is not a friendship, from either end.
    await requestFriend(me.id, asked.id);

    const heat = film({ tmdbId: 949, title: "Heat" });
    await recordPlay(anna.id, { ...heat, watchedAt: day(0) });
    await recordPlay(anna.id, { ...heat, watchedAt: day(3) });
    await recordPlay(anna.id, { ...heat, watchedAt: day(4) });
    await recordPlay(eva.id, { ...heat, watchedAt: day(6) });
    await recordPlay(stranger.id, { ...heat, watchedAt: day(7) });
    await recordPlay(asked.id, { ...heat, watchedAt: day(8) });
    await recordPlay(me.id, { ...heat, watchedAt: day(9) });
    await db.rating.create({ data: { userId: anna.id, mediaType: "movie", tmdbId: 949, title: "Heat", score: 5 } });
    await db.rating.create({ data: { userId: stranger.id, mediaType: "movie", tmdbId: 949, title: "Heat", score: 1 } });

    const rows = await friendsWhoWatchedFilm(me.id, 949);
    expect(rows.map((r) => [r.friend.id, r.plays, r.score])).toEqual([
      [eva.id, 1, null],
      [anna.id, 3, 5],
    ]);
    expect(rows[1].at).toEqual(day(4));

    // Their side of it is the same friendship, seen from the other end.
    expect((await friendsWhoWatchedFilm(anna.id, 949)).map((r) => r.friend.id)).toEqual([me.id]);
    expect(await friendsWhoWatchedFilm(stranger.id, 949)).toEqual([]);
  });

  it("gives a show's friends their progress and rating, and a season's faces per episode, from friends alone", async () => {
    const [me, anna, eva, stranger] = [await freshUser(), await freshUser(), await freshUser(), await freshUser()];
    await befriend(me.id, anna.id);
    await befriend(me.id, eva.id);
    const showId = 700001;
    await seedEpisodes(showId, [
      { season: 1, count: 3, airedFrom: "2026-01-01" },
      { season: 2, count: 2, airedFrom: "2099-01-01" },
    ]);
    const ep = (s: number, e: number) => episode(s, e, { tmdbId: showId, title: "Lanterns" });

    for (let e = 1; e <= 3; e++) await recordPlay(anna.id, { ...ep(1, e), watchedAt: day(e) });
    await recordPlay(eva.id, { ...ep(1, 2), watchedAt: day(10) });
    await recordPlay(eva.id, { ...ep(1, 1), watchedAt: day(11) });
    await recordPlay(stranger.id, { ...ep(1, 1), watchedAt: day(12) });
    await db.rating.create({ data: { userId: anna.id, mediaType: "tv", tmdbId: showId, title: "Lanterns", score: 4 } });

    const progress = await friendsProgress(me.id, showId, "2026-05-20");
    expect(progress.map((p) => [p.friend.id, p.finished, p.furthest?.episode, p.score])).toEqual([
      [eva.id, false, 2, null],
      // Every aired episode: the second season is announced, not out.
      [anna.id, true, 3, 4],
    ]);

    const faces = await friendsBySeasonEpisode(me.id, showId, 1);
    expect(faces.get(1)?.map((p) => p.id)).toEqual([eva.id, anna.id]);
    expect(faces.get(2)?.map((p) => p.id)).toEqual([eva.id, anna.id]);
    expect(faces.get(3)?.map((p) => p.id)).toEqual([anna.id]);
    expect([...faces.values()].flat().some((p) => p.id === stranger.id)).toBe(false);

    await db.episodeRating.create({
      data: { userId: eva.id, showId, seasonNumber: 1, episodeNumber: 1, liked: true, score: 2 },
    });
    await recordPlay(eva.id, { ...ep(1, 1), watchedAt: day(13) });
    const one = await friendsWhoWatchedEpisode(me.id, showId, 1, 1);
    expect(one.map((r) => [r.friend.id, r.plays, r.score])).toEqual([
      [eva.id, 2, 2],
      [anna.id, 1, null],
    ]);
  });
});
