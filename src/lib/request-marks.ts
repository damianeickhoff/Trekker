import "server-only";
import { cache } from "react";
import { getSeerrConnection, getSeerrStatuses } from "./seerr";

export type RequestMarks = Map<string, "pending" | "partial" | "available">;

/**
 * How long a sweep of the instance is good for.
 *
 * The marks are instance-wide and identical for everybody, and the sweep behind
 * them is now several calls rather than one — so paying for it on every
 * navigation would be spending an Overseerr round trip per poster grid to learn
 * something that changes when a download finishes. A couple of minutes is short
 * enough that a finished download turns up while somebody is still looking for
 * it, and anything they do themselves clears it outright — see
 * {@link forgetRequestMarks}.
 */
const TTL = 2 * 60 * 1000;

/**
 * A sweep that found nothing is either an unreachable instance or an empty one.
 * Neither is worth holding for the full spell: the first is usually a blip, and
 * re-asking the second costs one call.
 */
const EMPTY_TTL = 15 * 1000;

/**
 * The promise rather than the map, so a burst of parallel requests shares one
 * sweep instead of each starting its own.
 */
let sweep: { expires: number; marks: Promise<RequestMarks> } | null = null;

/**
 * Overseerr's state for every title it knows about, keyed `${mediaType}-${id}`,
 * for the corner marks on posters.
 *
 * Cached per request as well as per process, so a page with six rails on it
 * costs one lookup and not six. Fails soft to an empty map: an unreachable
 * Overseerr should cost the marks, never the page.
 */
export const getRequestMarks = cache(async (): Promise<RequestMarks> => {
  const now = Date.now();
  if (sweep && sweep.expires > now) return sweep.marks;

  const entry = { expires: now + TTL, marks: collect() };
  sweep = entry;

  // Shortened after the fact rather than before, because whether there was
  // anything to find is not known until the sweep is done.
  void entry.marks.then((marks) => {
    if (marks.size === 0) entry.expires = Math.min(entry.expires, now + EMPTY_TTL);
  });

  return entry.marks;
});

/**
 * Throws the sweep away, so the next page load asks again.
 *
 * Called wherever this app is the thing that changed Overseerr's mind — filing
 * a request by hand, or a smart list filing its own. Waiting out the spell to
 * see a mark you just caused is the one staleness anybody would actually
 * notice.
 */
export function forgetRequestMarks() {
  sweep = null;
}

/** Never rejects: every caller here treats trouble as "nothing to say". */
async function collect(): Promise<RequestMarks> {
  const marks: RequestMarks = new Map();

  try {
    const connection = await getSeerrConnection();
    if (!connection) return marks;

    for (const [key, state] of await getSeerrStatuses(connection)) {
      if (state.kind === "requestable") continue;
      marks.set(key, state.kind);
    }
  } catch {
    // Fails soft — see above.
  }

  return marks;
}
