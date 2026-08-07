import type { Tier } from "./catalogue";

/**
 * Named franchises, each worth a badge of its own.
 *
 * The generic "Completionist" badge already rewards finishing *a* franchise,
 * whichever one. These are the ones worth naming — the series people set out to
 * work through on purpose.
 *
 * Membership is decided one of two ways. Most are a TMDB collection, and a film
 * counts if its cached `collectionId` matches, which costs nothing at all: the
 * achievements page already caches that on every watched film. A few are not a
 * TMDB collection in any usable form, so they carry an explicit list of film ids
 * instead.
 *
 * `total` is the number of films released at the time of writing, verified
 * against TMDB rather than guessed. When a new entry comes out, bump it — a
 * stale number only means the badge lands one film early, never that it breaks.
 */
export type NamedFranchise = {
  /** Becomes the achievement id, prefixed with `franchise-`. */
  id: string;
  name: string;
  /** How the franchise is referred to in the description. */
  label: string;
  tier: Tier;
  icon: string;
  total: number;
  /** TMDB collection id, for the ones that are a collection. */
  collectionId?: number;
  /** Explicit film ids, for the ones that are not. */
  filmIds?: number[];
};

/**
 * The Infinity Saga rather than "the MCU": the MCU is not a TMDB collection, and
 * its keyword drags in one-shots, Groot shorts and holiday specials that nobody
 * counts. The twenty-three films from *Iron Man* to *Far From Home* are a closed
 * set that will never need updating.
 */
const INFINITY_SAGA = [
  1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899,
  271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534, 429617,
];

export const FRANCHISES: NamedFranchise[] = [
  // -- The wizarding, the ringed and the far away ---------------------------
  {
    id: "harry-potter",
    name: "The Boy Who Lived",
    label: "Harry Potter",
    tier: "gold",
    icon: "sparkles",
    collectionId: 1241,
    total: 8,
  },
  {
    id: "lord-of-the-rings",
    name: "There and Back Again",
    label: "The Lord of the Rings",
    tier: "silver",
    icon: "boxes",
    collectionId: 119,
    total: 3,
  },
  {
    id: "star-wars",
    name: "The Whole Saga",
    label: "Star Wars",
    tier: "gold",
    icon: "rocket",
    collectionId: 10,
    total: 9,
  },
  {
    id: "infinity-saga",
    name: "The Infinity Saga",
    label: "the Marvel Cinematic Universe, Iron Man to Far From Home",
    tier: "legend",
    icon: "award",
    filmIds: INFINITY_SAGA,
    total: INFINITY_SAGA.length,
  },

  // -- October's shelf ------------------------------------------------------
  {
    id: "conjuring",
    name: "Based on a True Story",
    label: "The Conjuring",
    tier: "bronze",
    icon: "ghost",
    collectionId: 313086,
    total: 4,
  },
  {
    id: "insidious",
    name: "Into the Further",
    label: "Insidious",
    tier: "silver",
    icon: "ghost",
    collectionId: 228446,
    total: 5,
  },
  {
    id: "saw",
    name: "Do You Want to Play a Game",
    label: "Saw",
    tier: "gold",
    icon: "ghost",
    collectionId: 656,
    total: 10,
  },
  {
    id: "halloween",
    name: "The Night He Came Home",
    label: "Halloween",
    tier: "gold",
    icon: "ghost",
    collectionId: 91361,
    total: 11,
  },
  {
    id: "scream",
    name: "What's Your Favourite Scary Movie",
    label: "Scream",
    tier: "silver",
    icon: "ghost",
    collectionId: 2602,
    total: 7,
  },
  {
    id: "paranormal-activity",
    name: "Caught on Camera",
    label: "Paranormal Activity",
    tier: "silver",
    icon: "ghost",
    collectionId: 41437,
    total: 7,
  },
  {
    id: "alien",
    name: "In Space No One Can Hear You",
    label: "Alien",
    tier: "bronze",
    icon: "rocket",
    collectionId: 8091,
    total: 4,
  },

  // -- The blockbusters -----------------------------------------------------
  {
    id: "james-bond",
    name: "Licence to Complete",
    label: "James Bond",
    tier: "legend",
    icon: "award",
    collectionId: 645,
    total: 26,
  },
  {
    id: "fast-and-furious",
    name: "Family",
    label: "The Fast and the Furious",
    tier: "gold",
    icon: "boxes",
    collectionId: 9485,
    total: 10,
  },
  {
    id: "mission-impossible",
    name: "Your Mission, Accepted",
    label: "Mission: Impossible",
    tier: "gold",
    icon: "boxes",
    collectionId: 87359,
    total: 8,
  },
  {
    id: "jurassic-park",
    name: "Life Finds a Way",
    label: "Jurassic Park",
    tier: "silver",
    icon: "boxes",
    collectionId: 328,
    total: 7,
  },
  {
    id: "indiana-jones",
    name: "It Belongs in a Museum",
    label: "Indiana Jones",
    tier: "silver",
    icon: "boxes",
    collectionId: 84,
    total: 5,
  },
  {
    id: "john-wick",
    name: "The Boogeyman",
    label: "John Wick",
    tier: "bronze",
    icon: "boxes",
    collectionId: 404609,
    total: 4,
  },
  {
    id: "matrix",
    name: "All of the Pills",
    label: "The Matrix",
    tier: "bronze",
    icon: "rocket",
    collectionId: 2344,
    total: 4,
  },
  {
    id: "terminator",
    name: "Come With Me If You Want to Live",
    label: "The Terminator",
    tier: "silver",
    icon: "rocket",
    collectionId: 528,
    total: 6,
  },
  {
    id: "back-to-the-future",
    name: "Where We're Going",
    label: "Back to the Future",
    tier: "bronze",
    icon: "history",
    collectionId: 264,
    total: 3,
  },
  {
    id: "pirates",
    name: "Savvy",
    label: "Pirates of the Caribbean",
    tier: "silver",
    icon: "boxes",
    collectionId: 295,
    total: 5,
  },
  {
    id: "rocky",
    name: "Going the Distance",
    label: "Rocky",
    tier: "silver",
    icon: "boxes",
    collectionId: 1575,
    total: 6,
  },
  {
    id: "hunger-games",
    name: "Odds Ever in Your Favour",
    label: "The Hunger Games",
    tier: "bronze",
    icon: "boxes",
    collectionId: 131635,
    total: 4,
  },
  {
    id: "toy-story",
    name: "To Infinity",
    label: "Toy Story",
    tier: "bronze",
    icon: "boxes",
    collectionId: 10194,
    total: 5,
  },
  {
    id: "godfather",
    name: "An Offer You Can't Refuse",
    label: "The Godfather",
    tier: "bronze",
    icon: "award",
    collectionId: 230,
    total: 3,
  },
];

/** Whether a watched film belongs to this franchise. */
export function inFranchise(
  franchise: NamedFranchise,
  film: { tmdbId: number; collectionId: number | null | undefined },
) {
  if (franchise.filmIds) return franchise.filmIds.includes(film.tmdbId);
  return franchise.collectionId !== undefined && film.collectionId === franchise.collectionId;
}
