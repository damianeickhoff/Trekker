import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, foldSummaries, parseFilters, sentence, statusesFor, withKind, type SmartFilters } from "@/lib/smart-filters";
import { discoverParams } from "@/lib/smart-query";

/**
 * Status and the medium switch. Films and shows have different statuses, so a
 * switch of medium takes away whichever no longer exist, and each half of a
 * "both" query sees only its own.
 */

const CONTEXT = { region: "GB", today: "2026-09-23" };
const f = (patch: Partial<SmartFilters> = {}): SmartFilters => ({ ...DEFAULT_FILTERS, ...patch });
const words = (filters: SmartFilters) => sentence(filters).map((p) => p.text).join("");

describe("switching the medium", () => {
  it("clears a film status on the way to shows, and the folded header says so", () => {
    const films = f({ kind: "movie", statuses: ["released"] });
    expect(foldSummaries(films).status).toBe("Released");
    const shows = withKind(films, "tv");
    expect(shows.kind).toBe("tv");
    expect(shows.statuses).toEqual([]);
    expect(foldSummaries(shows).status).toBe("Any");
    expect(words(shows)).toBe("Shows.");
    // Which is what lets the shows be found at all.
    expect(discoverParams(shows, "tv", CONTEXT)).not.toBeNull();
  });

  it("clears a show status on the way to films", () => {
    const films = withKind(f({ kind: "tv", statuses: ["ended", "cancelled"] }), "movie");
    expect(films.statuses).toEqual([]);
    expect(foldSummaries(films).status).toBe("Any");
  });

  it("keeps every status on the way to both, where both vocabularies are offered, and sorts them out on the way back", () => {
    const both = withKind(f({ kind: "movie", statuses: ["released"] }), "both");
    expect(both.statuses).toEqual(["released"]);
    expect(statusesFor("both").map((s) => s.value)).toContain("released");
    const mixed: SmartFilters = { ...both, statuses: ["released", "ended"] };
    expect(withKind(mixed, "tv").statuses).toEqual(["ended"]);
    expect(withKind(mixed, "movie").statuses).toEqual(["released"]);
  });

  it("offers each kind only its own statuses", () => {
    expect(statusesFor("movie").every((s) => s.applies === "movie")).toBe(true);
    expect(statusesFor("tv").every((s) => s.applies === "tv")).toBe(true);
  });

  it("repairs a stored list that kept a status its kind has no use for", () => {
    const stored = parseFilters(JSON.stringify({ kind: "tv", statuses: ["released", "returning"] }));
    expect(stored.statuses).toEqual(["returning"]);
  });
});

describe("each half of the query sees only its own statuses", () => {
  const both = f({ kind: "both", statuses: ["released", "ended"] });

  it("keeps show statuses out of the films query", () => {
    const films = discoverParams(both, "movie", CONTEXT)!;
    expect(films.with_status).toBeUndefined();
    expect(films["primary_release_date.lte"]).toBe(CONTEXT.today);
  });

  it("keeps film statuses out of the shows query", () => {
    const shows = discoverParams(both, "tv", CONTEXT)!;
    expect(shows.with_status).toBe("3");
    expect(shows["first_air_date.lte"]).toBeUndefined();
    expect(shows["first_air_date.gte"]).toBeUndefined();
  });

  it("drops a half none of the chosen statuses describe", () => {
    expect(discoverParams(f({ kind: "both", statuses: ["unreleased"] }), "tv", CONTEXT)).toBeNull();
    expect(discoverParams(f({ kind: "both", statuses: ["cancelled"] }), "movie", CONTEXT)).toBeNull();
  });
});
