# Trekker

A self-hosted TV and film tracker, rebuilt so that every screen renders from
SQLite and the installed app paints a cached shell before any data. The plan
is `skratch/rebuild-plan.md` in the current Trekker repository; this codebase
is built in the nine steps it sets out, and all nine are now built. Each
section below is what one step (or one review round) added.

## Step 1: Foundation

What exists now:

- **Stack.** Next.js 16 (App Router, React 19), TypeScript, Tailwind v4,
  Prisma 7 on SQLite through better-sqlite3, vitest. Standalone output.
- **Design tokens** from the approved mockups in `src/app/globals.css`, on
  `:root` and `[data-theme]`. The theme comes from the `trekker_theme` cookie,
  defaults to dark, and is corrected before paint by a small head script.
- **Fonts.** Bricolage Grotesque, Instrument Sans and Geist Mono through
  `next/font/google`, downloaded at build and served from this origin. Only
  the first two are preloaded.
- **Chrome.** The floating tab bar on phones and the 224px sidebar on desktop
  (from 64rem), collapsible to a 76px rail that remembers its state. The tab
  bar's active pill carries its label and takes a larger share of the width
  (`flex-grow` 2.4 against 1), and the share is transitioned over 250 ms, so
  a tab change slides the pill and its neighbours. It sits on the larger of
  an 18px float and the home-indicator inset, so in the installed app it rests
  just above the indicator.
- **Routes**, each with a placeholder page and a skeleton shaped like the
  real screen: `/`, `/discover`, `/calendar`, `/lists`, `/badges`, `/search`,
  `/settings`, `/profile`, `/history`, `/title/[type]/[id]`, and from step 3
  `/waiting`.
- **Sign in** at `/login`. Email and password are checked against the
  existing `User` table with the same bcrypt hashes, and the session cookie is
  the same signed token the current app issues, so both apps accept each
  other's sessions when they share `AUTH_SECRET`. The Plex button says it
  arrives in step 9.
- **Theme and sign out** work in Settings.
- **Service worker** (`src/sw/sw.js`, stamped into `public/sw.js` per build):
  pages served from cache first and refreshed in the background, `/_next/static`
  cache-first, TMDB images cache-first up to 300, the shell precached on install.

Every page renders at once with no data. That is the point of this step.

## Step 2: Data layer

Everything a list screen shows is now a row that a background job keeps
fresh; TMDB, Plex and Overseerr are called by that job and never on a render.

- **Schema** (`prisma/schema.prisma`): the current app's schema in full, plus
  `TitleState` (where each person is in each show), `ShowEpisode` (every
  episode of every followed show, shared), `TmdbCache`, `Availability` and
  `Person`; cached counts and backfill progress on `User`; the indexes the
  plan asks for. The earlier migrations are carried over unchanged, and
  `20260923150000_rebuild_data_layer` moves an existing database forward.
- **Popcorn ratings.** `Rating.score` is now 1 to 5. The migration converts
  percentages with `ceil(score / 20)` and keeps the original in
  `legacyScore`; episode thumbs become 4 (up) or 2 (down), keeping `liked`.
  Lossy by design.
- **`lib/tmdb.ts`**: read-through client over `TmdbCache`, lifetimes per
  endpoint (details and people 7 days, seasons 1 day, trending and search 1
  hour, images 30 days), stale answers served when TMDB is down, a 10 s
  timeout, no `next: { revalidate }`.
- **`lib/plays.ts`**: `recordPlay` and `removePlay`, the only writers of
  `Play`, the watched tables, the watched half of `TitleState` and the counts
  on `User`, each call one transaction. The duplicate windows are the current
  app's: 30 minutes for an episode, 4 hours for a film.
- **`lib/title-state.ts`**: the aired half from the cache, and Up next. (Landing
  soon and the agenda moved to `lib/calendar.ts` in step 3.)
- **`lib/refresh.ts`**: one in-process queue (concurrency 4, deduped by key,
  rate-limited per endpoint through `lib/gates.ts`). Returning shows every six
  hours, availability and watchlist enrichment daily at 04:00, the import
  backfill on first visit. The production server starts the timers itself
  (`instrumentation.ts`); `/api/cron?job=returning|daily|backfill` with
  `Authorization: Bearer $CRON_SECRET` runs the same jobs from outside, and
  the current app's `/api/lists/refresh` address runs the daily pass.
- **`lib/availability.ts`**: Plex and Overseerr lookups using the connections
  stored on the admin account, skipped when there are none.
- **Home** shows Up next and Also waiting from `TitleState`, streamed behind
  the step 1 skeleton, and a progress card while the backfill runs.

## Step 3: Home and Calendar

Both screens read rows and nothing else; the only TMDB they touch is the
cache table, for the Up next card's score and network.

- **Home** streams in tiers, each in its own Suspense boundary behind the
  matching piece of the skeleton (`components/home-skeleton.tsx`, shared with
  `loading.tsx`). Tier 1: the Up next card and Also waiting from `TitleState`,
  and the backfill card while it runs. Tier 2: Landing soon (today and the
  next three weeks, 21 days in all, headed "next 3 weeks")
  and Recently watched (the play log, one poster per title, fourteen of them,
  140px wide on desktop). Tier 3: the month's three challenges. Home is one
  flex column in the same order at every width: the challenges, the card,
  Landing soon, Also waiting, Recently watched. Below `xl` the challenges are
  a banner above the card that folds to one line ("September challenges · 2
  of 3 open"), a choice kept in `User.challengesCollapsed`; from `xl` they
  are three fixed 260px tiles beside the date, which do not fold, and the card
  carries Also waiting. Each challenge shows its name, what it asks and the XP
  it pays. Also waiting shows six rows (three in the card's panel from `xl`):
  surfaces like the calendar agenda on phones, plain rows from `lg`. Its head
  has the chevron to `/waiting`, and from `lg` a "Show all N" says the same.
  `/waiting` is "Still to watch": a back button to Home, the count and the
  hours left (every aired, unseen episode at its runtime), sort chips (Up next
  order, A–Z, Most left, Recently aired, in `?sort=`), and the same rows with
  the same tick and when-menu, two columns from `lg`.
- **Mark watched**, on the card and on each Also waiting tick, ticks at once
  (the tick scales in over the poster, holds and fades, two seconds in all), records through
  `recordPlay`, then re-renders Home from the new rows. The row advances in
  place to the show's next episode, and goes only when nothing more has aired:
  a tick from Home holds the show's place in Up next for the rest of the day
  (`TitleState.heldAt`, `20260923200000_up_next_holds_still`), where ordering
  by the latest viewing alone would jump it to the card. A viewing from
  anywhere else reorders at once, and the next day Home's ticks count too. The
  play-derived parts of Home (Recently watched, challenge progress) sit in the
  Next data cache under `plays:<userId>`, which the action expires with
  `updateTag` (Next 16's read-your-own-writes form of `revalidateTag`); Up
  next and Landing soon are uncached, because the refresh job changes them
  from outside any request, where no tag can be expired. After a tick, a small
  menu offers Yesterday, 2 days ago or Earlier; choosing moves that play to
  midday on the day (`redatePlay`) and closes it. Left alone it closes after
  five seconds, shown by a bar draining along its foot; a pointer or a touch
  on it holds it. The card's More menu has Go to show and
  Stop suggesting (a `DroppedShow`).
- **Calendar** at `/calendar?w=YYYY-MM-DD` (any day names its week, Monday to
  Sunday): the week strip with a dot per arrival and the agenda of only the
  days with something on phones, seven columns on desktop (one arrival is a
  poster as wide as the column, up to 180px, two are a 120px poster and a
  compact row, three or more drop to compact rows), and Coming up for the eight weeks after. Arrows
  everywhere, swipe on touch. What counts is `lib/calendar.ts`: air dates for
  shows you watch or have on your watchlist (dropped ones excluded), series
  premieres (from the episode list, or the show's first air date while no
  episodes are published), and cinema and streaming dates for watchlisted
  films. Watched items carry a tick; nothing else of your history shows.
- **Film release dates** are new columns on `WatchlistItem`, and the show's
  first air date on `TitleState` (`20260923180000_home_and_calendar`). The
  daily job fills the film dates for each row's region from the cached
  details and `/movie/{id}/release_dates`; a film out both ways is looked at
  monthly. The next refresh of each show fills `premiereDate`.
- **Marks**: the play mark (on Plex) or the amber clock (requested) on posters
  and wide tiles, from `Availability`. The daily job now also checks every
  show someone is part-way through, so the card can offer Play on Plex.
- **Rails** load their images when one IntersectionObserver per rail sees the
  row coming; no tile observes or measures itself, and every tile link has
  prefetch off. `next.config.ts` limits srcset widths to TMDB's own sizes.
- **Cached pages refresh themselves.** When the service worker paints a page
  from its cache, it now tells the tab once the server has answered, and the
  tab re-reads its server components with an "Updating" label, so a launch
  never leaves yesterday's Up next on screen.

## Step 4: Title, Episode and Film pages

These pages are the one place a render may reach TMDB, and only through the
read-through cache: details, artwork, a season, an episode's credits and
watch providers are each one request the first time anyone opens the title,
and rows after that. Everything personal is rows.

- **Series** at `/title/tv/[id]` (`components/title/series-page.tsx`), with
  `?season=N` choosing the season. Tier 1, awaited: details and the logo
  (`lib/title.ts`), this person's `TitleState`, the `Availability` row. The
  hero is dark in both themes: the backdrop at TMDB's `w300`, blurred, under a
  scrim that meets the page background at its foot. TMDB's own lettering
  replaces the typed title where there is one (English first), capped at 260px
  wide on phones and 420px on desktop. Under it the meta line, the score row
  (audience, friends' popcorn average, your rating) and the chips (Series, On
  Plex, network, "New on Sundays" from the next air date). Mark the next
  episode watched ticks over the poster and offers the when-menu, as on Home.
  The progress panel is the bar while there is ground to cover, and once
  caught up the written verdict in its place, "That's it, folks" for an ended
  show and "More to come" when a new season is on the way
  (`lib/progress.ts`); after Stop watching it says so instead. The episode
  list (tier 2) has season chips, a line of how far through the chosen
  season you are, a tick per episode (a tick on a
  watched one takes it back off), the Next marker and Mark whole season, which
  logs only the aired gaps. Availability's streaming offers, the cast, how it
  felt (the show's episodes gathered), comments and more like this are tier 3,
  each in its own Suspense boundary behind bones of its shape
  (`components/title/bones.tsx`). One tree serves both widths: phones draw a
  centred hero and one column ordered with `order-*`; from `lg` the same
  pieces sit in the mockup's grid, and from `xl` the right-hand column is on
  the artwork.
- **Film** at `/title/movie/[id]`: one-tap Mark watched with the when-menu;
  once watched it reads "Watched Friday" and offers another viewing or taking
  the last one back. The availability panel plays on Plex, or requests through
  Overseerr; if a service this person pays for already streams the title it
  asks first (`subscribedAmong` in `lib/providers.ts`). How it felt is chosen
  here.
- **Episode** at `/title/tv/[id]/episode/[season]/[episode]`: the still at
  `w780`, the show's lettering and the code, Mark watched beside Play on Plex,
  the popcorn panel with friends' average and TMDB's score, the synopsis, the
  cast for this episode (regulars, then guest stars marked as such), how it
  felt, and previous and next across season boundaries: a pill where the tab
  bar would be on phones, two cards on desktop.
- **Cast** at `/title/[type]/[id]/cast` with Cast, Crew and, for a show, Guest
  stars (`?f=crew`, `?f=guests`). A show's cast and crew are TMDB's aggregate
  credits with episode counts; guest stars are counted from the seasons, and
  anyone who only ever guested is listed there rather than under Cast.
- **Person** at `/person/[id]`: the hero is the backdrop of what they are best
  known for, stored on `Person` when the person is fetched; "seen N of M" and
  a filmography with a tick on everything seen, filtered to Everything,
  Unseen or On your services (on Plex, or streaming on something they pay for,
  as far as the daily job has looked). Talk shows, news and appearances as
  themselves are left out of the count.
- **Popcorn.** The five buckets (spilled, empty, half full, full, golden) are
  inline SVG in `components/popcorn.tsx`; the picker writes 1 to 5 to `Rating`
  or `EpisodeRating` (keeping the current app's `liked` in step), and choosing
  the same bucket again clears it. People are 4:5 tiles, TMDB's `w185` photo or
  initials on a colour of their own.
- **Writes** (`lib/title-actions.ts` over `lib/title-writes.ts`): mark an
  episode, a season or a film, take one back, redate, rate, favourite, save to
  the watchlist, stop watching, feelings, comments, request. Viewings go through
  `recordPlay` and `removePlay` and expire `plays:<userId>` with `updateTag`;
  the rest re-render the page with `refresh()`. No layout revalidation.
  Watching a film takes it off the watchlist at once; a show goes once every
  aired episode is seen and the show has ended or been cancelled. Stop
  watching is offered on shows only, and not on a finished show watched to the
  end.
- **Feelings and comments** are visible to everyone signed in. Feelings are the
  current app's eight, as words. Comments show the newest two with "All N"
  in place, a box to add one, and a delete on your own. Friends-only reviews
  are not part of this step.

No migration: every table this step needs was already there.

## Step 4 fixes

The owner's review of steps 3 and 4, as one round.

- **Title pages.** The desktop right-hand column is 400px (`--title-aside`
  in `globals.css`), and one desktop poster width follows from it
  (`--poster-desk`, four across that column with 10px gaps, 92.5px): More like
  this shows four there, and the cast tiles, the actor's filmography and the
  recommendations page use the same width from `lg`. The desktop cast row is
  one row of whole tiles spread to the column's width under a "See all" link.
  Episodes fill down each column (`fillDown`). "Your rating" is a pill with a
  chevron. More like this has its own page (`/title/[type]/[id]/similar`), and
  comments theirs (`/title/[type]/[id]/comments`), each behind a chevron.
- **Headers.** Still to watch, Cast, More like this and Comments put the back
  button alone on the top row above the title (`BackHeader`), as the actor
  page does; the actor page's hero carries back and search at both widths.
- **Heroes** turn into the page over their last 120px, from near-opaque night
  through the page colour (`heroScrim`), so the light theme no longer lays a
  pale veil over the artwork.
- **Posters without artwork** are the surface with the title typed at the
  foot (`PosterPlaceholder`), at the poster's own size, wherever a poster is
  drawn. The wide Landing soon tile, which types its title already, stays plain.
- **Follow a person** from their page (`FollowedPerson`). The daily pass
  reads each followed person through the cached person endpoint and stores
  what is new in their parts and directing as `PersonNews`, announced or
  released; the first look only draws the line. Showing it is step 7's.
  Migration `20260923220000_follow_people`: two tables and two nullable
  columns on `Person`.

## Step 5: Lists and smart lists

Every list screen reads rows. Smart lists never rebuild on view: the daily
job keeps them, and opening one is a database read. The one place a list asks
TMDB while someone waits is what they are typing into: the smart list
editor's preview, the People search in it, and a list's Add titles search, all
through the cached client.

- **Lists** at `/lists` (`app/(app)/lists/page.tsx`), four rows. The
  watchlist and favourites are rails of posters (score top-right on the
  watchlist, the Plex or requested mark bottom-left on both); the watchlist's
  head says how many are streaming now and, on a desktop, carries "Sort:
  recently added" (recently added, A–Z, best rated, shortest, streaming now,
  in `?sort=`). My lists and Smart lists are tiles, one per list: a
  four-poster mosaic, the name (smart lists with the sparkle), the count and
  "rebuilt daily". Each empty row has its own dashed block from the mockup.
  Lists are made here and nowhere else: New list and New smart list in the
  desktop header, the plus beside search on phones, and the dashed tile at
  the end of My lists.
- **Watchlist and favourites in full** at `/lists/watchlist` and
  `/lists/favourites`: grids with the same sorts (favourites carry no length
  or services, so three of them). A watchlist poster shows its cross on
  hover, or after a long press on a phone. "Streaming now" means on a service
  this person pays for, or anywhere when they have named none. Titles with no
  known length or score sort last either way.
- **A list** at `/lists/[id]`: the first four posters blurred side by side as
  the banner (dark in both themes, the heroes' scrim), the name, "N titles ·
  hours · N watched", Pick one for me (a random title never started, or any
  when all have been), sort chips (unseen first, A–Z, shortest, best rated)
  and the grid. A manual list's posters carry the cross; a smart list's carry
  none, because a title taken off by hand would be back at the next rebuild.
  Edit renames or deletes a manual list and opens the editor for a smart one;
  Add titles searches TMDB and adds from the results. "Watched" is seen at
  all: a film watched or a show begun.
- **Request all** on a smart list, when Overseerr is connected: files a
  request for each unseen title not on Plex and not already requested, twenty
  at most per press, always behind a dialog. When some of them already stream
  on a service this person pays for, the dialog names them and offers to skip
  them, as the title page's Request asks first.
- **The editor** at `/lists/new` and `/lists/[id]/edit`
  (`components/lists/smart-editor.tsx`): the name, the whole question read
  back as one sentence, Simple or Advanced, six folded sections (What, Genre,
  Services, People, Status, Certificate) each saying on its closed header what
  it holds, the score slider (and years and length in Advanced, a decade and
  a maximum length in Simple), and the two leave-out toggles. The preview
  re-runs the very query Save will store, 450 ms after the last change, and
  shows the first twenty and how many the list would keep: pinned across the
  top on a phone, beside the controls on a desktop. Save writes the list and
  queues its first build (`scheduleSmartBuild`), which reads what the
  preview has just cached, so the list's "being built" line gives way within
  seconds.
- **The query** (`lib/smart-query.ts`, pure): one discover query per medium.
  Anything and Popular run the same query bar one thing: Popular carries a
  vote floor (300 votes for films, 100 for shows) and Anything does not. A
  minimum score brings no floor of its own (see the step 5 fixes). Genres all have to match; services are
  any of them, in the viewer's region. Trending is TMDB's own ranking and takes
  no filters: genre, score and years are applied to what it returns, and
  length, services, status, certificates and people cannot be (the editor
  says so). Certificates and people exist for films only, and a genre
  television has no equivalent for (horror, romance) drops the shows half
  rather than returning unrelated shows, which the editor also says.
- **Save on a title page** files and never makes a list. With no lists of
  your own it is the plain watchlist toggle it was; with any, it opens a menu
  of the watchlist and each manual list, ticked where the title already is.
  Smart lists are not offered. The episode page's Save is still the toggle.
- **The daily pass** now starts with the smart lists, one at a time, oldest
  first, sixty titles each into `MediaListItem` in TMDB's order; an outage
  leaves yesterday's rows and stamp alone. Lengths already known for a title
  are carried over, and up to 120 more are looked up through the cached
  details (a film's length, or a show's episode length times its episodes).
  Watchlist enrichment looks at 24 rows a pass, never-looked-at first, and
  again a week after each lookup. Only the stamp decides: the previous app
  also treated a missing length as stale, so a title TMDB has no length for
  was asked about on every pass for ever.

Migration `20260924090000_list_item_runtime` adds one nullable column,
`MediaListItem.runtime`.

## Step 5 fixes

- **Editor header.** `/lists/new` and `/lists/[id]/edit` put the back button
  alone on the top row above "New smart list" or "Edit smart list", as the
  Cast page does, at both widths. On a desktop the title and the preview's
  heading share one grid row aligned by first baseline, so the columns start
  level.
- **Auto-request new titles**, a switch in the editor shown only while
  Overseerr is connected, stored on `MediaList.autoRequest` (the current
  app's column, already there). When the daily pass rebuilds a list with it
  on, whatever is new since the last build of the same question is asked for
  after the availability sweep, by Request all's rule: unseen, not on Plex,
  not already requested, and skipped when it streams on a service the owner
  pays for. Twenty a list a day at most (`lib/auto-request.ts`); each request
  is recorded in `MediaListRequest`, so nothing is asked for twice. A list's
  first build, or its first after an edit, only draws the line. Migration
  `20260924120000_smart_list_auto_request` adds that one table.
- **Score, years and length are narrowings.** A minimum score no longer
  brings the 300-vote floor, which made 10 to 100 lose every lightly voted
  title that 0 to 100 had; the floor belongs to Popular and Top rated. The
  score bounds follow the rounded percentage the posters print. Date bounds
  from the shelf, a status and the years now combine to the tighter, where
  the years used to overwrite "released", "not out yet", Upcoming and Newest.
- **Status follows the medium.** Switching to films or to shows clears the
  statuses the new medium does not have (both keeps them all, since both
  vocabularies are offered there), a stored list is repaired the same way on
  reading, and each half of a "both" query sees only its own statuses.

## Step 6: Discover and What to watch

Every Discover rail is one TMDB answer kept in `TmdbCache` for an hour (the
trending lifetime): a few requests an hour for the whole instance, rows the
rest of the time. The ticks and marks on posters are rows.

- **Discover** at `/discover`, `?type=tv|movie` (`lib/discover.ts`,
  `components/discover/`). The Everything / Shows / Films chips reshape the
  page and skip what it cannot use (`discoverPlan`): Shows asks for no film
  list and Films for no show list, and on Shows the billboard row is the most
  watched series rather than cinemas. Tier 1, awaited: Trending. Phones open
  on the top three as a swiped set on a dark hero (see the step 6 fixes);
  desktop on them as wide cards, with Pick for me and Filters in the header.
  Then "Find your next watch", genre tiles (a rail on
  phones, all of them in two rows on desktop), beside the ranked chart
  for the rest of the twenty; the billboard row; four more rails; and two
  groups, On the horizon (upcoming shows and films) and The hall of fame (the
  highest rated of each). Genres and the billboard stream as tier 2, each rail
  on its own, the groups last. Posters carry the score top-right, or the watched tick in its place (a
  film watched or a show begun: two `IN (...)` queries per rail), and the Plex
  or requested mark.
- **Genre artwork comes from the cache only**: the genre page's own first
  poster once somebody has opened it, else a title of that genre among what
  the page already loaded. Fourteen discover requests to decorate a row of
  links is the fan-out the page exists to avoid.
- **Category pages** at `/discover/[category]` (trending, in-cinemas,
  popular-tv, popular-movies, new-shows, upcoming, upcoming-tv,
  top-rated-movies, top-rated-tv), one TMDB
  page at a time with Previous and Next; page one is the rail's own cache row.
  **Genre pages** at `/discover/genre/[slug]`, narrowable to films or shows,
  built by the smart list query builder: a genre television has no equivalent
  for (horror, romance) drops the shows half and says so, and is not offered
  as a tile on Shows.
- **What to watch** at `/discover/what-to-watch`: four questions, one page
  each, in the mockups' order (who, a film or a show, the mood, how long),
  every answer in the address, so the browser's back button walks the
  questions. The in-page Back returns to the previous question with its answer
  still chosen (`?was=`). The catalogue is the current app's in full
  (`lib/what-to-watch-quiz.ts`): four audiences, each with its own moods, and
  a time question per medium. The progress line carries the answers so far
  ("Just me · a show"). The mood tiles have artwork, read under the answer that
  leaves the length open, which is also the first page the results ask for.
- **Results** at `/discover/what-to-watch/results`: Tonight's pick on its own
  dark hero with the lettering, why it was chosen, Play on Plex when it is
  there, Details, and Not tonight, which deals again without it (`?not=`,
  `?roll=`); then the second and third choice and the wildcard, the best
  reviewed thing that matches. The query reuses the smart list builder for
  services, era and length, with the mood laid over it (`quizParams`); up to
  four pages per medium in a bounded fan-out, and a looser second pass when
  fewer than eight survive. The ranking (`lib/what-to-watch-picks.ts`, pure)
  leaves out films watched, shows finished or stopped and anything turned
  down, keeps a show under way, and puts what is on the viewer's services or
  the Plex server first; Tonight's pick is always one of those when any
  contender is. "Nothing quite fit" offers another mood.
- **The tab bar** gives way inside Discover (categories, genres, the quiz,
  the filter page), as it does inside Lists.
- Not carried over: the seasonal bands of the current app.

No migration: every table this step reads was already there.

## Step 6 fixes

The owner's review of step 6, as one round. No migration.

- **The mood question drew no tiles** on a cold cache. Its artwork was
  fetched before anything was drawn: eight or ten discover requests, four at
  a time, each allowed ten seconds, so the question stood on its skeleton.
  The tiles now read their artwork from the cache only and ask TMDB for what
  is missing behind the page (`vibeArtwork`), so every mood is a tile at
  once; a mood with no poster yet is the placeholder tile, the surface with
  its words in ink.
- **The phone's spotlight** (`components/discover/spotlight.tsx`): this
  week's top three as wide cards on a dark hero (the #1's backdrop, blurred),
  swiped one at a time with scroll snapping, the next card's edge showing,
  each with its place, score, title and line, and three dots under them, the
  lit one amber. It does not advance by itself. The hero's Watchlist and
  trailer buttons went with the single #1.
- **The chart** numbers its places as the current app does: a big solid
  figure in the faintest fill (`surface-2`), centred in a gutter beside the
  poster and resting on its foot, 62px (54px for two digits) on phones and
  72px (62px) on desktop, in a 48px gutter (76px for two digits). Phones
  chart #2 to #20, desktop #4 to #20.
- **Sizes.** From `xl` the genre column is 520px, so its eight tiles are
  124×96 in two rows, 200px tall, and the chart's posters are 133×200 beside
  it: the two sections are the same height without anything stretched. Genre
  tiles are 118×92 on phones. The top three hold the mockup's 368:220 and grow
  with the column. In cinemas is 176×100 on desktop and 140×80 on phones.
  (The desktop sizes now follow from the capped column: see Desktop width
  fixes.)
- **Four more rails** after In cinemas, each streamed in its own boundary
  and each with a page of its own: Things you may like (TMDB's
  recommendations for the last five titles watched, taken a place at a time
  from each, deduplicated, unseen only; `/discover/for-you`), Popular shows,
  Popular films and New shows (on the air, newest first). All are cache rows
  with the hourly lifetime, and follow the Everything / Shows / Films chips;
  on Shows, Popular shows is already the billboard and stands down.
- **On the horizon and the hall of fame** are plain sections under a mono
  eyebrow now, not tinted bands: a band tinted from its first poster would
  need that poster's colour, which nothing here knows without downloading it.
  (Bands again since, lit by a backdrop rather than tinted: see Desktop width
  fixes.)
- **Pick for me** is a plain ghost button with an amber sparkle, as the rule
  has it; the exception STYLE.md carried for it is gone.
- **Filters**, in the header on desktop and as an icon button on phones,
  lead to `/discover/filters`: Everything, Shows or Films; Popular, Best
  rated or Newest; genre and services in the smart list editor's folded
  sections; score, years and length on its sliders; the two leave-outs; the
  question read back as a sentence; and a page of results under them with
  Previous and Next. The whole question is the address
  (`lib/discover-filters.ts`), and it is the smart list builder's question
  (`toSmartFilters`), one TMDB page per medium per screen through the cache.
  The shared controls moved to `components/filter-controls.tsx`.

## Step 7: Profile, Badges, Friends, Notifications and Search

No migration: every table this step reads and writes was already there
(`UnlockedAchievement`, `ChallengeRun`, `TitleMeta`, `Friendship`,
`Recommendation`, `NotificationRead`, `PushSubscription`, `PersonNews`, the
level columns on `User`). New dependency: `web-push`.

- **Levels** (`lib/levels.ts`, pure): the current app's table and names in
  full. An episode 12 XP, a film 45, a show finished 300, a franchise complete
  750, a rating 8 and a review 25 more, badges 150, 300, 750 or 2,000 by tier,
  challenges what they paid when won. Level *n* needs `400 × n^1.7`, capped at
  50; the rank changes every five levels, Rookie to Legendary. Everybody starts
  at 0: plays carry their source and badges `carried`, so an imported history
  counts only towards the lifetime figure (`achievements/xp.ts`).
- **Badges** at `/badges` (`lib/achievements/`): the thirty-seven achievements
  in six groups (Milestones, Habits, Seasons, Taste, Completion, People), and
  the twenty-five named franchises as badges in Completion, 62 in all, with the
  97 Best Picture winners matched by title and year. Tier 1 is the stored
  unlocks: the level card (the last thing watched, blurred, behind the level
  and the XP line) and the group chips (a list with counts on desktop).
  Progress is measured from the whole history in a streamed boundary
  (`boardFor`), anything reached is written as it goes, and a badge once earned
  is kept when the count behind it falls. A seasonal badge out of season with
  nothing counted says when it opens ("Opens 1 October"). The board also writes
  the level's two completion counts (shows finished, from `TitleState`;
  franchises complete, from TMDB collections).
- **Title facts** (`lib/title-facts.ts`): genre, language, year, length and
  franchise, kept in the shared `TitleMeta`. What it lacks is read out of
  `TmdbCache` first (any title someone has opened), then asked of TMDB, eighty
  titles and twenty-five collections a visit, behind the page through the
  refresh queue; the page says how many are still being looked up. The monthly
  challenges read the same table, so they gain from it too.
- **Unlocks after a viewing.** Every action that logs, removes or redates a
  viewing now goes through `viewingChanged` (`lib/viewing.ts`): it expires the
  play tag as before and the bell's, and runs the rows-only unlock check behind
  the response, at most every two minutes per person.
- **Profile** at `/profile`: the dark hero (the chosen backdrop, else the last
  thing watched), avatar, name, "Watching since" and friends, the level line;
  stat tiles from the cached counts on `User` (films, episodes, hours, the day
  streak and its best, ratings and their average, and this month's additions),
  on the hero on desktop. Then, each streamed: the twelve-month chart and the
  shows-against-films split from one grouped query over the play log, Recently
  watched (desktop), what ate your time this month, ratings and reviews with
  the popcorn bucket, the trophy cabinet from `UnlockedAchievement` alone,
  friends, and habits (the weekday strip, the busiest day and time, episodes a
  sitting, this year's favourite genre). One column on phones in the mockup's
  order, three from `lg`. Share and Edit profile on the desktop hero; the bell
  and Settings on the phone's.
- **Edit profile** at `/profile/edit` (also from Settings): the name, and a
  picture scaled to 512px in the browser, checked by its bytes on the server,
  and written to `avatars` beside the database (`/data/avatars` in the
  container, `AVATAR_DIR` to move it). Served by `/api/avatar/[id]?v=` with an
  immutable cache header: a new picture is a new address. Pictures the current
  app kept in `User.avatarData` are served and moved to a file on first read.
- **Other people** at `/profiles/[id]`: private until both sides agree. Anyone
  not a friend sees the name, the picture and Add friend (or Accept, or the
  request's Cancel); a friend sees the level, the stat tiles and the cabinet,
  and can be removed.
- **Friends** at `/friends`: requests in (Accept, decline) and out (Cancel),
  your friends with "Friends since" and how many titles you have both seen,
  everyone else here with Add and a box that finds them by name, and on desktop
  what friends watched, rated and saved this week. Asking someone who already
  asked you is agreeing. A request pushes to the other person's devices.
- **Notifications**: derived at request time, never stored, from indexed
  reads (`lib/notifications.ts`): airing today, a friend request, a
  recommendation, a badge earned, a challenge completed, the month's challenges
  up, news from someone followed ("New from Kyle Chandler", "Lanterns
  announced", only what came after the follow), and a smart list's overnight
  requests. Only read marks are written. Cached a minute per person and
  fetched by the browser after paint from `/api/notifications`, never in a
  layout; the same answer carries who is signed in and their level, which is
  now the sidebar's line and every avatar in the chrome. Desktop: a popover
  from the bell in the sidebar, over the current page. Phones: `/notifications`
  with New and Earlier, from the profile's bell. Mark all read, or open one.
- **The unlock toast** shows when the newest badge in that answer is newer
  than the last this browser announced; it asks the server nothing itself. The
  first sighting in a browser only writes the mark down.
- **Push**, per device: the switch in Settings (the rest of Settings is step
  8), `/api/push/subscribe` to add or remove this browser, the service worker
  showing the message and reusing an open window on a tap. The morning job is
  `/api/notifications/run` with `Authorization: Bearer $CRON_SECRET`, from an
  outside scheduler at a civil hour: what airs today and yesterday's news from
  people followed, in the bell's words, once a day per person; 404 and 410
  subscriptions are deleted. Needs `NEXT_PUBLIC_VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`.
- **Search** at `/search`, from the sidebar's field and the `/` key: the box,
  Everything, Shows, Films and People, answers grouped (five of each under
  Everything, three columns on desktop) with the score and the Plex or
  requested mark, people as 4:5 tiles, the placeholder poster where TMDB has
  none, and "Nothing called ...". Asked of `/api/search` 300ms after the last
  key through the cache table's hourly search lifetime; the query and chip are
  in the address, replaced rather than pushed. Recent searches are kept in the
  browser.

Not built at the time: `/history` (built in review round 5); and an
achievement's own page with what earned it is not part of this step; the
admin's "take a badge back" is step 8's.

## Desktop width fixes

The owner's review of Discover on desktop. No migration.

- **The content column is capped** at 80rem, 1280px including its 40px
  gutters, and centred in what the sidebar leaves (`--content-cap`, applied
  once in `app/(app)/layout.tsx`). The old app capped its pages at 72rem
  (`max-w-6xl`, 1152px) with no sidebar, so this is about a tenth wider.
  Heroes and dark bands still reach the column's full width behind the capped
  content (`bleed` in `globals.css`); the column clips sideways so the
  scrollbar `vw` counts cannot scroll the page. The hero's lettering is held
  to its column, which the cap narrows.
- **Rails show six and a half posters** across the capped column on desktop
  (`--poster-rail`: the column less six 12px gaps, over 6.5, so 173.5px at
  the cap), and wide cards four and a half (`--wide-rail`, 256px): Discover's
  rails and In cinemas, Home's Landing soon and Recently watched, and Lists'
  watchlist and favourites. On a narrow desktop they stop at 112px and 220px
  and fewer fit. Phones and More like this are unchanged.
- **The chart and the genre grid** are still one height from `xl`: the
  chart's posters are rail posters, and the genre column is sized from them
  (`--genre-h`, `--genre-col`), each tile a tenth wider than it is tall.
- **On the horizon and the hall of fame are bands again**, done properly: a
  dark block to the screen's edges on phones and past the cap on desktop, lit
  by the w1280 backdrop of the group's first title that has one (from the
  cached rows, no request of its own), lightly blurred under the heroes' scrim
  with its fade mirrored at the top (`bandScrim`), so it comes out of the page
  colour and goes back into it in either theme. The eyebrow, heads and
  chevrons on it are white; with no backdrop anywhere, it is plain night.
- **"Your rating"** in a title's score row has 6px more air between the pill
  and its label, matching the figures beside it.

## Title and Discover fixes

The owner's next round. No migration.

- **Title heroes use the backdrop.** Series, film and episode pages draw
  TMDB's w1280 backdrop, sharp, in place of the blurred copy, under the same
  scrim and fade (`BackdropArt` in `title/hero.tsx`); one image, the same URL
  for both widths. On phones the series and film hero drops its poster and
  the lettering stands large on the backdrop, 1.6 times its old size and
  capped at 320px (typed titles 54px). Desktop keeps its poster and 420px
  lettering beside it. A title with no backdrop keeps the poster hero.
- **Season chips** no longer carry counts; the line over the episodes says
  "4 of 8 watched · 4 to go" for the chosen season.
- **A series opens on the season you are in** when the address names none
  (`openingSeason` in `lib/progress.ts`): the season of the first aired
  episode not yet seen, the latest aired season once caught up, the first
  season before anything is watched.
- **The score row** is two shared tracks: figures and Your rating's pill
  centred on one line, the three labels on another, the pill 9px over its
  label.
- **Wide screens** (from 1880px, `wide`): the content is the window's width
  less 340px either side instead of the 80rem cap, centred beside the sidebar
  (see Wide desktop review); rails follow the wider column. The episode list stops at
  1100px there so its rows do not stretch.
- **Discover's row of categories**, under the filter on Discover and under
  the title on each category's page, carries the filter and leaves out what
  it empties (`categoryHops`). On the horizon and Hall of fame open the first
  of their two categories under the filter.
- **Grid pages** (categories, Things you may like, genres, filters) are six
  across on desktop and 24 to a page (`GRID_PAGE`), read as a window across
  TMDB's pages of twenty (`gridWindow`).
- **The top three** are a carousel at both widths (on desktop since replaced
  by three cards side by side: see Wide desktop review). The Trending chart
  starts at #4 on both.
- **The genre grid and the chart** are smaller from `xl`: the chart's poster
  is `--chart-poster`, 148px at the cap (107px since the Wide desktop review,
  with seven genres across), so three places stand whole in its
  column, more on a wider screen; the grid's two rows still match its height.
- **The bands' backdrop** is blurred 40px and saturated, as the heroes'
  blurred copy is, and runs 12% past the band on every side, so it reads as
  a wash and its soft edges fall outside.

## Review round 1 fixes

The owner's review of steps 1 to 7 as built. No migration.

- **Home.** The Up next card carries the next episode's synopsis under its
  chips on desktop (two lines, 15px, up to 560px wide, from the cached
  season), the show's name is 44px and the Also waiting panel 420px; on
  phones the episode line wraps to a second line. Two sections close the
  page: On this day (what was watched on this date in earlier years, the
  year on each poster, absent when there is none) and Friends watched (the
  Friends page's week, absent without friends).
- **The level is right before Badges is opened.** The import backfill ends
  with the badges page's full pass, and a backfill that finished before any
  pass (a database migrated earlier) gets one on the next Home visit, once:
  `levelSyncedAt` older than `backfillFinishedAt` is the sign.
- **The sidebar's name** takes two lines before it is cut.
- **Calendar.** A Backlog under Coming up, twelve at most, with the way to
  `/waiting`; Stop watching takes a show off (restyled as a poster rail: see
  Wide desktop review).
  Desktop day columns align to the top, and a day with two arrivals draws one
  poster and a compact row.
- **Title pages.** From `xl` More like this sits under Comments in the right
  column and shows eight; the heart, save and more buttons wrap together; the
  season's "watched" line and Mark whole season have the page colour behind
  them, legible over the hero's fade; the progress panel adds the time spent
  ("12h 40m watched"); a pending request shows the amber Requested chip on a
  series as on a film. **Recommend to a friend** in the More menu: a sheet of
  friends, each ticked once sent, which writes `Recommendation` (one per
  person per title, a second send bringing it back unread) and pushes to them.
- **Episode page.** The cast head shows on desktop too (the artwork was
  painting over it), and the phone's small lettering has a night backing in
  light, so it stays white.
- **Lists.** List grids are six across from `lg`, as Discover's; the smart
  list editor's Save bar on phones stands on the page colour.
- **Placeholders** type the title at the foot again (a `block` utility was
  overriding their flex layout).
- **Profile.** The sections start 32px under the stat strip on desktop.
- **Discover on phones.** The header keeps search and the avatar; Pick for me
  and Filters are two text buttons under the carousel.
- **Every mark-watched control** is named "Mark S03 E08 watched" (or "Mark
  watched" for a film), at both widths.

## Step 8: Settings, admin badges, screensaver and empty states

Migration `20260924150000_settings_notifications`: two columns on `User`,
`notifyFriends` (on) and `notifyChallenges` (off). Everything else Settings
writes was already a column: `providers`, `region`, `screensaverIdle`.

- **Settings** at `/settings`, whole. Every row saves as it changes
  (`lib/settings.ts` checks each value; `lib/settings-actions.ts` are the
  actions). Appearance: the theme, and the screensaver's idle minutes (Off, 5,
  10, 20, 30) with Start now. Your subscriptions: the known services TMDB
  lists for the region, as chips, from the cached provider lists (every known
  service until those are cached, and they are fetched behind the page);
  Request asks first when a title is on one of them. Region: a select of
  TMDB's watch regions (`lib/regions.ts`), defaulting to `WATCH_REGION`.
  Notifications: push on this device, then friends and recommendations, and
  the monthly challenges, both on the account. Connections: Plex, Overseerr
  and Trakt, Connected or Not linked, whose Manage and Link open a sheet
  saying they arrive in step 9. Badges (admin only), then Account: sign out,
  and Delete my account behind the typed word "delete", which deletes the row
  and, through the cascades, everything of theirs; the admin cannot delete
  while anyone else is here, since the server connections live on that
  account. Phones: one column under the profile card; desktop: the section
  list beside it, highlighting the section being read.
- **Pushes honour the switches.** `sendToUser` takes a topic; a friend
  request or recommendation is held back from someone who turned friends
  off, and the morning job adds "October’s challenges are up" on the first of
  the month for those who turned challenges on.
- **Take a badge back** at `/settings/badges`, the first account's alone
  (anyone else gets a real 404: the check is in `settings/badges/layout.tsx`,
  above any loading boundary, which is why Settings' own page and skeleton
  sit in the `(index)` route group): account chips with their counts
  (`?u=`), the chosen account's badges newest first, Take back on each.
  Only the `UnlockedAchievement` row goes (`takeBack` in `lib/admin.ts`);
  the history stays, so the next Badges visit earns it again if still true.
- **The screensaver** at `/screensaver`, outside the chrome, with its own
  stylesheet (`app/screensaver/screensaver.module.css`, loaded on that route
  only). The artwork is one title at a time from the person's history and
  watchlist, the w1280 backdrop the rows or the cache already hold (never a
  request), crossfading every twenty seconds once the next has loaded. Over
  it: the clock and date, drawn by the browser; the weather line; Up next for
  you; and, when Plex is linked, whoever in the house is watching on it, read
  from the server's sessions every twenty seconds while visible
  (`lib/now-playing.ts`, `/api/now-playing`), with our own poster for the
  title rather than a Plex image carrying the token. Any key, press, touch,
  wheel or real pointer move wakes it, after 800 ms, back to `?from=`. It
  holds a wake lock where the browser offers one, and re-reads itself every
  half hour.
- **Weather** (`lib/weather.ts`): Open-Meteo at the instance's place,
  `WEATHER_LATITUDE`, `WEATHER_LONGITUDE` and `WEATHER_PLACE`, else the
  admin's place carried over from the current app, else none. Kept an hour
  per place and unit (a failure five minutes); Fahrenheit where the region
  still uses it.
- **Starting on its own**: `ScreensaverIdle` in the app layout reads the
  minutes from the bell's answer (`Me.screensaverIdle`), so it asks nothing.
  Input only notes the time; one timeout checks it when the delay is up and
  re-arms for what is left (`lib/idle-timer.ts`), so there is no polling. A
  hidden tab or anything in full screen starts the wait over. By hand: Start
  now in Settings, and Screensaver in the avatar menu (step 9; the sidebar's
  screen button it replaced was step 8's).
- **Empty states**, one component (`EmptyState`): the first-run Home (no
  plays, nothing saved: a greeting by first name and three dashed cards, Search, Link
  Plex, Import from Trakt), Up next with nothing waiting, a quiet calendar
  week at both widths and an empty backlog, Badges with nothing earned, a
  profile with no history, Friends with no friends or nobody else here,
  Notifications with nothing yet, Search with no results in the mockup's
  words, and `/history`, still unbuilt, in place of the step placeholder.
- **Placeholder posters** keep the title bottom-left, never centred, now
  spelled out in the utility.

## Step 9: Plex, Overseerr and Trakt

Migration `20260924180000_connections`: on `User`, the two webhook secrets,
`plexSyncedAt` and an import's progress (`importSource`, `importStage`,
`importTotal`, `importDone`, `importStartedAt`, `importFinishedAt`,
`importSummary`); on `Availability`, `availableAt`, `requestedById`, `title`
and `poster`, with an index on `availableAt`. Additive only. Every token, key
and secret is sealed with `token-vault.ts`, as before; no token ever reaches a
browser.

- **Sign in with Plex** (`lib/plex-tv.ts`, `lib/plex-sign-in.ts`,
  `lib/plex-accounts.ts`): the login page's button is a link to
  `/api/plex/pin`, which asks plex.tv for a PIN and sends the browser to Plex's
  own page; Plex returns it to `/api/plex/pin/callback`, which polls the PIN
  (eight tries, 750 ms apart) and matches the token to an account: by plex.tv
  id, then by email (a password account is linked, not doubled), else a new
  account with no password. The same session cookie as a password sign-in.
  Signed in already (Settings, Plex, Sign in with Plex), it links the Plex
  account to the account in session, and refuses one someone else holds. The
  client identifier is the current app's derivation from `AUTH_SECRET`
  (`PLEX_CLIENT_ID` overrides it), so plex.tv sees one client.
- **Plex Home.** When the token's Home has more than one person, nobody is
  signed in yet: `/login/profile` asks "Who is watching?" with the Home's faces,
  owner first, a lock on those with a Plex Home PIN. The owner's token waits on
  the server for ten minutes (`lib/plex-handoff.ts`), the browser holding only
  a handle. A face is switched to its own token on plex.tv and seated at its
  own account (by plex.tv id, then a full member's email, else a new account;
  a managed profile gets the current app's `.invalid` placeholder address), and
  the household is made friends once (`plexHomeLinkedAt`). The current app had
  this screen at `/login/profile` too; its `/splash` is the iOS launch image.
  The avatar menu's **Switch person** (Plex Home accounts only) is
  `/api/plex/pin?switch=1`, which signs out and asks again.
- **The server** (admin; Settings, Plex, Manage): Choose a server lists what the
  admin's Plex account reaches (plex.tv resources, owned first, each address
  marked local, remote or relay); linking looks the server up again for its
  token, checks that the chosen address answers `/identity` as that same
  machine, and stores URL, token and machine id on the admin row. Test and
  Unlink beside it. Linking queues the whole availability sweep at once
  (`scheduleAvailabilitySweep`), so the Plex chip, Play on Plex and the marks do
  not wait for 04:00; after that the daily job keeps `Availability` as before.
- **Now watching in the house** on Home: whoever else is playing something on
  the server, with our poster, their name, the player, the code and progress,
  from `/api/now-playing` every twenty seconds. Rendered only when Plex is
  linked, and the poll stops while the tab is hidden. Your own session is left
  out, as in the current app. The screensaver's card reads the same endpoint.
- **Plays log themselves.** The Plex webhook (Plex Pass) is
  `/api/webhooks/plex?key=<secret>`, the address the Plex sheet shows with Copy
  and New secret; the current app's `/api/plex/webhook` answers the same way
  and also accepts its `PLEX_WEBHOOK_SECRET`, so a Plex server already pointed
  there keeps logging. Only `media.scrobble` counts. The viewer is matched by
  plex.tv id, then Plex name (which covers a managed profile); the title by the
  `tmdb://` guid on a film, else the daily job's `Availability` row for that
  library item, else the item's guids asked of the server with the server's
  token. Anything unmatched is acknowledged and dropped with a line in the log.
  Everything goes through `recordPlay`, so its duplicate windows (30 minutes
  for an episode, 4 hours for a film) make a webhook and the poll reporting one
  viewing harmless. For anyone without a Plex Pass, the now-playing read logs a
  session once it passes 90%, as the current app did. A wrong or missing
  secret is a 401, and failures are braked (five in fifteen minutes). Both
  webhooks sit outside the sign-in gate (`proxy.ts`).
- **Plex history** (`lib/plex-history.ts`): the current app's sync, now a job.
  Every half hour (`runPlexHistoryPass`, and `/api/cron?job=plex`) each account
  with a Plex identity has the server's play history read into its plays
  (history ids as `ratingKey:viewedAt`, the current app's form, so rows it
  wrote are recognised) and, once a day, the library's watched flags as that
  person, which catch what was marked watched without being played. Sync now
  in the Plex sheet runs both at once.
- **Overseerr** (admin; Settings, Overseerr): address and API key, checked
  against `/api/v1/status` and `/api/v1/auth/me` before they are stored; Test,
  Change and Unlink. Requests (the title page's Request, Request all, the
  nightly auto-request) now go in as the asker's own Overseerr account, found
  by Plex id, then email, then Plex name (`seerrUserFor`, kept ten minutes),
  and as the API key's owner when there is none. A request also records who
  asked and the title on `Availability`.
- **The Overseerr webhook**, `/api/webhooks/overseerr`, with the secret from the
  sheet as its Authorization header: pending, approved and auto-approved mark
  the title requested at once, declined takes that back, and Media Available
  marks it available and stamps `availableAt`, then checks that one title the
  way the daily pass does (so Play on Plex follows), and pushes and rings the
  bell of whoever asked and anyone with it on their watchlist ("Dune is on
  Plex", a derived notification like the rest, for fourteen days). The
  availability panel says Available until the server's item is found.
- **Trakt** (Settings, Trakt), as the current app did it, with no OAuth: link a
  public profile by username and API client id (verified against Trakt;
  `TRAKT_CLIENT_ID` is an instance-wide fallback), then Import now; or upload
  the export zip Trakt emails, read by the shape of its rows (`lib/trakt.ts`,
  `lib/zip.ts`). Either way the import (`lib/trakt-import.ts`) brings watched
  films and episodes with their dates, ratings as popcorn by the migration's
  `ceil(score / 20)` on Trakt's tens, and the watchlist, capped at 400 films and
  200 shows a run. Nothing known is doubled: a watched title is left alone
  unless its only record is an undated import row, which `recordPlay` adopts
  with Trakt's date; a manual tick and a rating made here are never replaced.
  It runs behind the request, its TMDB lookups through the queue, with a card
  on Home like the backfill's; when it ends it starts the backfill, which ends
  with the badge pass. Nothing is written back to Trakt.
- **The login page's poster wall** is this week's trending posters from
  `TmdbCache` when any are cached, the grey tiles otherwise; it never asks TMDB.
  A problem on the way back from Plex is said under the Plex button.
- **The avatar menu** (`components/avatar-menu.tsx`): the sidebar's profile
  card and the phone avatar open Profile, Settings, Screensaver, the theme and
  Sign out. The card's separate screensaver and Settings icons are gone, so the
  level line no longer truncates.
- **Still to watch**'s empty state is the dashed block with Browse Discover.

## Review round 2 fixes

Two migrations, `20260924200000_carry_imported_unlocks` and
`20260924210000_level_repair`.

- **Opening Badges no longer moves the level.** The badges read title facts
  that arrive a few at a time, so an imported history kept meeting genre,
  seasonal and franchise badges, and completing franchises, for days after its
  starting line was drawn, and each visit paid for them as if they had just
  been watched. The snapshot now carries the history on its own (imported plays
  and those before the line, `achievements/snapshot.ts`): a badge it meets is
  carried whenever it is noticed, and the completion counts' starting line never
  stands below what it completes. The migration marks carried any unlock an
  account with imported plays wrote before its line (or, with no line yet,
  before its first play logged here). `tests/level-invariant.test.ts` holds the
  rule: the Trekker figure is the same before and after a Badges pass, and only
  a native play changes it.
- **The first evaluation runs at server start** (`repairLevels`, from
  `instrumentation.ts`), offline and once per account (`levelRepairedAt`), so a
  database from the old app has its unlocks, completion counts and starting
  line in line with the history before anyone opens Badges.
- **The bell's cache key carries the level's rules version** (`LEVEL_RULES` in
  `achievements/xp.ts`). The Next data cache lives on disk and outlasts builds,
  and a bell answer from before these fixes ("LVL 6 · Novice") was being served
  once, stale, on the first Home visit, then corrected.
- **The avatar menu is portalled to the body**, placed from its button, so no
  card paints over it (Home's Up next card did, on phones). The sidebar's card
  is one button labelled with the name it shows. `Dialog` is portalled too, so
  every sheet escapes whatever opened it.
- **One stacking scale** in `globals.css` (`--z-lift` to `--z-toast`),
  described in STYLE.md; no bare z-index numbers remain.

## Wide desktop review

The owner's review on a wide desktop. No migration.

- **The column is centred beside the sidebar on wide screens.** Past 1880px
  the content was placed 340px from the window's left edge, so the gap after
  the sidebar was 116px narrower than the gap at the right. It keeps its width
  (the window less 340px either side) but is centred in what the sidebar
  leaves, as it is below the breakpoint (`--column-w`): 228px either side at
  1920 and 2560 with the sidebar out, 302px with the rail, and 40px and 82px
  at 1440. `bleed` needs no wide case any more. `tests/layout.test.ts`
  evaluates the custom properties at those widths and holds the margins equal.
- **Discover's top three on desktop** are three wide cards side by side, #1 to
  #3 from the left as the current app's spotlight runs, with no carousel,
  arrows or dots; `top-strip.tsx` is gone. Phones keep the swiped carousel,
  and Trending starts at #4 on both.
- **Every genre tile shows**: fourteen on Everything and Films, twelve on
  Shows. On desktop two rows, seven across (six on Shows); on phones one
  scrolling row, as before. From `xl` the grid still matches the chart's
  height, which at seven across makes the chart's poster 107px at the cap
  (`--chart-poster`) and the tiles 84 by 76, the name scaling with the tile.
  The genre page's row of genre chips, there only because Discover showed
  eight, is gone.
- **The calendar's backlog is a poster rail**: "Backlog" with the count and
  the chevron to `/waiting`, then the shows as rail posters, the next
  episode's code top-left and "N left" under each, most recently aired first,
  twelve at most, with no week groups and no tick (that is Still to watch's
  job, or the title page's). Empty, it is the dashed block as before. The
  skeleton matches.

## Review round 4: the old app's posters

The owner asked for the old app's poster placement and sizing on Home,
Discover, Calendar and Lists, in the rebuild's own style, and for more on
Badges. No migration.

- **One poster system** (`components/poster-card.tsx`, STYLE.md "Posters"):
  the standard poster card, 182×274 on desktop and 150×226 on phones, with the
  score bottom-left, the mark bottom-right and the title and "Show · 2026"
  under it; and the wide card, 318×178 and 260×145, on a w780 backdrop. Both
  are fixed sizes (`--poster-card`, `--wide-card` in `globals.css`), 9px
  apart, replacing `--poster-rail`, `--wide-rail` and the chart and genre
  sizes, which followed the column. Rails scroll with nothing fading in.
- **Home**: the challenges are a full-width strip above the card at every
  width, folding to one line and opening to the three tiles, the fold saved
  on the account as before. Then the card, Also waiting (the card's panel
  from `xl`, its own section below), Landing soon, Trending this week (new:
  Discover's cached trending answer, twenty standard posters, in a boundary of
  its own because it is the one Home read that may reach TMDB, once an hour),
  Friends watched, On this day, and Recently watched last. Landing soon is
  wide cards on the show's backdrop (`TitleState.backdrop`) or, for a film,
  the cached details' (`filmBackdrops`), with the "In 7 days" chip and a
  "Premiere" chip for a season or series premiere. Friends watched is the old
  app's rail (`friendViewings`): friends' latest twelve plays, every play,
  no window, each on the episode's cached still or the title's backdrop, with
  the friend, when, and "Again" for a rewatch on chips.
- **Discover**: the spotlight is the old app's, #1 large on the left with two
  lines of synopsis and View details, #2 and #3 stacked beside it with one
  line; on phones each card of the swiped set is the large card. "The rest of
  the top 20" is one row, full width, from #4, of 166×250 posters with the big
  faint number to the left. "Find your next watch" is one row of 184×86 genre
  tiles at every width, on the chosen title's backdrop. Every other rail is
  the standard poster card, and In cinemas the wide card.
- **Calendar**: backlog posters are 120×180 (108×162 on phones); a day with
  one arrival draws it up to 200px wide, a day with two draws two 140px
  posters stacked, three or more keep the compact rows.
- **Lists**: Watchlist, My lists, Smart lists, then Favourites. The rails and
  the watchlist, favourites and list grids are the standard poster card; the
  watchlist's and favourites' years come from `TitleMeta`, so a title not
  described there yet shows its kind alone.
- **Badges.** Choosing a group no longer waits on the server: the group, All
  / In progress / Earned, a tier and a search all filter on the client, and
  `?group=` is rewritten in place. Closest to earning shows the three started
  badges furthest along, with a ring and how many are left. The badge count
  has its own card under the level, and "Where the XP comes from" breaks the
  level into its sources (`computeXp`'s `sources`), with the lifetime figure.
  It folds away and remembers that on the account (`xpPanelCollapsed`).
  Legendary badges carry a gold-to-amber ring and edge. The tiers are Bronze,
  Silver, Gold and Legendary: the catalogue has no separate platinum tier
  (platinum is the legendary medal's metal).

## Review round 5: the profile rebuilt, and four fixes

No migration, no new dependency.

- **Poster marks back where they were** (STYLE.md "Posters"): the score
  top-right with the watched tick in its place, the Plex or requested mark
  bottom-right, short facts top-left. The same on the wide card (In cinemas'
  score moves from the foot to the corner) and on Discover's spotlight cards,
  phone and desktop, whose mark moves to the bottom-right.
- **Recently watched** on Home carries when each poster was watched, top-left
  on the dark art chip: "Today", "Yesterday", a weekday within six days, then
  "1 Mar 26" (`watchedWhen`).
- **Discover's desktop header** is two lines: the title, then the kind chips
  left and Pick for me and Filters right. Phones unchanged.
- **Badge icons.** Each of the 62 badges carries the old app's icon from the
  rebuild's set (`icon` in `achievements/catalogue.ts` and `franchises.ts`);
  eight stroke icons were added for it (rocket, gift, party popper, star,
  boxes, double tick, award, people). Tiles, Closest to earning, the trophy
  cabinet, the admin's take-back list and the unlock toast all draw it.
- **Profile** at `/profile`, to the round 5 mockup, every figure computed from
  rows in `lib/profile.ts` (ported from the old app's `stats.ts`,
  `fun-stats.ts`, `heatmap.ts` and `profile.ts`), no network on the request
  path. Tier 1: the hero (chosen backdrop, else the most watched show's, else
  the last poster; "Watching since · friends · hours"; the level disc and
  line with the lifetime level; Share and Edit profile; Badges and "Your
  year", which is `?range=year`) and the big number with its four cards. The
  range switch (This month, This year, Last year, All time, in `?range=`)
  drives everything below except the heatmap, the ratings and this week's
  record. Streamed, each in its own boundary keyed by the range: Your time
  (hours per year, or per month for a year, per day for a month; inline SVG,
  peak labelled), When you watch (minutes per weekday, the top day amber and
  its share), What you watch (the top five genres from `TitleMeta`, shares of
  the five), Every day (the last twelve months, amber by intensity against
  the busiest day), Most watched (top five, shows by episodes and films by
  viewings, minutes breaking ties), the trophy cabinet and friends, the eight
  habits (the biggest session ignores days holding more than 24 hours, which
  are imports on one timestamp; the actor comes from cast lists in
  `TmdbCache` via `json_extract`, one vote per title, two titles at least),
  Ratings and reviews (a rail of posters with the bucket, to the new
  `/profile/ratings`), and Everything you watched (this week, twelve rows,
  to `/history`). The window's plays are read once per request (`cache`).
- **History** at `/history`: everything, day by day, newest first, forty
  viewings a page with Newer and Older, the profile's rows.
- **Other people**: a friend's profile is the same page with the range, less
  Edit, Share, Badges, Your year and their friends; a stranger still sees the
  name and Add friend.

## Review round 6: six fixes

No migration, no new dependency, no new request.

- **Profile heatmap**: the last six months in one strip of 26 weeks
  (`HEAT_WEEKS`, starting on a Monday), at the cell size the two bands had,
  month letters above, "last 6 months" beside the title. The row of three
  cards keeps one height.
- **Person page**: a Seen chip between Everything and Unseen, at both widths
  (`?show=seen`): films watched and shows with any episode watched, the
  poster tick's meaning. The filters live in `lib/person.ts`
  (`filterFilmography`, `parsePersonFilter`).
- **Cast heads** on series and film pages are the standard section head at
  both widths: "Cast" and the chevron to the cast page, no count, no "See all".
- **The meta line** under a title is the old app's facts in its order: year ·
  up to three genres · "N seasons" (a film's "109 min") · "N votes" · status
  in the app's words, with the tagline in italics above it where there is one
  (`lib/meta-line.ts`, `TitleFacts`). The episode count, the "Series" /
  "Film" word, the year span and the director are gone from it.
- **Desktop title pages**: the hero row holds only the poster and the details;
  from `xl` the right-hand column starts level with the season chips (a
  film's cast) and runs beside the episodes and the cast, so the backdrop's
  right side is clear. The column now reads in the page's colours, not the
  hero's white, and the series cast shares the row with it rather than running
  under it. The skeleton matches.

## Review round 7: the year review, clearing, settings, the mark

No migration, no new dependency. Nothing new reaches the network on a
request path.

- **Your review** at `/review` (`?p=month&m=YYYY-MM` for a month), the old
  app's recap in the rebuild's design, from `Play` rows alone
  (`lib/review.ts`; the films' buckets from `Rating`, their years from
  `TitleMeta`). In order: a dark opening card with the hours counting up and
  "N solid days"; four tiles (episodes across N shows, films, longest streak,
  busiest day); the bars per month (per day for a month) with the biggest
  stretch amber and named; the show of the year as a standard poster card
  beside its time, the runners-up as a rail of cards; the films you got round
  to (the latest six, once each however often watched) as the standard grid,
  your bucket bottom-left where you rated one; and a dark closing line with
  Find the next one. Year and Month chips, a month stepper and a sideways
  swipe (all replacing the address), the month in progress never offered,
  empty states for January and for nothing logged. The cards rise into view
  and the figure counts, one IntersectionObserver each, and neither happens
  with reduced motion (STYLE.md, Motion). The profile's Your year opens it; the
  profile's own range switch is unchanged. The phone hero has no Your year
  button, so there was nothing to change there.
- **Clearing notifications**: Clear beside Mark all read on the phone page and
  in the desktop bell. The list empties and the dot goes at once (the bell
  provider's `clear`), then the server catches up (`clearAll` beside
  `readAll`, `dismissAll` in `lib/notifications.ts`). As in the old app it
  clears everything on the list, a pending friend request included: the
  request still waits on Friends, only the notice goes. It clears past the
  first thirty too, so nothing older surfaces behind the cleared ones, and
  moves each mark's `readAt` to now so the daily cap cannot prune a clear and
  bring it back.
- **Settings**, one page presented two ways (`components/settings/screen.tsx`,
  STYLE.md "Settings"). Every section has an address: `/settings` (Profile),
  `/settings/appearance`, `/subscriptions`, `/notifications`,
  `/connections`, `/badges` (the admin's, still behind its 404 gate),
  `/account`. On a phone each draws the whole page: You (the profile card,
  then Appearance, Screensaver, Your subscriptions, Region, Notifications),
  Your accounts elsewhere (Plex, Trakt), This instance (Overseerr, then Badges
  for the admin or a Servers card for everyone else), then Sign out and Delete
  as before; every setting a folded `<details>` card with its icon, title and
  current state on the header, the named section's card open and scrolled
  to. On a desktop, the list of sections with their summaries beside the one
  section; Connections is three tiles (Manage, or Link in the primary style)
  and a Plex panel: Server (the address and Connected; the server's name is
  not stored, so the address stands for it), Webhook (the address, fetched
  when the panel shows, with Copy), Watch history (Sync now) and Signed in as
  (Unlink). The connection cards keep the sheets: the card's header is the
  status and the fold holds the state and Manage/Link, which opens the sheet
  as before (the sheets are long, with forms, so inline would bury the rest
  of the page). The summaries follow the controls as they change, without a
  server round trip. Links that pointed at `/settings#…` now name the
  section, and a Plex sign-in comes back to `/settings/connections`.
- **The mark**: the old app's logo, as geometry in `lib/logo.ts`, drawn by
  `TrekkerMark`. `Wordmark` shows it in amber where the dot was, so the
  sidebar, the phone's top row and sign-in pick it up; the collapsed
  sidebar's disc carries it in black instead of a T. The app icons
  (`/icons/32`, `/180` for Apple, `/192`, `/512`) are the mark in black on an
  amber tile. The rebuild has no `icon.svg` or splash route, so there were
  none to change.

**To test by hand**

- Profile → Your year: the opening card counts up once, cards rise as you
  scroll; with the OS's reduced motion on, everything is simply there. Month:
  step back and forward, swipe sideways on a phone, check the right arrow
  stops at last month. A film you rated shows its bucket. Check light theme:
  the two dark cards stay dark with white type.
- Bell (desktop) and Notifications (phone): Clear empties the list and the
  dot at once; reload, it stays empty; a friend request cleared is still on
  Friends; something new arrives afterwards as normal.
- Settings on a phone: each card opens and closes, the summaries change as
  you change a control (theme, screensaver, services, region, both push
  switches), `/settings/notifications` opens with that card open. On a
  desktop: each list entry changes the address and the section, reload keeps
  it, back returns to the previous section, the list's lines follow the
  controls. Connections: Manage/Link opens each sheet; the Plex panel's
  webhook Copy, Sync now and Unlink; signing in with Plex comes back to
  Connections with the sheet saying how it went. Badges as the admin, and a
  404 for anyone else.
- The mark: the wordmark in the sidebar, phone header and sign-in at both
  themes; install the app (or look at `/icons/192` and `/icons/512`) for the
  amber tile.
- **The Up next poster** asks for the file its box needs: its `sizes`
  attribute now says 225px on desktop, matching the class that draws it at
  225×350, so a 2x screen takes TMDB's w500 rather than a stretched w342.
  The rule for every poster: change the class and `sizes` together.
- **Round 7 follow-ups:** the review's films are a rail like the runners-up
  rather than a grid that wrapped one poster onto a second row; the phone
  profile header has a sparkle button to `/review`; and `compress` is off
  under `next dev` only, which stops Node's Gzip drain-listener warning on
  streamed action responses (a Next 16.3 dev-server quirk; production and
  the proxy in front of it still compress).

## Motion: M1 to M7

The motion plan (`docs/motion-plan.md`), steps M1 to M7. No migration, no new
dependency, no motion library, and nothing new on a request path. Every
animation is catalogued in STYLE.md, Motion, with its duration, easing and
file; the five rules are there too. `tests/motion.test.ts` pins what can be
read without a browser.

**M1, foundation.** `globals.css`: `--ease-out`, `--ease-in`, `--ease-spring`
in `@theme` (so they replace Tailwind's own, and every `ease-out` in markup is
the plan's curve) and `--fast`, `--base`, `--slow` on `:root`; the tick's two
keyframes run on them. `components/presence.tsx`: `usePresence` and
`Presence`, which keep a closing thing mounted for its exit and mark it
`data-state="open" | "closed"`; the exit's length is told rather than read
from `animationend`, so a keyframe that never runs cannot strand a panel, and
with reduced motion it does not wait. The tab bar (`tab-bar.tsx`) and the
settings fold's chevron (`settings/facts.tsx`) are on the tokens; the
review's reveal uses `--ease-out`. STYLE.md Motion is rewritten to the five
rules and the catalogue.

**M2, press and hover.** `components/motion.ts` holds the shared classes:
`PRESS` (scale 0.97 while pressed, `motion-safe:`, never when disabled) on
`buttonClass`, `iconButtonClass`, `filterChipClass`, `smallChip`, the title
pages' buttons (`title/styles.ts`), the Up next card's buttons, the lists'
glass buttons and the ticks; ghost buttons and unchosen chips lift to
`surface-2` under a pointer (Tailwind's `hover:` only matches on devices that
hover). `LIFT` raises poster and wide cards 2px on a desktop hover with a
deeper shadow that is a pseudo-element fading in (`poster-card.tsx`); the card
rail keeps 12px of room above and below so the scroller does not clip it
(`rail.tsx`). `ROW_WASH` is a fading pseudo-element behind Also waiting,
notification, search, friends and Most watched rows; history rows lift their
fill. Segmented controls slide one pill (`segment-pill.tsx`, with
`segmentOption` and `segmentChip` in `motion.ts`): Theme, Screensaver, the
smart list's Simple/Advanced, the review's Year/Month and Discover's
Everything/Shows/Films. Switches (`switchTrackClass`, `switchKnobClass` in
`ui.tsx`, used by Settings, push and the filter rows) move the knob by
`translate` and fade the amber over `--fast`.

**M3, sheets, menus, dialogs, toasts.** `Dialog` (`lists/dialog.tsx`) reads
its `Presence`: up from the foot below 40rem, where it is a sheet, from 0.96
above it, the shade fading (`motion-sheet`, `motion-scrim`); on a phone its
new grab bar drags it, closing past 80px and springing back short of it. Every
caller wraps it in `Presence`: the list dialogs, Plex, Overseerr and Trakt,
Delete my account, Recommend. Every popover is `motion-pop`, from its anchor's
corner over `--fast`: `usePopover` now returns `shown` and `state`
(`title/popover.tsx`, with `menuOrigin`), used by the title, list, sort,
new-list and watch menus, Request's question and the rating; the card's
more-menu, the bell, the avatar menu and the when-menu keep what they showed
while they leave. The unlock toast slides in from the top on phones and from
the foot on desktop (`motion-toast`). The smart list editor's and Discover
filters' folds open and close by `grid-template-rows` (`FoldRow`,
`motion-fold`).

**M4, rails and lists.** Rails snap on phones (`x proximity`, cards to the
20px gutter, off from `lg`). Section-head chevrons nudge 2px on hover.
`exit-list.tsx`: `ExitList` keeps a row that has gone and collapses it (a fade
over `--fast`, then its grid row to nothing over `--base`); Also waiting on
Home (both places) and `/waiting` use it, so `WaitingRow` is now a `div`
inside the list's `li`. Clearing notifications collapses the list and the
empty state rises into its place (`bell.tsx`, `notifications-screen.tsx`). A
poster taken off a list or the watchlist fades and shrinks
(`motion-leave`, `title-grid.tsx`).

**M5, Home and the tick.** `swap.tsx`: after Mark watched, Up next's words
fade out and the next episode's rise in 6px; if the show changes, the poster
crossfades under the tick, which plays on over both. Progress fills are a
full-width bar slid by `translate` over `--slow` (`FILL`, `fillTo`): the
challenge strip, level lines, the profile hero, badges, Now watching, the
backfill and import cards, a title's progress and a person's. `Count` moved
to `count.tsx` (so Home does not load the review's stylesheet) and gained
`on="change"`, which the challenge strip's open count and XP to win use.

**M6, title, episode and film pages.** The backdrop (`BackdropArt`) settles
from 1.04 to 1 over 1.2s once it has loaded (`settling-image.tsx`, in its own
`hero-settle.module.css` because it is longer than `--slow`). A season's
episodes cross over the last in one grid cell, so the height slides rather
than jumps (`Swap` in `stack` mode, in `EpisodeList`). Ticks that turn on
after the rows were drawn pop in 30ms apart, ten steps at most
(`EpisodeTick`, `tick-pop`). The navigator's links carry `data-travel-to`,
and the next episode's still and details come in 12px from that side
(`episode-travel.tsx`).

**M7, route transitions: not kept.** Read against `node_modules/next/dist/docs`
(the view transitions guide and the Link reference) and the installed Next:
16.3 has no `experimental.viewTransition` any more (it is not in
`config-shared.d.ts`; view transitions are simply on in the App Router), so
there is no Next flag to put this behind. And the one path the plan names
cannot morph here: the guide says a shared element only pairs when the
destination renders in the same commit as the navigation, which needs a
prefetched page, while every poster link has prefetch off on purpose
(`components/link.tsx`: each prefetch is a server render) and `/title/...`
has a `loading.tsx` whose skeleton commits first. Turning either off to get
the morph would spend the paint numbers the rebuild exists for. The warm
launch's `router.refresh()` (`cache-refresher.tsx`) is a transition too, which
a `<ViewTransition>` would animate straight after the shell's first paint. So
no `<ViewTransition>` is rendered and the config is unchanged; a test pins
both.

**Judgement calls**

- The tab bar's sliding pill animates `flex-grow`, which lays out. It stays as
  the one standing exception to rule 1 (five boxes in a fixed bar), moved
  onto the tokens and written down as such rather than rewritten.
- Rule 1 lets a fill fade (a repaint, not a layout); the plan's own switch and
  hover fills need it. Card shadows and row washes are pseudo-elements that
  fade, so they are opacity.
- The segmented pill is measured (`offsetLeft`, `offsetWidth`, after paint),
  and its width is set rather than animated. It moves on the press, not on
  the server's answer, since Discover's and the review's chips are
  addresses. The chips keep their own widths.
- The plan's "rate" and "request" sheets are popovers in the rebuild (the
  rating pill, Request's question), so they pop rather than slide. The
  "Saved" and error toasts the plan names do not exist, and the unlock
  toast's medal had no pop to keep. "Mark all up to here" does not exist
  either; Mark whole season is what ticks many rows at once, so it drives
  the cascade. The list editor has no reordering, so nothing lifts and makes
  room; that item is left out rather than invented.
- A row only collapses within eight seconds of a press on the page; one that
  vanishes because the warm launch's refresh brought the list up to date
  simply goes.
- The hero settle is 1.2s, longer than `--slow`, so by rule 2 it lives in its
  own stylesheet, which only title and episode pages ship.
- The "Updating" line is not animated: it belongs to the shell's first
  second.
- Without a browser I could not run `measure.js`. The compiled stylesheet
  grows by about 1.7 KB gzipped (17.4 KB to 19.1 KB), well inside 5% of the
  415 KB cold Home; nothing new runs before paint except the Up next card's
  wrappers rendering as they did, and the segmented pill measures after it.
  The review harness should confirm both numbers.

**To test by hand** (a phone and a desktop, both themes, then once with the
OS's reduced motion on, where every one of these should be a cut)

- Home: press a button, a chip and a tick (a slight give); hover posters on a
  desktop (up 2px, deeper shadow, caption still) and Also waiting rows (a
  wash). Mark watched on Up next: the tick flashes and the words give way to
  the next episode; finish a show and the poster crossfades to the next
  one. Tick the last episode of an Also waiting show: its row collapses and
  the rows below slide up. When a challenge's figures change the count and
  bar move; a reload shows them still.
- Menus: every "…" and Save menu, sort, the bell, the avatar menu and the
  when-menu scale in from their corner and fade out. Dialogs slide up on a
  phone (drag the grab bar: short of 80px it springs back, past it closes)
  and scale in on a desktop: Settings, Connections' sheets, Delete my
  account, a list's Rename, Add, Delete and Request all, Recommend.
- The unlock toast: down from the top on a phone, up from the foot on a
  desktop, and back out after eight seconds.
- Theme and Screensaver (Settings and the avatar menu), the smart list's
  Simple/Advanced, the review's Year/Month, Discover's Everything/Shows/Films:
  the pill slides on a press and sits still on first paint. Switches slide
  and fade.
- Rails on a phone: a flick settles with a card at the gutter.
- Notifications: Clear collapses the list into the empty state, in the bell
  and on the page. A list or the watchlist: remove a poster and it shrinks
  away.
- Title pages: the backdrop settles once it has arrived; switch seasons and
  the episodes cross over without the page jumping; Mark whole season and the
  ticks pop down the list. Episode page: Next and Previous (the pill and the
  cards) bring the episode in from that side; opening an episode any other
  way does not move it.
- The smart list editor's folds and Discover's filter folds open and close
  smoothly.

**Also in this round: a desktop back link on title pages.** Series and film
pages now carry "‹ Back" in white from `lg`, in the hero's top edge above the
poster, going back through history, since a title has too many ways in to
name one. `Back` gained `desktopOnly` (`back-button.tsx`; used in
`series-page.tsx` and `film-page.tsx`), and STYLE.md's Back navigation says
so. To test: on a desktop, open a series and a film from Home, Discover and
search; the link returns to each, and nothing on the hero has moved. Phones
are unchanged.
- **Review fix:** `ExitList` rows sized to their widest line and pushed phone
  Home 27px past the viewport; the list's grid column is now `minmax(0, 1fr)`
  and the row body `min-w-0`, so long episode names truncate as before.

## T1: Background variants

`docs/todo-plan.md`, T1. A choice of what stands behind every page, in
Settings → Appearance under Theme: Plain (the page colour, the default),
Gradient, Artwork and Colour. One migration, no new dependency, nothing new
on a request path reaches the network.

**What changed, by the plan's six steps**

1. Schema: `User.background` (null is plain) and `User.backgroundHue`, both
   nullable (`20260924230000_background_variants`, additive). Applied to
   `data/trekker-migrated.db` after copying it to
   `data/trekker-migrated.before-t1.db`; `prisma migrate diff` against the
   schema is empty afterwards.
2. `lib/background.ts` (plain data, safe in the browser): the variants, the
   eight swatches (hues 210, 245, 280, 320, 355, 15, 150, 180, none near the
   amber), the `trekker_background` cookie ("gradient", "artwork",
   "colour-320"; anything else reads as plain), the row reader, the poster
   path check and the day's index (`dailyIndex`, FNV-1a of the person and the
   day). `lib/background-art.ts` (server): `dailyPoster`, one grouped query
   over the last year of `Play`, which carries each title's poster, sorted by
   title so the pick is stable, no TMDB.
3. `globals.css`: colour mixes the hue into `--bg` itself (10% in dark, 12%
   in light), so every scrim that fades into the page fades into the tint;
   gradient and artwork are one fixed `html::before` layer under everything
   with the body's own fill taken away (a fixed layer is composited once, so
   scrolling costs nothing). Artwork is the w92 poster, blurred 48px and
   saturated, at 30% in dark and 16% in light. The root layout puts
   `data-background` (and `--bg-hue`) on `<html>` from the cookie, and the
   boot script re-reads the cookie before paint, as it does the theme; for the
   artwork it also paints the poster this browser last drew, from storage, so
   a launch has it at once. `BackgroundSync` in the app layout keeps that in
   step with the bell's answer, which now carries `me.background` with
   today's poster (the shell's own data, so it does not change on
   navigation), and rewrites the cookie when the choice was made on another
   device.
4. Settings → Appearance: a Background row of four previews (each the
   variant drawn small in the current theme; the artwork preview is today's
   poster), the chosen one ringed in amber, and the eight swatches under them
   while Colour is chosen (`BackgroundPicker` in `settings/controls.tsx`). A
   choice changes the page at once and saves behind it through
   `saveBackground`, which writes the row, sets the cookie and expires the
   bell; a failure puts the old background back. The card's line reads
   "Dark · artwork background"; the desktop list's reads "Dark · artwork
   background · screensaver 10 min" (plain adds nothing, so both read as
   before for everyone who has not chosen).
5. Tests (`tests/background.test.ts`): the cookie round trip and junk
   refused, the row reader, the day's pick stable within a day and spread
   across days, `dailyPoster` from the person's own last year only (old,
   poster-less and other people's plays never picked, a title watched twice
   counted once), the save refusing what is not offered, the boot script
   setting the attribute and hue and refusing a poster path that could break
   out of `url()`, and the summary lines.
6. Measurement: not run. The harness needs a browser and a running server,
   which this work was not to start. By construction plain is unchanged (no
   attribute, no layer, one cookie read the layout already did); artwork adds
   one w92 request (a few KB, cached by the worker like every TMDB image) and
   the stylesheet about 0.6 KB. The owner or the reviewer should run
   `measure.js` warm and cold with Plain and with Artwork.

**Judgement calls**

- The plan's "artwork layer component in the app layout" is a CSS layer
  plus a small sync component, rather than a component that draws an image:
  a component only renders after hydration, so the poster would have popped
  in on every launch, while a layer the boot script has already filled paints
  in the first frame. The sync is what the layout carries.
- Heroes stay dark and opaque, but over a gradient or the artwork their last
  60px (a band's first and last 60px) now fade out, since their scrims end in
  the flat page colour and would otherwise draw a seam where the layer
  starts. Colour needs none of this: the tint is the page colour.
- Small labels that sit on a flat `bg-bg` over a hero's fade (the season
  line on a desktop title page) show the flat colour over a gradient or the
  artwork. They are a few pixels each and were left as they are.
- The hue is kept whichever variant is chosen, so Colour comes back to the
  last swatch. Plain is stored as null rather than "plain", so every existing
  row already means plain.
- A new day's poster arrives with the bell's answer, a moment after paint;
  until then the page shows yesterday's. It changes without a fade.
- The theme-colour meta tag (the phone's status bar) stays night; a tinted
  page is close enough that it did not seem worth a per-request value.

**To test by hand** (a phone and a desktop, dark and light)

- Settings → Appearance: choose each of the four; the page behind Settings
  changes at once, and the card's line and the desktop list's line say so.
  Colour shows the swatches; each changes the tint. Reload: the choice is
  there before anything else paints (no flash of plain).
- Artwork: the page is a soft wash of a poster you watched this year; the
  same one on every page and after a reload; a different one tomorrow. An
  account with nothing watched in the last year shows plain.
- Read text and cards over each variant in both themes: Home, Discover (its
  bands), a list, the calendar, Settings. Ink should read as on plain, and
  cards should still stand off the page.
- Heroes (a title, an episode, a list, the profile, a person, Discover's
  top): dark and opaque, and their foot fades into the gradient or the
  artwork without a hard line.
- Choose a background on the phone, then open the desktop (or the other way
  round): the desktop takes it within a minute of its next bell answer, and
  its next launch paints it from the first frame.
- Installed app, warm launch: the background is there on the shell's first
  paint, including the artwork's poster.

## Motion round 2 and the badge card

The brief (`motion-round2-brief.md` in the review folder), every item, page by
page. The five rules still hold; every animation added is a row in STYLE.md's
catalogue, and `tests/motion.test.ts` and `tests/motion-round2.test.ts` pin
what can be read without a browser. No migration, no new dependency.

New shared pieces: `ZOOM`, `ZOOM_SHADOW`, `ZOOM_GROUP` and `foldChevron` in
`motion.ts` (the old `LIFT` is gone); `Unfold` (`unfold.tsx`, the
`fold-panel` rules), a fold that stays mounted; `DrawOnView` and
`useFirstView` (`draw.tsx`, one shared IntersectionObserver) with the
`draw-*` rules, for things drawn on first view; `Count once` inside a
`CountScope` (`count.tsx`); `useRecentPress` and `arrivals` in `exit-list.tsx`,
so a row that arrives after a press rises in (`motion-rise-in`);
`motion-bump`, `motion-tick-in`, `motion-reveal`, `motion-dots` in
`globals.css`.

### 10. The phone header (done first)

- **Search the same size as the avatar.** Measured: the search button was
  already a 40px box and the avatar a 36px face with a 2px ring outside it (40
  to the eye, 36 to the layout). The avatar's button is now a 40px box too
  (`size-10` in `avatar-menu.tsx`), so all three controls share one size and
  one centre line; it also presses now.
- **The bell on every tab page.** `PhoneAccount` in `page.tsx` (the bell with
  its unread dot, then the avatar) closes the phone row of Home, Discover (on
  its hero, glass), Calendar, Lists and Badges, 40px, opening
  `/notifications`. The loading screens' bones gained the same boxes.
- **A larger wordmark.** 28px (was 24px in the code; the brief's "22 to 26"
  was a fifth over a size the code no longer had, so it is a fifth over the
  real one), the mark still at cap height, the row still 60px.
- **Also waiting folds on phones.** `WaitingFold` (`home/waiting-fold.tsx`): a
  chevron button on the section head with the count still showing, the rows
  in an `Unfold`, open by default, remembered in localStorage (a read that
  throws leaves it open; a write that throws still folds for the visit). The
  stored choice is read after paint, so a folded list shuts on the first
  frame without a transition; only a press animates. On phones the head's
  link chevron gives way to the fold's, and "Show all N" under the rows is
  the way to `/waiting` there too. From `lg` it is the section it was.

### 1. Fix what is there

- **Poster hover is a zoom, not a lift.** The artwork alone scales to 1.04
  inside its rounded, clipping frame over `--base`, and the frame's shadow
  deepens with it (a pseudo-element on a non-clipping box round the frame);
  chips, scrims, the words on a wide card and the caption under a poster stay
  still; `motion-safe:`, so reduced motion has none. On every `PosterCard`
  and `WideCard` (so Home's Trending, Recently watched, On this day, Landing
  soon and Friends watched, Discover's rails and In cinemas, the Lists page's
  watchlist and favourites rails, the review's runners-up and film rails),
  Discover's ranked chart cards, grid tiles, pick cards, genre tiles and
  spotlight cards, people tiles (cast, cast page, episode cast), More like
  this, a person's filmography, the list grids, the Lists page's mosaics, the
  calendar's Coming up, Backlog and day-column posters, the profile's Most
  watched posters and Ratings rail, search's rows and the News rows. Every
  rail now keeps 12px of room above and below from `lg` for the shadow.

### 2. Home

- **Up next card buttons.** Watched presses and, under a pointer, brightens:
  a halo of its own colour (a shadow, a repaint) and in light the ink lifts a
  step, since white cannot get brighter in dark. The more-menu and Play on
  Plex (the card's glass) press and now wash in dark as well as light. Also
  waiting's ticks press, wash, and fill amber over `--fast` with the check
  scaling in (`TickButton`), then the row collapses (`ExitList`, as before).
  Show all is a ghost button (press and wash already).
- **Challenges strip.** Kept mounted in an `Unfold`: its row grows from `0fr`
  to `1fr` over `--base`, the tiles fading in 80ms behind; the chevron turns
  180° over `--base` (`foldChevron`); the head presses and washes. Same on
  every other collapsible: Settings' cards on phones (the `<details>` became
  a button and an `Unfold`, standing open from `lg` in CSS), the badges' XP
  breakdown, the smart-list editor's and Discover filters' folds (`FoldRow`:
  its contents now fade in a beat behind the row, its chevron turns 180°, its
  head washes). The season chips do not fold, so there is nothing there.
- **Friends watched, Landing soon, On this day.** The zoom (item 1); the
  friend's avatar chip is furniture and stays.

### 3. Discover

- **Top 3 spotlight.** Desktop: the big card's and the two stacked cards'
  backdrops zoom. Phones: the card in view rises 4px and its neighbours sit at
  0.98, over `--base`; which card is in view comes from an
  IntersectionObserver on the track (threshold 0.6), which replaced the scroll
  listener the dots used. View details presses with its card and lightens on
  hover, at both widths.
- **In cinemas now.** The zoom (it is a `WideCard`).
- **Find your next watch.** Genre tiles zoom, and the tint's opacity eases
  from 0.9 to 0.75 (the overlay is now the tint at full strength under an
  opacity), so the artwork shows more; the name stays.
- **The rest of the top 20.** The poster zooms; the number is outside the
  frame and stays.
- **Everything / Shows / Films.** Already slid their pill; unchanged.
- **What to watch.** Next slides the question and its answers out to the left
  (`--fast`, and Next waits for it) and the next question in from the right
  over `--base`; Back the other way (`QuizSlide`). A question opened from a
  link or a reload simply shows. The chosen answer's tick pops in
  (`motion-tick-in`) only when chosen by a press. The result's poster reveals
  from 0.96 with a fade (`motion-reveal`). Pick for me presses (a ghost
  button) and its sparkle turns 20° on hover.

### 4. Calendar

- **Week strip.** A client `DayStrip`: days with arrivals press; the amber
  pill is one `SegmentPill` sliding between days over `--base`, over the
  other tiles' fill and under their words. Judgement call: the strip had no
  selected day, only today in amber, so the pill starts on today (when the
  week holds it) and moves to the day tapped, which is where the agenda has
  jumped to; today keeps its date in amber when the pill is elsewhere. The
  dots fade in, a day at a time 30ms apart, as the week arrives.
- **Week change.** `WeekArrival`: the new week's days come 16px from the side
  travelled towards, with a fade, over `--base`, after the chevrons (phone and
  desktop) or a swipe; the first week of a visit simply shows. The direction
  is the new week's start against the last one shown, so it works for links
  the server draws.
- **Agenda rows.** Hover lifts their fill, and they press nothing, because
  **the tick-and-collapse cannot be done as asked:** the agenda's tick is a
  read-only mark of watched (`role="img"`), not a control, and a watched
  arrival stays on the calendar with its tick rather than leaving it, so
  there is no press to answer and no row that leaves. Adding a mark-watched
  control to the calendar is a feature, not motion, and was left for the
  owner to ask for.
- **Coming up and Backlog.** The zoom.

### 5. Lists and list detail

- **List tiles.** The four posters zoom as one picture inside the mosaic's
  frame (so the gaps keep their width) and the tile's shadow deepens.
- **List page.** The banner (`BannerArt`) settles from 1.04 to 1 over 1.2s
  once all four posters have loaded, in the title hero's stylesheet; the
  tiles zoom; the sort chips (every `SortChips` row: a list, the watchlist,
  favourites) slide their pill; a list has no filter chips. Removing a title
  still fades and shrinks (`motion-leave`, checked: it plays inside the new
  zoom frame), and a title added from the list's search now rises in. The
  Favourites heart (the title pages' `FavouriteButton`) pops 1 to 1.25 and
  back over `--base` as it fills, and its colour fades.
- **Smart list editor.** Folds as item 2; the preview's posters cross over
  the last answer's (`Swap` crossfade) at both widths; the match line's
  figures are `Count on="change"`.

### 6. Badges

- **The badge card is a row** (`BadgeRow`, `badges/row.tsx`), the old app's
  layout: the medal inside its progress ring (`MedalRing`, amber on the
  surface's track, gone once earned), then the name, the description in full
  (the `title` tooltip is gone) and a mono line, "Earned 5 Aug" (the year only
  when it is another year; `earnedDay` in `lib/achievements`) or "3 of 10 ·
  30%" (the badge's own terms, then the percentage; a badge with nothing to
  count keeps its own line). No bar; legendary keeps its gold edge. The board
  lays rows one column on phones, two from `sm`, three from `2xl`, and
  Closest to earning draws the same row (the old `ProgressRing` and
  `ClosestTile` are gone). The profile's trophy cabinet draws medals, not
  tiles, so it is unchanged.
- **Motion.** The ring's arc draws to its value the first time the row is
  seen (`draw-arc`, stroke-dashoffset over `--slow`), once per visit. The
  medal pops 1 to 1.12 and back when a row is tapped, and the row opens the
  badge's detail: there was no detail in the rebuild, so a small one was
  added on the existing `Dialog` (a sheet on phones): the medal large in its
  ring (the arc drawing, the medal popping as it arrives), the name, tier,
  group and XP it is worth, the description and the row's line. The groups
  (phones), All / In progress / Earned and the tier chips slide their pill (a
  chosen tier still clears on a second tap, taking the pill with it). The
  level card's bar and the badge count's bar fill from nothing on first view
  (`draw-fill`); "XP overview bars" is read as those two, since the XP
  breakdown is rows of figures with no bars. The unlock toast is unchanged.

### 7. Profile

- **Headline figures** count up on first view, once per visit (`Count once`
  in a `CountScope` round the body): the big time figure (its leading number),
  its hours, viewings, films and shows, TV and film time, episodes, and the
  hero's XP to the next level.
- **Your time.** The line draws from left to right on first view and the fill
  fades in behind it, then the peak's dot and words. The line is uncovered by
  a `clip-path` rather than `stroke-dashoffset`: it is drawn with
  `non-scaling-stroke` in a stretched box, where dash lengths no longer match
  the path, so a dash sweep would stop short or finish early; the clip is a
  repaint like the dash would have been. **When you watch** bars grow from
  the baseline 30ms apart; **What you watch** segments grow from zero 30ms
  apart; **Every day** cells fade in reading order (row by row), the last
  starting at 250ms so all are in by 400ms (`cellDelay`).
- **Range chips** slide their pill, and the figures cross over to the new
  range's (`Swap` crossfade) instead of counting again.
- **Most watched** rows wash and their posters zoom; **Trophy cabinet** medals
  and **Friends** avatars grow to 1.08 on hover; **Watching habits** tiles lift
  their fill, and the two "All habits" opens rise in; **Ratings and reviews**
  posters zoom.
- **Everything you watched** rows lift their fill (as before). "Show more"
  now appends: the section reads up to three pages of this week's rows and
  shows the first; each press adds the next twelve, which fade and rise in
  40ms apart (`RecordList`); past those the link to the whole history takes
  its place, as before.

### 8. Everywhere

- **Section-head chevrons** nudge 2px: `SectionHead` and the Lists page's
  heads already did; search's group heads and Comments now do, and a friend
  row's chevron nudges on the row's hover. Read as the chevron's own hover:
  the title beside it is not a link, and nudging on its hover would promise
  one.
- **Press on every button and button-styled link.** `buttonClass`,
  `iconButtonClass`, `filterChipClass`, `segmentChip`, `smallChip` and the
  title pages' classes carry `PRESS`; every raw `<button>` found by grep now
  does too (the bell's and sidebar's icon buttons, Mark all read and Clear,
  search's recents, clear and Cancel, the quiz's answers, the when-menu's
  chips, close and Save, the sort trigger, a grid poster's cross, the profile
  editor's text buttons, the profile picker, service chips, the background
  picker, Settings' card heads, the XP head, the rating buckets, the social
  chips and Post, Request's "Request anyway" question, Discover filters'
  Clear filters, the badges' search clear), and the button-styled links that were not on a
  builder (the calendar's Today, the list page's back, the collapsed
  sidebar's search). **Not pressed, on purpose:** menu rows (`MENU_ITEM`, the
  avatar menu's rows, the Recommend sheet's people and the badges' desktop
  group list), which are rows and wash instead, as the plan asks of rows;
  switches, whose knob slides; the filter folds' heads, which wash; and the
  spotlight's 6px dots, where a 3% scale is invisible.
- **Toggles and ticks.** Switches already slid and faded; checkbox-style
  ticks now pop in where a press put them (`motion-tick-in`: a chosen
  service, a quiz answer, a list ticked in Save, a friend sent a
  recommendation), never on a page's first paint.
- **Rows leaving and arriving.** `ExitList` now also rises in rows that
  arrive within the press window (`arrivals`, `motion-rise-in`) and is used
  for a title's comments (a comment posted rises in, "All N" adds the rest
  rising, a deleted one collapses) and the friends page's requests and
  friends (an answered request collapses, the friend it made rises in). A
  title added to a list rises in (`TitleGrid`), and Show more and All habits
  rise in (item 7).

**Measured:** not in a browser (none was to be run). The compiled stylesheet
is 20.8 KB gzipped, up from 19.1 KB, well within 5% of the 415 KB cold Home.
Nothing new runs before paint: `DrawOnView` and the pills measure or observe
after it, and every entrance keys on a press or on content arriving after
the page. The review harness should confirm warm Home paint and cold bytes.

**To test by hand** (phone and desktop, both themes, then with reduced motion
on, where each should be a cut)

- Phone header on Home, Discover (on the hero), Calendar, Lists and Badges:
  search, bell (dot when unread, opens Notifications) and avatar are one
  size on one line; the wordmark is larger and still level.
- Home: fold Also waiting on a phone and reload (still folded, no animation
  on load); fold the challenges; hover Watched (halo) and the card's other
  buttons; tick an Also waiting show (amber fill, then collapse); hover every
  rail's posters and wide cards (zoom, caption still, shadow deepens).
- Discover: the spotlight on a phone (the card in view lifts, neighbours
  shrink slightly) and desktop (zoom, View details); genre tiles (zoom and
  lighter wash); the top 20; Pick for me's sparkle; the quiz forwards and
  back, and its result's poster.
- Calendar: tap busy days (the pill slides; today stays amber-dated);
  chevrons and swipes (days slide in from that side); hover posters.
- Lists: the Lists page mosaics; a list's banner settling, sort chips, add a
  title (rises), remove one (shrinks); the heart on a title page; the smart
  editor's folds, preview and match count.
- Badges: rows with rings that draw as they scroll in; tap a row (medal pops,
  detail opens: tier, group, XP); the chips' pills; the two bars filling.
- Profile: figures count once (change range: they cross over, no recount);
  the chart, bars, genre segments and heatmap drawing; range pill; hovers on
  Most watched, cabinet, friends, habits, ratings; Show more.
- Settings on a phone: cards open and close smoothly; on desktop they stand
  open. Comments: post one (it rises in). Friends: answer a request.
- **Review fixes:** `profile/record-list.tsx` (a client component) imported
  `profile/parts.tsx`, whose value imports reach `lib/profile` and the
  database, so `next build` failed with fifteen server-only errors that tests
  and typecheck cannot see; the row moved to `profile/record-row.tsx`, which
  `parts.tsx` re-exports. And Closest to earning repeated the description on
  its mono line ("The Fast and the Furious · 9 of 10 · 90%"); `badgeLine`
  keeps only what follows the last separator. Run `npm run build` before
  reporting a round: it catches what the unit tests cannot.
- **Zoom follow-up (owner):** the zoom felt fast and the poster seemed to widen
  after the pointer left. It now runs over `--slow`, and every clipping frame
  round a zoomed picture takes a layer of its own (`zoom-art` rule in
  `globals.css`): Chrome drops a rounded frame's corner clip while a
  composited child scales, so the corners squared off and snapped back at the
  end, which read as widening. Traced with the review harness: 1.04 by 450 ms,
  back to 1 by 450 ms after leaving, the frame at 182px throughout.

## T2: News

`docs/todo-plan.md`, T2, all five steps. One migration (backed up first), no
new dependency, and nothing new reaches the network on a request path: news
is noticed by the refresh job, from answers it already fetches.

1. **Schema.** `PersonNews` became `NewsItem` (`20260924235000_news`): a
   subject (`person`, `tv`, `movie`) and its id, a kind, the title it links
   to, its picture (a poster, or a person's headshot), a `headline` and a
   `detail`, `at`, and a unique `key` naming the change, so each change is
   news once. The migration carries every `PersonNews` row over with its id
   (so the bell's read marks `news:<id>` still hold) and the bell's words,
   the name read from `Person`, then drops the old table; it also adds
   `User.notifyNews`, off. `data/trekker-migrated.db` was copied to
   `data/trekker-migrated.before-t2.db` and then migrated; it had no
   `PersonNews` rows, and `prisma migrate diff` against the schema is empty
   afterwards. A test runs the migration's SQL over a seeded copy.
2. **Recording at the point of write** (`lib/news.ts`, `lib/refresh.ts`). The
   six-hourly `refreshShow(force)` peeks at the cached details before it
   fetches, and `showNews` compares the two: a status change into cancelled,
   ended, or back to returning (renewed); the season count rising ("Silo
   renewed for season 4"); a next episode dated, or its date moving; a new
   official trailer (the videos are already in the details it fetches). The
   same pass now also looks at saved films that are undated, coming, or out
   within sixty days (`checkSavedFilms`: one forced details call each, gated,
   once per film however many saved it): release date set or moved, a new
   trailer. A followed person's daily look writes `NewsItem` rows in the
   words the bell used. First fetches only draw the line. Fan-out and gates
   as before.
3. **`/news`.** One list, newest first, grouped by the day the job noticed,
   each row the poster or headshot, the headline, the line under it, when,
   and an amber dot while unread; opening one marks it read (the bell's own
   mark), and Mark all read reads them all. Phones reach it from **News on
   Home** (the latest three, the head's count of unread and chevron to the
   page, absent when there is none); desktops from a **News entry in the
   sidebar under Calendar** with an amber unread count (a dot on the rail),
   carried in the bell's answer as `newsUnread`. Whose news it is is worked
   out on reading: a followed person's since the follow, a show someone has
   in progress or saved (not one they stopped), a film they saved.
4. **The bell** lists news as its own kind (`news`), so Mark all read and
   Clear cover it; clearing the bell leaves the News page as it is. **Push:**
   a fourth switch in Settings, Notifications, "News about what you follow",
   off by default; the morning push includes the last day's unread news only
   for those who turn it on, and the Notifications card's line says so.
5. **Tests** (`tests/news.test.ts`): every kind fires, once; a status
   flapping back does not fire twice; nothing on a first fetch; the
   six-hourly pass records a change end to end against the TMDB stub; whose
   news it is (follow date, in progress, saved, stopped, someone else's);
   read state shared with the bell and Mark all read; the migration. The
   follow and notification tests now read `NewsItem`.

**Judgement calls**

- Followed person's news used to go out in every morning push with no
  switch of its own. It is now part of "News about what you follow", which
  the plan says is off by default, so anyone who relied on that push needs
  to turn the switch on.
- "Renewed" is a status coming back from ended or cancelled; a season count
  rising is the more common renewal and says "renewed for season N". A show
  going from in production to returning is a premiere, which its next date
  announces.
- Titles' news is shown to anyone with the title in progress or saved,
  including news from before they added it, since a renewal is still worth
  knowing; a person's news keeps the rule that a follow inherits nothing.
- Read marks are the bell's table, which the daily job caps at the newest 200
  per person; someone with more read marks than that could see very old news
  unread again. The News page shows the newest hundred.
- The Home section is rows, not a poster rail: news is words, and three
  headlines read better stacked.

**To test by hand**

- After the next six-hourly pass (or `/api/cron`), a show you watch that TMDB
  has renewed, cancelled, dated or given a trailer shows on `/news`, in the
  bell and, on a phone, on Home; on a desktop the sidebar's News has a count.
- Open one: it is read in all four places. Mark all read on `/news`.
- Settings, Notifications: the fourth switch; with it on and push allowed,
  the morning push carries the day's news.
- Follow a person: their new work still arrives as before.

## Round 9: news that shows something, popular news, Discover's top five

`round9-brief.md` in the review folder, three items in order. One migration
(backed up first), no new dependency. The only new network code is the feed
reader, and it runs from the refresh job only.

### 1. Following someone shows news at once

- **The first look seeds.** `newsBetween` (`lib/follow.ts`) no longer returns
  nothing without an earlier look: `seedNews` applies the later look's rules
  to every credit. Not out yet (undated, or dated after today) is
  "announced", out within the last 30 days (`RECENT_DAYS`) is "released".
  Upcoming first, soonest first with the undated after the dated, then recent,
  newest first; at most twelve (`SEED_CAP`).
- **Dated at the follow.** Seeded rows take the latest `followedAt` among the
  person's followers (a millisecond apart, so newest-first lists them in
  relevance order), so every current follower sees them and they sit where
  the follow happened.
- **At the moment of following.** `setFollowing` now runs `recordPersonNews`
  from the person the page has just cached (`peekPerson`), so `/news` has rows
  the instant you get there. The follow action also expires the bell's tag,
  since the sidebar's News count comes with the bell's answer.
- **Backfill without a migration.** `unseededPersonIds` finds people followed,
  looked at (`creditsCheckedAt` set) and with no `NewsItem` at all.
  `checkFollowedPeople` seeds them on the daily pass, and `seedFollowedPeople`
  runs once 90 seconds after start-up so an instance updated in the afternoon
  does not wait for 04:00. Both read the person through the week-long cache.
- **Tests** (`tests/follow.test.ts`): the seed rules and order, the cap of
  twelve (upcoming kept over recent), following shows news dated at the
  follow and a second look adds nothing, and the backfill seeds a silently
  followed person once and then behaves as an ordinary look.

### 2. Popular news

- **`lib/press.ts`**: a small RSS/Atom reader. It matches `<item>` and
  `<entry>` blocks with regular expressions and keeps the headline (CDATA
  unwrapped, tags stripped, entities decoded), the link (RSS `<link>`, Atom's
  alternate `href`, or a permalink guid, http(s) only), the published time
  (`pubDate`, `published`, `updated`, `dc:date`), and a picture
  (`media:content`, `media:thumbnail`, an image enclosure, or the first `<img>`
  in the summary, https only). It never stores the summary or the body. The
  file says why this is fine: headline, source and link are what a feed is
  published for.
- **Feeds.** `DEFAULT_FEEDS` lists nine addresses. Each was checked on 24
  September 2026 with one plain `curl` GET, and each answered 200 with an RSS
  document:

  | Feed | Answer | Items | Pictures |
  | --- | --- | --- | --- |
  | `https://variety.com/v/tv/feed/` | 200 `application/rss+xml` | 10 | media:content |
  | `https://variety.com/v/film/feed/` | 200 `application/rss+xml` | 10 | media:content |
  | `https://deadline.com/feed/` | 200 `application/rss+xml` | 12 | media:content |
  | `https://www.hollywoodreporter.com/c/tv/feed/` | 200 `application/rss+xml` | 10 | none in the feed |
  | `https://www.hollywoodreporter.com/c/movies/feed/` | 200 `application/rss+xml` | 10 | none in the feed |
  | `https://screenrant.com/feed/` | 200 `application/xml` (RSS) | 10 | enclosure |
  | `https://collider.com/feed/` | 200 `application/xml` (RSS) | 10 | enclosure |
  | `https://www.indiewire.com/feed/` | 200 `application/rss+xml` | 12 | none in the feed |
  | `https://www.tvline.com/feed/` | 200 `text/xml` (RSS) | 20 | media:thumbnail |

  Left out: **Empire**. `/movies/news/rss/`, `/feeds/news/`, `/rss/` and
  `/movies/news/feed/` all answered 404 with HTML. `https://tvline.com/feed/`
  answers 301, so the list uses its target. The saved copies also went
  through the parser (a one-off script, not a test): every item of every feed
  parsed, with a picture where the feed has one.
- **`NEWS_FEEDS`**, comma-separated, replaces the list, and set but empty
  turns Popular off (`.env.example` says so). Addresses that are not http(s)
  are dropped. An admin sees the list under Settings, Notifications, below
  the news switch ("Popular news feeds"). It is read-only, because it lives
  in the environment.
- **The daily pass** (`runPressPass`, after followed people and before
  housekeeping) reads each feed once, one at a time (`mapLimit(…, 1)` and a
  new `press` gate, 500ms), with a 6s timeout. A failing feed is skipped
  until the next pass. It keeps the newest 40 per feed, none older than 30
  days, and a future date counts as now. Rows are `NewsItem`s with
  `subject = "press"`, unique on the link, so an article two feeds carry is
  stored once. Housekeeping (`prunePress`) deletes press rows older than 30
  days. Start-up also runs one catch-up pass 150s in, but only if there are
  no press rows at all.
- **Matching** (`titleMatcher`, `knownTitles`): a headline naming a title the
  cache knows gets that title and its poster. The name must appear as whole
  words, case-insensitively and with curly quotes folded, be four characters
  or more, and the longest name wins. The candidates are every cached
  details answer (names read with `json_extract`, so the large bodies are
  never parsed in JS), then the cached trending, popular, now-playing,
  upcoming and on-the-air lists. No TMDB call is made for this.
- **Migration** `20260925090000_press_news`: `NewsItem` gains `source`,
  `link` (unique) and `imageUrl`, and `mediaType`, `tmdbId` and `title`
  become nullable, since a press row names a title only when one matches.
  SQLite can do that only by rebuilding the table. Every row is copied with
  its id, so the bell's read marks still hold. `data/trekker-migrated.db` was
  copied to `data/trekker-migrated.before-round9.db`, then migrated.
  `prisma migrate diff` against the schema is empty afterwards. `newsFor`
  never reads press rows, so the bell, Home's News, the sidebar count and the
  morning push stay For you only.
- **`/news`** has two tabs, "For you" and "Popular". They are `segmentChip`s
  on a `SegmentPill`, like the badges' and Discover's chips, and each is an
  address (`?tab=`). With no tab, the page opens on For you, or on Popular
  when For you is empty and Popular is not. A Popular row has the feed's
  picture at 16:9 (318×178 on desktop, the wide card's size; a 96px
  thumbnail on phones), the headline (up to three lines), "Variety · 3 h"
  (`shortAgo` in `lib/when.ts`), and, when a title matched, its poster and
  name linking into Trekker. The picture and the headline open the article
  in a new tab (`noopener noreferrer`, and the picture with
  `referrerPolicy="no-referrer"`). A feed with no pictures shows the
  source's name on the surface instead.
- **Tests** (`tests/press.test.ts`, fixtures under `tests/fixtures/`):
  - The parser on three recorded shapes: WordPress with `media:content`,
    one-line CDATA with enclosures, and Atom. The stories in them are made
    up, so no one's copy sits in the repo.
  - Entities, escaped markup, http pictures and `javascript:` links refused,
    and no summary text ever reaching an item.
  - The matcher: longest wins, short names and part-words skipped, and what
    `knownTitles` reads from the cache.
  - The cap of 40, the 30-day cut-off, future dates, storing once across
    feeds, and pruning that leaves other news alone.
  - Press never appearing in `newsFor`, and the pass failing soft per feed
    with fetch stubbed.
  - The migration.

  `tests/setup.ts` now sets `NEWS_FEEDS=""`, so no daily pass in any test can
  reach a real feed.

### 3. Discover's top five

- **Desktop**: a 480px row. On the left, `TopCarousel`
  (`discover/top-carousel.tsx`) shows #1, #2 and #3 in turn, 7s each. The next
  slide fades in over `--slow` on top of the last one, which stays opaque
  underneath, so the fade never dips to black. While a slide shows, its
  backdrop zooms linearly from 1 to 1.08 across the whole dwell (the new
  `discover/carousel.module.css`). The slide has the rank chip, the score,
  "Film · 2026", the title, two lines of synopsis and View details. Three
  dots bottom-right (the current one amber, each a 22px button) jump to a
  slide.
  - A pointer over the card pauses it, and leaving resumes the dwell and
    the zoom where they stopped. Focus inside it and a hidden tab pause it
    too.
  - With reduced motion it never advances and nothing zooms. #1 shows and
    the dots still step.
  - On the right, #4 and #5 are stacked `SpotlightCard`s, 236px each with the
    8px gap. Each has the rank, the score, the title and a three-line
    synopsis, cut at a word boundary first (`clipWords`) so it never ends
    mid-word.
- **The rest of the top 20** starts at #6 (`splitTop` in `lib/spotlight.ts`).
- **Phones**: the hero's card track (360×282 as before, still swipeable)
  runs on the same state machine. Every 7 seconds it scrolls smoothly to the
  next card, and the showing card's art has the slow zoom. A swipe lands on a
  card and restarts its dwell. A finger or pointer on it pauses it. #4 and #5
  follow under it on the hero as two full-width 180px cards.
- **The machine** (`lib/spotlight.ts`) is pure and clock-free:
  - `carouselStep` handles begin, tick, jump, hover, focus, hidden and
    still. `running` and `dueIn` say whether it is moving and how long until
    the next slide.
  - `left` and `since` freeze what is left of the dwell on a pause.
  - `dwellName` names the zoom's keyframes by how many times the slide has
    shown, so a slide that comes back restarts its zoom even with two
    slides.

  `useCarousel` runs it on a `setTimeout` chain, one timer at a time and no
  animation loop, and starts it only once hydrated.
- **Hover zoom**: kept on #4 and #5 at both widths. It is gone from the
  carousel's art at both widths, which has the slow zoom instead.
- **STYLE.md**:
  - The Motion section says what may run by itself (the screensaver, and
    this carousel, because it is a hero that is looked at and is paused when
    it is not).
  - Two new catalogue rows: the turning, and the slow zoom.
  - The zoom row, the View details row, Posters and Heroes are updated.
- **Tests** (`tests/spotlight.test.ts`):
  - The split, with the rest starting at #6, and `clipWords`.
  - Slide order 1, 2, 3, 1, 2.
  - Pausing and resuming with the remaining dwell, and a stale tick that
    moves nothing.
  - A hidden tab, focus, a tab that starts hidden, reduced motion, jumps,
    and the keyframe parity.
  - The stylesheet's 7s and 1.08 under `no-preference`, no `ZOOM` on the
    carousel's art, and a timer that is a `setTimeout`.

### Also

- `tests/motion.test.ts` still expected the hover zoom at `--base`. It had
  been `--slow` since the zoom follow-up in "Motion round 2", and STYLE.md
  already said so. The test now expects `--slow`. It was the only failing
  test before this round.

### Judgement calls

- **Seeded news is dated at the latest follow**, not "now" and not each
  follower's own follow. News is stored once per person and change, so
  someone who follows a person *already* followed and seeded sees only what
  changes from then on, as before. Only the first follower gets the seed.
  Seeding per follower would need news rows per user.
- **What counts as "upcoming" for a series** is its credit date, which TMDB
  gives as the show's first air date. So a new season of a running show is
  not seeded. On the owner's database, Jon Bernthal's one credit that
  qualifies today is the undated *Snow Ponies*. After start-up his page
  shows "Snow Ponies announced", dated at the follow. *Spider-Man: Brand
  New Day* (31 July) is past the 30-day window.
- **A person with nothing upcoming or recent** stays "unseeded" and is looked
  at again each pass. That costs a cached read and nothing more. It is the
  price of doing this without a marker column.
- **Popular reads trending lists as well as details** for matching, since
  the press writes about what is popular, not only about what someone here
  has opened. Common-word titles ("Heat", "Friends") can still match a
  headline that uses the word. The four-character minimum and whole-word
  rule keep this rare. The brief accepted it.
- **HTML entities are decoded twice**, because many feeds escape twice
  (`&amp;#8217;`). A headline that literally says "&amp;" would lose it.
- **The carousel also pauses on keyboard focus.** An auto-moving region
  needs a way to stop it that is not a mouse.
- **The mark on the desktop carousel** moves up to stand above the dots,
  which take the bottom-right corner.
- **#4 and #5 on phones sit under the carousel on the hero**, as the brief
  says ("under it"). So the order is carousel, #4 and #5, then Pick for me,
  Filters and the chips, then the rest from #6.
- **Popular has a start-up catch-up** (only when it has no rows), so the
  first update does not leave the tab empty until 04:00.

### To test by hand

- **Follow**: open an actor with something coming (or undated) and follow
  them. Go to `/news`: rows at once ("X announced", or "Y is out" for
  something from the last month), newest first by relevance, twelve at
  most. The desktop sidebar's News count goes up. Unfollow and follow again:
  no duplicates.
- **Backfill**: start the server on the migrated database and wait about 90
  seconds. Jon Bernthal's "Snow Ponies announced" is on `/news` and in the
  bell.
- **Popular**: leave `NEWS_FEEDS` unset and start the server. About 2.5
  minutes in, the feeds are read. On `/news`, For you is still the default
  when you have news; tap Popular:
  - pictures at 16:9, or the source's name for THR and IndieWire;
  - headlines, "Variety · 3 h";
  - a poster and title under headlines that name something in your cache.
  - Headline and picture open the article in a new tab. The poster link
    opens the title in Trekker.
- **Popular stays out of the rest**: the bell, Home's News rail and the
  sidebar count do not change.
- **Settings**, Notifications, as the admin: the feed list under the news
  switch. Set `NEWS_FEEDS=` (empty) and restart: "Popular news is off" on
  the tab, and "Off" in Settings.
- **Discover, desktop**:
  - Discover opens on a 480px row: the big card turns every 7 seconds with a
    soft crossfade, and its picture creeps closer across the 7 seconds.
  - Hover: it stops, zoom included. Leave: it carries on from where it was.
  - Click the dots.
  - Switch tabs and come back: it has waited.
  - #4 and #5 on the right, each with a three-line synopsis that ends on a
    whole word, and each zooming on hover. The rest start at 6.
- **Discover, phone**:
  - The top card scrolls to the next every 7 seconds, and its picture
    slowly zooms.
  - Swipe: the timer restarts on the card you land on.
  - Hold a finger on it: it waits.
  - #4 and #5 as wide cards under it, then the rest from 6.
- **Reduced motion on**: no advancing and no zoom, #1 shows, and the dots
  still move between slides.

## Round 9 follow-ups

Three follow-ups from the owner. No migration and no new dependency. Round 9
above still describes the rest; where the two disagree, this section is
current.

### 1. A smoother slide change

- **Timing.** The change now takes 1.2s (`CHANGE_MS` in `lib/spotlight.ts`)
  on a new token, `--ease-in-out` (0.45, 0, 0.55, 1), added to `globals.css`
  and STYLE.md's rule 2.
- **Two layers per slide.** Each slide is `data-state="showing" | "leaving" | "idle"`,
  with a picture layer and a words layer on their own clocks
  (`carousel.module.css`):
  - The incoming picture fades in from 0 at scale 1 and starts its zoom the
    moment it appears. The outgoing picture fades out on the same curve and
    keeps zooming, so neither stands still.
  - The zoom's keyframes are now 8.2s, the dwell plus the change: 1 to 1.08
    across the dwell, then on at the same rate to 1.0937.
  - The outgoing words (text, rank chip and score) fade out over the first
    300ms. The incoming words fade in with a 6px rise over 400ms, starting at
    400ms, so the two sets never overlap.
- **Dots.** A single amber dot slides to the slide showing over `--base`,
  over the three white ones.
- **Rhythm.** The 7s dwell still counts from the start of each change.
- **Reduced motion.** Every transition and keyframe sits under
  `no-preference`, so with reduced motion the states swap: a cut.
- **STYLE.md.** The turning row and the slow-zoom row are rewritten, and the
  dot has a row of its own.

### 2. Phones: the same carousel

- **One component, two sizes.** `TopCarousel` takes `size="desk" | "phone"`.
  The phone's scrolling track (`discover/spotlight.tsx`, with its
  IntersectionObserver and smooth scroll) is deleted. On a phone the
  carousel is the column's width (20px gutters), 300px tall, with a
  two-line description and the dots bottom-right.
- **Swipe and hold.** A sideways swipe steps to the next or previous slide:
  40px or more, and further across than down (`swipeStep`). That restarts
  the dwell. `touch-pan-y` keeps vertical scrolling as it was, and a swipe
  that ends on the card does not also open the title. A held finger pauses
  the carousel, through the same pointer enter and leave as a mouse.
- **The rest of the top 20.** Phones no longer have the #4 and #5 wide
  cards, so the rest starts at #4 there. The desktop keeps #4 and #5
  stacked and the rest from #6. It is one rail, whose #4 and #5 tiles hide
  from `lg`.
- **The split** is `splitTop(items, "desktop" | "phone")`, and both widths
  are tested. `SpotlightCard` is only the desktop's stacked card now.

### 3. News refreshes when the page is opened

- **The server side.** `refreshNewsOnDemand` in `lib/refresh.ts`:
  - It reads the feeds again if the last on-demand read was 5 minutes ago or
    more (`PRESS_FRESH_MS`). It looks at followed people again if the last
    look was an hour ago or more (`PEOPLE_FRESH_MS`).
  - It uses the same gated, fail-soft passes as the daily run.
  - It runs as one queue job, `news-refresh`, so only one refresh is in
    flight per instance, and a second caller shares the first's answer.
  - The times are kept in memory on the server, and stamped when a read
    starts, so a failing feed is not asked again for 5 minutes. A restart
    forgets them, so the first visit after it refreshes once. The daily pass
    stays as the floor.
- **The action.** `refreshNews` in `lib/news-actions.ts` is the server action
  the page calls. It expires the bell only when a look at people stored
  something.
- **The page.** `/news` still reads rows only. After it has painted (an
  effect, then a frame), `NewsRefresh` (`components/news/news-refresh.tsx`)
  calls the action:
  - It calls again when the tab becomes visible after more than 5 minutes.
  - While the call runs, a quiet mono line under the tabs says "Checking
    for news…". The line keeps its height, so nothing jumps.
  - If anything new was stored, the page draws itself again.
  - Rows the page was not first drawn with rise in (`Arrival`,
    `motion-rise-in`, the arrival rule `ExitList` uses). The catalogue row
    says so.
  - Home's rail and the bell never call it.
- **Tests** (`tests/news-refresh.test.ts`):
  - A second call within five minutes reads nothing.
  - Five minutes on, the feeds are read again but people wait for their
    hour.
  - Two callers at once share one refresh.
  - The action answers when every feed fails, and the gate still holds.
  - Nothing runs for someone signed out.

### Judgement calls

- **The crossfade has no floor under it.** The owner asked for the outgoing
  picture to fade out, so the two pictures now cross rather than one
  resting on the other. Near the middle of the 1.2s, some of the dark card
  behind shows through.
- **The outgoing picture's zoom runs on**, rather than holding still, so
  "the two never stand still" holds. The keyframes therefore run past 1.08.
- **The amber dot is one element that moves.** The three dots under it are
  plain.
- **A swipe needs 40px**, and needs to be more across than down.
- **The list redraws only when something new was stored.** Otherwise the
  line simply goes away.
- **Rows are ordered as before, whatever their age.** The feeds' own
  published times, or the follow's time for seeded news, decide the order,
  so a new row can arrive in the middle of the list rather than at the top.

### To test by hand

- **Desktop Discover:**
  - Watch a few changes: the pictures cross over about a second, each still
    zooming, with no pause.
  - The old words fade quickly, then the new ones rise in. Never both at
    once.
  - The amber dot slides.
  - Hover to pause and leave to resume. Click the dots.
  - With reduced motion: instant changes, no zoom, no auto-advance.
- **Phone Discover:**
  - One card, the column's width and about 300px tall, turning like the
    desktop's.
  - Swipe left and right to step. Scrolling the page up and down over it
    still scrolls.
  - A tap opens the title. Holding a finger pauses it.
  - No #4 and #5 cards. The rail starts at 4.
  - On desktop the rail still starts at 6.
- **`/news`:**
  - On opening, "Checking for news…" appears briefly under the tabs.
  - Reopen within 5 minutes: it goes away almost at once, and the server
    reads nothing.
  - After 5 minutes, new headlines appear on Popular, rising in.
  - Leave the tab in the background for more than 5 minutes and come back:
    it checks again.
  - Home and the bell never show the line or trigger a read.

## Round 10: the News page, Settings › News, the Home rail

`round10-brief.md` in the review folder, built to the approved `V2-News6`
boards (Pick, Settings, Home). One migration (backed up first), no new
dependency. Nothing new on a request path reaches the network: feeds are
still read only by the refresh the News page asks for after it has painted
and by the daily pass, one at a time through `mapLimit` and the `press`
gate, failing soft. The one read made while someone waits is adding an own
feed in Settings, which the brief asks for. Round 9 above still describes
the rest; where the two disagree, this section is current.

### 1. The News page

- **Chips** replace the For you / Popular tabs: For you, Top, Trailers,
  Renewals, Casting, Dates, Box office, Reviews, on a `SegmentPill`, each an
  address (`?tab=`; `for-you` and `popular` still land, `popular` as Top).
  The rules are in `lib/news-page.ts`, pure over rows already read:
  - For you: your own news, as before (`newsFor`).
  - Top: every headline you read, newest first.
  - Trailers: your `trailer` rows, and headlines classified Trailer.
  - Renewals: your show's `renewed`, `cancelled`, `ended`, `new-season`, and
    headlines classified Renewed or Cancelled.
  - Casting: a followed person's `announced`, and headlines classified
    Casting.
  - Dates: your show's `next-date` and `date-moved`, a film's `release-date`,
    and headlines classified Dated or Moved.
  - Box office and Reviews: headlines classified so.
  - A chip with nothing says "Nothing under Trailers yet"; For you and Top
    keep their empty states.
- **Classification** (`classifyHeadline` in `lib/press.ts`) is a keyword
  rule on the headline, whole words, case-insensitive, first rule wins, in
  this order:

  | Kind | Keywords |
  | --- | --- |
  | Cancelled | cancel, cancels, cancelled, cancellation; axes, axed; won't return, will not return; not renewed |
  | Renewed | renew, renews, renewed, renewal; "season N ordered"; "orders a second (third, …, Nth) season", "orders season N" |
  | Trailer | trailer, teaser, first look |
  | Casting | cast, casts, casting; join, joins; to star; lands a role |
  | Box office | box office; opens to; a money figure ("$48M", "$200 million", "$1.2bn"); debut beside "weekend" |
  | Reviews | review, reviews; round-up, roundup; critics |
  | Moved | move, moves, moved; delay, delayed; pushed; push back; postponed |
  | Dated | release date; dated; "sets … release"; premiere date |

  It is stored at record time in `NewsItem.tag`. Rows from before this round
  are classified once by the next feed pass (`backfillPress`).
- **The lead story**: the newest headline under the chip (and the channel,
  if one is chosen) that has a picture and names a title the cache knows,
  else the newest with a picture. It is 16:9 on desktop and 7:6 on a phone
  (350×300 at 390px, scaling with the column), 22px corners, with a scrim to
  the foot. On it: the amber kind chip and a "Lead story" chip, the headline
  in the display face (36px, 22px on phones, two lines at most), the summary
  line (desktop and tablets), "Variety · 2 h", and the matched title's poster
  and name with "· you're watching" or "· saved". The picture and the
  headline open the article in a new tab; the title opens it in Trekker. The
  lead is not repeated in the feed.
- **The summary line** is the item's own `description` (RSS) or `summary`
  (Atom) as plain text: tags stripped, entities decoded, a site's "The post …
  appeared first on …", "Read more" and "[…]" taken off, the first two
  sentences, 220 characters at most, cut at a word with an ellipsis. It is
  stored in `NewsItem.summary`. `content:encoded` and Atom's `content`, the
  article body, are never read. The comment in `lib/press.ts` says so.
- **The feed**: a grid of cards, two columns once the left column is 640px
  wide (a container query) and one on phones.
  - A headline with a picture and a summary is a big card: the picture on
    top with the kind chip on it, and the play mark for a trailer; the
    headline in the display face; two lines of summary; the byline beside the
    matched title and how you stand with it.
  - Other headlines are small cards: a 96×64 picture, or the source's name
    on the surface; the quiet kind chip; the byline; the headline in two
    lines.
  - Your own news is always a small card with the amber chip. It has the
    title's backdrop from the cache, or its poster cropped, or the person's
    headshot in a 56px circle, plus an unread dot. It is marked read on
    opening as before, unless Settings says not to.
- **Desktop column** (340px, from `lg`):
  - **For you**: the five newest rows (a 40px poster or headshot, the amber
    chip, the age, the headline in two lines), the unread count, and
    "Everything you follow ›", which selects the For you chip.
  - **Your channels**: "N new", "Tap one to read only its news.", and the
    round buttons, then "Everything you follow ›" and "Sources and push" with
    the cog.
- **Your channels**: one round button per followed person, show or saved film
  with news in the last 30 days, newest first, 12 at most (`channelsFrom`).
  - Each is a 64px ring round a 54px picture: the poster cropped towards the
    top, or the headshot.
  - An amber ring and count while there is unread news; the chosen one keeps
    the ring.
  - The label is a person's first name, or a title up to its colon.
  - A tap sets `?subject=tv:123` (or `movie:`, `person:`), with the chip still
    applying; the chosen one tapped again lets go. The address is replaced.
- **New trailers** at the foot, at both widths: your titles' trailers from
  the last 14 days first, then headlines classified Trailer from the same
  fortnight.
  - Cards are 268×151, or 220×124 in a phone's swipe rail, with the play
    mark, the title and "Series · 2026".
  - A card opens the YouTube trailer in a new tab, as the title page's
    Trailer does, or the article for a headline. The trailer's key comes
    from the news row's own key (`NewsRow.video`).
  - The trailer's length is not stored by the trailer check, so the line
    carries the year from the cached details instead.
- **Header**: "‹ Home" and the title as before. The meta line is "Thursday
  24 September · updated 2 min ago" on desktop, the time the feeds were last
  read (`newsReadAt` in `lib/refresh.ts`: the on-demand stamp or the last
  finished pass, in memory). On a phone it is "Thu 24 Sep · 4 unread". While
  a refresh runs, it says "checking…". To the right:
  - Mark all read (desktop).
  - A Refresh icon button, which runs the same refresh as opening the page
    but ignores the feeds' five minutes (`refreshNews(true)`; followed people
    keep their hour).
  - A cog to `/settings/news` (desktop only; on phones Settings has it).
  - The old "Checking for news…" line under the tabs is gone; the meta line
    says it.
- **Phones**, in order: the header (round back button, title, meta,
  Refresh), Your channels as a swipe row, the chips (one scrolling row),
  the lead, a "For you" rail of 190px cards (not under the For you chip,
  which already lists them), the feed under the chip's name ("Top stories"
  for Top) with its source count, then New trailers.
- The bell, the sidebar count and Home's count stay For you only.
- `components/news/`: `press-cards.tsx` (the lead, big and small cards),
  `your-cards.tsx` (your news's four card shapes), `channels.tsx`,
  `trailer-rail.tsx`, `chip-memory.tsx`, and `news-refresh.tsx` (now a
  provider for the meta line and the Refresh button). `news-row.tsx` and
  `press-row.tsx` are gone. The skeleton (`news/loading.tsx`) matches the new
  layout.

### 2. Settings › News

A new section, `news`, between Notifications and Connections
(`nav-items.ts`, `/settings/news`). Its icon is the clapperboard the
sidebar's News uses, and its list line is "5 sources · big ones pushed"
(`newsLine` in `summaries.ts`, from the facts the controls keep current).
On desktop it is four cards; on a phone, one folded card under You, with a
mono heading per part. Everything saves as it changes (`lib/news-settings.ts`,
`lib/news-settings-actions.ts`).

- **Sources**: a switch per source name the instance reads (`feedList()`),
  on by default, with "N of M on".
  - A switch writes a `NewsSource` row for every address under the name,
    since Variety and The Hollywood Reporter each publish a TV and a film
    feed and the board shows one Variety.
  - Only a switch turned off needs a row: a missing row is on, so a feed
    added to `NEWS_FEEDS` reaches everyone.
  - The page, the lead and every chip draw only headlines whose `feedUrl` is
    one of your sources that are on, or one of your own feeds
    (`visibleFeeds`).
  - On a phone the sources are amber chips with a tick, own feeds among them
    marked Yours.
- **Your own feeds**: paste an RSS or Atom address and Add.
  - The action reads it once (six seconds, through the press gate). An
    answer that is not RSS or Atom with items says "That address did not
    answer with a feed". Not a web address, one of the instance's own feeds,
    or one you already have are refused with their own words.
  - A feed that answers is stored in `UserFeed`, named by its own title's
    last part or its host. What it read is recorded at once, so the page has
    its headlines immediately.
  - The passes then read it with the instance's feeds: once per address
    however many people added it, 40 kept per feed, the 30-day prune.
  - Its rows carry its address as `feedUrl`, and only the people who added it
    see them.
  - Each row has the name, an amber "Yours" chip, the address, a switch and a
    cross. The cross removes the feed and its headlines, unless someone else
    has the same address.
  - Ten per person. At the cap the field says so and nothing is fetched.
- **Push**:
  - "Push me the big ones" is the old `notifyNews` column, now narrowed to
    renewals, cancellations, endings, new seasons, and dates moved or set
    (`isBigNews`).
  - "New work from people you follow" is a new `notifyNewsPeople` column.
    The migration copies the old switch into it, so nobody's push changed
    on the day.
  - Each is its own message in the morning push (`newsPushes`), which runs
    once a day and marks each device told, so neither goes more than once a
    day.
  - "Popular news" is shown off and disabled: "Never pushed, only on the
    page".
  - The switch and the admin's feed list are gone from Notifications, whose
    line no longer mentions news.
- **Reading** (columns on `User`):
  - "Open on": For you, Top, or Last used (`newsOpenOn`). Last used is kept
    in localStorage by `ChipMemory` whenever the address names a chip. On an
    address with no chip, the page draws For you and then replaces the
    address with the remembered chip.
  - "Mark read when opened", on by default (`newsMarkOnOpen`). Off, opening a
    story on the page or Home leaves it unread, and only Mark all read
    clears the count.
  - "Keep stories for" 7 or 30 days (`newsKeepDays`). On the instance's
    rows, 7 only hides older headlines, since everyone shares them and the
    instance still keeps 30. An own feed's rows are pruned at the longest
    window any of its owners keeps.
- **Feeds on this instance** (admin only): the list in a code block, with a
  note that `NEWS_FEEDS` (comma-separated) replaces it and an empty value
  turns Popular news off for everyone. Read-only.

### 3. Home: the News rail

`NewsTier` moves after Trending and before Friends watched, and shows at
both widths. It shares Trending's `order-6` and follows it in the source,
so the flex order breaks the tie by source order and no other tier's class
changed.

- It is a rail of the five newest For you stories. Cards are 268px on
  desktop and 220px in a phone's swipe rail.
- Each card has the picture on top at 2:1 (the title's backdrop from the
  cache, else its poster cropped), the amber kind chip on it, and a followed
  person's face on the picture's corner.
- Under it, the headline in a fixed two lines and "Lanterns · 2 h" in mono.
- The head is "News", "4 unread · about what you follow", and the chevron to
  `/news`.
- It is absent when there is no news, and has no skeleton, as before.
- The pictures come from the cache's details rows in one `json_extract`
  query (`titleArt`), never TMDB.

### 4. Data

- **Migration** `20260925120000_news_app`, plain `ADD COLUMN`s, so no table
  is rebuilt:
  - `NewsItem.tag`, `NewsItem.summary`, `NewsItem.feedUrl` (nullable, with an
    index on `feedUrl`).
  - `User.notifyNewsPeople` (set from `notifyNews`), `User.newsOpenOn`
    ("for-you"), `User.newsMarkOnOpen` (true), `User.newsKeepDays` (30).
  - New tables `NewsSource { userId, feedUrl, enabled }` (key on both) and
    `UserFeed { id, userId, url, name, enabled, addedAt }` (unique per person
    and address). Both cascade with the account.
  - The schema's comments say why each is there.
- **Backfill**: a migration cannot read `NEWS_FEEDS`, so the first feed pass
  after it does the backfill. Old press rows get their `feedUrl` from their
  source's name, by the first instance feed under that name (or the name an
  unnamed feed's title gives it on that pass). Their `tag` comes from the
  headline. A row whose name matches no feed keeps a null `feedUrl`, is
  treated as the instance's, and goes with the 30-day prune. `tag` is "" for
  "classified, none of the kinds" and null for "not yet looked at", so the
  backfill runs once.
- `data/trekker-migrated.db` was copied to
  `data/trekker-migrated.before-round10.db`, then migrated. The migration was
  first tried on a scratch copy. `prisma migrate diff` against the schema is
  empty afterwards.

### 5. Tests

`tests/round10.test.ts`, 72 tests, with the fixtures
`tests/fixtures/feed-summaries.xml`, `article-with-og.html` and
`article-without-og.html` (invented stories). Nothing reaches the
network: feeds are handed to the code, and the fetch is stubbed where a
pass runs.

- `classifyHeadline`: every kind, and headlines that must stay null
  ("podcast", "broadcast", "Updated:").
- The summary line: two sentences, 220 characters, tags stripped,
  boilerplate gone, never the body.
- The lead rule.
- Chip filtering: a For you renewal under Renewals, a headline under
  Trailers, For you and Top alone, and subjects.
- New trailers.
- Where the page opens.
- Your channels: 30 days, the unread count, the cap of 12, the labels.
- A source turned off hiding headlines from one person only; own feeds
  visible to their owner only, off and removed.
- The own-feed refusals and the cap of 10, where nothing is fetched at the
  cap.
- The pass reading own feeds once per address and backfilling old rows; the
  own-feed prune.
- Reading settings, and marking read on opening only when asked.
- The split push.
- The Settings line and section order.
- The Home order: a source assertion on `page.tsx` and `tiers.tsx`.
- The migration's SQL on an in-memory database.

`tests/press.test.ts` changed where Round 9 promised the summary was never
kept: items now carry `summary`, and the test asserts that the body never
reaches an item. **553 tests pass** (481 before), and lint, typecheck
and the build are clean.

### Review fixes

- **The feed folds at 30 cards**, with "Show 30 more" (or however many are
  left) under the grid until the rows run out (`FeedFold`, `feedFold` in
  `lib/news-chips.ts`). The lead is not counted. The rows are already read
  and drawn, so the button makes no request, and a new chip or channel
  starts folded again.
- **Settings › News fits a phone**: the admin's feed list scrolls inside
  its block (`w-0 min-w-full max-w-full overflow-x-auto`), the fold and its
  cards are `min-w-0`, and Open on and Keep stories for stand under their
  labels below `lg` with labels that do not wrap.
- **A trailer card with no picture** writes the source's name (or, for a
  title with no backdrop or poster, its name) small on the surface, as the
  small feed card does, so the headline is not typed twice behind the play
  mark.

### Second review fixes

- **Settings › News saves show at once.** Every write in
  `lib/news-settings-actions.ts` now expires this person's bell (which holds
  the account row for a minute) and refreshes the router, as
  `lib/settings-actions.ts` does. The two push switches save through its own
  `saveNewsPush` (`NewsPushSwitch`) so they do the same.
- **Own feeds' headlines show.** The page read the newest 150 headlines
  overall, which the instance's feeds (up to 280 rows) filled before an own
  feed's older items. It now reads every headline the person reads within
  their window, up to 400 (`pressForReader`, `PAGE_PRESS_CAP`).
- **Pictures from the article.** The Hollywood Reporter's and IndieWire's
  feeds carry none. After recording, the pass reads the head of each new
  picture-less article, plus 20 older ones newest first
  (`lookUpPictures` in `lib/press.ts`), three at a time through the press
  gate: a `Range` request for the first 512 KB (64 KB until the fifth
  review, which found the tag 190 to 310 KB into these sites' heads),
  reading stopped there, at the picture's tag, or at
  `</head>`, six seconds, two redirects at most, followed by hand. It keeps
  the first `og:image` or `twitter:image` (https only) and nothing else from
  the page. A page that answers without one is marked `imageUrl = ""` and
  never asked again; one that does not answer is asked next pass.
- **No picture, designed.** `components/news/no-picture.tsx` is the one
  place a card's picture is drawn: the feed's, else the named title's
  backdrop or poster from the cache, else the second surface with the mark
  faint in the middle and the source's name small in a corner (both themes,
  by tokens). The big and small cards, your news's small card, Home's rail
  and New trailers use it.
- **"Nothing under Top for Silo yet."** when a channel is chosen
  (`nothingUnder`).
- **Mark read when opened**: the rule is `markOnOpening` in
  `lib/news-words.ts`, and a test opens a story with it off and finds it
  still unread.

### Third and fourth review fixes

- **Article pictures**: `fetchHead` read a 600 KB page that ignores
  `Range` correctly (a test streams one in odd chunks with og:image at 300 KB
  and `</head>` at 320 KB, multibyte characters across chunk edges). What
  differed from the reviewer's working plain fetch was the named user agent,
  so the head request now sends none of its own. And a head that names no
  `og:` tag at all (a consent or bot page) no longer marks the row "looked,
  none": only an article's own head does (`isArticleHead`); every failure
  leaves `imageUrl` null for the next pass. Nothing is logged per article.
- **Settings after a reload**: the service worker paints a reload from its
  cached copy of the page, then `CacheRefresher` re-reads it; the controls
  kept the value they were first drawn with. `useSaved` (and the sources'
  state) now takes a newer server value, so the refreshed page ends right.
  The settings routes read cookies and were already dynamic.
- **The desktop cast grid** (`CastRail`) shows two whole rows: two `auto`
  rows and zero-height ones after, the space between rows each tile's own
  bottom margin, and the rail's bottom padding off from `lg`, so the clip
  falls at the second row's foot instead of 12px into the third's faces.
- **The feed has one pair of big cards**, first: the first two headlines
  with a picture (`arrangeFeed`), side by side in the desktop's two columns
  and stacked on a phone; everything else small, through every Show more.
- **The lead is a carousel** of three (`chooseLeads`, `LeadCarousel`), on
  Discover's machinery: `CarouselFrame` and `DwellArt` are now shared from
  `discover/top-carousel.tsx` with `carousel.module.css` and
  `useCarousel`. No animation loop: a `setTimeout` chain and CSS. The three
  are not repeated in the feed.
- **New trailers** now stands under the lead, above the feed, at both
  widths.
- **A dead picture address** hides its image (`FeedImg`, a client `<img onError>`) over the `NoPicture` placeholder drawn beneath it, on every card and the lead carousel.

### Judgement calls

- **One switch per source name**, not per address, as the board draws one
  Variety.
- **Kind chips**: amber on your own news and on artwork (the lead, big cards,
  Home), as the boards draw them. A headline's small card has a quiet chip,
  as the board's Moved, Dated, Reviews and Cancelled rows do. STYLE.md
  "Chips" says so.
- **Your news in the feed** has the title (or the person) as its byline where
  a headline has its source: "Lanterns · 2 h". A person's row shows its
  detail ("Snow Ponies announced") as the headline, since the byline names
  them.
- **"debut" counts as box office only beside "weekend"**, and money figures
  count on their own. A series' "debut date" is a date.
- **Push me the big ones is narrower than the old switch**: new trailers and
  next-episode dates are no longer pushed. The brief's definition asked for
  that.
- **The phone's For you rail is left out under the For you chip**, where the
  feed below is the same rows.
- **The phone has Mark all read in the feed's head under For you**, which the
  board does not draw. With "Mark read when opened" off, it would otherwise
  have no way to clear the count.
- **Open on's choices are For you, Top and Last used**, as the brief says.
  The board wrote Popular.
- **New trailers says "last two weeks"**, which is what it holds, where the
  board wrote "this week".
- **A person's headshot on Home** sits on the credit's backdrop when the
  cache has that title, else on its poster, else on the placeholder.
- **The lead's summary hides on phones**, as the phone board draws it.

### To test by hand

- **Add an own feed**: Settings › News, paste an RSS address (for example
  `https://www.theverge.com/rss/entertainment/index.xml`) and Add.
  - It appears with the Yours chip, and its headlines are on `/news` at
    once, under Top and the chips they classify into.
  - Sign in as someone else: they do not see them.
  - Paste a web page's address: "That address did not answer with a feed".
  - Remove it with the cross: its headlines go.
- **Toggle a source**: turn Variety off. Its headlines leave Top, the chips
  and the lead for you, and not for another account. The list line and "N
  of M on" follow.
- **The Refresh button**: open `/news`, wait for "checking…" to clear, then
  press Refresh within five minutes. It checks again, and the "updated"
  time becomes "just now".
- **Chips**: each chip, including a For you renewal showing under Renewals.
  `?tab=popular` lands on Top. With Open on set to Last used, choose Casting,
  leave, and open News from the sidebar: it moves to Casting.
- **Round buttons on a phone**: swipe the row; an unread subject has an amber
  ring and count. Tap one: only its news, and the chips still apply. Tap it
  again to let go.
- **Mark read when opened** off: opening a story leaves the sidebar count;
  Mark all read clears it.
- **Push switches**: both saved and reflected in the list line. With push on
  and a renewal or a followed person's new work in the last day, the morning
  push sends one message for each switch that is on.
- **Home**: the News rail after Trending at both widths, 268px cards on
  desktop and a swipe rail on a phone, the person's face on the corner.
- **Light theme**: the lead and the trailer cards stay dark with white type,
  and the cards sit on the surface.

## The image, and replacing the old app on Unraid

The rebuild ships the way the old app did: the same `Dockerfile`,
`docker-entrypoint.sh`, `docker/prisma.config.ts`, `.dockerignore`,
`docker-compose.yml`, the GitHub workflow that publishes to
`ghcr.io/damianeickhoff/trekker`, and the Unraid template and notes under
`unraid/`, carried over from the old repository with these changes:

- The migrator stage pins `prisma@7.10.0`, the version this app is built with.
- `.dockerignore` also leaves out `data/` (local databases, their dated
  backups and profile pictures) and `tests/.tmp`.
- The template and the compose file drop `OMDB_API_KEY`, which nothing reads
  any more, and offer `NEWS_FEEDS` and `WEATHER_LATITUDE`, `WEATHER_LONGITUDE`,
  `WEATHER_PLACE`.
- `/api/health` and `lib/version.ts` came across unchanged, and the sign-in
  guard in `proxy.ts` now lets the health check through: without that the
  container's `HEALTHCHECK` followed a redirect to the sign-in page and passed
  without ever touching the database.

**Why an existing volume survives.** The container keeps its database at
`/data/trekker.db`, and the entrypoint runs `prisma migrate deploy` before the
server starts. The rebuild's migrations begin with the old app's 37, byte for
byte, so on the old app's volume only the rebuild's own are applied, once. The
ratings become 1 to 5 with the old percentage kept in `legacyScore`; profile
pictures stay in the database and are written out to `/data/avatars` when
first shown. Keep `AUTH_SECRET` (sessions, and the sealed Plex and Overseerr
credentials), the VAPID keys (push subscriptions) and `PLEX_WEBHOOK_SECRET`
(the webhook address Plex already has) as they are.

**It is one way.** A migrated file cannot go back under the old image, which
would read a 4 as 4%. Before switching: stop the container, copy the appdata
folder to a dated one, and note the old image's `sha-<short>` tag. To roll back,
restore the folder and point the template at that tag.

Checked on 25 September 2026 without Docker: `npm run build` against an empty
database, as the image builds; then the standalone server, as the image runs
it, on a fresh database and on a migrated copy of the old app's local
database, both answering `/api/health` with `{"ok":true,...}` and serving the
sign-in page. The image itself is built by CI on push.

## Running it

```sh
cp .env.example .env     # then set DATABASE_URL, AUTH_SECRET and TMDB_API_KEY
npm install
npm run dev              # http://localhost:3000
```

`DATABASE_URL` must point at a **migrated copy** of the current database,
never the one the current app is using: after migrating, ratings are 1 to 5,
which the current app would read as percentages.

```sh
cp /path/to/current/trekker.db data/trekker-migrated.db
DATABASE_URL="file:./data/trekker-migrated.db" npx prisma migrate deploy
```

The first visit to Home after that starts the backfill. Without
`TMDB_API_KEY` it still runs, but can only record what has been watched, not
what comes next, so Up next stays empty until a key is added and the six-hourly
pass fills it in.

If `npm run dev` stops at "better-sqlite3 cannot load its native binding",
run `npm rebuild better-sqlite3`: its install script did not run.

The service worker registers only in production builds:

```sh
npm run build
npm start
```

For the standalone server, copy `public/` and `.next/static/` next to
`.next/standalone/server.js`; Next does not do that itself.

## Checks

```sh
npm run typecheck
npm run lint
npm test                 # throwaway SQLite files in tests/.tmp; no network
```

## Conventions

The design and code conventions live in [`STYLE.md`](STYLE.md).

All nine build steps are done. What is left before this replaces the current
app is the owner's test of step 9 against the real Plex, Overseerr and Trakt,
and the features in `TODO.md`.

## Measured, 24 September 2026

Production build on a throwaway copy of the owner's database, phone viewport
(390×844), Edge, service worker allowed. "Warm" is the second launch after the
worker has installed. Throttled is 4 Mbit down with 40 ms latency through CDP;
targets are from the rebuild plan's section 10.

| Measure | Target | Throttled | Unthrottled |
| --- | --- | --- | --- |
| Shell first paint, warm | under 300 ms | 48 ms | 60 ms |
| Up next tappable, warm | under 1 s | 71 ms | 90 ms |
| Up next tappable, cold | under 2.5 s | 503 ms | 369 ms |
| Title page tappable, warm | under 1.5 s | 75 ms | 79 ms |
| Cold Home transfer | under 600 KB | 415 KB | 416 KB |
| Warm Home transfer | | 27 KB | 7 KB |

Every target is met. The old app's equivalent figures were not captured
before the rebuild started, so there is no before/after pair; the plan's
description of the old cold start (several seconds blank while the layout
made five sequential reads and the dashboard resolved every show through
TMDB) stands as the comparison.
