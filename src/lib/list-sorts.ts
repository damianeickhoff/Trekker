/**
 * The orders a list can be shown in. Pure, and in the address as `?sort=`, so
 * a chosen order survives a reload and the back button. Every order is stable
 * over the list's own order (newest first on the watchlist and favourites, the
 * list's position on a list), so ties never shuffle between renders.
 */

export type WatchlistSort = "added" | "az" | "rated" | "short" | "streaming";
export type FavouriteSort = "added" | "az" | "rated";
export type ListSort = "unseen" | "az" | "short" | "rated";

/** In the order they are drawn. The first is the default and has no parameter. */
export const WATCHLIST_SORTS: [WatchlistSort, string][] = [
  ["added", "Recently added"],
  ["az", "A–Z"],
  ["rated", "Best rated"],
  ["short", "Shortest"],
  ["streaming", "Streaming now"],
];

/** Favourites carry no length or services, so only the orders a row can answer. */
export const FAVOURITE_SORTS: [FavouriteSort, string][] = WATCHLIST_SORTS.filter(
  (s): s is [FavouriteSort, string] => s[0] === "added" || s[0] === "az" || s[0] === "rated",
);

export const LIST_SORTS: [ListSort, string][] = [
  ["unseen", "Unseen first"],
  ["az", "A–Z"],
  ["short", "Shortest"],
  ["rated", "Best rated"],
];

function parse<T extends string>(sorts: [T, string][], value: string | string[] | undefined): T {
  const v = Array.isArray(value) ? value[0] : value;
  return (sorts.find(([s]) => s === v)?.[0] ?? sorts[0][0]) as T;
}

export const parseWatchlistSort = (v: string | string[] | undefined) => parse(WATCHLIST_SORTS, v);
export const parseFavouriteSort = (v: string | string[] | undefined) => parse(FAVOURITE_SORTS, v);
export const parseListSort = (v: string | string[] | undefined) => parse(LIST_SORTS, v);

/** The address for a sort: the default carries no parameter. */
export function sortHref<T extends string>(base: string, sorts: [T, string][], sort: T) {
  return sort === sorts[0][0] ? base : `${base}?sort=${sort}`;
}

export const sortLabel = <T extends string>(sorts: [T, string][], sort: T) => sorts.find(([s]) => s === sort)?.[1] ?? "";

const byName = new Intl.Collator("en-GB", { sensitivity: "base", numeric: true });

type Sortable = {
  title: string;
  score: number | null;
  runtime?: number | null;
  /** Streaming on a service this person pays for (or anywhere, when they have named none). */
  streaming?: boolean;
  watched?: boolean;
};

/**
 * Missing figures go last whichever way: a film with no known length is not a
 * short film, and one nobody has rated is not the worst.
 */
function nullsLast(a: number | null | undefined, b: number | null | undefined, direction: 1 | -1) {
  const aMissing = a === null || a === undefined || a <= 0;
  const bMissing = b === null || b === undefined || b <= 0;
  if (aMissing || bMissing) return Number(aMissing) - Number(bMissing);
  return (a - b) * direction;
}

/** `rows` arrive in the list's own order; the sort keeps it for ties. */
export function sortRows<T extends Sortable>(rows: T[], sort: WatchlistSort | FavouriteSort | ListSort): T[] {
  const list = [...rows];
  switch (sort) {
    case "az":
      return list.sort((a, b) => byName.compare(a.title, b.title));
    case "rated":
      return list.sort((a, b) => nullsLast(a.score, b.score, -1));
    case "short":
      return list.sort((a, b) => nullsLast(a.runtime, b.runtime, 1));
    case "streaming":
      return list.sort((a, b) => Number(Boolean(b.streaming)) - Number(Boolean(a.streaming)));
    case "unseen":
      return list.sort((a, b) => Number(Boolean(a.watched)) - Number(Boolean(b.watched)));
    default:
      return list;
  }
}
