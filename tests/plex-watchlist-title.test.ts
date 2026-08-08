import { describe, expect, it } from "vitest";
import { normaliseTitle, plexTitleMatches } from "@/lib/plex-watchlist";

/**
 * The matcher behind a real bug worth not repeating.
 *
 * Pushing a title to plex.tv needs Plex's own rating key, and there is no
 * endpoint that takes a TMDB id — so the id is traded for one by searching
 * Plex by name. When the guid on a result is missing, the name is all there is
 * to go on, and the fold used to strip every non-alphanumeric character.
 *
 * `«Lucky»` folded to `lucky`, which made it identical to the show actually
 * called *Lucky*. Pushing *Lucky* matched the wrong one, Plex added `«Lucky»`
 * to the account's watchlist, and the next inbound sync pulled it into Trekker
 * — where deleting it did nothing, because the next sync brought it back.
 */

describe("normaliseTitle", () => {
  it("folds case and spacing", () => {
    expect(normaliseTitle("  The   Bear ")).toBe("the bear");
    expect(normaliseTitle("BREAKING BAD")).toBe("breaking bad");
  });

  it("folds accents, so a transliterated title still matches", () => {
    expect(normaliseTitle("Amélie")).toBe("amelie");
    expect(normaliseTitle("Das Boot – Director's Cut")).toBe("das boot – director's cut");
  });

  it("keeps punctuation, because punctuation is part of a title", () => {
    // The bug, pinned. These are different works and must not fold together.
    expect(normaliseTitle("«Lucky»")).not.toBe(normaliseTitle("Lucky"));
    expect(normaliseTitle("[REC]")).not.toBe(normaliseTitle("Rec"));
    expect(normaliseTitle("WALL·E")).not.toBe(normaliseTitle("Wall E"));
    expect(normaliseTitle("Alien³")).not.toBe(normaliseTitle("Alien 3"));
  });
});

describe("plexTitleMatches", () => {
  const entry = { title: "Lucky", year: 2017 };

  it("matches the same title and year", () => {
    expect(plexTitleMatches({ ratingKey: "1", title: "Lucky", year: 2017 }, entry)).toBe(true);
  });

  it("allows a year one either side, since sources disagree by one", () => {
    expect(plexTitleMatches({ ratingKey: "1", title: "Lucky", year: 2016 }, entry)).toBe(true);
    expect(plexTitleMatches({ ratingKey: "1", title: "Lucky", year: 2018 }, entry)).toBe(true);
    expect(plexTitleMatches({ ratingKey: "1", title: "Lucky", year: 2020 }, entry)).toBe(false);
  });

  it("does not match a differently punctuated title", () => {
    expect(plexTitleMatches({ ratingKey: "1", title: "«Lucky»", year: 2017 }, entry)).toBe(false);
  });

  /**
   * A name with no year behind it is a coin toss, and this is the path that
   * writes to somebody's plex.tv account. The old version waved these through.
   */
  it("refuses to match on a name alone", () => {
    expect(plexTitleMatches({ ratingKey: "1", title: "Lucky" }, entry)).toBe(false);
    expect(
      plexTitleMatches({ ratingKey: "1", title: "Lucky", year: 2017 }, { title: "Lucky", year: null }),
    ).toBe(false);
  });

  it("needs a rating key to be any use at all", () => {
    expect(plexTitleMatches({ title: "Lucky", year: 2017 }, entry)).toBe(false);
  });
});
