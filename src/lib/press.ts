import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { gate } from "./gates";

/**
 * Popular news (Round 9): headlines from entertainment sites' RSS and Atom
 * feeds, for the News page's Top and kind chips (Round 9's Popular tab).
 * TMDB has no news, so this is the first network source that is not TMDB,
 * Plex or Overseerr, and it is kept small on purpose:
 *
 * - Only the refresh job reads feeds (the daily pass, and the refresh the
 *   News page asks for after it has painted), one at a time behind the
 *   "press" gate, six seconds each, and a feed that fails is skipped until
 *   the next pass. No page ever waits on one; adding an own feed in Settings
 *   is the one read made while someone waits, and it is theirs to wait for.
 * - What is kept is what a feed is published for: the headline, the link to
 *   the article, the site's name, when it was published, the feed's own
 *   picture for it and (Round 10) its summary line, the first two sentences
 *   of the item's `description` or `summary` as plain text, 220 characters
 *   at most. Never the article's body (`content:encoded`, Atom's
 *   `content`): the headline links out to the source, which is where the
 *   story is read, and the line under it is the standfirst the feed itself
 *   offers for exactly this use.
 * - Round 10: each headline is classified by a keyword rule
 *   (`classifyHeadline`) when it is stored, for the page's chips, and each
 *   row remembers the feed that brought it (`feedUrl`), so someone's own
 *   feeds and the sources they turned off are a column to filter on. A
 *   person's own feeds (`UserFeed`) are read by the same pass as the
 *   instance's, one at a time behind the same gate.
 * - Round 10 review: a headline whose feed gives no picture has its article's
 *   head read once, after the pass, for its `og:image` (`lookUpPictures`):
 *   512 KB at most, stopping at the picture's tag or `</head>`, the
 *   picture's address the only thing kept.
 * - A headline naming a title the cache already knows (exact, whole words,
 *   case-insensitive, four characters or more) carries that title, so the
 *   row can show its poster and link to it. No TMDB call for that.
 *
 * Parsing is a handful of regular expressions over `<item>` and `<entry>`
 * blocks, not an XML library: the feeds are machine-written and alike, and a
 * dependency for five fields is more to trust than the fields are worth.
 */

/** `own`: a feed someone added for themselves (`UserFeed`) rather than one of the instance's. */
export type Feed = { url: string; name: string | null; own?: boolean };

/**
 * Checked by hand on 24 September 2026, each with one plain GET answering RSS
 * (README, Round 9). Empire had none that answered and was left out; TVLine's
 * old address redirects, so its new one is listed.
 */
export const DEFAULT_FEEDS: Feed[] = [
  { url: "https://variety.com/v/tv/feed/", name: "Variety" },
  { url: "https://variety.com/v/film/feed/", name: "Variety" },
  { url: "https://deadline.com/feed/", name: "Deadline" },
  { url: "https://www.hollywoodreporter.com/c/tv/feed/", name: "The Hollywood Reporter" },
  { url: "https://www.hollywoodreporter.com/c/movies/feed/", name: "The Hollywood Reporter" },
  { url: "https://screenrant.com/feed/", name: "Screen Rant" },
  { url: "https://collider.com/feed/", name: "Collider" },
  { url: "https://www.indiewire.com/feed/", name: "IndieWire" },
  { url: "https://www.tvline.com/feed/", name: "TVLine" },
];

/**
 * The feeds this instance reads. `NEWS_FEEDS`, comma-separated, replaces the
 * list; set and empty, it turns Popular off. Anything that is not an http(s)
 * address is dropped rather than fetched.
 */
export function feedsFrom(env: string | undefined): Feed[] {
  if (env === undefined) return DEFAULT_FEEDS;
  return env
    .split(",")
    .map((s) => s.trim())
    .filter((s) => httpUrl(s) !== null)
    .map((url) => ({ url, name: null }));
}

/** This instance's feeds, from its environment. */
export function feedList(): Feed[] {
  return feedsFrom(process.env.NEWS_FEEDS);
}

/** Newest first, this many per feed per pass. */
export const PER_FEED = 40;
/** Press rows older than this are pruned, and older items are not stored at all. */
export const PRESS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 6_000;
/** A feed is tens of kilobytes; anything past this is not one. */
const MAX_CHARS = 5_000_000;

// ---------------------------------------------------------------------------
// Parsing

export type FeedItem = { headline: string; link: string; published: Date | null; image: string | null; summary?: string | null };
export type ParsedFeed = { title: string | null; items: FeedItem[] };

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1] === "x" || name[1] === "X" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return NAMED[name.toLowerCase()] ?? whole;
  });
}

const unwrap = (text: string) => text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
const stripTags = (text: string) => text.replace(/<\/?[a-z!][^>]*>/gi, " ");

/**
 * A headline as words: CDATA unwrapped, tags gone (escaped ones too),
 * entities decoded, spaces tidied. Decoded twice, because Atom's `type="html"`
 * titles and plenty of RSS ones escape their entities again (`&amp;#8217;`);
 * a headline that really says "&amp;" is rarer than one that means ’.
 */
export function plainText(raw: string): string {
  return decodeEntities(stripTags(decodeEntities(stripTags(unwrap(raw)))))
    .replace(/\s+/g, " ")
    .trim();
}

function escape(name: string) {
  return name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The inside of the first `<name>…</name>` in a block, or null. `<title>` does not match `<media:title>`. */
function inner(block: string, name: string): string | null {
  const m = new RegExp(`<${escape(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${escape(name)}>`, "i").exec(block);
  return m ? m[1] : null;
}

/** Every opening (or self-closing) `<name …>` tag in a block, whole. */
function openings(block: string, name: string): string[] {
  return block.match(new RegExp(`<${escape(name)}(?:\\s[^>]*)?/?>`, "gi")) ?? [];
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${escape(name)}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i").exec(tag);
  return m ? decodeEntities(m[1] ?? m[2] ?? "").trim() : null;
}

export function httpUrl(text: string | null): string | null {
  if (!text) return null;
  try {
    const url = new URL(text.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Pictures only over https: an http one would be mixed content on the page. */
function httpsUrl(text: string | null): string | null {
  const url = httpUrl(text);
  return url?.startsWith("https:") ? url : null;
}

const IMAGE_FILE = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** The feed's picture for an item: media:content, media:thumbnail, an image enclosure, or the first <img> in its summary. */
function imageOf(block: string): string | null {
  for (const tag of openings(block, "media:content")) {
    const medium = attr(tag, "medium");
    const type = attr(tag, "type");
    const url = attr(tag, "url");
    if (medium === "image" || type?.startsWith("image/") || (url && IMAGE_FILE.test(url))) {
      const found = httpsUrl(url);
      if (found) return found;
    }
  }
  for (const tag of openings(block, "media:thumbnail")) {
    const found = httpsUrl(attr(tag, "url"));
    if (found) return found;
  }
  for (const tag of openings(block, "enclosure")) {
    if (attr(tag, "type")?.startsWith("image/")) {
      const found = httpsUrl(attr(tag, "url"));
      if (found) return found;
    }
  }
  for (const tag of openings(block, "link")) {
    if (attr(tag, "rel") === "enclosure" && attr(tag, "type")?.startsWith("image/")) {
      const found = httpsUrl(attr(tag, "href"));
      if (found) return found;
    }
  }
  for (const name of ["description", "summary", "content:encoded", "content"]) {
    const body = inner(block, name);
    if (!body) continue;
    // Summaries carry their markup escaped or in CDATA; either way it is markup once unwrapped and decoded.
    const html = decodeEntities(unwrap(body));
    const img = /<img\s[^>]*>/i.exec(html);
    const found = img ? httpsUrl(attr(img[0], "src")) : null;
    if (found) return found;
  }
  return null;
}

/** RSS's `<link>url</link>`, Atom's `<link href>` (the alternate), or a permalink guid. */
function linkOf(block: string): string | null {
  const text = inner(block, "link");
  const plain = text ? httpUrl(decodeEntities(unwrap(text))) : null;
  if (plain) return plain;
  const tags = openings(block, "link");
  const alternate = tags.find((t) => (attr(t, "rel") ?? "alternate") === "alternate");
  const href = httpUrl(alternate ? attr(alternate, "href") : null);
  if (href) return href;
  const guid = inner(block, "guid");
  return guid ? httpUrl(decodeEntities(unwrap(guid))) : null;
}

function dateOf(block: string): Date | null {
  for (const name of ["pubDate", "published", "updated", "dc:date"]) {
    const text = inner(block, name);
    if (!text) continue;
    const date = new Date(plainText(text));
    if (!Number.isNaN(date.getTime())) return date;
  }
  return null;
}

/** The words a site appends to every summary, which say nothing about the story. */
const BOILERPLATE = [
  /\s*The post .{0,200}? appeared first on .{0,120}?\.?\s*$/i,
  /\s*(Continue reading|Read more|Read the full (story|article))\b.*$/i,
  /\s*\[(…|\.\.\.)\]\s*$/,
  /\s*(…|\.\.\.)\s*$/,
];
export const SUMMARY_MAX = 220;

/**
 * A summary line as the page shows it: plain text (tags stripped, entities
 * decoded), the site's boilerplate taken off the end, then the first two
 * sentences and no more than 220 characters, cut at a word with an ellipsis
 * where it had to be. Empty comes back null.
 */
export function summaryLine(raw: string): string | null {
  let text = plainText(raw);
  for (const pattern of BOILERPLATE) text = text.replace(pattern, "");
  text = text.trim();
  if (!text) return null;
  // A sentence ends at . ! or ? (and any closing quote or bracket) before a space and a capital, a digit or an opening quote.
  const sentences = text.split(/(?<=[.!?][”’"')\]]*)\s+(?=[\p{Lu}\p{N}“‘"'(])/u);
  let line = sentences.slice(0, 2).join(" ").trim();
  if (line.length > SUMMARY_MAX) {
    const cut = line.slice(0, SUMMARY_MAX - 1);
    const space = cut.lastIndexOf(" ");
    line = `${(space > SUMMARY_MAX / 2 ? cut.slice(0, space) : cut).replace(/[\s,;:–—-]+$/, "")}…`;
  }
  return line || null;
}

/**
 * The item's own summary line: RSS's `description` or Atom's `summary`,
 * never `content:encoded` or Atom's `content`, which are the article. A
 * summary that only repeats the headline is no line at all.
 */
function summaryOf(block: string, headline: string): string | null {
  for (const name of ["description", "summary"]) {
    const body = inner(block, name);
    if (!body) continue;
    const line = summaryLine(body);
    if (!line) continue;
    const same = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
    return same(line) === same(headline) ? null : line;
  }
  return null;
}

/** An RSS or Atom document's items: headline, link, published time, picture and summary line. Items without a headline or a link are dropped. */
export function parseFeed(xml: string): ParsedFeed {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const first = xml.search(/<item[\s>]|<entry[\s>]/i);
  // The channel's own title comes before its first item.
  const head = first > 0 ? xml.slice(0, first) : xml;
  const channel = inner(head, "title");
  const items: FeedItem[] = [];
  for (const block of blocks) {
    const title = inner(block, "title");
    const headline = title ? plainText(title) : "";
    const link = linkOf(block);
    if (!headline || !link) continue;
    items.push({ headline, link, published: dateOf(block), image: imageOf(block), summary: summaryOf(block, headline) });
  }
  return { title: channel ? plainText(channel) || null : null, items };
}

/**
 * The name a row shows for a feed nobody named: its own title's last part
 * ("TV News | Deadline" is Deadline), or the address's host.
 */
export function sourceName(title: string | null, url: string): string {
  const parts = (title ?? "").split(/\s+[|–—-]\s+/).map((s) => s.trim()).filter(Boolean);
  const name = parts.at(-1);
  if (name) return name.slice(0, 40);
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "News";
  }
}

// ---------------------------------------------------------------------------
// What a headline is about

/** A press row's kind, for the News page's chips (Round 10). */
export type PressTag = "renewed" | "cancelled" | "trailer" | "casting" | "box-office" | "reviews" | "dated" | "moved";

/**
 * The keyword rules, in the order they are tried: the first that matches
 * names the headline. Cancelled comes before Renewed so "not renewed" is a
 * cancellation; Trailer before the dates, so "trailer sets the release date"
 * is a trailer; Box office before the dates, so "opens to $48M" is not
 * "dated"; moves before plain dating. Whole words throughout, so "podcast" is
 * not casting and "updated" not dated. `debut` is box office only beside a
 * money figure or a weekend, because a series "debut date" is a date.
 */
const RULES: [PressTag, RegExp[]][] = [
  ["cancelled", [/\bcancel(?:s|ed|led|ling|lation)?\b/i, /\bax(?:es|ed)\b/i, /\b(?:won['’]t|will not|won’t) return\b/i, /\bnot (?:be )?renewed\b/i]],
  [
    "renewed",
    [/\brenew(?:s|ed|al)?\b/i, /\bseason \d+ (?:is )?order(?:ed)?\b/i, /\border(?:s|ed)? (?:a )?(?:season \d+|(?:second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)) season)\b/i],
  ],
  ["trailer", [/\btrailers?\b/i, /\bteasers?\b/i, /\bfirst[- ]look\b/i]],
  ["casting", [/\bcast(?:s|ing)?\b/i, /\bjoins?\b/i, /\bto star\b/i, /\blands? (?:a |the )?(?:\w+ )?role\b/i]],
  [
    "box-office",
    [/\bbox[- ]office\b/i, /\bopens? to\b/i, /\$\s?\d+(?:\.\d+)?\s?(?:m|million|bn|billion)\b/i, /\bdebuts?\b.*\bweekend\b|\bweekend\b.*\bdebuts?\b/i],
  ],
  ["reviews", [/\breviews?\b/i, /\bround-?up\b/i, /\bcritics\b/i]],
  ["moved", [/\bmove[sd]?\b/i, /\bdelay(?:s|ed)?\b/i, /\bpushed\b/i, /\bpush(?:es)? back\b/i, /\bpostpone[sd]?\b/i]],
  ["dated", [/\brelease date\b/i, /\bdated\b/i, /\bsets? .{0,60}\breleases?\b/i, /\bpremiere date\b/i]],
];

/**
 * What a headline is about, by keyword, or null when it says none of the
 * chips' kinds. Deliberately blunt: it decides which chip a headline sits
 * under, not what it means, and a miss only leaves it under Top.
 */
export function classifyHeadline(headline: string): PressTag | null {
  const text = headline.replace(/[‘’]/g, "'");
  for (const [tag, patterns] of RULES) {
    if (patterns.some((p) => p.test(text))) return tag;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Matching a headline to a title

export type KnownTitle = { mediaType: "movie" | "tv"; tmdbId: number; title: string; poster: string | null };

/** Curly quotes as straight ones, so "Grey’s Anatomy" in a headline finds Grey's Anatomy. */
function fold(text: string) {
  return text.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
}

const WORD = /[\p{L}\p{N}]/u;

/**
 * A matcher over the titles the cache knows. The longest name that appears in
 * a headline as whole words wins, so "Andor" does not lose to "And" (too short
 * anyway) and "The Last of Us" beats "Last". Names under four characters are
 * never matched: "It" and "Up" would match half the headlines written.
 */
export function titleMatcher(titles: KnownTitle[]): (headline: string) => KnownTitle | null {
  const seen = new Set<string>();
  const names = titles
    .map((t) => ({ t, name: fold(t.title.trim()) }))
    .filter(({ name }) => name.length >= 4 && !seen.has(name) && seen.add(name))
    .sort((a, b) => b.name.length - a.name.length);
  return (headline) => {
    const text = fold(headline);
    for (const { t, name } of names) {
      let from = 0;
      for (;;) {
        const at = text.indexOf(name, from);
        if (at < 0) break;
        const before = at === 0 ? "" : text[at - 1];
        const after = text[at + name.length] ?? "";
        if (!WORD.test(before) && !WORD.test(after)) return t;
        from = at + 1;
      }
    }
    return null;
  };
}

/** Keys of the list answers worth matching against: what is trending and popular is what the press writes about. */
const LIST_KEYS = ["/trending/*", "/movie/popular*", "/tv/popular*", "/movie/now_playing*", "/movie/upcoming*", "/tv/on_the_air*"];

/**
 * Every title the TMDB cache holds details for (what someone here has opened
 * or follows), then the trending and popular lists. Read from the cache's
 * rows, never TMDB; the details' names come out through `json_extract`, so
 * the bodies, some large, are never parsed here.
 */
export async function knownTitles(): Promise<KnownTitle[]> {
  const details = await db.$queryRawUnsafe<{ key: string; name: string | null; poster: string | null }[]>(`
    SELECT "key",
      COALESCE(json_extract("body", '$.name'), json_extract("body", '$.title')) AS "name",
      json_extract("body", '$.poster_path') AS "poster"
    FROM "TmdbCache"
    WHERE ("key" GLOB '/tv/[0-9]*' OR "key" GLOB '/movie/[0-9]*')
      AND "key" NOT GLOB '/tv/[0-9]*/*' AND "key" NOT GLOB '/movie/[0-9]*/*'
      AND json_valid("body")`);
  const out: KnownTitle[] = [];
  for (const row of details) {
    const m = /^\/(tv|movie)\/(\d+)/.exec(row.key);
    if (m && typeof row.name === "string") out.push({ mediaType: m[1] as "tv" | "movie", tmdbId: Number(m[2]), title: row.name, poster: row.poster ?? null });
  }
  const lists = await db.$queryRawUnsafe<{ key: string; body: string }[]>(
    `SELECT "key", "body" FROM "TmdbCache" WHERE ${LIST_KEYS.map(() => `"key" GLOB ?`).join(" OR ")}`,
    ...LIST_KEYS,
  );
  for (const row of lists) {
    let body: { results?: { id?: number; media_type?: string; title?: string; name?: string; poster_path?: string | null }[] };
    try {
      body = JSON.parse(row.body);
    } catch {
      continue;
    }
    const fromKey = row.key.startsWith("/tv/") ? "tv" : row.key.startsWith("/movie/") ? "movie" : null;
    for (const r of body.results ?? []) {
      const mediaType = r.media_type === "tv" || r.media_type === "movie" ? r.media_type : fromKey;
      const title = r.title ?? r.name;
      if (!mediaType || typeof r.id !== "number" || !title) continue;
      out.push({ mediaType, tmdbId: r.id, title, poster: r.poster_path ?? null });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Storing

export type PressDraft = {
  headline: string;
  link: string;
  source: string;
  imageUrl: string | null;
  at: Date;
  match: KnownTitle | null;
  /** The feed's summary line, when it had one worth keeping. */
  summary?: string | null;
  /** What the headline is about; null when it is none of the chips' kinds. */
  tag?: PressTag | null;
  /** The feed that brought it. */
  feedUrl?: string | null;
};

/**
 * One feed's items as rows to store: the newest forty, none older than thirty
 * days, each with the title its headline names, its summary line and what it
 * is about. An item with no date counts as published now, and one dated in
 * the future as now too, so a feed's wrong clock cannot pin it to the top.
 */
export function pressDrafts(
  items: FeedItem[],
  source: string,
  match: (headline: string) => KnownTitle | null,
  now = new Date(),
  feedUrl: string | null = null,
): PressDraft[] {
  const cutoff = now.getTime() - PRESS_DAYS * DAY_MS;
  return items
    .map((item, i) => ({ item, i, at: Math.min(item.published?.getTime() ?? now.getTime(), now.getTime()) }))
    .filter(({ at }) => at >= cutoff)
    .sort((a, b) => b.at - a.at || a.i - b.i)
    .slice(0, PER_FEED)
    .map(({ item, at }) => ({
      headline: item.headline.slice(0, 300),
      link: item.link,
      source,
      imageUrl: item.image,
      at: new Date(at),
      match: match(item.headline),
      summary: item.summary ?? null,
      tag: classifyHeadline(item.headline),
      feedUrl,
    }));
}

/** Writes each article once, by its link, whichever feed carried it. Returns how many were new. */
export async function recordPress(drafts: PressDraft[]): Promise<number> {
  let added = 0;
  for (const d of drafts) {
    const exists = await db.newsItem.findFirst({ where: { OR: [{ link: d.link }, { key: `press:${d.link}` }] }, select: { id: true } });
    if (exists) continue;
    await db.newsItem
      .create({
        data: {
          subject: "press",
          subjectId: 0,
          kind: "press",
          mediaType: d.match?.mediaType ?? null,
          tmdbId: d.match?.tmdbId ?? null,
          title: d.match?.title ?? null,
          image: d.match?.poster ?? null,
          headline: d.headline,
          detail: "",
          at: d.at,
          key: `press:${d.link}`,
          source: d.source,
          link: d.link,
          imageUrl: d.imageUrl,
          summary: d.summary ?? null,
          // "" rather than null: classified, and about none of the chips' kinds (see the schema).
          tag: d.tag ?? "",
          feedUrl: d.feedUrl ?? null,
        },
      })
      .then(() => (added += 1))
      // Two feeds carrying the same article in one pass: the unique link keeps one.
      .catch(() => undefined);
  }
  return added;
}

/** One feed, fetched once: six seconds, behind the gate, and null for anything that is not an answer. */
export async function fetchFeed(url: string): Promise<string | null> {
  try {
    await gate.take("press");
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
      headers: {
        "User-Agent": "Trekker (self-hosted TV and film tracker; reads headlines once a day)",
        Accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8",
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > MAX_CHARS ? null : text;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pictures from the article's head

/**
 * How much of an article is read for its picture: the head, never the body.
 * 512 KB, because these sites' heads are long (fifth review: inline scripts
 * and styles put The Hollywood Reporter's og:image at about 310 KB, IndieWire's
 * at 187 KB, Variety's at 311 KB); the read stops as soon as the picture's tag
 * or `</head>` has gone by, so most end well before it.
 */
export const HEAD_BYTES = 512 * 1024;
/** A whole `<meta>` naming the page's picture, with its content: once read, the rest of the head is not needed. */
const PICTURE_TAG = /<meta\s[^>]*(?:og:image|twitter:image)[^>]*\scontent\s*=\s*["'][^"']+["'][^>]*>|<meta\s[^>]*\scontent\s*=\s*["'][^"']+["'][^>]*(?:og:image|twitter:image)[^>]*>/i;
/** Rows from before a pass that still have no picture, looked up each pass, newest first. */
export const PICTURE_BACKFILL = 20;
const MAX_REDIRECTS = 2;

/**
 * The picture a page names for itself in its head, `og:image` first, then
 * `twitter:image`, either attribute order, https only, resolved against the
 * page's address. Null when it names none.
 */
export function ogImageOf(html: string, pageUrl: string): string | null {
  const head = html.split(/<\/head>/i)[0];
  const metas = head.match(/<meta\s[^>]*>/gi) ?? [];
  for (const wanted of ["og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"]) {
    for (const tag of metas) {
      const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
      if (key !== wanted) continue;
      const content = attr(tag, "content");
      if (!content) continue;
      let url: string;
      try {
        url = new URL(content, pageUrl).toString();
      } catch {
        continue;
      }
      const found = httpsUrl(url);
      if (found) return found;
    }
  }
  return null;
}

/** Whether a head is an article's own: it carries Open Graph tags, which every article page these sites publish does. */
export function isArticleHead(html: string): boolean {
  const head = html.split(/<\/head>/i)[0];
  return /<meta\s[^>]*(property|name)\s*=\s*["']og:/i.test(head);
}

/**
 * The head of an article, 512 KB at most, through the press gate: six seconds, a
 * `Range` request, reading stopped once the head is in hand, at most two
 * redirects followed by hand (so each hop is checked as http(s)). Null for
 * anything that is not an HTML answer, so the row is asked again next pass.
 */
export async function fetchHead(url: string): Promise<string | null> {
  try {
    let target = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await gate.take("press");
      const res = await fetch(target, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
        redirect: "manual",
        // No user agent of our own (third review): the sites answered a named one with a page that was not the article, and
        // every row was marked "looked, none". The runtime's default is what a plain fetch sends, and got the article.
        headers: {
          Accept: "text/html",
          Range: `bytes=0-${HEAD_BYTES - 1}`,
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const next = httpUrl(res.headers.get("location") ? new URL(res.headers.get("location")!, target).toString() : null);
        await res.body?.cancel().catch(() => undefined);
        if (!next) return null;
        target = next;
        continue;
      }
      if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) {
        await res.body?.cancel().catch(() => undefined);
        return null;
      }
      return await readHead(res);
    }
    return null;
  } catch {
    return null;
  }
}

/** Up to 512 KB of a body, stopping as soon as the picture's tag or `</head>` has gone by; the rest is never read. */
async function readHead(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  let scanned = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
    // Only the new stretch is searched, with a margin for a tag split across chunks, so a long head is not scanned over and over.
    const fresh = text.slice(Math.max(0, scanned - 2_048));
    scanned = text.length;
    if (bytes >= HEAD_BYTES || /<\/head>/i.test(fresh) || PICTURE_TAG.test(fresh)) {
      await reader.cancel().catch(() => undefined);
      break;
    }
  }
  return text.slice(0, HEAD_BYTES);
}

/**
 * Pictures for headlines whose feed gave none (second review: The Hollywood
 * Reporter and IndieWire carry no image in their feeds, but every article
 * names one in its head). This reads an article's head for its picture only,
 * never its body, and stores nothing from it but the picture's address.
 * Off the request path: the pass calls it after recording, three at a time
 * through the press gate, each failing on its own. A row whose page answered
 * without a picture is marked `imageUrl = ""` ("looked, none") and never
 * asked again; one whose page did not answer stays null for the next pass.
 * `take` is the rows this pass just recorded without a picture plus
 * `PICTURE_BACKFILL` older ones, newest first.
 */
export async function lookUpPictures(take: number, read: (url: string) => Promise<string | null> = fetchHead) {
  if (take <= 0) return { asked: 0, found: 0 };
  const rows = await db.newsItem.findMany({
    where: { subject: "press", imageUrl: null, link: { not: null } },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take,
    select: { id: true, link: true },
  });
  const found = await mapLimit(rows, 3, async (row) => {
    const html = await read(row.link!).catch(() => null);
    if (html === null) return false;
    const picture = ogImageOf(html, row.link!);
    // "Looked, none" only for the article's own head: one that names no og: tag at all is a consent or bot page, asked again next pass.
    if (!picture && !isArticleHead(html)) return false;
    await db.newsItem.update({ where: { id: row.id }, data: { imageUrl: picture ?? "" } }).catch(() => undefined);
    return picture !== null;
  });
  return { asked: rows.length, found: found.filter(Boolean).length };
}

/**
 * Every feed anyone here reads: the instance's, then each own feed someone
 * has switched on, once per address however many people added it (an
 * address the instance already reads is read once, as the instance's).
 */
export async function pressFeeds(): Promise<Feed[]> {
  const instance = feedList();
  const seen = new Set(instance.map((f) => f.url));
  const own = await db.userFeed
    .findMany({ where: { enabled: true }, select: { url: true, name: true }, orderBy: { addedAt: "asc" } })
    .catch(() => []);
  const out: Feed[] = [...instance];
  for (const f of own) {
    if (seen.has(f.url)) continue;
    seen.add(f.url);
    out.push({ url: f.url, name: f.name, own: true });
  }
  return out;
}

/**
 * Rows stored before Round 10, once: classified by their headline, and given
 * the feed they came from where the instance has one feed under their
 * source's name (a feed's own name, or, for an unnamed one, the name its
 * title gave it on this pass). A row whose name matches no feed keeps a null
 * `feedUrl`, which the page treats as the instance's, and goes with the
 * thirty-day prune.
 */
async function backfillPress(named: Map<string, string>) {
  const unclassified = await db.newsItem.findMany({ where: { subject: "press", tag: null }, select: { id: true, headline: true } });
  for (const row of unclassified) {
    await db.newsItem.update({ where: { id: row.id }, data: { tag: classifyHeadline(row.headline) ?? "" } }).catch(() => undefined);
  }
  for (const [source, url] of named) {
    await db.newsItem.updateMany({ where: { subject: "press", feedUrl: null, source }, data: { feedUrl: url } }).catch(() => undefined);
  }
}

const passes = globalThis as unknown as { trekkerPressPassAt?: number };

/** When a pass last finished reading feeds, in memory; null since a restart. */
export function pressPassAt(): number | null {
  return passes.trekkerPressPassAt ?? null;
}

/**
 * The pass's part: every feed, one at a time, each failing on its own.
 * Titles to match against are read once for the whole pass. Rows from before
 * Round 10 are brought up to date as it goes (`backfillPress`).
 */
export async function runPressPass(now = new Date(), feeds?: Feed[]) {
  const list = feeds ?? (await pressFeeds());
  if (list.length === 0) return { feeds: 0, read: 0, added: 0 };
  const match = titleMatcher(await knownTitles().catch(() => []));
  // The first feed under each name: an old row by that name is filed under it.
  const named = new Map<string, string>();
  for (const f of list) if (f.name && !f.own && !named.has(f.name)) named.set(f.name, f.url);
  let pictureless = 0;
  const results = await mapLimit(list, 1, async (feed) => {
    const xml = await fetchFeed(feed.url);
    if (!xml) return null;
    const parsed = parseFeed(xml);
    const source = feed.name ?? sourceName(parsed.title, feed.url);
    if (!feed.own && !named.has(source)) named.set(source, feed.url);
    const drafts = pressDrafts(parsed.items, source, match, now, feed.url);
    pictureless += drafts.filter((d) => !d.imageUrl).length;
    return recordPress(drafts).catch(() => 0);
  });
  await backfillPress(named).catch(() => undefined);
  // The articles' own pictures for what came without one, after the feeds so no feed waits on an article.
  await lookUpPictures(pictureless + PICTURE_BACKFILL).catch(() => undefined);
  passes.trekkerPressPassAt = Date.now();
  return {
    feeds: list.length,
    read: results.filter((r) => r !== null).length,
    added: results.reduce<number>((sum, r) => sum + (r ?? 0), 0),
  };
}

/** The shorter reading window Settings offers; the other is the full thirty days. */
export const KEEP_CHOICES = [7, 30] as const;

/**
 * Housekeeping: press rows past thirty days, and an own feed's rows past the
 * longest window any of the people who added it keep (Settings › News, Keep
 * stories for). The instance's rows keep thirty days whatever anyone chose,
 * since everyone shares them; a shorter window only hides them.
 */
export async function prunePress(now = new Date()) {
  const { count } = await db.newsItem.deleteMany({ where: { subject: "press", at: { lt: new Date(now.getTime() - PRESS_DAYS * DAY_MS) } } });
  let own = 0;
  const feeds = await db.userFeed.findMany({ select: { url: true, user: { select: { newsKeepDays: true } } } }).catch(() => []);
  const longest = new Map<string, number>();
  for (const f of feeds) longest.set(f.url, Math.max(longest.get(f.url) ?? 0, f.user.newsKeepDays));
  const instance = new Set(feedList().map((f) => f.url));
  for (const [url, days] of longest) {
    if (days >= PRESS_DAYS || instance.has(url)) continue;
    const gone = await db.newsItem.deleteMany({ where: { subject: "press", feedUrl: url, at: { lt: new Date(now.getTime() - days * DAY_MS) } } });
    own += gone.count;
  }
  return count + own;
}

// ---------------------------------------------------------------------------
// Reading

export type PressRow = {
  id: string;
  headline: string;
  link: string;
  source: string;
  /** ISO. */
  at: string;
  imageUrl: string | null;
  match: { mediaType: "movie" | "tv"; tmdbId: number; title: string; poster: string | null } | null;
  /** Round 10: what the headline is about, the feed's summary line, and the feed. */
  tag: PressTag | null;
  summary: string | null;
  feedUrl: string | null;
};

const TAGS = new Set<string>(RULES.map(([tag]) => tag));

/**
 * Press rows, newest first. No read state; it is not counted anywhere.
 * `feeds` limits them to those feeds' rows (and the rows from before Round
 * 10 that name no feed, which only the instance's feeds wrote); without it,
 * every row, as the Popular tab had them. `since` is someone's reading window.
 */
export async function pressNews({ take = 80, feeds, since }: { take?: number; feeds?: string[]; since?: Date } = {}): Promise<PressRow[]> {
  const rows = await db.newsItem.findMany({
    where: {
      subject: "press",
      ...(feeds ? { OR: [{ feedUrl: { in: feeds } }, { feedUrl: null }] } : {}),
      ...(since ? { at: { gte: since } } : {}),
    },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take,
  });
  return rows.flatMap((r) =>
    r.link
      ? [
          {
            id: r.id,
            headline: r.headline,
            link: r.link,
            source: r.source ?? "News",
            at: r.at.toISOString(),
            // "" is "looked at the article, it names none" (`lookUpPictures`): no picture, as null is.
            imageUrl: r.imageUrl || null,
            match:
              r.tmdbId && r.title && (r.mediaType === "tv" || r.mediaType === "movie")
                ? { mediaType: r.mediaType, tmdbId: r.tmdbId, title: r.title, poster: r.image }
                : null,
            tag: r.tag && TAGS.has(r.tag) ? (r.tag as PressTag) : null,
            summary: r.summary,
            feedUrl: r.feedUrl,
          },
        ]
      : [],
  );
}
