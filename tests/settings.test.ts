import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { parseProviders } from "@/lib/providers";
import {
  deleteAccount,
  regionProvidersCacheKey,
  regionServices,
  setNotify,
  setRegion,
  setScreensaverIdle,
  setServices,
} from "@/lib/settings";
import { film, freshUser } from "./helpers/db";

/**
 * Settings' writes, each one column on the account and each checked on the
 * server whatever the browser sent; and deleting an account, which has to
 * take everything of theirs with it and nothing of anyone else's.
 */

/** An account with a known age, since the oldest one is the admin. */
async function account(name: string, createdAt: string) {
  return db.user.create({
    data: { email: `${name.toLowerCase()}-${Date.now()}@example.com`, name, passwordHash: "x", createdAt: new Date(createdAt) },
  });
}

describe("subscriptions and region", () => {
  it("saves the services chosen, keeps only ones it offers, and stores none as null", async () => {
    const user = await freshUser();
    expect(await setServices(user.id, [8, 1899, 8, 999_999, "8"])).toEqual([8, 1899]);
    const row = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { providers: true } });
    expect(parseProviders(row.providers)).toEqual([8, 1899]);

    await setServices(user.id, []);
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).providers).toBeNull();
  });

  it("offers the region's services once TMDB's list is cached, and every known one before", async () => {
    const before = await regionServices("NL");
    expect(before.length).toBeGreaterThan(10);

    const expiresAt = new Date(Date.now() + 60_000);
    // Netflix under its second id, and Videoland; no Hulu, which is not sold in the Netherlands.
    await db.tmdbCache.create({
      data: { key: regionProvidersCacheKey("movie", "NL"), body: JSON.stringify({ results: [{ provider_id: 1796 }, { provider_id: 72 }] }), expiresAt },
    });
    await db.tmdbCache.create({
      data: { key: regionProvidersCacheKey("tv", "NL"), body: JSON.stringify({ results: [{ provider_id: 8 }] }), expiresAt },
    });
    const names = (await regionServices("NL")).map((s) => s.name);
    expect(names).toEqual(["Netflix", "Videoland"]);

    // A service already chosen stays offered, so it can be taken off again.
    expect((await regionServices("NL", [15])).map((s) => s.name)).toContain("Hulu");
  });

  it("saves a region TMDB answers for, clears it with null, and refuses anything else", async () => {
    const user = await freshUser();
    expect(await setRegion(user.id, "NL")).toBe("NL");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).region).toBe("NL");
    expect(await setRegion(user.id, null)).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).region).toBeNull();
    await expect(setRegion(user.id, "XX")).rejects.toThrow();
    await expect(setRegion(user.id, "nl")).rejects.toThrow();
  });

  it("takes only the offered screensaver delays, and saves the two push switches", async () => {
    const user = await freshUser();
    expect(await setScreensaverIdle(user.id, 10)).toBe(10);
    await expect(setScreensaverIdle(user.id, 7)).rejects.toThrow();
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).screensaverIdle).toBe(10);

    const fresh = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([fresh.notifyFriends, fresh.notifyChallenges]).toEqual([true, false]);
    await setNotify(user.id, "friends", false);
    await setNotify(user.id, "challenges", true);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect([after.notifyFriends, after.notifyChallenges]).toEqual([false, true]);
  });
});

describe("deleting an account", () => {
  it("needs the word typed, then takes everything of theirs and nothing of anyone else's", async () => {
    const admin = await account("Admin", "2020-01-01T00:00:00Z");
    const anna = await account("Anna", "2021-01-01T00:00:00Z");

    await recordPlay(anna.id, film());
    await recordPlay(admin.id, film());
    await db.watchlistItem.create({ data: { userId: anna.id, mediaType: "movie", tmdbId: 603, title: "The Matrix" } });
    await db.unlockedAchievement.create({ data: { userId: anna.id, key: "first-contact" } });
    await db.friendship.create({ data: { requesterId: admin.id, addresseeId: anna.id, status: "accepted" } });
    await db.pushSubscription.create({ data: { userId: anna.id, endpoint: "https://push.example/anna", p256dh: "k", auth: "a" } });
    await db.tmdbCache.create({ data: { key: "/movie/550", body: "{}", expiresAt: new Date(Date.now() + 60_000) } });

    expect(await deleteAccount(anna.id, "yes")).toMatchObject({ ok: false });
    expect(await db.user.count({ where: { id: anna.id } })).toBe(1);

    expect(await deleteAccount(anna.id, " Delete ")).toEqual({ ok: true });
    expect(await db.user.count({ where: { id: anna.id } })).toBe(0);
    for (const count of [
      db.play.count({ where: { userId: anna.id } }),
      db.watchedMovie.count({ where: { userId: anna.id } }),
      db.watchlistItem.count({ where: { userId: anna.id } }),
      db.unlockedAchievement.count({ where: { userId: anna.id } }),
      db.pushSubscription.count({ where: { userId: anna.id } }),
      db.friendship.count({ where: { OR: [{ requesterId: anna.id }, { addresseeId: anna.id }] } }),
    ]) {
      expect(await count).toBe(0);
    }

    // The other account and the shared cache are untouched.
    expect(await db.play.count({ where: { userId: admin.id } })).toBe(1);
    expect(await db.tmdbCache.count({ where: { key: "/movie/550" } })).toBe(1);
  });

  it("keeps the admin while anyone else is here, and lets the last one go", async () => {
    const admin = await account("Admin", "2020-01-01T00:00:00Z");
    const anna = await account("Anna", "2021-01-01T00:00:00Z");
    expect(await deleteAccount(admin.id, "delete")).toMatchObject({ ok: false });
    expect(await db.user.count({ where: { id: admin.id } })).toBe(1);

    await deleteAccount(anna.id, "delete");
    expect(await deleteAccount(admin.id, "delete")).toEqual({ ok: true });
    expect(await db.user.count()).toBe(0);
  });
});
