# Trekker style

The design rules in one place, written from what the code does. Where a rule
and the code disagree, the code is wrong or this file is out of date; fix one
of them in the same change.

## Language and code

- **British English** in code and copy alike: favourites, colour, catalogue,
  normalise.
- **Comments explain constraints and reasoning**, not mechanics.
- **Import `Link` from `@/components/link`**, never `next/link`. It turns
  prefetch off by default, because every route reads cookies and a prefetch is
  a real server render; `eslint.config.mjs` fails the build on the other
  import.

## Tokens

- **Colours are tokens** on `:root` and `[data-theme]` in
  `src/app/globals.css`, exposed to Tailwind through `@theme inline`: `bg`,
  `surface`, `surface-2`, `ink`, `ink-2`, `ink-3`, `ink-soft`, `line`,
  `accent`, `accent-text`, `primary`, `on-primary`, and `popover` (a panel over
  the page rather than in it: the bell's). Use the utilities
  (`bg-surface`, `text-ink-2`), not hex values.
- **Fixed colours** do not flip: `night` (#0b0c10, heroes, banners, the level
  card and the unlock toast), `pill` (the tab bar and episode navigator), and
  the badge metals `bronze`, `silver`, `gold` and `platinum` (the legend tier),
  because a medal is the same metal in either theme.
- **Elevation** is `shadow-elevation`: none in dark, where panels separate by
  fill alone, and a soft two-layer shadow in light.
- **Layout numbers** that several components share are custom properties in
  `globals.css`: `--tab-bar-clearance` (what the phone tab bar covers),
  `--title-aside` (the desktop title page's right column), and
  `--poster-desk` and `--tile-gap` (the one desktop poster width that follows
  from it, used by More like this, cast tiles and filmographies),
  `--content-cap` (the desktop column's 80rem cap, gutters included; from
  the `wide` breakpoint, 1880px, the content is the window less
  `--content-edge`, 340px, either side), `--column-w` (the column that
  width gives, centred in what the sidebar leaves at every width, so the gap
  after the sidebar equals the gap at the right), and the poster system's
  sizes (`--poster-card`, `--wide-card`, `--chart-card`, `--card-gap`; see
  Posters).

## Type

- **Three faces**, loaded by `next/font/google` in `src/app/layout.tsx` and
  served from this origin: Bricolage Grotesque (`font-display`) for titles,
  headings, scores and the wordmark; Instrument Sans (`font-sans`, the body
  default) for everything read; Geist Mono (`font-mono`) for codes, counts,
  dates and chips. Only the first two are preloaded.
- **Page titles** are `PageTitle` (`ui.tsx`): display, 30px bold on desktop;
  pages below a tab use 26px extrabold on phones (`BackHeader` in `page.tsx`).
- **Section titles** are `SectionTitle` (`ui.tsx`): display, 20px, 22px from
  `lg`.
- **The mono label** (`mono-label` utility in `globals.css`) is 11px uppercase
  Geist Mono in `ink-3`: the quiet line under a title, the count beside a
  section head, field labels. Amber (`text-accent-text`) only when it states a
  live figure, such as a slider's range or the editor's match count.

## Theme

- **`data-theme` on `<html>`** decides the theme, set by the server from the
  `trekker_theme` cookie (`lib/theme.ts`, default dark) and corrected before
  paint by `BOOT_SCRIPT` (`lib/boot-script.ts`), which also resolves "system".
- **Use the `dark:` and `light:` variants** defined in `globals.css`, never
  Tailwind's built-in `dark:`, which follows the OS. Most components need
  neither, because the tokens already flip.
- **Dark is primary**: `:root` carries the dark tokens, so markup with no
  attribute still reads correctly.
- **Backgrounds** (`lib/background.ts`, Settings → Appearance): plain (the
  page colour, the default), gradient, artwork or colour, as
  `data-background` on `<html>`, from the `trekker_background` cookie the
  root layout and the boot script read, mirrored on `User`. Every variant is
  made from the page colour: colour mixes a swatch's hue into `--bg` itself,
  so every scrim that fades into the page fades into the tint; gradient and
  artwork are one fixed `html::before` layer under the page (artwork is
  today's w92 poster from the person's year, blurred, 30% in dark and 16% in
  light), and over those two a hero's last 60px and a band's ends fade out
  (`hero-foot`, `band-ends`) so the layer runs on. Heroes stay dark and
  opaque; a flat `bg-bg` patch is only for small labels over a hero's fade.
  The eight swatches keep clear of the amber.

## Heroes

- **Heroes are dark in both themes.** `HeroArt` (`title/hero.tsx`) draws
  TMDB's smallest backdrop, blurred and saturated, over `night`; `heroScrim()`
  darkens it and, over its last `HERO_FADE` (120px), turns it into the page
  colour. The list page's mosaic banner uses the same scrim. On desktop the
  art reaches past the content cap to the column's edges (`bleed`), while
  what stands on it stays inside the cap. Title and episode pages draw the
  w1280 backdrop sharp instead (`BackdropArt`), under the same scrim; on
  phones the series and film hero has no poster, the lettering standing
  large on the backdrop.
- **Bands** (Discover's On the horizon and hall of fame, `BandArt` in
  `discover/parts.tsx`) are heroes set into the middle of a page: a w1280
  backdrop blurred to a wash (40px, saturated) under `bandScrim()`, the hero's scrim with its
  fade at both ends, white type, and the same bleed.
- **Discover's top five** (Round 9) is the desktop's hero, dark in both
  themes like the others: 480px tall, #1 to #3 turning in one big card on
  the left (the w1280 backdrop sharp under a scrim darkening to the foot,
  the words at the foot, three dots bottom-right), #4 and #5 stacked on the
  right at 236px each; the rest of the top 20 starts at #6. On phones the
  same carousel stands on the hero's blurred #1, the column's width and
  300px tall, and the rest of the top 20 starts at #4.
- **Text on a hero is white** (`text-white`, `text-white/78` for secondary),
  whatever the theme, and hero buttons are white or glass.
- **Under a title** on a series or film page (`TitleFacts` in
  `title/hero.tsx`, the words from `lib/meta-line.ts`): the tagline in
  italics where there is one, then the old app's facts between middle dots:
  year, up to three genres, "N seasons" (a film's "109 min"), "N votes" with
  a thousands separator, and the status ("Returning series", "Ended",
  "Cancelled", "Released", "In production"). The facts are `ink-2`, 14px on
  desktop and 13px on phones, and always the dark ramp's `ink-2`
  (`data-theme="dark"` on the block), because the hero is dark in both
  themes. All from the cached details.
- **The desktop title page's hero row** holds only the poster and the
  details, so the backdrop shows whole. From `xl` the right-hand column
  (availability, progress, how it felt, comments, more like this;
  `TITLE_ASIDE` in `title/styles.ts`) starts in the next row, level with
  the season chips (a film's cast), on the page's own colours rather than the
  artwork's white, and runs to a closing `1fr` row so a long column never
  opens a gap between the episodes and the cast.
- **TMDB's lettering** replaces the typed title where there is one
  (`TitleLogo`), capped at 260px on phones and 420px on desktop, and 320px
  on a phone's backdrop hero, where no poster stands over it.

## The accent

- **One accent, amber** (`--accent`, #f2b233). In light it becomes
  `--accent-text` (#9a6400) wherever it is text, because amber on paper fails
  contrast.
- **Amber marks state and where you are**: up next, today, earned, in
  cinemas, a requested title's clock, the Next episode, how far through
  something is (progress bars, slider ranges, switches that are on), the active
  tab (the tab bar pill, the sidebar's dot, the lit dot under Discover's
  spotlight), a favourite's heart, a title just
  added, and the sparkle (smart lists, and Discover's Pick for me, which is a
  plain ghost button with only its sparkle amber). In What to watch the
  chosen answer is ringed and ticked in amber, and the progress line is amber. `StateChip` in `ui.tsx` carries the rule:
  nothing decorative is amber. The wordmark's mark is the one piece of identity
  in it.
- **The mark** (`lib/logo.ts`, `TrekkerMark`) is the old app's silhouette,
  kept as geometry: amber beside the lettering in `Wordmark`, standing on the
  baseline at the lettering's cap height; black on the collapsed sidebar's
  amber disc; and black on an amber tile in the app icons (`app/icons/[size]`),
  full-bleed at home-screen sizes and a rounded tile for the favicon.

## Buttons

- **Five kinds** (`ButtonKind` in `ui.tsx`, `buttonClass` and
  `iconButtonClass`): `primary` (ink on page, inverting per theme), `white`
  (the primary on a hero), `amber` (a button in its done state, such as a
  title just added from a list's search), `glass` (secondary on a hero only),
  `ghost` (the secondary everywhere else, a plain surface). Title pages spell
  out their 46px variants in `title/styles.ts`.
- **All buttons are pills**; icon buttons are round, 40px (`sm`) or 44px.
- **Order**: the main action first and widest (Mark watched fills the row on
  phones), then secondary text buttons (Trailer, Play on Plex, Discard), then
  the icon buttons (favourite, save, more), with the More menu last. See the
  action rows in `title/film-page.tsx` and `title/series-page.tsx`.

## Badges

- **Every badge has its own icon** (`icon` on each catalogue entry and named
  franchise, the old app's choice drawn from the rebuild's stroke set in
  `icon.tsx`). The medal draws it earned or not: the metal says earned, the
  plain surface says not yet, and the icon says what it is for. The same icon
  is on the rows (Closest to earning's among them), in the profile's trophy cabinet, on the admin's
  take-back rows and on the unlock toast. The trophy is only the fallback for
  a toast cached before icons existed.
- **A badge is a row** (`BadgeRow` in `badges/row.tsx`), as the old app laid
  it out, on the board and in Closest to earning alike: left, the medal in
  its progress ring (`MedalRing`: amber on the surface's track, gone once
  earned, since the metal says it); right, the name, the description in full
  (no tooltip: a phone cannot hover), and a mono line, "Earned 5 Aug" (the
  year only when it is not this one) or how far in the badge's own terms and
  the percentage, "3 of 10 · 30%". No bar: the ring is the progress. One
  column on phones, two from `sm`, three from `2xl`. The row opens the
  badge's detail (tier, group, what it is worth), a sheet on phones.
- **Legendary badges** are the one gradient on a badge: gold into amber
  (`--color-gold` to `--accent`), as a ring round an earned medal (`Medal`'s
  `flourish`) and a hairline edge on the row, at 45% while unearned. It is
  drawn by a masked `before:` overlay, because the translucent dark surface
  would show a padding-box gradient through the whole tile. It lives in
  `components/badges` alone, on the Badges page only, so it reads as rare.
  This is an exception to "nothing decorative is amber", kept to that tier.

## Chips

- **Four label chips** in `ui.tsx`, all mono uppercase on a 6px radius:
  `StateChip` (amber, state), `PlexChip` (white with the play mark, only ever
  Plex), `QuietChip` (outlined facts: network, runtime, schedule; translucent
  on a hero), `ArtChip` (black 55% on artwork, such as a score; no blur).
- **Filter chips** are pills from `filterChipClass`: `primary` when chosen,
  `ghost` otherwise. They carry sorts, filters and seasons, and change the
  address with `replace` so they do not pile up in history (`SortChips`).
- **News's kind chips** (Round 10): a `StateChip` (amber) on your own news
  wherever it shows, since it is about what you follow, and on artwork (the
  lead story, a big card's picture, Home's News cards); a `QuietChip` on a
  headline's small card, where the kind is a fact about someone else's story.

## Posters and people

- **Posters** are `Poster` (`poster.tsx`) at the size drawn, 10px radius and
  `shadow-elevation` on rails and grids. Under a pointer the picture zooms to 1.04 inside its rounded
  frame and the frame's shadow deepens (`ZOOM`, `ZOOM_SHADOW` in `motion.ts`);
  the chips on it and the caption under it stay where they are. Anything that
  draws artwork in a card takes the same three classes.
- **The poster system** (`poster-card.tsx`, sizes in `globals.css`): every
  poster rail on Home, Discover and Lists, and the watchlist, favourites and
  list grids, draw one of two cards at the old app's sizes, which are fixed
  (a wider window shows more cards, not larger ones), 9px apart
  (`Rail cards`):
  - the **standard poster card** (`PosterCard`): 182×274 on desktop, 150×226
    on phones; under the poster the title (13px semibold, one line,
    ellipsis) and "Show · 2026" or "Film · 2026" (12px, `ink-3`), the year
    left off where it is not known. In a grid it takes the cell's width at
    the same shape, the columns as many as fit at 182px (150px);
  - the **wide card** (`WideCard`): 318×178 on desktop, 260×145 on phones,
    for what is happening rather than what could be watched (Landing soon,
    Friends watched, In cinemas): TMDB's w780 backdrop (an episode's still
    for a friend's episode), chips top-left, the score top-right, the title
    and one line at the foot on a scrim, the mark bottom-right.
  Discover's rest of the top 20 is the one other size, 166×250 (138×208 on
  phones) with its big faint number in a 48px gutter to the left.
- **On a poster** (`PosterFurniture`): the score top-right as a small
  `ArtChip`, the watched tick (`TickMark onArt`) in its place once the title
  is watched, the mark bottom-right (`StatusMark` in `artwork.tsx`, from
  `lib/marks.ts`: the white play mark for on Plex, the amber clock for
  requested, nothing otherwise; 22px on dark glass without blur, because rails
  scroll), bottom-left your own bucket where a page shows it (`corner`: Your
  review's films), and top-left a short fact on the same dark chip: On this day's
  year, or Recently watched's day ("Yesterday", a weekday within six days,
  then "1 Mar 26", `watchedWhen` in `lib/dates.ts`). Every artwork card that
  carries a score keeps the rule: Discover's top five (the place
  top-left, the score top-right, the mark bottom-right; on the desktop's
  carousel the mark stands just above the three dots, which take the corner)
  and In cinemas' wide card. Posters outside the system (the title page, the calendar, the smart
  list editor's preview) keep the mark bottom-left until they are brought in.
- **No artwork** draws `PosterPlaceholder`: the surface with the title typed at
  its foot, bottom-left and never centred, in display type that scales with the
  tile (`poster-placeholder` in `globals.css`). A wide card with neither a
  backdrop nor a poster, which types its title anyway, stays plain.
  A news card with no picture (Round 10) draws `NoPicture`
  (`news/no-picture.tsx`) instead: the second surface, the mark faint in the
  middle and the source's name small in a corner, never the headline again.
- **People are 4:5 tiles** everywhere (`PersonPhoto`, `PersonTile` in
  `title/people.tsx`): TMDB's `w185` photo, or white initials on a tint of
  their own, chosen from the TMDB id so it never changes.

## Popcorn

- **Ratings are five buckets**, 1 to 5: spilled, empty, half full, full,
  golden (`components/popcorn.tsx`). Inline SVG on the icon grid in
  `currentColor`; golden alone is filled amber with black lines in both themes,
  because the top of the scale should look like a prize.
- **Choosing the same bucket again clears** the rating. A rating shown rather
  than asked is one bucket and its name (`PopcornShown`).

## Chrome

- **Phones** (below 64rem, `lg`): the floating tab bar (`tab-bar.tsx`), a dark
  pill in both themes resting on the larger of an 18px float and the
  home-indicator inset; the active tab carries its label and a larger share of
  the width. Content clears it with `--tab-bar-clearance`. Tab pages have a
  60px top row (`MobileTop` in `page.tsx`): the title or the wordmark (28px,
  the mark at cap height) left; right, search, the bell and the avatar, each
  a 40px box on one centre line (`PhoneAccount`: the bell with its unread dot
  opens `/notifications`, as the profile hero's does). A page with controls
  of its own (Calendar's weeks, Lists' New) puts them before the bell. On a
  hero the buttons are glass.
- **The avatar menu** (`avatar-menu.tsx`) is the chrome's one way to Profile,
  Settings, the screensaver, the theme and Sign out: the phone's avatar
  top-right and the sidebar's profile card open it (the whole card, so its name
  and level line are never squeezed by icons beside them; on the rail, the
  avatar). A `popover` panel with the bell's shadow, 256px wide, 44px rows, the
  theme as the segmented control Settings uses. Switch person shows only for an
  account that came in through a Plex Home. The panel is portalled to the body
  and placed from its button, so nothing on the page can paint over it.
- **Desktop** (from 64rem): the 224px sidebar (`sidebar.tsx`), collapsible to
  a 76px icon rail whose state is `data-sidebar` on `<html>`, set before paint
  from localStorage. Tab pages put `DesktopHeader` at the top of the content
  column; `PageBody` gives the column its padding (20px phones, 40px desktop).
  The sidebar carries one entry beyond the five tabs, News under Calendar
  (`SIDEBAR_NEWS` in `nav.ts`), with an amber count of unread news from the
  bell's answer (a dot on the rail); a phone reaches News from Home.
- **Who is signed in** (the avatar, the sidebar's name and level line) and the
  bell come from one answer the browser fetches after paint
  (`bell/bell-provider.tsx`), never from a layout: `MeAvatar` is the placeholder
  until it lands. The bell is in the sidebar on desktop, a popover over the
  page beside it; on phones it is in every tab page's top row and on the
  profile hero, and opens `/notifications`. An unread notification's circle is amber, a read one plain.
- **The unlock toast** is the one thing that appears over any page unasked:
  night with an amber glow behind the medal, top of the screen on phones and
  bottom-right on desktop, for eight seconds. It slides in from the edge it
  stands at and leaves the same way (`motion-toast`).

## Stacking

- **One scale**, custom properties in `globals.css`, used as `z-(--z-popover)`
  and never as a bare number: `lift` (1, content on its own card's or hero's
  art), `card` (10, a card lifted so its menu opens over the sections after it:
  Up next), `top-row` (20, a page's top row, a hero's top row and sticky bars),
  `popover` (30, menus anchored to a control, the sidebar, the avatar menu),
  `tab-bar` (40, the tab bar, the episode navigator, a fixed action bar at the
  foot), `sheet` (50, dialogs, the when-menu, the bell's panel), `toast` (60,
  the unlock toast and the Updating line). The screensaver is 100, a screen of
  its own.
- **A layer is only as high as its highest ancestor.** A menu at 30 inside a
  card at 10 paints under a later card at 10. So whatever opens over the page
  sits at page level (the when-menu) or is portalled to the body (the avatar
  menu, every `Dialog`), and anything in the flow that must carry a menu over
  what follows takes a step of its own on the scale.

## Back navigation

- **The rule**: on phones (below 64rem) a round icon button top-left, ghost on
  the page or glass on a hero; on desktop a text link with a chevron and the
  destination's name ("‹ Lists", "‹ Home", "‹ Lanterns"), 13px semibold in
  `ink-2` (white on a hero), above the page title. `Back` in
  `components/back-button.tsx` renders both and hides one, so every page gets
  the rule by using it.
- **Where it goes**: a page with one way in links to its parent (Waiting to
  Home, the watchlist, favourites and a list to Lists, the editor to its list
  or to Lists, Friends, Edit profile, Settings and Your review to Profile). A page with several ways
  in (Cast, More like this, Comments, a person, somebody else's profile,
  Notifications) goes back through history, naming the title it belongs to;
  a person, a profile and the notifications have too many ways in to name one,
  so the link says "‹ Back". Search keeps its Cancel beside the box on phones.
- **Layout**: `BackHeader` (`page.tsx`) puts the way back alone on the top row
  and the title under it; its bones match (`BackHeaderBones`). The episode page
  and the list page draw the desktop link on their heroes themselves, in white.
- **Title pages** (series, film) carry a glass back button on the phone
  hero's top row and, from `lg`, the desktop text link "‹ Back" in white
  (`Back` with `desktopOnly`, going back through history, since a title has
  too many ways in to name one), in the hero's top edge above the poster, so
  nothing under it moves.

## Section heads

- **`SectionHead`** (`section-head.tsx`): the section title, a mono label
  beside it for a count or span ("next 3 weeks", "12 shows"), and a chevron to
  the full list at the right edge. Nowhere to go, no chevron.
- **"Show all N"** may stand beside the chevron on desktop where the full
  list is long (Also waiting); it says the same thing. The title pages' cast
  head is the plain one at both widths: "Cast" and the chevron, no count.

## Motion

Motion is the layer above content that shows on the frame it arrives: small,
quick answers to what was just done. Five rules, and every animation in the
app is in the catalogue below them; a change that adds one adds its row.

1. **Transform and opacity only.** Nothing animates a size, a margin or a
   position that causes layout; a fill may fade (it repaints, it does not lay
   out), and so may the three other paint-only properties the catalogue
   names: a ring's `stroke-dashoffset`, the area chart line's `clip-path`
   and Mark watched's halo. Height changes use `grid-template-rows` or a
   measured `transform`.
   The tab bar's sliding pill (`flex-grow`) predates the rule and is its one
   standing exception.
2. **One easing family, one scale of durations**, custom properties in
   `globals.css`: `--ease-out` (0.2, 0.8, 0.2, 1) for things arriving,
   `--ease-in` (0.4, 0, 1, 1) for things leaving, `--ease-spring` (0.2, 0.9,
   0.3, 1.2) for the one bounce allowed, the tick, and `--ease-in-out` (0.45, 0,
   0.55, 1) for one picture giving way to another in place, the Discover
   carousel's crossfade. Durations `--fast` 150ms
   (press, hover, popovers), `--base` 250ms (menus, sheets, pills), `--slow`
   400ms (a page's or a hero's own movement). The easings replace
   Tailwind's, so `ease-out` and `ease-in` in markup are these curves; write
   durations as `duration-(--fast)`, never a number. Anything longer is a
   recap or a screensaver and lives in its own stylesheet.
3. **Reduced motion is a cut**, everywhere, through the one media rule in
   `globals.css` (every transition instant). New keyframes are declared inside
   `@media (prefers-reduced-motion: no-preference)` rather than undone
   afterwards, press scales are `motion-safe:`, and `Presence` does not wait
   for an exit. Only feedback that carries meaning (the tick's fade, the
   when-menu's timer) still runs.
4. **Nothing delays first paint.** No entrance on the shell, the tab bar, the
   sidebar or the first Home card, and skeletons never pulse. Entrances are
   for things that arrive after the page: a sheet, a menu, the next episode,
   a toast.
5. **Measured after every step** with `measure.js` in the review harness:
   warm Home paint and the cold Home bytes may not move by more than 5%.

**`Presence`** (`components/presence.tsx`) is how something leaves: it keeps
a closing panel mounted for its exit, marks it `data-state="open" | "closed"`,
and CSS does the rest. No motion library, and no JavaScript animation loop
anywhere except `Count` (`count.tsx`), which writes a figure's text.

**Nothing runs by itself**, since motion answers something done, with two
exceptions: the screensaver, and Discover's top-three carousel (Round 9),
with the News page's lead stories on the same machinery (Round 10),
which turns every seven seconds with a slow zoom on the slide showing. The
carousel is allowed because it is a hero, the thing the page opens on and is
looked at, and because it stops whenever it is not: under a pointer or a
finger, with focus inside it, in a hidden tab, and for good with reduced
motion. Its clock is a `setTimeout` chain on a pure state machine
(`lib/spotlight.ts`), not an animation loop; the crossfade and the zoom are
CSS. Anything else that wants to move on its own needs the same case made.

### Catalogue

| What | Where | Duration | Easing | Moves |
| --- | --- | --- | --- | --- |
| Tab bar pill slides to the new tab | `tab-bar.tsx` | `--base` | `--ease-out` | `flex-grow`, label width and fade (the exception) |
| Tick over a poster marked watched | `tick-flash` in `globals.css`, `home/tick-flash.tsx` | 2s (scale in over 250ms) | `--ease-out`, scale `--ease-spring` | opacity, scale; reduced: fade only |
| When-menu's draining bar, its timer | `when-drain` in `globals.css`, `home/when-menu.tsx` | 5s | linear | `scaleX`; runs with reduced motion (it is the timer) |
| Screensaver crossfade | `screensaver.module.css` | 2.5s | ease-in-out | opacity; own stylesheet |
| Your review's cards rise into view | `review/reveal.module.css` | 600ms | `--ease-out` | opacity, translateY 14px; own stylesheet, only under `no-preference` |
| Your review's opening figure counts up | `Count` (`count.tsx`, `on="view"`), from `review/parts.tsx` | 1.2s | cubic ease-out | the text; the one script-driven animation |
| Buttons, icon buttons and chips press | `PRESS` in `motion.ts`, used by `buttonClass`, `iconButtonClass`, `filterChipClass`, `smallChip`, `segmentChip`, `title/styles.ts`, the Up next card, News's round channel buttons and Settings › News's source chips, and every raw `<button>` and button-styled link (README, "Motion round 2", Everywhere, lists the few that do not and why) | `--fast` | `--ease-out` | scale 0.97 while pressed (`motion-safe:`, never disabled) |
| Ghost buttons and unchosen chips lift their fill | the same builders (`hover:bg-surface-2`) | `--fast` | `--ease-out` | a fill fade; pointer devices only |
| Artwork zooms under the pointer | `ZOOM`, `ZOOM_SHADOW`, `ZOOM_GROUP` in `motion.ts`: every `PosterCard` and `WideCard`, Discover's ranked, grid, pick and genre cards and the top five's #4 and #5 (desktop; not the carousel's art, which has its slow zoom instead), people tiles, More like this, a person's filmography, the list grids and the Lists page's mosaics, the calendar's Coming up, Backlog and day posters, the profile's Most watched and Ratings, search rows; the News page's big and small cards, your news's cards and New trailers, and Home's News cards (Round 10); every rail keeps 12px of room for the shadow from `lg` (`rail.tsx`) | `--slow` | `--ease-out` | the picture alone scales to 1.04 inside its clipping frame, which takes a layer of its own (`zoom-art` rule in `globals.css`) so Chrome keeps its rounded clip mid-transition; the frame's deeper shadow is a pseudo-element fading in; chips, scrims, words and captions stay; none with reduced motion |
| A genre tile's wash lifts | `GenreTile` (`discover/tiles.tsx`) | `--base` | `--ease-out` | the tint overlay's opacity from 0.9 to 0.75 as its artwork zooms |
| Rows wash under the pointer | `ROW_WASH` in `motion.ts`: Also waiting, notifications, search, friends, a title's and an episode's Friends who watched (`title/friends-watched.tsx`), Most watched, the calendar's day lists; history, agenda and habit tiles lift their fill (`hover:bg-surface-2`) | `--fast` | `--ease-out` | a pseudo-element's opacity or a fill fade; no movement |
| Segmented controls' pill slides | `SegmentPill` (`segment-pill.tsx`) with `segmentOption`/`segmentChip`: Theme, Screensaver, the smart list's mode, the review's Year/Month, Discover's Everything/Shows/Films, every `SortChips` row (a list, the watchlist, favourites), the badges' groups, All/In progress/Earned and tiers, the profile's range, the News page's chips, Settings › News's Open on and Keep stories for (Round 10) | `--base` | `--ease-out` | translate, measured; width set, not animated |
| The calendar strip's amber pill | `DayStrip` (`calendar/day-strip.tsx`) on `SegmentPill`: today, then the day tapped | `--base` | `--ease-out` | translate; it passes over the other days' tiles and under their words |
| The calendar strip's dots | `motion-dots` in `globals.css` | `--base`, a day 30ms after the one before | `--ease-out` | opacity, as the week arrives |
| A new week arrives | `WeekArrival` (`calendar/week-swipe.tsx`), `div[data-travel]` | `--base` | `--ease-out` | translateX 16px from the side travelled towards (chevrons or a swipe) and a fade; never on a fresh visit |
| Switches | `switchTrackClass`, `switchKnobClass` in `ui.tsx` | `--fast` | `--ease-out` | the knob by translate, the amber a fill fade |
| Dialogs and sheets arrive and leave | `motion-sheet`, `motion-scrim` in `globals.css`, on `Dialog` (`lists/dialog.tsx`) inside a `Presence`: the lists' dialogs, Plex, Overseerr and Trakt, Delete my account, Recommend | `--base` | in `--ease-out`, out `--ease-in` | below 40rem up from the foot (translateY); above it from scale 0.96 and faded; the shade fades |
| A sheet dragged down by its grab bar | `Dialog`'s grab bar, phones only | follows the finger; springs back over `--fast` | `--ease-out` | translate; past 80px it closes from where it was let go |
| Popovers open and close | `motion-pop` via `MENU` and `usePopover` (`title/popover.tsx`): every title and list menu, Request's question, the rating; the card's more-menu, the bell, the avatar menu, the when-menu | `--fast` | in `--ease-out`, out `--ease-in` | scale from 0.94 and fade, from the anchor's corner (`menuOrigin`) |
| Menu rows wash | `MENU_ITEM`, the avatar menu's rows | `--fast` | `--ease-out` | a fill fade |
| The unlock toast | `motion-toast` in `globals.css`, `bell/badge-toast.tsx` | `--base` | in `--ease-out`, out `--ease-in` | down from the top edge on phones, up from the foot on desktop, with a fade |
| The smart list editor's and Discover filters' folds | `motion-fold` in `globals.css`, `FoldRow` in `filter-controls.tsx` | `--base` | in `--ease-out`, out `--ease-in` | `grid-template-rows` 0fr to 1fr, the contents fading in 80ms behind; clipped only while moving |
| Folds that stay mounted | `Unfold` (`unfold.tsx`), `fold-panel` in `globals.css`: the challenge strip, Also waiting on phones (remembered per browser), Settings' cards on phones, the badges' XP breakdown | `--base` rows, contents `--base` 80ms behind (in) or `--fast` (out) | in `--ease-out`, out `--ease-in` | transitions of `grid-template-rows` and the contents' opacity; `visibility` hidden once shut; clipped only while moving; open from `lg` where the fold is a phone's (`data-desk`) |
| Every fold's chevron turns | `foldChevron` in `motion.ts`: the folds above | `--base` | `--ease-out` | rotate 180°, down while shut and up while open |
| The rating pill's chevron and press | `YourRating` in `title/popcorn-picker.tsx` | `--fast` | `--ease-out` | rotate; scale 0.97 while pressed |
| Rails snap on phones | `Rail` (`rail.tsx`) | the browser's | the browser's | `scroll-snap-type: x proximity`, cards to the 20px gutter; none from `lg` |
| A section head's chevron nudges | `SectionHead`, the Lists page's heads, search's groups, Comments; a friend row's chevron on the row's hover | `--fast` | `--ease-out` | translateX 2px on hover |
| A row leaves a list | `ExitList` (`exit-list.tsx`), `motion-collapse`: Also waiting (card and section) and `/waiting`; the notifications list when cleared (bell and page); a title's comments; friend requests and friends | `--fast` fade, then `--base` | in `--ease-in`, collapse `--ease-out` | opacity, then `grid-template-rows` to 0fr; only within 8s of a press, so a background refresh cuts |
| A row arrives after a press | `motion-rise-in` in `globals.css`: `ExitList`'s new rows (a comment posted, All N comments, a friend made), a title added to a list (`TitleGrid`), the profile's Show more (`RecordList`) and All habits; on `/news`, rows a refresh on opening or the Refresh button brought (`Arrival` in `news/news-refresh.tsx`: any row the page was not first drawn with, keyed by chip and channel) | `--base`, `--i` steps 40ms apart | `--ease-out` | opacity and translateY 6px; never on first paint |
| A poster taken off a list or the watchlist | `motion-leave`, `GridTile` in `lists/title-grid.tsx` | `--fast` | `--ease-in` | fade and scale to 0.96; the grid then closes up |
| Up next's words give way to the next episode | `Swap` (`swap.tsx`) in `home/up-next.tsx`, `motion-swap-out` then `motion-swap-in` | `--fast` out, then `--base` in | `--ease-in`, then `--ease-out` | opacity, then opacity and translateY 6px; only when the episode changes after mount |
| Up next's poster when the show changes | `Swap` in crossfade mode, `motion-swap-over` | `--base` | `--ease-out` | the old poster, laid over the new, fades; the tick plays on over both |
| Progress fills move to a new value | `FILL`, `fillTo` in `motion.ts`: the challenge strip, level lines, the profile hero, badges, Now watching, the backfill and import cards, a title's and a person's progress | `--slow` | `--ease-out` | translateX of a full-width fill inside a clipping track; still on first paint |
| Drawn on first view, once per visit | `DrawOnView` (`draw.tsx`, one shared IntersectionObserver) and `draw-*` in `globals.css`: a badge's ring (`draw-arc`), the level card's, badge count's and profile hero's bars (`draw-fill`), When you watch's bars (`draw-rise`, 30ms apart), the genre balance (`draw-grow`, 30ms apart), the area chart's line (`draw-wipe`) with its fill and dots after (`draw-fade`), the heatmap's cells (`draw-cell`) | `--slow`; heatmap cells `--fast` each, in reading order over 400ms | `--ease-out` | stroke-dashoffset (the ring), translate, scale, opacity, and the chart line's `clip-path`; the empty start only exists with script and motion, so otherwise the value is simply there |
| Figures count up on first view, once per visit | `Count once` inside a `CountScope` (`count.tsx`): the profile's big figure, its hours, viewings, films and shows, TV and film time, episodes, and the hero's XP to the next level | 1.2s | cubic ease-out | the text; a new range crosses over (`Swap`) instead of counting again |
| The profile's figures cross over to a new range | `Swap` crossfade in `ProfileBody` (`profile/sections.tsx`) | `--base` | `--ease-out` | the old figures, laid over the new, fade |
| The challenge strip's open count and XP to win | `Count on="change"` (`count.tsx`) in `home/challenge-strip.tsx` | `--slow` | cubic ease-out | the text, from the old figure to the new; never on load |
| A title's backdrop settles | `SettlingImage` (`title/settling-image.tsx`) in `BackdropArt`, `title/hero-settle.module.css` (its own stylesheet: longer than `--slow`) | 1.2s | `--ease-out` | scale 1.04 to 1, once per page, only after the image has loaded; the lettering still; none with reduced motion |
| A season's episodes cross over the last | `Swap` in `stack` mode in `EpisodeList` (`title/sections.tsx`), `motion-collapse` and `motion-swap-grow` | `--fast` + `--base` out, `--base` in | `--ease-in` out, `--ease-out` in | opacity, translateY 6px, and `grid-template-rows` on both layers of one grid cell, so the height slides |
| Ticks turning on down a season | `EpisodeTick` (`title/watch-buttons.tsx`), `tick-pop` in `globals.css` | `--base`, 30ms apart, capped at ten steps | `--ease-spring` | scale 0.5 to 1 and a fade, once per tick turning on after the row was drawn |
| Episode rows' ticks press | `EpisodeTick` | `--fast` | `--ease-out` | scale 0.97 |
| The next or previous episode arrives | `EpisodeArrival` (`title/episode-travel.tsx`) round the still and the details, set off by the navigator's `data-travel-to` links; `div[data-travel]` in `globals.css` | `--base` | `--ease-out` | translateX 12px from the side travelled towards, and a fade; never on a fresh load |
| The desktop navigator's cards | `Navigator` in `title/episode-page.tsx` | `--fast` | `--ease-out` | a fill fade on hover |
| Also waiting's tick fills | `TickButton` (`home/watched-button.tsx`) | `--fast` | `--ease-out` | amber fill and border fade, the check scaling in from 0.5; then the row collapses (`ExitList`) |
| Mark watched brightens | `WATCHED` in `home/up-next.tsx` | `--fast` | `--ease-out` | a halo of its own colour (a shadow, repainted) and, in light, the ink lifting a step; the card's glass buttons lift their fill |
| Discover's top three turn by themselves, and the News page's lead stories (Round 10) | `TopCarousel` (`discover/top-carousel.tsx`), the same at both widths, (`size` "desk" or "phone"), and `LeadCarousel` (`news/lead-carousel.tsx`), 16:9 on desktop and 7:6 on a phone, both on the shared `CarouselFrame` and `DwellArt`, on `useCarousel` (`discover/use-carousel.ts`, `lib/spotlight.ts`): a `setTimeout` chain, 7s a slide counted from the start of each change; the timings in `discover/carousel.module.css` (its own stylesheet: longer than `--slow`) | pictures 1.2s (`CHANGE_MS`); outgoing words 300ms; incoming words 400ms from 400ms | pictures `--ease-in-out`; words out `--ease-in`, in `--ease-out` | the incoming picture fades in from 0 at scale 1 while the outgoing fades out, both zooming throughout; the outgoing words (text, rank chip, score) fade, then the incoming fade in rising 6px, so words never overlap. A sideways swipe on a phone (and on the news lead at any width) steps to the next or previous slide. Paused under a pointer or finger, with focus inside, in a hidden tab; each change restarts the dwell; with reduced motion a cut, never advancing, the dots still step. With the news lead, the only running animations outside the screensaver (Motion, above) |
| The showing slide's slow zoom | `DwellArt` and `discover/carousel.module.css` | 8.2s: the 7s dwell and the 1.2s change after it | linear | scale 1 to 1.08 across the dwell and on at the same rate to 1.0937 as the slide fades out, so neither picture stands still; restarted on each showing (two keyframe names by parity), held with the carousel's pause; none with reduced motion; no hover zoom on the same art |
| The carousel's amber dot | `TopCarousel`'s dots | `--base` | `--ease-out` | one amber dot slides (translate) to the slide showing, over the three white ones; a cut with reduced motion |
| View details and Pick for me | `TopCarousel`'s slides at both widths; `SPARKLE` in `discover-page.tsx` | `--fast`; the sparkle `--base` | `--ease-out` | the pill presses with its card and lightens on hover; the sparkle turns 20° on the button's hover |
| What to watch moves between questions | `QuizSlide` (`discover/quiz-step.tsx`), `data-quiz-slide` and `div[data-travel]` in `globals.css` | out `--fast` (Next waits for it), in `--base` | out `--ease-in`, in `--ease-out` | the question and answers leave 24px left and fade (Next) or right (Back), and the next arrives from the other side |
| What to watch's answer is revealed | `motion-reveal` on the result's poster (`discover/results.tsx`) | `--slow` | `--ease-out` | scale from 0.96 and a fade |
| A tick appearing where it was pressed | `motion-tick-in` (`tick-pop`): a chosen service chip, a source chip in Settings › News on a phone, a quiz answer, a list ticked in Save, a friend sent a recommendation | `--base` | `--ease-spring` | scale from 0.5 and a fade; only for what the press changed |
| A list page's banner settles | `BannerArt` (`lists/banner-art.tsx`) in `title/hero-settle.module.css` | 1.2s | `--ease-out` | scale 1.04 to 1, once, after all four posters have loaded |
| The smart list preview crosses over | `Swap` crossfade in `smart-editor.tsx`; the match line's figures `Count on="change"` | `--base`; the count `--slow` | `--ease-out` | the old posters fade over the new; the figures count to the new answer |
| The favourite heart pops | `FavouriteButton` (`title/keep-buttons.tsx`), `motion-bump` | `--base` | `--ease-out` | scale 1 to 1.25 and back as it fills; its colour fades over `--fast` |
| A badge's medal pops | `BadgeRow` (`badges/row.tsx`), `motion-bump`, as its detail opens; the detail's medal as it arrives | `--base` | `--ease-out` | scale 1 to 1.12 and back |
| A channel's ring lights | News's round buttons (`news/channels.tsx`, Round 10) | `--fast` | `--ease-out` | the ring's border colour fades to amber when the subject has unread news or is the one chosen; nothing loops or pulses |
| Cabinet medals and friends' faces grow | `GROW_ON_HOVER` in `profile/parts.tsx` | `--fast` | `--ease-out` | scale 1.08 on hover; none with reduced motion |

**Not animated, on purpose**: route changes (no `<ViewTransition>`; README,
"Motion: M1 to M7", M7 says why), the shell, the tab bar's and sidebar's
first paint, the first Home card, skeletons, and the "Updating" line the
warm launch shows, which belongs to the shell's first second.

## `backdrop-filter`

- **Allowed in three places only**: the tab bar, the episode navigator that
  stands where it would be (`episode-page.tsx`), and glass buttons on heroes
  (`glass` in `ui.tsx`, `GLASS_*` in `title/styles.ts`, the follow button, the
  list banner's buttons, the Up next card's dark-theme buttons). All of them are
  still while the page scrolls. The screensaver's now-playing card is a
  translucent fill, not glass, though the mockup drew it blurred.
- **Never on rails or anything that scrolls**: marks and art chips are
  translucent fills instead.

## Empty states

- **One component**, `EmptyState` (`components/empty-state.tsx`, from the
  mockups' `emptyBlock`): a dashed block, an icon in a `surface-2` circle, one
  line of what goes here in display type, one line of how to change it, and a
  button only where there is somewhere to go. Lists, Calendar, Badges,
  Profile, Friends, Notifications, Search, Still to watch, Your review and the
  first-run Home all use it.

## Settings

- **Each section is an address** (`/settings` is Profile, then
  `/settings/appearance`, `subscriptions`, `notifications`, `news`,
  `connections`, `badges` for the admin, `account`), so a reload and the back button keep
  the place. Every address draws the same page (`settings/screen.tsx`), whose
  controls are written once and presented two ways.
- **Phones** draw the whole page: groups under a mono heading (You, Your
  accounts elsewhere, This instance), and under each a stack of folded cards
  (`Fold`, a `<details>`), one per setting: an icon, the title, what it holds
  now on the closed header, a chevron that turns, the controls inside. The
  card the address names is open and scrolled to. Sign out and Delete stand
  flat at the foot.
- **Desktops** draw one section beside the list of them: each entry a 34px
  icon tile (amber with a black icon for the one open, since where you are is
  state), the name and the same one-line summary the phone's card writes; the
  section a 24px heading, a line under it and its rows, the folds standing
  open. Connections is three tiles and the Plex panel under them; News
  (Round 10) is four cards (Sources, Push, Reading, and Feeds on this
  instance for the admin), which on a phone are one folded card with a mono
  heading per part and the sources as chips.
- **Summaries** come from one bag of facts the page renders with and each
  control keeps current (`useSettingFact`, `settings/summaries.ts`), so a card
  and the list never disagree and neither waits on the server.
- **Rows save as they change**; there is no Save button. A row is a label, a
  quiet line under it and its control on the right, over a hairline.
- **Switches are amber when on** (state), segmented controls are the theme
  picker's (primary for the chosen one), and a chosen service chip is amber
  with a tick, because what someone pays for is state.

## Skeletons

- **Every route has a skeleton shaped like the real screen**, box for box, in
  its `loading.tsx` (shared bones in `skeleton.tsx` and beside each component).
  Change a layout and its bones together.

## Profile

- **The page is the round 5 mockup** (`profile3*`): the dark hero with the
  level as an amber disc and a line, then the range switch, whose four
  choices live in `?range=` and are replaced rather than pushed, then the
  figures, each section in its own boundary keyed by the range.
- **Panels** are the surface at an 18px radius with `shadow-elevation`
  (`PANEL` in `profile/parts.tsx`); stat cards and habit tiles are 16px.
- **Charts are inline SVG or plain boxes**, no chart library. The area chart
  draws its path in a stretched box with `non-scaling-stroke` and places its
  dots and words as HTML by percentage, so it fills any width without script.
  Amber marks the busiest weekday, the peak and the heatmap's intensity; the
  genre balance's five shades (`GENRE_SHADES`) are data colours, the one place
  outside the badges where literal hexes stand, because a rank should read the
  same in either theme.
- **The heatmap is one strip** of the last 26 weeks (`HEAT_WEEKS`), weeks
  across and Monday down, with the month letters above it, so a day is the
  mockup's cell size in a third of the column. It says "last 6 months".
