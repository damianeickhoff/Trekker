import "server-only";
import { db } from "./db";
import { KEEP_CHOICES, PRESS_DAYS, feedList, fetchFeed, httpUrl, knownTitles, parseFeed, pressDrafts, recordPress, sourceName, titleMatcher } from "./press";

/*
 * Settings › News (Round 10): which of the instance's feeds someone reads,
 * the feeds they added for themselves, and how the News page reads for them.
 * Every write is checked here rather than trusted from the browser.
 *
 * A source switch is stored only once it has been turned off (`NewsSource`,
 * a missing row is on), so a feed the admin adds to `NEWS_FEEDS` reaches
 * everyone without a row per person. Settings shows one switch per source
 * name, since Variety and The Hollywood Reporter each publish a TV and a film
 * feed, and one switch writes a row for every address under the name.
 */

export type SourceGroup = { name: string; urls: string[]; enabled: boolean };

/** A feed's name as a switch says it: its own, or its host for one `NEWS_FEEDS` did not name. */
function feedName(feed: { url: string; name: string | null }) {
  return feed.name ?? sourceName(null, feed.url);
}

/** The instance's feeds as Settings lists them, one per name, each on unless every address under it was turned off. */
export async function sourcesFor(userId: string): Promise<SourceGroup[]> {
  const off = new Set(
    (await db.newsSource.findMany({ where: { userId, enabled: false }, select: { feedUrl: true } })).map((s) => s.feedUrl),
  );
  const groups = new Map<string, string[]>();
  for (const feed of feedList()) {
    const name = feedName(feed);
    groups.set(name, [...(groups.get(name) ?? []), feed.url]);
  }
  return [...groups].map(([name, urls]) => ({ name, urls, enabled: urls.some((u) => !off.has(u)) }));
}

/** One source name on or off, for every address under it. A name the instance does not read is refused. */
export async function setSourceEnabled(userId: string, name: unknown, enabled: unknown) {
  if (typeof name !== "string" || typeof enabled !== "boolean") throw new Error("Not a source");
  const urls = feedList()
    .filter((f) => feedName(f) === name)
    .map((f) => f.url);
  if (urls.length === 0) throw new Error("Not one of this instance's feeds");
  for (const feedUrl of urls) {
    await db.newsSource.upsert({ where: { userId_feedUrl: { userId, feedUrl } }, create: { userId, feedUrl, enabled }, update: { enabled } });
  }
}

export type OwnFeed = { id: string; url: string; name: string; enabled: boolean };

export async function ownFeeds(userId: string): Promise<OwnFeed[]> {
  return db.userFeed.findMany({ where: { userId }, orderBy: { addedAt: "asc" }, select: { id: true, url: true, name: true, enabled: true } });
}

/** Own feeds a person may keep. Each is one more address the passes read for everyone's instance. */
export const OWN_FEED_CAP = 10;

export type AddFeedOutcome = { ok: true; feed: OwnFeed; added: number } | { ok: false; error: string };

export const NOT_A_FEED = "That address did not answer with a feed";

/**
 * Adds a feed someone pasted, after reading it once: six seconds behind the
 * press gate (`fetchFeed`), and only an RSS or Atom answer with items counts.
 * What it read is stored at once, under this feed, so the News page has its
 * headlines without waiting for the next pass. Its name is the feed's own
 * title's last part, or its host. `read` is the fetch, for tests.
 */
export async function addOwnFeed(userId: string, address: unknown, read: (url: string) => Promise<string | null> = fetchFeed): Promise<AddFeedOutcome> {
  const url = typeof address === "string" && address.length <= 500 ? httpUrl(address.trim()) : null;
  if (!url) return { ok: false, error: "That is not a web address" };
  if (feedList().some((f) => f.url === url)) return { ok: false, error: "This Trekker already reads that feed; switch it on above" };
  const mine = await ownFeeds(userId);
  if (mine.some((f) => f.url === url)) return { ok: false, error: "You already have that feed" };
  if (mine.length >= OWN_FEED_CAP) return { ok: false, error: `You have ${OWN_FEED_CAP} feeds, the most there is room for. Remove one to add another.` };

  const xml = await read(url).catch(() => null);
  const parsed = xml && /<(rss|feed|rdf:RDF)[\s>]/i.test(xml) ? parseFeed(xml) : null;
  if (!parsed || parsed.items.length === 0) return { ok: false, error: NOT_A_FEED };

  const name = sourceName(parsed.title, url);
  const feed = await db.userFeed.create({ data: { userId, url, name }, select: { id: true, url: true, name: true, enabled: true } });
  // Matching against the cache is a database read; a failure leaves the headlines unmatched rather than unsaved.
  const match = titleMatcher(await knownTitles().catch(() => []));
  const added = await recordPress(pressDrafts(parsed.items, name, match, new Date(), url)).catch(() => 0);
  return { ok: true, feed, added };
}

/** Turns one of someone's own feeds on or off; off, the passes stop reading it unless another owner has it on. */
export async function setOwnFeedEnabled(userId: string, id: unknown, enabled: unknown) {
  if (typeof id !== "string" || typeof enabled !== "boolean") throw new Error("Not a feed");
  const { count } = await db.userFeed.updateMany({ where: { id, userId }, data: { enabled } });
  if (count === 0) throw new Error("Not your feed");
}

/**
 * Removes one of someone's own feeds, and its headlines with it, unless
 * someone else still has the same address (their rows are the same rows).
 */
export async function removeOwnFeed(userId: string, id: unknown) {
  if (typeof id !== "string") throw new Error("Not a feed");
  const feed = await db.userFeed.findFirst({ where: { id, userId } });
  if (!feed) return;
  await db.userFeed.delete({ where: { id: feed.id } });
  const others = await db.userFeed.count({ where: { url: feed.url } });
  if (others === 0 && !feedList().some((f) => f.url === feed.url)) {
    await db.newsItem.deleteMany({ where: { subject: "press", feedUrl: feed.url } });
  }
}

/**
 * The feeds whose headlines this person sees: the instance's, less the ones
 * they turned off, and their own that are on. A row from someone else's own
 * feed is never among them.
 */
export async function visibleFeeds(userId: string): Promise<string[]> {
  const [off, own] = await Promise.all([
    db.newsSource.findMany({ where: { userId, enabled: false }, select: { feedUrl: true } }),
    db.userFeed.findMany({ where: { userId, enabled: true }, select: { url: true } }),
  ]);
  const hidden = new Set(off.map((s) => s.feedUrl));
  return [...feedList().map((f) => f.url).filter((u) => !hidden.has(u)), ...own.map((f) => f.url)];
}

// ---------------------------------------------------------------------------
// Reading

export const OPEN_ON = ["for-you", "top", "last"] as const;
export type OpenOn = (typeof OPEN_ON)[number];

export type NewsPrefs = { openOn: OpenOn; markOnOpen: boolean; keepDays: number; pushBig: boolean; pushPeople: boolean };

const DEFAULT_PREFS: NewsPrefs = { openOn: "for-you", markOnOpen: true, keepDays: PRESS_DAYS, pushBig: false, pushPeople: false };

export async function newsPrefs(userId: string): Promise<NewsPrefs> {
  const row = await db.user.findUnique({
    where: { id: userId },
    select: { newsOpenOn: true, newsMarkOnOpen: true, newsKeepDays: true, notifyNews: true, notifyNewsPeople: true },
  });
  if (!row) return DEFAULT_PREFS;
  return {
    openOn: (OPEN_ON as readonly string[]).includes(row.newsOpenOn) ? (row.newsOpenOn as OpenOn) : "for-you",
    markOnOpen: row.newsMarkOnOpen,
    keepDays: (KEEP_CHOICES as readonly number[]).includes(row.newsKeepDays) ? row.newsKeepDays : PRESS_DAYS,
    pushBig: row.notifyNews,
    pushPeople: row.notifyNewsPeople,
  };
}

export type ReadingPref = "openOn" | "markOnOpen" | "keepDays";

/** One of the Reading rows, checked against what Settings offers. */
export async function setReadingPref(userId: string, key: unknown, value: unknown) {
  if (key === "openOn" && (OPEN_ON as readonly unknown[]).includes(value)) {
    await db.user.update({ where: { id: userId }, data: { newsOpenOn: value as OpenOn } });
  } else if (key === "markOnOpen" && typeof value === "boolean") {
    await db.user.update({ where: { id: userId }, data: { newsMarkOnOpen: value } });
  } else if (key === "keepDays" && (KEEP_CHOICES as readonly unknown[]).includes(value)) {
    await db.user.update({ where: { id: userId }, data: { newsKeepDays: value as number } });
  } else {
    throw new Error("Not one of the offered settings");
  }
}
