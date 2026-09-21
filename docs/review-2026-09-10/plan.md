# Trekker review and improvement plan — 10 September 2026

Written for the implementing agent. Read `AGENTS.md` first; every convention in it
still applies (British English, reasoning comments, `recordPlay` for all watched-state
writes, `dark:`/`light:` variants until WP-11 replaces them).

The review ran against a **copy** of `dev.db` on a separate port with a seeded
account, walked every route at desktop (1280) and phone (390) widths in both themes,
measured a production build warm and cold, and had the code audited for security,
performance, duplication and dead code. Screenshots referenced below live in
`docs/review-2026-09-10/screenshots/`; mockups in `docs/review-2026-09-10/mockups/`
(the same artboards are published as an editable Claude Design canvas: https://claude.ai/code/artifact/9311d049-ae74-4481-a855-843669972bfa).

Work packages are ordered by value. Each has **Problem → Evidence → Change → Files →
Done when**. Effort: S (< half a day), M (a day or two), L (several days).

---

## 0. Summary

| Area | Verdict |
|---|---|
| Security | Two **High** findings (Plex image proxy path traversal; Plex username impersonation with admin token fallback) and two **Medium** (e-mail pre-registration takeover via Plex link; zip-bomb in Trakt import). Everything else is well done. |
| Loading (PWA) | Server side is fast on a desktop (home ≈ 0.3 s TTFB / ≈ 1 s complete, warm or cold). What the phone feels is: one big non-streamed home render, 337 KB gz of JS + 28 KB gz CSS re-fetched after every deploy, no HTML/RSC snapshot for instant paint, two pollers firing on launch, no `preconnect`, and `getUpNext` + `getWatchStatuses` both resolving the whole library on every render. The fix is a set of small changes plus one structural one (persist "next up" per show). |
| Design | The app is coherent and polished everywhere **except the title world**: show/film pages on a phone are a separate dark app with their own chrome, the episode page is a third layout, and the same "tile" is drawn seven different ways. The `ios-*` + `light:` + `:has(.title-page)` theming stack is the cost of that split. Proposal: one surface-token model and one `Tile` primitive; title pages adopt the app's own card language (mockups included). |
| Code | Good engineering, heavy comments. Concrete simplifications: 4 hand-rolled popovers → 1; 130 inline button recipes → 1 component; 1,300-line title page and season browser split; ~37 dead exports; 3 aired-date implementations; 4 `${type}-${id}` key builders. |
| Missing features | A short, principled list (section 5). Importers are deliberately excluded (declined 2026-08-08). |

---

## 1. Security (do these first)

### WP-1 · Plex image proxy allows path traversal — **High**, S
- **Problem** `src/app/api/plex/image/route.ts:18` allow-lists `/^\/(library|photo)\/[\w/.-]*$/`, which accepts `..`. `src/lib/plex.ts:544-550` builds `new URL(base + path)`, and the WHATWG parser normalises dot segments, so `?path=/library/../status/sessions/history/all` reaches any GET endpoint on the Plex server **with the admin's server token** (the route calls `getPlexConnection()` with no user). Response body and content type are echoed verbatim.
- **Change** Parse with `new URL(path, "http://x")`, require the *normalised* pathname to start with `/library/metadata/`, `/library/parts/` or `/photo/:/transcode`; reject anything containing `..` or `//` before normalising; only echo when upstream `Content-Type` starts with `image/`; prefer the viewer's own token (`getPlexConnection(user.id)`) and 403 when they have none.
- **Files** `src/app/api/plex/image/route.ts`, `src/lib/plex.ts` (`fetchPlexImage`).
- **Done when** a test in `tests/` proves `/library/../status/sessions` is rejected and a non-image upstream is refused.

### WP-2 · Any user can claim any Plex username and inherit the admin token — **High**, M
- **Problem** `src/lib/plex-actions.ts:54-72` `savePlexUsername` stores any string. `src/lib/plex-history.ts:113-131` then resolves it via `/accounts` **with the admin token** and imports that person's 500 most recent plays. `src/lib/plex.ts:111` (`token: viewerToken || serverToken`) means any password-only account that types any username gets the admin's watched flags. The same name feeds `matchSession` (now-playing) and the webhook lookup (`webhook/route.ts:98-106`).
- **Change** Never fall back to the server token for per-viewer reads; return null and show "link your Plex account" instead. Only allow `plexUsername` to be set to a name not already claimed by another account, and only to names that appear as *managed* (restricted) users in `/accounts`. In the webhook, match on `plexAccountId` first and only fall back to username when no account id is present.
- **Files** `src/lib/plex-actions.ts`, `src/lib/plex.ts`, `src/lib/plex-history.ts`, `src/app/api/plex/webhook/route.ts`, settings copy in `src/components/settings-sections.tsx`.
- **Done when** a second account cannot import the first account's history by typing its name; test covers `getPlexConnection(userId)` returning null without a viewer token.

### WP-3 · Unverified e-mail lets a Plex sign-in land in someone else's account — Medium, S
- **Problem** `register` / `updateProfile` accept any address; `src/app/api/auth/plex/callback/route.ts:108-122` and `plex-profile-actions.ts:104-115` treat "same e-mail" as "same person" and attach the Plex identity + token to that row.
- **Change** Auto-link by e-mail only when the existing row has **no** `passwordHash`; otherwise ask the existing account to sign in with its password first and link from Settings. Treat an e-mail *change* as unverified for matching.
- **Done when** a password account with the victim's address does not receive the victim's Plex token on first Plex sign-in.

### WP-4 · Decompression bomb in Trakt import — Medium, S
- **Problem** `src/lib/zip.ts:65` `inflateRawSync(raw)` has no `maxOutputLength`; entry count is trusted; `parseJson` parses every member. 64 MB upload cap is on the *compressed* size.
- **Change** `inflateRawSync(raw, { maxOutputLength: 32 * 1024 * 1024 })`, cap total inflated bytes and entry count (~50), reject declared uncompressed sizes above the cap before inflating.

### WP-5 · Low / hygiene (batch, S)
- `CRON_SECRET` compared with `!==` in `api/lists/refresh` and `api/notifications/run`; reuse the webhook's digest `safeEqual`.
- `/api/search` and `/api/tv/[id]/season/...` are unauthenticated TMDB proxies — require a session (the comment in `list-actions.ts:414` already explains why).
- Add security headers in `next.config.ts` (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`); force `image/*` on both image routes.
- `register` has no rate limit; add an IP-or-global bucket.
- `push/subscribe` upsert on endpoint can re-parent another user's subscription; scope the update to `userId`.
- `auth.ts` `jwtVerify` should pin `{ algorithms: ["HS256"] }`.
- Optional `APP_URL` env var so redirect origin and the cookie `Secure` flag do not depend on `X-Forwarded-*`/`Origin` sniffing.
- **Privacy, not security:** `src/app/friends/page.tsx:153` shows "4,543 episodes · 405 movies" for people who are **not** your friends. The README promises nothing is visible until both sides agree. Drop the counts for non-friends (or show only "member since").

---

## 2. Loading time on the PWA

### What was measured (production build, `next start`, review DB with 4,949 plays / 160 shows, desktop, LAN)

| Route | TTFB | Complete | HTML | Notes |
|---|---|---|---|---|
| `/` (home) | 260–330 ms | 930–990 ms | 150 KB | warm *and* cold fetch cache gave the same numbers on this machine; the body streams for ~650 ms after TTFB because the page awaits one `Promise.all` |
| `/title/tv/1399` | 90–140 ms | 440 ms | 278 KB | |
| `/title/movie/27205` | 10–140 ms | 300 ms | 185 KB | |
| `/profile` | 60–80 ms | 190 ms | 243 KB | |
| `/discover` | 125–140 ms | 315 ms | 578 KB | HTML is 578 KB — a lot for a phone |
| `/achievements` | 120–160 ms | 220 ms | 219 KB | |
| Static JS (all chunks) | | | 1,056 KB raw / **337 KB gz** | home loads 12 scripts, 663 KB raw |
| CSS | | | 195 KB raw / **28 KB gz** | one 191 KB stylesheet; every page |
| Dev server, for comparison | home TTFB 2.2–2.8 s | | | so "slow" in `npm run dev` is expected and not the bug |

So the server itself is not slow on a desktop. The phone experience is the sum of: radio wake + TLS, a 300 ms server think-time before *anything* is sent, then a 150 KB document that only completes when the slowest section (whole-library resolution) is done, ~365 KB gz of static assets after every deploy, 20–30 poster requests to `image.tmdb.org` with no `preconnect`, and two pollers that fire on mount. In the Unraid container all of that is slower (weaker CPU, SQLite on a bind mount, TMDB round-trips from the home network). The fixes below are ordered by expected phone impact.

### WP-6 · Instant paint on launch — snapshot the shell and last home — M
- **Problem** `public/sw.js` deliberately never caches HTML/RSC, so every launch waits for the full server render before the user sees anything but the splash. That is the single largest contributor to "the PWA is slow". The stated reason (stale data must not look fresh) is valid, but it argues for a *visible* freshness state, not for a blank screen.
- **Change** In the service worker, for `request.mode === "navigate"` on `/`, `/calendar`, `/watchlist`, `/profile`: **stale-while-revalidate** — serve the cached document immediately and fetch in the background; on completion post a message so the page can show a small "Updated" pill or reload if the RSC differs. Store at most one entry per route, keyed without query string, and bypass when the request has `cache: reload`. Keep POST/server actions untouched. Add `navigationPreload` (already enabled) as the revalidate request.
- **Also** Add `<link rel="preconnect" href="https://image.tmdb.org" crossorigin>` to the layout head. Set `preload: false` on `Geist_Mono` (numerals only). Add `Cache-Control: public, max-age=31536000, immutable` to `/splash` and `/apple-icon` responses (or pre-render the 26 splash PNGs into `public/splash/` at build).
- **Files** `public/sw.js` (bump `VERSION`), `src/components/service-worker.tsx` (listen for the update message), `src/app/layout.tsx`, `src/app/splash/route.tsx`, `src/app/apple-icon.tsx`.
- **Done when** a second launch of the installed app paints the previous home within ~100 ms offline or online, and a freshness indicator appears when the background fetch lands.

### WP-7 · Stream the home page and cut its critical path — M
- **Problem** `src/app/page.tsx:98-141` awaits nine things in one `Promise.all` and has **no `Suspense`**; `src/app/loading.tsx` is generic (its own comment asks for a home-specific one). `getUpNext(user.id, 10)` and `getWatchStatuses` → `getShowCompletion` both call `groupWatchedShows` (full `WatchedEpisode` scan) and both fan `getTv`/`getSeason` over *every show ever watched* (`continue-watching.ts:34-75`). `getUpcoming(... maxShows: 40)` fans `getTv` again, and calls `getMovie` (full `append_to_response`) for **every** watchlisted film with no cap (`calendar.ts:142`). `getTv` drags `credits,reviews,recommendations,videos,images` (~64 KB JSON) into a status check (`tmdb.ts:392`).
- **Change**
  1. Move home into a route group `(home)` with its own `loading.tsx` shaped like the page (greeting, challenge strip, hero card, two rails).
  2. Render greeting + challenge bar + `FeaturedUpNext` first; put `UpcomingRail`, trending, friends activity, `OnThisDay`, recently watched each in an async server component behind `<Suspense>` with a matching skeleton.
  3. Make `getUpNext` derive from the single `cache()`d `getShowCompletion` pass (return `{ upNext, state }` per show) so the library is walked once per request.
  4. Replace `getWatchStatuses` on home (and in `Recommendations` on title pages, `poster-grid.tsx`, discover) with a cheap statuses map: watched-movie id set + started-show id set from two indexed reads. Only the title page's own show needs the TMDB-backed `completed` vs `continue` distinction.
  5. Add `getTvSummary` / `getMovieSummary` (no `append_to_response`, 1 h cache) and use them in `resolveUpNext`, `resolveShowState`, `showAirings`, and the watchlist-film branch. Cap watchlist films in `getUpcoming` at `maxShows`.
- **Files** `src/app/page.tsx` → `src/app/(home)/page.tsx` + `loading.tsx`, `src/lib/continue-watching.ts`, `src/lib/stats.ts` (`getWatchStatuses`), `src/lib/calendar.ts`, `src/lib/tmdb.ts`, callers listed in the perf audit.
- **Done when** home's first bytes carry the hero; `grep -c Suspense src/app/\(home\)/page.tsx` ≥ 5; a request log shows ≤ 1 TMDB call per started show and 0 for finished ones.

### WP-8 · Persist "next up" per show — L (the structural fix)
- **Problem** Even after WP-7, home still resolves N shows against TMDB on every render, so a cold cache (container recreate, image update) is a storm. Next's Data Cache lives in `.next/cache` inside the container, not on `/data`, so every update starts cold.
- **Change** New table `ShowProgress(userId, showId, nextSeason, nextEpisode, nextAirDate, state, resolvedAt)`. Written by `recordPlay` for the show just touched (it already knows the show), refreshed for shows whose `nextAirDate` has passed by the existing daily cron, and lazily for rows older than 24 h when viewed. Home reads rows; TMDB is consulted only for shows with a stale row. Until this lands, at least mount `.next/cache` under `/data` in `docker-entrypoint.sh` so the cache survives restarts.
- **Files** `prisma/schema.prisma` (+ migration with the design reasoning in comments), `src/lib/plays.ts` (`recordPlay`), `src/lib/continue-watching.ts`, `src/app/api/notifications/run/route.ts`, `Dockerfile`/`docker-entrypoint.sh`.
- **Done when** home does zero TMDB calls for an account whose rows are fresh.

### WP-9 · Poller hygiene and SQLite pragmas — S
- `src/components/now-watching.tsx:44-55` polls `/api/plex/now-playing` immediately and every 15 s with no visibility gate; the first poll can kick `syncPlexHistory` + `syncPlexWatchlist` while home is still rendering (`now-playing/route.ts:43-56`). Delay the first poll 3 s, gate on `visibilityState`, back off to 60 s when nothing is playing, skip `maybeSync` on the first poll after launch.
- `src/components/achievement-toaster.tsx` polls every 30 s and on every foregrounding; `/api/achievements/recent` runs `computeXp` (six queries incl. `play.groupBy` over the whole log). Raise to 90–120 s and return the level from a stored `User.xp` column, or only compute it when `items` is non-empty.
- `src/lib/db.ts` sets no pragmas. At client creation: `PRAGMA journal_mode=WAL; synchronous=NORMAL; busy_timeout=5000; temp_store=MEMORY; cache_size=-20000`. Home currently *writes* during render (`challengeRun.createMany`, `watchedMovie.update` in `backfillScores`, `NotificationRead` upserts) and those exclusive locks block every reader including the pollers.
- Move the inline `await getRatingContext(...)` in the title page JSX (`page.tsx` ~L520, ~L730) into the existing `Promise.all`; take `heroColours` (sharp decode) off the critical path by storing `edge`/`tint` in `TitleMeta` after first computation.
- Image sizes: activity and upcoming rails request `w780` backdrops for ~280 px cards; use `w500` with `sizes`.
- **Done when** a fresh launch issues no `/api/plex/now-playing` request in its first 3 s and `PRAGMA journal_mode` returns `wal`.

### WP-10 · Client bundle — S
- 84 `"use client"` files, **no `next/dynamic` anywhere**. Lazy-load `SearchOverlay` (458 lines, on every page via `Nav`), the toaster's `BadgeMedal` (32 named lucide icons), `AvatarCropper`, `ReviewSwipe`, `SpotlightCarousel`, `Heatmap`/`MonthlyLine`. Split `Nav` into a server shell with small client islands (search shortcut, menus). `settings-sections.tsx` (1,265 lines, 12 `useState`, no effects) can be server chrome with client form bodies.
- `/discover` HTML is 578 KB; trim the serialised props (full TMDB objects are being passed where the card needs six fields).

---

## 3. Design: make shows, films and episodes look like the rest of the app

### What is wrong today (see screenshots `light-mobile-title-tv-1399.png`, `dark-mobile-title-tv-1399-episode-1-1.png`, `dark-desktop-title-tv-1399.png`)
1. **On a phone, a show or film page is a different app.** The header disappears, a floating back row with its own bell and avatar replaces it, the page is forced dark whatever the theme, and cards become white-alpha glass. Then you tap an episode and you are back in the normal app: header, theme, ordinary cards. The transition show → episode → back is the most-used flow in the app and it changes worlds twice.
2. **Desktop title pages in the light theme** put dark text and pale score pills over a grey-washed backdrop (`light-desktop-title-tv-1399.png`): the hero is the one place in the app where contrast is poor.
3. **The episode page is a third layout**: still-as-card, chip row, an 8-tile emoji "how did it feel" grid that dominates the page and uses emoji where the rest of the app uses lucide line icons.
4. **A show page says "how far you are" three times**: rating slider, "That's it, folks" card, "Watch next" rail, then the season browser. The season browser's episode list is its own visual system (tiny 96 px thumbs, mono S/E chip, plain list) unlike the stills used in "Watch next" and the up-next cards.
5. **Seven tile recipes** for what is one thing (see §4), so "Landing soon", "Also waiting for you", "Trending", "Watch next" and the season list all frame artwork differently.
6. The mechanism behind (1) is the cost: `@custom-variant light` with a viewport hole, a full dark-ramp redeclaration under `html[data-theme=light]:has(.title-page):not(:has(.episode-page))`, six `ios-*` markers (91 uses) that each need a `light:` twin (only 3 of 47 `ios-dim` uses have one), 170 `light:` utilities, 60 `max-sm:` overrides doing title-page work. Nobody can add a card to a title page correctly from the component alone.

### WP-11 · One surface-token model (replaces `ios-*`, most `light:`, the `:has(.title-page)` hole) — M
- **Change** Semantic tokens set per context on one attribute; components use only semantic utilities and never a variant for theme:

```css
@theme {
  --color-surface: var(--surface);   --color-surface-2: var(--surface-2);
  --color-text: var(--text);         --color-text-muted: var(--text-muted);
  --color-text-faint: var(--text-faint); --color-border: var(--border);
  --color-accent: var(--accent);     --color-on-accent: var(--on-accent);
  --blur-surface: var(--surface-blur);
}
:root, [data-surface="dark"] { --surface:#11111c; --surface-2:#171724; --text:#e6e6f2; --text-muted:#9a9ab8; --text-faint:#6f6f8f; --border:#232336; --surface-blur:0; color-scheme:dark }
[data-theme="light"]         { --surface:#fff; --surface-2:#ececf3; --text:#16161f; --text-muted:#4a4a60; --text-faint:#75758f; --border:#dcdce8; color-scheme:light }
[data-surface="art"]         { --surface:rgb(255 255 255/.09); --surface-2:rgb(255 255 255/.18); --text:#fff; --text-muted:rgb(255 255 255/.62); --text-faint:rgb(255 255 255/.4); --border:rgb(255 255 255/.14); --surface-blur:16px; color-scheme:dark }
[data-surface="menu"]        { --surface:rgb(24 24 28/.72); --surface-blur:30px }
@utility card { background:var(--color-surface); border:1px solid var(--color-border); backdrop-filter:blur(var(--blur-surface)) saturate(160%) }
```

  `data-surface="art"` goes on the one element that sits on artwork (the hero), `data-surface="menu"` on `Popover`. `.card` becomes glass automatically inside `art`; `text-text-muted` replaces every `ios-dim text-ink-400 light:…` triplet; accent-filled states carry `bg-accent text-on-accent` and are untouched by context. Removes ≈250 CSS lines, all 91 `ios-*` markers, ~140 of 170 `light:` utilities, most of the 60 `max-sm:` overrides. Migrate incrementally: define tokens → convert title-page components → delete the unlayered block → convert the rest.
- **Files** `src/app/globals.css`, every component under `src/components` that carries `ios-*`, `AGENTS.md` (rewrite the theming paragraph).
- **Done when** `grep -r "ios-" src | wc -l` is 0 and the title page renders correctly in both themes at 390 px with no rule keyed on `.title-page`.

### WP-12 · Title pages adopt the app's own language — M (mockups: `mockups/Main.dc.html`, `Movie.dc.html`, `Episode.dc.html`, `ShowDesktop.dc.html`)
- **Keep the header and tab bar on title pages.** The back button lives in the header slot (left of the logo on phones), as the episode page already does. No floating chrome, no bell/avatar duplicate.
- **Hero = the home page's featured card, not a full-bleed page.** A `rounded-2xl` art card (backdrop with the same `scrim-b` used by `FeaturedUpNext`), logo or title on it, the poster tucked into the bottom-left corner on desktop. Everything else sits on the page surface in the theme's colour, so light mode is simply light. The film's palette survives as the card's own glow (`box-shadow` from `heroColours.tint`), not as the page background.
- **One meta row** (chips: year · runtime · genres · status), **one score row** (the four outline score pills, same in both widths — today mobile shows bare numerals and desktop shows pills), **one action row** (Watch/Mark, Save, Love, more).
- **One progress block for shows**: the `ShowProgress` card carries the bar *or* the verdict ("More to come" / "That's it, folks"), the "last watched" line, and the **next episode as an inline row** with a tick — the separate "Watch next" rail goes; the rail's stills move into the season list.
- **Season browser uses the still tile**: segmented season chips (as now) above a list whose rows use `Tile ratio="still"` at 128 px with the S/E chip drawn by `OVERLAY_PILL`, title, air date, runtime, `WatchedPill`, tick. Same tile as "Also waiting for you" and the episode page hero, one size down.
- **Episode page** follows the same skeleton: header with back, still card, title + chip row + actions (thumb up / thumb down / tick), synopsis, then "How did it feel" as a *single row of pill chips* with lucide icons (Heart, Sparkles, Laugh, Zap, Ghost, Coffee, Moon, HelpCircle), tally counts inside the chips, previous/next episode as two `Tile still` cards, cast rail.
- **Reviews, comments, recommendations** keep their current cards; they already match the app.
- **Files** `src/app/title/[type]/[id]/page.tsx` (split per WP-15 first), `title-hero-art.tsx`, `title-backdrop.tsx`, `back-button.tsx`, `season-browser.tsx`, `up-next-rail.tsx`, `show-progress.tsx`, episode page, `title-feelings.tsx`.
- **Done when** show → episode → back keeps header, theme and card style constant; the light theme on a title page is legible at every width.

### WP-13 · `Tile` primitive — S
- Seven recipes today (bordered 2:3 with caption below ×4 copies; borderless 2:3; bordered 16:9 caption-on-art ×3 copies; card-with-body; translucent 16:9; fixed ring thumb; three row-thumb sizes). Build `<Tile ratio="poster|wide|still|mosaic" frame="bordered|glass|none" caption="below|onArt" size>` in `media-card.tsx`; migrate `discover-sections.tsx:94,150`, `profile-panels.tsx:227`, `comparison-panel.tsx:105`, `episode page :312`, `activity-rail.tsx:72`, `upcoming-rail.tsx:75`, `up-next-rail.tsx:640`, `season-browser.tsx:917`, `list-card.tsx:30`. The three overlay chips that re-type `OVERLAY_PILL` by hand (`up-next-rail.tsx:42`, `season-browser.tsx:954`, `list-card.tsx:58`) import it. Add `<Thumb size="sm|md|lg">` for row thumbnails.

### WP-14 · Small design fixes seen while browsing — S
- **Theme switch leaves the body colour stale.** `src/components/theme.tsx` `apply()` only flips `data-theme`; `layout.tsx:229` paints `backgroundColor` inline on `<body>`, which beats the stylesheet, so switching theme in the menu leaves the old flat colour under the new ramp until the next full navigation (visible in `screenshots/light-desktop-home.png`: dark inline body under a light ramp). Set `document.body.style.backgroundColor` in `apply()` too, or move the inline colour to a CSS variable on `<html>` that the ramp overrides. Also: with `theme: "system"` every page load whose OS theme differs from `themeResolved` triggers a `saveTheme` write; debounce or only write from the switcher.
- Achievements: on an account with imported history the "New badges" section lists 29 cards at once; collapse to one line ("29 badges earned from your imported history") with a disclosure.
- Discover: the category chip row (Trending / Popular shows / …) sits *below* the genre tiles and reads as a footer; move it under the Everything/Shows/Movies toggle.
- Home: "Landing soon" shows wide cards with chips on art while "Also waiting for you" shows card-with-body — after WP-13 both use `Tile wide`.
- Episode page: feelings copy "How did it feel? Everyone here can see this." → the chip row's caption; keep the privacy note but as a tooltip on the first chip.
- Title page: the rating slider ("One of the greats · Clear · 100%") sits above the show's status card and reads as the show's score; put it under the status card, and only after "Watched".

---

## 4. Simplification

### WP-15 · Split the two 1,300-line files — M
- `src/app/title/[type]/[id]/page.tsx` (931 code / 297 comment lines): `Hero` (L969-1213) → `components/title-hero.tsx`; `MovieView`/`TvView` → `movie-view.tsx`/`tv-view.tsx` sharing a `TitleFrame` for the backdrop/`rise` preamble both repeat; `trackingState` + `findNextEpisode` → `lib/title-state.ts`; `Recommendations`/`Cast`/`Reviews`/`UpNext` → `title-sections.tsx`. Page becomes ~150 lines.
- `src/components/season-browser.tsx` (one 1,076-line component, 10 `useState`, 13 mutation handlers): L353-800 → `use-season-log.ts` returning `{ episodes, pending, actions }`; L295-352 → `use-season-episodes.ts`; episode row L883-1080 → `episode-row.tsx`; season tabs L1135-1200 → `season-tabs.tsx`.
- Also mechanical: `settings-sections.tsx` → `settings/*.tsx` one file per section + `settings/primitives.tsx`; `tmdb.ts` → `tmdb/{titles,episodes,facts,media}.ts`; `plays.ts` keep `recordPlay`/`resync`/`identity` together, move bulk and edit helpers to `plays/bulk.ts`, `plays/edit.ts`.

### WP-16 · One `Popover`, one `Button`, one `Modal` — M
- Five anchored-positioning implementations: `popover.tsx` (shared) plus hand-rolled copies in `catch-up-menu.tsx:45-98`, `watched-date-menu.tsx:117-183`, `user-menu.tsx:72-118`, `notification-bell.tsx:58-110` (≈235 duplicated lines). Give `Popover` `align="end"`, `zIndex`, `dismissOnOutside`, and the smarter `scrollMovedAnchor` test from `anchored.ts` (today it closes on *any* capture-phase scroll), then delete the copies.
- No `Button` component; 89 `bg-flare-600` lines, six variants (primary xl, primary sm, pill, ghost, glass-on-art, icon square). Add `components/button.tsx` with `variant` and `size`; migrate the top files (`smart-list-editor` 8, `settings-sections` 8, `seerr-button` 5, `season-browser` 4, `track-buttons` 3, `nav` 3).
- Six `createPortal` modals (`search-overlay`, `catch-up-dialog`, `season-request-dialog`, `achievement-dialog`, `avatar-cropper`, `trailer-button`) with no shared shell → one `Modal` (portal, scroll lock, backdrop, Escape).

### WP-17 · Data-layer duplication — S
- Three "first unwatched episode" implementations (`continue-watching.ts:146-172`, title page `findNextEpisode` L952-967 with **no aired check**, `actions.ts:453/586`). Two incompatible "has aired" comparisons across six sites (`continue-watching.ts:23`, `actions.ts:113` and `:513`, `season-browser.tsx:69`, episode page L108, `track-buttons.tsx:65`). Put one `hasAired(date)` and one `nextUnwatched(show, seen)` in `src/lib/dates.ts` / `lib/episodes.ts`.
- `${season}-${episode}` key built in 6 places; `${mediaType}-${tmdbId}` inlined ~25 times while `library-search.ts:38` already exports a helper. `today()` defined four times; `VOTE_FLOOR` twice; DB row → `NormalisedItem` hand-rolled in four places (`lists.ts:74`, `screensaver.ts:97`, `tonight/page.tsx:135`, `watchlist-grid.tsx:148`) — add `normaliseRow()` next to `normalise()`.
- Unbounded fan-outs the AGENTS.md rule forbids: `catalogue.ts:516-526` (`Promise.all` over 14 genres), `actions.ts:503-505` (every season), `stats.ts:297` (`backfillScores`). Use `mapLimit`.
- Per-row writes in loops: `stats.ts:302-307`, `notification-centre.ts:293-301` (`dismissAll` — `markAllRead` beside it already batches), `plays.ts:620-627` (`bury`), `lists.ts:188` (`getViewerState` re-run per stale list; hoist or `cache()` it).
- Profile page runs six independent full reads of `Play` (`getStats`, `getFunStats`, `getMostWatched`, `getWeekHistory`, `countPlays`, `getHeatmap`); `getStats` and `getFunStats` derive weekday minutes separately. One `loadPlays(userId)` behind `cache()` feeding all six.

### WP-18 · Dead exports — S
Remove or un-export (verify each is not used locally): `xp.ts: hasImportedHistory, computeXp`; `calendar.ts: toDateKey, daysBetween`; `catalogue.ts: DEFAULT_DISCOVER, buildDiscoverPath`; `challenges/index.ts: challengeById`; `export-csv.ts: csvRow`; `feelings.ts: findFeeling`; `friends.ts: areFriends`; `levels.ts: xpForLevel`; `lists.ts: refreshStaleLists`; `plays.ts: recordPlays`; `plex-seat.ts: placeholderEmail`; `plex.ts: getNowPlaying, getPlexItem`; `profile.ts: HISTORY_PAGE_SIZE, groupPlays`; `ratings.ts: omdbConfigured`; `recommend-actions.ts: dismissRecommendation`; `review.ts: periodRange`; `seasons.ts: SEASON_VALUES`; `seerr.ts: SEERR_STATUS`; `smart-filters.ts: CERTIFICATIONS`; `smart-lists.ts: mediumApplies, describeQuery`; `tmdb.ts: getEpisode, TmdbNotConfigured`; `secrets.ts: MisconfiguredSecret, SECRET_ADVICE`; `best-picture.ts: BEST_PICTURE_WINNERS`; `challenges/catalogue.ts: PER_MONTH`; `back-button.tsx: FLOATING_CONTROL`.

### WP-19 · Tests where the risk is — M
No tests for any `*-actions.ts` (the write path the UI depends on), `continue-watching.ts` (next-episode resolution), `tmdb.ts` normalisation (`normalise`, `getScore`, `pickTrailer`, `pickLogo`, `countAiredEpisodes` — pure, cheap), `what-to-watch*.ts` (1,559 lines), `achievements/` (1,438-line catalogue + `xp.ts`), Plex/Trakt mapping into `recordPlay`. Start with `toggleEpisodeWatched` / season bulk marks and `resolveUpNext` over fixtures; add the two security tests from WP-1/2.

### Comments
The reasoning-comment convention is good and should stay, but three files are past the point where prose outweighs code (`plays.ts` 0.40, `season-browser.tsx` 0.35, the title page 0.32) and 28 % of `globals.css` explains rule ordering that WP-11 removes. When splitting (WP-15), keep the constraint comments and drop the history ("it used to be…") unless the constraint is still live.

---

## 5. Missing features worth adding (principled, small)

Importers (TV Time, Letterboxd CSV) were declined on 2026-08-08 and are not proposed.

1. **Household log** (Plex Home instances): on the mark-watched menu, "Also log for Soraya" — one tap records the play for the other profile through `recordPlay` with `source: "household"`. The data model already has plays per user; this is the single most common real-world case for a family tracker (two people on one sofa).
2. **Freshness indicator + pull-to-refresh** on the phone once WP-6 serves snapshots.
3. **Manifest shortcuts** (`shortcuts: [Calendar, Search, Up next]`) and a `share_target` so a TMDB/IMDb/Letterboxd link shared to Trekker opens the title page (resolve by IMDb id via `find/{id}`).
4. **Season page as a route** (`/title/tv/[id]/season/[n]`) so the browser back button returns to the season you were in, the same reasoning that made the episode a page.
5. **"Where did the time go" on a show page**: the hours-on-this-show number already exists; add "at your pace, S03 finishes in ~2 weeks".
6. **Keyboard**: `j`/`k` in the season list, `w` to mark the focused episode, `?` for the sheet — the `/` shortcut shows the appetite is there.
7. **Notification digest**: one push per evening ("3 episodes landed today") instead of one per title, opt-in in Settings → Notifications.

---

## 6. Ground-up redesign concept (optional direction)

`mockups/Concept*.dc.html` (canvas page "Concept") sketch a from-scratch Trekker that keeps the principles — dark-first, artwork-led, one accent, numerals in mono, phone-first with a desktop that is the same app wider — but takes one risk: **the progress bar is made of the episodes themselves.** Every show is a *reel*: a strip of stills where watched frames are full-colour and unwatched ones are dimmed, so "15 of 21" is something you see rather than read, and the same strip is the season browser, the up-next card and the calendar entry at different sizes. Type: a compact grotesque with real character (Bricolage Grotesque, fallback system-ui) for titles, Geist for body, Geist Mono for numbers. Chrome is quieter (no glass, no gradients under the header, one flat ink surface), which makes artwork the only colour on the page. See `mockups/README.md` for the artboard list and what each one shows.

This is a direction to react to, not a plan; if it is wanted, it lands after WP-11/12/13 because they build the primitives it needs.

---

## 7. Suggested order

| Phase | Packages | Why |
|---|---|---|
| 1 (this week) | WP-1, WP-2, WP-4, WP-5, WP-14 theme fix | Security first; the theme bug is a five-line fix |
| 2 | WP-9, WP-6, WP-10 | Small, independent, each visibly faster on the phone |
| 3 | WP-7 → WP-8 | Home render cost; WP-8 is the structural one |
| 4 | WP-11 → WP-13 → WP-12 | Tokens, then the tile, then rebuild the title pages on them (mockups) |
| 5 | WP-15, WP-16, WP-17, WP-18, WP-19 | Simplification and tests, best done after the title rebuild so nothing is split twice |

---

## Appendix A · How the review was done
- Copied `dev.db` to a scratch file; seeded an account (`fable@review.local`) with a script and copied the admin's play history onto it so the dashboard was realistic (4,949 plays, 160 shows, 13 watchlist items). Nothing in the real `dev.db` was touched; `.claude/launch.json` gained a `trekker-review` configuration pointing at the copy on port 4311 — delete it if unwanted.
- Walked 26 routes at 1280×900 and 390×844 in light and dark with headless Edge (screenshots folder), then measured a production build with `next start` on port 4312, fetch cache present and removed.
- Three code audits (security, performance, UI structure) plus a data-layer pass; every claim above was checked against file and line.
- The Browser pane in the desktop app could not render the app reliably (screenshots timed out while the pane was hidden), which is why the sweep used a headless browser.

## Appendix B · Not changed, deliberately
- No code was modified. `docs/review-2026-09-10/` is the only addition, plus the launch configuration.
- The `.next` production build was regenerated for measurement; `.next/cache/fetch-cache` was moved aside and restored.
