/**
 * Making user input safe to hand to Prisma's `contains`.
 *
 * On SQLite, `contains` compiles to `LIKE '%term%'` and Prisma does **not**
 * escape the term — so `%` and `_` arrive as wildcards. Searching for `100%`
 * matches very nearly everything, and `_` quietly matches any single
 * character. That was a live bug in the instance-user search before this
 * existed; it is not a security hole, but it is a search box that lies.
 *
 * Stripping rather than escaping is deliberate. Escaping needs a matching
 * `ESCAPE` clause, which `contains` gives no way to supply — so the choice is
 * between stripping the characters and dropping to raw SQL for a search box.
 * Nobody is looking for a literal percent sign in a film title.
 *
 * Two other SQLite facts worth knowing here, both fine at this scale:
 * `mode: "insensitive"` is unsupported by the connector, but `LIKE` is already
 * case-insensitive for ASCII; and there is no index for a leading-wildcard
 * match, so every one of these is a table scan — which over a few thousand
 * personal rows is sub-millisecond.
 */

/** How much of a query to honour. Past this it is not a search, it is a payload. */
const MAX_LENGTH = 100;

/**
 * A term fit for `contains`, or null when there is nothing worth querying.
 *
 * Null rather than an empty string so callers have to decide what "no term"
 * means instead of accidentally running `LIKE '%%'` and returning the lot.
 */
export function likeTerm(input: string | null | undefined, minLength = 2): string | null {
  const term = (input ?? "")
    .slice(0, MAX_LENGTH)
    .replaceAll("%", "")
    .replaceAll("_", "")
    .trim();

  return term.length >= minLength ? term : null;
}
