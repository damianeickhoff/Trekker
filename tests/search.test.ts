import { describe, expect, it } from "vitest";
import { groupResults, parseSearchType, personLine } from "@/lib/search";
import { rememberQuery } from "@/lib/search-recent";

/** Search's grouping: TMDB's mixed answer split into shows, films and people, in its own order. */
describe("grouping search results", () => {
  const multi = [
    { id: 1, media_type: "tv" as const, name: "Lanterns", first_air_date: "2026-08-17", vote_average: 8.4, poster_path: "/l.jpg" },
    { id: 2, media_type: "person" as const, name: "Kyle Chandler", known_for_department: "Acting", known_for: [{ id: 1, name: "Lanterns" }] },
    { id: 3, media_type: "movie" as const, title: "Digger", release_date: "2026-10-02", vote_average: 9.1, poster_path: null },
    { id: 4, media_type: "tv" as const, name: "Minerva Academy", first_air_date: "2026-01-01" },
    { id: 1, media_type: "tv" as const, name: "Lanterns again" },
    { id: 5, media_type: "movie" as const, title: "Lantern Night" },
  ];

  it("keeps each kind in TMDB's order, each title once", () => {
    const g = groupResults(multi);
    expect(g.shows.map((s) => s.title)).toEqual(["Lanterns", "Minerva Academy"]);
    expect(g.films.map((f) => f.title)).toEqual(["Digger", "Lantern Night"]);
    expect(g.people.map((p) => p.name)).toEqual(["Kyle Chandler"]);
  });

  it("keeps what the rows need: score as a percentage, year, and a missing poster as null", () => {
    const { films, shows } = groupResults(multi);
    expect(films[0]).toMatchObject({ id: 3, mediaType: "movie", score: 91, year: "2026", poster: null });
    expect(shows[0]).toMatchObject({ id: 1, mediaType: "tv", score: 84, poster: "/l.jpg" });
  });

  it("says what a person is known for", () => {
    expect(groupResults(multi).people[0].line).toBe("Actor · Lanterns");
    expect(personLine({ id: 9, name: "Chris Mundy", known_for_department: "Writing" })).toBe("Writer");
  });

  it("types a one-kind answer, which does not name its media type", () => {
    const films = groupResults([{ id: 7, title: "Brothers" }], "movie");
    expect(films.films.map((f) => f.title)).toEqual(["Brothers"]);
    const people = groupResults([{ id: 8, name: "Glen Powell" }], "person");
    expect(people.people.map((p) => p.name)).toEqual(["Glen Powell"]);
  });

  it("reads the chip from the address, Everything by default", () => {
    expect(["tv", "movie", "person", "all", "nonsense", undefined].map((t) => parseSearchType(t))).toEqual([
      "tv", "movie", "person", "all", "all", "all",
    ]);
  });
});

describe("recent searches", () => {
  it("keeps the newest first, each once whatever its case, eight at most", () => {
    let list: string[] = [];
    for (const q of ["severance", "brothers", "Severance ", "  ", ...Array.from({ length: 9 }, (_, i) => `q${i}`)]) {
      list = rememberQuery(list, q);
    }
    expect(list).toHaveLength(8);
    expect(list[0]).toBe("q8");
    expect(list.filter((q) => q.toLowerCase() === "severance")).toHaveLength(0);
    expect(rememberQuery(["Lanterns", "digger"], "lanterns")).toEqual(["lanterns", "digger"]);
  });
});
