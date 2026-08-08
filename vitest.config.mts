import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Tests run against a real SQLite database, not a mocked Prisma client.
 *
 * That is a deliberate choice rather than a shortcut. Nearly everything worth
 * testing in `src/lib/plays.ts` *is* database behaviour: the unique index on
 * `(userId, source, sourceRef)`, SQLite treating nulls in that index as
 * distinct — which is the whole reason ref-less rows can coexist — and the
 * `aggregate` that rebuilds a watched row from the log. A mock would only ever
 * assert that the code calls Prisma the way the code calls Prisma.
 *
 * `.mts` so it is loaded as ESM; as `.ts` Vite reads it through the CJS loader
 * and warns about the import syntax.
 */
export default defineConfig({
  resolve: {
    // Resolves `@/*` — and with it `@/generated/prisma/client` — straight out
    // of tsconfig.json, so there is no second copy of the alias list to drift.
    tsconfigPaths: true,

    alias: {
      /**
       * `server-only` exists to blow up when it is imported anywhere but a
       * server component — it resolves through the `react-server` export
       * condition and throws in every other environment, including this one.
       *
       * Pointing it at an empty module is what lets `plays.ts` and friends be
       * imported here as they are, with no `#ifdef test` creeping into
       * production code.
       */
      "server-only": path.resolve(import.meta.dirname, "tests/stubs/server-only.ts"),
    },
  },

  test: {
    environment: "node",
    // `better-sqlite3` is a native binding, and threads share one address
    // space. Forks give each worker its own process, and with it its own
    // `globalThis` — which is where `src/lib/db.ts` caches the client.
    pool: "forks",
    globalSetup: "tests/global-setup.ts",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
  },
});
