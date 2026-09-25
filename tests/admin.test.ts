import { describe, expect, it, vi } from "vitest";
import { accountsForAdmin, badgesHeldBy, isAdmin, takeBack } from "@/lib/admin";
import { db } from "@/lib/db";
import { recordPlay } from "@/lib/plays";
import { film } from "./helpers/db";

/**
 * Taking a badge back: the admin alone, the unlock row alone. The page itself
 * is a 404 for anyone else, so it does not advertise that it exists.
 */

const who = vi.hoisted(() => ({ id: "" }));
vi.mock("@/lib/auth", () => ({
  getCurrentUser: async () => (who.id ? { id: who.id, email: "x@example.com", name: "X", tokenVersion: 0 } : null),
  getSession: async () => (who.id ? { userId: who.id, tokenVersion: 0 } : null),
}));

async function account(name: string, createdAt: string) {
  return db.user.create({
    data: { email: `${name.toLowerCase()}-${Date.now()}@example.com`, name, passwordHash: "x", createdAt: new Date(createdAt) },
  });
}

describe("the admin's take-back", () => {
  it("is the oldest account's alone", async () => {
    const admin = await account("Damian", "2020-01-01T00:00:00Z");
    const anna = await account("Anna", "2021-06-01T00:00:00Z");
    expect(await isAdmin(admin.id)).toBe(true);
    expect(await isAdmin(anna.id)).toBe(false);

    await db.unlockedAchievement.create({ data: { userId: admin.id, key: "first-contact" } });
    expect(await takeBack(anna.id, admin.id, "first-contact")).toBe(false);
    expect(await db.unlockedAchievement.count({ where: { userId: admin.id } })).toBe(1);

    const accounts = await accountsForAdmin();
    expect(accounts.map((a) => [a.name, a.admin, a.badges])).toEqual([
      ["Damian", true, 1],
      ["Anna", false, 0],
    ]);
  });

  it("deletes the one unlock row and nothing else", async () => {
    const admin = await account("Damian", "2020-01-01T00:00:00Z");
    const anna = await account("Anna", "2021-06-01T00:00:00Z");
    await recordPlay(anna.id, film());
    await db.unlockedAchievement.create({ data: { userId: anna.id, key: "first-contact" } });
    await db.unlockedAchievement.create({ data: { userId: anna.id, key: "century-club" } });
    const before = await db.user.findUniqueOrThrow({ where: { id: anna.id } });

    expect(await takeBack(admin.id, anna.id, "first-contact")).toBe(true);

    expect((await db.unlockedAchievement.findMany({ where: { userId: anna.id } })).map((r) => r.key)).toEqual(["century-club"]);
    // The history that earned it, and the counts cached from it, are untouched.
    expect(await db.play.count({ where: { userId: anna.id } })).toBe(1);
    expect(await db.watchedMovie.count({ where: { userId: anna.id } })).toBe(1);
    const after = await db.user.findUniqueOrThrow({ where: { id: anna.id } });
    expect(after.playCount).toBe(before.playCount);
    expect(after.watchedMovieCount).toBe(before.watchedMovieCount);

    // Taking back what is not there changes nothing and says so.
    expect(await takeBack(admin.id, anna.id, "first-contact")).toBe(false);
  });

  it("lists an account's badges newest first, by the catalogue's names", async () => {
    const admin = await account("Damian", "2020-01-01T00:00:00Z");
    await db.unlockedAchievement.create({ data: { userId: admin.id, key: "first-contact", unlockedAt: new Date("2024-03-01") } });
    await db.unlockedAchievement.create({ data: { userId: admin.id, key: "no-such-badge", unlockedAt: new Date("2025-01-01") } });
    const held = await badgesHeldBy(admin.id);
    expect(held).toHaveLength(1);
    expect(held[0].key).toBe("first-contact");
  });

  it("is a 404 for anyone but the admin", async () => {
    const admin = await account("Damian", "2020-01-01T00:00:00Z");
    const anna = await account("Anna", "2021-06-01T00:00:00Z");
    const { default: AdminBadgesPage } = await import("@/app/(app)/settings/badges/page");

    who.id = anna.id;
    await expect(AdminBadgesPage({ searchParams: Promise.resolve({}) })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });

    who.id = admin.id;
    await expect(AdminBadgesPage({ searchParams: Promise.resolve({ u: anna.id }) })).resolves.toBeTruthy();
    who.id = "";
    // The page brings all of Settings with it now, which a busy machine takes a while to import the first time.
  }, 30_000);
});
