import { vi } from "vitest";

/**
 * A stand-in for TMDB. Answers by path from a table the test provides, counts
 * what was asked, and fails the test loudly if anything else is fetched: no
 * test may reach the real network.
 */
export function stubTmdb(routes: Record<string, unknown>) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname !== "api.themoviedb.org") throw new Error(`Unexpected fetch to ${url.hostname}`);
    const path = url.pathname.replace(/^\/3/, "");
    calls.push(path);
    const route = routes[path];
    if (route === undefined) return new Response("{}", { status: 404 });
    // A function route is handed the whole address, for answers that depend on the query.
    const body = await (typeof route === "function" ? (route as (url: URL) => unknown)(url) : route);
    if (body instanceof Error) throw body;
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fetchMock);
  process.env.TMDB_API_KEY = "test-key";
  return {
    calls,
    count: (path: string) => calls.filter((c) => c === path).length,
    restore() {
      vi.unstubAllGlobals();
      delete process.env.TMDB_API_KEY;
    },
  };
}
