import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests run against real SQLite files under `tests/.tmp/`, never a mocked
 * Prisma client: most of what is worth testing in the data layer is database
 * behaviour (unique indexes, SQLite treating nulls in them as distinct,
 * transactions), which a mock would only echo back. Nothing reaches TMDB, Plex
 * or Overseerr; tests that need them stub `fetch`.
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside a React server environment, which is what
      // a test is. An empty stand-in lets server modules be imported as they are.
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    environment: "node",
    // better-sqlite3 is a native binding; forks give each worker its own
    // process, and with it its own `globalThis`, where the client is cached.
    pool: "forks",
    globalSetup: "tests/global-setup.ts",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
