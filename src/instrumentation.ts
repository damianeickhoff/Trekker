/**
 * Node's fetch decompresses every gzipped response through a zlib stream, and
 * under backpressure those streams collect one `drain` listener per pending
 * write. Past ten, Node prints:
 *
 *   MaxListenersExceededWarning: Possible EventEmitter memory leak detected.
 *   11 drain listeners added to [Gzip].
 *
 * It is a warning about a real ceiling rather than a leak — the listeners are
 * removed as the writes flush. The actual fix is fewer requests in flight, which
 * `mapLimit` in src/lib/concurrency.ts now enforces around the TMDB fan-outs;
 * this raises the ceiling so a burst of legitimate parallel requests does not
 * trip the warning on the way there.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // Streams are EventEmitters, so this is the ceiling the zlib stream uses.
  const { EventEmitter } = await import("node:events");
  EventEmitter.defaultMaxListeners = 64;
}
