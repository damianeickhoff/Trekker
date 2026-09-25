import "server-only";
import { avatarUrl } from "./avatar";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { episodeCode } from "./marks";
import { bucketName } from "./popcorn";
import { movieDetailsKey, seasonKey, tmdbPeek, tvDetailsKey, type Season } from "./tmdb";

/**
 * Friends, and who may see what.
 *
 * Profiles are private until both sides agree: one row per pair in
 * `Friendship`, owned by whoever asked, and only an accepted row makes two
 * people friends. Anyone else on the instance sees a name and an Add friend
 * button; there is no "everyone here" view of anybody's history. Comments and
 * feelings on a title page are the deliberate exception, and say so there.
 */

export type Relation =
  | { kind: "self" }
  | { kind: "friends"; id: string; since: Date }
  /** I asked; they have not answered. */
  | { kind: "requested"; id: string }
  /** They asked me. */
  | { kind: "asked"; id: string }
  | { kind: "none" };

export async function relationBetween(viewerId: string, otherId: string): Promise<Relation> {
  if (viewerId === otherId) return { kind: "self" };
  const row = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
    select: { id: true, status: true, requesterId: true, createdAt: true, respondedAt: true },
  });
  if (!row) return { kind: "none" };
  if (row.status === "accepted") return { kind: "friends", id: row.id, since: row.respondedAt ?? row.createdAt };
  return row.requesterId === viewerId ? { kind: "requested", id: row.id } : { kind: "asked", id: row.id };
}

/** Stats, activity and the cabinet: yourself, and friends. Everyone else gets a name. */
export function canSeeProfile(relation: Relation) {
  return relation.kind === "self" || relation.kind === "friends";
}

export type Person = { id: string; name: string; avatar: string | null };

const personOf = (u: { id: string; name: string; avatarSetAt: Date | null }): Person => ({
  id: u.id,
  name: u.name,
  avatar: avatarUrl(u),
});

const PERSON = { id: true, name: true, avatarSetAt: true } as const;

/** Titles two people have both seen: films watched, shows begun. Two INTERSECTs over the unique indexes. */
export async function sharedTitleCount(a: string, b: string): Promise<number> {
  const [row] = await db.$queryRaw<{ n: bigint | number }[]>`
    SELECT
      (SELECT COUNT(*) FROM (
        SELECT "movieId" FROM "WatchedMovie" WHERE "userId" = ${a}
        INTERSECT SELECT "movieId" FROM "WatchedMovie" WHERE "userId" = ${b}))
      +
      (SELECT COUNT(*) FROM (
        SELECT "showId" FROM "WatchedEpisode" WHERE "userId" = ${a}
        INTERSECT SELECT "showId" FROM "WatchedEpisode" WHERE "userId" = ${b}))
      AS n`;
  return Number(row?.n ?? 0);
}

export type FriendRow = Person & { since: string; shared: number };
export type RequestRow = Person & { requestId: string; at: string };

export type FriendsPage = {
  incoming: RequestRow[];
  outgoing: RequestRow[];
  friends: FriendRow[];
  /** Everyone else on the instance, to add. */
  others: Person[];
};

export async function friendsPage(userId: string): Promise<FriendsPage> {
  const [rows, everyone] = await Promise.all([
    db.friendship.findMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: {
        id: true,
        status: true,
        createdAt: true,
        respondedAt: true,
        requesterId: true,
        requester: { select: PERSON },
        addressee: { select: PERSON },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.user.findMany({ where: { id: { not: userId } }, select: PERSON, orderBy: { name: "asc" } }),
  ]);

  const incoming: RequestRow[] = [];
  const outgoing: RequestRow[] = [];
  const friends: FriendRow[] = [];
  const known = new Set<string>();
  for (const row of rows) {
    const mine = row.requesterId === userId;
    const other = mine ? row.addressee : row.requester;
    known.add(other.id);
    if (row.status === "accepted") {
      friends.push({
        ...personOf(other),
        since: (row.respondedAt ?? row.createdAt).toISOString(),
        shared: await sharedTitleCount(userId, other.id),
      });
    } else {
      (mine ? outgoing : incoming).push({ ...personOf(other), requestId: row.id, at: row.createdAt.toISOString() });
    }
  }
  friends.sort((a, b) => a.name.localeCompare(b.name));
  return { incoming, outgoing, friends, others: everyone.filter((u) => !known.has(u.id)).map(personOf) };
}

/** Friends as people, for the profile's row and the counts. */
export async function friendsOf(userId: string): Promise<Person[]> {
  const rows = await db.friendship.findMany({
    where: { status: "accepted", OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, requester: { select: PERSON }, addressee: { select: PERSON } },
  });
  return rows
    .map((r) => personOf(r.requesterId === userId ? r.addressee : r.requester))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ActivityRow = {
  key: string;
  who: string;
  what: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  at: string;
};

/**
 * What friends have been doing this week: viewings (one line per person per
 * title, their latest), ratings and watchlist additions, newest first. Only
 * ever asked for accepted friends, so it can never show a stranger's history.
 */
export async function friendActivity(userId: string, days = 7, take = 8, now = new Date()): Promise<ActivityRow[]> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const friends = await friendsOf(userId);
  if (friends.length === 0) return [];
  const ids = friends.map((f) => f.id);
  const names = new Map(friends.map((f) => [f.id, f.name]));
  const [plays, ratings, saved] = await Promise.all([
    db.play.findMany({
      where: { userId: { in: ids }, watchedAt: { gte: since } },
      orderBy: { watchedAt: "desc" },
      take: 200,
      select: { userId: true, mediaType: true, tmdbId: true, title: true, poster: true, seasonNumber: true, episodeNumber: true, watchedAt: true },
    }),
    db.rating.findMany({
      where: { userId: { in: ids }, updatedAt: { gte: since } },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: { userId: true, mediaType: true, tmdbId: true, title: true, poster: true, score: true, updatedAt: true },
    }),
    db.watchlistItem.findMany({
      where: { userId: { in: ids }, addedAt: { gte: since } },
      orderBy: { addedAt: "desc" },
      take: 20,
      select: { userId: true, mediaType: true, tmdbId: true, title: true, poster: true, addedAt: true },
    }),
  ]);

  const out: ActivityRow[] = [];
  const seen = new Set<string>();
  const media = (t: string) => (t === "tv" ? ("tv" as const) : ("movie" as const));
  for (const p of plays) {
    const k = `play:${p.userId}:${p.mediaType}:${p.tmdbId}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      key: k,
      who: names.get(p.userId) ?? "",
      what: p.mediaType === "tv" ? `watched ${episodeCode(p.seasonNumber, p.episodeNumber)}` : "watched it",
      mediaType: media(p.mediaType),
      tmdbId: p.tmdbId,
      title: p.title,
      poster: p.poster,
      at: p.watchedAt.toISOString(),
    });
  }
  for (const r of ratings) {
    out.push({
      key: `rating:${r.userId}:${r.mediaType}:${r.tmdbId}`,
      who: names.get(r.userId) ?? "",
      what: `rated it ${bucketName(r.score)}`,
      mediaType: media(r.mediaType),
      tmdbId: r.tmdbId,
      title: r.title,
      poster: r.poster,
      at: r.updatedAt.toISOString(),
    });
  }
  for (const w of saved) {
    out.push({
      key: `saved:${w.userId}:${w.mediaType}:${w.tmdbId}`,
      who: names.get(w.userId) ?? "",
      what: "added to watchlist",
      mediaType: media(w.mediaType),
      tmdbId: w.tmdbId,
      title: w.title,
      poster: w.poster,
      at: w.addedAt.toISOString(),
    });
  }
  return out.sort((a, b) => b.at.localeCompare(a.at)).slice(0, take);
}

// ---------------------------------------------------------------------------
// Writes, called by `friend-actions.ts` once the viewer is known.

export type FriendOutcome = { ok: true; message: string; notify?: string } | { ok: false; error: string };

/**
 * Asks someone to be friends. Asking someone who has already asked you is an
 * acceptance: two people who both pressed the button agree. `notify` is who
 * should hear about it, for the push.
 */
export async function requestFriend(userId: string, targetId: string): Promise<FriendOutcome> {
  if (targetId === userId) return { ok: false, error: "That is you" };
  const target = await db.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) return { ok: false, error: "That profile no longer exists" };
  const relation = await relationBetween(userId, targetId);
  if (relation.kind === "friends") return { ok: true, message: "Already friends" };
  if (relation.kind === "requested") return { ok: true, message: "Request already sent" };
  if (relation.kind === "asked") {
    await db.friendship.update({ where: { id: relation.id }, data: { status: "accepted", respondedAt: new Date() } });
    return { ok: true, message: "You are now friends" };
  }
  await db.friendship.create({ data: { requesterId: userId, addresseeId: targetId } });
  return { ok: true, message: "Request sent", notify: targetId };
}

/** Only the person asked can accept. */
export async function acceptFriend(userId: string, requestId: string): Promise<FriendOutcome> {
  const row = await db.friendship.findUnique({ where: { id: requestId } });
  if (!row || row.addresseeId !== userId || row.status !== "pending") return { ok: false, error: "That request has gone" };
  await db.friendship.update({ where: { id: requestId }, data: { status: "accepted", respondedAt: new Date() } });
  return { ok: true, message: "You are now friends" };
}

/** Declining and cancelling are one act from either end of a pending request. */
export async function withdrawRequest(userId: string, requestId: string): Promise<FriendOutcome> {
  const row = await db.friendship.findUnique({ where: { id: requestId } });
  if (!row || row.status !== "pending" || (row.addresseeId !== userId && row.requesterId !== userId)) {
    return { ok: false, error: "That request has gone" };
  }
  await db.friendship.delete({ where: { id: requestId } });
  return { ok: true, message: "Request removed" };
}

export async function unfriend(userId: string, otherId: string): Promise<FriendOutcome> {
  await db.friendship.deleteMany({
    where: {
      status: "accepted",
      OR: [
        { requesterId: userId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: userId },
      ],
    },
  });
  return { ok: true, message: "Friend removed" };
}

export type FriendViewing = {
  key: string;
  friend: Person;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
  /** The episode's still, or the title's backdrop, from the cache; null when neither is there. */
  image: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  episodeName: string | null;
  at: string;
  /** An earlier viewing of the same film or episode by the same friend. */
  again: boolean;
};

/**
 * Home's Friends watched, as the old app's rail had it: friends' latest
 * viewings, every play rather than one per title (a night of three episodes
 * is three cards, each with its own still), with no window, so a quiet week
 * still shows what they watched last. Artwork is the episode's still, else the
 * title's backdrop, both from the cache and never the network.
 */
export async function friendViewings(userId: string, take = 12): Promise<FriendViewing[]> {
  const friends = await friendsOf(userId);
  if (friends.length === 0) return [];
  const byId = new Map(friends.map((f) => [f.id, f]));
  const plays = await db.play.findMany({
    where: { userId: { in: friends.map((f) => f.id) } },
    orderBy: { watchedAt: "desc" },
    take,
    select: {
      id: true,
      userId: true,
      mediaType: true,
      tmdbId: true,
      title: true,
      poster: true,
      seasonNumber: true,
      episodeNumber: true,
      episodeName: true,
      watchedAt: true,
    },
  });
  if (plays.length === 0) return [];

  // "Again" means an earlier viewing of the same film or episode, so the first
  // of them never is one: measured against the first viewing, not a count.
  const firsts = await db.play.groupBy({
    by: ["userId", "mediaType", "tmdbId", "seasonNumber", "episodeNumber"],
    where: { userId: { in: [...new Set(plays.map((p) => p.userId))] }, tmdbId: { in: [...new Set(plays.map((p) => p.tmdbId))] } },
    _min: { watchedAt: true },
  });
  const viewingKey = (p: { userId: string; mediaType: string; tmdbId: number; seasonNumber: number | null; episodeNumber: number | null }) =>
    `${p.userId}:${p.mediaType}:${p.tmdbId}:${p.seasonNumber ?? ""}:${p.episodeNumber ?? ""}`;
  const first = new Map(firsts.map((f) => [viewingKey(f), f._min.watchedAt]));

  const images = await mapLimit(plays, 6, (p) => viewingImage(p.mediaType, p.tmdbId, p.seasonNumber, p.episodeNumber));
  return plays.map((p, i) => {
    const earliest = first.get(viewingKey(p));
    return {
      key: p.id,
      friend: byId.get(p.userId) ?? { id: p.userId, name: "", avatar: null },
      mediaType: p.mediaType === "tv" ? "tv" : "movie",
      tmdbId: p.tmdbId,
      title: p.title,
      poster: p.poster,
      image: images[i],
      seasonNumber: p.seasonNumber,
      episodeNumber: p.episodeNumber,
      episodeName: p.episodeName,
      at: p.watchedAt.toISOString(),
      again: earliest != null && p.watchedAt.getTime() > earliest.getTime(),
    };
  });
}

async function viewingImage(mediaType: string, tmdbId: number, season: number | null, episode: number | null) {
  if (mediaType === "tv" && season !== null && episode !== null) {
    const key = seasonKey(tmdbId, season);
    const cached = await tmdbPeek<Season>(key.path, key.params).catch(() => null);
    const still = cached?.episodes.find((e) => e.episode_number === episode)?.still_path;
    if (still) return still;
  }
  const key = mediaType === "tv" ? tvDetailsKey(tmdbId) : movieDetailsKey(tmdbId);
  const details = await tmdbPeek<{ backdrop_path: string | null }>(key.path, key.params).catch(() => null);
  return details?.backdrop_path ?? null;
}
