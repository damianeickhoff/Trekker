import "server-only";
import { pastDay, todayKey } from "./dates";
import { db } from "./db";
import { gate } from "./gates";
import { openSecret } from "./token-vault";
import { defaultTraktClientId } from "./trakt";

/**
 * What people on Trakt said about a film or an episode: the reactions TV Time
 * used to show under each episode, which a household instance cannot have
 * enough people to make for itself. Read from Trakt's public comment
 * endpoints, which need a client id and nothing else, and never written back.
 *
 * Trakt's routes take Trakt's own ids, not TMDB's, so a film or a show is
 * looked up once (`/search/tmdb`) and the answer kept for a month. Both answers
 * live in the TMDB cache table under `trakt:` keys, fresh for their lifetime
 * and served stale when Trakt cannot be reached, because an old thread beats
 * none. Everything fails soft: no client id, no such title, or Trakt down with
 * nothing cached, and the page simply goes without.
 */

const BASE = "https://api.trakt.tv";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TIMEOUT_MS = 10_000;

/** Which Trakt title a TMDB id is changes about never. */
const TITLE_LIFETIME = 30 * DAY;
/** A title Trakt does not know may be added; asked again daily rather than monthly. */
const MISSING_LIFETIME = DAY;
/** A new episode's or film's thread fills in its first evenings; an hour keeps up without asking on every visit. */
const THREAD_LIFETIME = HOUR;

/** How many to fetch, most liked first: the ones worth reading are at the top. */
export const TRAKT_TAKE = 20;

/**
 * The client id to ask with: the person's own, else the instance's
 * `TRAKT_CLIENT_ID`. Never somebody else's: a key someone linked for their
 * own import is theirs, and the answers are public, so the instance's key is
 * the one to set for a household.
 */
export async function traktClientFor(userId: string): Promise<string | null> {
  const row = await db.user.findUnique({ where: { id: userId }, select: { traktClientId: true } });
  return openSecret(row?.traktClientId)?.trim() || defaultTraktClientId();
}

// ---------------------------------------------------------------------------
// The wire

type HitIds = { ids?: { trakt?: number | null; slug?: string | null } };
type RawHit = { type?: string; show?: HitIds; movie?: HitIds };

export type RawComment = {
  id: number;
  comment: string;
  spoiler?: boolean;
  review?: boolean;
  created_at: string;
  likes?: number;
  replies?: number;
  user_stats?: { rating?: number | null } | null;
  user?: { username?: string | null; name?: string | null; ids?: { slug?: string | null } } | null;
};

type TitleRef = { trakt: number; slug: string } | { trakt: null };
type StoredThread = { total: number; comments: RawComment[] };

const inFlight = new Map<string, Promise<unknown>>();

async function traktGet(path: string, clientId: string): Promise<{ body: unknown; total: number | null }> {
  await gate.take("trakt");
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": clientId },
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Trakt answered ${res.status}`);
  const total = Number(res.headers.get("x-pagination-item-count"));
  return { body: await res.json(), total: Number.isFinite(total) && total >= 0 ? total : null };
}

/**
 * One answer through the cache: fresh from the table, else from Trakt and
 * stored for `lifetime(value)`, else whatever the table had, else null. Two
 * pages asking at once share one request.
 */
async function cached<T>(key: string, lifetime: (value: T) => number, load: () => Promise<T>): Promise<T | null> {
  const row = await db.tmdbCache.findUnique({ where: { key } });
  if (row && row.expiresAt.getTime() > Date.now()) return JSON.parse(row.body) as T;

  let pending = inFlight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
  }
  let value: T;
  try {
    value = await pending;
  } catch {
    return row ? (JSON.parse(row.body) as T) : null;
  }
  const now = new Date();
  const body = JSON.stringify(value);
  const expiresAt = new Date(now.getTime() + lifetime(value));
  await db.tmdbCache.upsert({ where: { key }, create: { key, body, fetchedAt: now, expiresAt }, update: { body, fetchedAt: now, expiresAt } });
  return value;
}

/** A TMDB id as Trakt knows it. The kind is part of the key: TMDB numbers films and shows separately. */
async function titleRef(kind: "show" | "movie", tmdbId: number, clientId: string): Promise<TitleRef | null> {
  return cached<TitleRef>(
    `trakt:${kind}:${tmdbId}`,
    (ref) => (ref.trakt ? TITLE_LIFETIME : MISSING_LIFETIME),
    async () => {
      const { body } = await traktGet(`/search/tmdb/${tmdbId}?type=${kind}`, clientId);
      const hit = (Array.isArray(body) ? (body as RawHit[]) : []).find((h) => h.type === kind && h[kind]?.ids?.trakt);
      const ids = hit?.[kind]?.ids;
      return ids?.trakt ? { trakt: ids.trakt, slug: ids.slug || String(ids.trakt) } : { trakt: null };
    },
  );
}

/** Only the fields the page reads are kept, so a cached thread is a few kilobytes, not Trakt's whole answer. */
function keep(c: RawComment): RawComment {
  return {
    id: c.id,
    comment: c.comment,
    spoiler: c.spoiler,
    review: c.review,
    created_at: c.created_at,
    likes: c.likes,
    replies: c.replies,
    user_stats: { rating: c.user_stats?.rating ?? null },
    user: { username: c.user?.username ?? null, name: c.user?.name ?? null, ids: { slug: c.user?.ids?.slug ?? null } },
  };
}

// ---------------------------------------------------------------------------
// What the page draws

export type TraktComment = {
  id: number;
  author: string;
  /** Their Trakt profile, where they have a public one. */
  authorUrl: string | null;
  /** "yesterday", "Friday", "12 Mar": worked out here, so server and browser agree. */
  when: string;
  body: string;
  /** Marked by its writer, or carrying Trakt's `[spoiler]` tags anywhere in it. */
  spoiler: boolean;
  likes: number;
  replies: number;
  /** Their rating of the episode on Trakt's 1 to 10, where they gave one. */
  rating: number | null;
  url: string;
};

export type TraktThread = {
  /** Every comment Trakt has on the episode, of which `comments` is the top. */
  total: number;
  comments: TraktComment[];
  /** The film or the episode on Trakt, for everything past the first `TRAKT_TAKE`. */
  url: string;
};

/**
 * A comment's words as the page shows them. Trakt marks a spoiler inside a
 * comment with `[spoiler]…[/spoiler]`; the page veils the whole comment when
 * there is one, so the tags themselves are only noise and are dropped.
 */
export function commentText(raw: string): { body: string; spoiler: boolean } {
  const spoiler = /\[spoiler\]/i.test(raw);
  const body = raw
    .replace(/\[\/?spoiler\]/gi, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { body, spoiler };
}

export function toTraktComment(c: RawComment, today: string): TraktComment {
  const text = commentText(c.comment ?? "");
  const slug = c.user?.ids?.slug ?? null;
  const rating = c.user_stats?.rating;
  return {
    id: c.id,
    author: c.user?.name?.trim() || c.user?.username?.trim() || "Someone on Trakt",
    authorUrl: slug ? `https://trakt.tv/users/${encodeURIComponent(slug)}` : null,
    when: pastDay(todayKey(new Date(c.created_at)), today),
    body: text.body,
    spoiler: c.spoiler === true || text.spoiler,
    likes: c.likes ?? 0,
    replies: c.replies ?? 0,
    rating: typeof rating === "number" && rating >= 1 && rating <= 10 ? rating : null,
    url: `https://trakt.tv/comments/${c.id}`,
  };
}

/** What a thread is about: a film, or one episode of a show. A show as a whole has none here. */
export type TraktTarget = { kind: "movie"; tmdbId: number } | { kind: "episode"; showId: number; season: number; episode: number };

/** Where on Trakt a target's thread is read from, and where its page is. */
function threadRoute(target: TraktTarget, ref: { trakt: number; slug: string }) {
  if (target.kind === "movie") {
    return { key: `trakt:comments:movie:${ref.trakt}`, path: `/movies/${ref.trakt}`, url: `https://trakt.tv/movies/${encodeURIComponent(ref.slug)}` };
  }
  const tail = `/seasons/${target.season}/episodes/${target.episode}`;
  return {
    key: `trakt:comments:show:${ref.trakt}:${target.season}:${target.episode}`,
    path: `/shows/${ref.trakt}${tail}`,
    url: `https://trakt.tv/shows/${encodeURIComponent(ref.slug)}${tail}`,
  };
}

/**
 * The top of a film's or an episode's thread on Trakt, most liked first, or
 * null when there is no way to ask or no answer to give. An empty thread is
 * not null: "nobody has said anything yet" is an answer.
 */
export async function traktThread(clientId: string, target: TraktTarget, today = todayKey()): Promise<TraktThread | null> {
  const ref =
    target.kind === "movie" ? await titleRef("movie", target.tmdbId, clientId) : await titleRef("show", target.showId, clientId);
  if (!ref?.trakt) return null;
  const route = threadRoute(target, ref);

  const thread = await cached<StoredThread>(
    route.key,
    () => THREAD_LIFETIME,
    async () => {
      const { body, total } = await traktGet(`${route.path}/comments/likes?limit=${TRAKT_TAKE}`, clientId);
      const comments = (Array.isArray(body) ? (body as RawComment[]) : []).filter((c) => typeof c?.id === "number").map(keep);
      return { total: total ?? comments.length, comments };
    },
  );
  if (!thread) return null;

  return {
    total: thread.total,
    comments: thread.comments.map((c) => toTraktComment(c, today)).filter((c) => c.body),
    url: route.url,
  };
}
