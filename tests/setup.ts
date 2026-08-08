import fs from "node:fs";
import path from "node:path";
import { afterEach } from "vitest";
import { TEMPLATE, TMP } from "./global-setup";

/**
 * Gives this worker its own copy of the migrated database.
 *
 * The ordering here is load-bearing. `src/lib/db.ts` reads `DATABASE_URL` when
 * the module is *evaluated*, so the variable has to be set before anything
 * imports it — which is why the client below is pulled in with a dynamic
 * import rather than a static one. A static `import { db }` is hoisted above
 * these lines and would connect to whatever `.env` points at: the real
 * database, which the cleanup at the bottom of this file then empties.
 */

const worker = process.env.VITEST_WORKER_ID ?? "1";
const file = path.join(TMP, `worker-${worker}.db`);

// Once per worker, not once per test file. Setup files run again for every
// file, and re-copying over a database this process already has open fails on
// Windows and silently detaches the connection everywhere else.
if (!fs.existsSync(file)) fs.copyFileSync(TEMPLATE, file);

process.env.DATABASE_URL = `file:${file}`;

const { db } = await import("@/lib/db");

/**
 * One delete resets the world: every table that belongs to somebody hangs off
 * `User` with `onDelete: Cascade`, so this leaves a schema-shaped empty
 * database without naming fifteen models that would drift out of date.
 */
afterEach(async () => {
  await db.user.deleteMany({});
});
