# Trekker — agent notes

A self-hosted TV and film tracker. Next.js 16 (App Router, React 19, Server
Actions), Tailwind v4, SQLite via Prisma 7 (better-sqlite3), TMDB for the
catalogue. The README is thorough and current — read it for what a feature is
*for* before changing how it works.

## Commands

- `npm run dev` — dev server (`prisma generate` runs first automatically)
- `npm run build` / `npm start` — production
- `npm test` — vitest, against throwaway SQLite databases in `tests/.tmp/`
- `npm run typecheck` / `npm run lint`

## Layout

- `src/app` — routes. Pages are server components; interactivity lives in
  `src/components`.
- `src/lib` — all server logic. Files ending `-actions.ts` are `"use server"`
  modules called from the client; the rest are server-only helpers.
- `src/generated/prisma` — generated, gitignored, never edited by hand.
- `prisma/` — schema and migrations. Schema comments carry design reasoning;
  keep them true.

## Conventions worth knowing

- British English throughout, code and copy alike: favourites, normalise,
  catalogue.
- Comments explain constraints and reasoning, not mechanics. Match that.
- All watched-state writes go through `recordPlay` in `src/lib/plays.ts` —
  `WatchedEpisode`/`WatchedMovie` are a uniqueness index over `Play`, and
  writing them anywhere else desynchronises the two.
- Theming: `data-theme` on `<html>`, not the OS media query — use the `dark:`
  and `light:` variants defined in `globals.css`, never Tailwind's built-in
  `dark:`. The ink ramp inverts between themes; on fixed-colour surfaces use
  literal `text-black`/`text-white`.
- Denormalised titles and posters on rows are deliberate: list rows must render
  without a TMDB call.
- External calls (TMDB, Plex, Overseerr) fail soft and are fanned out through
  `mapLimit` in `src/lib/concurrency.ts` — never an unbounded `Promise.all`.
