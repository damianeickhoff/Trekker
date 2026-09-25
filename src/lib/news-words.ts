import type { NewsRow } from "./news";
import type { PressTag } from "./press";

/*
 * The News page's words for a row (Round 10): the chip on it, a person's
 * name, the headline and byline your own news shows. Plain, so the client
 * cards that open your news (and mark it read) can use them too.
 */

/** A followed person's name, from the words their news has always carried ("New from Kyle Chandler"). */
export const personName = (row: Pick<NewsRow, "headline">) => row.headline.replace(/^New from /, "");

const KIND_LABEL: Record<string, string> = {
  renewed: "Renewed",
  "new-season": "Renewed",
  cancelled: "Cancelled",
  ended: "Ended",
  "next-date": "Dated",
  "date-moved": "Moved",
  trailer: "Trailer",
  announced: "Casting",
  released: "Out now",
};

const TAG_LABEL: Record<PressTag, string> = {
  renewed: "Renewed",
  cancelled: "Cancelled",
  trailer: "Trailer",
  casting: "Casting",
  "box-office": "Box office",
  reviews: "Reviews",
  dated: "Dated",
  moved: "Moved",
};

/** The chip on one of your rows. A film's release date is "Moved" when it had one before. */
export function kindLabel(row: Pick<NewsRow, "kind" | "detail">) {
  if (row.kind === "release-date") return row.detail.startsWith("It was") ? "Moved" : "Dated";
  return KIND_LABEL[row.kind] ?? "News";
}

export const tagLabel = (tag: PressTag) => TAG_LABEL[tag];

/** One of your rows as a headline: a person's news says what the work is, since the byline names them. */
export function yourHeadline(row: Pick<NewsRow, "subject" | "headline" | "detail">) {
  return row.subject === "person" ? row.detail : row.headline;
}

/** One of your rows' byline: the person, or the title. */
export function yourByline(row: Pick<NewsRow, "subject" | "headline" | "title">) {
  return row.subject === "person" ? personName(row) : row.title;
}

/** A chip with nothing in it: "Nothing under Top yet.", "Nothing under Top for Silo yet.", "Nothing else…" below a lead. */
export function nothingUnder(chip: string, subject: string | null, hadLead = false) {
  return `Nothing ${hadLead ? "else " : ""}under ${chip}${subject ? ` for ${subject}` : ""} yet.`;
}

/**
 * The read mark opening a story sets: its bell key, or none when Settings ›
 * News has "Mark read when opened" off, when only Mark all read clears it.
 */
export function markOnOpening(row: Pick<NewsRow, "key" | "read">, markOnOpen: boolean): string | null {
  return markOnOpen && !row.read ? row.key : null;
}
