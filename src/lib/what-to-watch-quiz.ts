/**
 * The questions "What to watch" asks, and nothing that touches a server.
 *
 * Pure, because the question pages render the options and the search scores
 * against them: both sides need the same lists, and neither should import the
 * other's dependencies to get them. Everything is data rather than components,
 * so four screens are one loop over these lists rather than four files.
 *
 * Carried over from the current app with two changes. The order is who, what,
 * mood, time, as the approved mockups ask it: "a film or a show" is settled
 * before the mood, so the mood question can carry both earlier answers in its
 * eyebrow. And the emoji are gone; the moods have artwork instead.
 */

/* -- Genre ids, named ------------------------------------------------------
 *
 * TMDB keeps separate lists per medium and the ids overlap, so a recipe always
 * names both. `GENRES` in `genres.ts` carries only the genres a smart list or a
 * Discover tile can ask for; a mood is a finer thing and needs the ones that
 * never got a tile: History, Music and War in particular. */

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

export type QuestionId = "who" | "kind" | "vibe" | "time";

/** The order the questions are asked in, one page each. */
export const QUESTION_ORDER: QuestionId[] = ["who", "kind", "vibe", "time"];

export type Choice = {
  value: string;
  label: string;
  /** One line under the label, for options whose difference is not obvious. */
  hint?: string;
  /** How the answer reads in the line of answers so far: "Just me · a show". */
  short: string;
};

/* -- What a mood is made of ------------------------------------------------
 *
 * `require` is AND-ed into the TMDB query, so nothing without those genres is
 * ever a candidate. `prefer` is never filtered on: it only decides how good an
 * example of the mood a candidate is, once the pool exists.
 *
 * Everything used to be one OR-ed list, and "romantic and warm" was Romance OR
 * Comedy OR Drama; Drama matched half of cinema, and the ranking handed back
 * The Godfather. Requiring the genre that names the mood is what fixed it.
 */
export type Recipe = {
  require: number[];
  prefer: number[];
  /**
   * TMDB keyword ids, AND-ed alongside the genres, for moods no genre
   * describes. Television has no Horror genre: the whole category is filed
   * under Mystery, which is mostly police procedurals, so the keyword is the
   * only thing that finds Stranger Things rather than CSI.
   */
  keywords?: number[];
};

/** TMDB's "horror" keyword, which stands in for the missing television genre. */
const HORROR_KEYWORD = 315058;

/**
 * Genre ids back to words, lower-case and ready to sit mid-sentence. The two
 * id spaces overlap and agree wherever they do, so one map covers both.
 */
export const GENRE_NAMES: Record<number, string> = {
  16: "animation",
  35: "comedy",
  80: "crime",
  99: "documentary",
  18: "drama",
  9648: "mystery",
  10751: "family",
  37: "western",
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
};

/* -- Who is on the sofa ---------------------------------------------------- */

export type AudienceId = "solo" | "partner" | "family" | "friends";

export type Audience = Choice & {
  value: AudienceId;
  /** The evening this audience makes, for the results page's title. */
  eyebrow: string;
  /** The heading of the mood question, phrased for this audience. */
  vibeQuestion: string;
  /** Opens the reason line under a pick: "<lead>, and it …". */
  reasonLead: string;
  vibes: Vibe[];
  /** Genres to keep out entirely, whatever the mood. */
  withoutMovieGenres?: number[];
  withoutTvGenres?: number[];
};

/** A mood's own phrase in the answers line is its label, lower-cased. */
const vibe = (v: Omit<Vibe, "short">): Vibe => ({ ...v, short: v.label.toLowerCase() });

export const AUDIENCES: Audience[] = [
  {
    value: "solo",
    label: "Just me",
    hint: "A night in on your own",
    short: "Just me",
    eyebrow: "A night in",
    vibeQuestion: "What are you in the mood for?",
    reasonLead: "For a night in on your own",
    vibes: [
      vibe({
        value: "unwind",
        label: "Switch off",
        hint: "Easy, familiar, low stakes",
        blurb: "easy, undemanding company",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.animation, MOVIE.family] },
        tv: { require: [TV.comedy], prefer: [TV.animation] },
      }),
      vibe({
        value: "clever",
        label: "Something clever",
        hint: "Twists, ideas, a puzzle",
        blurb: "the kind of thing you think about afterwards",
        movie: { require: [MOVIE.mystery], prefer: [MOVIE.scifi, MOVIE.drama, MOVIE.thriller] },
        tv: { require: [TV.mystery], prefer: [TV.drama, TV.scifiFantasy] },
      }),
      vibe({
        value: "edge",
        label: "On the edge",
        hint: "Tense, nervy, thriller",
        blurb: "tense and unsettling",
        // Deliberately not horror: this is the tense one, and the thriller
        // genre finds Se7en and Prisoners rather than a haunting. "Properly
        // scary" is the other half of that.
        movie: { require: [MOVIE.thriller], prefer: [MOVIE.crime, MOVIE.mystery] },
        tv: { require: [TV.crime], prefer: [TV.mystery, TV.drama] },
      }),
      vibe({
        value: "scary",
        label: "Properly scary",
        hint: "Horror that means it",
        blurb: "horror, with the lights off",
        movie: { require: [MOVIE.horror], prefer: [MOVIE.thriller, MOVIE.mystery] },
        tv: { require: [], prefer: [TV.drama, TV.mystery], keywords: [HORROR_KEYWORD] },
      }),
      vibe({
        value: "feelings",
        label: "A proper cry",
        hint: "Feelings, big ones",
        blurb: "something that actually lands",
        movie: { require: [MOVIE.drama], prefer: [MOVIE.romance, MOVIE.history, MOVIE.music] },
        tv: { require: [TV.drama], prefer: [TV.soap] },
      }),
      vibe({
        value: "nostalgia",
        label: "Nostalgia trip",
        hint: "Something you half remember",
        blurb: "something from back when",
        to: 2004,
        movie: { require: [], prefer: [MOVIE.comedy, MOVIE.adventure, MOVIE.action] },
        tv: { require: [], prefer: [TV.comedy, TV.drama] },
      }),
      vibe({
        value: "animated",
        label: "Drawn, not filmed",
        hint: "Animation",
        blurb: "animation for grown-ups as much as anyone",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.adventure, MOVIE.fantasy] },
        tv: { require: [TV.animation], prefer: [TV.comedy] },
      }),
      vibe({
        value: "loud",
        label: "Big and loud",
        hint: "Action, spectacle",
        blurb: "something with a bit of noise in it",
        movie: { require: [MOVIE.action], prefer: [MOVIE.adventure, MOVIE.thriller] },
        tv: { require: [TV.actionAdventure], prefer: [TV.crime] },
      }),
      vibe({
        value: "learn",
        label: "Learn something",
        hint: "A real story, properly told",
        blurb: "a real story, properly told",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.history] },
        tv: { require: [TV.documentary], prefer: [] },
      }),
      vibe({
        value: "elsewhere",
        label: "Somewhere else entirely",
        hint: "A world with its own rules",
        blurb: "a world with its own rules",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.fantasy, MOVIE.adventure] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.actionAdventure] },
      }),
    ],
  },
  {
    value: "partner",
    label: "Partner",
    hint: "Date night",
    short: "The two of us",
    eyebrow: "Date night",
    vibeQuestion: "What's the vibe with your partner?",
    reasonLead: "For date night",
    vibes: [
      vibe({
        value: "romantic",
        label: "Romantic and warm",
        hint: "Romance, with warmth",
        blurb: "romance, and warmth with it",
        movie: { require: [MOVIE.romance], prefer: [MOVIE.comedy, MOVIE.drama] },
        // TMDB has no Romance genre for television, so the closest honest
        // thing is a drama that is also a comedy: the warm end of the schedule.
        tv: { require: [TV.drama, TV.comedy], prefer: [TV.family] },
      }),
      vibe({
        value: "adventurous",
        label: "Adventurous",
        hint: "Somewhere big to go",
        blurb: "somewhere big, with somewhere to go",
        movie: { require: [MOVIE.adventure], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.scifiFantasy] },
      }),
      vibe({
        value: "tense",
        label: "Tense and gripping",
        hint: "Nobody reaches for a phone",
        blurb: "tense enough that nobody reaches for their phone",
        movie: { require: [MOVIE.thriller], prefer: [MOVIE.crime, MOVIE.mystery] },
        tv: { require: [TV.crime], prefer: [TV.mystery, TV.drama] },
      }),
      vibe({
        value: "funny",
        label: "Light and funny",
        hint: "Genuinely funny",
        blurb: "light and genuinely funny",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.romance, MOVIE.family] },
        tv: { require: [TV.comedy], prefer: [] },
      }),
      vibe({
        value: "epic",
        label: "Sweeping and epic",
        hint: "Fills the room",
        blurb: "the kind of thing that fills the room",
        movie: { require: [MOVIE.drama, MOVIE.history], prefer: [MOVIE.war, MOVIE.adventure] },
        tv: { require: [TV.drama], prefer: [TV.warPolitics, TV.scifiFantasy] },
      }),
      vibe({
        value: "strange",
        label: "Strange and beautiful",
        hint: "Still arguing on Sunday",
        blurb: "something you will still be arguing about on Sunday",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.mystery, MOVIE.fantasy, MOVIE.drama] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.mystery] },
      }),
      vibe({
        value: "classic",
        label: "An old favourite",
        hint: "From before streaming",
        blurb: "one from before either of you had a streaming account",
        to: 1999,
        movie: { require: [], prefer: [MOVIE.romance, MOVIE.comedy, MOVIE.drama] },
        tv: { require: [], prefer: [TV.comedy, TV.drama] },
      }),
      vibe({
        value: "truestory",
        label: "A true story",
        hint: "It actually happened",
        blurb: "something that actually happened",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.history, MOVIE.music] },
        tv: { require: [TV.documentary], prefer: [TV.crime] },
      }),
    ],
  },
  {
    value: "family",
    label: "Family",
    hint: "Every age on the sofa",
    short: "The family",
    eyebrow: "Family night",
    vibeQuestion: "What suits the whole room?",
    reasonLead: "For the whole sofa",
    // Nothing here needs a certification lookup to know it does not belong on
    // a family night, and TMDB's certification data is patchy enough that
    // filtering on it would cost far more results than these two genres do.
    withoutMovieGenres: [MOVIE.horror, MOVIE.war],
    withoutTvGenres: [],
    vibes: [
      vibe({
        value: "allages",
        label: "Fun for all ages",
        hint: "Everyone can sit through it",
        blurb: "something everyone can sit through",
        movie: { require: [MOVIE.family], prefer: [MOVIE.animation, MOVIE.comedy] },
        tv: { require: [TV.family], prefer: [TV.animation, TV.comedy] },
      }),
      vibe({
        value: "adventure",
        label: "Big adventure",
        hint: "Somewhere to go",
        blurb: "an adventure with somewhere to go",
        movie: { require: [MOVIE.adventure, MOVIE.family], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.family, TV.scifiFantasy] },
      }),
      vibe({
        value: "magical",
        label: "Magical",
        hint: "A world with its own rules",
        blurb: "a world with its own rules",
        movie: { require: [MOVIE.fantasy], prefer: [MOVIE.family, MOVIE.animation] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.family] },
      }),
      vibe({
        value: "laughs",
        label: "Laugh out loud",
        hint: "Silly in the best way",
        blurb: "silly in the best way",
        movie: { require: [MOVIE.comedy, MOVIE.family], prefer: [MOVIE.animation] },
        tv: { require: [TV.comedy], prefer: [TV.family, TV.animation] },
      }),
      vibe({
        value: "animated",
        label: "Animated",
        hint: "Drawn, not filmed",
        blurb: "drawn rather than filmed",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.family, MOVIE.comedy] },
        tv: { require: [TV.animation], prefer: [TV.family, TV.kids] },
      }),
      vibe({
        value: "heroes",
        label: "Superheroes",
        hint: "Capes, and something to punch",
        blurb: "capes, and something to punch",
        movie: { require: [MOVIE.action, MOVIE.scifi], prefer: [MOVIE.adventure, MOVIE.fantasy] },
        tv: { require: [TV.actionAdventure], prefer: [TV.scifiFantasy] },
      }),
      vibe({
        value: "nature",
        label: "Animals and nature",
        hint: "The planet, filmed properly",
        blurb: "the planet, filmed properly",
        movie: { require: [MOVIE.documentary], prefer: [MOVIE.family] },
        tv: { require: [TV.documentary], prefer: [TV.family, TV.kids] },
      }),
      vibe({
        value: "oldschool",
        label: "One from your childhood",
        hint: "The ones you grew up on",
        blurb: "the ones you grew up on",
        to: 2006,
        movie: { require: [MOVIE.family], prefer: [MOVIE.animation, MOVIE.adventure] },
        tv: { require: [TV.family], prefer: [TV.animation] },
      }),
    ],
  },
  {
    value: "friends",
    label: "Friends",
    hint: "A room full of people",
    short: "Friends round",
    eyebrow: "Group night",
    vibeQuestion: "What's the room after?",
    reasonLead: "For a room full of people",
    vibes: [
      vibe({
        value: "action",
        label: "Non-stop action",
        hint: "Loud enough to talk over",
        blurb: "loud enough to talk over and still follow",
        movie: { require: [MOVIE.action], prefer: [MOVIE.adventure, MOVIE.thriller] },
        tv: { require: [TV.actionAdventure], prefer: [TV.crime] },
      }),
      vibe({
        value: "chaos",
        label: "Comedy chaos",
        hint: "Better in a crowd",
        blurb: "the sort of comedy that plays better in a crowd",
        movie: { require: [MOVIE.comedy], prefer: [MOVIE.action, MOVIE.crime] },
        tv: { require: [TV.comedy], prefer: [] },
      }),
      vibe({
        value: "scary",
        label: "Something scary",
        hint: "Someone will flinch",
        blurb: "made for somebody to flinch next to you",
        movie: { require: [MOVIE.horror], prefer: [MOVIE.thriller, MOVIE.mystery] },
        // Was requiring Mystery, which on television is very largely detective
        // shows; see the note on `Recipe.keywords`.
        tv: { require: [], prefer: [TV.drama, TV.scifiFantasy], keywords: [HORROR_KEYWORD] },
      }),
      vibe({
        value: "weird",
        label: "Weird and wonderful",
        hint: "Starts an argument",
        blurb: "strange in a way that starts an argument afterwards",
        movie: { require: [MOVIE.scifi], prefer: [MOVIE.fantasy, MOVIE.mystery, MOVIE.comedy] },
        tv: { require: [TV.scifiFantasy], prefer: [TV.mystery, TV.comedy] },
      }),
      vibe({
        value: "heist",
        label: "Heists and cons",
        hint: "A plan, and what goes wrong",
        blurb: "a plan, and everything that goes wrong with it",
        movie: { require: [MOVIE.crime], prefer: [MOVIE.thriller, MOVIE.comedy, MOVIE.action] },
        tv: { require: [TV.crime], prefer: [TV.drama] },
      }),
      vibe({
        value: "anime",
        label: "Anime night",
        hint: "Drawn, and from Japan",
        blurb: "something drawn, and from Japan",
        language: "ja",
        movie: { require: [MOVIE.animation], prefer: [MOVIE.action, MOVIE.fantasy] },
        tv: { require: [TV.animation], prefer: [TV.actionAdventure, TV.scifiFantasy] },
      }),
      vibe({
        value: "cult",
        label: "Gloriously daft",
        hint: "Nobody defends it",
        blurb: "the kind nobody defends and everybody enjoys",
        to: 2009,
        movie: { require: [MOVIE.action], prefer: [MOVIE.scifi, MOVIE.horror, MOVIE.comedy] },
        tv: { require: [], prefer: [TV.comedy, TV.actionAdventure] },
      }),
      vibe({
        value: "sport",
        label: "Against the odds",
        hint: "Winning what they should not",
        blurb: "somebody winning something they should not have",
        movie: { require: [MOVIE.drama], prefer: [MOVIE.history, MOVIE.comedy] },
        tv: { require: [TV.documentary], prefer: [TV.drama] },
      }),
    ],
  },
];

/**
 * Genres no mood ever wants from television. "Switch off, short episodes" was
 * returning The Late Show, which is funny and short, and not what anybody means.
 */
export const NEVER_TV = [10763, 10764, 10767]; // News, Reality, Talk

/**
 * The corner of the catalogue `include_adult=false` does not reach: TMDB flags
 * only outright pornography as adult, so a romance search leaks softcore and an
 * animation search leaks hentai.
 */
export const NEVER_KEYWORDS = [198385, 190370, 155477];

/* -- Film, show, or either ------------------------------------------------- */

export type KindId = "both" | "movie" | "tv";

export const KINDS: (Choice & { value: KindId })[] = [
  { value: "movie", label: "A film", hint: "One sitting and it's done", short: "a film" },
  { value: "tv", label: "A show", hint: "Something to get into", short: "a show" },
  { value: "both", label: "Surprise me", hint: "Films and shows, whichever fits best", short: "either" },
];

/* -- How long you have -----------------------------------------------------
 *
 * The last question depends on the answer before it, because "how much time
 * have you got" is not a question about a series: an episode is forty minutes
 * whether you have an hour or the weekend. Films are asked about length, shows
 * about episode shape, which is what varies and what TMDB can filter on, and
 * "Surprise me" gets a question that means something to both.
 */

export type TimeChoice = Choice & {
  /** Longest film worth starting, in minutes. Null means no limit. */
  maxRuntime: number | null;
  /** Episode-length bounds, for the same answer. */
  minEpisode: number | null;
  maxEpisode: number | null;
  /** How the answer reads in a sentence: "fits the <phrase> you asked for". */
  phrase: string;
};

const MOVIE_TIMES: TimeChoice[] = [
  { value: "short", label: "An hour and a half", hint: "Under 90 minutes", short: "an hour and a half", maxRuntime: 90, minEpisode: null, maxEpisode: null, phrase: "hour and a half" },
  { value: "standard", label: "A proper evening", hint: "Up to about two hours", short: "about two hours", maxRuntime: 130, minEpisode: null, maxEpisode: null, phrase: "couple of hours" },
  { value: "long", label: "As long as it takes", hint: "No limit: bring on the three-hour epic", short: "no limit", maxRuntime: null, minEpisode: null, maxEpisode: null, phrase: "whole evening" },
];

const SHOW_TIMES: TimeChoice[] = [
  { value: "quick", label: "Short episodes", hint: "Half an hour, two or three back to back", short: "half-hour episodes", maxRuntime: null, minEpisode: null, maxEpisode: 35, phrase: "half-hour episodes" },
  { value: "hour", label: "Hour-long episodes", hint: "The kind you settle into", short: "about an hour", maxRuntime: null, minEpisode: 40, maxEpisode: null, phrase: "hour-long episodes" },
  { value: "any", label: "Doesn't matter", hint: "Whatever's good", short: "any length", maxRuntime: null, minEpisode: null, maxEpisode: null, phrase: "time you have" },
];

const BOTH_TIMES: TimeChoice[] = [
  { value: "short", label: "An hour or so", hint: "A short film, or a couple of short episodes", short: "an hour or so", maxRuntime: 100, minEpisode: null, maxEpisode: 35, phrase: "hour or so" },
  { value: "standard", label: "A proper evening", hint: "Two hours, give or take", short: "about two hours", maxRuntime: 130, minEpisode: null, maxEpisode: null, phrase: "couple of hours" },
  { value: "long", label: "As long as it takes", hint: "No limit at all", short: "no limit", maxRuntime: null, minEpisode: null, maxEpisode: null, phrase: "whole evening" },
];

export function timesFor(kind: KindId): TimeChoice[] {
  return kind === "movie" ? MOVIE_TIMES : kind === "tv" ? SHOW_TIMES : BOTH_TIMES;
}

/** The answer that puts no limit on length, which the mood tiles' artwork is read under. */
export function openTime(kind: KindId): TimeChoice {
  return timesFor(kind)[2];
}

export function timeQuestionFor(kind: KindId): string {
  return kind === "tv" ? "How long do you want each episode?" : "How much time have you got?";
}

/* -- Answers --------------------------------------------------------------- */

export type Answers = Record<QuestionId, string>;

export function findAudience(value: string | undefined): Audience | null {
  return AUDIENCES.find((a) => a.value === value) ?? null;
}

/** Moods are only unique within an audience, so the audience comes first. */
export function findVibe(audience: Audience | null, value: string | undefined): Vibe | null {
  return audience?.vibes.find((v) => v.value === value) ?? null;
}

export function findKind(value: string | undefined) {
  return KINDS.find((k) => k.value === value) ?? null;
}

/** A length answer only means anything against the medium it was asked for. */
export function findTime(kind: KindId | undefined, value: string | undefined) {
  if (!kind) return null;
  return timesFor(kind).find((t) => t.value === value) ?? null;
}

export type Read = {
  audience: Audience | null;
  kind: (Choice & { value: KindId }) | null;
  vibe: Vibe | null;
  time: TimeChoice | null;
  /** The first question still unanswered, or null once all four are. */
  next: QuestionId | null;
};

/**
 * The answers so far, and the first question still unanswered.
 *
 * Everything lives in the query string rather than in client state, so a
 * half-finished run is a link, the browser's back button steps back through
 * the questions, and the page stays a server component. An answer is only
 * read when every answer before it stands: a mood left in the address after
 * the audience changed would belong to someone else's list of moods. An answer
 * that does not parse counts as unanswered, so a hand-edited address lands on
 * a question rather than on a blank screen.
 */
export function readAnswers(search: Record<string, string | string[] | undefined>): Read {
  const one = (k: string) => {
    const v = search[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const audience = findAudience(one("who"));
  const kind = audience ? findKind(one("kind")) : null;
  const vibe = kind ? findVibe(audience, one("vibe")) : null;
  const time = vibe ? findTime(kind?.value, one("time")) : null;
  const next: QuestionId | null = !audience ? "who" : !kind ? "kind" : !vibe ? "vibe" : !time ? "time" : null;
  return { audience, kind, vibe, time, next };
}

/** The answers that stand, as values, in question order. */
export function answered(read: Read): Partial<Answers> {
  const out: Partial<Answers> = {};
  if (read.audience) out.who = read.audience.value;
  if (read.kind) out.kind = read.kind.value;
  if (read.vibe) out.vibe = read.vibe.value;
  if (read.time) out.time = read.time.value;
  return out;
}

/** Answers as a query string, in question order, with anything extra after. */
export function toQuery(answers: Partial<Answers>, extra: Record<string, string | number | undefined> = {}): string {
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

export const QUIZ_PATH = "/discover/what-to-watch";
export const RESULTS_PATH = "/discover/what-to-watch/results";

/**
 * The question page that asks `question`, with every answer before it kept and
 * the rest dropped. `was` is the answer it had, shown chosen again rather than
 * counted as given: going back to a question is usually to look, not to wipe it.
 */
export function questionHref(answers: Partial<Answers>, question: QuestionId, was?: string): string {
  const kept: Partial<Answers> = {};
  for (const id of QUESTION_ORDER) {
    if (id === question) break;
    kept[id] = answers[id];
  }
  const query = toQuery(kept, { was });
  return query ? `${QUIZ_PATH}?${query}` : QUIZ_PATH;
}

/**
 * Where answering `question` with `value` leads: the next question, or the
 * results once it was the last. Answers after this one are dropped, since the
 * audience decides the moods and the medium decides the time question.
 */
export function answerHref(answers: Partial<Answers>, question: QuestionId, value: string): string {
  const index = QUESTION_ORDER.indexOf(question);
  const kept: Partial<Answers> = {};
  for (const id of QUESTION_ORDER.slice(0, index)) kept[id] = answers[id];
  kept[question] = value;
  return index === QUESTION_ORDER.length - 1 ? `${RESULTS_PATH}?${toQuery(kept)}` : `${QUIZ_PATH}?${toQuery(kept)}`;
}

/** The in-page Back: the question before this one, or Discover from the first. */
export function backHref(answers: Partial<Answers>, question: QuestionId): string {
  const index = QUESTION_ORDER.indexOf(question);
  const previous = QUESTION_ORDER[index - 1];
  return index <= 0 ? "/discover" : questionHref(answers, previous, answers[previous]);
}

/**
 * The answers so far as one line, "Just me · a show · something clever":
 * the eyebrow each question after the first carries, and the results' line.
 */
export function answersLine(read: Read): string {
  return [read.audience, read.kind, read.vibe, read.time]
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .map((c) => c.short)
    .join(" · ");
}
