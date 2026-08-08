import "server-only";
import { assertAuthSecret } from "./secrets";

/**
 * The checks a running server must pass before it serves anything.
 *
 * Separate from `instrumentation.ts` so `process.exit` lives in a module the
 * edge bundler never reads. That hook is compiled for both runtimes, and the
 * edge one has no `process.exit` — the runtime guard there is correct, but the
 * static analysis still warns, and a build that cries wolf is a build nobody
 * reads.
 */
export function checkBoot() {
  try {
    assertAuthSecret();
  } catch (error) {
    console.error(
      `\n✗ Trekker cannot start.\n\n  ${
        error instanceof Error ? error.message : String(error)
      }\n\n  Without it, session cookies would be signed with a key that is public,\n  and anyone able to reach this instance could forge one for any account.\n`,
    );
    process.exit(1);
  }
}
