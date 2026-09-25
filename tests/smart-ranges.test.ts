import { afterEach, describe, expect, it } from "vitest";
import { queue } from "@/lib/refresh";
import { DEFAULT_FILTERS, YEAR_CEILING, type SmartFilters } from "@/lib/smart-filters";
import { runSmartList } from "@/lib/smart-lists";
import { discoverParams } from "@/lib/smart-query";
import { stubTmdb } from "./helpers/tmdb-fetch";

/**
 * The editor's three sliders as narrowings. Moving a handle in from its end
 * may only take titles away, and only the ones the new bound rules out: a
 * title rated 60% is in "0 to 100" and must still be in "10 to 100". Checked
 * against a small fake TMDB that honours the discover parameters the way the
 * real one does, so what is tested is what a person would see in the preview.
 */

const CONTEXT = { region: "GB", today: "2026-09-23" };
const f = (patch: Partial<SmartFilters> = {}): SmartFilters => ({ ...DEFAULT_FILTERS, ...patch });

type Fake = { id: number; vote_average: number; vote_count: number; release_date: string; runtime: number };

/** Films of every kind the bounds care about: obscure and famous, old and new, short and long, rated and not. */
const CATALOGUE: Fake[] = [
  { id: 1, vote_average: 6.1, vote_count: 40, release_date: "2019-03-01", runtime: 95 }, // obscure, about 60%
  { id: 2, vote_average: 6.0, vote_count: 12, release_date: "2021-07-10", runtime: 101 },
  { id: 3, vote_average: 8.4, vote_count: 25000, release_date: "1999-10-15", runtime: 139 },
  { id: 4, vote_average: 0.8, vote_count: 3, release_date: "2010-01-01", runtime: 80 }, // about 8%
  { id: 5, vote_average: 0, vote_count: 0, release_date: "2027-02-01", runtime: 0 }, // unreleased, unrated
  { id: 6, vote_average: 7.2, vote_count: 900, release_date: "1950-06-01", runtime: 70 },
  { id: 7, vote_average: 5.5, vote_count: 150, release_date: "1965-01-01", runtime: 200 },
  { id: 8, vote_average: 6.95, vote_count: 500, release_date: "2026-10-30", runtime: 118 }, // shows as 70%, out next month
  { id: 9, vote_average: 9.9, vote_count: 4, release_date: "2024-01-01", runtime: 5 },
];

/** TMDB's discover, reduced to the parameters the sliders and statuses set. */
function fakeDiscover(url: URL) {
  const q = (k: string) => url.searchParams.get(k);
  const num = (k: string) => (q(k) === null ? null : Number(q(k)));
  const rows = CATALOGUE.filter((t) => {
    if (num("vote_average.gte") !== null && t.vote_average < num("vote_average.gte")!) return false;
    if (num("vote_average.lte") !== null && t.vote_average > num("vote_average.lte")!) return false;
    if (num("vote_count.gte") !== null && t.vote_count < num("vote_count.gte")!) return false;
    if (q("primary_release_date.gte") !== null && t.release_date < q("primary_release_date.gte")!) return false;
    if (q("primary_release_date.lte") !== null && t.release_date > q("primary_release_date.lte")!) return false;
    if (num("with_runtime.gte") !== null && t.runtime < num("with_runtime.gte")!) return false;
    if (num("with_runtime.lte") !== null && t.runtime > num("with_runtime.lte")!) return false;
    return true;
  });
  return {
    page: 1,
    total_pages: 1,
    total_results: rows.length,
    results: rows.map((t) => ({ id: t.id, title: `Film ${t.id}`, poster_path: null, vote_average: t.vote_average, release_date: t.release_date, genre_ids: [] })),
  };
}

let stub: ReturnType<typeof stubTmdb> | null = null;
afterEach(async () => {
  await queue.idle();
  stub?.restore();
  stub = null;
});

async function ids(filters: SmartFilters) {
  const answer = await runSmartList(filters, 60, { region: CONTEXT.region, today: CONTEXT.today });
  expect(answer.ok).toBe(true);
  return answer.items.map((i) => i.id).sort((a, b) => a - b);
}

const byId = new Map(CATALOGUE.map((t) => [t.id, t]));
/** The score the preview prints under a poster. */
const shown = (id: number) => Math.round(byId.get(id)!.vote_average * 10);
const year = (id: number) => Number(byId.get(id)!.release_date.slice(0, 4));

describe("the score slider", () => {
  it("keeps a 60% title when the floor moves from 0 to 10", async () => {
    stub = stubTmdb({ "/discover/movie": fakeDiscover });
    const open = await ids(f());
    const narrowed = await ids(f({ scoreMin: 10 }));
    expect(open).toContain(1);
    expect(narrowed).toContain(1);
    // Exactly the open answer less what the new floor rules out.
    expect(narrowed).toEqual(open.filter((id) => shown(id) >= 10));
  });

  it("narrows consistently at every step of the slider, from either end", async () => {
    stub = stubTmdb({ "/discover/movie": fakeDiscover });
    const open = await ids(f());
    for (const [lo, hi] of [[10, 100], [60, 100], [70, 100], [0, 90], [0, 60], [55, 65]]) {
      const got = await ids(f({ scoreMin: lo, scoreMax: hi }));
      expect(got, `${lo} to ${hi}`).toEqual(open.filter((id) => shown(id) >= lo && shown(id) <= hi));
    }
  });

  it("brings no vote floor with it: that belongs to the shelf, not the score", () => {
    const params = discoverParams(f({ scoreMin: 10 }), "movie", CONTEXT)!;
    expect(params["vote_count.gte"]).toBeUndefined();
    // Popular's floor is still Popular's, with or without a score.
    expect(discoverParams(f({ source: "popular", scoreMin: 10 }), "movie", CONTEXT)!["vote_count.gte"]).toBe("300");
  });
});

describe("the years slider", () => {
  it("narrows consistently from either end", async () => {
    stub = stubTmdb({ "/discover/movie": fakeDiscover });
    const open = await ids(f({ mode: "advanced" }));
    for (const [lo, hi] of [[1951, YEAR_CEILING], [2000, YEAR_CEILING], [1950, 2020], [1990, 2019]]) {
      const got = await ids(f({ mode: "advanced", yearMin: lo, yearMax: hi }));
      const from = lo > 1950 ? lo : -Infinity;
      const to = hi < YEAR_CEILING ? hi : Infinity;
      expect(got, `${lo} to ${hi}`).toEqual(open.filter((id) => year(id) >= from && year(id) <= to));
    }
  });

  it("never loosens a shelf's or a status's own date bound", async () => {
    stub = stubTmdb({ "/discover/movie": fakeDiscover });
    for (const base of [f({ statuses: ["released"] }), f({ statuses: ["unreleased"] }), f({ source: "upcoming" }), f({ source: "newest" })]) {
      const open = await ids({ ...base, mode: "advanced" });
      const narrowed = await ids({ ...base, mode: "advanced", yearMin: 1990, yearMax: 2026 });
      expect(narrowed.every((id) => open.includes(id)), JSON.stringify(base.statuses) + base.source).toBe(true);
    }
    // Released and 1990 to 2026: next month's film is not out, whatever year it is.
    expect(await ids(f({ statuses: ["released"], mode: "advanced", yearMin: 1990, yearMax: 2026 }))).not.toContain(8);
  });
});

describe("the length slider", () => {
  it("narrows consistently from either end", async () => {
    stub = stubTmdb({ "/discover/movie": fakeDiscover });
    const open = await ids(f({ mode: "advanced" }));
    const runtime = (id: number) => byId.get(id)!.runtime;
    for (const [lo, hi] of [[10, 180], [60, 180], [0, 120], [90, 150]]) {
      const got = await ids(f({ mode: "advanced", runtimeMin: lo, runtimeMax: hi }));
      const top = hi < 180 ? hi : Infinity;
      expect(got, `${lo} to ${hi}`).toEqual(open.filter((id) => runtime(id) >= lo && runtime(id) <= top));
    }
  });
});
