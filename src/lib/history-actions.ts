"use server";

import { z } from "zod";
import { requireUser } from "./auth";
import { getHistoryPage, type HistoryFilter, type HistoryPage } from "./profile";

/**
 * The filter, re-validated here rather than trusted.
 *
 * The browser is not the authority on a `where` clause. It already could only
 * ever read its own log — `requireUser` sees to that — but an unbounded `q` is
 * a table scan somebody else pays for, and an arbitrary `source` is a query
 * nobody meant to allow.
 */
const filterSchema = z.object({
  q: z.string().max(100).optional().nullable(),
  mediaType: z.enum(["movie", "tv"]).optional().nullable(),
  source: z.enum(["manual", "plex", "trakt", "backfill"]).optional().nullable(),
});

/** Next page of the watch history, for the infinite-scroll feed. */
export async function loadHistoryPage(
  page: number,
  filter?: HistoryFilter,
): Promise<HistoryPage> {
  const user = await requireUser();
  const parsed = filterSchema.safeParse(filter ?? {});

  // Whatever the client sends, it can only ever read its own log.
  return getHistoryPage(
    user.id,
    Math.max(1, Math.floor(page)),
    parsed.success ? parsed.data : {},
  );
}
