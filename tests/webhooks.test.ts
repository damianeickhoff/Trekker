import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { deriveNotifications } from "@/lib/notifications";
import { forgetPlexIds } from "@/lib/plex-server";
import { handlePlexWebhook } from "@/lib/plex-webhook";
import { clearFailures } from "@/lib/rate-limit";
import { requestOnSeerr } from "@/lib/request";
import { forgetSeerrUsers } from "@/lib/seerr";
import { handleSeerrWebhook } from "@/lib/seerr-webhook";
import { sealSecret } from "@/lib/token-vault";
import { webhookSecret } from "@/lib/webhook-secrets";
import { freshUser, hours, minutes, T0 } from "./helpers/db";

/**
 * Both webhooks as the services call them, and a request filed as its asker.
 * The Plex server and Overseerr are stand-ins; TMDB is not configured, so
 * titles come from the payloads.
 */

const PLEX = "http://plex.test:32400";
const SEERR = "http://seerr.test:5055";

type Route = (url: URL, init?: RequestInit) => Response | undefined;

function stubHosts(route: Route) {
  const calls: { url: URL; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.hostname !== "plex.test" && url.hostname !== "seerr.test") throw new Error(`Unexpected fetch to ${url.hostname}`);
      calls.push({ url, init });
      return route(url, init) ?? new Response("{}", { status: 404 });
    }),
  );
  return calls;
}

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

/** The admin (oldest account) with both connections, and a viewer signed in with Plex. */
async function instance() {
  const admin = await freshUser();
  await db.user.update({
    where: { id: admin.id },
    data: {
      // The oldest account is the admin; two made in one millisecond must not tie.
      createdAt: new Date("2020-01-01T00:00:00Z"),
      plexUrl: PLEX,
      plexToken: sealSecret("server-token"),
      plexMachineId: "m1",
      seerrUrl: SEERR,
      seerrApiKey: sealSecret("seerr-key"),
    },
  });
  const viewer = await freshUser();
  await db.user.update({ where: { id: viewer.id }, data: { plexAccountId: "9001", plexUsername: "viewer" } });
  return { admin, viewer };
}

function plexRequest(secret: string | null, payload: unknown) {
  const form = new FormData();
  form.set("payload", JSON.stringify(payload));
  const url = `http://trekker.test/api/webhooks/plex${secret === null ? "" : `?key=${encodeURIComponent(secret)}`}`;
  return new Request(url, { method: "POST", body: form });
}

function seerrRequest(secret: string | null, payload: unknown) {
  return new Request("http://trekker.test/api/webhooks/overseerr", {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret === null ? {} : { authorization: secret }) },
    body: JSON.stringify(payload),
  });
}

const film = (overrides: Record<string, unknown> = {}) => ({
  event: "media.scrobble",
  Account: { id: 9001, title: "viewer" },
  Metadata: { type: "movie", ratingKey: "100", title: "Heat", Guid: [{ id: "imdb://tt0113277" }, { id: "tmdb://949" }] },
  ...overrides,
});

beforeEach(() => {
  process.env.AUTH_SECRET = "a-test-secret-that-is-long-enough-for-the-check-0123456789";
  clearFailures("webhook:plex");
  clearFailures("webhook:seerr");
  forgetPlexIds();
  forgetSeerrUsers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PLEX_WEBHOOK_SECRET;
});

describe("the Plex webhook", () => {
  it("refuses a wrong or missing secret with a 401 and writes nothing", async () => {
    const { viewer } = await instance();
    await webhookSecret("plex");
    expect((await handlePlexWebhook(plexRequest("wrong", film()))).status).toBe(401);
    expect((await handlePlexWebhook(plexRequest(null, film()))).status).toBe(401);
    expect(await db.play.count({ where: { userId: viewer.id } })).toBe(0);
  });

  it("takes the current app's PLEX_WEBHOOK_SECRET too", async () => {
    await instance();
    process.env.PLEX_WEBHOOK_SECRET = "carried-over";
    expect((await handlePlexWebhook(plexRequest("carried-over", film()))).status).toBe(200);
  });

  it("logs a film by the TMDB id in its guids, once inside the duplicate window", async () => {
    const { viewer } = await instance();
    const secret = (await webhookSecret("plex"))!;
    stubHosts(() => undefined);

    const first = await handlePlexWebhook(plexRequest(secret, film()), T0);
    expect(first).toMatchObject({ status: 200, body: { outcome: "logged" }, userId: viewer.id });
    const again = await handlePlexWebhook(plexRequest(secret, film()), new Date(T0.getTime() + hours(2)));
    expect(again.body).toEqual({ outcome: "duplicate" });

    const plays = await db.play.findMany({ where: { userId: viewer.id } });
    expect(plays).toHaveLength(1);
    expect(plays[0]).toMatchObject({ mediaType: "movie", tmdbId: 949, title: "Heat", source: "plex" });

    // Past the four hours a film allows, it is a rewatch.
    await handlePlexWebhook(plexRequest(secret, film()), new Date(T0.getTime() + hours(5)));
    expect(await db.play.count({ where: { userId: viewer.id } })).toBe(2);
  });

  it("finds an episode's show from the daily job's row, then from the server's guids", async () => {
    const { viewer } = await instance();
    const secret = (await webhookSecret("plex"))!;
    await db.availability.create({ data: { mediaType: "tv", tmdbId: 1396, onPlex: true, plexRatingKey: "200" } });
    const calls = stubHosts((url) =>
      url.pathname === "/library/metadata/300" ? json({ MediaContainer: { Metadata: [{ Guid: [{ id: "tmdb://1399" }] }] } }) : undefined,
    );
    const episode = (show: string, key: string, s: number, e: number) => ({
      event: "media.scrobble",
      Account: { id: 9001, title: "viewer" },
      Metadata: { type: "episode", ratingKey: `${key}${e}`, grandparentRatingKey: key, grandparentTitle: show, title: `Ep ${e}`, parentIndex: s, index: e },
    });

    expect((await handlePlexWebhook(plexRequest(secret, episode("Breaking Bad", "200", 1, 2)), T0)).body).toEqual({ outcome: "logged" });
    expect(calls).toHaveLength(0);
    expect((await handlePlexWebhook(plexRequest(secret, episode("Game of Thrones", "300", 1, 1)), T0)).body).toEqual({ outcome: "logged" });
    expect(calls.map((c) => c.url.pathname)).toEqual(["/library/metadata/300"]);
    // The server's token, never anyone's own.
    expect(calls[0].url.searchParams.get("X-Plex-Token")).toBe("server-token");

    const plays = await db.play.findMany({ where: { userId: viewer.id }, orderBy: { tmdbId: "asc" } });
    expect(plays.map((p) => [p.tmdbId, p.seasonNumber, p.episodeNumber])).toEqual([
      [1396, 1, 2],
      [1399, 1, 1],
    ]);
    // A second scrobble of the same episode inside half an hour is the same viewing.
    await handlePlexWebhook(plexRequest(secret, episode("Breaking Bad", "200", 1, 2)), new Date(T0.getTime() + minutes(20)));
    expect(await db.play.count({ where: { userId: viewer.id } })).toBe(2);
  });

  it("drops what it cannot map: no TMDB guid anywhere, a stranger, a play event, a special", async () => {
    const { viewer } = await instance();
    const secret = (await webhookSecret("plex"))!;
    stubHosts((url) =>
      url.pathname === "/library/metadata/555" ? json({ MediaContainer: { Metadata: [{ Guid: [{ id: "imdb://tt1" }] }] } }) : undefined,
    );
    const unmatched = film({ Metadata: { type: "movie", ratingKey: "555", title: "Home video", Guid: [{ id: "local://555" }] } });
    expect((await handlePlexWebhook(plexRequest(secret, unmatched))).body).toEqual({ outcome: "unmatched" });
    expect((await handlePlexWebhook(plexRequest(secret, film({ Account: { id: 1, title: "stranger" } })))).body).toEqual({
      ignored: "no matching account",
    });
    expect((await handlePlexWebhook(plexRequest(secret, film({ event: "media.play" })))).body).toEqual({ ignored: "not a scrobble" });
    const special = {
      event: "media.scrobble",
      Account: { id: 9001 },
      Metadata: { type: "episode", ratingKey: "9", grandparentRatingKey: "200", title: "Special", parentIndex: 0, index: 1 },
    };
    expect((await handlePlexWebhook(plexRequest(secret, special))).body).toEqual({ outcome: "skipped" });
    expect(await db.play.count({ where: { userId: viewer.id } })).toBe(0);
  });

  it("matches a Plex Home profile by its Plex name when the id is the server's own", async () => {
    await instance();
    const secret = (await webhookSecret("plex"))!;
    const sarah = await freshUser();
    await db.user.update({ where: { id: sarah.id }, data: { plexUsername: "Sarah", plexManaged: true } });
    stubHosts(() => undefined);
    const answer = await handlePlexWebhook(plexRequest(secret, film({ Account: { id: 3, title: "sarah" } })));
    expect(answer.userId).toBe(sarah.id);
    expect(await db.play.count({ where: { userId: sarah.id } })).toBe(1);
  });
});

describe("the Overseerr webhook", () => {
  const approved = {
    notification_type: "MEDIA_APPROVED",
    subject: "Dune (2021)",
    image: "https://image.tmdb.org/t/p/w600_and_h900_bestv2/dune.jpg",
    media: { media_type: "movie", tmdbId: "438631", status: "PROCESSING" },
    request: { requestedBy_email: "", requestedBy_username: "viewer" },
  };

  it("refuses a wrong secret with a 401 and touches no row", async () => {
    await instance();
    await webhookSecret("seerr");
    expect((await handleSeerrWebhook(seerrRequest("nope", approved))).status).toBe(401);
    expect((await handleSeerrWebhook(seerrRequest(null, approved))).status).toBe(401);
    expect(await db.availability.count()).toBe(0);
  });

  it("marks a title requested the moment it is approved, and available when it arrives", async () => {
    const { viewer } = await instance();
    const secret = (await webhookSecret("seerr"))!;
    const fan = await freshUser();
    await db.watchlistItem.create({ data: { userId: fan.id, mediaType: "movie", tmdbId: 438631, title: "Dune" } });

    const first = await handleSeerrWebhook(seerrRequest(`Bearer ${secret}`, approved), T0);
    expect(first.status).toBe(200);
    expect(await db.availability.findUnique({ where: { mediaType_tmdbId: { mediaType: "movie", tmdbId: 438631 } } })).toMatchObject({
      overseerrStatus: "requested",
      requestedById: viewer.id,
      title: "Dune",
      poster: "/dune.jpg",
      availableAt: null,
    });
    expect(first.notify).toBeUndefined();

    const later = new Date(T0.getTime() + hours(3));
    const arrived = await handleSeerrWebhook(seerrRequest(secret, { ...approved, notification_type: "MEDIA_AVAILABLE", request: null }), later);
    expect(arrived.notify?.sort()).toEqual([viewer.id, fan.id].sort());
    expect(arrived.title).toEqual({ mediaType: "movie", tmdbId: 438631, title: "Dune" });
    const row = await db.availability.findUnique({ where: { mediaType_tmdbId: { mediaType: "movie", tmdbId: 438631 } } });
    expect(row).toMatchObject({ overseerrStatus: "available", requestedById: viewer.id, availableAt: later });

    // A repeat for the same title is not a second headline.
    const again = await handleSeerrWebhook(seerrRequest(secret, { ...approved, notification_type: "MEDIA_AVAILABLE" }), new Date(later.getTime() + hours(1)));
    expect(again.notify).toBeUndefined();

    // The requester's bell and the watchlister's both say so.
    const mine = await deriveNotifications(viewer.id, new Date(later.getTime() + hours(1)));
    expect(mine.items.find((n) => n.kind === "arrived")).toMatchObject({ title: "Dune is on Plex", href: "/title/movie/438631" });
    const theirs = await deriveNotifications(fan.id, new Date(later.getTime() + hours(1)));
    expect(theirs.items.find((n) => n.kind === "arrived")?.body).toMatch(/watchlist/);
  });

  it("takes a declined request back, and answers a test and an issue without writing", async () => {
    await instance();
    const secret = (await webhookSecret("seerr"))!;
    await handleSeerrWebhook(seerrRequest(secret, approved));
    await handleSeerrWebhook(seerrRequest(secret, { ...approved, notification_type: "MEDIA_DECLINED" }));
    expect((await db.availability.findFirst())!.overseerrStatus).toBe("none");

    expect((await handleSeerrWebhook(seerrRequest(secret, { notification_type: "TEST_NOTIFICATION" }))).body).toEqual({ ok: true, test: true });
    expect((await handleSeerrWebhook(seerrRequest(secret, { notification_type: "ISSUE_CREATED", media: approved.media }))).body).toEqual({
      ignored: "ISSUE_CREATED",
    });
  });
});

describe("a request", () => {
  it("goes in as the asker's own Overseerr account, matched by Plex id", async () => {
    const { admin } = await instance();
    await db.user.update({ where: { id: admin.id }, data: { plexAccountId: "42" } });
    const calls = stubHosts((url, init) => {
      if (url.pathname === "/api/v1/user") return json({ results: [{ id: 1, plexId: 1, email: "x@y" }, { id: 7, plexId: 42, email: "admin@y" }] });
      if (url.pathname === "/api/v1/request" && init?.method === "POST") return json({ id: 99 });
      return undefined;
    });
    expect(await requestOnSeerr(admin.id, "tv", 1396, { title: "Breaking Bad", poster: "/bb.jpg" })).toEqual({ ok: true });
    const filed = calls.find((c) => c.url.pathname === "/api/v1/request")!;
    expect(JSON.parse(String(filed.init!.body))).toEqual({ mediaType: "tv", mediaId: 1396, seasons: "all", userId: 7 });
    expect((filed.init!.headers as Record<string, string>)["X-Api-Key"]).toBe("seerr-key");
    expect(await db.availability.findFirst()).toMatchObject({ overseerrStatus: "requested", requestedById: admin.id, title: "Breaking Bad" });
  });
});
