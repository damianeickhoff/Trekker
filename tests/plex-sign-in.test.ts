import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { chooseHomeProfile, placeholderEmail } from "@/lib/plex-accounts";
import { readHandoff } from "@/lib/plex-handoff";
import { finishPlexSignIn } from "@/lib/plex-sign-in";
import { claimPin } from "@/lib/plex-tv";
import { openSecret } from "@/lib/token-vault";
import { freshUser } from "./helpers/db";

/**
 * Signing in with Plex against a stand-in plex.tv: the PIN's states, who an
 * account turns out to be, and the Plex Home picker. Nothing leaves the process.
 */

type Route = (url: URL, init?: RequestInit) => Response | undefined;

function stubPlexTv(route: Route) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "plex.tv") throw new Error(`Unexpected fetch to ${url.hostname}`);
      calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
      return route(url, init) ?? new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const noWait = { attempts: 4, gapMs: 0, wait: async () => undefined };

/** A plex.tv whose PIN 7 is approved with `token`, for the account `account`, with this Home. */
function approvedPlexTv(account: { id: number; email: string; username: string }, home: unknown[] = [], token = "tok-owner") {
  return stubPlexTv((url) => {
    if (url.pathname === "/api/v2/pins/7") return json({ id: 7, authToken: token });
    if (url.pathname === "/api/v2/user") return json(account);
    if (url.pathname === "/api/v2/home/users") return json(home);
    return undefined;
  });
}

beforeEach(() => {
  process.env.AUTH_SECRET = "a-test-secret-that-is-long-enough-for-the-check-0123456789";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the PIN", () => {
  it("waits while Plex has not written the token, then takes it", async () => {
    let asked = 0;
    stubPlexTv((url) => {
      if (url.pathname !== "/api/v2/pins/7") return undefined;
      asked += 1;
      return json(asked < 3 ? { id: 7, authToken: null, expiresIn: 1200 } : { id: 7, authToken: "tok" });
    });
    expect(await claimPin(7, noWait)).toEqual({ status: "approved", token: "tok" });
    expect(asked).toBe(3);
  });

  it("stops at once on an expired PIN", async () => {
    let asked = 0;
    stubPlexTv(() => {
      asked += 1;
      return new Response("", { status: 404 });
    });
    expect(await claimPin(7, noWait)).toEqual({ status: "expired" });
    expect(asked).toBe(1);
  });

  it("gives up as pending after its attempts", async () => {
    stubPlexTv(() => json({ id: 7, authToken: null, expiresIn: 600 }));
    expect(await claimPin(7, noWait)).toEqual({ status: "pending" });
  });

  it("sends the browser back to sign-in with a reason when there is no PIN or it never confirms", async () => {
    expect((await finishPlexSignIn(null, null)).to).toMatch(/^\/login\?plex=/);
    stubPlexTv(() => json({ id: 7, authToken: null, expiresIn: 600 }));
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(decision.signIn).toBeUndefined();
    expect(decodeURIComponent(decision.to)).toContain("did not confirm");
  });
});

describe("which account a Plex identity is", () => {
  it("creates an account with no password for someone new, and stores the token sealed", async () => {
    approvedPlexTv({ id: 501, email: "New@Example.com", username: "newbie" });
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(decision.to).toBe("/");
    const user = await db.user.findUnique({ where: { id: decision.signIn! } });
    expect(user).toMatchObject({ email: "new@example.com", plexAccountId: "501", plexUsername: "newbie", passwordHash: null });
    expect(user!.plexAuthToken).not.toBe("tok-owner");
    expect(openSecret(user!.plexAuthToken)).toBe("tok-owner");
  });

  it("matches by Plex account id before anything else", async () => {
    const linked = await freshUser();
    await db.user.update({ where: { id: linked.id }, data: { plexAccountId: "502" } });
    // Same email as somebody else here: the id wins.
    const other = await freshUser();
    approvedPlexTv({ id: 502, email: other.email, username: "linked" });
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(decision.signIn).toBe(linked.id);
    expect(await db.user.count()).toBe(2);
  });

  it("links a password account with the same email rather than making a second", async () => {
    const existing = await freshUser();
    approvedPlexTv({ id: 503, email: existing.email, username: "same" });
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(decision.signIn).toBe(existing.id);
    expect((await db.user.findUnique({ where: { id: existing.id } }))!.plexAccountId).toBe("503");
  });

  it("links to the account in session when signed in, and refuses a Plex account someone else holds", async () => {
    const viewer = await freshUser();
    approvedPlexTv({ id: 504, email: "someone@example.com", username: "viewer" });
    expect((await finishPlexSignIn(7, viewer.id, noWait)).to).toBe("/settings/connections?plex=linked");
    expect((await db.user.findUnique({ where: { id: viewer.id } }))!.plexAccountId).toBe("504");

    const second = await freshUser();
    const decision = await finishPlexSignIn(7, second.id, noWait);
    expect(decision.signIn).toBeUndefined();
    expect(decodeURIComponent(decision.to)).toContain("already linked");
    expect((await db.user.findUnique({ where: { id: second.id } }))!.plexAccountId).toBeNull();
  });
});

describe("a Plex Home", () => {
  const owner = { id: 600, email: "owner@example.com", username: "owner" };
  const home = [
    { id: 600, uuid: "u600", title: "owner", username: "owner", email: "owner@example.com", admin: true, restricted: false, protected: false },
    { id: 601, uuid: "u601", title: "Sarah", admin: false, restricted: true, protected: true },
    { id: 602, uuid: "u602", title: "Sam", username: "sam", email: "sam@example.com", admin: false, restricted: false, protected: false },
  ];

  it("asks who is watching instead of signing anybody in", async () => {
    approvedPlexTv(owner, home);
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(decision).toMatchObject({ to: "/login/profile" });
    expect(decision.signIn).toBeUndefined();
    const handoff = readHandoff(decision.handoff);
    expect(handoff?.users.map((u) => u.title)).toEqual(["owner", "Sarah", "Sam"]);
    expect(await db.user.count()).toBe(0);
  });

  it("seats a managed profile at an account of its own, switched with its PIN, and the same one next time", async () => {
    const switched: string[] = [];
    stubPlexTv((url) => {
      if (url.pathname === "/api/v2/pins/7") return json({ id: 7, authToken: "tok-owner" });
      if (url.pathname === "/api/v2/user") return json(owner);
      if (url.pathname === "/api/v2/home/users") return json(home);
      if (url.pathname === "/api/v2/home/users/u601/switch") {
        switched.push(url.searchParams.get("pin") ?? "");
        return json({ authToken: "tok-sarah" });
      }
      return undefined;
    });

    const first = await finishPlexSignIn(7, null, noWait);
    expect((await chooseHomeProfile(first.handoff, "601", "")).ok).toBe(false);
    const seated = await chooseHomeProfile(first.handoff, "601", "1234");
    expect(seated.ok).toBe(true);
    expect(switched).toEqual(["1234"]);
    const sarah = await db.user.findUnique({ where: { id: (seated as { userId: string }).userId } });
    expect(sarah).toMatchObject({ name: "Sarah", email: placeholderEmail("601"), plexAccountId: "601", plexUsername: "Sarah", plexManaged: true });
    expect(openSecret(sarah!.plexAuthToken)).toBe("tok-sarah");
    // The handoff is spent.
    expect(readHandoff(first.handoff)).toBeNull();

    const again = await finishPlexSignIn(7, null, noWait);
    const back = await chooseHomeProfile(again.handoff, "601", "1234");
    expect(back).toEqual({ ok: true, userId: sarah!.id });
    expect(await db.user.count({ where: { plexAccountId: "601" } })).toBe(1);
  });

  it("maps each person to their own account and makes the household friends once", async () => {
    stubPlexTv((url) => {
      if (url.pathname === "/api/v2/pins/7") return json({ id: 7, authToken: "tok-owner" });
      if (url.pathname === "/api/v2/user") return json(owner);
      if (url.pathname === "/api/v2/home/users") return json(home);
      if (url.pathname === "/api/v2/home/users/u602/switch") return json({ authToken: "tok-sam" });
      return undefined;
    });
    // Sam already has a password account under the address Plex knows.
    const sam = await db.user.create({ data: { email: "sam@example.com", name: "Sam", passwordHash: "x" } });

    const a = await finishPlexSignIn(7, null, noWait);
    const ownerSeat = await chooseHomeProfile(a.handoff, "600", "");
    const b = await finishPlexSignIn(7, null, noWait);
    const samSeat = await chooseHomeProfile(b.handoff, "602", "");

    expect(ownerSeat.ok && samSeat.ok).toBe(true);
    const ownerId = (ownerSeat as { userId: string }).userId;
    expect((samSeat as { userId: string }).userId).toBe(sam.id);
    expect((await db.user.findUnique({ where: { id: ownerId } }))!.plexAccountId).toBe("600");
    expect((await db.user.findUnique({ where: { id: sam.id } }))!.plexAccountId).toBe("602");
    const friends = await db.friendship.findMany({ where: { status: "accepted" } });
    expect(friends).toHaveLength(1);
    expect((await db.user.findUnique({ where: { id: sam.id } }))!.plexHomeLinkedAt).not.toBeNull();
  });

  it("refuses a profile that was not on offer", async () => {
    approvedPlexTv(owner, home);
    const decision = await finishPlexSignIn(7, null, noWait);
    expect(await chooseHomeProfile(decision.handoff, "999", "")).toEqual({ ok: false, error: "Pick a profile to carry on." });
    expect(await chooseHomeProfile("not-a-handle", "601", "1")).toMatchObject({ ok: false });
  });
});
