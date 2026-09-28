import { dateParts, daysBetween } from "./dates";

/*
 * What one viewing says about itself, in words both the episode page and its
 * edit sheet use. No server imports, so the sheet in the browser can share the
 * limits and the day's wording with the page that drew it.
 */

/** Where it was watched: a service's or a room's name, not a sentence. */
export const PLACE_MAX = 40;

/** A line about the evening, not a review: those have their own place. */
export const NOTE_MAX = 280;

/** How many suggestions the sheet offers under Where. */
export const PLACE_SUGGESTIONS = 8;

/** "Today", "Yesterday", "Wed 23 Sep", with the year once it is not this one. */
export function viewingDay(date: string, today: string): string {
  const n = daysBetween(date, today);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  const p = dateParts(date);
  const day = `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`;
  return date.slice(0, 4) === today.slice(0, 4) ? day : `${day} ${p.year}`;
}

/** "Once", "Twice", "3 times": the head of the viewings block. */
export function timesWatched(n: number): string {
  if (n === 1) return "Once";
  if (n === 2) return "Twice";
  return `${n} times`;
}

/**
 * Where a viewing came from, when it was not a tick here: the one fact the
 * row can state without being told. A manual tick and a row brought over
 * from the old app say nothing, since neither knows more than the day.
 */
export function sourceWords(source: string): string | null {
  if (source === "plex") return "From Plex";
  if (source === "trakt") return "From Trakt";
  return null;
}

/** Trimmed, capped, and nothing at all rather than an empty string. */
export function cleanLine(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\s+/g, " ").trim().slice(0, max);
  return text || null;
}

/** A note keeps its line breaks, since "with Jason\nfell asleep" is two facts. */
export function cleanNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, NOTE_MAX);
  return text || null;
}

/**
 * The places to offer, best first and each once whatever its case: Plex when
 * the instance has a server, then the services this person pays for, then
 * where they have said before. The last are what they actually type, so they
 * come after the ones they are likeliest to mean.
 */
export function placeSuggestions(sources: { plex: boolean; services: string[]; used: string[] }): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const place of [...(sources.plex ? ["Plex"] : []), ...sources.services, ...sources.used]) {
    const key = place.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(place.trim());
    if (out.length === PLACE_SUGGESTIONS) break;
  }
  return out;
}
