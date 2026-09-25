import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { isCurrent, signSession, verifySession } from "@/lib/session";

const key = new TextEncoder().encode("a-test-secret-that-is-comfortably-over-32-chars");
const otherKey = new TextEncoder().encode("a-different-secret-also-well-over-32-characters");

describe("session tokens", () => {
  it("round-trips a user id and token version", async () => {
    const token = await signSession({ userId: "user_1", tokenVersion: 3 }, key);
    expect(await verifySession(token, key)).toEqual({ userId: "user_1", tokenVersion: 3 });
  });

  it("accepts a cookie minted the way the current app mints them", async () => {
    // Built by hand rather than with signSession, so a drift in either
    // direction breaks this test instead of both sides drifting together.
    const legacy = await new SignJWT({ sub: "ckold", v: 2 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("30d")
      .sign(key);
    expect(await verifySession(legacy, key)).toEqual({ userId: "ckold", tokenVersion: 2 });
  });

  it("treats a token from before the version claim as version 0", async () => {
    const old = await new SignJWT({ sub: "ckold" })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("30d")
      .sign(key);
    expect(await verifySession(old, key)).toEqual({ userId: "ckold", tokenVersion: 0 });
  });

  it("refuses a token signed with another key", async () => {
    const token = await signSession({ userId: "user_1", tokenVersion: 0 }, otherKey);
    expect(await verifySession(token, key)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const expired = await new SignJWT({ sub: "user_1", v: 0 })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(key);
    expect(await verifySession(expired, key)).toBeNull();
  });

  it("refuses a token with no subject, a tampered payload, or nothing at all", async () => {
    const noSub = await new SignJWT({ v: 0 }).setProtectedHeader({ alg: "HS256" }).sign(key);
    expect(await verifySession(noSub, key)).toBeNull();

    const token = await signSession({ userId: "user_1", tokenVersion: 0 }, key);
    const [h, , s] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "admin", v: 0 })).toString("base64url");
    expect(await verifySession(`${h}.${forged}.${s}`, key)).toBeNull();

    expect(await verifySession(undefined, key)).toBeNull();
    expect(await verifySession("not-a-jwt", key)).toBeNull();
  });

  it("is only current while the stamp matches the account", () => {
    expect(isCurrent({ userId: "u", tokenVersion: 1 }, 1)).toBe(true);
    // Signing out everywhere bumps the row; older tokens stop counting.
    expect(isCurrent({ userId: "u", tokenVersion: 1 }, 2)).toBe(false);
  });
});

describe("password hashes", () => {
  it("verifies the bcrypt hashes the current app stores", async () => {
    // Cost 10 and bcryptjs, as the current app writes them.
    const stored = await bcrypt.hash("correct horse battery", 10);
    expect(stored.startsWith("$2")).toBe(true);
    expect(await bcrypt.compare("correct horse battery", stored)).toBe(true);
    expect(await bcrypt.compare("wrong horse battery", stored)).toBe(false);
  });
});
