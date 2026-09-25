import "server-only";
import { db } from "./db";
import type { NewsRow } from "./news";
import { visibleFeeds } from "./news-settings";
import { pressNews, type PressRow, type PressTag } from "./press";
import type { Chip } from "./news-chips";
import { personName } from "./news-words";
import { cacheKey, movieDetailsKey, tvDetailsKey } from "./tmdb";

/*
 * The News page as a news app (Round 10): which rows each chip shows, the
 * lead story, the round buttons of Your channels and the New trailers rail.
 * The rules are pure, over rows already read, so the page makes one read of
 * each kind and the tests can hold the rules still. What the page draws is
 * denormalised on the rows or read from the TMDB cache's rows, never TMDB.
 */

export { CHIPS, chipFrom, chipLabel, type Chip } from "./news-chips";

/**
 * The chip the page opens on without one in the address (Settings › News,
 * Open on): Top when asked for; otherwise For you, unless For you is empty and
 * Top is not, as Round 9 did. "Last used" draws For you and lets the browser
 * move to the remembered chip (`news/chip-memory.tsx`), since only it knows.
 */
export function openingChip(named: Chip | null, openOn: "for-you" | "top" | "last", yours: number, press: number): Chip {
  if (named) return named;
  if (openOn === "top") return "top";
  return yours === 0 && press > 0 ? "top" : "for-you";
}

/** Which of someone's own news (For you) each chip also shows. */
const YOURS: Partial<Record<Chip, (r: Pick<NewsRow, "subject" | "kind">) => boolean>> = {
  trailers: (r) => r.kind === "trailer",
  renewals: (r) => r.subject === "tv" && ["renewed", "cancelled", "ended", "new-season"].includes(r.kind),
  casting: (r) => r.subject === "person" && r.kind === "announced",
  dates: (r) => (r.subject === "tv" && (r.kind === "next-date" || r.kind === "date-moved")) || (r.subject === "movie" && r.kind === "release-date"),
};

/** Which headlines each chip shows, by what `classifyHeadline` made of them. */
const PRESS: Partial<Record<Chip, PressTag[]>> = {
  trailers: ["trailer"],
  renewals: ["renewed", "cancelled"],
  casting: ["casting"],
  dates: ["dated", "moved"],
  "box-office": ["box-office"],
  reviews: ["reviews"],
};

export type Entry = { type: "yours"; row: NewsRow } | { type: "press"; row: PressRow };

/** The headlines a chip shows. For you shows none: it is about what you follow. Top shows all of them. */
export function pressFor(chip: Chip, press: PressRow[]): PressRow[] {
  if (chip === "for-you") return [];
  if (chip === "top") return press;
  const tags = PRESS[chip] ?? [];
  return press.filter((p) => p.tag !== null && tags.includes(p.tag));
}

/** Everything under a chip, newest first: your own news of its kinds and the headlines classified so. */
export function entriesFor(chip: Chip, yours: NewsRow[], press: PressRow[]): Entry[] {
  const mine: Entry[] = chip === "for-you" ? yours.map((row) => ({ type: "yours", row })) : yours.filter((r) => YOURS[chip]?.(r)).map((row) => ({ type: "yours", row }));
  const theirs: Entry[] = pressFor(chip, press).map((row) => ({ type: "press", row }));
  return [...mine, ...theirs].sort((a, b) => b.row.at.localeCompare(a.row.at));
}

/**
 * The lead story: the newest headline with a picture that names a title the
 * cache knows, else the newest with a picture. Nothing without a picture
 * leads, since the lead is a picture with words on it.
 */
export function chooseLead(press: PressRow[]): PressRow | null {
  return press.find((p) => p.imageUrl && p.match) ?? press.find((p) => p.imageUrl) ?? null;
}

/** The lead carousel's slides (fourth review): three. */
export const LEAD_COUNT = 3;

/**
 * The lead carousel's stories: by the lead's rule, newest first those with a
 * picture that name a title, then the newest with a picture, three at most.
 */
export function chooseLeads(press: PressRow[], count = LEAD_COUNT): PressRow[] {
  const named = press.filter((p) => p.imageUrl && p.match);
  const pictured = press.filter((p) => p.imageUrl && !p.match);
  return [...named, ...pictured].slice(0, count);
}

/** The feed's big cards: one pair, at the top (fourth review, as corrected by the owner). */
export const BIG_CARDS = 2;

/**
 * The feed in the order it is drawn, each entry marked big or small. Exactly
 * one pair of big cards, first: the first two headlines with a picture, in
 * their own order, lifted to the top so they stand side by side on the
 * desktop's two columns (stacked on a phone's one); everything else small, in
 * the order it came, through every Show more. Your own news is never big.
 */
export function arrangeFeed(entries: Entry[]): { entry: Entry; big: boolean }[] {
  const big = new Set<Entry>();
  for (const e of entries) {
    if (big.size === BIG_CARDS) break;
    if (e.type === "press" && e.row.imageUrl) big.add(e);
  }
  return [...[...big].map((entry) => ({ entry, big: true })), ...entries.filter((e) => !big.has(e)).map((entry) => ({ entry, big: false }))];
}

// ---------------------------------------------------------------------------
// Subjects: Your channels, and `?subject=`

export type Subject = { kind: "tv" | "movie" | "person"; id: number };

export function subjectFrom(value: unknown): Subject | null {
  const m = typeof value === "string" ? /^(tv|movie|person):(\d{1,9})$/.exec(value) : null;
  return m ? { kind: m[1] as Subject["kind"], id: Number(m[2]) } : null;
}

export const subjectKey = (s: Subject) => `${s.kind}:${s.id}`;

/** Whether an entry is about a subject: your news of it, or a headline naming the title. People are never matched in headlines. */
export function isAbout(entry: Entry, s: Subject): boolean {
  if (entry.type === "yours") return entry.row.subject === s.kind && entry.row.subjectId === s.id;
  return s.kind !== "person" && entry.row.match?.mediaType === s.kind && entry.row.match.tmdbId === s.id;
}

export type Channel = {
  subject: Subject;
  /** The person's name, or the title's. */
  name: string;
  /** A TMDB path: the headshot, or the poster. */
  image: string | null;
  unread: number;
  /** ISO, the newest row's. */
  at: string;
};

export const CHANNEL_DAYS = 30;
export const CHANNEL_CAP = 12;


/**
 * Your channels: each followed person, show or saved film with news in the
 * last thirty days, newest first, twelve at most, with how much of it is
 * unread. From someone's own rows alone (`newsFor`), so only what they follow.
 */
export function channelsFrom(yours: NewsRow[], now = new Date(), { days = CHANNEL_DAYS, cap = CHANNEL_CAP } = {}): Channel[] {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const byKey = new Map<string, Channel>();
  for (const row of yours) {
    if (row.at < since) continue;
    const key = `${row.subject}:${row.subjectId}`;
    const found = byKey.get(key);
    if (found) {
      if (!row.read) found.unread += 1;
      if (row.at > found.at) found.at = row.at;
      continue;
    }
    byKey.set(key, {
      subject: { kind: row.subject, id: row.subjectId },
      name: row.subject === "person" ? personName(row) : row.title,
      image: row.image,
      unread: row.read ? 0 : 1,
      at: row.at,
    });
  }
  return [...byKey.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, cap);
}

/** Under a round button: a person's first name; a title up to its colon ("Monster" for "Monster: The Lizzie Borden Story"). */
export function channelLabel(ch: Pick<Channel, "subject" | "name">) {
  return ch.subject.kind === "person" ? (ch.name.split(/\s+/)[0] ?? ch.name) : (ch.name.split(":")[0]?.trim() || ch.name);
}

export { kindLabel, personName, tagLabel, yourByline, yourHeadline } from "./news-words";

// ---------------------------------------------------------------------------
// The cache's pictures and years, for cards

export type TitleArt = { backdrop: string | null; poster: string | null; year: string | null };

export const artKey = (mediaType: "movie" | "tv", tmdbId: number) => `${mediaType}:${tmdbId}`;

/**
 * Backdrops, posters and years for the titles some news names, from the TMDB
 * cache's details rows, read with `json_extract` in one query so the large
 * bodies are never parsed here. A title nobody has opened has no row, and its
 * card falls back to the poster the news row carries.
 */
export async function titleArt(titles: { mediaType: "movie" | "tv"; tmdbId: number }[]): Promise<Map<string, TitleArt>> {
  const keys = new Map<string, string>();
  for (const t of titles) {
    const k = t.mediaType === "tv" ? tvDetailsKey(t.tmdbId) : movieDetailsKey(t.tmdbId);
    keys.set(cacheKey(k.path, k.params), artKey(t.mediaType, t.tmdbId));
  }
  const out = new Map<string, TitleArt>();
  if (keys.size === 0) return out;
  const list = [...keys.keys()];
  const rows = await db
    .$queryRawUnsafe<{ key: string; backdrop: string | null; poster: string | null; date: string | null }[]>(
      `SELECT "key",
        json_extract("body", '$.backdrop_path') AS "backdrop",
        json_extract("body", '$.poster_path') AS "poster",
        COALESCE(json_extract("body", '$.first_air_date'), json_extract("body", '$.release_date')) AS "date"
      FROM "TmdbCache" WHERE "key" IN (${list.map(() => "?").join(", ")}) AND json_valid("body")`,
      ...list,
    )
    .catch(() => []);
  for (const r of rows) {
    const key = keys.get(r.key);
    if (key) out.set(key, { backdrop: r.backdrop ?? null, poster: r.poster ?? null, year: r.date ? r.date.slice(0, 4) || null : null });
  }
  return out;
}

/**
 * How someone stands with the titles headlines name: "watching" for a show in
 * progress they have not stopped, "saved" for anything on their watchlist.
 * The lead's and the big cards' "Lanterns · you're watching".
 */
export async function relationsFor(userId: string, titles: { mediaType: "movie" | "tv"; tmdbId: number }[]): Promise<Map<string, "watching" | "saved">> {
  const out = new Map<string, "watching" | "saved">();
  if (titles.length === 0) return out;
  const shows = [...new Set(titles.filter((t) => t.mediaType === "tv").map((t) => t.tmdbId))];
  const ids = [...new Set(titles.map((t) => t.tmdbId))];
  const [states, dropped, saved] = await Promise.all([
    shows.length ? db.titleState.findMany({ where: { userId, showId: { in: shows } }, select: { showId: true } }) : [],
    shows.length ? db.droppedShow.findMany({ where: { userId, showId: { in: shows } }, select: { showId: true } }) : [],
    db.watchlistItem.findMany({ where: { userId, tmdbId: { in: ids } }, select: { mediaType: true, tmdbId: true } }),
  ]);
  for (const s of saved) if (s.mediaType === "tv" || s.mediaType === "movie") out.set(artKey(s.mediaType, s.tmdbId), "saved");
  const stopped = new Set(dropped.map((d) => d.showId));
  for (const s of states) if (!stopped.has(s.showId)) out.set(artKey("tv", s.showId), "watching");
  return out;
}

// ---------------------------------------------------------------------------
// New trailers

export const TRAILER_DAYS = 14;

export type TrailerCard = {
  id: string;
  title: string;
  /** "Series · 2026", "Film · 2026", or a headline's source. */
  line: string;
  /** Where the card goes: the trailer on YouTube, as a title page opens it, or the article. */
  href: string;
  backdrop: string | null;
  poster: string | null;
  imageUrl: string | null;
  /** A headline's site, written small on the surface when there is no picture. */
  source: string | null;
};

/**
 * The New trailers rail: your titles' new trailers from the last fourteen
 * days first, newest first, then headlines classified Trailer from the same
 * fortnight. The length is not stored with a trailer, so the line is the kind
 * and the year.
 */
export function trailersFrom(yours: NewsRow[], press: PressRow[], art: Map<string, TitleArt>, now = new Date()): TrailerCard[] {
  const since = new Date(now.getTime() - TRAILER_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const out: TrailerCard[] = [];
  for (const row of yours) {
    if (row.kind !== "trailer" || row.at < since) continue;
    const video = row.video;
    if (!video) continue;
    const a = art.get(artKey(row.mediaType, row.tmdbId));
    const kind = row.mediaType === "tv" ? "Series" : "Film";
    out.push({
      id: row.id,
      title: row.title,
      line: a?.year ? `${kind} · ${a.year}` : kind,
      href: `https://www.youtube.com/watch?v=${video}`,
      backdrop: a?.backdrop ?? null,
      poster: a?.poster ?? row.image,
      imageUrl: null,
      source: null,
    });
  }
  for (const p of press) {
    if (p.tag !== "trailer" || p.at < since) continue;
    const a = p.match ? art.get(artKey(p.match.mediaType, p.match.tmdbId)) : undefined;
    const kind = p.match ? (p.match.mediaType === "tv" ? "Series" : "Film") : null;
    out.push({
      id: p.id,
      title: p.match?.title ?? p.headline,
      line: kind ? (a?.year ? `${kind} · ${a.year}` : kind) : p.source,
      href: p.link,
      backdrop: p.imageUrl ? null : (a?.backdrop ?? null),
      poster: p.imageUrl ? null : (a?.poster ?? p.match?.poster ?? null),
      imageUrl: p.imageUrl,
      source: p.source,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The headlines one person reads

/**
 * The most headlines the page reads at once. The instance's feeds alone keep
 * up to 40 each; a cap under what they hold together would fill with their
 * newest and leave someone's own feed, whose items are often older, off the
 * page altogether (second review: an own feed's 18 rows never showed).
 */
export const PAGE_PRESS_CAP = 400;

/** Every headline this person reads within their reading window, newest first. */
export async function pressForReader(userId: string, keepDays: number, now = new Date()): Promise<PressRow[]> {
  const feeds = await visibleFeeds(userId);
  return pressNews({ take: PAGE_PRESS_CAP, feeds, since: new Date(now.getTime() - keepDays * 24 * 60 * 60 * 1000) });
}
