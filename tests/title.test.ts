import { beforeEach, describe, expect, it } from "vitest";
import { fillDown } from "@/lib/columns";
import { addDays, todayKey } from "@/lib/dates";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { hoursAndMinutes, openingSeason, progressVerdict, seasonToCome } from "@/lib/progress";
import { minutesWatched } from "@/lib/title";
import { expandProviders, requestNeedsConfirming, subscribedAmong } from "@/lib/providers";
import {
  canStopWatching,
  episodeRatingOf,
  markEpisode,
  markFilm,
  markSeason,
  ratingOf,
  setEpisodeRating,
  setRating,
  showLeavesWatchlist,
} from "@/lib/title-writes";
import { cacheKey, tvDetailsKey, type MovieDetails, type TvDetails } from "@/lib/tmdb";
import { episode, freshUser, seedEpisodes } from "./helpers/db";

/**
 * The title pages' rules: which progress panel a show gets, when watching
 * something takes it off the watchlist, what "Mark whole season" logs, the
 * popcorn rating's range, and when a request asks first.
 */

const today = todayKey();
const SHOW = 4200;

type Facts = Pick<TvDetails, "status" | "last_episode_to_air" | "next_episode_to_air" | "seasons">;

function season(n: number, count: number) {
  return { id: n, season_number: n, name: `Season ${n}`, episode_count: count, poster_path: null, air_date: null };
}

function ep(season: number, episode: number, air: string | null = null) {
  return { season_number: season, episode_number: episode, air_date: air };
}

/** Stores a show's details in the TMDB cache, where the writes read its name and status. */
async function cacheShow(status: string, seasons = [season(1, 3)]) {
  const { path, params } = tvDetailsKey(SHOW);
  const details = { id: SHOW, name: "Lanterns", poster_path: "/l.jpg", status, seasons };
  await db.tmdbCache.create({
    data: { key: cacheKey(path, params), body: JSON.stringify(details), expiresAt: new Date(Date.now() + 3_600_000) },
  });
}

let userId: string;
beforeEach(async () => {
  userId = (await freshUser()).id;
});

describe("the progress panel's verdict", () => {
  const base = { airedCount: 8, ended: false, seasonToCome: false };

  it("is the bar while there are aired episodes left", () => {
    expect(progressVerdict({ ...base, watchedCount: 4 })).toBe("bar");
    expect(progressVerdict({ ...base, watchedCount: 4, ended: true })).toBe("bar");
    expect(progressVerdict({ ...base, watchedCount: 4, seasonToCome: true })).toBe("bar");
  });

  it("is \"That's it, folks\" once caught up on a show that has ended", () => {
    expect(progressVerdict({ ...base, watchedCount: 8, ended: true })).toBe("finished");
  });

  it("is \"More to come\" once caught up with a season on the way", () => {
    expect(progressVerdict({ ...base, watchedCount: 8, seasonToCome: true })).toBe("more");
  });

  it("stays the bar when caught up mid-season, and before anything has aired", () => {
    expect(progressVerdict({ ...base, watchedCount: 8 })).toBe("bar");
    expect(progressVerdict({ ...base, airedCount: 0, watchedCount: 0, ended: true })).toBe("bar");
  });

  it("counts a new season, not the next week of this one, as more to come", () => {
    const airing: Facts = {
      status: "Returning Series",
      seasons: [season(1, 8), season(2, 8)],
      last_episode_to_air: ep(2, 3),
      next_episode_to_air: ep(2, 4),
    };
    expect(seasonToCome(airing)).toBe(false);

    const between: Facts = { ...airing, last_episode_to_air: ep(2, 8), next_episode_to_air: ep(3, 1) };
    expect(seasonToCome(between)).toBe(true);

    // Renewed with no date: still coming, eventually.
    expect(seasonToCome({ ...between, next_episode_to_air: null })).toBe(true);
    // Over is over.
    expect(seasonToCome({ ...between, status: "Ended" })).toBe(false);
    expect(seasonToCome({ ...between, status: "Canceled", next_episode_to_air: null })).toBe(false);
  });
});

describe("leaving the watchlist", () => {
  it("is for a show only when every aired episode is seen and the show is over", () => {
    expect(showLeavesWatchlist({ status: "ended", airedCount: 10, watchedCount: 10 })).toBe(true);
    expect(showLeavesWatchlist({ status: "cancelled", airedCount: 10, watchedCount: 10 })).toBe(true);
    expect(showLeavesWatchlist({ status: "returning", airedCount: 10, watchedCount: 10 })).toBe(false);
    expect(showLeavesWatchlist({ status: "ended", airedCount: 10, watchedCount: 9 })).toBe(false);
    expect(showLeavesWatchlist({ status: "ended", airedCount: 0, watchedCount: 0 })).toBe(false);
  });

  it("takes a film off at once", async () => {
    await db.watchlistItem.create({ data: { userId, mediaType: "movie", tmdbId: 550, title: "Fight Club" } });
    const film = { id: 550, title: "Fight Club", poster_path: null, runtime: 139, vote_average: 8.4, vote_count: 3000 } as MovieDetails;
    const result = await markFilm(userId, film);
    expect(result.created).toBe(true);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(0);
    expect(await db.watchedMovie.findFirst({ where: { userId, movieId: 550 } })).toMatchObject({ score: 84, runtime: 139 });
  });

  it("takes an ended show off with its last episode, and not before", async () => {
    await cacheShow("Ended");
    await seedEpisodes(SHOW, [{ season: 1, count: 3, airedFrom: addDays(today, -60) }]);
    await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: SHOW, title: "Lanterns" } });

    await markEpisode(userId, SHOW, 1, 1);
    await markEpisode(userId, SHOW, 1, 2);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(1);
    await markEpisode(userId, SHOW, 1, 3);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(0);
  });

  it("keeps a returning show you are caught up on", async () => {
    await cacheShow("Returning Series");
    await seedEpisodes(SHOW, [{ season: 1, count: 2, airedFrom: addDays(today, -60) }]);
    await db.watchlistItem.create({ data: { userId, mediaType: "tv", tmdbId: SHOW, title: "Lanterns" } });
    await markSeason(userId, SHOW, 1);
    expect(await db.watchlistItem.count({ where: { userId } })).toBe(1);
  });

  it("offers Stop watching except on a finished show watched to the end", () => {
    expect(canStopWatching(null)).toBe(true);
    expect(canStopWatching({ status: "returning", airedCount: 5, watchedCount: 5 })).toBe(true);
    expect(canStopWatching({ status: "ended", airedCount: 5, watchedCount: 3 })).toBe(true);
    expect(canStopWatching({ status: "ended", airedCount: 5, watchedCount: 5 })).toBe(false);
  });
});

describe("Mark whole season", () => {
  beforeEach(async () => {
    await cacheShow("Returning Series", [season(1, 4), season(2, 2)]);
    // Season 1: three aired, one a week from now. Season 2 later.
    await seedEpisodes(SHOW, [
      { season: 1, count: 4, airedFrom: addDays(today, -20) },
      { season: 2, count: 2, airedFrom: addDays(today, 60) },
    ]);
  });

  it("logs the aired gaps only, and moves TitleState on", async () => {
    const first = new Date(Date.now() - 10 * 86_400_000);
    await recordPlay(userId, {
      mediaType: "tv",
      tmdbId: SHOW,
      seasonNumber: 1,
      episodeNumber: 1,
      title: "Lanterns",
      watchedAt: first,
    });

    expect(await markSeason(userId, SHOW, 1)).toBe(2);

    const plays = await db.play.findMany({ where: { userId, tmdbId: SHOW }, orderBy: { episodeNumber: "asc" } });
    expect(plays.map((p) => p.episodeNumber)).toEqual([1, 2, 3]);
    // The episode already seen keeps the date it was first watched.
    expect(plays[0].watchedAt).toEqual(first);
    expect(plays[1]).toMatchObject({ title: "Lanterns", poster: null, episodeName: "S1E2", runtime: 45, source: "manual" });

    const state = await db.titleState.findUniqueOrThrow({ where: { userId_showId: { userId, showId: SHOW } } });
    expect(state).toMatchObject({ watchedCount: 3, airedCount: 3, totalCount: 6, nextSeason: 1, nextEpisode: 4 });
    const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user).toMatchObject({ watchedEpisodeCount: 3, playCount: 3 });
  });

  it("does nothing the second time", async () => {
    expect(await markSeason(userId, SHOW, 1)).toBe(3);
    expect(await markSeason(userId, SHOW, 1)).toBe(0);
    expect(await db.play.count({ where: { userId } })).toBe(3);
  });

  it("logs nothing for a season that has not aired", async () => {
    expect(await markSeason(userId, SHOW, 2)).toBe(0);
    expect(await db.titleState.count({ where: { userId } })).toBe(0);
  });

  it("refuses a single episode that has not aired", async () => {
    expect(await markEpisode(userId, SHOW, 1, 4)).toBeNull();
    expect(await db.play.count({ where: { userId } })).toBe(0);
  });
});

describe("popcorn ratings", () => {
  it("writes, reads, changes and clears a title's rating", async () => {
    const d = { title: "Lanterns", poster: null };
    expect(await ratingOf(userId, "tv", SHOW)).toBeNull();
    expect(await setRating(userId, "tv", SHOW, 4, d)).toBe(true);
    expect(await ratingOf(userId, "tv", SHOW)).toBe(4);
    expect(await setRating(userId, "tv", SHOW, 5, d)).toBe(true);
    expect(await ratingOf(userId, "tv", SHOW)).toBe(5);
    expect(await db.rating.count({ where: { userId } })).toBe(1);
    expect(await setRating(userId, "tv", SHOW, null, d)).toBe(true);
    expect(await ratingOf(userId, "tv", SHOW)).toBeNull();
  });

  it("refuses anything but a whole bucket from one to five", async () => {
    const d = { title: "Lanterns", poster: null };
    for (const bad of [0, 6, 2.5, -1]) expect(await setRating(userId, "tv", SHOW, bad, d)).toBe(false);
    expect(await db.rating.count({ where: { userId } })).toBe(0);
  });

  it("rates an episode, keeping the current app's thumb in step", async () => {
    expect(await setEpisodeRating(userId, SHOW, 1, 5, 2)).toBe(true);
    expect(await episodeRatingOf(userId, SHOW, 1, 5)).toBe(2);
    expect(await db.episodeRating.findFirst({ where: { userId } })).toMatchObject({ liked: false });
    await setEpisodeRating(userId, SHOW, 1, 5, 4);
    expect(await db.episodeRating.findFirst({ where: { userId } })).toMatchObject({ score: 4, liked: true });
    await setEpisodeRating(userId, SHOW, 1, 5, null);
    expect(await episodeRatingOf(userId, SHOW, 1, 5)).toBeNull();
  });
});

describe("the request warning", () => {
  const offers = [
    { id: 119, name: "Amazon Prime Video" },
    { id: 8, name: "Netflix" },
    { id: 337, name: "Disney Plus" },
  ];

  it("names the services they pay for that already have it", () => {
    expect(subscribedAmong([8], offers)).toEqual(["Netflix"]);
    // Prime is chosen as 9 but TMDB listed it under 119: still a match.
    expect(subscribedAmong([9, 8], offers)).toEqual(["Prime Video", "Netflix"]);
    expect(expandProviders([9]).has(119)).toBe(true);
  });

  it("names a service once however many ways TMDB lists it", () => {
    const both = [
      { id: 8, name: "Netflix" },
      { id: 1796, name: "Netflix Standard with Ads" },
    ];
    expect(subscribedAmong([8], both)).toEqual(["Netflix"]);
  });

  it("asks first only when something they pay for has it", () => {
    expect(requestNeedsConfirming(subscribedAmong([8], offers))).toBe(true);
    expect(requestNeedsConfirming(subscribedAmong([350], offers))).toBe(false);
    expect(requestNeedsConfirming(subscribedAmong([], offers))).toBe(false);
    expect(requestNeedsConfirming(subscribedAmong([8], []))).toBe(false);
  });
});

describe("the episode list's two columns", () => {
  const codes = (n: number) => Array.from({ length: n }, (_, i) => `E${String(i + 1).padStart(2, "0")}`);

  it("fills down the left column first, so the numbers read downwards", () => {
    expect(fillDown(codes(8))).toEqual([
      ["E01", "E02", "E03", "E04"],
      ["E05", "E06", "E07", "E08"],
    ]);
  });

  it("puts the odd one out on the left, and copes with one or none", () => {
    expect(fillDown(codes(7))).toEqual([
      ["E01", "E02", "E03", "E04"],
      ["E05", "E06", "E07"],
    ]);
    expect(fillDown(codes(1))).toEqual([["E01"], []]);
    expect(fillDown([])).toEqual([[], []]);
  });

  it("reads in plain order when the columns stack on a phone", () => {
    expect(fillDown(codes(9)).flat()).toEqual(codes(9));
  });
});

describe("the season a show's page opens on", () => {
  const past = addDays(today, -30);
  const soon = addDays(today, 7);
  /** Three seasons of three; the third's last episode has not aired. */
  const stored = [1, 2, 3].flatMap((s) =>
    [1, 2, 3].map((e) => ({ seasonNumber: s, episodeNumber: e, airDate: s === 3 && e === 3 ? soon : past })),
  );
  const base = { seasons: [1, 2, 3], stored, today, fallback: null, lastAiredSeason: 3 };
  const seen = (...keys: string[]) => new Set(keys);

  it("is the season holding the next aired episode not yet seen", () => {
    expect(openingSeason({ ...base, seen: seen("1:1", "1:2", "1:3", "2:1") })).toBe(2);
    expect(openingSeason({ ...base, seen: seen("1:1", "1:2") })).toBe(1);
  });

  it("goes back to a gap left earlier, as the up-next row does", () => {
    expect(openingSeason({ ...base, seen: seen("1:1", "1:3", "2:1", "2:2", "2:3") })).toBe(1);
  });

  it("is the latest aired season once caught up", () => {
    const all = seen("1:1", "1:2", "1:3", "2:1", "2:2", "2:3", "3:1", "3:2");
    expect(openingSeason({ ...base, seen: all })).toBe(3);
    // A fourth season announced but not out yet does not pull the page past what aired.
    const announced = [...stored, { seasonNumber: 4, episodeNumber: 1, airDate: soon }];
    expect(openingSeason({ ...base, seasons: [1, 2, 3, 4], stored: announced, seen: all })).toBe(3);
  });

  it("is the first season for somebody who has not started, specials aside", () => {
    expect(openingSeason({ ...base, seen: seen() })).toBe(1);
    expect(openingSeason({ ...base, seen: seen("0:1") })).toBe(1);
    expect(openingSeason({ ...base, seasons: [], seen: seen() })).toBe(1);
  });

  it("falls back to TitleState and TMDB's last aired season before the episodes are kept", () => {
    const none = { ...base, stored: [] };
    expect(openingSeason({ ...none, seen: seen("1:1"), fallback: { season: 2, airDate: past } })).toBe(2);
    // The next one is unaired: caught up, so the last season TMDB says aired.
    expect(openingSeason({ ...none, seen: seen("1:1"), fallback: { season: 3, airDate: soon }, lastAiredSeason: 2 })).toBe(2);
    expect(openingSeason({ ...none, seen: seen("2:1"), lastAiredSeason: null })).toBe(2);
  });
});

describe("the progress panel's time watched", () => {
  it("adds each episode seen once at its own runtime, leaving out specials and rewatches", async () => {
    const userId = (await freshUser()).id;
    const show = { tmdbId: SHOW + 7, title: "Timed" };
    await recordPlay(userId, { ...episode(1, 1, { ...show, runtime: 50 }), watchedAt: new Date("2026-05-01T20:00:00Z") });
    await recordPlay(userId, { ...episode(1, 2, { ...show, runtime: 40 }), watchedAt: new Date("2026-05-02T20:00:00Z") });
    // A rewatch days later is another play, not more time on the show.
    await recordPlay(userId, { ...episode(1, 1, { ...show, runtime: 50 }), watchedAt: new Date("2026-05-09T20:00:00Z") });
    // A special is outside the numbered seasons the panel counts.
    await recordPlay(userId, { ...episode(0, 1, { ...show, runtime: 90 }), watchedAt: new Date("2026-05-03T20:00:00Z") });

    expect(await minutesWatched(userId, SHOW + 7)).toBe(90);
    expect(hoursAndMinutes(await minutesWatched(userId, SHOW + 7))).toBe("1h 30m");
    expect(await minutesWatched(userId, SHOW + 8)).toBe(0);
  });
});
