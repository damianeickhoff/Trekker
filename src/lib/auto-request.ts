import "server-only";
import { db } from "./db";
import { mapLimit } from "./concurrency";
import { getUserProviders, expandProviders } from "./providers";
import { watchRegion } from "./region";
import { getSeerrConnection, getSeerrStatuses, requestOnSeerr } from "./seerr";
import { getWatchProviders } from "./tmdb";
// Shared with the client panel that offers the setting — see the note there.
import { requestCap } from "./auto-request-limits";

export { AUTO_REQUEST_MAX, requestCap } from "./auto-request-limits";

/**
 * Asking Overseerr for what a smart list found, without being told to.
 *
 * The whole design here is about restraint, because this is the one thing in the
 * app that spends someone else's disk on its own initiative:
 *
 *   - off unless a list is opted in, one list at a time;
 *   - a hard ceiling per run, on top of whatever the user chose;
 *   - only titles Overseerr says are actually requestable, so nothing is asked
 *     for twice and nothing already on the server is touched;
 *   - by default, only titles the user cannot already stream on a service they
 *     pay for — the point is to fill gaps, not to duplicate a subscription.
 *
 * Deliberately *not* wired into the on-demand refresh a page does when it finds
 * a stale list. Opening a list should never be the thing that files twenty
 * requests. Only the nightly job calls this.
 */

/** How many watch-provider lookups to have in flight, matching the app's other fan-outs. */
const FANOUT = 5;

export type AutoRequestResult = {
  /** Titles actually filed with Overseerr. */
  requested: { mediaType: string; tmdbId: number; title: string }[];
  /** Considered but skipped because the viewer can already stream it. */
  skippedOwned: number;
  /** Considered but skipped because Overseerr already knows about it. */
  skippedKnown: number;
  error?: string;
};

const EMPTY: AutoRequestResult = { requested: [], skippedOwned: 0, skippedKnown: 0 };

/**
 * Runs one list's auto-request pass.
 *
 * Takes the list id rather than a row so the caller cannot hand it a list whose
 * `autoRequest` it has not checked — the flag is read here, every time.
 */
export async function autoRequestForList(listId: string): Promise<AutoRequestResult> {
  const list = await db.mediaList.findUnique({
    where: { id: listId },
    select: {
      id: true,
      userId: true,
      kind: true,
      autoRequest: true,
      autoRequestScope: true,
      autoRequestCap: true,
      items: {
        orderBy: { position: "asc" },
        select: { mediaType: true, tmdbId: true, title: true },
      },
    },
  });

  if (!list || list.kind !== "smart" || !list.autoRequest) return EMPTY;
  if (list.items.length === 0) return EMPTY;

  // Instance-wide, off the admin's row — Overseerr is configured once for
  // everyone, so the list's owner does not have a connection of their own.
  const connection = await getSeerrConnection();
  if (!connection) return { ...EMPTY, error: "Overseerr is not connected" };

  /**
   * One call for the whole instance rather than one per title. Anything absent
   * from this map is "requestable" — `getSeerrStatuses` deliberately drops those
   * because the absence of news *is* the news.
   */
  const known = await getSeerrStatuses(connection).catch(() => new Map());

  const candidates = list.items.filter(
    (item) => !known.has(`${item.mediaType}-${item.tmdbId}`),
  );
  const skippedKnown = list.items.length - candidates.length;

  /**
   * "Can I already watch this?" — asked only of the titles that got this far,
   * and only when the list is set to skip them. A subscription check costs a
   * TMDB call apiece, so it runs after the cheap filters, not before.
   */
  let owned = 0;
  let wanted = candidates;

  if (list.autoRequestScope !== "all") {
    const mine = expandProviders(await getUserProviders(list.userId));

    if (mine.size > 0) {
      const region = watchRegion();
      const checked = await mapLimit(candidates, FANOUT, async (item) => {
        const offers = await getWatchProviders(
          item.mediaType === "movie" ? "movie" : "tv",
          item.tmdbId,
          region,
        ).catch(() => null);

        // Streaming only. Something available to rent is not something the
        // subscription already covers, so it is still worth asking for.
        const streamable = (offers?.stream ?? []).some((provider) =>
          mine.has(provider.provider_id),
        );
        return { item, streamable };
      });

      wanted = checked.filter((row) => !row.streamable).map((row) => row.item);
      owned = checked.length - wanted.length;
    }
  }

  const cap = requestCap(list.autoRequestCap);
  const batch = wanted.slice(0, cap);

  const requested: AutoRequestResult["requested"] = [];

  // Sequentially, not fanned out: these are writes to somebody's media server,
  // and a burst of twenty is a good way to find out what its rate limit is.
  for (const item of batch) {
    const ok = await requestOnSeerr(
      connection,
      item.mediaType === "movie" ? "movie" : "tv",
      item.tmdbId,
    ).catch(() => false);

    if (ok) requested.push(item);
  }

  if (requested.length > 0) {
    await db.mediaList.update({
      where: { id: list.id },
      data: {
        autoRequestedAt: new Date(),
        autoRequestedCount: requested.length,
        // The first few names, for the bell to print. Three is enough to say
        // what happened; the list page has the rest.
        autoRequestedTitles: requested
          .slice(0, 3)
          .map((item) => item.title)
          .join(", "),
      },
    });
  }

  return { requested, skippedOwned: owned, skippedKnown };
}

/**
 * Every opted-in list, for the nightly job.
 *
 * One at a time. The lists belong to different people but they usually point at
 * the same Overseerr, and running them in parallel would turn "be gentle with
 * the media server" into a lie.
 */
export async function autoRequestAll(): Promise<{
  lists: number;
  requested: number;
  errors: number;
}> {
  const lists = await db.mediaList.findMany({
    where: { kind: "smart", autoRequest: true },
    select: { id: true },
  });

  let requested = 0;
  let errors = 0;

  for (const list of lists) {
    const result = await autoRequestForList(list.id).catch(() => ({
      ...EMPTY,
      error: "failed",
    }));

    requested += result.requested.length;
    if (result.error) errors += 1;
  }

  return { lists: lists.length, requested, errors };
}
