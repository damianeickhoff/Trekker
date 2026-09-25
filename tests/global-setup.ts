import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Builds one migrated database, once, for every worker to copy: running every
 * migration per worker would make the suite something you avoid running.
 */

export const TMP = path.resolve(import.meta.dirname, ".tmp");
export const TEMPLATE = path.join(TMP, "template.db");
/** The schema as the current app left it: every migration before step 2's. */
export const BEFORE_STEP_2 = path.join(TMP, "before-step-2.db");
export const STEP_2 = "20260923150000_rebuild_data_layer";

const ROOT = path.resolve(import.meta.dirname, "..");

function migrate(env: Record<string, string>, args: string[] = []) {
  execFileSync("npx", ["prisma", "migrate", "deploy", ...args], {
    cwd: ROOT,
    stdio: "pipe",
    shell: process.platform === "win32",
    env: { ...process.env, ...env },
  });
}

/**
 * Builds the pre-step-2 database with Prisma itself rather than by replaying
 * the SQL files by hand: one early migration relies on SQLite reading an
 * unknown double-quoted name as a string, which Prisma's engine allows and
 * better-sqlite3 refuses, so only Prisma reproduces what real databases went
 * through.
 */
function buildBeforeStep2() {
  const dir = path.join(TMP, "migrations-before-step-2");
  const source = path.join(ROOT, "prisma/migrations");
  fs.cpSync(source, dir, {
    recursive: true,
    // Step 2's migration and everything after it: later ones assume its tables.
    // Migration folders sort by their timestamp, so a string comparison does it.
    filter: (src) => {
      const folder = path.relative(source, src).split(path.sep)[0];
      return !(/^[0-9]{14}_/.test(folder) && folder >= STEP_2);
    },
  });
  const config = path.join(TMP, "prisma.before-step-2.config.ts");
  const posix = (p: string) => p.split(path.sep).join("/");
  fs.writeFileSync(
    config,
    [
      `import { defineConfig } from "prisma/config";`,
      `export default defineConfig({`,
      `  schema: "${posix(path.join(ROOT, "prisma/schema.prisma"))}",`,
      `  migrations: { path: "${posix(dir)}" },`,
      `  datasource: { url: "file:${posix(BEFORE_STEP_2)}" },`,
      `});`,
    ].join("\n"),
  );
  migrate({ DATABASE_URL: `file:${BEFORE_STEP_2}` }, ["--config", config]);
}

export default function setup() {
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  fs.mkdirSync(TMP, { recursive: true });

  // `prisma.config.ts` loads `.env` through dotenv, which never overwrites a
  // variable already set, so this wins over the `.env` pointing at real data.
  // Get this wrong and the suite migrates, then empties, the developer's own
  // database.
  migrate({
    DATABASE_URL: `file:${TEMPLATE}`,
  });
  buildBeforeStep2();

  return () => {
    // Best effort: on Windows a worker's handle can still be open at teardown,
    // and setup clears this directory before the next run anyway.
    try {
      fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // Left for the next run's setup.
    }
  };
}
