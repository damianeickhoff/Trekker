// better-sqlite3 is a native addon, compiled or downloaded by its own install
// script. When that script does not run (an install with --ignore-scripts, a
// node_modules copied between machines or Node versions), the app starts and
// renders, then every database read fails with "Could not locate the bindings
// file". Checking here turns that into one clear line before anything starts.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const Database = require("better-sqlite3");
  new Database(":memory:").close();
} catch (error) {
  console.error(
    `better-sqlite3 cannot load its native binding (${error instanceof Error ? error.message.split("\n")[0] : error}).\n` +
      "Fix it with: npm rebuild better-sqlite3",
  );
  process.exit(1);
}
