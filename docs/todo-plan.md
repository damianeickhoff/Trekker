# To-do plan

The three items in `TODO.md`, plus two the rebuild plan left out, turned into
steps an agent can take one at a time. Each step ends the way the build steps
did: tests, a README section, and a list of what the owner tests by hand. The
rules from `STYLE.md` and the rebuild plan hold throughout: nothing new on the
request path reaches the network, external calls fail soft and go through
`mapLimit`, one accent, heroes dark, and no migration of
`data/trekker-migrated.db` without a dated backup beside it.

Suggested order: T1 first (smallest, no external source, finishes the
Appearance section), then T2 (mostly data the refresh job already has), then
the T3 spike, which decides whether T3 happens at all. T4 and T5 are optional
and independent.

## T1. Background variants

A choice of what sits behind every page. Four options, in Settings,
Appearance, as a row of four small previews under Theme:

| Option | What it is |
|---|---|
| Plain | The page colour, as now. Default. |
| Gradient | A quiet two-stop gradient of the page colour and a slightly lifted tone, fixed to the viewport. |
| Artwork | A blurred poster from the user's own history, changing once a day. |
| Colour | A hue the user picks from eight swatches, mixed into the page colour at low strength. |

**Constraints that shape it**

- The shell paints before any data, so the choice must be known at paint
  time. Store it on `User` (`background`, `backgroundHue`) and mirror it in a
  cookie beside `trekker_theme`, set by the same server action; the boot
  script reads the cookie and puts `data-background` on `<html>` before
  first paint, the way it does the theme.
- Artwork must cost one small download and no layout: TMDB's w92 poster,
  blurred and saturated the way `CardBackdrop` on Home does it, in a fixed
  layer behind the page at low opacity (dark) or lower still (light). The
  poster is chosen server-side from the last year's plays, seeded by the
  day, and cached in the shell's data so it does not change on navigation.
- Text contrast: every variant is tinted from the page colour, never a
  second surface, so `ink` stays readable and cards still separate by fill.
  Check both themes with the review harness at phone and desktop widths.
- Heroes stay dark and opaque over whatever the background is.

**Steps**

1. Schema: two nullable columns on `User`; migration with a backup; defaults
   mean "plain".
2. `lib/background.ts`: the variant type, the cookie name, the daily poster
   pick (one query over `Play`, no TMDB).
3. `globals.css`: `[data-background]` rules for gradient and colour (colour
   uses `color-mix` with a `--bg-hue` custom property); an artwork layer
   component in the app layout, rendered only when the variant is artwork.
4. Settings, Appearance: the four previews, saving through a server action
   that writes the row and the cookie; the summary line reads "Dark ·
   artwork background".
5. Tests: the pick is stable within a day and changes across days; the
   cookie parser refuses junk; the boot script sets the attribute.
6. Measure Home cold and warm with `measure.js` before and after; artwork
   may add one w92 request and nothing else.

## T2. News

News about what the user follows, from changes the refresh job already sees,
with no external feed in the first version.

**What counts as news (v1)**

- A followed show is renewed, cancelled, or ends; its status changes in
  `TmdbCache` between refreshes.
- A followed show gets a next-episode date, or the date moves.
- A new season is announced (season count rises).
- A followed person has a new credit (already recorded as `PersonNews`).
- A watchlisted film's release date changes, or it gets a trailer (TMDB
  videos endpoint, checked on the six-hourly returning pass for watchlisted
  and followed titles only, one call per title, gated).

**Shape**

1. Generalise `PersonNews` into `NewsItem`: subject (`person`, `tv`,
   `movie`), subject id, kind, a short `headline` and `detail`, `at`, and a
   unique key so each change is news once. Keep `PersonNews` rows by
   migrating them in (backup first).
2. The returning pass records news as it diffs: it already holds the old
   and new cache rows, so this is a comparison at the point of write, not a
   second pass. Fan-out and gates as now.
3. A `/news` page: one list, newest first, grouped by day, each row with
   the poster or headshot, the headline ("Silo renewed for season 4"), and
   the title's link. Phone: reached from a "News" rail on Home that shows the
   latest three when there are any; desktop: an entry in the sidebar under
   Calendar. Read state per item, the way the bell keeps it, so the sidebar
   entry and the rail can show a count.
4. The bell: news items join the notifications list as their own kind, so
   Mark all read and Clear cover them. Push, optional: a fourth switch in
   Settings, Notifications, "News about what you follow", off by default.
5. Tests for the diff (each kind fires once, a status flapping back does not
   fire twice, a person credit still records), and for read state.

**Later, if wanted:** an external feed per show (a search-engine news RSS
or a curated source) behind a per-instance setting, because it is a network
source with its own failure modes and copyright of headlines to think about.

## T3. Pathé

Pathé has no public API, so this starts with a spike that decides the rest.

**Spike (time-boxed to a day)**

- Read pathe.nl in the browser with the network panel open: which JSON
  endpoints serve cinemas, films now showing, and showtimes per cinema per
  day; whether they need a key, a cookie or a user agent; how films are
  identified (a Pathé slug, no TMDB id, so matching is by title and year).
- Write the findings to `docs/pathe-spike.md` with sample responses, and a
  go or no-go. No code in the app yet.

**If go**

1. `lib/pathe.ts`: a client for the two or three endpoints, cached per day
   in a `PatheCache` table, one request per cinema per day, gated and
   failing soft; title matching to TMDB by normalised title and year, with
   the unmatched named in the job log rather than dropped.
2. Settings, Subscriptions and region: "Your cinema", a picker of Pathé
   cinemas (fetched once a week), stored on `User`.
3. Discover: the existing In cinemas rail gains a "near you" variant when a
   cinema is set: the films showing there this week, in the poster system's
   wide card, with the next showtime as the chip.
4. Film title page: a Showtimes panel in the right column (desktop) or after
   the availability panel (phone): today's and tomorrow's times at the
   chosen cinema, each a link to Pathé's own booking page. Nothing is booked
   from Trekker.
5. Tests with recorded responses; nothing in tests reaches pathe.nl.

**If no-go:** fall back to what TMDB gives: the In cinemas rail as it is,
plus a link to Pathé's search for the film.

## T4. Two-way Plex watchlist sync (optional)

The rebuild reads Plex's watchlist; it does not write to it. Adding a title
to a Trekker watchlist could add it to Plex's, and removing it remove it,
through plex.tv's watchlist endpoints with the person's own token. One
setting to turn it on, per person; a conflict rule (Trekker wins on the
change the user just made; Plex wins on the daily read for anything changed
elsewhere); a test suite against recorded responses. Worth doing only if
the owner uses Plex's own watchlist day to day.

## T5. Per-season requests (optional)

Overseerr can request one season rather than a whole series. The request
button on a series page would offer "This season" beside "Everything" when
the show has more than one season and the availability rows show a gap.
Small change in `lib/request.ts` and the request sheet; a test that the
Overseerr payload names the season.
