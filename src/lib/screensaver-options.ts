/**
 * The screensaver's choices, and nothing that touches a server.
 *
 * Split out of `screensaver.ts` — which is `server-only` — because the settings
 * card is a client component and has to build the same two dropdowns the page
 * reads back. Same reasoning as `genres.ts` and `images.ts`: a list of options
 * has no business being locked to the server just because its neighbours are.
 */

export type SourceId =
  | "trending"
  | "popular-movies"
  | "popular-tv"
  | "acclaimed"
  | "watchlist";

export const SCREENSAVER_SOURCES: { id: SourceId; label: string; blurb: string }[] = [
  {
    id: "trending",
    label: "Trending this week",
    blurb: "Films and shows together, whatever everyone is watching.",
  },
  {
    id: "popular-movies",
    label: "Popular films",
    blurb: "The films drawing the biggest audiences at the moment.",
  },
  {
    id: "popular-tv",
    label: "Popular shows",
    blurb: "The shows drawing the biggest audiences at the moment.",
  },
  {
    id: "acclaimed",
    label: "The best ever made",
    blurb: "Highest rated of all time, films and shows in turn.",
  },
  {
    id: "watchlist",
    label: "Your watchlist",
    blurb: "The things you have been meaning to get to. A quiet reminder.",
  },
];

export function isSource(value: string): value is SourceId {
  return SCREENSAVER_SOURCES.some((source) => source.id === value);
}

export function sourceLabel(value: string) {
  return SCREENSAVER_SOURCES.find((source) => source.id === value)?.label ?? "Trending this week";
}

/**
 * How long the app may sit untouched before the screensaver takes over.
 *
 * A short list rather than a number field: the honest range runs from "a couple
 * of minutes" to "when I have clearly walked away", and a box you can type 0.5
 * into invites an answer nobody wants to live with. Zero is first and is the
 * default — it never starts on its own until somebody says it may.
 */
export const IDLE_CHOICES = [0, 2, 5, 10, 20, 30, 60] as const;

export function describeIdle(minutes: number) {
  if (minutes <= 0) return "Only when you start it";
  if (minutes === 60) return "After an hour";
  return `After ${minutes} minutes`;
}
