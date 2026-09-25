import { beforeEach, describe, expect, it } from "vitest";
import { getAgenda, getComingUp, getLandingSoon } from "@/lib/calendar";
import { addDays, resolveWeek, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { recomputeTitleState } from "@/lib/title-state";
import { episode, freshUser } from "./helpers/db";

/**
 * What counts as landing, on one household's worth of fixture: a returning
 * show part-way through, an ended show, a film on the watchlist with cinema
 * and streaming dates, a watchlisted show premiering from its episode list,
 * and an announced one known only by its first air date.
 */

const today = todayKey();
const d = (n: number) => addDays(today, n);

const RETURNING = 100;
const ENDED = 200;
const PREMIERE = 300;
const ANNOUNCED = 400;
const FILM = 500;

let userId: string;

async function episodes(showId: number, list: [season: number, number: number, airDate: string | null][]) {
  await db.showEpisode.createMany({
    data: list.map(([seasonNumber, episodeNumber, airDate]) => ({
      showId,
      seasonNumber,
      episodeNumber,
      name: `${showId} ${seasonNumber}x${episodeNumber}`,
      airDate,
      runtime: 45,
      episodeType: seasonNumber === 2 && episodeNumber === 4 ? "finale" : null,
    })),
  });
}

beforeEach(async () => {
  userId = (await freshUser()).id;

  // Returning: season 1 aired, season 2 airing weekly from yesterday, with
  // today's episode, one in two days and one in nine.
  await episodes(RETURNING, [
    [1, 1, d(-60)],
    [1, 2, d(-53)],
    [2, 1, d(-1)],
    [2, 2, today],
    [2, 3, d(2)],
    [2, 4, d(9)],
  ]);
  for (const [s, e] of [
    [1, 1],
    [1, 2],
    [2, 1],
  ]) {
    await recordPlay(userId, { ...episode(s, e, { tmdbId: RETURNING, title: "Returning" }), watchedAt: new Date() });
  }

  // Ended: everything aired long ago, half of it watched.
  await episodes(ENDED, [
    [1, 1, d(-400)],
    [1, 2, d(-393)],
  ]);
  await recordPlay(userId, { ...episode(1, 1, { tmdbId: ENDED, title: "Ended" }), watchedAt: new Date() });

  // A show on the watchlist that starts in four days.
  await episodes(PREMIERE, [
    [1, 1, d(4)],
    [1, 2, d(11)],
  ]);
  await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: PREMIERE, title: "Premiere" } });
  await recomputeTitleState(db, userId, PREMIERE);

  // Announced: on the watchlist, a first air date, no episodes published.
  await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: ANNOUNCED, title: "Announced" } });
  await recomputeTitleState(db, userId, ANNOUNCED);
  await db.titleState.update({
    where: { userId_showId: { userId, showId: ANNOUNCED } },
    data: { premiereDate: d(6) },
  });

  // A film: in cinemas in three days, streaming in five weeks.
  await db.watchlistItem.create({
    data: {
      userId,
      mediaType: "movie",
      tmdbId: FILM,
      title: "Film",
      releaseDate: d(3),
      streamingDate: d(35),
    },
  });
});

describe("the agenda for a span", () => {
  it("lists every arrival in date order, with ticks for what is watched", async () => {
    const agenda = await getAgenda(userId, d(-1), d(9));
    expect(agenda.map((l) => [l.date, l.kind, l.tmdbId, l.episodeNumber, l.watched])).toEqual([
      [d(-1), "episode", RETURNING, 1, true],
      [today, "episode", RETURNING, 2, false],
      [d(2), "episode", RETURNING, 3, false],
      [d(3), "cinema", FILM, null, false],
      [d(4), "episode", PREMIERE, 1, false],
      [d(6), "premiere", ANNOUNCED, 1, false],
      [d(9), "episode", RETURNING, 4, false],
    ]);
  });

  it("tags premieres and finales, and leaves ended shows off", async () => {
    const agenda = await getAgenda(userId, d(-500), d(40));
    const tag = (id: number, e: number | null) => agenda.find((l) => l.tmdbId === id && l.episodeNumber === e)?.tag;
    expect(tag(PREMIERE, 1)).toBe("series-premiere");
    expect(tag(RETURNING, 1)).toBe("series-premiere");
    expect(agenda.find((l) => l.tmdbId === RETURNING && l.seasonNumber === 2 && l.episodeNumber === 1)?.tag).toBe(
      "season-premiere",
    );
    expect(tag(RETURNING, 4)).toBe("finale");
    // Ended only has episodes in the past, which is the point: nothing comes.
    expect(agenda.filter((l) => l.tmdbId === ENDED && l.date >= today)).toEqual([]);
    expect(agenda.filter((l) => l.tmdbId === FILM).map((l) => l.kind)).toEqual(["cinema", "streaming"]);
  });

  it("stands the first-air-date premiere aside once the episode has a date of its own", async () => {
    await episodes(ANNOUNCED, [[1, 1, d(7)]]);
    const agenda = await getAgenda(userId, today, d(9));
    expect(agenda.filter((l) => l.tmdbId === ANNOUNCED).map((l) => [l.kind, l.date])).toEqual([["episode", d(7)]]);
  });

  it("leaves dropped shows out", async () => {
    await db.droppedShow.create({ data: { userId, showId: RETURNING, showName: "Returning" } });
    const agenda = await getAgenda(userId, d(-1), d(9));
    expect(agenda.some((l) => l.tmdbId === RETURNING)).toBe(false);
  });
});

describe("Landing soon", () => {
  it("is the first unwatched arrival per title in the next three weeks, less today's Up next", async () => {
    const landing = await getLandingSoon(userId, today);
    expect(landing.map((l) => [l.tmdbId, l.kind, l.date])).toEqual([
      // Today's episode of a show being watched is Up next's, so this starts at E3.
      [RETURNING, "episode", d(2)],
      [FILM, "cinema", d(3)],
      [PREMIERE, "episode", d(4)],
      [ANNOUNCED, "premiere", d(6)],
    ]);
  });

  it("reaches 21 days from today, not just this week", async () => {
    const at = async (n: number) => {
      await db.watchlistItem.update({
        where: { userId_mediaType_tmdbId: { userId, mediaType: "movie", tmdbId: FILM } },
        data: { releaseDate: d(n) },
      });
      return (await getLandingSoon(userId, today)).find((l) => l.tmdbId === FILM)?.date;
    };
    expect(await at(20)).toBe(d(20));
    expect(await at(21)).toBeUndefined();
  });

  it("drops a watched episode and moves to the next", async () => {
    await recordPlay(userId, { ...episode(2, 3, { tmdbId: RETURNING, title: "Returning" }) });
    const landing = await getLandingSoon(userId, today);
    expect(landing.find((l) => l.tmdbId === RETURNING)?.episodeNumber).toBe(4);
  });

  it("offers Coming up after the week on screen, with the film's streaming date", async () => {
    const week = resolveWeek(undefined, today);
    const coming = await getComingUp(userId, week.end, today);
    expect(coming.every((l) => l.date > week.end)).toBe(true);
    // One entry per title: its first date after the week, cinema or streaming.
    expect(coming.filter((l) => l.tmdbId === FILM).map((l) => l.date)).toEqual([d(3) > week.end ? d(3) : d(35)]);
  });
});
