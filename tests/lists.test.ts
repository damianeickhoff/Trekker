import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { LIST_SORTS, parseListSort, parseWatchlistSort, sortHref, sortRows, WATCHLIST_SORTS } from "@/lib/list-sorts";
import { addToList, listDetail, removeFromList, requestPlan, saveLists, streamingNow, watchlistRows } from "@/lib/lists";
import { recordPlay } from "@/lib/plays";
import { enrichWatchlist, ENRICH_AFTER_MS, ENRICH_PER_RUN, queue, rebuildSmartLists } from "@/lib/refresh";
import { saveBehaviour } from "@/lib/save-behaviour";
import { DEFAULT_FILTERS, parseFilters, sentence, type SmartFilters } from "@/lib/smart-filters";
import { rebuildSmartList, runSmartList, SMART_LIST_SIZE } from "@/lib/smart-lists";
import { discoverParams, genresWithoutTv, matchLine, matchTotal, mediumApplies, MATCH_CAP, tvNote, VOTE_FLOOR } from "@/lib/smart-query";
import { film, freshUser, T0 } from "./helpers/db";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * Lists and smart lists: the discover query each filter builds, the two
 * exceptions to it (Trending, and genres television has no equivalent for),
 * the sort orders, Save's two behaviours, the rebuild, Request all's plan and
 * the watchlist enrichment's staleness rule. TMDB is stubbed throughout.
 */

const CONTEXT = { region: "GB", today: "2026-09-23" };
const f = (patch: Partial<SmartFilters> = {}): SmartFilters => ({ ...DEFAULT_FILTERS, ...patch });

let stub: ReturnType<typeof stubTmdb> | null = null;
afterEach(async () => {
  await queue.idle();
  stub?.restore();
  stub = null;
});

let userId: string;
beforeEach(async () => {
  userId = (await freshUser()).id;
});

// ---------------------------------------------------------------------------

describe("the discover query", () => {
  it("runs Anything with no vote floor, and Popular with one: the only difference", () => {
    const anything = discoverParams(f({ source: "all" }), "movie", CONTEXT)!;
    const popular = discoverParams(f({ source: "popular" }), "movie", CONTEXT)!;
    expect(anything).toEqual({ sort_by: "popularity.desc" });
    expect(popular).toEqual({ sort_by: "popularity.desc", "vote_count.gte": String(VOTE_FLOOR.movie) });
    expect(discoverParams(f({ source: "popular", kind: "tv" }), "tv", CONTEXT)!["vote_count.gte"]).toBe(String(VOTE_FLOOR.tv));
  });

  it("orders each shelf its own way", () => {
    expect(discoverParams(f({ source: "top-rated" }), "movie", CONTEXT)).toMatchObject({
      sort_by: "vote_average.desc",
      "vote_count.gte": "300",
    });
    expect(discoverParams(f({ source: "upcoming" }), "movie", CONTEXT)).toMatchObject({
      sort_by: "primary_release_date.asc",
      "primary_release_date.gte": CONTEXT.today,
    });
    expect(discoverParams(f({ source: "newest", kind: "tv" }), "tv", CONTEXT)).toMatchObject({
      sort_by: "first_air_date.desc",
      "first_air_date.lte": CONTEXT.today,
    });
  });

  it("asks only for the kinds chosen", () => {
    expect(discoverParams(f({ kind: "movie" }), "tv", CONTEXT)).toBeNull();
    expect(discoverParams(f({ kind: "tv" }), "movie", CONTEXT)).toBeNull();
    expect(discoverParams(f({ kind: "both" }), "tv", CONTEXT)).not.toBeNull();
  });

  it("needs every genre, in each medium's own ids", () => {
    const both = f({ kind: "both", genres: ["sci-fi", "comedy"] });
    expect(discoverParams(both, "movie", CONTEXT)!.with_genres).toBe("878,35");
    expect(discoverParams(both, "tv", CONTEXT)!.with_genres).toBe("10765,35");
  });

  it("takes any one service, every id TMDB files it under, in the viewer's region", () => {
    const p = discoverParams(f({ providers: [8, 11] }), "movie", CONTEXT)!;
    expect(p.with_watch_providers.split("|").sort()).toEqual(["11", "1796", "8"]);
    expect(p.watch_region).toBe("GB");
  });

  it("puts people on films only, and drops the shows half for them", () => {
    const cast = f({ kind: "both", cast: [{ id: 17419, name: "Bryan Cranston" }] });
    expect(discoverParams(cast, "movie", CONTEXT)!.with_cast).toBe("17419");
    expect(discoverParams(cast, "tv", CONTEXT)).toBeNull();
  });

  it("asks for certificates on films only, on the viewer's board", () => {
    const certs = f({ kind: "both", certifications: ["12", "15"] });
    expect(discoverParams(certs, "movie", CONTEXT)).toMatchObject({ certification_country: "GB", certification: "12|15" });
    const tv = discoverParams(certs, "tv", CONTEXT)!;
    expect(tv.certification).toBeUndefined();
    expect(tv.certification_country).toBeUndefined();
  });

  it("applies each status to the medium it describes, and drops a medium none describe", () => {
    expect(discoverParams(f({ statuses: ["released"] }), "movie", CONTEXT)!["primary_release_date.lte"]).toBe(CONTEXT.today);
    expect(discoverParams(f({ statuses: ["unreleased"] }), "movie", CONTEXT)!["primary_release_date.gte"]).toBe(CONTEXT.today);
    // Both is no constraint at all.
    expect(discoverParams(f({ statuses: ["released", "unreleased"] }), "movie", CONTEXT)).toEqual({ sort_by: "popularity.desc" });
    const tvOnly = f({ kind: "both", statuses: ["returning", "ended"] });
    expect(discoverParams(tvOnly, "tv", CONTEXT)!.with_status).toBe("0|3");
    expect(discoverParams(tvOnly, "movie", CONTEXT)).toBeNull();
  });

  it("reads years from the decade in simple mode and the slider in advanced", () => {
    expect(discoverParams(f({ decade: 1990 }), "movie", CONTEXT)).toMatchObject({
      "primary_release_date.gte": "1990-01-01",
      "primary_release_date.lte": "1999-12-31",
    });
    const advanced = discoverParams(f({ mode: "advanced", decade: 1990, yearMin: 2015 }), "tv", { ...CONTEXT });
    expect(advanced).toBeNull(); // kind is films
    const shows = discoverParams(f({ kind: "tv", mode: "advanced", decade: 1990, yearMin: 2015 }), "tv", CONTEXT)!;
    expect(shows["first_air_date.gte"]).toBe("2015-01-01");
    // The top of the slider is "and up", not a limit; the stored decade is ignored.
    expect(shows["first_air_date.lte"]).toBeUndefined();
  });

  it("reads the score as the rounded percentage posters show, with no vote floor of its own", () => {
    const floored = discoverParams(f({ scoreMin: 70 }), "movie", CONTEXT)!;
    expect(floored["vote_average.gte"]).toBe("6.95");
    expect(floored["vote_count.gte"]).toBeUndefined();
    const capped = discoverParams(f({ scoreMax: 60 }), "movie", CONTEXT)!;
    expect(capped["vote_average.lte"]).toBe("6.0499");
    expect(capped["vote_count.gte"]).toBeUndefined();
  });

  it("reads length from the simple maximum, or both ends of the slider", () => {
    expect(discoverParams(f({ maxRuntime: 90 }), "movie", CONTEXT)!["with_runtime.lte"]).toBe("90");
    expect(discoverParams(f({ mode: "advanced", runtimeMin: 60, runtimeMax: 120 }), "movie", CONTEXT)).toMatchObject({
      "with_runtime.gte": "60",
      "with_runtime.lte": "120",
    });
  });
});

describe("a genre with no television equivalent", () => {
  it("drops the shows half rather than returning unrelated shows, and the editor says so", () => {
    const horror = f({ kind: "both", genres: ["horror", "thriller"] });
    expect(genresWithoutTv(horror)).toEqual(["horror"]);
    expect(mediumApplies(horror, "tv")).toBe(false);
    expect(mediumApplies(horror, "movie")).toBe(true);
    expect(tvNote(horror)).toMatch(/^Horror has no television equivalent/);
    // Films only anyway: nothing to say.
    expect(tvNote(f({ genres: ["horror"] }))).toBeNull();
    expect(mediumApplies(f({ kind: "both", genres: ["thriller"] }), "tv")).toBe(true);
  });
});

describe("reading filters back", () => {
  it("repairs a damaged blob rather than refusing it", () => {
    const repaired = parseFilters(
      JSON.stringify({ kind: "films", source: "popular", genres: ["horror", "nonsense"], scoreMin: 90, scoreMax: 40, providers: ["8", -1] }),
    );
    expect(repaired.kind).toBe("movie");
    expect(repaired.source).toBe("popular");
    expect(repaired.genres).toEqual(["horror"]);
    expect([repaired.scoreMin, repaired.scoreMax]).toEqual([40, 90]);
    expect(repaired.providers).toEqual([8]);
    expect(parseFilters("not json")).toEqual(DEFAULT_FILTERS);
  });

  it("reads the whole question back as one sentence", () => {
    const text = sentence(
      f({ kind: "both", source: "popular", genres: ["horror", "thriller"], providers: [8], scoreMin: 70, mode: "advanced", yearMin: 2015, hideWatched: true }),
    )
      .map((p) => p.text)
      .join("");
    expect(text).toBe(
      "Films and shows that are popular, tagged horror and thriller, on Netflix, rated 70% or better, from 2015 onwards. Leaves out what you have seen.",
    );
  });
});

// ---------------------------------------------------------------------------

function listItem(id: number, patch: Record<string, unknown> = {}) {
  return { id, title: `Film ${id}`, poster_path: `/p${id}.jpg`, vote_average: 7, release_date: "2020-05-01", genre_ids: [27], ...patch };
}

describe("running a smart list", () => {
  it("takes Trending from its own endpoint, filtering genre, score and years itself and ignoring services", async () => {
    const week = [
      listItem(1, { media_type: "movie" }),
      listItem(2, { media_type: "movie", genre_ids: [35] }),
      listItem(3, { media_type: "movie", vote_average: 5 }),
      listItem(4, { media_type: "movie", release_date: "1985-01-01" }),
    ];
    stub = stubTmdb({
      "/trending/movie/week": { page: 1, results: week, total_pages: 1, total_results: 4 },
      "/trending/movie/day": { page: 1, results: [listItem(1, { media_type: "movie" })], total_pages: 1, total_results: 1 },
    });
    const answer = await runSmartList(
      f({ source: "trending", genres: ["horror"], scoreMin: 60, decade: 2020, providers: [8] }),
      20,
      { region: "GB" },
    );
    expect(answer.ok).toBe(true);
    expect(answer.items.map((i) => i.id)).toEqual([1]);
    expect(stub.calls.every((c) => c.startsWith("/trending/"))).toBe(true);
  });

  it("interleaves films and shows, digs until it has enough, and leaves out what was seen", async () => {
    const page = (type: "movie" | "tv") => (url: URL) => {
      const n = Number(url.searchParams.get("page"));
      return {
        page: n,
        total_pages: 5,
        total_results: 100,
        results: Array.from({ length: 20 }, (_, i) => listItem((type === "tv" ? 100000 : 0) + n * 100 + i)),
      };
    };
    stub = stubTmdb({ "/discover/movie": page("movie"), "/discover/tv": page("tv") });
    const answer = await runSmartList(f({ kind: "both", hideWatched: true }), SMART_LIST_SIZE, {
      region: "GB",
      viewer: { watched: new Set(["movie-105"]), saved: new Set() },
    });
    expect(answer.items).toHaveLength(SMART_LIST_SIZE);
    expect(answer.items.slice(0, 2).map((i) => i.mediaType)).toEqual(["movie", "tv"]);
    expect(answer.items.some((i) => i.mediaType === "movie" && i.id === 105)).toBe(false);
    // Two pages of each give 80, enough for sixty.
    expect(stub.count("/discover/movie")).toBe(2);
  });

  it("rebuilds rows in TMDB's order, carries known lengths over, and survives an outage", async () => {
    const list = await db.mediaList.create({
      data: { userId, name: "Horror", kind: "smart", filters: JSON.stringify(f({ genres: ["horror"] })) },
    });
    await db.mediaListItem.create({ data: { listId: list.id, mediaType: "movie", tmdbId: 2, title: "Film 2", runtime: 95 } });
    stub = stubTmdb({
      "/discover/movie": { page: 1, total_pages: 1, total_results: 3, results: [listItem(1), listItem(2), listItem(3)] },
    });
    expect(await rebuildSmartList(list.id)).toMatchObject({ count: 3, ok: true });
    const rows = await db.mediaListItem.findMany({ where: { listId: list.id }, orderBy: { position: "asc" } });
    expect(rows.map((r) => [r.tmdbId, r.position, r.runtime])).toEqual([
      [1, 0, null],
      [2, 1, 95],
      [3, 2, null],
    ]);
    const stamped = (await db.mediaList.findUniqueOrThrow({ where: { id: list.id } })).refreshedAt;
    expect(stamped).not.toBeNull();

    // TMDB down, nothing cached for this question: yesterday's answer stays.
    stub.restore();
    await db.tmdbCache.deleteMany({});
    stub = stubTmdb({ "/discover/movie": () => new Error("down") });
    expect((await rebuildSmartList(list.id)).ok).toBe(false);
    expect(await db.mediaListItem.count({ where: { listId: list.id } })).toBe(3);
    expect((await db.mediaList.findUniqueOrThrow({ where: { id: list.id } })).refreshedAt).toEqual(stamped);
  });

  it("rebuilds every smart list in the daily pass and fills in lengths through the cached details", async () => {
    await db.mediaList.create({ data: { userId, name: "Mine", kind: "manual" } });
    const smart = await db.mediaList.create({ data: { userId, name: "Films", kind: "smart", filters: JSON.stringify(f()) } });
    stub = stubTmdb({
      "/discover/movie": { page: 1, total_pages: 1, total_results: 1, results: [listItem(7)] },
      "/movie/7": { id: 7, title: "Film 7", runtime: 101, vote_average: 7, poster_path: null },
    });
    const result = await rebuildSmartLists();
    expect(result).toMatchObject({ lists: 1, ok: 1 });
    const row = await db.mediaListItem.findFirstOrThrow({ where: { listId: smart.id } });
    expect(row.runtime).toBe(101);
  });
});

// ---------------------------------------------------------------------------

describe("the preview's count", () => {
  it("takes TMDB's total, less what the leave-out toggles dropped, and never fewer than were kept", () => {
    expect(matchTotal({ reported: [348], fetched: 60, kept: 60, exhausted: false })).toBe(348);
    expect(matchTotal({ reported: [120, 80], fetched: 80, kept: 71, exhausted: false })).toBe(191);
    expect(matchTotal({ reported: [10], fetched: 40, kept: 30, exhausted: false })).toBe(30);
  });

  it("counts exactly once every half has been read to its end", () => {
    expect(matchTotal({ reported: [40, 25], fetched: 65, kept: 58, exhausted: true })).toBe(58);
  });

  it("says how many are shown of the total, capped", () => {
    expect(matchLine(20, 348)).toBe("20 of 348 match");
    expect(matchLine(7, 7)).toBe("7 of 7 match");
    expect(matchLine(20, MATCH_CAP)).toBe(`20 of ${MATCH_CAP} match`);
    expect(matchLine(20, MATCH_CAP + 1)).toBe(`20 of ${MATCH_CAP}+ match`);
    expect(matchLine(0, 0)).toBe("0 of 0 match");
  });

  it("sums the film and show halves of a Both list, whatever the list would keep", async () => {
    const page = (type: "movie" | "tv", total: number) => (url: URL) => {
      const n = Number(url.searchParams.get("page"));
      return {
        page: n,
        total_pages: Math.ceil(total / 20),
        total_results: total,
        results: Array.from({ length: 20 }, (_, i) => listItem((type === "tv" ? 100000 : 0) + n * 100 + i)),
      };
    };
    stub = stubTmdb({ "/discover/movie": page("movie", 9000), "/discover/tv": page("tv", 1234) });
    const both = await runSmartList(f({ kind: "both" }), SMART_LIST_SIZE, { region: "GB" });
    expect(both.items).toHaveLength(SMART_LIST_SIZE);
    expect(both.total).toBe(10234);

    const films = await runSmartList(f({ kind: "movie", hideWatched: true }), SMART_LIST_SIZE, {
      region: "GB",
      viewer: { watched: new Set(["movie-105", "movie-106"]), saved: new Set() },
    });
    expect(films.total).toBe(9000 - 2);
  });

  it("counts a short answer exactly, and Trending by what survives its filters", async () => {
    stub = stubTmdb({
      "/discover/movie": { page: 1, total_pages: 1, total_results: 3, results: [listItem(1), listItem(2), listItem(3)] },
      "/trending/movie/week": { page: 1, results: [listItem(1, { media_type: "movie" }), listItem(2, { media_type: "movie", genre_ids: [35] })], total_pages: 1, total_results: 2 },
      "/trending/movie/day": { page: 1, results: [listItem(3, { media_type: "movie" })], total_pages: 1, total_results: 1 },
    });
    const short = await runSmartList(f({ hideWatched: true }), SMART_LIST_SIZE, {
      region: "GB",
      viewer: { watched: new Set(["movie-2"]), saved: new Set() },
    });
    expect(short.total).toBe(2);
    const trending = await runSmartList(f({ source: "trending", genres: ["horror"] }), 1, { region: "GB" });
    expect(trending.items).toHaveLength(1);
    expect(trending.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------

describe("sort orders", () => {
  const rows = [
    { title: "beta", score: 60, runtime: 120, streaming: false, watched: true },
    { title: "Alpha", score: null, runtime: null, streaming: true, watched: false },
    { title: "gamma", score: 90, runtime: 90, streaming: false, watched: false },
  ];
  const titles = (sort: Parameters<typeof sortRows>[1]) => sortRows(rows, sort).map((r) => r.title);

  it("keeps the list's own order by default", () => {
    expect(titles("added")).toEqual(["beta", "Alpha", "gamma"]);
  });
  it("sorts A to Z ignoring case", () => {
    expect(titles("az")).toEqual(["Alpha", "beta", "gamma"]);
  });
  it("puts unknown scores and lengths last either way", () => {
    expect(titles("rated")).toEqual(["gamma", "beta", "Alpha"]);
    expect(titles("short")).toEqual(["gamma", "beta", "Alpha"]);
  });
  it("brings what is streaming now, and what is unseen, to the front and keeps the rest in order", () => {
    expect(titles("streaming")).toEqual(["Alpha", "beta", "gamma"]);
    expect(titles("unseen")).toEqual(["Alpha", "gamma", "beta"]);
  });
  it("reads the order from the address and writes the default without one", () => {
    expect(parseWatchlistSort("short")).toBe("short");
    expect(parseWatchlistSort("nonsense")).toBe("added");
    expect(parseListSort(undefined)).toBe("unseen");
    expect(sortHref("/lists", WATCHLIST_SORTS, "added")).toBe("/lists");
    expect(sortHref("/lists/x", LIST_SORTS, "az")).toBe("/lists/x?sort=az");
  });

  it("counts streaming now against the services this person pays for, or anywhere when they name none", async () => {
    expect(streamingNow({ streaming: "Netflix", streamingIds: "1796" }, new Set([8, 1796]))).toBe(true);
    expect(streamingNow({ streaming: "MUBI", streamingIds: "11" }, new Set([8, 1796]))).toBe(false);
    expect(streamingNow({ streaming: "MUBI", streamingIds: "11" }, new Set())).toBe(true);
    expect(streamingNow({ streaming: "", streamingIds: "" }, new Set())).toBe(false);

    await db.user.update({ where: { id: userId }, data: { providers: "8" } });
    await db.watchlistItem.createMany({
      data: [
        { userId, mediaType: "movie", tmdbId: 1, title: "On MUBI", streaming: "MUBI", streamingIds: "11", addedAt: new Date(T0.getTime() + 2000) },
        { userId, mediaType: "movie", tmdbId: 2, title: "On Netflix", streaming: "Netflix", streamingIds: "8", addedAt: T0 },
      ],
    });
    const { rows, streamingCount } = await watchlistRows(userId, "streaming");
    expect(rows.map((r) => r.title)).toEqual(["On Netflix", "On MUBI"]);
    expect(streamingCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------

describe("Save on a title page", () => {
  it("is a plain watchlist toggle with no lists, and a menu with any", async () => {
    expect(saveBehaviour(undefined)).toBe("toggle");
    expect(saveBehaviour(await saveLists(userId, "movie", 550))).toBe("toggle");

    const mine = await db.mediaList.create({ data: { userId, name: "With Mum", kind: "manual" } });
    await db.mediaList.create({ data: { userId, name: "Smart", kind: "smart", filters: "{}" } });
    const lists = await saveLists(userId, "movie", 550);
    // Smart lists are not offered: their titles are the answer to their filters.
    expect(lists).toEqual([{ id: mine.id, name: "With Mum", holds: false }]);
    expect(saveBehaviour(lists)).toBe("menu");

    await addToList(userId, mine.id, { mediaType: "movie", tmdbId: 550, title: "Fight Club", poster: null, score: 84, year: "1999", runtime: 139 });
    expect((await saveLists(userId, "movie", 550))[0].holds).toBe(true);
  });

  it("files onto manual lists only, last, and takes titles off them", async () => {
    const mine = await db.mediaList.create({ data: { userId, name: "Mine", kind: "manual" } });
    const smart = await db.mediaList.create({ data: { userId, name: "Smart", kind: "smart", filters: "{}" } });
    const item = (tmdbId: number) => ({ mediaType: "movie" as const, tmdbId, title: `F${tmdbId}`, poster: null, score: null, year: null, runtime: 100 });

    expect(await addToList(userId, smart.id, item(1))).toBe(false);
    expect(await addToList(userId, mine.id, item(1))).toBe(true);
    expect(await addToList(userId, mine.id, item(2))).toBe(true);
    const rows = await db.mediaListItem.findMany({ where: { listId: mine.id }, orderBy: { position: "asc" } });
    expect(rows.map((r) => r.tmdbId)).toEqual([1, 2]);

    const other = await freshUser();
    expect(await addToList(other.id, mine.id, item(3))).toBe(false);
    expect(await removeFromList(userId, mine.id, "movie", 1)).toBe(true);
    expect(await db.mediaListItem.count({ where: { listId: mine.id } })).toBe(1);
  });

  it("adds up a list's hours and what has been watched", async () => {
    const mine = await db.mediaList.create({ data: { userId, name: "Mine", kind: "manual" } });
    await db.mediaListItem.createMany({
      data: [
        { listId: mine.id, mediaType: "movie", tmdbId: 550, title: "Fight Club", runtime: 139, position: 0 },
        { listId: mine.id, mediaType: "movie", tmdbId: 551, title: "Unknown", runtime: null, position: 1 },
      ],
    });
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    const detail = await listDetail(userId, mine.id, "unseen");
    expect(detail).toMatchObject({ minutes: 139, watchedCount: 1 });
    expect(detail!.items.map((i) => [i.tmdbId, i.watched])).toEqual([
      [551, false],
      [550, true],
    ]);
    expect(await listDetail((await freshUser()).id, mine.id, "unseen")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("Request all's plan", () => {
  it("names unseen titles not on Plex or already asked for, and those on a service this person pays for", async () => {
    await db.user.update({ where: { id: userId }, data: { providers: "8", region: "GB" } });
    const list = await db.mediaList.create({ data: { userId, name: "Smart", kind: "smart", filters: "{}" } });
    await db.mediaListItem.createMany({
      data: [550, 1, 2, 3, 4].map((tmdbId, position) => ({ listId: list.id, mediaType: "movie", tmdbId, title: `F${tmdbId}`, position })),
    });
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await db.availability.createMany({
      data: [
        { mediaType: "movie", tmdbId: 1, onPlex: true },
        { mediaType: "movie", tmdbId: 2, overseerrStatus: "requested" },
        { mediaType: "movie", tmdbId: 3, providers: JSON.stringify({ GB: { link: null, stream: [{ id: 1796, name: "Netflix" }], free: [] } }) },
      ],
    });
    const plan = await requestPlan(userId, list.id);
    expect(plan!.titles.map((t) => t.tmdbId)).toEqual([3, 4]);
    expect(plan!.subscribed).toEqual([{ mediaType: "movie", tmdbId: 3, title: "F3", on: ["Netflix"] }]);

    const manual = await db.mediaList.create({ data: { userId, name: "Mine", kind: "manual" } });
    expect(await requestPlan(userId, manual.id)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe("watchlist enrichment", () => {
  const providers = { results: { US: { flatrate: [{ provider_id: 8, provider_name: "Netflix", logo_path: "" }] } } };

  it("looks a row up once a week, even when TMDB has no length for it", async () => {
    const now = Date.now();
    await db.watchlistItem.createMany({
      data: [
        { userId, mediaType: "movie", tmdbId: 10, title: "Never looked at" },
        // The old bug: a null runtime counted as stale, so this was asked about on every pass.
        { userId, mediaType: "movie", tmdbId: 11, title: "No length, looked at yesterday", enrichedAt: new Date(now - 86_400_000) },
        { userId, mediaType: "movie", tmdbId: 12, title: "Looked at last week", runtime: 90, enrichedAt: new Date(now - ENRICH_AFTER_MS - 1000) },
      ],
    });
    stub = stubTmdb({
      "/movie/10": { id: 10, title: "A", runtime: 0, vote_average: 0 },
      "/movie/10/watch/providers": providers,
      "/movie/12": { id: 12, title: "C", runtime: 95, vote_average: 0 },
      "/movie/12/watch/providers": { results: {} },
    });
    expect(await enrichWatchlist()).toEqual({ rows: 2 });
    expect(stub.count("/movie/11")).toBe(0);

    const rows = await db.watchlistItem.findMany({ where: { userId }, orderBy: { tmdbId: "asc" } });
    expect(rows.map((r) => [r.tmdbId, r.runtime, r.streaming])).toEqual([
      [10, null, "Netflix"],
      [11, null, null],
      [12, 95, ""],
    ]);
    // Looked at, length or none: not due again for a week.
    expect(rows[0].enrichedAt).not.toBeNull();
    expect(await enrichWatchlist()).toEqual({ rows: 0 });
  });

  it("looks at twenty-four rows a pass, the never-looked-at first", async () => {
    const old = new Date(Date.now() - ENRICH_AFTER_MS * 2);
    await db.watchlistItem.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        userId,
        mediaType: "movie",
        tmdbId: 1000 + i,
        title: `F${i}`,
        enrichedAt: i < 25 ? old : null,
      })),
    });
    const routes: Record<string, unknown> = {};
    for (let i = 0; i < 30; i++) {
      routes[`/movie/${1000 + i}`] = { id: 1000 + i, title: "F", runtime: 100, vote_average: 0 };
      routes[`/movie/${1000 + i}/watch/providers`] = { results: {} };
    }
    stub = stubTmdb(routes);
    expect(await enrichWatchlist()).toEqual({ rows: ENRICH_PER_RUN });
    const fresh = await db.watchlistItem.findMany({ where: { userId, tmdbId: { gte: 1025 } } });
    expect(fresh.every((r) => r.enrichedAt !== null)).toBe(true);
  });
});
