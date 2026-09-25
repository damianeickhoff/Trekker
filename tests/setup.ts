import fs from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";
import { TEMPLATE, TMP } from "./global-setup";

/**
 * Gives this worker its own copy of the migrated database.
 *
 * The order is load-bearing: `src/lib/db.ts` reads DATABASE_URL when it is
 * first evaluated, so the variable is set before anything imports it, and the
 * client below comes in through a dynamic import. A static import would be
 * hoisted above these lines and connect to whatever `.env` names, which the
 * cleanup below would then empty.
 */

const worker = process.env.VITEST_WORKER_ID ?? process.env.VITEST_POOL_ID ?? "1";
const file = path.join(TMP, `worker-${worker}.db`);

// Once per worker process: setup files run again for every test file, and
// copying over a database this process already has open fails on Windows.
if (!fs.existsSync(file)) fs.copyFileSync(TEMPLATE, file);

process.env.DATABASE_URL = `file:${file}`;
// No test may reach the real network; the TMDB client refuses without a key,
// and the tests that exercise it set one and stub fetch.
delete process.env.TMDB_API_KEY;
// Popular news off: the daily pass would otherwise read the default feeds. The
// press tests hand `runPressPass` feeds of their own and stub fetch.
process.env.NEWS_FEEDS = "";

const { db } = await import("@/lib/db");

/**
 * Everything personal hangs off User with a cascade, so one delete clears it.
 * The shared tables do not belong to anyone and are cleared by name.
 */
afterEach(async () => {
  await db.user.deleteMany({});
  await db.showEpisode.deleteMany({});
  await db.tmdbCache.deleteMany({});
  await db.availability.deleteMany({});
  await db.person.deleteMany({});
  await db.newsItem.deleteMany({});
  await db.titleMeta.deleteMany({});
});
