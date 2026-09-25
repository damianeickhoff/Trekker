/**
 * How a title made you feel. A fixed set rather than free text: eight answers
 * make a tally that means something at a glance, and the point of showing it
 * to everyone is that it summarises. The ids are the current app's, so the
 * rows it wrote read here unchanged; the labels are words only.
 *
 * Deliberately not sorted best to worst. These are kinds of evening, not
 * degrees of quality, and there is already a scale: the popcorn.
 */

export const FEELINGS = [
  { id: "loved", label: "Loved it" },
  { id: "moved", label: "Moved me" },
  { id: "laughed", label: "Made me laugh" },
  { id: "tense", label: "Tense" },
  { id: "scared", label: "Scared me" },
  { id: "comfort", label: "Comfort watch" },
  { id: "bored", label: "Bored me" },
  { id: "confused", label: "Confused me" },
] as const;

export type FeelingId = (typeof FEELINGS)[number]["id"];

export function isFeeling(id: unknown): id is FeelingId {
  return typeof id === "string" && FEELINGS.some((f) => f.id === id);
}

export function feelingLabel(id: string): string {
  return FEELINGS.find((f) => f.id === id)?.label ?? id;
}
