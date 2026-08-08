import "server-only";
import { mapLimit } from "./concurrency";
import { db } from "./db";
import { heroColours } from "./palette";
import { isSource, type SourceId } from "./screensaver-options";
import { getWeather, type Weather } from "./weather";
import {
  getSlideFacts,
  img,
  popular,
  tmdbConfigured,
  topRated,
  trending,
  type MediaType,
  type NormalisedItem,
} from "./tmdb";

/**
 * The screensaver's contents.
 *
 * What separates this from every other list in the app is what it is looked at
 * from: across a room, for a second at a time, by somebody who did not open it.
 * So a slide carries far less than a card does — one picture, the title's own
 * lettering, and the three or four facts that survive being read at four metres
 * — and far more of it is fetched up front, because there is nobody there to
 * wait for a spinner.
 */

export type Slide = {
  id: number;
  mediaType: MediaType;
  title: string;
  /** The film's own lettering, when TMDB has it. The heading stays either way. */
  logo: string | null;
  /** Width ÷ height of that lettering, so it can be sized without measuring. */
  logoRatio: number | null;
  /** Always present: a title with no artwork is not a slide. */
  backdrop: string;
  /**
   * The film's own colour, as `"r g b"` — ready to drop into an `rgb(… / …)`
   * so the caller can choose its own strength. Null where the artwork could not
   * be sampled, which simply means no glow rather than no slide.
   */
  bloom: string | null;
  year: string | null;
  /** Out of 100, as the rest of the app counts scores. */
  score: number;
  tagline: string | null;
  overview: string;
  genres: string[];
  runtime: number | null;
  seasons: number | null;
};

export type Showcase = {
  slides: Slide[];
  weather: Weather | null;
};

/* ==========================================================================
 * Where the pictures come from
 * ======================================================================== */

// The option lists live in their own module so the settings card can read them
// too. Re-exported because every server-side caller already imports the rest of
// the screensaver from here, and there is no reason to make them care.
export {
  IDLE_CHOICES,
  SCREENSAVER_SOURCES,
  describeIdle,
  isSource,
  sourceLabel,
  type SourceId,
} from "./screensaver-options";

/** How many titles a run of the slideshow is built from. */
const SLIDES = 12;

/**
 * The watchlist as a slideshow.
 *
 * Rows here carry a poster and nothing else, so every one of them needs its
 * artwork looking up — which is why this takes a sample rather than the whole
 * list. Newest first, then shuffled, so a watchlist of two hundred does not show
 * the same dozen every evening and a watchlist of five still fills the loop.
 */
async function watchlistItems(userId: string): Promise<NormalisedItem[]> {
  const rows = await db.watchlistItem.findMany({
    where: { userId },
    orderBy: { addedAt: "desc" },
    take: 60,
    select: { tmdbId: true, mediaType: true, title: true, poster: true, score: true },
  });

  return shuffle(rows)
    .slice(0, SLIDES)
    .map((row) => ({
      id: row.tmdbId,
      mediaType: (row.mediaType === "tv" ? "tv" : "movie") as MediaType,
      title: row.title,
      poster: row.poster,
      // Not stored on the row, and filled in from the detail call below — a
      // watchlist entry knows what you want to watch, not what it looks like.
      backdrop: null,
      score: row.score ?? 0,
      year: null,
      overview: "",
    }));
}

async function sourceItems(source: SourceId, userId: string): Promise<NormalisedItem[]> {
  switch (source) {
    case "popular-movies":
      return popular("movie");
    case "popular-tv":
      return popular("tv");
    case "acclaimed": {
      // Interleaved rather than concatenated: "the best ever made" that opens
      // with twenty films before its first show is two lists, not one.
      const [films, shows] = await Promise.all([topRated("movie"), topRated("tv")]);
      return interleave(films, shows);
    }
    case "watchlist":
      return watchlistItems(userId);
    case "trending":
    default:
      return trending("all", "week");
  }
}

/* ==========================================================================
 * Building the run
 * ======================================================================== */

/**
 * Everything the screensaver draws, in one call.
 *
 * Fails soft the whole way down. No TMDB key means no slides and a screensaver
 * that is a clock on a black field, which is still a screensaver; a title whose
 * detail call fails keeps the picture and loses the lettering; the weather is
 * missing whenever it is not set up or the forecast did not answer.
 */
export async function getShowcase(userId: string): Promise<Showcase> {
  const account = await db.user.findUnique({
    where: { id: userId },
    select: {
      screensaverSource: true,
      screensaverPlace: true,
      screensaverLat: true,
      screensaverLon: true,
      // Only for the thermometer's unit — their own region decides °C or °F.
      region: true,
    },
  });

  const stored = account?.screensaverSource ?? "";
  const source: SourceId = isSource(stored) ? stored : "trending";

  const [slides, weather] = await Promise.all([
    buildSlides(source, userId),
    account?.screensaverPlace && account.screensaverLat !== null && account.screensaverLon !== null
      ? getWeather(
          account.screensaverLat,
          account.screensaverLon,
          account.screensaverPlace,
          account.region ?? undefined,
        ).catch(() => null)
      : null,
  ]);

  return { slides, weather };
}

async function buildSlides(source: SourceId, userId: string): Promise<Slide[]> {
  if (!tmdbConfigured()) return [];

  const items = await sourceItems(source, userId).catch(() => []);

  /**
   * Only what has a picture, and only one of each.
   *
   * "Trending all" returns the same show twice often enough to notice — once
   * from the week's list and once as a recommendation off the back of it — and
   * on a slideshow that reads as the thing having got stuck.
   */
  const seen = new Set<string>();
  const chosen = items
    .filter((item) => {
      const key = `${item.mediaType}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, SLIDES);

  const built = await mapLimit(chosen, 4, async (item) => {
    const facts = await getSlideFacts(item.mediaType, item.id).catch(() => null);

    // The watchlist path arrives here with no artwork at all, so the detail call
    // is where its picture comes from as well as its lettering.
    const path = item.backdrop ?? facts?.backdrop ?? null;
    const backdrop = img.backdrop(path, "w1280");
    if (!backdrop) return null;

    /**
     * The same sampler the title pages use, put to a different purpose: there it
     * decides what colour the page continues in below the artwork, here it is
     * what the room glows. The bottom third of the frame is the right strip for
     * both — it is where the hero's fade begins there, and where the light comes
     * from here.
     *
     * Memoised per path inside `palette.ts`, and the fetch behind it is cached
     * by Next for a month, so a rebuilt run of the same dozen titles costs
     * nothing at all.
     */
    const colours = await heroColours(path).catch(() => null);

    return {
      id: item.id,
      mediaType: item.mediaType,
      title: facts?.title ?? item.title,
      logo: img.logo(facts?.logo?.path, "w500"),
      logoRatio: facts?.logo?.ratio ?? null,
      backdrop,
      bloom: toBloom(colours?.edge),
      year: item.year ?? facts?.year ?? null,
      score: item.score || facts?.score || 0,
      tagline: facts?.tagline ?? null,
      overview: item.overview || facts?.overview || "",
      genres: facts?.genres ?? [],
      runtime: facts?.runtime ?? null,
      seasons: facts?.seasons ?? null,
    } satisfies Slide;
  });

  return built.filter((slide): slide is Slide => slide !== null);
}

/* ==========================================================================
 * Small helpers
 * ======================================================================== */

/**
 * The sampled colour, made safe to glow with.
 *
 * `heroColours` hands back the artwork's honest average, which is the right
 * answer for the job it was written for and the wrong one for this: the glow is
 * screen-blended, so a snowy establishing shot would come back as near-white and
 * wash the bottom of the screen out from under the title. Scaling every channel
 * so the brightest lands at a fixed ceiling keeps the hue and the relationship
 * between the channels — which is all anybody perceives here — while putting a
 * hard cap on how much light it can add.
 *
 * A pure black frame stays black, and correctly: no light, no glow.
 */
const BLOOM_CEILING = 176;

function toBloom(hex: string | undefined): string | null {
  if (!hex || !/^#[0-9a-f]{6}$/i.test(hex)) return null;

  const channels = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
  const brightest = Math.max(...channels);
  if (brightest === 0) return null;

  // Only ever turned down. A dim frame glows dimly, which is the truth about it.
  const scale = Math.min(1, BLOOM_CEILING / brightest);
  return channels.map((value) => Math.round(value * scale)).join(" ");
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function interleave<T>(a: T[], b: T[]): T[] {
  const out: T[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}
