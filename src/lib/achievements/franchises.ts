import type { Tier } from "../levels";
import type { IconName } from "@/components/icon";

/**
 * Named franchises, a badge each: the series people set out to work through on
 * purpose. The generic Completionist already rewards finishing any franchise.
 *
 * Most are a TMDB collection, and a film counts when its cached collection
 * matches, which costs nothing beyond the title facts the badges page already
 * keeps. The one that is not a usable collection carries its film ids.
 *
 * `total` is the films released when it was written, checked against TMDB.
 * Bump it when a new entry comes out: a stale number only lands the badge one
 * film early.
 */
export type NamedFranchise = {
  /** The badge id, after `franchise-`. Stored on unlocks, so never renamed. */
  id: string;
  /** The old app's icon for it, drawn from the rebuild's own set. */
  icon: IconName;
  name: string;
  /** How the description names it. */
  label: string;
  tier: Tier;
  total: number;
  collectionId?: number;
  filmIds?: number[];
};

/**
 * The Infinity Saga rather than the MCU: the MCU is no TMDB collection, and its
 * keyword pulls in one-shots and shorts nobody counts. Iron Man to Far From
 * Home is a closed set of twenty-three that will never need updating.
 */
const INFINITY_SAGA = [
  1726, 1724, 10138, 10195, 1771, 24428, 68721, 76338, 100402, 118340, 99861, 102899,
  271110, 284052, 283995, 315635, 284053, 284054, 299536, 363088, 299537, 299534, 429617,
];

export const FRANCHISES: NamedFranchise[] = [
  { id: "harry-potter", icon: "sparkle", name: "The Boy Who Lived", label: "Harry Potter", tier: "gold", collectionId: 1241, total: 8 },
  { id: "lord-of-the-rings", icon: "boxes", name: "There and Back Again", label: "The Lord of the Rings", tier: "silver", collectionId: 119, total: 3 },
  { id: "star-wars", icon: "rocket", name: "The Whole Saga", label: "Star Wars", tier: "gold", collectionId: 10, total: 9 },
  { id: "infinity-saga", icon: "award", name: "The Infinity Saga", label: "the Marvel Cinematic Universe, Iron Man to Far From Home", tier: "legend", filmIds: INFINITY_SAGA, total: INFINITY_SAGA.length },
  { id: "conjuring", icon: "ghost", name: "Based on a True Story", label: "The Conjuring", tier: "bronze", collectionId: 313086, total: 4 },
  { id: "insidious", icon: "ghost", name: "Into the Further", label: "Insidious", tier: "silver", collectionId: 228446, total: 5 },
  { id: "saw", icon: "ghost", name: "Do You Want to Play a Game", label: "Saw", tier: "gold", collectionId: 656, total: 10 },
  { id: "halloween", icon: "ghost", name: "The Night He Came Home", label: "Halloween", tier: "gold", collectionId: 91361, total: 11 },
  { id: "scream", icon: "ghost", name: "What's Your Favourite Scary Movie", label: "Scream", tier: "silver", collectionId: 2602, total: 7 },
  { id: "paranormal-activity", icon: "ghost", name: "Caught on Camera", label: "Paranormal Activity", tier: "silver", collectionId: 41437, total: 7 },
  { id: "alien", icon: "rocket", name: "In Space No One Can Hear You", label: "Alien", tier: "bronze", collectionId: 8091, total: 4 },
  { id: "james-bond", icon: "award", name: "Licence to Complete", label: "James Bond", tier: "legend", collectionId: 645, total: 26 },
  { id: "fast-and-furious", icon: "boxes", name: "Family", label: "The Fast and the Furious", tier: "gold", collectionId: 9485, total: 10 },
  { id: "mission-impossible", icon: "boxes", name: "Your Mission, Accepted", label: "Mission: Impossible", tier: "gold", collectionId: 87359, total: 8 },
  { id: "jurassic-park", icon: "boxes", name: "Life Finds a Way", label: "Jurassic Park", tier: "silver", collectionId: 328, total: 7 },
  { id: "indiana-jones", icon: "boxes", name: "It Belongs in a Museum", label: "Indiana Jones", tier: "silver", collectionId: 84, total: 5 },
  { id: "john-wick", icon: "boxes", name: "The Boogeyman", label: "John Wick", tier: "bronze", collectionId: 404609, total: 4 },
  { id: "matrix", icon: "rocket", name: "All of the Pills", label: "The Matrix", tier: "bronze", collectionId: 2344, total: 4 },
  { id: "terminator", icon: "rocket", name: "Come With Me If You Want to Live", label: "The Terminator", tier: "silver", collectionId: 528, total: 6 },
  { id: "back-to-the-future", icon: "history", name: "Where We're Going", label: "Back to the Future", tier: "bronze", collectionId: 264, total: 3 },
  { id: "pirates", icon: "boxes", name: "Savvy", label: "Pirates of the Caribbean", tier: "silver", collectionId: 295, total: 5 },
  { id: "rocky", icon: "boxes", name: "Going the Distance", label: "Rocky", tier: "silver", collectionId: 1575, total: 6 },
  { id: "hunger-games", icon: "boxes", name: "Odds Ever in Your Favour", label: "The Hunger Games", tier: "bronze", collectionId: 131635, total: 4 },
  { id: "toy-story", icon: "boxes", name: "To Infinity", label: "Toy Story", tier: "bronze", collectionId: 10194, total: 5 },
  { id: "godfather", icon: "award", name: "An Offer You Can't Refuse", label: "The Godfather", tier: "bronze", collectionId: 230, total: 3 },
];

/** Whether a watched film belongs to this franchise. */
export function inFranchise(franchise: NamedFranchise, film: { tmdbId: number; collectionId: number | null | undefined }) {
  if (franchise.filmIds) return franchise.filmIds.includes(film.tmdbId);
  return franchise.collectionId !== undefined && film.collectionId === franchise.collectionId;
}
