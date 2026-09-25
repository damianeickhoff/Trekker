import { describe, expect, it } from "vitest";
import { filmMeta, seriesMeta, statusWord, taglineOf } from "@/lib/meta-line";

/**
 * The line of facts under a title: the old app's facts in its order, the
 * status in the app's own words, votes with a thousands separator, and the
 * tagline only where TMDB has one.
 */

const genres = [{ id: 18, name: "Drama" }, { id: 80, name: "Crime" }, { id: 53, name: "Thriller" }, { id: 9648, name: "Mystery" }];

describe("the title meta line", () => {
  it("gives a series its year, three genres, seasons, votes and status, and no episode count", () => {
    const facts = seriesMeta({ first_air_date: "2008-01-20", genres, number_of_seasons: 5, vote_count: 15321, status: "Ended" });
    expect(facts).toEqual(["2008", "Drama, Crime, Thriller", "5 seasons", "15,321 votes", "Ended"]);
    expect(facts.join(" · ")).toBe("2008 · Drama, Crime, Thriller · 5 seasons · 15,321 votes · Ended");
  });

  it("gives a film its running time in place of seasons", () => {
    const facts = filmMeta({ release_date: "1999-10-15", genres: genres.slice(0, 1), runtime: 109, vote_count: 1234567, status: "Released" });
    expect(facts).toEqual(["1999", "Drama", "109 min", "1,234,567 votes", "Released"]);
  });

  it("says one of a thing in the singular and leaves out what is unknown", () => {
    expect(seriesMeta({ first_air_date: "", genres: [], number_of_seasons: 1, vote_count: 1, status: "Returning Series" })).toEqual([
      "1 season",
      "1 vote",
      "Returning series",
    ]);
    expect(filmMeta({ release_date: "", genres: [], runtime: null, vote_count: 0, status: "In Production" })).toEqual([
      "0 votes",
      "In production",
    ]);
  });

  it("words TMDB's statuses as the app does", () => {
    expect(statusWord("Returning Series")).toBe("Returning series");
    expect(statusWord("Ended")).toBe("Ended");
    expect(statusWord("Canceled")).toBe("Cancelled");
    expect(statusWord("Released")).toBe("Released");
    expect(statusWord("In Production")).toBe("In production");
    expect(statusWord("Post Production")).toBe("In production");
    expect(statusWord("Planned")).toBe("Planned");
    expect(statusWord("")).toBeNull();
    expect(statusWord(undefined)).toBeNull();
  });

  it("shows a tagline only where there is one", () => {
    expect(taglineOf({ tagline: "Remember my name." })).toBe("Remember my name.");
    expect(taglineOf({ tagline: "" })).toBeNull();
    expect(taglineOf({ tagline: "   " })).toBeNull();
    expect(taglineOf({})).toBeNull();
  });
});
