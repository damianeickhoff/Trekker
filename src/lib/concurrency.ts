/**
 * Bounded fan-out.
 *
 * A plain `Promise.all` over a few hundred TMDB lookups opens a few hundred
 * simultaneous HTTPS requests. Node's fetch decompresses each response through
 * its own zlib stream, and once the sockets start applying backpressure those
 * streams accumulate `drain` listeners — which is where the
 * "MaxListenersExceededWarning ... drain listeners added to [Gzip]" warning
 * comes from. Capping how many requests are in flight keeps that under control
 * and is kinder to TMDB's rate limit besides.
 *
 * Results come back in input order, exactly like `Promise.all`.
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

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);

  return results;
}
