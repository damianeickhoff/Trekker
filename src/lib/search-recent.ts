/**
 * The search box's recent queries, kept in this browser only: what someone
 * looked for is nobody else's business, and nothing on the server needs it.
 */

export const RECENT_KEY = "trekker:recent-searches";
export const RECENT_MAX = 8;

/** Newest first, each query once whatever its case, at most eight. */
export function rememberQuery(list: string[], query: string): string[] {
  const q = query.trim();
  if (!q) return list;
  return [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, RECENT_MAX);
}
