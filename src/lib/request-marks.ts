import "server-only";
import { cache } from "react";
import { getSeerrConnection, getSeerrStatuses } from "./seerr";

export type RequestMarks = Map<string, "pending" | "partial" | "available">;

/**
 * Overseerr's state for every title it knows about, keyed `${mediaType}-${id}`,
 * for the corner marks on posters.
 *
 * Cached per request, so a page with six rails on it costs one call and not
 * six. Fails soft to an empty map: an unreachable Overseerr should cost the
 * badges, never the page.
 */
export const getRequestMarks = cache(async (): Promise<RequestMarks> => {
  const connection = await getSeerrConnection();
  if (!connection) return new Map();

  const statuses = await getSeerrStatuses(connection).catch(() => null);
  if (!statuses) return new Map();

  const marks: RequestMarks = new Map();
  for (const [key, state] of statuses) {
    if (state.kind === "requestable") continue;
    marks.set(key, state.kind);
  }
  return marks;
});
