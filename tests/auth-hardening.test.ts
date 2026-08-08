import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authSecretProblem } from "@/lib/secrets";
import {
  LOGIN_LIMIT,
  checkLimit,
  clearLimit,
  describeWait,
  recordFailure,
  resetAllLimits,
} from "@/lib/rate-limit";

describe("AUTH_SECRET validation", () => {
  it("rejects an unset secret", () => {
    expect(authSecretProblem(undefined)).toMatch(/not set/);
    expect(authSecretProblem("")).toMatch(/not set/);
    expect(authSecretProblem("   ")).toMatch(/not set/);
  });

  it("rejects the value shipped in .env.example", () => {
    // The one people paste unchanged, which is exactly why it is named.
    expect(authSecretProblem("change-me-to-a-long-random-string-in-production")).toMatch(
      /example value/,
    );
  });

  it("rejects anything short enough to attack offline", () => {
    expect(authSecretProblem("short")).toMatch(/at least 32/);
    expect(authSecretProblem("a".repeat(31))).toMatch(/at least 32/);
  });

  it("accepts a real one", () => {
    expect(authSecretProblem("a".repeat(32))).toBeNull();
    expect(authSecretProblem(` ${"x".repeat(48)} `)).toBeNull();
  });
});

describe("login rate limiting", () => {
  const key = "login:someone@example.com";

  beforeEach(() => resetAllLimits());
  afterEach(() => resetAllLimits());

  it("allows an untouched key", () => {
    expect(checkLimit(key).allowed).toBe(true);
  });

  it("allows exactly the configured number of failures", () => {
    for (let i = 0; i < LOGIN_LIMIT.attempts; i += 1) {
      expect(checkLimit(key).allowed).toBe(true);
      recordFailure(key);
    }

    const blocked = checkLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryInMs).toBeGreaterThan(0);
  });

  it("forgets a key once someone gets in", () => {
    for (let i = 0; i < LOGIN_LIMIT.attempts; i += 1) recordFailure(key);
    expect(checkLimit(key).allowed).toBe(false);

    clearLimit(key);
    expect(checkLimit(key).allowed).toBe(true);
  });

  it("locks one address without touching another", () => {
    // The reason this is keyed on email rather than IP: a household shares an
    // address, and one person's typos must not lock out everyone else.
    for (let i = 0; i < LOGIN_LIMIT.attempts; i += 1) recordFailure(key);

    expect(checkLimit(key).allowed).toBe(false);
    expect(checkLimit("login:someone-else@example.com").allowed).toBe(true);
  });

  it("lets the window expire", () => {
    const brief = { attempts: 1, windowMs: 1 };
    recordFailure("login:brief", brief);
    expect(checkLimit("login:brief", brief).allowed).toBe(false);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(checkLimit("login:brief", brief).allowed).toBe(true);
        resolve();
      }, 5);
    });
  });
});

describe("describeWait", () => {
  it("reads like something a person would say", () => {
    expect(describeWait(1000)).toBe("in a minute");
    expect(describeWait(60_000)).toBe("in a minute");
    expect(describeWait(4 * 60_000)).toBe("in 4 minutes");
  });
});
