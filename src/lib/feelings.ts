/**
 * How a title made you feel, and the emoji you can answer a comment with.
 *
 * Plain data with no server dependency, so the buttons and the server that
 * validates them read the same list — a feeling the UI can draw but the action
 * would reject is a bug nobody sees until somebody presses it.
 *
 * A fixed set rather than free emoji, on purpose. Eight answers make a tally
 * that means something at a glance: four people found it tense is a fact about
 * the film. Any emoji at all makes a pile nobody can read, because no two people
 * mean the same thing by 👀 — and the point of showing this to strangers is that
 * it summarises.
 */

export type Feeling = {
  id: string;
  label: string;
  emoji: string;
};

/**
 * Deliberately not sorted best-to-worst. A row that runs from love to boredom
 * reads as a scale, and there is already a scale — the score. These are kinds of
 * evening, not degrees of quality: "made me laugh" and "scared me" are both
 * good outcomes for the right film.
 */
export const FEELINGS: Feeling[] = [
  { id: "loved", label: "Loved it", emoji: "😍" },
  { id: "moved", label: "Moved me", emoji: "🫠" },
  { id: "laughed", label: "Made me laugh", emoji: "😂" },
  { id: "tense", label: "Tense", emoji: "😬" },
  { id: "scared", label: "Scared me", emoji: "😱" },
  { id: "comfort", label: "Comfort watch", emoji: "☕" },
  { id: "bored", label: "Bored me", emoji: "😴" },
  { id: "confused", label: "Confused me", emoji: "🤨" },
];

const BY_ID = new Map(FEELINGS.map((feeling) => [feeling.id, feeling]));

export function isFeeling(id: string): boolean {
  return BY_ID.has(id);
}

export function findFeeling(id: string): Feeling | null {
  return BY_ID.get(id) ?? null;
}

/**
 * What you can react to a comment with.
 *
 * Six, and no picker. A full emoji keyboard turns a reaction into a decision,
 * and the whole value of a reaction is that it costs nothing — these are the
 * answers people actually give to something somebody wrote.
 */
export const REACTIONS = ["👍", "😂", "😮", "😢", "🔥", "💯"] as const;

export type Reaction = (typeof REACTIONS)[number];

export function isReaction(emoji: string): emoji is Reaction {
  return (REACTIONS as readonly string[]).includes(emoji);
}
