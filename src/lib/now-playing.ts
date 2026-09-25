import "server-only";
import { db } from "./db";
import { gate } from "./gates";
import { logPlexReport, viewerFor } from "./plex-scrobble";
import { serverConnection } from "./plex-server";
import { openSecret } from "./token-vault";
import { viewingChangedOutside } from "./viewing";

/**
 * Who in the house is watching something on the Plex server, for Home's
 * "Now watching in the house" and the screensaver's card. Read from the
 * server's `/status/sessions` with the admin's connection, the same one the
 * availability job uses; with no connection there is no card and nothing is
 * asked.
 *
 * The same read logs a viewing once it passes 90%, which is how plays log
 * themselves for anyone without the Plex Pass the webhook needs, as in the
 * current app. The webhook and this can both report one viewing; the
 * duplicate windows in `recordPlay` make that harmless.
 *
 * The poster is ours, never Plex's: a Plex image URL carries the server token,
 * which must not reach a browser. The session's rating key is matched to the
 * `Availability` row the daily job wrote for that title, and the poster comes
 * from the rows that already carry it.
 *
 * Kept fifteen seconds, so several screens polling every twenty ask the home
 * server once between them.
 */

export type Watching = {
  /** The Trekker account watching, when the Plex account is linked to one. */
  userId: string | null;
  who: string;
  player: string | null;
  title: string;
  /** "S01 E06" for an episode, null for a film. */
  code: string | null;
  /** 0 to 100. */
  progress: number;
  poster: string | null;
  /** The title's page here, when the daily job has matched the item to one. */
  href: string | null;
};

type Session = {
  type?: string;
  title?: string;
  grandparentTitle?: string;
  ratingKey?: string;
  grandparentRatingKey?: string;
  grandparentKey?: string;
  parentIndex?: number;
  index?: number;
  duration?: number;
  viewOffset?: number;
  User?: { id?: string | number; title?: string };
  Player?: { title?: string; state?: string };
};

type Connection = { url: string; token: string };

async function connection(): Promise<Connection | null> {
  const admin = await db.user.findFirst({ orderBy: { createdAt: "asc" }, select: { plexUrl: true, plexToken: true } });
  const token = openSecret(admin?.plexToken);
  return admin?.plexUrl && token ? { url: admin.plexUrl, token } : null;
}

export async function plexLinked(): Promise<boolean> {
  return (await connection()) !== null;
}

async function sessions(conn: Connection, fetcher: typeof fetch): Promise<Session[]> {
  try {
    const base = conn.url.trim().replace(/\/+$/, "");
    const target = new URL(`${/^https?:\/\//i.test(base) ? base : `http://${base}`}/status/sessions`);
    target.searchParams.set("X-Plex-Token", conn.token);
    await gate.take("plex");
    const res = await fetcher(target, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { MediaContainer?: { Metadata?: Session[] } };
    return data.MediaContainer?.Metadata ?? [];
  } catch {
    return [];
  }
}

const pad = (n: number | undefined) => String(n ?? 0).padStart(2, "0");

/**
 * The sessions as cards, films and episodes only. The watcher's name is the
 * Trekker account's where the Plex account is linked to one (by plex.tv id,
 * then by username), else Plex's own name for them.
 */
export async function describe(raw: Session[]): Promise<Watching[]> {
  const playing = raw.filter((s) => (s.type === "episode" || s.type === "movie") && s.duration);
  if (playing.length === 0) return [];

  const keys = playing.map((s) => (s.type === "episode" ? s.grandparentRatingKey : s.ratingKey)).filter((k): k is string => Boolean(k));
  const [people, titles] = await Promise.all([
    db.user.findMany({
      where: { OR: [{ plexAccountId: { not: null } }, { plexUsername: { not: null } }] },
      select: { id: true, name: true, plexAccountId: true, plexUsername: true },
    }),
    keys.length
      ? db.availability.findMany({ where: { plexRatingKey: { in: keys } }, select: { mediaType: true, tmdbId: true, plexRatingKey: true } })
      : [],
  ]);

  const posters = new Map<string, string>();
  const tv = titles.filter((t) => t.mediaType === "tv").map((t) => t.tmdbId);
  const films = titles.filter((t) => t.mediaType === "movie").map((t) => t.tmdbId);
  const [states, plays, saved] = await Promise.all([
    tv.length ? db.titleState.findMany({ where: { showId: { in: tv }, showPoster: { not: null } }, select: { showId: true, showPoster: true }, distinct: ["showId"] }) : [],
    films.length ? db.play.findMany({ where: { mediaType: "movie", tmdbId: { in: films }, poster: { not: null } }, select: { tmdbId: true, poster: true }, distinct: ["tmdbId"] }) : [],
    titles.length
      ? db.watchlistItem.findMany({
          where: { OR: titles.map((t) => ({ mediaType: t.mediaType, tmdbId: t.tmdbId })), poster: { not: null } },
          select: { mediaType: true, tmdbId: true, poster: true },
        })
      : [],
  ]);
  for (const r of saved) posters.set(`${r.mediaType}-${r.tmdbId}`, r.poster!);
  for (const r of plays) posters.set(`movie-${r.tmdbId}`, r.poster!);
  for (const r of states) posters.set(`tv-${r.showId}`, r.showPoster!);
  const byKey = new Map(titles.map((t) => [t.plexRatingKey!, `${t.mediaType}-${t.tmdbId}`]));

  return playing.map((s) => {
    const plexId = s.User?.id !== undefined ? String(s.User.id) : null;
    const plexName = s.User?.title ?? null;
    const person =
      people.find((p) => plexId && p.plexAccountId === plexId) ??
      people.find((p) => plexName && p.plexUsername?.toLowerCase() === plexName.toLowerCase());
    const episode = s.type === "episode";
    const key = episode ? s.grandparentRatingKey : s.ratingKey;
    const title = byKey.get(key ?? "");
    return {
      userId: person?.id ?? null,
      who: person?.name ?? plexName ?? "Someone",
      player: s.Player?.title ?? null,
      title: (episode ? s.grandparentTitle : s.title) ?? s.title ?? "Something",
      code: episode ? `S${pad(s.parentIndex)} E${pad(s.index)}` : null,
      progress: Math.min(100, Math.round(((s.viewOffset ?? 0) / s.duration!) * 100)),
      poster: title ? (posters.get(title) ?? null) : null,
      href: title ? `/title/${title.replace("-", "/")}` : null,
    };
  });
}

const KEEP_MS = 15_000;
const g = globalThis as unknown as {
  trekkerNowPlaying?: { at: number; value: Watching[] | null };
  trekkerNowLogged?: Map<string, number>;
};

/** A session past this share of its length counts as watched, as Plex's own scrobble does. */
const WATCHED_SHARE = 0.9;
/** How long a session logged here is remembered, so a paused film at 95% is not asked about every poll. */
const REMEMBER_MS = 6 * 60 * 60 * 1000;

/**
 * Logs what has passed 90%, once per viewer and item. Behind the answer:
 * the poll never waits on TMDB or the database for it.
 */
function logFinished(raw: Session[]) {
  const logged = (g.trekkerNowLogged ??= new Map<string, number>());
  const now = Date.now();
  for (const [key, at] of logged) if (now - at > REMEMBER_MS) logged.delete(key);

  for (const s of raw) {
    if ((s.type !== "episode" && s.type !== "movie") || !s.duration || !s.ratingKey) continue;
    if ((s.viewOffset ?? 0) / s.duration < WATCHED_SHARE) continue;
    const key = `${s.User?.id ?? s.User?.title ?? "?"}:${s.ratingKey}`;
    if (logged.has(key)) continue;
    logged.set(key, now);
    void (async () => {
      const userId = await viewerFor(s.User);
      if (!userId) return;
      const { outcome } = await logPlexReport(
        userId,
        {
          type: s.type === "episode" ? "episode" : "movie",
          ratingKey: s.ratingKey ?? null,
          grandparentRatingKey: s.grandparentRatingKey ?? null,
          title: s.title ?? "Untitled",
          showTitle: s.grandparentTitle ?? null,
          seasonNumber: s.parentIndex ?? null,
          episodeNumber: s.index ?? null,
          watchedAt: new Date(),
        },
        await serverConnection(),
      );
      if (outcome === "logged") viewingChangedOutside(userId);
    })().catch((error) => console.error("now-playing could not log a finished session", error));
  }
}

/** Everyone watching now; null when Plex is not linked, so the card knows to stay away. */
export async function nowPlaying(fetcher: typeof fetch = fetch): Promise<Watching[] | null> {
  const kept = g.trekkerNowPlaying;
  if (kept && Date.now() - kept.at < KEEP_MS) return kept.value;
  const conn = await connection();
  const raw = conn ? await sessions(conn, fetcher) : [];
  const value = conn ? await describe(raw) : null;
  if (conn) logFinished(raw);
  g.trekkerNowPlaying = { at: Date.now(), value };
  return value;
}
