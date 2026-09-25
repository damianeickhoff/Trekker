# Motion plan

The rebuild moves very little on purpose: content shows on the frame it
arrives, and the three pieces of motion are all feedback (`STYLE.md`,
Motion). That discipline is why Home paints in 48 ms warm, and none of it is
given up here. What is added is the layer above it: the small, quick
responses that make an app feel made rather than assembled. Everything below
follows five rules, which go into `STYLE.md` when the first step lands.

1. **Transform and opacity only.** Nothing animates a size, a margin or a
   colour that causes layout. Height changes use `grid-template-rows` or a
   measured `transform`.
2. **One easing family, one scale of durations**, as custom properties in
   `globals.css`: `--ease-out` (0.2, 0.8, 0.2, 1) for things arriving,
   `--ease-in` for things leaving, `--ease-spring` (0.2, 0.9, 0.3, 1.2) for
   the one bounce we allow (the tick). Durations `--fast` 150 ms (press,
   hover), `--base` 250 ms (menus, sheets, pills), `--slow` 400 ms (page and
   hero). Anything longer is a recap or a screensaver and lives in its own
   stylesheet.
3. **Reduced motion is a cut**, everywhere, through the one media rule that
   already exists. New keyframes go inside `@media (prefers-reduced-motion:
   no-preference)` rather than being undone afterwards.
4. **Nothing delays first paint.** No entrance animation on the shell, the
   tab bar, the sidebar or the first Home card. Entrances are for things
   that arrive after the page: a sheet, a menu, the next episode, a toast.
5. **Measured after every step** with `measure.js` in the review harness:
   warm Home paint and the cold Home bytes may not move by more than 5%.

Suggested order: M1 then M2 and M3 (the biggest felt difference for the least
code), M4, M5, M6, then the optional M7 to M9.

## M1. Foundation

- The tokens above in `globals.css`, and the tab bar's existing 250 ms pill
  transition moved onto them.
- A `Presence` helper (`components/presence.tsx`): keeps a child mounted for
  its exit transition, sets `data-state="open" | "closed"`, and lets CSS do
  the rest. One small hook, no library.
- `STYLE.md` Motion rewritten to the five rules and the catalogue below.

## M2. Press and hover

Every button, chip, poster and row answers the finger or the pointer.

- Buttons and chips: `active:scale-[0.97]` over `--fast`; ghost buttons
  lift their fill one step on hover on pointer devices only (`@media
  (hover: hover)`).
- Poster cards on desktop: lift 2 px and deepen the shadow on hover; the
  title under it does not move.
- Rows (Also waiting, lists, notifications): a fill wash on hover, no
  movement.
- Segmented controls (Theme, Screensaver, the review's Year/Month, Discover's
  Everything/Shows/Films): the selected pill slides between options rather
  than jumping, the way the tab bar's does; one absolutely positioned pill
  per control, moved by `transform`.
- Toggles: the knob already transitions; give it `--ease-out` and the amber
  fill a 150 ms fade so on and off read as one motion.

## M3. Sheets, menus and dialogs

The largest gap today: they appear and vanish in a frame.

- Phone sheets (rate, request, Plex, Overseerr, Trakt, the smart-list
  editor's folds): slide up from the bottom over `--base`, the scrim fading
  in alongside; on close the reverse; a drag-down of more than 80 px on the
  sheet's grab bar closes it.
- Desktop dialogs: scale from 0.96 and fade in, `--base`; the scrim the same.
- Popovers (the bell, the avatar menu, the when-menu, the date menu, the
  more-menu): scale from 0.94 from their anchor corner over `--fast`, fade
  out on close. `transform-origin` set per anchor.
- Toasts (badge unlock, "Saved", errors): slide in from the top edge on
  phones and the bottom right on desktop, and leave the same way; the medal
  on the unlock toast keeps its existing pop.

## M4. Rails and lists

- Rails on phones use `scroll-snap-type: x proximity` with cards snapping
  to the left gutter, so a flick lands on a card; the chevron arrow on a
  section head nudges 2 px right on hover.
- When a row leaves a list because of what the user did (Also waiting after
  Mark watched, a list item removed, a notification cleared), it collapses:
  fade over `--fast`, then its grid row shrinks to zero over `--base`, so
  the rows below slide up rather than jump.
- Reorder in list editing: the dragged card lifts (scale 1.03, shadow) and
  the others make room with a `transform`.

## M5. Home and the tick

- Up next after Mark watched: the tick flash stays; then the card's text
  block fades out and the next episode's fades in with a 6 px rise over
  `--base`, the poster crossfading if the show changes (an `episode-in` the
  old app also had).
- Progress bars (Up next's, the challenge strip's, the level bar): the fill
  moves to its new value over `--slow` with `--ease-out`, and only when the
  value changes after mount, so first paint is static.
- The challenge strip's "2 of 3 open" count and XP figures use the review's
  `Count` when they change, not on load.

## M6. Title, episode and film pages

- Hero backdrop: one slow settle on arrival, scale 1.04 to 1 over 1.2 s
  with `--ease-out`, run once per navigation and only after the image has
  loaded, held at the opening frame until then (the old app's `hero-zoom`);
  the lettering does not move. Reduced motion: none.
- Season chips: switching seasons crossfades the episode list over
  `--base`, with the incoming list rising 6 px; the height change uses
  `grid-template-rows` so the page does not jump.
- Mark all up to here: the ticks cascade down the rows at 30 ms apart, each
  a small `tick-flash`, capped at ten so a long season does not take
  seconds.
- Episode navigator (prev and next): the card content slides 12 px in the
  direction of travel.

## M7. Route transitions (optional, behind a flag)

React 19.2's `<ViewTransition>` with Next's `experimental.viewTransition`
gives a page crossfade and a shared-element move from a poster to a title
hero for free where the browser supports it, and nothing where it does not.
Try it on one path first: a poster card to `/title/...`, the poster morphing
into the hero's poster on desktop and into the lettering's backdrop on
phones. Keep it if it stays under `--slow` and the paint measurements hold;
drop it if it fights the service worker's shell-first paint.

## M8. Profile charts and figures (optional)

- The area chart, week bars and genre balance draw in the first time they
  scroll into view, once per visit: a `stroke-dashoffset` sweep for the
  line, bars growing from the baseline over `--slow` with a 30 ms stagger,
  like the old app's `chart-draw`. The review's `Reveal` observer is reused.
- The headline figures (hours, episodes, films) count up with `Count` on
  first view.

## M9. Seasonal dressing (optional)

The old app dressed itself three times a year (sci-fi, horror, holiday):
an accent tint and a light particle layer. If wanted in the rebuild it
would be one `data-season` attribute set from the date, a single canvas or
CSS layer under the page with at most a few dozen particles at 30 fps,
paused when the tab is hidden and with reduced motion, and off by a switch
in Appearance. It is the one item here that costs a running animation, so
it stays last and stays optional.

## What is not planned

- Skeleton pulses or sheens: a skeleton is a frame, and a fast load must
  never flash one.
- Parallax on scroll: it costs a scroll listener and fights the blur on
  heroes.
- Animated page loads on the shell: the shell paints first, still.
