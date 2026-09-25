import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  acceptFriend,
  canSeeProfile,
  friendActivity,
  friendViewings,
  friendsPage,
  relationBetween,
  requestFriend,
  sharedTitleCount,
  unfriend,
  withdrawRequest,
} from "@/lib/friends";
import { deriveNotifications } from "@/lib/notifications";
import { recordPlay } from "@/lib/plays";
import { recommendTargets, recommendTitle } from "@/lib/recommend";
import { episode, film, freshUser } from "./helpers/db";

/**
 * Profiles are private until both sides agree. These pin who may see what at
 * each stage of a request, and that only the right person can move it on.
 */

describe("friendship privacy", () => {
  it("shows a stranger nothing but a name, at every stage short of agreement", async () => {
    const me = await freshUser();
    const tom = await freshUser();
    expect(await relationBetween(me.id, me.id)).toEqual({ kind: "self" });
    expect(canSeeProfile(await relationBetween(me.id, me.id))).toBe(true);

    expect(canSeeProfile(await relationBetween(me.id, tom.id))).toBe(false);

    const sent = await requestFriend(me.id, tom.id);
    expect(sent).toMatchObject({ ok: true, notify: tom.id });
    const mine = await relationBetween(me.id, tom.id);
    const theirs = await relationBetween(tom.id, me.id);
    expect(mine.kind).toBe("requested");
    expect(theirs.kind).toBe("asked");
    // Asking is not agreeing, in either direction.
    expect(canSeeProfile(mine)).toBe(false);
    expect(canSeeProfile(theirs)).toBe(false);
  });

  it("lets only the person asked accept, and then both see each other", async () => {
    const me = await freshUser();
    const eva = await freshUser();
    await requestFriend(eva.id, me.id);
    const request = await db.friendship.findFirstOrThrow({ where: { requesterId: eva.id } });

    expect(await acceptFriend(eva.id, request.id)).toMatchObject({ ok: false });
    expect(await acceptFriend(me.id, request.id)).toMatchObject({ ok: true });
    expect(canSeeProfile(await relationBetween(me.id, eva.id))).toBe(true);
    expect(canSeeProfile(await relationBetween(eva.id, me.id))).toBe(true);
  });

  it("treats asking someone who already asked you as agreeing", async () => {
    const me = await freshUser();
    const eva = await freshUser();
    await requestFriend(eva.id, me.id);
    const answer = await requestFriend(me.id, eva.id);
    expect(answer).toMatchObject({ ok: true, message: "You are now friends" });
    expect(answer.ok && answer.notify).toBeFalsy();
    expect(await db.friendship.count({ where: { OR: [{ requesterId: me.id }, { requesterId: eva.id }] } })).toBe(1);
  });

  it("lets either end withdraw a pending request, nobody else, and unfriending closes the profile again", async () => {
    const [me, tom, stranger] = [await freshUser(), await freshUser(), await freshUser()];
    await requestFriend(me.id, tom.id);
    const row = await db.friendship.findFirstOrThrow({ where: { requesterId: me.id } });
    expect(await withdrawRequest(stranger.id, row.id)).toMatchObject({ ok: false });
    expect(await withdrawRequest(tom.id, row.id)).toMatchObject({ ok: true });
    expect((await relationBetween(me.id, tom.id)).kind).toBe("none");

    await requestFriend(me.id, tom.id);
    await acceptFriend(tom.id, (await db.friendship.findFirstOrThrow({ where: { requesterId: me.id } })).id);
    await unfriend(tom.id, me.id);
    expect(canSeeProfile(await relationBetween(me.id, tom.id))).toBe(false);
  });

  it("shows friends' activity and never a stranger's", async () => {
    const [me, anna, stranger] = [await freshUser(), await freshUser(), await freshUser()];
    await requestFriend(me.id, anna.id);
    await acceptFriend(anna.id, (await db.friendship.findFirstOrThrow({ where: { requesterId: me.id } })).id);
    await recordPlay(anna.id, { ...episode(1, 5, { tmdbId: 10, title: "Lanterns" }), watchedAt: new Date() });
    await recordPlay(stranger.id, { ...film({ tmdbId: 11, title: "Secret" }), watchedAt: new Date() });

    const rows = await friendActivity(me.id);
    expect(rows.map((r) => r.title)).toEqual(["Lanterns"]);
    expect(rows[0]).toMatchObject({ who: anna.name, what: "watched S01 · E05" });
  });

  it("lists friends' latest viewings for Home, every play, with a rewatch marked Again", async () => {
    const [me, anna, stranger] = [await freshUser(), await freshUser(), await freshUser()];
    await requestFriend(me.id, anna.id);
    await acceptFriend(anna.id, (await db.friendship.findFirstOrThrow({ where: { requesterId: me.id } })).id);
    // Months ago, so a quiet week still shows it: the rail has no window.
    await recordPlay(anna.id, { ...film({ tmdbId: 12, title: "Heat" }), watchedAt: new Date(Date.now() - 90 * 86_400_000) });
    await recordPlay(anna.id, { ...episode(1, 4, { tmdbId: 10, title: "Lanterns" }), watchedAt: new Date(Date.now() - 3_600_000) });
    await recordPlay(anna.id, { ...episode(1, 5, { tmdbId: 10, title: "Lanterns" }), watchedAt: new Date(Date.now() - 1_800_000) });
    await recordPlay(anna.id, { ...film({ tmdbId: 12, title: "Heat" }), watchedAt: new Date() });
    await recordPlay(stranger.id, { ...film({ tmdbId: 11, title: "Secret" }), watchedAt: new Date() });

    const rows = await friendViewings(me.id);
    expect(rows.map((r) => [r.title, r.episodeNumber, r.again])).toEqual([
      ["Heat", null, true],
      ["Lanterns", 5, false],
      ["Lanterns", 4, false],
      ["Heat", null, false],
    ]);
    expect(rows[0].friend).toMatchObject({ id: anna.id, name: anna.name });
    expect(await friendViewings(stranger.id)).toEqual([]);
  });
});

describe("the friends page", () => {
  it("sorts people into requests in and out, friends with titles in common, and everyone else", async () => {
    const [me, anna, eva, tom, ruben] = [await freshUser(), await freshUser(), await freshUser(), await freshUser(), await freshUser()];
    await requestFriend(me.id, anna.id);
    await acceptFriend(anna.id, (await db.friendship.findFirstOrThrow({ where: { requesterId: me.id, addresseeId: anna.id } })).id);
    await requestFriend(eva.id, me.id);
    await requestFriend(me.id, tom.id);

    await recordPlay(me.id, { ...film({ tmdbId: 1 }), watchedAt: new Date() });
    await recordPlay(anna.id, { ...film({ tmdbId: 1 }), watchedAt: new Date() });
    await recordPlay(me.id, { ...episode(1, 1, { tmdbId: 2 }), watchedAt: new Date() });
    await recordPlay(anna.id, { ...episode(2, 3, { tmdbId: 2 }), watchedAt: new Date() });
    await recordPlay(anna.id, { ...film({ tmdbId: 3 }), watchedAt: new Date() });
    expect(await sharedTitleCount(me.id, anna.id)).toBe(2);

    const page = await friendsPage(me.id);
    expect(page.friends.map((f) => [f.id, f.shared])).toEqual([[anna.id, 2]]);
    expect(page.incoming.map((r) => r.id)).toEqual([eva.id]);
    expect(page.outgoing.map((r) => r.id)).toEqual([tom.id]);
    expect(page.others.map((p) => p.id)).toContain(ruben.id);
    expect(page.others.map((p) => p.id)).not.toContain(anna.id);
    expect(page.others.map((p) => p.id)).not.toContain(me.id);
  });
});

describe("recommending a title", () => {
  const digger = { mediaType: "tv" as const, tmdbId: 777, title: "Digger", poster: "/d.jpg" };

  async function friends() {
    const anna = await freshUser();
    const me = await freshUser();
    const asked = await requestFriend(anna.id, me.id);
    const row = await db.friendship.findFirstOrThrow({ where: { requesterId: anna.id, addresseeId: me.id } });
    expect(asked.ok).toBe(true);
    await acceptFriend(me.id, row.id);
    return { anna, me };
  }

  it("reaches a friend's bell as 'Anna recommends Digger', and nobody else's", async () => {
    const { anna, me } = await friends();
    const stranger = await freshUser();

    expect(await recommendTitle(anna.id, stranger.id, digger)).toMatchObject({ ok: false });
    expect(await recommendTitle(anna.id, anna.id, digger)).toMatchObject({ ok: false });
    expect(await db.recommendation.count({ where: { fromUserId: anna.id } })).toBe(0);

    expect(await recommendTitle(anna.id, me.id, digger)).toEqual({ ok: true });
    const { items } = await deriveNotifications(me.id);
    expect(items.find((i) => i.kind === "recommendation")).toMatchObject({
      title: `${anna.name} recommends Digger`,
      href: "/title/tv/777",
    });
    expect((await deriveNotifications(stranger.id)).items.some((i) => i.kind === "recommendation")).toBe(false);
  });

  it("lists friends ticked where it was sent, and a second send brings it back unread rather than doubling it", async () => {
    const { anna, me } = await friends();
    expect(await recommendTargets(anna.id, "tv", 777)).toEqual([expect.objectContaining({ id: me.id, sent: false })]);

    await recommendTitle(anna.id, me.id, digger, new Date("2026-09-01T10:00:00Z"));
    await db.recommendation.updateMany({ where: { toUserId: me.id }, data: { seenAt: new Date(), dismissedAt: new Date() } });
    await recommendTitle(anna.id, me.id, digger, new Date("2026-09-20T10:00:00Z"));

    const rows = await db.recommendation.findMany({ where: { fromUserId: anna.id, toUserId: me.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seenAt: null, dismissedAt: null, createdAt: new Date("2026-09-20T10:00:00Z") });
    expect(await recommendTargets(anna.id, "tv", 777)).toEqual([expect.objectContaining({ id: me.id, sent: true })]);
    // Not to be confused with another title.
    expect(await recommendTargets(anna.id, "movie", 777)).toEqual([expect.objectContaining({ id: me.id, sent: false })]);
  });
});
