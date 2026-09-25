import "server-only";
import { db } from "./db";
import { episodeCode } from "./marks";
import type { MovieDetails, TvDetails } from "./tmdb";

/**
 * News about what someone follows (T2): what changed in the answers the
 * refresh job already fetches, noticed at the moment it writes the newer one
 * over the older, so there is no second pass and no feed of its own.
 *
 * The comparisons are pure (`showNews`, `filmNews`) and say what each change
 * is and the one key it gets, so a change is news once however many passes
 * see it, and a status that flaps back and forth is not news twice. `record`
 * writes them; `newsFor` works out whose they are on reading, like the bell:
 * a followed person's since the follow, a title's for anyone who has it in
 * progress or saved. Read state is the bell's (`news:<id>` in
 * `NotificationRead`), so the News page, Home's rail, the sidebar's count and
 * the bell never disagree.
 *
 * Popular news, headlines from outside feeds, shares the table as the "press"
 * subject but none of this: it is `lib/press.ts`, everyone's, and never
 * counted, pushed or put in the bell. `newsFor` never reads it.
 */

export type NewsSubject = "person" | "tv" | "movie";

export type NewsDraft = {
  subject: NewsSubject;
  subjectId: number;
  kind: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  image: string | null;
  headline: string;
  detail: string;
  key: string;
  /** When it counts as noticed; now unless said. A followed person's seeded news takes the follow's. */
  at?: Date;
};

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "14 Nov", or "14 Nov 2027" outside this year: a date in a headline. */
export function newsDate(date: string, today: string): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const words = `${d} ${SHORT_MONTHS[m - 1]}`;
  return String(y) === today.slice(0, 4) ? words : `${words} ${y}`;
}

/** TMDB's status words that are news when a show changes into them. */
function statusKind(before: string | undefined, after: string | undefined): "renewed" | "cancelled" | "ended" | null {
  if (!after || before === after) return null;
  if (after === "Canceled" || after === "Cancelled") return "cancelled";
  if (after === "Ended") return "ended";
  // Back from over: renewed. Planned or in production becoming returning is a premiere, which the next date says.
  if (after === "Returning Series" && (before === "Ended" || before === "Canceled" || before === "Cancelled")) return "renewed";
  return null;
}

/** The official YouTube trailers, by key: what a new trailer is new against. */
export function trailerKeys(details: Pick<TvDetails, "videos"> | Pick<MovieDetails, "videos"> | null): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of details?.videos?.results ?? []) {
    if (v.site === "YouTube" && v.type === "Trailer") out.set(v.key, v.name);
  }
  return out;
}

function newTrailers(
  subject: "tv" | "movie",
  id: number,
  title: string,
  image: string | null,
  before: Map<string, string>,
  after: Map<string, string>,
): NewsDraft[] {
  const out: NewsDraft[] = [];
  for (const [key, name] of after) {
    if (before.has(key)) continue;
    out.push({
      subject,
      subjectId: id,
      kind: "trailer",
      mediaType: subject,
      tmdbId: id,
      title,
      image,
      headline: `New trailer for ${title}`,
      detail: name || "Watch it on the title's page",
      key: `${subject}:${id}:trailer:${key}`,
    });
  }
  return out;
}

/**
 * What changed about a show between the answer the job held and the one it
 * has just fetched. Nothing without an earlier answer: the first fetch only
 * draws the line, as a followed person's first look does.
 */
export function showNews(before: TvDetails | null, after: TvDetails, today: string): NewsDraft[] {
  if (!before) return [];
  const id = after.id;
  const title = after.name;
  const image = after.poster_path ?? null;
  const base = { subject: "tv" as const, subjectId: id, mediaType: "tv" as const, tmdbId: id, title, image };
  const out: NewsDraft[] = [];

  const status = statusKind(before.status, after.status);
  if (status) {
    const words = {
      renewed: { headline: `${title} renewed`, detail: "Back from the end: more is on the way" },
      cancelled: { headline: `${title} cancelled`, detail: "No more seasons are coming" },
      ended: { headline: `${title} has ended`, detail: "Its last season has aired" },
    }[status];
    out.push({ ...base, kind: status, ...words, key: `tv:${id}:status:${status}` });
  }

  if ((after.number_of_seasons ?? 0) > (before.number_of_seasons ?? 0)) {
    const n = after.number_of_seasons;
    out.push({ ...base, kind: "new-season", headline: `${title} renewed for season ${n}`, detail: `Season ${n} announced`, key: `tv:${id}:season:${n}` });
  }

  const was = before.next_episode_to_air;
  const next = after.next_episode_to_air;
  if (next?.air_date) {
    const code = episodeCode(next.season_number, next.episode_number);
    const same = was && was.season_number === next.season_number && was.episode_number === next.episode_number;
    const when = newsDate(next.air_date, today);
    const opener = next.episode_number === 1;
    if (!same || !was?.air_date) {
      out.push({
        ...base,
        kind: "next-date",
        headline: opener ? `${title} returns ${when}` : `Next ${title} episode ${when}`,
        detail: [code, next.name].filter(Boolean).join(" · "),
        key: `tv:${id}:next:${code}`,
      });
    } else if (was.air_date !== next.air_date) {
      out.push({
        ...base,
        kind: "date-moved",
        headline: `${title} moves to ${when}`,
        detail: `${code} was ${newsDate(was.air_date, today)}`,
        key: `tv:${id}:moved:${code}:${next.air_date}`,
      });
    }
  }

  out.push(...newTrailers("tv", id, title, image, trailerKeys(before), trailerKeys(after)));
  return out;
}

/** What changed about a saved film: its release date set or moved, or a new trailer. */
export function filmNews(before: MovieDetails | null, after: MovieDetails, today: string): NewsDraft[] {
  if (!before) return [];
  const id = after.id;
  const title = after.title;
  const image = after.poster_path ?? null;
  const out: NewsDraft[] = [];
  const was = before.release_date || null;
  const now = after.release_date || null;
  if (now && now !== was) {
    const when = newsDate(now, today);
    out.push({
      subject: "movie",
      subjectId: id,
      kind: "release-date",
      mediaType: "movie",
      tmdbId: id,
      title,
      image,
      headline: was ? `${title} moves to ${when}` : `${title} dated ${when}`,
      detail: was ? `It was ${newsDate(was, today)}` : "A release date at last",
      key: `movie:${id}:release:${now}`,
    });
  }
  out.push(...newTrailers("movie", id, title, image, trailerKeys(before), trailerKeys(after)));
  return out;
}

/** A followed person's news in the words the bell has always used. */
export function personNewsDraft(
  person: { id: number; name: string; profilePath: string | null },
  item: { mediaType: "movie" | "tv"; tmdbId: number; title: string; kind: "announced" | "released" },
): NewsDraft {
  return {
    subject: "person",
    subjectId: person.id,
    kind: item.kind,
    mediaType: item.mediaType,
    tmdbId: item.tmdbId,
    title: item.title,
    image: person.profilePath,
    headline: `New from ${person.name}`,
    detail: `${item.title} ${item.kind === "released" ? "is out" : "announced"}`,
    key: `person:${person.id}:${item.mediaType}-${item.tmdbId}:${item.kind}`,
  };
}

/** Writes each piece of news once: a key already there is left as it was, `at` and all. Returns how many were new. */
export async function record(drafts: NewsDraft[]): Promise<number> {
  let added = 0;
  for (const d of drafts) {
    const exists = await db.newsItem.findUnique({ where: { key: d.key }, select: { id: true } });
    if (exists) continue;
    await db.newsItem
      .create({ data: d })
      .then(() => (added += 1))
      // Two passes writing the same change at once: the unique key keeps one.
      .catch(() => undefined);
  }
  return added;
}

export type NewsRow = {
  id: string;
  /** The bell's read key. */
  key: string;
  subject: NewsSubject;
  subjectId: number;
  kind: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  image: string | null;
  headline: string;
  detail: string;
  /** ISO. */
  at: string;
  read: boolean;
  /** A trailer's YouTube key, from the change's own key (`tv:95396:trailer:<key>`): the New trailers rail opens it. */
  video: string | null;
};

export const newsKey = (id: string) => `news:${id}`;

/**
 * Whose news is it: the conditions for one person's news, from what they
 * follow. A followed person's since the follow, never before; a show they
 * have in progress or saved (and have not stopped being told about); a film
 * they have saved.
 */
async function interests(userId: string) {
  const [follows, states, saved, dropped] = await Promise.all([
    db.followedPerson.findMany({ where: { userId }, select: { personId: true, followedAt: true } }),
    db.titleState.findMany({ where: { userId }, select: { showId: true } }),
    db.watchlistItem.findMany({ where: { userId }, select: { mediaType: true, tmdbId: true } }),
    db.droppedShow.findMany({ where: { userId }, select: { showId: true } }),
  ]);
  const stopped = new Set(dropped.map((d) => d.showId));
  const shows = [...new Set([...states.map((s) => s.showId), ...saved.filter((s) => s.mediaType === "tv").map((s) => s.tmdbId)])].filter(
    (id) => !stopped.has(id),
  );
  const films = [...new Set(saved.filter((s) => s.mediaType === "movie").map((s) => s.tmdbId))];
  const or = [
    ...follows.map((f) => ({ subject: "person", subjectId: f.personId, at: { gte: f.followedAt } })),
    ...(shows.length ? [{ subject: "tv", subjectId: { in: shows } }] : []),
    ...(films.length ? [{ subject: "movie", subjectId: { in: films } }] : []),
  ];
  return or;
}

/** One person's news, newest first, with their read state. */
export async function newsFor(userId: string, { take = 100, since }: { take?: number; since?: Date } = {}): Promise<NewsRow[]> {
  const or = await interests(userId);
  if (or.length === 0) return [];
  const [rows, reads] = await Promise.all([
    db.newsItem.findMany({
      where: { OR: or, ...(since ? { at: { gte: since } } : {}) },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take,
    }),
    db.notificationRead.findMany({ where: { userId, key: { startsWith: "news:" } }, select: { key: true } }),
  ]);
  const read = new Set(reads.map((r) => r.key));
  return rows.map((r) => ({
    id: r.id,
    key: newsKey(r.id),
    subject: r.subject as NewsSubject,
    subjectId: r.subjectId,
    kind: r.kind,
    mediaType: r.mediaType === "tv" ? "tv" : "movie",
    // Never null for the subjects read here; only press rows name no title.
    tmdbId: r.tmdbId ?? 0,
    title: r.title ?? "",
    image: r.image,
    headline: r.headline,
    detail: r.detail,
    at: r.at.toISOString(),
    read: read.has(newsKey(r.id)),
    video: r.kind === "trailer" ? (/:trailer:([\w-]{6,20})$/.exec(r.key)?.[1] ?? null) : null,
  }));
}

/**
 * "Push me the big ones" (Round 10): what changes whether or when someone
 * gets to watch a thing: a show renewed, cancelled or ended, a season
 * announced, a date set or moved. A trailer, or the next episode's date on a
 * running show, waits for the page and the bell.
 */
const BIG_KINDS = new Set(["renewed", "cancelled", "ended", "new-season", "date-moved", "release-date"]);

export const isBigNews = (n: Pick<NewsRow, "subject" | "kind">) => n.subject !== "person" && BIG_KINDS.has(n.kind);
export const isPeopleNews = (n: Pick<NewsRow, "subject">) => n.subject === "person";

type NewsPush = { title: string; body: string; url: string; tag: string; topic: "news" | "news-people" };

function pushFor(rows: NewsRow[], tag: string, topic: NewsPush["topic"]): NewsPush {
  const first = rows[0];
  return {
    title: first.headline,
    body: rows.length > 1 ? `${first.detail} and ${rows.length - 1} more` : first.detail,
    url: rows.length > 1 ? "/news" : `/title/${first.mediaType}/${first.tmdbId}`,
    tag,
    topic,
  };
}

/**
 * The morning push's news, from the last day's unread rows: one message for
 * the big ones and one for followed people's new work, each only for those
 * who turned it on. The job runs once a day and marks each device told, so
 * neither goes more than once a day.
 */
export function newsPushes(unread: NewsRow[], want: { big: boolean; people: boolean }, today: string): NewsPush[] {
  const out: NewsPush[] = [];
  const big = want.big ? unread.filter(isBigNews) : [];
  const people = want.people ? unread.filter(isPeopleNews) : [];
  if (big.length) out.push(pushFor(big, `news-${today}`, "news"));
  if (people.length) out.push(pushFor(people, `news-people-${today}`, "news-people"));
  return out;
}

/** How many of someone's news items they have not opened: the sidebar's count and the rail's. */
export async function unreadNews(userId: string) {
  return (await newsFor(userId)).filter((n) => !n.read).length;
}

/** Marks every news item read, the News page's Mark all read. Clearing the bell does not touch the News page. */
export async function markNewsRead(userId: string) {
  const unread = (await newsFor(userId, { take: 500 })).filter((n) => !n.read);
  for (const n of unread) {
    await db.notificationRead
      .upsert({ where: { userId_key: { userId, key: n.key } }, create: { userId, key: n.key }, update: {} })
      .catch(() => undefined);
  }
  return unread.length;
}
