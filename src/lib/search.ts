import "server-only";
import { normalise, tmdbGet, type ListItem, type MediaType, type TmdbListItem } from "./tmdb";

/**
 * Search: one TMDB question per query and kind, through the cache table,
 * where a search answer keeps for an hour, so a query typed twice in an hour
 * (or by two people) is asked once. The grouping is pure, for the tests.
 */

export type SearchType = "all" | "tv" | "movie" | "person";

export function parseSearchType(value: string | null | undefined): SearchType {
  return value === "tv" || value === "movie" || value === "person" ? value : "all";
}

/** A person as TMDB's search gives them, with what they are known for. */
export type TmdbPersonResult = {
  id: number;
  media_type?: "person";
  name?: string;
  profile_path?: string | null;
  known_for_department?: string;
  popularity?: number;
  known_for?: TmdbListItem[];
};

export type PersonResult = { id: number; name: string; profile: string | null; line: string };

/** A title as the search page draws it, with its mark and watched tick from rows. */
export type ResultTitle = {
  mediaType: "movie" | "tv";
  id: number;
  title: string;
  poster: string | null;
  score: number;
  line: string;
  mark: "plex" | "requested" | null;
};

/** What the endpoint answers. */
export type SearchAnswer = {
  query: string;
  shows: ResultTitle[];
  films: ResultTitle[];
  people: { id: number; name: string; profile: string | null; line: string }[];
  error?: string;
};

export type Grouped = { shows: ListItem[]; films: ListItem[]; people: PersonResult[] };

/** "Actor", "Director": what TMDB says someone is known for doing, as a noun. */
export function departmentNoun(department: string | undefined) {
  switch (department) {
    case "Acting":
      return "Actor";
    case "Directing":
      return "Director";
    case "Writing":
      return "Writer";
    case "Production":
      return "Producer";
    default:
      return department || null;
  }
}

/** "Actor · Lanterns". */
export function personLine(p: TmdbPersonResult): string {
  const known = p.known_for?.[0];
  return [departmentNoun(p.known_for_department), known ? known.title || known.name : null].filter(Boolean).join(" · ");
}

export function toPerson(p: TmdbPersonResult): PersonResult | null {
  if (!p.name) return null;
  return { id: p.id, name: p.name, profile: p.profile_path ?? null, line: personLine(p) };
}

/**
 * A mixed answer split into shows, films and people, each in TMDB's own
 * order of relevance, each title once. `fallback` says what an answer from a
 * one-kind endpoint is, since those do not name their media type.
 */
export function groupResults(results: (TmdbListItem | TmdbPersonResult)[], fallback?: MediaType | "person"): Grouped {
  const out: Grouped = { shows: [], films: [], people: [] };
  const seen = new Set<string>();
  for (const r of results) {
    const kind = r.media_type ?? fallback;
    const key = `${kind}-${r.id}`;
    if (!kind || seen.has(key)) continue;
    seen.add(key);
    if (kind === "person") {
      const person = toPerson(r as TmdbPersonResult);
      if (person) out.people.push(person);
      continue;
    }
    const item = normalise(r as TmdbListItem, kind);
    if (!item) continue;
    (item.mediaType === "tv" ? out.shows : out.films).push(item);
  }
  return out;
}

/** "Series · 2026", "Film · 2025". */
export function titleLine(item: ListItem) {
  return [item.mediaType === "tv" ? "Series" : "Film", item.year].filter(Boolean).join(" · ");
}

const PATHS: Record<SearchType, string> = {
  all: "/search/multi",
  tv: "/search/tv",
  movie: "/search/movie",
  person: "/search/person",
};

/** The first page of answers for a query, grouped. Everything asks the mixed endpoint; a chip asks its own. */
export async function runSearch(query: string, type: SearchType): Promise<Grouped> {
  const data = await tmdbGet<{ results?: (TmdbListItem | TmdbPersonResult)[] }>("search", PATHS[type], {
    query: query.trim(),
    page: 1,
    include_adult: "false",
  });
  return groupResults(data.results ?? [], type === "all" ? undefined : type);
}
