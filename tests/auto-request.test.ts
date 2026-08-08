import { describe, expect, it } from "vitest";
import { AUTO_REQUEST_MAX, requestCap } from "@/lib/auto-request-limits";

/**
 * The cap is the whole safety story for auto-requesting, so it is the part worth
 * pinning down. Everything else in that feature talks to Overseerr and TMDB and
 * belongs in a manual test against a real server.
 */
describe("requestCap", () => {
  it("passes a sensible number through", () => {
    expect(requestCap(1)).toBe(1);
    expect(requestCap(5)).toBe(5);
    expect(requestCap(AUTO_REQUEST_MAX)).toBe(AUTO_REQUEST_MAX);
  });

  it("refuses to exceed the ceiling however it is asked", () => {
    // A number in the database is not a promise: the column is an INTEGER and
    // nothing at the SQL level stops somebody putting 5000 in it.
    expect(requestCap(21)).toBe(AUTO_REQUEST_MAX);
    expect(requestCap(5000)).toBe(AUTO_REQUEST_MAX);
    expect(requestCap(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("never returns zero or negative, which would silently disable it", () => {
    expect(requestCap(0)).toBe(1);
    expect(requestCap(-4)).toBe(1);
  });

  it("survives values that are not numbers at all", () => {
    expect(requestCap(Number.NaN)).toBe(1);
    expect(requestCap(2.7)).toBe(2);
  });
});
