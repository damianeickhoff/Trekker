import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTERS,
  RUNTIME_CEILING,
  YEAR_CEILING,
  YEAR_FLOOR,
  isNarrowed,
  parseFilters,
} from "@/lib/smart-filters";

/**
 * `parseFilters` reads a JSON blob written by whatever version of the app the
 * user last saved with, which makes "never throws" its entire contract — a
 * smart list that has quietly stopped working is worse than one that has
 * quietly lost a checkbox. These are the shapes that would otherwise throw.
 */

describe("parseFilters — rubbish in", () => {
  it.each([
    ["null", null],
    ["undefined", undefined],
    ["a number", 42],
    ["an array", []],
    ["a bare string", "not json"],
    ["broken json", "{ nope"],
    ["the string null", "null"],
  ])("falls back to the defaults for %s", (_label, input) => {
    expect(parseFilters(input)).toEqual(DEFAULT_FILTERS);
  });

  it("reads a JSON string as readily as an object", () => {
    const stored = JSON.stringify({ ...DEFAULT_FILTERS, kind: "tv" });
    expect(parseFilters(stored).kind).toBe("tv");
  });

  it("round-trips its own defaults", () => {
    expect(parseFilters(JSON.stringify(DEFAULT_FILTERS))).toEqual(DEFAULT_FILTERS);
  });
});

describe("parseFilters — repairing fields", () => {
  it("drops values outside the vocabularies", () => {
    const filters = parseFilters({
      kind: "audiobook",
      source: "whatever",
      statuses: ["released", "made-up"],
    });

    expect(filters.kind).toBe(DEFAULT_FILTERS.kind);
    expect(filters.source).toBe(DEFAULT_FILTERS.source);
    expect(filters.statuses).toEqual(["released"]);
  });

  it("keeps only usable provider ids", () => {
    const filters = parseFilters({ providers: ["8", 9, 0, -3, 1.5, null, "netflix"] });
    expect(filters.providers).toEqual([8, 9]);
  });

  it("clamps numbers and survives ones that are not numbers", () => {
    const filters = parseFilters({ scoreMin: -40, scoreMax: 900, yearMin: "banana" });

    expect(filters.scoreMin).toBe(0);
    expect(filters.scoreMax).toBe(100);
    expect(filters.yearMin).toBe(YEAR_FLOOR);
  });

  it("only accepts a decade it actually offers", () => {
    expect(parseFilters({ decade: 1990 }).decade).toBe(1990);
    expect(parseFilters({ decade: 1937 }).decade).toBeNull();
  });

  it("defaults an old blob with no mode to simple", () => {
    const legacy = { kind: "tv", genres: ["horror"] };
    expect(parseFilters(legacy).mode).toBe("simple");
  });
});

describe("parseFilters — the swap invariants", () => {
  // A minimum above its maximum silently returns nothing at all, which reads
  // as "the list is broken" rather than "the list is empty".
  it("puts the score bounds the right way round", () => {
    const filters = parseFilters({ scoreMin: 90, scoreMax: 20 });
    expect([filters.scoreMin, filters.scoreMax]).toEqual([20, 90]);
  });

  it("puts the year bounds the right way round", () => {
    const filters = parseFilters({ yearMin: 2020, yearMax: 1980 });
    expect([filters.yearMin, filters.yearMax]).toEqual([1980, 2020]);
  });

  it("puts the runtime bounds the right way round", () => {
    const filters = parseFilters({ runtimeMin: 200, runtimeMax: 30 });
    expect([filters.runtimeMin, filters.runtimeMax]).toEqual([30, 200]);
  });
});

describe("parseFilters — cast", () => {
  it("keeps well-formed picks and dedupes by id", () => {
    const filters = parseFilters({
      cast: [
        { id: 17419, name: "Bryan Cranston" },
        { id: 17419, name: "Bryan Cranston" },
        { id: 6193, name: "Leonardo DiCaprio" },
      ],
    });

    expect(filters.cast).toEqual([
      { id: 17419, name: "Bryan Cranston" },
      { id: 6193, name: "Leonardo DiCaprio" },
    ]);
  });

  it("drops picks with no usable id", () => {
    const filters = parseFilters({
      cast: [{ name: "Nobody" }, { id: "x" }, { id: 0 }, null, "person", { id: 12 }],
    });

    // The survivor keeps a readable placeholder rather than an empty chip.
    expect(filters.cast).toEqual([{ id: 12, name: "#12" }]);
  });

  it("is empty for a list saved before the filter existed", () => {
    expect(parseFilters({ kind: "movie" }).cast).toEqual([]);
  });
});

describe("isNarrowed", () => {
  it("is false for the defaults", () => {
    expect(isNarrowed(DEFAULT_FILTERS)).toBe(false);
  });

  it("counts a cast pick as narrowing", () => {
    expect(isNarrowed({ ...DEFAULT_FILTERS, cast: [{ id: 1, name: "A" }] })).toBe(true);
  });

  it("ignores a year range that spans everything", () => {
    const wide = { ...DEFAULT_FILTERS, yearMin: YEAR_FLOOR, yearMax: YEAR_CEILING };
    expect(isNarrowed(wide)).toBe(false);
  });
});

describe("known rough edges", () => {
  /**
   * Asserted as-is rather than fixed. `clamp(0, 1, …)` floors this at one
   * minute, so a stored `maxRuntime: 0` becomes "under a minute" instead of
   * "no limit" — which is almost certainly not what anyone meant. Nothing in
   * the editor can currently produce a zero, so this is latent rather than
   * live; the test is here to make the behaviour deliberate and to notice if
   * it ever changes.
   */
  it("turns a zero runtime cap into one minute rather than no cap", () => {
    expect(parseFilters({ maxRuntime: 0 }).maxRuntime).toBe(1);
  });

  it("treats a runtime cap above the ceiling as the ceiling", () => {
    expect(parseFilters({ maxRuntime: 9000 }).maxRuntime).toBe(RUNTIME_CEILING);
  });
});
