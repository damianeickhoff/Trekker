import type { Landing } from "@/lib/calendar";
import { episodeCode } from "@/lib/marks";

/*
 * How one arrival is described, shared by Home's Landing soon and the calendar
 * so the two never word the same thing differently.
 */

const TAGS = { "series-premiere": "Series premiere", "season-premiere": "Season premiere", finale: "Finale" } as const;

export function tagLabel(l: Pick<Landing, "tag">): string | null {
  return l.tag ? TAGS[l.tag] : null;
}

/** The short code: "S01 · E06", "Premiere", "In cinemas", "Streaming". */
export function landingCode(l: Landing): string {
  switch (l.kind) {
    case "episode":
      return episodeCode(l.seasonNumber, l.episodeNumber);
    case "premiere":
      return "Premiere";
    case "cinema":
      return "In cinemas";
    case "streaming":
      return "Streaming";
  }
}

/** The line under the title in the agenda: the episode's name, or what a film is to you. */
export function landingDetail(l: Landing): string {
  if (l.kind === "episode") return l.episodeName ?? `Episode ${l.episodeNumber}`;
  if (l.kind === "premiere") return "Series premiere";
  return "On your watchlist";
}

/** The quiet note beside the code: a premiere or finale, else the length; and whether it is seen. */
export function landingMeta(l: Landing): string {
  const parts: string[] = [];
  if (l.kind === "cinema") parts.push("In cinemas");
  else if (l.kind === "streaming") parts.push("Streaming");
  else {
    const tag = l.kind === "episode" ? tagLabel(l) : null;
    if (tag) parts.push(tag);
    else if (l.runtime) parts.push(`${l.runtime} min`);
  }
  if (l.watched) parts.push("watched");
  return parts.join(" · ");
}
