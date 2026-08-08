/**
 * Runs once, when the server starts.
 *
 * Its whole job is to turn a misconfiguration that would otherwise surface as
 * "sign-in is broken" — hours later, to somebody else — into a container that
 * refuses to start with the reason on stdout. That is the difference between a
 * deployment you notice and one you do not.
 */
export async function register() {
  // This hook is compiled for the edge runtime as well, and runs during
  // `next build`, where exiting would fail the build of anyone who does not
  // happen to have production secrets to hand. Neither is a running server, so
  // neither is what this is checking. The work itself lives behind a dynamic
  // import so the edge bundle never even sees it.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkBoot } = await import("./lib/boot-check");
  checkBoot();
}
