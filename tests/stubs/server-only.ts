/**
 * Stands in for the `server-only` package under test.
 *
 * That package is a tripwire: importing it outside a React Server Component
 * throws, which is exactly what you want in the app and exactly what stops a
 * test from importing `plays.ts` at all. Aliased in `vitest.config.ts`.
 *
 * Empty on purpose — the real thing exports nothing either.
 */
export {};
