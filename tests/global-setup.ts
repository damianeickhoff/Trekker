import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Builds one migrated database, once, for every worker to copy.
 *
 * Running `prisma migrate deploy` per worker would mean running all 31
 * migrations per worker; doing it here means running them once and then
 * copying a file, which is the difference between a test suite you run on
 * every save and one you avoid.
 */

export const TMP = path.resolve(__dirname, ".tmp");
export const TEMPLATE = path.join(TMP, "template.db");

export default function setup() {
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.mkdirSync(TMP, { recursive: true });

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    cwd: path.resolve(__dirname, ".."),
    stdio: "pipe",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      /**
       * `prisma.config.ts` does `import "dotenv/config"`, and dotenv never
       * overwrites a variable that is already set — so this wins over the
       * `.env` pointing at the real database. Worth knowing before changing
       * it: get this wrong and the suite migrates, and later truncates, the
       * developer's own data.
       */
      DATABASE_URL: `file:${TEMPLATE}`,
    },
  });

  return () => {
    /**
     * Best-effort. On Windows a worker's better-sqlite3 handle can still be
     * open when teardown runs, and unlinking an open file there is EBUSY —
     * which was turning a green run into a stack trace. Retry briefly, then
     * let it go: setup starts by removing this directory anyway, so anything
     * left behind is gone before the next run touches it.
     */
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Leftovers are cleaned up by the next run's setup.
    }
  };
}
