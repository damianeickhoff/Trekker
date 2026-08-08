# Trekker

A TV show and movie tracker: log the episodes and films you have watched, keep a
watchlist, rate and review, discover what is popular, and see exactly how many
hours you have spent watching.

## Stack

| Piece     | Choice                                              |
| --------- | --------------------------------------------------- |
| Framework | Next.js 16 (App Router, React 19, Server Actions)   |
| Styling   | Tailwind CSS v4                                     |
| Database  | SQLite via Prisma 7 (better-sqlite3 adapter)        |
| Auth      | Email + password, bcrypt hashes, JWT session cookie |
| Catalogue | The Movie Database (TMDB) API                       |
| Icons     | lucide-react                                        |

## Getting started

1. Install dependencies:

```bash
npm install
```

2. Get a free TMDB API key at <https://www.themoviedb.org/settings/api> and put
   it in `.env` (either a v3 API key or a v4 read access token works):

```
TMDB_API_KEY="your-key-here"
```

Optionally add a free [OMDb key](https://www.omdbapi.com/apikey.aspx) as
`OMDB_API_KEY` to show Rotten Tomatoes, Metacritic and IMDb scores on title
pages. TMDB does not carry those, and Rotten Tomatoes has no public API, so OMDb
is the practical route — looked up by IMDb id, cached for a day, and simply
absent if the key is missing.

Also set `AUTH_SECRET` to a long random string before deploying anywhere real.

3. Create the database and start the dev server:

```bash
npx prisma migrate dev
```

```bash
npm run dev
```

## Deploying

The deployment story is one container. `docker-compose.yml` is the short version:

```bash
docker compose up -d
```

It wants `AUTH_SECRET` and `TMDB_API_KEY` in the environment and will refuse to
start without them, which is the intended behaviour — an instance with a
guessable session secret is worse than an instance that did not come up.

Without compose, the same thing by hand:

```bash
docker run -d --name trekker -p 3000:3000 -v trekker-data:/data -e AUTH_SECRET="$(openssl rand -base64 48)" -e TMDB_API_KEY="your-key" trekker
```

A few things worth knowing before this is somebody's actual server:

**The volume is the whole application.** Everything — accounts, plays, ratings,
lists, achievements — is one SQLite file at `/data/trekker.db`. Mount something
there or it dies with the container. Back that file up and you have backed
everything up; there is nothing else to collect.

**Migrations run at startup, not at build.** The entrypoint calls
`prisma migrate deploy` before handing over, so an empty volume becomes a
working database on first boot and an existing one is brought up to the schema
the image was built from. On an already-current volume it is a no-op. This is
deliberate: the database belongs to the deployment, not to the image.

**The container runs as uid 1000.** Everything the server writes to — the
database, Next's cache — is owned by it, so a bind mount has to be owned by 1000
too, or the first thing the container does fails. A named Docker volume handles
this for you; a host path does not.

**There is no scheduler inside the app.** Two jobs expect to be called once a
day by something outside — `/api/notifications/run` for the "what is on tonight"
push, and `/api/lists/refresh` to rebuild smart lists before anyone looks at
them. Both are guarded by `CRON_SECRET` and both are optional; see
[Notifications](#notifications) and [Lists](#lists) for what you lose without
them.

**Push notifications need HTTPS.** Service workers refuse to register outside a
secure context, so a bare LAN address disables the feature regardless of whether
the VAPID keys are set. Anything terminating TLS in front is enough.

`/api/health` answers `{ ok: true }` once the server is up and the database
answers, and is what the image's `HEALTHCHECK` polls.

See `.env.example` for every key and which are optional.

### Unraid

`unraid/` has a ready-made Docker template, a User Scripts entry for the daily
jobs, and a walkthrough covering the parts specific to Unraid — appdata
ownership, keeping SQLite off the FUSE layer, and getting a locally built image
somewhere the template can pull it from. Start at
[`unraid/README.md`](unraid/README.md).

## What is in here

- `/` — signed-out landing page, or your dashboard: a featured **Up next** hero,
  the rest of what is waiting, a **Landing soon** rail of the next eight air and
  release dates (wide artwork, relative wording like "in 3 days" rather than
  dates), trending, what other profiles have been watching, then one mixed
  **Recently watched** rail. Statistics live on the profile page, not here.
- `/discover` — an **Everything / Shows / Movies** filter (`?type=tv|movie`)
  that reshapes the whole page rather than hiding rows: narrowing it skips the
  requests it cannot use, and carries the medium through to the genre tiles and
  category chips. Then a top-three spotlight, a "find your next watch" genre
  picker, and deliberately varied rows so the lower half is not one long stack of
  identical poster rails: a ranked row for the rest of the trending twenty, a
  wide-artwork billboard row for what is in cinemas, and tinted bands grouping
  "on the horizon" and "the hall of fame". Each category also has its own
  paginated page. Genre pages live at `/discover/genre/[slug]` and can be
  narrowed to films or series.
- `/friends` — friend requests in and out, your friends, and everyone else on
  the instance you could add. Profiles are private until both sides agree:
  `/profiles/[id]` shows a name and an **Add friend** button to anyone who is
  not a friend, and stats and activity to anyone who is. The home feed and the
  profile page's friends list are scoped the same way — there is no
  "everyone on this instance" view of anybody's watch history.
- `/title/[movie|tv]/[id]` — details, audience score, genres, cast, TMDB
  reviews, recommendations, a **Trailer** button, and a streaming strip under
  the hero (TMDB's JustWatch feed, subscription services only, for the
  configured `WATCH_REGION`) — a different question from the Plex badge beside
  it, that one being "is it already on our server".
  Films get a one-tap **Watched**; series get a season
  browser with per-episode ticks, a mark-whole-season button, next episode and
  hours spent on that show. The progress bar only appears while there is ground
  left to cover: once you are caught up it is replaced by a written verdict —
  **That's it, folks** for a show that has ended, **More to come** for one
  waiting on a whole further season — with the stats that are actually
  interesting at that point. A season still airing week to week keeps the bar:
  there is real ground left to cover.
- `/calendar` — a week at a time: a seven-tile strip for the week at a glance
  (a dot per thing landing that day), then a timeline of the days that actually
  have something on them. Arrows on desktop, swipe on touch. Air dates for shows you watch or have watchlisted, series
  premieres, and release dates for watchlisted films. `?w=YYYY-MM-DD` picks the
  week. It is a schedule, not a diary — watch history does not appear here.
- `/watchlist` — every list you keep, in four rows: your watchlist and your
  favourites as rails of titles, then a rail of tiles for the lists you fill by
  hand and another for the smart lists that fill themselves. See
  [Lists](#lists).
- Three months of the year the whole app changes colour and grows a decorative
  backdrop — see [Seasonal dressing](#seasonal-dressing).
- `/screensaver` — the whole window, with no header and no tab bar: artwork a
  title at a time, the clock, the weather and whoever in the house has something
  playing. Started from the avatar menu, or on its own after however long you
  choose. See [Screensaver](#screensaver).
- `/settings` — profile details and picture, light/dark/system theme, the
  screensaver, your Trakt account, and the Plex and Overseerr connections.
  Reachable from the avatar menu in the header,
  which also holds a quick theme toggle and sign out.
- `/profile` — a gradient banner, four headline tiles, a 12-month bar chart,
  the shows-vs-movies split, your trophy cabinet, watching habits, your
  friends, which shows ate your time, and your ratings and reviews.
- `/achievements` — thirty-seven challenges in six groups, each with a badge
  and, where there is something to count, a percentage. See
  [Achievements](#achievements).

Everything is responsive: a bottom tab bar and horizontal poster rails on
mobile, a top nav and grids on desktop.

## Marking things watched

Tapping **Mark watched** — on a film, or the tick beside an episode — logs it at
the current time immediately. Nobody has to answer a question to record the
common case. A small menu then opens offering **Yesterday**, **2 days ago** and
**Earlier…** (a date field); picking one overwrites the timestamp, ignoring it
costs nothing. Dates are stored at local midday so a timezone shift cannot move
a date-only answer onto the wrong day.

The date is shown back wherever it is useful: on the film's own button, beside
each watched episode, and on a show's progress card as "last episode watched".

Watching something also takes it off your watchlist — a film as soon as it is
logged, a show once every aired episode is watched *and* the show has ended or
been cancelled. A returning series you are caught up on is still something you
are waiting for, so it stays.

## Achievements

Thirty-seven challenges, grouped into **Milestones**, **Habits**, **Seasons**,
**Taste**, **Completion** and **People** — a hundred films in one calendar year,
thirteen horror films in one October, five science fiction titles in one
November, every film in a franchise, ten Best Picture winners and then all
ninety-seven of them, a film from every decade since the 1950s, thirty days
running without a gap, and so on. Each one carries a badge; the ones with
something to count also carry a percentage and a line saying which year or which
franchise is closest.

Progress is **always recomputed** from the watch history when
`/achievements` is opened. Only the moment of unlocking is written down, in
`UnlockedAchievement` — it is the one fact the history cannot produce again, and
a stored counter would drift the first time a row was deleted. The
flip side is deliberate: a badge already earned is kept even if the number
behind it later falls, so deleting a watched row never confiscates something you
did do.

The profile pages read that table directly and show nothing else, which keeps
them a cheap query — working out how close you are to the rest is the
achievements page's job, and someone else's profile is a display case rather
than a to-do list.

Genre, language, decade and franchise challenges need facts TMDB has and the
watched rows do not. Those land in `TitleMeta`, a cache shared by every user,
filled 80 titles at a time per visit to `/achievements` (franchises, 25) in the
same "top it up as you go" spirit as the watchlist. A first visit with a long
history will read low on those few until later visits finish the job, and the
page says so rather than pretending. Without a TMDB key everything that can be
counted from the database alone still works.

The admin — the first account created, as with the Plex and Overseerr settings —
can **take a badge back** from any account including their own, under Settings →
Badges. Only the badge goes; the watch history behind it is untouched, so
anything still true is earned again on the next evaluation. That is what makes
it useful for testing an achievement twice, and for undoing one that was awarded
wrongly.

Best Picture winners are matched by title and year rather than TMDB id — see
[`best-picture.ts`](src/lib/achievements/best-picture.ts), where the new winner
goes each spring.

Twenty-five of the badges are **named franchises** — Harry Potter, the Infinity
Saga, Star Wars, The Conjuring, Insidious, Saw, Halloween, Bond and the rest, in
[`franchises.ts`](src/lib/achievements/franchises.ts). Most are a TMDB
collection, and a film counts when its cached `collectionId` matches, which costs
nothing extra. The MCU is not a usable TMDB collection — its keyword drags in
one-shots and Groot shorts — so that one is the twenty-three films from *Iron
Man* to *Far From Home*, listed by id: a closed set that will never go stale.
Film counts were verified against TMDB rather than guessed; bump one when a new
entry comes out.

## Monthly challenges

Three small things to do this month, worth bonus XP, new on the first. Where a
badge is a lifetime claim, a challenge resets — which is what puts an account
with twenty years of imported history on the same line each month as one opened
yesterday.

The pool in [`challenges/catalogue.ts`](src/lib/challenges/catalogue.ts) holds
twenty-two: watch twenty episodes, log something on fifteen different days, six
different genres, three titles not in English, films from three decades, five
episodes of one show in a day, three reviews, something made before 1980, and so
on. Which three run is decided by the month itself rather than stored — every
account on the instance gets the same trio, there is nothing to seed or migrate,
and each month takes the next three in order so **nothing carries over** from the
month before. The pool's length is not a multiple of three, so the trios
themselves keep changing as it wraps.

Progress is measured from one month of plays, that month's ratings, and the
cached TMDB facts — four indexed reads and no network, which is what lets the
bar sit at the top of the dashboard above **Up next**. Each tile carries what
you actually have to do rather than only its name, and the strip folds away —
that choice is stored on the account (`challengesCollapsed`) rather than in the
browser, so someone who does not want it does not have to dismiss it again on
their phone. A finished challenge is
written to `ChallengeRun` and stays finished: the row is what pays the XP, so
deleting a play later in the month cannot take back something already won, and
the reward is stored on the row because retuning a challenge later must not
restate what somebody already earned.

Two notifications come out of this, both derived rather than stored like
everything else in the bell: "August's challenges are up", which is the calendar
itself and so needs no job running at midnight on the first, and one per
challenge completed.

## Levels

Watching earns XP, and the XP earns levels. The whole scale lives in
[`levels.ts`](src/lib/levels.ts):

| Earns XP | Worth |
| --- | --- |
| An episode watched | 12 |
| A film watched | 45 |
| A show watched to the end of a finished run | 300 |
| A franchise with every film seen | 750 |
| A badge earned | 150 / 300 / 750 / 2,000 by tier |
| A monthly challenge completed | 400–700, fixed when it is won |
| A title rated | 8 |
| A review written | 25 on top of the rating |

Three ideas hold it together. **Watching is the floor and finishing is the
reward** — an episode is worth very little on its own, and seeing a show through
is worth twenty-five of them. **The curve steepens**: the XP needed to reach
level *n* is `400 × n^1.7`, so level 1 costs 400, level 10 needs 20,047, level 25
needs about 100,000 and level 50 — the cap — a little under 300,000.

And **everybody starts at level 0.** Nothing that arrived with an imported
history counts towards the level. What the whole history came to is still worked
out and shown after the rank as a small "lifetime 21".

Nothing is subtracted to achieve that — each source is attributed directly,
which is what lets the breakdown on `/achievements` be read as a sum rather than
taken on trust:

| Source | How it is split |
| --- | --- |
| Episodes and films | Every play carries a `source`, so the split is exact |
| Badges | Each carries `carried`, decided as it unlocks |
| Challenges, ratings, reviews | Cannot be imported at all, so all of it was done here |
| Shows finished, franchises completed | Plain numbers with no history behind them, so what they stood at when the line was drawn is remembered and only what has been finished since counts |

A badge is **carried** when an imported history satisfied it rather than
Trekker's own record — either it was already met when the line was drawn, or the
achievement was *added to the catalogue later* and a twenty-year history met it
on sight. That second case is why `levelKnownKeys` exists: without it, writing a
new achievement would hand every existing account XP for watching nothing.
Carried badges are still shown and still count towards the lifetime figure — the
badge is a true statement about what you have watched. They simply pay nothing.

Accounts with nothing imported are exempt from all of it: everything they have,
they did here, and their two levels are the same number.

Imports absorb whatever they cause. Running a Trakt or Plex import marks the
badges it satisfies as carried and puts the completion bonuses back on the
starting line, so a history imported in month six lands as history rather than
as a pile of levels. The Plex *timer* deliberately does not do this — an episode
scrobbled as you watch it is Trekker doing its job.

Every five levels the **rank** changes: Rookie, Novice, Regular, Enthusiast,
Buff, Aficionado, Connoisseur, Cinephile, Master, Grandmaster, and Legendary at
the cap.

Episodes, films, ratings, reviews, challenges and badges are counted live
— they are plain counted columns, cheap enough for the bar to sit on the profile
banner rather than behind a link. Rewatches count: the sums are of `plays`, not
of rows, because the level measures time spent watching rather than how much has
been ticked off. The two completion bonuses are the exception: working out
whether a show is finished or a franchise complete needs TMDB, so those counts
are cached on the account (`levelFinishedShows`, `levelFinishedFranchises`) and
refreshed whenever `/achievements` recomputes the board. While that page still
has titles to look up, the cached counts may only go up — a level that dropped
because a cache was still filling would look like the app taking something back.

Three things are worth celebrating, and they get three sizes. A **badge** drops
a card in over the top of the page. A **level** does the same in a different
colour, with the number where the medal would be. A **rank** — Rookie to Novice,
Buff to Aficionado — happens five times as rarely and is the only thing in the
app that takes the middle of the screen: light turning behind the medal, rings
leaving it, and the old rank crossed out as the new one arrives. All three share
one queue, so an import that lands a dozen badges shows them one at a time with
a count of what is still waiting, rather than stacking them into a wall.

A level rise is measured against what the browser was told last time it looked;
the first sighting of an account only writes the number down, since celebrating
a level someone reached weeks ago the moment they open the app would be a lie.

The announcement is wherever you happen to be — see
[`achievement-toaster.tsx`](src/components/achievement-toaster.tsx). It polls
rather than being handed the news with the page, because the moment a badge is
earned is usually not a moment you did anything here: an episode scrobbled from
Plex runs the unlock check in the background, and there may be no navigation for
hours. The poll only runs while the tab is visible, and which unlocks have been
announced is kept in the browser rather than on the account — seeing the same
badge celebrated on your phone and again on your laptop is fine, whereas a
shared record would mean whichever device polled first swallowed it for the
others.

`/achievements` shows the sum in public: one row per source, how many of each
and what each was worth, so a level is never a number the app just decided on.
The breakdown folds away to just the bar and how much is left to the next level
(`xpPanelCollapsed` on the account, like the challenge strip's).
Those rows are **what was earned here**, not a lifetime tally — they are what
the bar above them is made of, and a breakdown that did not add up to it would
be worse than none. Whatever came in with an imported history is noted
underneath as a single figure instead.

The rows carry no bar of their own, deliberately. A bar promises a target and
none of these have one: there is no number of films you are working towards, so
a half-full track under "Films watched" invented a goal that does not exist.
Drawn as a share of the whole it was worse again — earning anything anywhere
made every other row shrink, so a row went *backwards* on a page about going
forwards. The share is a fact worth stating, so it is stated in words.

## Seasonal dressing

Three months of the year the app puts on a costume, driven by `data-season` on
`<html>` and defined entirely in
[`globals.css`](src/app/globals.css) under the `season-*` rules:

| Month | Season | Primary colour | What is behind the page |
| --- | --- | --- | --- |
| May | Sci-Fi Month | cyan | drifting starfield, two slow nebulae, a horizon grid, a ringed planet in the corner, the odd shooting star, and a saucer crossing every so often |
| October | Horror Month | orange | low fog, closing-in edges, cobwebs in the top corners, a spider on its thread, three bats crossing at different heights |
| December | Holidays | evergreen | snow in two layers under warm light from the top corners |

The season also reshapes `/discover`. A band of five collections goes in at the
top — for October: fresh horror, the scariest ever made, horror series, the
pre-1990 classics and horror comedy — the season's own genre jumps to the front
of the "find your next watch" tiles, and the season's collections lead the
category chips. Each collection is an ordinary category with its own
`/discover/[slug]` page behind it, so "See all" is a real paginated listing and
an old link still works in March. A collection that comes back empty is dropped
rather than left as a bare heading, and none of it is fetched at all in the
other nine months.

Two of the queries need explaining, since the obvious version of each is wrong.
TMDB has no horror genre for television — the whole category sits under Mystery,
which is mostly police procedurals — so horror series are found by keyword.
And TMDB tags any film with a Christmas scene in it, so the christmas keyword
sorted by popularity hands the row to the Harry Potter films; narrowing to
comedy is what turns it back into *Elf* and *Home Alone*, with the sincere ones
next door under "Worth rewatching".

Deliberately narrow. Only the **primary accent** moves: the ink ramp, the page
background and the gold `ember` highlight stay exactly as they are, so the app
still looks like itself wearing a hat rather than like a different app three
months a year.

Everything else is decoration hung behind the page — a child of `<body>` at
`z-index: -1`, above the page background and below everything in the document.
Ambience (starfield, fog, snow) is a tiled or gradient background rather than a
crowd of little elements, so a snowfall is two composited layers instead of a
hundred nodes to lay out on every scroll; motifs (planet, saucer, cobwebs,
spider, bats) are small inline SVGs placed by CSS. Nothing takes pointer events,
both themes are handled, and everything that moves stops for
`prefers-reduced-motion` — the ambience freezes, and anything whose whole point
is the journey is taken off the page rather than left parked in the middle of
it. A badge beside the wordmark says which season it is.

**Temporary:** the **admin account** — the first one created, as with the Plex
and Overseerr settings — has a **Seasonal look** picker in its account menu:
follow the calendar, force one of the three, or turn it off, so all of this can
be looked at in August. Nobody else sees it, the server action refuses anyone
else outright, and the override cookie is only read for the admin, so setting
one by hand does nothing. Everyone else always gets whatever month it is.

It is a cookie rather than a column, precisely so the whole preview can be
deleted without leaving a migration behind: remove
[`season-switcher.tsx`](src/components/season-switcher.tsx),
[`season-actions.ts`](src/lib/season-actions.ts), the `SeasonSwitcher` in
[`user-menu.tsx`](src/components/user-menu.tsx) and the override half of
[`seasons.ts`](src/lib/seasons.ts), then have
[`current-season.ts`](src/lib/current-season.ts) return `seasonForDate()`
unconditionally instead of checking who is asking. The dressing itself carries
on working.

## Screensaver

A full-screen slideshow at `/screensaver`, for the tablet on the shelf, the
television the browser is open on, or a desktop that has been left alone. It is
the one screen in the app that is not a page: no header, no tab bar, no column,
no margin — the window is the artwork and everything else is drawn on top of it,
white on black, in both themes. Film stills are somebody else's cinematography
and nothing else survives being laid over an arbitrary frame of one.

What is on it:

- **A title at a time**, drifting slowly and crossfading, with the film's own
  title treatment where TMDB has one and typeset lettering where it does not,
  plus the year, the genres, the length or the season count, the audience score,
  and the tagline — or the first two lines of the synopsis where there is no
  tagline. Sixteen seconds each. The incoming picture pulls into focus out of a
  blur as it crosses, which is the rack focus a title sequence opens on and the
  single thing that most separates this from a folder of wallpapers on a timer.
  The text leaves a beat before the picture does, so the two crossfades never
  run at once. A single sheet of film grain sits over all of it: two frames from
  two different decades are two different surfaces, and the grain is what makes
  them read as one thing seen through one lens.
- **The time and the date**, in whatever convention the browser's locale uses,
  with a colon that breathes rather than blinks and a minute that rises into
  place when it turns — the clock is on screen for hours and changes twice an
  hour in a way anybody notices, so the one moment it does anything is worth
  building. Drawn only once the browser has it: a clock is the one thing on a
  screen that cannot arrive wrong and correct itself a moment later.
- **The weather**, when a place has been set. Optional and off by default.
- **Whoever is watching something** on the Plex server, with how far through
  they are drawn around their avatar. This is the part a photo frame cannot do.

### The layers

The look is six layers over the artwork, and the order does not commute:

1. **Two bands of masked blur**, top and bottom, on the same reasoning as a title
   page's `.hero-veil` — blurring what is actually behind the words holds up over
   a bright poster and a near-black still alike, where any fixed amount of
   dimming is a compromise struck against one of them. Masked at both ends so
   there is no edge anywhere: the picture simply stops being sharp. This has to
   come first, because a `backdrop-filter` can only sample what is already
   painted beneath it.
2. **Two gradient veils**, which darken the now-soft bands. They are deliberately
   lighter than they would have to be on their own — with the blur carrying
   legibility they only have to hold contrast rather than manufacture it, and
   about a fifth of the film comes back.
3. **A vignette**, closing the corners so a bright edge cannot pull the eye off
   the clock.
4. **The film's own colour**, thrown back into the room. The bottom third of each
   frame is averaged when the run is built — the same `heroColours` sampler the
   title pages use to decide what colour they continue in — and it becomes a wide
   glow rising out of the bottom-left corner with a fainter one falling from the
   opposite one. Screen-blended, so it can only ever add light, which is what
   makes it read as illumination coming off the picture rather than a coloured
   sheet laid over it. The sampled colour is capped for brightness first: a snowy
   establishing shot would otherwise come back near-white and wash the title out.
   It crossfades on the same schedule as the artwork, so the colour of the room
   changes with the film.
5. **Grain**, one static SVG turbulence tile at four percent.
6. **The text**, which is the only thing not blurred, darkened, tinted or
   textured.

Where the pictures come from is a setting: trending this week, popular films,
popular shows, the highest rated ever made, or **your own watchlist** — which
turns the thing into a quiet reminder of what you meant to get to. Twelve titles
a run, rebuilt every half hour so a display that is never switched off is not
still showing Monday's list on Thursday.

It asks for a wake lock while it runs, so the device does not black out the
screensaver, and it takes the whole screen when it is started by hand — a browser
only hands that over in response to a press, which is why **Start it now** is a
button rather than a link.

**Escape closes it**, or a deliberate press on the screen — and nothing else. In
particular not a moving mouse, which is what a desktop screensaver traditionally
watches for and is exactly wrong here: this is a thing you put on a screen *to be
looked at*, often on a machine that is still doing something else, and having it
collapse because the cursor drifted a centimetre makes it useless as either. A
press stays despite the same argument applying to it, because there is no Escape
key on a tablet and that tablet is the device this is for. Input is ignored for
the first 800 ms, so the press that opened it is never the press that closes it.

Waking lands you back on the page you were reading, which is passed in the `from`
parameter and validated as a path on this instance.

### Starting on its own

`screensaverIdle` on the account is minutes of nothing at all before it starts,
and zero — the default — means never. One column rather than a boolean and a
delay beside it: "start it after ten minutes" and "never start it on its own"
are one answer to one question, and two columns would let them disagree.

The watcher lives in the layout, so it is running on every page, and it does
nothing whatsoever until somebody picks a delay. Activity is recorded as a
timestamp and read on a fifteen-second timer rather than resetting a `setTimeout`
on every event — `pointermove` fires a hundred times a second and that is real
work for an answer nobody needed to the second. It does not count idleness while
the tab is hidden or while anything is fullscreen, so a trailer with two minutes
left is never interrupted, and a film that ends at the two-hour mark is not
followed straight into the screensaver from a standing start.

### Weather

[Open-Meteo](https://open-meteo.com), which needs no account, no key and no
attribution — the right shape for a self-hosted app whose owner should not have
to sign up to a third service to see a temperature on a shelf. Nothing about the
user leaves the machine: the request carries a latitude and a longitude and no
identifier of any kind, and it is only ever made for someone who typed a place
into their settings.

The name is geocoded once, when it is saved, and only the coordinates are kept —
so the screensaver never looks anything up while it is running, and a village
Open-Meteo has never heard of fails on the settings page, which is the only place
there is anywhere to say so. Celsius, unless `WATCH_REGION` is one of the handful
of countries that still reports the weather in Fahrenheit; there is no second
setting for it, because it would be a second question with the same answer.

Leave the field empty for no weather at all, which is what everybody gets until
they ask.

## Lists

`/watchlist` is the way into all of them, in four rows:

- **Watchlist** — things you mean to get round to. Unchanged, and still what
  the calendar, the Plex sync, "pick for me" and the achievements read. In full
  at `/watchlist/queue`.
- **Favourites** — whatever you have hearted. The heart sits between the trailer
  and the ⋯ menu on every title page: one press, no list to choose.
- **My lists** — one tile per list you fill yourself.
- **Smart lists** — one tile per standing question. See below.

The first two are rows of *titles*, because each is one list and what you want
is to see what is on it. The last two are rows of *lists* — one tile apiece,
carrying a mosaic of what is on it — because there is no ceiling on how many
somebody makes, and a page that grew a full-width rail per list would stop being
an overview at about the fourth one. Opening a tile is where the titles are.

Lists are made on this page and nowhere else. The **Save** button on a title
page only ever *files* something: making a list is a separate act with a name to
think of, and it belongs where you can see what you already have — offering it
from the corner of a title page is how people end up with four lists that mean
the same thing. With no lists of your own there is nothing to choose between, so
Save does not open a menu at all; it is a plain watchlist toggle, exactly as it
was before any of this existed.

Titles come off a manual list with the **×** on the poster. Smart lists have no
such button on purpose: what is on one is the answer to its filters, so a title
removed by hand would be back at the next rebuild.

### Smart lists

`/watchlist/new` builds one. The preview beside the filters re-runs the *same*
query the saved list will, on every change, and shows the first twenty — a
preview of a different query would be worse than none. It stays on screen at
every width: pinned across the top on a phone, beside the controls on a desktop.

The filters are folded into six sections, each showing what it currently holds
on its own closed header ("Sci-fi, Thriller", "Netflix, MUBI", "70–100% · 1990s").
Laid out flat this is nine controls and sixty-odd chips, which is a wall rather
than a form; folded it is six lines you can read at a glance, and you open only
the one you came to change. Above them sits the list's name and the whole
question read back as one sentence, which is what you check before saving.

Filters: films/shows/both, what kind of thing (**anything**, popular, trending,
top rated, upcoming, newest), genre, streaming service, production status,
classification, and sliders for score, years and length. Two toggles leave out
what you have already seen and what is already on one of your lists.

*Anything* and *Popular* run the same query bar one thing: popularity is a claim
about audience size, so **Popular** carries a vote floor and **Anything** does
not. That is the difference between "what people are watching" and "the whole
catalogue, however obscure".

The **Simple / Advanced** switch changes what the last two questions look like.
Simple asks for a decade and a maximum length as dropdowns; advanced replaces
both with two-handled sliders underneath the score, so all three ranges are
asked the same way.

Nearly all of it is one TMDB discover query per medium. Three things are not:
**Trending** is TMDB's own weekly ranking and takes no filters at all, so genre,
score and years are applied to what comes back and length and services cannot
be; **classification** only exists for films; and a genre TMDB has no television
equivalent for (horror, romance) drops the shows half of the query rather than
returning unrelated shows — the editor says so when it happens.

A saved list keeps sixty titles, cached in `MediaListItem` so opening it is a
database read rather than a fan of TMDB requests. It rebuilds itself once a day:
see [Refreshing smart lists](#refreshing-smart-lists).

### Watchlist enrichment

Watchlist rows carry more than they are given when added: a runtime and the
streaming services currently carrying the title in `WATCH_REGION`. Both come
from TMDB and are cached on the row, topped up 24 at a time per page view, so a
long watchlist fills in over a few visits rather than holding the first one
open. Anything older than a week is looked up again — catalogues move.

That is what powers the sort (recently added, A–Z, best rated, shortest or
longest first) and the **Streaming now** filter. Titles with no known runtime
sort last either way, since a missing figure is not a short film.

### Refreshing smart lists

A smart list older than a day is rebuilt on the way into `/watchlist` and on the
way into its own page, so the feature works with nothing set up — it just means
whoever looks first that day waits for it.

To make that first view fast instead, set `CRON_SECRET` and have something
outside call the job once a day, the same way the notification job is run:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/lists/refresh
```

Lists are rebuilt one at a time rather than all at once: each is already several
TMDB requests deep, and firing thirty in parallel is how you get rate limited
into an empty list.

### Requesting what a list finds

A smart list can ask Overseerr for what it finds, without being told to — the
last section of the list's editor, off by default and opted into per list,
because a standing question that files requests on its own is the one feature
here that spends somebody else's disk. Each run is capped (five by default,
twenty at most, clamped in code as well as in the form), skips anything
Overseerr already knows about, and by default skips anything already streaming
on a service the user pays for — the point is to fill gaps, not to duplicate a
subscription. **Try it now** in the editor runs one pass immediately, because a
setting you cannot try is a setting nobody trusts.

It runs from the nightly `/api/lists/refresh` job and nowhere else — a page
load must never be the thing that files twenty requests — after the rebuild, so
a run asks for what the list says today. The morning after a run files
anything, the bell says so: which list, how many, and the first few titles,
derived from the outcome stamped on the list row like every other notification
here.

## Notifications

Optional. One push a day listing what is airing or releasing today from the
shows you watch and the things on your list — plus a push the moment a friend
request or a recommendation arrives, since either can otherwise sit unseen for
days on an instance nobody opens daily. The social pushes use the same wording
as the bell, so the two read as one event, and failures never surface in the
sender's button.

Generate a VAPID key pair once with `npx web-push generate-vapid-keys`, set
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT`, then
turn it on per device under **Settings → Notifications**. Subscriptions belong
to a browser rather than an account, so your phone can be on while your laptop
is not. iOS only allows this once Trekker is added to the home screen.

Nothing inside the app schedules anything. Set `CRON_SECRET` and have something
outside call the job once a day:

```
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/notifications/run
```

Each user is marked as notified for the day whether or not their browser
accepted the message, so running the job twice will not send anything twice.
Subscriptions the push service has retired (404/410) are deleted on the spot.

## Plex sync

Signing in with Plex captures your personal plex.tv token, and that same token
is what everything else uses — there is no second link step. Linking from
**Settings** while already signed in attaches Plex to the account in session
rather than switching you to whichever profile the Plex account matches.

Three things are pulled across, all one-way, Plex → Trekker:

- **Watchlist.** plex.tv serves the list but not external ids, so ids come from
  a second call per item against the discover service. Anything Plex cannot tie
  to a TMDB id is skipped rather than guessed at.
- **Watch history**, from two sources. The library's own `viewCount` is the
  authority — filtered in code, not in the query: Plex puts the operator in the
  parameter *name* (`viewCount>=1`), which any URL encoder mangles into
  `viewCount%3E=1` and Plex then ignores, returning the whole library as though
  every episode had been watched — marking something watched in Plex without playing it writes *no*
  history row, so history alone silently misses exactly the case people use to
  catch a tracker up. History is still read for its dates and for items since
  removed from the library. Matching runs on the TMDB id the library item is
  tagged with, falling back to a title search.
- Watched state is **per Plex account**, so the server is queried with the
  viewer's own plex.tv token (captured at sign-in) rather than the admin's.
  That is what makes a Plex Home work: each person links their own Plex account
  under Settings and sees their own viewing. Sessions still use the admin token,
  since they have to cover everyone.
- **Now playing**, for you and for any friend with a linked Plex account.
  Sessions are matched to a person by plex.tv account id, falling back to
  username — the server connection is instance-wide, so without that check one
  household member's viewing would appear on another's dashboard.

The watchlist syncs **both ways**: what Plex has is pulled in, and anything here
that Plex has never heard of is pushed across. Pushing needs Plex's own metadata
rating key rather than a TMDB id, so each title is first looked up against
`/library/search` on the discover service — which requires `searchProviders`,
`searchTypes` *and* `query`, and returns a 400 naming the missing one otherwise
— then matched on its guid. Anything that cannot be matched is reported with the
reason rather than silently dropped. Nothing is ever *removed* on either side.

Watch history runs automatically at most once every ten minutes, triggered by
the same poll that drives the now-playing card, and on demand from **Settings**.

### Logging a play the moment it happens

Two mechanisms, either of which is enough:

- **The Plex webhook** (Plex Pass only). Set `PLEX_WEBHOOK_SECRET`, then point
  Plex → Settings → Webhooks at
  `https://your-trekker/api/plex/webhook?key=<secret>`. Plex fires on
  `media.scrobble` and the episode is logged there and then. The secret lives in
  the query string because Plex offers no way to set a header, and the endpoint
  refuses everything until it is set — it writes to people's history on an
  unauthenticated POST otherwise.
- **The now-playing poll**, for everyone else. It already runs every fifteen
  seconds while a Trekker tab is open; when a session passes 90% the episode is
  logged immediately. Both paths land in the same place, and logging the same
  episode twice is a no-op.

### Plex Home

Sessions carry the plex.tv account id and username of whoever is playing, and
Trekker matches them against the profile that signed in with that Plex account.
A **managed profile** — a child account with no plex.tv login of its own —
cannot sign in, so its Plex username is set by hand under **Settings → Your Plex
account**. Both the session matcher and the webhook fall back to that name.

## Subscriptions

**Settings → Your subscriptions** records which streaming services you pay for,
as TMDB provider ids. When a title is already streaming on one of them, pressing
**Request** asks first rather than quietly filing a download for something you
could watch tonight. Nothing selected means no warnings.

**Settings → Your region** sits beside it: which country's catalogue all of
that is answered from. `WATCH_REGION` remains the instance-wide default and the
right answer for a household in one country; the per-account setting exists for
the housemate whose catalogue genuinely is another country's. It reaches
everything availability touches — the streaming strip on title pages, the
watchlist's **Streaming now**, smart lists filtered by service, the quiz's
"on your services", the request warnings, what auto-request treats as already
covered, and even whether the screensaver's thermometer reads °C or °F.

## Giving up on a show

**Stop watching**, in a show's overflow menu, keeps everything you have watched
but takes the show out of Up next and out of the calendar's backlog list. It is
offered on shows only, and disabled where it would mean nothing — a finished
show you have watched to the end. It is reversible from the same menu.

## Data model

`User`, `WatchedEpisode` (one row per episode, unique per user/show/season/
episode), `WatchedMovie`, `WatchlistItem`, `Favourite`, `MediaList` +
`MediaListItem` (the lists a user invents — membership for a manual one, a
cached answer for a smart one), `Rating`, `EpisodeRating`,
`Friendship`, `PushSubscription`, `UnlockedAchievement` (one row per badge
earned, holding only when), `TitleMeta` (a shared TMDB fact cache) — see
[`prisma/schema.prisma`](prisma/schema.prisma). Watch time is summed from the
runtime stored on each watched row, so it stays correct even if TMDB data
changes later. XP has no table of its own — it is recomputed from those same
rows every time it is shown, bar the two cached completion counts on `User`
described under [Levels](#levels).

## Theming

Light mode inverts the `ink` colour ramp in
[`globals.css`](src/app/globals.css) — `ink-950` becomes the lightest surface,
`ink-100` the darkest text — so every existing utility keeps its meaning without
a parallel set of classes. The choice lives in `localStorage` and is applied by
the `data-theme` attribute on `<html>`.

The choice lives on the **account**, not in the browser: `User.theme` holds what
was picked (`dark` / `light` / `system`) and `User.themeResolved` holds what
that currently means. The server renders the resolved value in the first byte it
sends, so there is no inline script, nothing to flash, and no way for a hard
reload to land on the wrong theme. It also follows you between devices.

Only the browser knows what `system` means, so `ThemeSync` in the root layout
reports the resolution back whenever the OS preference has moved since the last
visit — the one case where the first paint can be briefly wrong.

Scrims over artwork (`scrim-b`, `scrim-full` in `globals.css`) stay dark in both
themes on purpose — posters and stills are dark images, so a theme-following
scrim turns into a white glow in light mode. Posters carry no scrim at all; the
score badge is a blurred pill that flips black/white with the theme instead.

Because the theme comes from `data-theme` rather than the OS media query, the
built-in `dark:` variant does not apply. `globals.css` defines `dark:` and
`light:` variants bound to that attribute — use those.

One trap worth knowing: the ink ramp *inverts* between themes, so `text-ink-950`
is near-black in dark mode and near-white in light mode. On a fixed-colour
surface (a white pill, artwork) use literal `text-black` / `text-white`.

## Running it on a phone

Serve a **production build**, not the dev server:

```bash
npm run build
```

```bash
npm start -- -H 0.0.0.0 -p 4310
```

Then open `http://<your-machine>:4310` on the phone and add it to the home
screen. The dev server is a poor host for an installed app: its script URLs
change on every restart, so a home-screen launch can come back to a document
whose JavaScript no longer exists. The page still renders — it is
server-rendered — but nothing interactive works, because nothing hydrated. If
buttons stop responding in the installed app but work in the phone's browser,
that is what has happened: remove it from the home screen and re-add it.

Session cookies are only marked `Secure` when the request actually arrives over
HTTPS, so plain-HTTP LAN hosting keeps working. Put it behind TLS for anything
beyond a home network.

## Mobile notes

- The full-bleed hero artwork is contained by `overflow-x: clip` on `<body>`.
  Two constraints meet here: `hidden` would make the body a scroll container,
  which breaks `position: sticky` hit testing on mobile Safari (the header
  paints but stops taking taps), and clipping on `<main>` instead would clip the
  100vw artwork back into the content column.
- `images.unoptimized` is on. TMDB already serves pre-sized images from a CDN
  and the code picks the size per surface, so the optimizer only added a server
  round trip per image — and a screen mounting twenty posters could exhaust its
  worker pool, leaving one or two rendering as broken images.
- Rails fade out at whichever edge still has content behind it (a CSS mask,
  toggled per side by the `Rail` component) rather than slicing the half-scrolled
  item off against the gutter with a hard vertical line.
- Rails drop scroll snapping and image transitions under `@media (hover: none)`,
  and backdrop blur is switched off inside them: a dozen blurred badge layers
  moving at once is what makes a row stutter on a phone.
- Header controls use 44px hit areas with smaller visuals inside them.

## Signing in with Plex

Every login and signup screen has a **Continue with Plex** button beside the
password form. It runs plex.tv's PIN flow: Trekker asks plex.tv for a PIN, sends
the browser to Plex's own sign-in page, and exchanges the PIN for a token when
Plex sends it back. No Plex password reaches this application, and no Plex
subscription is involved.

The account is matched by plex.tv account id, then by email — so signing in with
Plex on an address that already has a Trekker password links the two rather than
creating a second profile. Accounts created this way have no password of their
own; they authenticate through plex.tv every time.

`PLEX_CLIENT_ID` identifies the install to plex.tv. Leave it unset and it is
derived from `AUTH_SECRET`, which is stable per deployment and unique between
them.

## Importing from Trakt

Trakt is configured **per user**, not per instance — a Trakt account belongs to
a person. **Settings → Trakt** offers two ways in.

**From an export file** (the one to reach for). A Trakt API client id needs a VIP
subscription, but any account can request a data export from Trakt's own
settings. Upload the zip they email you, exactly as it arrives.

The archive's file names have changed over the years and differ between export
types, so [`trakt-export.ts`](src/lib/trakt-export.ts) matches on payload shape
rather than name: it parses every JSON member and recognises watched-movie and
watched-show rows by their fields, falling back to folding the play history into
the same structure where a watched list is missing. Reading the zip is a small
central-directory walk over Node's own `zlib` ([`zip.ts`](src/lib/zip.ts)) rather
than a dependency.

**Over the API** (needs VIP). Save your username and client id; the pair is
verified against Trakt before it is stored. `TRAKT_CLIENT_ID` in `.env` is an
optional instance-wide fallback, so users only need a username — anyone can
still override it with their own.

Either route feeds the same pipeline: episodes are matched to TMDB by the tmdb
id Trakt carries, runtimes come from TMDB, watch dates from Trakt.

The API route reads Trakt's public `watched/movies` and `watched/shows`
endpoints, so that profile has to be **public** — which avoids an OAuth round
trip entirely. Anything already logged is skipped either way, so re-running an
import is safe. Specials (season 0) and titles with no tmdb id are not imported,
and one run is capped at 400 movies and 200 shows.

TV Time has no public API, so there is no equivalent for it. Their GDPR export
is the only route, and it would need a separate CSV importer.

## Admin and server connections

The **first account created owns the instance**. Only that account sees the Plex
and Overseerr sections in Settings, and what it configures applies to everyone —
the credentials live on the admin's row and every profile reads them
([`admin.ts`](src/lib/admin.ts)). Other profiles see a read-only summary of
whether each server is connected.

The admin also gets an **Accounts** tool under the same group: rename another
account, set a new password for somebody locked out — the recovery story for an
instance with no email to send a reset through; it ends every session the
account had — or remove an account for good, confirmed by typing its name. The
admin's own row is deliberately not offered: changing their own password proves
the current one, and closing their own account guards the instance settings,
and this tool must not be the way around either check. Managed Plex Home
profiles cannot be given a password at all, since they are never signed into
directly.

## Overseerr / Jellyseerr

The admin connects an instance under **Settings → Overseerr / Jellyseerr** with
its address and API key (Overseerr → Settings → General → API Key). Title pages
then show the item's status there — Request, Requested, Partly available or
Available — and requesting a series asks for every season. Anything already
filed on the instance reads as "Requested"; how Overseerr is getting on with the
download is its own business.

## Plex

The admin links a Plex Media Server under **Settings → Plex**:
enter the server address (e.g. `http://192.168.1.10:32400`) and an
[X-Plex-Token](https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/).
Trekker verifies the server on save and stores its machine identifier, then
every film and series page shows either **Play on Plex** (deep-linking straight
to the item in the Plex web app) or a quiet "Not on Plex".

Matching is by title plus release year within a year either way, so an odd
naming scheme in your library can produce a miss. Lookups are never cached, time
out after four seconds and fail soft — an unreachable server just means no
badge.

Stored credentials — this token, each person's plex.tv token from the sign-in
flow, and the Overseerr API key — are **encrypted at rest**
([`token-vault.ts`](src/lib/token-vault.ts)), under a key derived from
`AUTH_SECRET`: a copy of the database on its own no longer hands over the keys
to the media server. Two consequences worth knowing. Rotating `AUTH_SECRET`,
which already signs everyone out, now also forgets these connections — they
read as "not connected" rather than erroring, and relinking is the fix. And
rows written before the vault existed are still plaintext until the next time
they are saved; they keep working unchanged in the meantime.

## Notes

- Episode runtime falls back to 42 minutes when TMDB does not report one.
- Marking a film watched removes it from your watchlist.
- "Mark entire show as watched" only logs episodes that have actually aired, so
  a show you are current on does not read as finished.
- Poster badges distinguish four states: a green tick for a watched movie or a
  show you have finished that has stopped airing, an amber play icon when
  released episodes are waiting, and a violet clock when you are caught up on a
  show that is still running.
- Progress is always counted against **released** episodes. TMDB's
  `number_of_episodes` includes episodes that have not aired, which makes a
  viewer who is fully up to date look behind; `countAiredEpisodes` derives the
  real figure from `last_episode_to_air`.
- The header search opens a quick-search dialog (or press `/`) with live
  results; enter opens the top match, or the full results page if there is none.
- Vocabulary is deliberately just "movies" and "shows" throughout the UI.
- Avatars are stored in the database and served by `/api/avatar/[id]` with a
  version stamp in the URL, so they work without writing into the statically
  served `public` folder. Uploads are cropped to a 512×512 square in the browser
  before they are sent (2 MB cap, PNG/JPEG/WebP).
- Ratings are a 1-100 percentage on a slider. The migration that introduced it
  rescales any existing 1-5 star ratings (4 stars becomes 80%).
- Episodes get a thumbs up or down instead, stored in `EpisodeRating`, and only
  on episodes you have watched. Tapping the verdict an episode already carries
  clears it, so one pair of buttons both sets and unsets. The episode list is
  headed by TMDB's average across the season next to your own tally of thumbs —
  "is it any good?" and "did I like it?" are different questions, so they are
  not blended.
- The recap covers the year, or any completed month back to January. The month
  in progress is deliberately excluded: recapping a half-finished month is a
  progress bar. In January there is no completed month, and the picker says so
  rather than offering an empty one.
- A Trakt import overrules existing watch dates. Trakt knows when you actually
  watched something; Trekker's own timestamp only ever records when you ticked
  the box. Re-importing the same export is still a no-op, since a difference
  under a minute is ignored.
- The title-page header row runs from the title to the bottom of the button row
  and is a fixed height on desktop. The poster takes its height from the row and
  its width from the 2:3 ratio, so it is identical on every page and lines up
  with both ends; the buttons sit at the foot of their column via `mt-auto`. The
  synopsis is clamped to four lines with a **Read more** dialog for the rest,
  which is what keeps the row's height honest. It sits centred in whatever space
  is left between the genres and the buttons.
- **Read more** sits at the end of the last visible line rather than under the
  paragraph. `line-clamp` alone cannot do that — it hides the overflow but keeps
  it in the flow — so the text is cut to length instead: an off-screen copy is
  binary-searched for the longest prefix that still fits four lines *with the
  link on the end*, after `document.fonts.ready` and again on resize. The clamp
  stays on as a backstop for the moment before the measurement lands.
- The back button sticks just below the nav rather than scrolling away.
- A friend's profile carries a "You and …" panel: shows and films you have both
  watched, the average gap between your scores, the five titles you disagree
  about most, and what they are into that you have not started. It is all
  database joins — no TMDB call.
- A quiet calendar week lists what you are already behind on rather than just
  saying nothing is on.
- Every profile on the instance can see the others' activity and stats. There is
  no follow model or privacy setting — it assumes a household, not the internet.
- Deploying to a serverless host means swapping SQLite for Postgres: change the
  `datasource` provider and the adapter in `src/lib/db.ts`.
