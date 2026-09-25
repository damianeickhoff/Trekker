/**
 * Runs once when the server starts. The Node-only work lives in modules behind
 * the runtime check, which is how Next keeps it out of the edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertBootConfig } = await import("./lib/boot-check");
  assertBootConfig();

  // Before the first request, so nobody sees a level that the first Badges
  // visit would then correct. Rows and caches only: nothing is fetched, which
  // is why it may run in a dev server too. Once per account; not during a build.
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    const { repairLevels } = await import("./lib/achievements");
    await repairLevels().catch((error) => console.error("level repair failed", error));
  }

  // The refresh timers run in the production server only: a dev server restarts
  // on every other save, and `next build` must not start fetching anything.
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { startScheduler } = await import("./lib/refresh");
    startScheduler();
  }
}
