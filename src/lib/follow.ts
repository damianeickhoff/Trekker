import "server-only";
import { addDays, todayKey } from "./dates";
import { db } from "./db";
import { personNewsDraft, record } from "./news";
import { partsOf } from "./person";
import type { PersonDetails } from "./tmdb";

/**
 * Following a person, and the daily look at their work that finds what is
 * new. The look reads the person through the TMDB cache (a week's lifetime),
 * so it costs at most one request per followed person per week, however many
 * people follow them. What it finds is stored as `NewsItem` rows with the
 * person as their subject (`lib/news.ts`), which the bell, the News page and
 * the morning push read.
 */

export async function isFollowing(userId: string, personId: number) {
  const row = await db.followedPerson.findUnique({ where: { userId_personId: { userId, personId } } });
  return row !== null;
}

/**
 * Follows or unfollows. Following someone runs their look at once from
 * whatever the cache holds (the actor page has just read them): for someone
 * nobody followed before that is the first look, which seeds their news from
 * what is worth knowing now, so the News page has rows the instant you go
 * there; for someone already followed it is an ordinary look. With nothing
 * cached, the daily pass's look does it instead.
 */
export async function setFollowing(userId: string, personId: number, on: boolean, cached: PersonDetails | null = null) {
  if (!on) {
    await db.followedPerson.deleteMany({ where: { userId, personId } });
    return;
  }
  await db.followedPerson.upsert({
    where: { userId_personId: { userId, personId } },
    create: { userId, personId },
    update: {},
  });
  if (!cached) return;
  // The follow is written; news is a bonus, and failing to record it must not undo the button.
  await recordPersonNews(personId, cached).catch((error) => console.error(`first look at person ${personId} failed`, error));
}

/** Jobs that make a title someone's work as much as a part in it does. */
const MAKER_JOBS = new Set(["Director", "Creator"]);

/**
 * Every part and every direction, by key, with its date ("" while TMDB has
 * none). The same parts the actor page counts, so talk-show spots and
 * appearances as themselves are no more news than they are filmography.
 */
export function creditDates(person: PersonDetails): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of partsOf(person.combined_credits?.cast ?? [])) out[`${p.mediaType}-${p.tmdbId}`] = p.date;
  for (const c of person.combined_credits?.crew ?? []) {
    if (!c.job || !MAKER_JOBS.has(c.job) || (c.media_type !== "movie" && c.media_type !== "tv")) continue;
    out[`${c.media_type}-${c.id}`] ??= c.release_date || c.first_air_date || "";
  }
  return out;
}

export type CreditNews = { mediaType: "movie" | "tv"; tmdbId: number; title: string; kind: "announced" | "released" };

/**
 * A credit that turns up already out is news only if it came out lately:
 * TMDB adding a 1999 film to someone's page is housekeeping, not a release.
 */
const RECENT_DAYS = 30;

/** The most a first look seeds: a prolific actor's page must not flood the feed. */
export const SEED_CAP = 12;

function creditItem(key: string, titles: Record<string, string>, kind: CreditNews["kind"]): CreditNews {
  const [mediaType, id] = key.split("-") as ["movie" | "tv", string];
  return { mediaType, tmdbId: Number(id), title: titles[key] ?? "Untitled", kind };
}

/**
 * The first look's news: with nothing to compare against, what is worth
 * knowing now, by the rules a later look applies to a new credit. Not out yet
 * (undated, or dated after today) is "announced"; out within the last month
 * is "released". Upcoming first, soonest first with the undated after the
 * dated, then the recent, newest first; twelve at most.
 */
export function seedNews(now: Record<string, string>, titles: Record<string, string>, today: string): CreditNews[] {
  const upcoming: [string, string][] = [];
  const recent: [string, string][] = [];
  const since = addDays(today, -RECENT_DAYS);
  for (const [key, date] of Object.entries(now)) {
    if (date === "" || date > today) upcoming.push([key, date]);
    else if (date >= since) recent.push([key, date]);
  }
  // "" would sort first as a string; the undated go after everything dated.
  const undated = (d: string) => (d === "" ? 1 : 0);
  upcoming.sort(([ka, a], [kb, b]) => undated(a) - undated(b) || a.localeCompare(b) || ka.localeCompare(kb));
  recent.sort(([ka, a], [kb, b]) => b.localeCompare(a) || ka.localeCompare(kb));
  return [
    ...upcoming.map(([key]) => creditItem(key, titles, "announced")),
    ...recent.map(([key]) => creditItem(key, titles, "released")),
  ].slice(0, SEED_CAP);
}

/**
 * What changed between two looks. New and not out yet (undated, or dated
 * after today) is "announced"; new and out within the last month is
 * "released"; known, not out at the last look and out now is "released".
 * With no earlier look there is nothing to compare, so the first look seeds
 * what is worth knowing now (`seedNews`) rather than drawing a silent line:
 * following someone shows something at once.
 */
export function newsBetween(
  before: Record<string, string> | null,
  checkedOn: string | null,
  now: Record<string, string>,
  titles: Record<string, string>,
  today: string,
): CreditNews[] {
  if (!before || !checkedOn) return seedNews(now, titles, today);
  const out = (date: string, by: string) => date !== "" && date <= by;
  const news: CreditNews[] = [];
  for (const [key, date] of Object.entries(now)) {
    const was = before[key];
    if (was === undefined) {
      if (!out(date, today)) news.push(creditItem(key, titles, "announced"));
      else if (date >= addDays(today, -RECENT_DAYS)) news.push(creditItem(key, titles, "released"));
    } else if (!out(was, checkedOn) && out(date, today)) {
      news.push(creditItem(key, titles, "released"));
    }
  }
  return news;
}

function titlesOf(person: PersonDetails): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of [...(person.combined_credits?.cast ?? []), ...(person.combined_credits?.crew ?? [])]) {
    const key = `${c.media_type}-${c.id}`;
    out[key] ??= c.title || c.name || "Untitled";
  }
  return out;
}

/**
 * One followed person's look: compare their credits now with the last look,
 * store what is new, and make now the next look's "before". Each piece of
 * news is written once of each kind (the unique index), so a look repeated on
 * the same day, or a stale cache answer seen twice, adds nothing.
 *
 * A first look seeds instead (`seedNews`), and so does `seed`: the one-off for
 * people followed before seeding existed, whose line was drawn silently and
 * who have no news at all. Seeded rows are dated at the latest follow, not
 * now: a person's news shows from the follow on (`newsFor`), so every current
 * follower sees them, and they sit where the follow happened rather than
 * reading as something the job has just noticed.
 */
export async function recordPersonNews(personId: number, person: PersonDetails, today = todayKey(), { seed = false } = {}) {
  const row = await db.person.findUnique({ where: { tmdbId: personId }, select: { credits: true, creditsCheckedAt: true } });
  const now = creditDates(person);
  const titles = titlesOf(person);
  const before = row?.credits ? (JSON.parse(row.credits) as Record<string, string>) : null;
  const checkedOn = row?.creditsCheckedAt ? todayKey(row.creditsCheckedAt) : null;
  const first = !before || !checkedOn;
  const who = { id: personId, name: person.name, profilePath: person.profile_path };

  const seeded = first || seed ? seedNews(now, titles, today) : [];
  if (seeded.length) {
    const latest = await db.followedPerson.findFirst({ where: { personId }, orderBy: { followedAt: "desc" }, select: { followedAt: true } });
    const base = (latest?.followedAt ?? new Date()).getTime();
    // A millisecond apart in relevance order, so a page that lists newest first lists them upcoming first.
    await record(seeded.map((n, i) => ({ ...personNewsDraft(who, n), at: new Date(base + seeded.length - i) })));
  }
  const changed = first ? [] : newsBetween(before, checkedOn, now, titles, today);
  await record(changed.map((n) => personNewsDraft(who, n)));
  await db.person.upsert({
    where: { tmdbId: personId },
    create: { tmdbId: personId, name: person.name, profilePath: person.profile_path, credits: JSON.stringify(now), creditsCheckedAt: new Date() },
    update: { credits: JSON.stringify(now), creditsCheckedAt: new Date() },
  });
  const key = (n: CreditNews) => `${n.mediaType}-${n.tmdbId}:${n.kind}`;
  const seen = new Set(seeded.map(key));
  return [...seeded, ...changed.filter((n) => !seen.has(key(n)))];
}

/** Everyone followed by anyone, once each. */
export async function followedPersonIds(): Promise<number[]> {
  const rows = await db.followedPerson.findMany({ select: { personId: true }, distinct: ["personId"] });
  return rows.map((r) => r.personId);
}

/**
 * Followed people whose line was drawn but who have no news at all: followed
 * before the first look seeded anything (Round 9). The daily pass and the
 * start-up pass seed them once. "No news yet" is the marker, so no migration:
 * someone with nothing upcoming or recent stays on the list and is looked at
 * again, through the week-long cache, which costs a read and nothing more.
 */
export async function unseededPersonIds(): Promise<number[]> {
  const ids = await followedPersonIds();
  if (ids.length === 0) return [];
  const [checked, withNews] = await Promise.all([
    db.person.findMany({ where: { tmdbId: { in: ids }, creditsCheckedAt: { not: null } }, select: { tmdbId: true } }),
    db.newsItem.findMany({ where: { subject: "person", subjectId: { in: ids } }, select: { subjectId: true }, distinct: ["subjectId"] }),
  ]);
  const has = new Set(withNews.map((n) => n.subjectId));
  return checked.map((p) => p.tmdbId).filter((id) => !has.has(id));
}
