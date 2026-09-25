import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import {
  discoverPlan,
  fetchCategory,
  fetchFiltered,
  fetchForYou,
  fetchGenre,
  categoryHops,
  genreArtwork,
  gridPages,
  gridWindow,
  GRID_PAGE,
  tryCategoryGrid,
  pickGenreArt,
  seenAmong,
  tileGenres,
  type DiscoverType,
} from "@/lib/discover";
import { DEFAULT_FILTER_STATE, filterQuery, readFilterQuery, toSmartFilters } from "@/lib/discover-filters";
import { recordPlay } from "@/lib/plays";
import { findPicks, vibeArtwork } from "@/lib/what-to-watch";
import {
  choose,
  collect,
  quizParams,
  rank,
  shuffle,
  type Candidate,
  type Title,
  type ViewerFacts,
} from "@/lib/what-to-watch-picks";
import {
  AUDIENCES,
  QUESTION_ORDER,
  answerHref,
  answered,
  answersLine,
  backHref,
  findAudience,
  findKind,
  findTime,
  findVibe,
  questionHref,
  readAnswers,
  type Answers,
} from "@/lib/what-to-watch-quiz";
import { at, episode, film, freshUser, hours } from "./helpers/db";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * Discover and What to watch. The filter's requests, the genre rule shared
 * with smart lists, the quiz's order and its walk back, and the ranking rules
 * of the results. TMDB is stubbed throughout.
 */

let stub: ReturnType<typeof stubTmdb> | null = null;
afterEach(() => {
  stub?.restore();
  stub = null;
});

const page = (ids: number[], extra: Record<string, unknown> = {}) => ({
  page: 1,
  total_pages: 3,
  results: ids.map((id) => ({ id, title: `Title ${id}`, poster_path: `/p${id}.jpg`, vote_average: 7, genre_ids: [18], ...extra })),
});

const CATEGORY_ROUTES = {
  "/trending/all/week": { page: 1, total_pages: 1, results: [{ id: 1, media_type: "movie", title: "One", poster_path: "/1.jpg", genre_ids: [27] }] },
  "/trending/tv/week": page([2]),
  "/trending/movie/week": page([3]),
  "/movie/now_playing": page([4]),
  "/tv/popular": page([5]),
  "/movie/upcoming": page([6]),
  "/discover/tv": page([7]),
  "/movie/top_rated": page([8]),
  "/tv/top_rated": page([9]),
  "/movie/popular": page([10]),
  "/tv/on_the_air": page([11]),
};

async function everyRail(type: DiscoverType) {
  const ctx = { type, region: "GB", today: "2026-09-23" };
  const plan = discoverPlan(type);
  for (const slug of [plan.trending, plan.billboard, ...plan.rails, ...plan.horizon, ...plan.hallOfFame]) {
    await fetchCategory(slug, ctx);
  }
}

// ---------------------------------------------------------------------------

describe("the Discover filter", () => {
  it("asks for nothing a Shows page cannot use", async () => {
    stub = stubTmdb(CATEGORY_ROUTES);
    await everyRail("tv");
    // Popular shows stands down: on Shows it is already the billboard.
    expect(stub.calls.sort()).toEqual(["/discover/tv", "/trending/tv/week", "/tv/on_the_air", "/tv/popular", "/tv/top_rated"]);
  });

  it("asks for nothing a Films page cannot use", async () => {
    stub = stubTmdb(CATEGORY_ROUTES);
    await everyRail("movie");
    expect(stub.calls.sort()).toEqual(["/movie/now_playing", "/movie/popular", "/movie/top_rated", "/movie/upcoming", "/trending/movie/week"]);
  });

  it("asks for both halves on Everything, once an hour", async () => {
    stub = stubTmdb(CATEGORY_ROUTES);
    await everyRail("all");
    expect(stub.calls.sort()).toEqual([
      "/discover/tv",
      "/movie/now_playing",
      "/movie/popular",
      "/movie/top_rated",
      "/movie/upcoming",
      "/trending/all/week",
      "/tv/on_the_air",
      "/tv/popular",
      "/tv/top_rated",
    ]);
    // A second visit within the hour is rows.
    await everyRail("all");
    expect(stub.calls).toHaveLength(9);
  });

  it("keeps page one of a category in the Discover rail's cache row", async () => {
    stub = stubTmdb(CATEGORY_ROUTES);
    const ctx = { type: "all" as const, region: "GB", today: "2026-09-23" };
    await fetchCategory("in-cinemas", ctx);
    await fetchCategory("in-cinemas", ctx, 1);
    expect(stub.count("/movie/now_playing")).toBe(1);
    await fetchCategory("in-cinemas", ctx, 2);
    expect(stub.count("/movie/now_playing")).toBe(2);
  });

  it("draws genre artwork from the cache and never the network", async () => {
    stub = stubTmdb(CATEGORY_ROUTES);
    const trending = await fetchCategory("trending", { type: "all", region: "GB", today: "2026-09-23" });
    const before = stub.calls.length;
    const tiles = await genreArtwork("all", "2026-09-23", trending.items);
    expect(stub.calls.length).toBe(before);
    // The trending horror film stands in until someone opens the horror page.
    expect(tiles.find((t) => t.slug === "horror")?.poster).toBe("/1.jpg");
    expect(tiles.find((t) => t.slug === "comedy")?.poster).toBeNull();
  });

  it("gives no two genre tiles the same poster", () => {
    const genres = tileGenres("all").slice(0, 2);
    const shared = { id: 1, mediaType: "movie" as const, title: "X", poster: "/x.jpg", backdrop: null, score: 70, year: "2020", overview: "", genreIds: genres.map((g) => g.movieId) };
    const tiles = pickGenreArt(genres, [[], []], [shared]);
    expect(tiles.map((t) => t.poster)).toEqual(["/x.jpg", null]);
  });

  it("ticks films watched and shows begun, from the watched tables", async () => {
    const user = await freshUser();
    await recordPlay(user.id, film({ tmdbId: 603, title: "The Matrix" }));
    await recordPlay(user.id, { mediaType: "tv", tmdbId: 1396, title: "Breaking Bad", poster: null, seasonNumber: 1, episodeNumber: 1, episodeName: "Pilot", runtime: 47 });
    const seen = await seenAmong(user.id, [
      { mediaType: "movie", id: 603 },
      { mediaType: "movie", id: 604 },
      { mediaType: "tv", id: 1396 },
      { mediaType: "tv", id: 603 },
    ]);
    expect([...seen].sort()).toEqual(["movie-603", "tv-1396"]);
  });
});

describe("New shows", () => {
  it("lists what is on the air newest first", async () => {
    stub = stubTmdb({
      "/tv/on_the_air": {
        page: 1,
        total_pages: 1,
        results: [
          { id: 1, name: "Old soap", first_air_date: "1998-03-01" },
          { id: 2, name: "This autumn", first_air_date: "2026-09-10" },
          { id: 3, name: "Last spring", first_air_date: "2026-04-02" },
        ],
      },
    });
    const page = await fetchCategory("new-shows", { type: "all", region: "GB", today: "2026-09-23" });
    expect(page.items.map((i) => i.id)).toEqual([2, 3, 1]);
    expect(page.items.every((i) => i.mediaType === "tv")).toBe(true);
  });
});

describe("Things you may like", () => {
  const recs = (ids: number[], mediaType: "movie" | "tv" = "movie") => ({
    page: 1,
    total_pages: 1,
    results: ids.map((id) => ({ id, media_type: mediaType, title: `Rec ${id}`, name: `Rec ${id}`, poster_path: `/r${id}.jpg` })),
  });

  it("recommends from the last five titles watched, each once, nothing seen, an hour at a time", async () => {
    const user = await freshUser();
    // Six titles, oldest first; a binge of one show counts once.
    await recordPlay(user.id, film({ tmdbId: 1, title: "Oldest", watchedAt: at(0) }));
    await recordPlay(user.id, film({ tmdbId: 2, title: "Two", watchedAt: at(hours(1)) }));
    await recordPlay(user.id, film({ tmdbId: 3, title: "Three", watchedAt: at(hours(2)) }));
    await recordPlay(user.id, episode(1, 1, { tmdbId: 40, watchedAt: at(hours(3)) }));
    await recordPlay(user.id, episode(1, 2, { tmdbId: 40, watchedAt: at(hours(4)) }));
    await recordPlay(user.id, film({ tmdbId: 5, title: "Five", watchedAt: at(hours(5)) }));
    await recordPlay(user.id, film({ tmdbId: 6, title: "Newest", watchedAt: at(hours(6)) }));

    stub = stubTmdb({
      "/movie/1/recommendations": recs([900]),
      "/movie/2/recommendations": recs([101, 102, 3]),
      "/movie/3/recommendations": recs([102, 103]),
      "/tv/40/recommendations": recs([501], "tv"),
      "/movie/5/recommendations": recs([104, 2]),
      "/movie/6/recommendations": recs([105, 101]),
    });
    const items = (await fetchForYou(user.id, "all"))!;
    const keys = items.map((i) => `${i.mediaType}-${i.id}`);
    // The oldest title is not a seed; each list gives its first place before
    // anyone's second; titles already watched (2, 3) and repeats are dropped.
    expect(stub.count("/movie/1/recommendations")).toBe(0);
    expect(keys).toEqual(["movie-105", "movie-104", "tv-501", "movie-102", "movie-101", "movie-103"]);

    // Within the hour the row is rows.
    await fetchForYou(user.id, "all");
    expect(stub.calls).toHaveLength(5);

    // Shows draws on shows alone.
    const shows = (await fetchForYou(user.id, "tv"))!;
    expect(shows.map((i) => i.id)).toEqual([501]);
  });

  it("is empty, not broken, for someone who has watched nothing", async () => {
    const user = await freshUser();
    stub = stubTmdb({});
    expect(await fetchForYou(user.id, "all")).toEqual([]);
    expect(stub.calls).toHaveLength(0);
  });
});

describe("the filter page", () => {
  it("keeps its whole question in the address, defaults left out", () => {
    const state = {
      ...DEFAULT_FILTER_STATE,
      type: "movie" as const,
      sort: "top-rated" as const,
      genres: ["horror", "thriller"],
      providers: [8],
      scoreMin: 70,
      yearMin: 1990,
      yearMax: 2009,
      runtimeMax: 120,
      hideWatched: true,
    };
    const query = filterQuery(state, 3);
    expect(query).toBe("type=movie&sort=top-rated&genre=horror,thriller&service=8&score=70-100&years=1990-2009&length=0-120&unseen=1&page=3");
    expect(readFilterQuery(Object.fromEntries(new URLSearchParams(query)))).toEqual(state);
    expect(filterQuery(DEFAULT_FILTER_STATE)).toBe("");
    // A hand-edited address is repaired, never refused.
    expect(readFilterQuery({ genre: "horror,nonsense", service: "8,99999", score: "90-10", type: "films" })).toMatchObject({
      type: "all",
      genres: ["horror"],
      providers: [8],
      scoreMin: 10,
      scoreMax: 90,
    });
  });

  it("asks the smart list builder's question, a page per medium, and leaves out what was seen", async () => {
    const user = await freshUser();
    await recordPlay(user.id, film({ tmdbId: 206, title: "Seen" }));
    const asked: URL[] = [];
    stub = stubTmdb({
      "/discover/movie": (url: URL) => {
        asked.push(url);
        // TMDB's page p holds p01 to p20.
        const p = Number(url.searchParams.get("page") ?? 1);
        const results = Array.from({ length: 20 }, (_, i) => ({ id: p * 100 + i + 1, title: `F${p}-${i + 1}`, poster_path: null }));
        return { page: p, total_pages: 4, total_results: 70, results };
      },
    });
    const state = { ...readFilterQuery({ genre: "horror", score: "70-100", unseen: "1" }) };
    const result = (await fetchFiltered(state, 2, { userId: user.id, region: "GB", today: "2026-09-23" }))!;
    // Horror has no television half, so Everything asks for films alone:
    // titles 25 to 48, which are TMDB's page 2 from its fifth and page 3.
    expect(stub.calls).toEqual(["/discover/movie", "/discover/movie"]);
    expect(asked[0].searchParams.get("with_genres")).toBe("27");
    expect(asked[0].searchParams.get("vote_average.gte")).toBe("6.95");
    expect(asked.map((u) => u.searchParams.get("page"))).toEqual(["2", "3"]);
    const ids = result.items.map((i) => i.id);
    expect(ids).toHaveLength(23);
    expect(ids[0]).toBe(205);
    expect(ids).not.toContain(206);
    expect(ids.at(-1)).toBe(308);
    expect(result).toMatchObject({ page: 2, totalPages: 3, total: 70 });
    expect(toSmartFilters(state)).toMatchObject({ kind: "both", source: "popular", mode: "advanced" });
  });
});

describe("genres television does not have", () => {
  it("are not offered as tiles on Shows", () => {
    const shows = tileGenres("tv").map((g) => g.slug);
    expect(shows).not.toContain("horror");
    expect(shows).not.toContain("romance");
    expect(tileGenres("all").map((g) => g.slug)).toContain("horror");
  });

  it("drop the shows half of a genre page rather than list unrelated shows", async () => {
    // One page of films, so a page of the grid is one request.
    stub = stubTmdb({ "/discover/movie": { ...page([1, 2]), total_pages: 1 }, "/discover/tv": page([3, 4]) });
    const horror = await fetchGenre("horror", "all", 1, "2026-09-23");
    expect(stub.calls).toEqual(["/discover/movie"]);
    expect(horror?.filmsOnly).toBe(true);
    expect(horror?.items.map((i) => i.mediaType)).toEqual(["movie", "movie"]);

    const onShows = await fetchGenre("horror", "tv", 1, "2026-09-23");
    expect(stub.calls).toEqual(["/discover/movie"]);
    expect(onShows?.items).toEqual([]);
  });

  it("leave a genre both have alone, interleaving the halves", async () => {
    stub = stubTmdb({ "/discover/movie": page([1, 2]), "/discover/tv": page([3, 4]) });
    const crime = await fetchGenre("crime", "all", 1, "2026-09-23");
    expect(crime?.filmsOnly).toBe(false);
    expect(crime?.items.map((i) => `${i.mediaType}-${i.id}`)).toEqual(["movie-1", "tv-3", "movie-2", "tv-4"]);
  });
});

// ---------------------------------------------------------------------------

describe("the quiz", () => {
  it("asks who, what, the mood, then how long", () => {
    expect(QUESTION_ORDER).toEqual(["who", "kind", "vibe", "time"]);
    expect(readAnswers({}).next).toBe("who");
    expect(readAnswers({ who: "solo" }).next).toBe("kind");
    expect(readAnswers({ who: "solo", kind: "tv" }).next).toBe("vibe");
    expect(readAnswers({ who: "solo", kind: "tv", vibe: "clever" }).next).toBe("time");
    expect(readAnswers({ who: "solo", kind: "tv", vibe: "clever", time: "hour" }).next).toBeNull();
  });

  it("reads no answer whose earlier answers do not stand", () => {
    // A mood without an audience is nobody's mood; a length is asked per medium.
    expect(readAnswers({ kind: "tv", vibe: "clever" })).toMatchObject({ next: "who", kind: null, vibe: null });
    expect(readAnswers({ who: "partner", kind: "tv", vibe: "unwind" }).next).toBe("vibe");
    expect(readAnswers({ who: "solo", kind: "movie", vibe: "clever", time: "hour" }).next).toBe("time");
  });

  it("walks forward one address per answer, to the results after the fourth", () => {
    let answers: Partial<Answers> = {};
    const steps: [keyof Answers, string][] = [["who", "solo"], ["kind", "tv"], ["vibe", "clever"], ["time", "hour"]];
    const hrefs = steps.map(([q, v]) => {
      const href = answerHref(answers, q, v);
      answers = answered(readAnswers(Object.fromEntries(new URL(href, "http://x").searchParams)));
      return href;
    });
    expect(hrefs).toEqual([
      "/discover/what-to-watch?who=solo",
      "/discover/what-to-watch?who=solo&kind=tv",
      "/discover/what-to-watch?who=solo&kind=tv&vibe=clever",
      "/discover/what-to-watch/results?who=solo&kind=tv&vibe=clever&time=hour",
    ]);
  });

  it("drops later answers when an earlier one changes", () => {
    const all = { who: "solo", kind: "tv", vibe: "clever", time: "hour" };
    expect(answerHref(all, "kind", "movie")).toBe("/discover/what-to-watch?who=solo&kind=movie");
  });

  it("walks back one question at a time, with the answer it had still chosen", () => {
    const all = { who: "solo", kind: "tv", vibe: "clever", time: "hour" };
    expect(backHref(all, "time")).toBe("/discover/what-to-watch?who=solo&kind=tv&was=clever");
    expect(backHref(all, "vibe")).toBe("/discover/what-to-watch?who=solo&was=tv");
    expect(backHref(all, "kind")).toBe("/discover/what-to-watch?was=solo");
    expect(backHref(all, "who")).toBe("/discover");
    // What the back link names is asked again, not counted as given.
    expect(readAnswers({ who: "solo", kind: "tv", was: "clever" }).next).toBe("vibe");
    expect(questionHref(all, "vibe", "clever")).toBe(backHref(all, "time"));
  });

  it("carries the answers so far as the eyebrow", () => {
    expect(answersLine(readAnswers({ who: "solo", kind: "tv" }))).toBe("Just me · a show");
    expect(answersLine(readAnswers({ who: "solo", kind: "tv", vibe: "clever", time: "hour" }))).toBe(
      "Just me · a show · something clever · about an hour",
    );
  });

  it("offers each audience its own moods, and each medium its own time question", () => {
    expect(new Set(AUDIENCES.map((a) => a.vibes.map((v) => v.value).join()))).toHaveProperty("size", 4);
    expect(findTime("tv", "hour")?.minEpisode).toBe(40);
    expect(findTime("movie", "hour")).toBeNull();
  });
});

// ---------------------------------------------------------------------------

const solo = findAudience("solo")!;
const clever = findVibe(solo, "clever")!;
const TODAY = "2026-09-23";

function title(id: number, patch: Partial<Title> = {}): Title {
  return { id, mediaType: "movie", title: `T${id}`, poster: null, backdrop: null, score: 70, year: "2020", genreIds: [9648], ...patch };
}

function candidates(...entries: [Title, Partial<Candidate>?][]): Candidate[] {
  return entries.map(([item, patch], i) => ({
    key: `${item.mediaType}-${item.id}`,
    item,
    pools: new Set(["popular"]),
    rank: i,
    restricted: false,
    ...patch,
  }));
}

const nobody: ViewerFacts = {
  watchedFilms: new Set(),
  partway: new Map(),
  finished: new Set(),
  watchlist: new Set(),
  available: new Set(),
  rejected: new Set(),
};

describe("the mood tiles", () => {
  // Date night: no other test asks these questions, so an answer still in
  // flight from here cannot land in someone else's test.
  const partner = findAudience("partner")!;

  it("are drawn at once, without waiting on TMDB for their artwork", async () => {
    // TMDB slow to answer and nothing cached: the question used to wait on
    // every mood's discover request before it drew a single tile.
    stub = stubTmdb({ "/discover/tv": () => new Promise((resolve) => setTimeout(() => resolve(new Error("slow")), 1_000)) });
    const answer = await Promise.race([
      vibeArtwork(partner, "tv"),
      new Promise<"waited">((resolve) => setTimeout(() => resolve("waited"), 300)),
    ]);
    expect(answer).not.toBe("waited");
    // One entry per mood: every one of them is a tile, poster or not.
    expect(Object.keys(answer as object)).toEqual(partner.vibes.map((v) => v.value));
  });

  it("take their artwork from the cache, which the first visit fills behind them", async () => {
    let n = 0;
    stub = stubTmdb({
      "/discover/movie": () => ({ page: 1, total_pages: 1, results: [{ id: ++n, title: `Film ${n}`, poster_path: `/f${n}.jpg`, genre_ids: [18] }] }),
    });
    const first = await vibeArtwork(partner, "movie");
    expect(Object.values(first).every((p) => p === null)).toBe(true);
    await vi.waitFor(async () => {
      const again = await vibeArtwork(partner, "movie");
      expect(Object.values(again).every(Boolean)).toBe(true);
    });
    // Each mood asked once: later visits read the rows the first one wrote.
    expect(stub.count("/discover/movie")).toBe(partner.vibes.length);
  });
});

describe("the results' query", () => {
  it("is the smart list builder's, with the mood laid over it", () => {
    const hour = findTime("tv", "hour")!;
    const p = quizParams({ medium: "tv", pool: "popular", audience: solo, vibe: clever, time: hour, loose: false, providers: [8], region: "GB", today: TODAY });
    // From `discoverParams`: every id that means Netflix, in the viewer's region, and the episode length.
    expect(p.with_watch_providers).toBe("8|1796");
    expect(p.watch_region).toBe("GB");
    expect(p["with_runtime.gte"]).toBe("40");
    expect(p.sort_by).toBe("popularity.desc");
    // The mood's own.
    expect(p.with_genres).toBe("9648");
    expect(p.without_genres).toBe("10763,10764,10767");
    expect(p["first_air_date.lte"]).toBe(TODAY);
  });

  it("keeps films still only in cinemas out, unless they are on the viewer's services", () => {
    const long = findTime("movie", "long")!;
    const base = { medium: "movie" as const, pool: "popular" as const, audience: solo, vibe: clever, time: long, loose: false, region: "GB", today: TODAY };
    expect(quizParams({ ...base, providers: [] })["primary_release_date.lte"]).toBe("2026-08-09");
    expect(quizParams({ ...base, providers: [8] })["primary_release_date.lte"]).toBe(TODAY);
  });

  it("loosens the length and the floor but never the genre or the era's end", () => {
    const nostalgia = findVibe(solo, "nostalgia")!;
    const short = findTime("movie", "short")!;
    const loose = quizParams({ medium: "movie", pool: "popular", audience: solo, vibe: nostalgia, time: short, loose: true, providers: [], region: "GB", today: TODAY });
    expect(loose["with_runtime.lte"]).toBeUndefined();
    expect(loose["vote_count.gte"]).toBe("20");
    expect(loose["primary_release_date.lte"]).toBe("2004-12-31");
    const cleverLoose = quizParams({ medium: "movie", pool: "popular", audience: solo, vibe: clever, time: short, loose: true, providers: [], region: "GB", today: TODAY });
    expect(cleverLoose.with_genres).toBe("9648");
  });
});

describe("the results' ranking", () => {
  it("puts what is on the viewer's services first, before a better fit", () => {
    const pool = candidates([title(1, { score: 90, genreIds: [9648, 878, 18, 53] })], [title(2, { score: 60 })], [title(3, { score: 65 })]);
    const ranked = rank(pool, clever, { ...nobody, available: new Set(["movie-2"]) });
    expect(ranked.map((r) => r.key)).toEqual(["movie-2", "movie-1", "movie-3"]);
    // The restricted query's answers count as available without a row.
    const viaQuery = rank(candidates([title(1, { score: 90 })], [title(3)], [title(2)]).map((c) => (c.item.id === 3 ? { ...c, restricted: true } : c)), clever, nobody);
    expect(viaQuery[0].key).toBe("movie-3");
  });

  it("leaves out what has been seen, finished, stopped or turned down, and keeps a show under way", () => {
    const pool = candidates(
      [title(1)],
      [title(2)],
      [title(3, { mediaType: "tv" })],
      [title(4, { mediaType: "tv" })],
      [title(5)],
    );
    const ranked = rank(pool, clever, {
      ...nobody,
      watchedFilms: new Set(["movie-1"]),
      finished: new Set(["tv-3"]),
      partway: new Map([["tv-4", 3]]),
      rejected: new Set(["movie-5"]),
    });
    expect(ranked.map((r) => r.key).sort()).toEqual(["movie-2", "tv-4"]);
    expect(ranked.find((r) => r.key === "tv-4")?.partway).toBe(3);
  });

  it("always makes tonight's pick one the viewer can play when a contender is", () => {
    const pool = candidates(...Array.from({ length: 8 }, (_, i) => [title(i + 1, { score: 80 - i })] as [Title]));
    const ranked = rank(pool, clever, { ...nobody, available: new Set(["movie-6"]) });
    for (let seed = 1; seed <= 40; seed++) {
      expect(choose(ranked, seed).top[0].key).toBe("movie-6");
    }
  });

  it("deals different picks for different seeds, and the same for the same", () => {
    const pool = candidates(...Array.from({ length: 8 }, (_, i) => [title(i + 1)] as [Title]));
    const ranked = rank(pool, clever, nobody);
    const firsts = new Set(Array.from({ length: 20 }, (_, s) => choose(ranked, s + 1).top[0].key));
    expect(firsts.size).toBeGreaterThan(2);
    expect(choose(ranked, 7)).toEqual(choose(ranked, 7));
    expect(shuffle([1, 2, 3, 4], 3)).toEqual(shuffle([1, 2, 3, 4], 3));
  });

  it("makes the wildcard the best reviewed thing that matches, from the acclaimed pool", () => {
    const pool = candidates(
      [title(1, { score: 70 })],
      [title(2, { score: 71 })],
      [title(3, { score: 72 })],
      [title(4, { score: 88 }), { pools: new Set(["acclaimed"]) }],
      [title(5, { score: 93 }), { pools: new Set(["acclaimed"]) }],
      [title(6, { score: 99 })],
    );
    const { top, wildcard } = choose(rank(pool, clever, nobody), 1);
    expect(top).toHaveLength(3);
    expect(wildcard?.key).toBe("movie-5");
  });

  it("falls back to the best reviewed of the rest when the acclaimed pool is empty", () => {
    const pool = candidates([title(1, { score: 60 })], [title(2, { score: 61 })], [title(3, { score: 62 })], [title(4, { score: 64 })], [title(5, { score: 90 })]);
    const ranked = rank(pool, clever, nobody);
    const { top, wildcard } = choose(ranked, 3);
    const taken = new Set(top.map((t) => t.key));
    const best = ranked.filter((r) => !taken.has(r.key)).sort((a, b) => b.item.score - a.item.score)[0];
    expect(wildcard?.key).toBe(best.key);
  });

  it("merges the pools into one candidate per title", () => {
    const merged = collect([
      { pool: "popular", restricted: false, page: 1, items: [title(1), title(2)] },
      { pool: "acclaimed", restricted: false, page: 1, items: [title(2)] },
      { pool: "popular", restricted: true, page: 1, items: [title(2)] },
    ]);
    expect(merged.size).toBe(2);
    expect(merged.get("movie-2")).toMatchObject({ rank: 1, restricted: true });
    expect([...merged.get("movie-2")!.pools].sort()).toEqual(["acclaimed", "popular"]);
  });
});

describe("findPicks", () => {
  let userId: string;
  beforeEach(async () => {
    const user = await freshUser();
    userId = user.id;
    await db.user.update({ where: { id: userId }, data: { providers: "8", region: "GB" } });
  });

  it("prefers the viewer's services, never offers what they have seen, and says why", async () => {
    await recordPlay(userId, film({ tmdbId: 1, title: "Seen it" }));
    const results = (ids: number[]) => ({
      page: 1,
      total_pages: 1,
      results: ids.map((id) => ({ id, title: `Film ${id}`, poster_path: `/f${id}.jpg`, vote_average: 7 + id / 100, vote_count: 900, genre_ids: [9648], release_date: "2019-01-01" })),
    });
    stub = stubTmdb({
      "/discover/movie": (url: URL) =>
        url.searchParams.get("with_watch_providers")
          ? results([9])
          : url.searchParams.get("sort_by") === "vote_average.desc"
            ? results([20, 21])
            : results([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]),
    });

    const picks = await findPicks(userId, { audience: solo, vibe: clever, kind: "movie", time: findTime("movie", "long")! }, 5);
    const keys = [...picks.top, picks.wildcard].map((p) => p?.entry.key);
    expect(picks.top[0].entry.key).toBe("movie-9");
    expect(keys).not.toContain("movie-1");
    expect(picks.wildcard?.entry.pools.has("acclaimed")).toBe(true);
    expect(picks.top[0].reason).toMatch(/^For a night in on your own, and it /);
    // Bounded: two popular pages, one acclaimed, one narrowed to services.
    expect(stub.count("/discover/movie")).toBe(4);

    // "Not tonight": the one turned down does not come back.
    const again = await findPicks(userId, { audience: solo, vibe: clever, kind: "movie", time: findTime("movie", "long")! }, 6, ["movie-9"]);
    expect(again.top.map((p) => p.entry.key)).not.toContain("movie-9");
    expect(findKind("both")?.short).toBe("either");
  });
});

describe("the tab bar inside Discover", () => {
  it("stands on Discover and gives way on its categories, genres and the quiz", async () => {
    const { showsTabBar } = await import("@/components/nav");
    expect(showsTabBar("/discover")).toBe(true);
    for (const path of ["/discover/trending", "/discover/genre/horror", "/discover/what-to-watch", "/discover/what-to-watch/results"]) {
      expect(showsTabBar(path)).toBe(false);
    }
  });
});

describe("the grid pages", () => {
  it("take twenty-four titles a page, across TMDB's pages of twenty with nothing skipped", () => {
    expect(GRID_PAGE).toBe(24);
    expect(gridWindow(1, 24)).toEqual({ first: 1, last: 2, skip: 0 });
    expect(gridWindow(2, 24)).toEqual({ first: 2, last: 3, skip: 4 });
    expect(gridWindow(5, 24)).toEqual({ first: 5, last: 6, skip: 16 });
    // A half of a mixed page is twelve.
    expect(gridWindow(2, 12)).toEqual({ first: 1, last: 2, skip: 12 });
    // Windows follow on: each starts where the last ended.
    for (let p = 1; p < 30; p++) {
      const a = gridWindow(p, 24);
      const b = gridWindow(p + 1, 24);
      expect((b.first - 1) * 20 + b.skip).toBe((a.first - 1) * 20 + a.skip + 24);
    }
    expect(gridPages(70, 24)).toBe(3);
    expect(gridPages(0, 24)).toBe(1);
    // No further than TMDB's five hundred pages go.
    expect(gridPages(1_000_000, 24)).toBe(Math.ceil(10_000 / 24));
  });

  it("read page one of a category from the rail's row, and the second TMDB page only where there is one", async () => {
    const numbered = (url: URL) => {
      const p = Number(url.searchParams.get("page") ?? 1);
      return { page: p, total_pages: 2, total_results: 30, results: Array.from({ length: p === 1 ? 20 : 10 }, (_, i) => ({ id: p * 100 + i + 1, title: `T${p}-${i}`, poster_path: null })) };
    };
    stub = stubTmdb({ "/movie/now_playing": numbered });
    const ctx = { type: "all" as const, region: "GB", today: "2026-09-23" };
    await fetchCategory("in-cinemas", ctx);
    const first = (await tryCategoryGrid("in-cinemas", ctx, 1))!;
    // The rail already fetched TMDB's page one; the grid adds page two.
    expect(stub.count("/movie/now_playing")).toBe(2);
    expect(first.items).toHaveLength(24);
    expect(first.totalPages).toBe(2);
    const second = (await tryCategoryGrid("in-cinemas", ctx, 2))!;
    expect(second.items.map((i) => i.id)).toEqual([205, 206, 207, 208, 209, 210]);
    // Page two lies within TMDB's page two, which is a row by now.
    expect(stub.count("/movie/now_playing")).toBe(2);
  });
});

describe("the row of categories", () => {
  const ids = (type: DiscoverType) => categoryHops(type).map((h) => h.id);

  it("offers every category under Everything, in the page's order", () => {
    expect(categoryHops("all").map((h) => h.label)).toEqual([
      "Trending",
      "Things you may like",
      "Popular shows",
      "Popular films",
      "New shows",
      "In cinemas",
      "On the horizon",
      "Hall of fame",
    ]);
  });

  it("leaves out what the filter empties and carries the filter", () => {
    expect(ids("tv")).toEqual(["trending", "for-you", "popular-tv", "new-shows", "horizon", "hall-of-fame"]);
    expect(ids("movie")).toEqual(["trending", "for-you", "popular-movies", "in-cinemas", "horizon", "hall-of-fame"]);
    expect(categoryHops("tv").every((h) => h.href.endsWith("?type=tv"))).toBe(true);
    expect(categoryHops("all").every((h) => !h.href.includes("?"))).toBe(true);
  });

  it("opens a group on its first category under the filter, and counts either as being on it", () => {
    const horizon = (type: DiscoverType) => categoryHops(type).find((h) => h.id === "horizon")!;
    expect(horizon("all")).toMatchObject({ href: "/discover/upcoming-tv", covers: ["upcoming-tv", "upcoming"] });
    expect(horizon("movie")).toMatchObject({ href: "/discover/upcoming?type=movie", covers: ["upcoming"] });
    const fame = categoryHops("all").find((h) => h.id === "hall-of-fame")!;
    expect(fame.covers).toEqual(["top-rated-movies", "top-rated-tv"]);
  });
});
