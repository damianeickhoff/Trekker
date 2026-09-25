import type { Tier } from "../levels";
import type { Group } from "./catalogue";

/*
 * What narrows the badges page, pure so the client can answer on every
 * keystroke and the tests can check it without a database. The whole board is
 * already on the page, so filtering is local work; a round trip to the server
 * to hide half of what it just sent would be slower for no gain.
 */

/** The fields filtering reads, so this module needs nothing server-side. */
export type Filterable = {
  name: string;
  description: string;
  group: Group;
  tier: Tier;
  earned: boolean;
  percent: number;
};

export type Show = "all" | "todo" | "done";
export const SHOWS: Show[] = ["all", "todo", "done"];
export const SHOW_LABEL: Record<Show, string> = { all: "All", todo: "In progress", done: "Earned" };

export const TIERS: Tier[] = ["bronze", "silver", "gold", "legend"];
/** The filter's names: the top tier is Legendary here, as it was in the old app, though its metal is platinum. */
export const TIER_LABEL: Record<Tier, string> = { bronze: "Bronze", silver: "Silver", gold: "Gold", legend: "Legendary" };

export type Filters = { group: Group | null; show: Show; tier: Tier | null; query: string };

export function matches(b: Filterable, { group, show, tier, query }: Filters): boolean {
  if (group && b.group !== group) return false;
  if (show === "done" && !b.earned) return false;
  if (show === "todo" && b.earned) return false;
  if (tier && b.tier !== tier) return false;
  const needle = query.trim().toLowerCase();
  if (needle === "") return true;
  // Name, description and group: "october" finds the horror one, "habits" the whole group.
  return (
    b.name.toLowerCase().includes(needle) ||
    b.description.toLowerCase().includes(needle) ||
    b.group.toLowerCase().includes(needle)
  );
}

/** How many each of All, In progress and Earned would show, before the other filters. */
export function showCounts(badges: Filterable[]): Record<Show, number> {
  const done = badges.filter((b) => b.earned).length;
  return { all: badges.length, todo: badges.length - done, done };
}

/**
 * Closest to earning: the unearned badges furthest along, ignoring anything
 * not started, since a row of 0% suggestions is no use to anyone. Ties keep
 * catalogue order, so the row does not reshuffle between visits.
 */
export function closestToEarning<T extends Filterable>(badges: T[], n = 3): T[] {
  return badges
    .map((b, i) => ({ b, i }))
    .filter(({ b }) => !b.earned && b.percent > 0 && b.percent < 100)
    .sort((x, y) => y.b.percent - x.b.percent || x.i - y.i)
    .slice(0, n)
    .map(({ b }) => b);
}
