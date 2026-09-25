/**
 * Bounded fan-out. A plain `Promise.all` over a few hundred lookups opens a few
 * hundred sockets at once, which is unkind to TMDB's rate limit and to Node's
 * zlib streams alike. Results come back in input order, like `Promise.all`.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
