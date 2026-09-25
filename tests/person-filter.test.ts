import { beforeEach, describe, expect, it } from "vitest";
import { filmographyFor, filterFilmography, parsePersonFilter } from "@/lib/person";
import { recordPlay } from "@/lib/plays";
import type { PersonDetails } from "@/lib/tmdb";
import { T0, episode, film, freshUser } from "./helpers/db";

/**
 * The person page's filmography chips. "Seen" is a film watched or a show
 * with any episode watched, the same thing the tick on the poster means, and
 * the four chips together still account for every title.
 */

const cast = [
  { id: 550, media_type: "movie" as const, title: "Fight Club", release_date: "1999-10-15", character: "Tyler" },
  { id: 551, media_type: "movie" as const, title: "Unwatched Film", release_date: "2001-01-01", character: "Someone" },
  { id: 1396, media_type: "tv" as const, name: "Breaking Bad", first_air_date: "2008-01-20", character: "Walter", episode_count: 62 },
  { id: 1397, media_type: "tv" as const, name: "Unstarted Show", first_air_date: "2010-01-01", character: "Someone", episode_count: 10 },
];

const person: PersonDetails = {
  id: 287,
  name: "Someone Famous",
  biography: "",
  birthday: null,
  deathday: null,
  place_of_birth: null,
  known_for_department: "Acting",
  profile_path: null,
  combined_credits: { cast, crew: [] },
};

let userId: string;
beforeEach(async () => {
  userId = (await freshUser()).id;
});

describe("the person page's Seen filter", () => {
  it("keeps films watched and shows started, and nothing else", async () => {
    await recordPlay(userId, { ...film(), watchedAt: T0 });
    await recordPlay(userId, { ...episode(1, 1), watchedAt: T0 });

    const { items } = await filmographyFor(userId, person);
    const titles = (f: Parameters<typeof filterFilmography>[1]) => filterFilmography(items, f).map((i) => i.title).sort();

    expect(titles("seen")).toEqual(["Breaking Bad", "Fight Club"]);
    expect(titles("unseen")).toEqual(["Unstarted Show", "Unwatched Film"]);
    expect(titles("all")).toHaveLength(4);
    expect(titles("services")).toEqual([]);
  });

  it("reads the chip from the address, anything unknown being everything", () => {
    expect(parsePersonFilter("seen")).toBe("seen");
    expect(parsePersonFilter("unseen")).toBe("unseen");
    expect(parsePersonFilter("services")).toBe("services");
    expect(parsePersonFilter(undefined)).toBe("all");
    expect(parsePersonFilter("nonsense")).toBe("all");
  });
});
