/**
 * The questions "What to watch" asks, and nothing that touches a server.
 *
 * Split from `what-to-watch.ts` — which is `server-only` — for the same reason
 * `genres.ts` was split from `catalogue.ts`: the wizard renders the options and
 * the search scores against them, so both sides need the same list and neither
 * should have to import the other's dependencies to get it.
 *
 * Everything here is deliberately data rather than components. The wizard is one
 * loop over these lists, which is what keeps four screens from being four
 * near-identical files.
 */

/* -- Genre ids, named ------------------------------------------------------
 *
 * TMDB keeps separate lists per medium and the ids overlap, so a recipe below
 * always names both. `GENRES` in `genres.ts` only carries the dozen that have a
 * tile on the discover page; a mood is a finer thing than a genre and needs the
 * ones that never got a tile — Adventure, Fantasy and History in particular. */

const MOVIE = {
  action: 28,
  adventure: 12,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  fantasy: 14,
  history: 36,
  horror: 27,
  music: 10402,
  mystery: 9648,
  romance: 10749,
  scifi: 878,
  thriller: 53,
  war: 10752,
} as const;

const TV = {
  actionAdventure: 10759,
  animation: 16,
  comedy: 35,
  crime: 80,
  documentary: 99,
  drama: 18,
  family: 10751,
  kids: 10762,
  mystery: 9648,
  scifiFantasy: 10765,
  reality: 10764,
  soap: 10766,
  warPolitics: 10768,
} as const;

export type QuestionId = "who" | "vibe" | "kind" | "time";

/** The order the wizard walks them in. One page each. */
export const QUESTION_ORDER: QuestionId[] = ["who", "vibe", "kind", "time"];

export type Choice = {
  value: string;
  emoji: string;
  label: string;
  /** One line under the label, for options whose difference is not obvious. */
  hint?: string;
};

/* -- What a mood is made of ------------------------------------------------
 *
 * The distinction between `require` and `prefer` is the whole reason the picks
 * are any good.
 *
 * `require` is AND-ed into the TMDB query, so nothing without those genres is
 * ever a candidate. `prefer` is never filtered on at all — it only decides how
 * *good an example* of the mood a candidate is, once the pool exists.
 *
 * Everything used to be one OR-ed list, and the results were exactly what you
 * would expect: "romantic and warm" was Romance OR Comedy OR Drama, Drama
 * matched half of cinema, and the ranking handed back The Godfather. Requiring
 * the genre that actually names the mood is what fixed it.
 */
export type Recipe = {
  require: number[];
  prefer: number[];
  /**
   * TMDB keyword ids, AND-ed alongside the genres, for the moods no genre
   * describes. Television has no Horror genre at all — the whole category is
   * filed under Mystery, which is mostly police procedurals — so the keyword is
   * the only thing that finds Stranger Things rather than CSI. `catalogue.ts`
   * reaches for the same id for the same reason.
   */
  keywords?: number[];
};

/** TMDB's "horror" keyword, which is what stands in for the missing TV genre. */
const HORROR_KEYWORD = 315058;

/**
 * Genre ids back to words, lower-case and ready to sit mid-sentence.
 *
 * Only the results page uses these, and only to describe a title in its own
 * terms — "a 1960 horror with a thriller edge" rather than the same generic
 * line under every card. The two id spaces overlap and agree wherever they do,
 * so one map covers both mediums.
 */
export const GENRE_NAMES: Record<number, string> = {
  // Shared between films and television.
  16: "animation",
  35: "comedy",
  80: "crime",
  99: "documentary",
  18: "drama",
  9648: "mystery",
  10751: "family",
  37: "western",
  // Films only.
  28: "action",
  12: "adventure",
  14: "fantasy",
  27: "horror",
  36: "history",
  53: "thriller",
  878: "science fiction",
  10402: "music",
  10749: "romance",
  10752: "war",
  10770: "TV film",
  // Television only.
  10759: "action and adventure",
  10762: "kids",
  10763: "news",
  10764: "reality",
  10765: "sci-fi and fantasy",
  10766: "soap",
  10767: "talk",
  10768: "war and politics",
};

export type Vibe = Choice & {
  movie: Recipe;
  tv: Recipe;
  /** How the mood reads mid-sentence: "…lands square on <blurb>". */
  blurb: string;
  /** Release-year bounds, for the moods that are really about an era. */
  from?: number;
  to?: number;
  /** TMDB original-language code, for moods that are about where it came from. */
  language?: string;
  /** Kept behind "show more moods" — the first four are the obvious ones. */
  extra?: boolean;
};

/* -- Who is on the sofa ---------------------------------------------------- */

export type AudienceId = "solo" | "partner" | "family" | "friends";

export type Audience = Choice & {
  value: AudienceId;
  /** The eyebrow carried over every question after this one. */
  eyebrow: string;
  /** The heading of the vibe question, phrased for this audience. */
  vibeQuestion: string;
  /** Opens the reason line under a pick: "<lead>, and it …". */
  reasonLead: string;
  vibes: Vibe[];
  /** Genres to keep out entirely, whatever the mood. */
  withoutMovieGenres?: number[];
  withoutTvGenres?: number[];
};

export const AUDIENCES: Audience[] = [
  {
    value: "solo",
    emoji: "🧘",
    label: "Just me",
    eyebrow: "A night in",
    vibeQuestion: "What are you in the mood for?",
    reasonLead: "For a night in on your own",
    vibes: [
      {
        value: "unwind",
        emoji: "🛋️",
        label: "Switch off",
        blurb: "easy, undemanding company",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.animation, MOVIE.family] },
        tv: { require: [TV.comedy], prefer: [TV.animation] },
      },
      {
        value: "clever",
        emoji: "🧠",
        label: "Something clever",
        blurb: "the kind of thing you think about afterwards",
        movie: { require: [MOVIE.mystery], prefer: [MOVIE.scifi, MOVIE.drama, MOVIE.thriller] },
        tv: { require: [TV.mystery], prefer: [TV.drama, TV.scifiFantasy] },
      },
      {
        value: "edge",
        emoji: "😰",
        label: "On the edge",
        blurb: "tense and unsettling",
        // Deliberately not horror: this is the one that is *tense*, and the
        // thriller genre is what finds Se7en and Prisoners rather than a
        // haunting. "Properly scary" below is the other half of that.
        movie: { require: [MOVIE.thriller], prefer: [MOVIE.crime, MOVIE.mystery] },
        tv: { require: [TV.crime], prefer: [TV.mystery, TV.drama] },
      },
      {
        value: "scary",
        emoji: "👻",
        label: "Properly scary",
        blurb: "horror, with the lights off",
        movie: { require: [MOVIE.horror], prefer: [MOVIE.thriller, MOVIE.mystery] },
        tv: { require: [], prefer: [TV.drama, TV.mystery], keywords: [HORROR_KEYWORD] },
      },
      {
        value: "feelings",
        emoji: "🥲",
        label: "A proper cry",
        blurb: "something that actually lands",
        movie: { require: [MOVIE.drama], prefer: [MOVIE.romance, MOVIE.history, MOVIE.music] },
        tv: { require: [TV.drama], prefer: [TV.soap] },
      },
      {
        value: "nostalgia",
        emoji: "🕰️",
        label: "Nostalgia trip",
        blurb: "something from back when",
        to: 2004,
        movie: { require: [], prefer: [MOVIE.comedy, MOVIE.adventure, MOVIE.action] },
        tv: { require: [], prefer: [TV.comedy, TV.drama] },
        extra: true,
      },
      {
        value: "learn",
        emoji: "🔭",
        label: "Learn something",
        blurb: "a real story, properly told",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.history] },
        tv: { require: [TV.documentary], prefer: [] },
        extra: true,
      },
      {
        value: "elsewhere",
        emoji: "🛸",
        label: "Somewhere else entirely",
        blurb: "a world with its own rules",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.fantasy, MOVIE.adventure] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.actionAdventure] },
        extra: true,
      },
      {
        value: "animated",
        emoji: "🎨",
        label: "Drawn, not filmed",
        blurb: "animation for grown-ups as much as anyone",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.adventure, MOVIE.fantasy] },
        tv: { require: [TV.animation], prefer: [TV.comedy] },
        extra: true,
      },
      {
        value: "loud",
        emoji: "💥",
        label: "Big and loud",
        blurb: "something with a bit of noise in it",
        movie: { require: [MOVIE.action], prefer: [MOVIE.adventure, MOVIE.thriller] },
        tv: { require: [TV.actionAdventure], prefer: [TV.crime] },
        extra: true,
      },
    ],
  },
  {
    value: "partner",
    emoji: "❤️",
    label: "Partner",
    eyebrow: "Date night",
    vibeQuestion: "What's the vibe with your partner?",
    reasonLead: "For date night",
    vibes: [
      {
        value: "romantic",
        emoji: "❤️",
        label: "Romantic & warm",
        blurb: "romance, and warmth with it",
        movie: { require: [MOVIE.romance], prefer: [MOVIE.comedy, MOVIE.drama] },
        // TMDB has no Romance genre for television at all, so the closest
        // honest thing is a drama that is also a comedy — the warm end of the
        // schedule rather than the bleak one.
        tv: { require: [TV.drama, TV.comedy], prefer: [TV.family] },
      },
      {
        value: "adventurous",
        emoji: "🗺️",
        label: "Adventurous",
        blurb: "somewhere big, with somewhere to go",
        movie: { require: [MOVIE.adventure], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.scifiFantasy] },
      },
      {
        value: "tense",
        emoji: "🔥",
        label: "Tense & gripping",
        blurb: "tense enough that nobody reaches for their phone",
        movie: { require: [MOVIE.thriller], prefer: [MOVIE.crime, MOVIE.mystery] },
        tv: { require: [TV.crime], prefer: [TV.mystery, TV.drama] },
      },
      {
        value: "funny",
        emoji: "😆",
        label: "Light & funny",
        blurb: "light and genuinely funny",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.romance, MOVIE.family] },
        tv: { require: [TV.comedy], prefer: [] },
      },
      {
        value: "epic",
        emoji: "🏔️",
        label: "Sweeping & epic",
        blurb: "the kind of thing that fills the room",
        movie: { require: [MOVIE.drama, MOVIE.history], prefer: [MOVIE.war, MOVIE.adventure] },
        tv: { require: [TV.drama], prefer: [TV.warPolitics, TV.scifiFantasy] },
        extra: true,
      },
      {
        value: "strange",
        emoji: "🌀",
        label: "Strange & beautiful",
        blurb: "something you will still be arguing about on Sunday",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.mystery, MOVIE.fantasy, MOVIE.drama] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.mystery] },
        extra: true,
      },
      {
        value: "classic",
        emoji: "🎞️",
        label: "An old favourite",
        blurb: "one from before either of you had a streaming account",
        to: 1999,
        movie: { require: [], prefer: [MOVIE.romance, MOVIE.comedy, MOVIE.drama] },
        tv: { require: [], prefer: [TV.comedy, TV.drama] },
        extra: true,
      },
      {
        value: "truestory",
        emoji: "📖",
        label: "A true story",
        blurb: "something that actually happened",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.history, MOVIE.music] },
        tv: { require: [TV.documentary], prefer: [TV.crime] },
        extra: true,
      },
    ],
  },
  {
    value: "family",
    emoji: "👨‍👩‍👧‍👦",
    label: "Family",
    eyebrow: "Family night",
    vibeQuestion: "What suits the whole room?",
    reasonLead: "For the whole sofa",
    // Nothing here needs a certification lookup to know it does not belong on a
    // family night, and TMDB's certification data is patchy enough that
    // filtering on it would cost far more results than these two lines do.
    withoutMovieGenres: [MOVIE.horror, MOVIE.war],
    withoutTvGenres: [],
    vibes: [
      {
        value: "allages",
        emoji: "🎈",
        label: "Fun for all ages",
        blurb: "something everyone can sit through",
        movie: { require: [MOVIE.family], prefer: [MOVIE.animation, MOVIE.comedy] },
        tv: { require: [TV.family], prefer: [TV.animation, TV.comedy] },
      },
      {
        value: "adventure",
        emoji: "🧭",
        label: "Big adventure",
        blurb: "an adventure with somewhere to go",
        movie: { require: [MOVIE.adventure, MOVIE.family], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.family, TV.scifiFantasy] },
      },
      {
        value: "magical",
        emoji: "✨",
        label: "Magical",
        blurb: "a world with its own rules",
        movie: { require: [MOVIE.fantasy], prefer: [MOVIE.family, MOVIE.animation] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.family] },
      },
      {
        value: "laughs",
        emoji: "😂",
        label: "Laugh out loud",
        blurb: "silly in the best way",
        movie: { require: [MOVIE.comedy, MOVIE.family], prefer: [MOVIE.animation] },
        tv: { require: [TV.comedy], prefer: [TV.family, TV.animation] },
      },
      {
        value: "animated",
        emoji: "🎨",
        label: "Animated",
        blurb: "drawn rather than filmed",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.family, MOVIE.comedy] },
        tv: { require: [TV.animation], prefer: [TV.family, TV.kids] },
        extra: true,
      },
      {
        value: "heroes",
        emoji: "🦸",
        label: "Superheroes",
        blurb: "capes, and something to punch",
        movie: { require: [MOVIE.action, MOVIE.scifi], prefer: [MOVIE.adventure, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.scifiFantasy] },
        extra: true,
      },
      {
        value: "nature",
        emoji: "🐾",
        label: "Animals & nature",
        blurb: "the planet, filmed properly",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.family] },
        tv: { require: [TV.documentary], prefer: [TV.family, TV.kids] },
        extra: true,
      },
      {
        value: "oldschool",
        emoji: "📼",
        label: "One from your childhood",
        blurb: "the ones you grew up on",
        to: 2006,
        movie: { require: [MOVIE.family], prefer: [MOVIE.animation, MOVIE.adventure] },
        tv: { require: [TV.family], prefer: [TV.animation] },
        extra: true,
      },
    ],
  },
  {
    value: "friends",
    emoji: "🎉",
    label: "Friends",
    eyebrow: "Group night",
    vibeQuestion: "What's the room after?",
    reasonLead: "For a room full of people",
    vibes: [
      {
        value: "action",
        emoji: "💥",
        label: "Non-stop action",
        blurb: "loud enough to talk over and still follow",
        movie: { require: [MOVIE.action], prefer: [MOVIE.adventure, MOVIE.thriller] },
        tv: { require: [TV.actionAdventure], prefer: [TV.crime] },
      },
      {
        value: "chaos",
        emoji: "🤣",
        label: "Comedy chaos",
        blurb: "the sort of comedy that plays better in a crowd",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.action, MOVIE.crime] },
        tv: { require: [TV.comedy], prefer: [] },
      },
      {
        value: "scary",
        emoji: "👻",
        label: "Something scary",
        blurb: "made for somebody to flinch next to you",
        movie: { require: [MOVIE.horror], prefer: [MOVIE.thriller, MOVIE.mystery] },
        // Was requiring the Mystery genre, which on television is very largely
        // detective shows — see the note on `Recipe.keywords`.
        tv: { require: [], prefer: [TV.drama, TV.scifiFantasy], keywords: [HORROR_KEYWORD] },
      },
      {
        value: "weird",
        emoji: "🌀",
        label: "Weird and wonderful",
        blurb: "strange in a way that starts an argument afterwards",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.fantasy, MOVIE.mystery, MOVIE.comedy] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.mystery, TV.comedy] },
      },
      {
        value: "heist",
        emoji: "💰",
        label: "Heists & cons",
        blurb: "a plan, and everything that goes wrong with it",
        movie: { require: [MOVIE.crime], prefer: [MOVIE.thriller, MOVIE.comedy, MOVIE.action] },
        tv: { require: [TV.crime], prefer: [TV.drama] },
        extra: true,
      },
      {
        value: "anime",
        emoji: "🍜",
        label: "Anime night",
        blurb: "something drawn, and from Japan",
        language: "ja",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.animation], prefer: [TV.actionAdventure, TV.scifiFantasy] },
        extra: true,
      },
      {
        value: "cult",
        emoji: "🍕",
        label: "Gloriously daft",
        blurb: "the kind nobody defends and everybody enjoys",
        to: 2009,
        movie: { require: [MOVIE.action], prefer: [MOVIE.scifi, MOVIE.horror, MOVIE.comedy] },
        tv: { require: [], prefer: [TV.comedy, TV.actionAdventure] },
        extra: true,
      },
      {
        value: "sport",
        emoji: "🏆",
        label: "Against the odds",
        blurb: "somebody winning something they should not have",
        movie: { require: [MOVIE.drama], prefer: [MOVIE.history, MOVIE.comedy] },
        tv: { require: [TV.documentary], prefer: [TV.drama] },
        extra: true,
      },
    ],
  },
];

/** The first four moods, or all of them once "show more" has been asked for. */
export function vibesFor(audience: Audience, showAll: boolean): Vibe[] {
  return showAll ? audience.vibes : audience.vibes.filter((vibe) => !vibe.extra);
}

/* -- Movie, show, or either ------------------------------------------------ */

export type KindId = "both" | "movie" | "tv";

export const KINDS: (Choice & { value: KindId })[] = [
  {
    value: "both",
    emoji: "🎞️",
    label: "Surprise me",
    hint: "Films and shows, whichever fits best",
  },
  { value: "movie", emoji: "🎬", label: "A movie", hint: "One sitting and it's done" },
  { value: "tv", emoji: "📺", label: "A show", hint: "Something to get into" },
];

/* -- How long you have -----------------------------------------------------
 *
 * The last question depends on the answer before it, because "how much time
 * have you got" is not a question about a series. An episode is forty minutes
 * whether you have an hour or the whole weekend, so asking a show-watcher to
 * choose between "a proper evening" and "all night if it's good" narrowed
 * precisely nothing — both answers produced the same query.
 *
 * So films are asked about *length* and shows are asked about *episode shape*,
 * which is the thing that actually varies and the thing TMDB can filter on.
 * "Surprise me" gets a question that means something to both.
 */

export type TimeChoice = Choice & {
  /** Longest film worth starting, in minutes. Null means no limit. */
  maxRuntime: number | null;
  /** Episode-length bounds, for the same answer. */
  minEpisode: number | null;
  maxEpisode: number | null;
  /** How the answer reads in a sentence: "fits the <phrase> you said you had". */
  phrase: string;
};

const MOVIE_TIMES: TimeChoice[] = [
  {
    value: "short",
    emoji: "⚡",
    label: "An hour and a half",
    hint: "Under 90 minutes",
    maxRuntime: 90,
    minEpisode: null,
    maxEpisode: null,
    phrase: "hour and a half",
  },
  {
    value: "standard",
    emoji: "🍿",
    label: "A proper evening",
    hint: "Up to about two hours",
    maxRuntime: 130,
    minEpisode: null,
    maxEpisode: null,
    phrase: "couple of hours",
  },
  {
    value: "long",
    emoji: "🌙",
    label: "As long as it takes",
    hint: "No limit — bring on the three-hour epic",
    maxRuntime: null,
    minEpisode: null,
    maxEpisode: null,
    phrase: "whole evening",
  },
];

const SHOW_TIMES: TimeChoice[] = [
  {
    value: "quick",
    emoji: "⚡",
    label: "Short episodes",
    hint: "Half an hour, two or three back to back",
    maxRuntime: null,
    minEpisode: null,
    maxEpisode: 35,
    phrase: "half-hour episodes",
  },
  {
    value: "hour",
    emoji: "🎬",
    label: "Hour-long episodes",
    hint: "The kind you settle into",
    maxRuntime: null,
    minEpisode: 40,
    maxEpisode: null,
    phrase: "hour-long episodes",
  },
  {
    value: "any",
    emoji: "🌙",
    label: "Doesn't matter",
    hint: "Whatever's good",
    maxRuntime: null,
    minEpisode: null,
    maxEpisode: null,
    phrase: "time you have",
  },
];

/**
 * "Surprise me" has to mean something to both mediums at once, so the answers
 * are phrased as the evening rather than the runtime, and each one carries a
 * film limit *and* an episode limit.
 */
const BOTH_TIMES: TimeChoice[] = [
  {
    value: "short",
    emoji: "⚡",
    label: "An hour or so",
    hint: "A short film, or a couple of short episodes",
    maxRuntime: 100,
    minEpisode: null,
    maxEpisode: 35,
    phrase: "hour or so",
  },
  {
    value: "standard",
    emoji: "🍿",
    label: "A proper evening",
    hint: "Two hours, give or take",
    maxRuntime: 130,
    minEpisode: null,
    maxEpisode: null,
    phrase: "couple of hours",
  },
  {
    value: "long",
    emoji: "🌙",
    label: "As long as it takes",
    hint: "No limit at all",
    maxRuntime: null,
    minEpisode: null,
    maxEpisode: null,
    phrase: "whole evening",
  },
];

export function timesFor(kind: KindId): TimeChoice[] {
  return kind === "movie" ? MOVIE_TIMES : kind === "tv" ? SHOW_TIMES : BOTH_TIMES;
}

export function timeQuestionFor(kind: KindId): string {
  return kind === "tv"
    ? "How long do you want each episode?"
    : "How much time have you got?";
}

/* -- Answers --------------------------------------------------------------- */

export type Answers = {
  who: AudienceId;
  vibe: string;
  kind: KindId;
  time: string;
};

export function findAudience(value: string | undefined): Audience | null {
  return AUDIENCES.find((a) => a.value === value) ?? null;
}

/** Vibes are only unique within an audience, so the audience comes first. */
export function findVibe(audience: Audience | null, value: string | undefined): Vibe | null {
  return audience?.vibes.find((v) => v.value === value) ?? null;
}

export function findKind(value: string | undefined) {
  return KINDS.find((k) => k.value === value) ?? null;
}

/** And a length answer only means anything against the medium it was asked for. */
export function findTime(kind: KindId | undefined, value: string | undefined) {
  if (!kind) return null;
  return timesFor(kind).find((t) => t.value === value) ?? null;
}

/**
 * The answers so far, and the first question still unanswered.
 *
 * Everything lives in the query string rather than in client state, so a
 * half-finished run is a link, the browser's back button steps back through the
 * questions for free, and the page itself stays a server component. An answer
 * that does not parse is treated as unanswered — which is also what makes a
 * hand-edited URL land somewhere sensible rather than on a blank screen.
 */
export function readAnswers(search: Record<string, string | undefined>): {
  audience: Audience | null;
  vibe: Vibe | null;
  kind: (Choice & { value: KindId }) | null;
  time: TimeChoice | null;
  /** Null once every question has been answered. */
  next: QuestionId | null;
} {
  const audience = findAudience(search.who);
  const vibe = findVibe(audience, search.vibe);
  const kind = findKind(search.kind);
  const time = findTime(kind?.value, search.time);

  const next: QuestionId | null = !audience
    ? "who"
    : !vibe
      ? "vibe"
      : !kind
        ? "kind"
        : !time
          ? "time"
          : null;

  return { audience, vibe, kind, time, next };
}

/** The answers as a query string, for linking on to the next step. */
export function toQuery(
  answers: Partial<Record<QuestionId, string>>,
  extra: Record<string, string | number | undefined> = {},
): string {
  const params = new URLSearchParams();
  for (const id of QUESTION_ORDER) {
    const value = answers[id];
    if (value) params.set(id, value);
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params.toString();
}
