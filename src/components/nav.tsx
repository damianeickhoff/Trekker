"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, CalendarDays, Compass, Ghost, Gift, Home, Rocket, Search, User as UserIcon } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { NotificationItem } from "@/lib/notification-centre";
import { SEASONS, type Season, type SeasonSetting } from "@/lib/seasons";
import { useOrigin } from "./origin";
import { FLOATING_SURFACE } from "./back-button";
import { NotificationBell } from "./notification-bell";
import { SearchOverlay } from "./search-overlay";
import { UserMenu } from "./user-menu";

type NavUser = {
  id: string;
  name: string;
  /** What to show under the name — not always a real address. See `UserMenu`. */
  email: string;
  avatarUrl: string | null;
  /** Came in through Plex, so there may be a Home to hand the device back to. */
  canSwitchProfile?: boolean;
} | null;

const SEASON_ICON = { scifi: Rocket, horror: Ghost, holiday: Gift } as const;

const LINKS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  // The route keeps its old name so existing links and bookmarks still work;
  // what is behind it is now every list, not only the watchlist.
  { href: "/watchlist", label: "Lists", icon: Bookmark },
  { href: "/profile", label: "Profile", icon: UserIcon },
] as const;

/**
 * What the phone's tab bar carries. Profile is deliberately absent: the avatar
 * in the header opens the same menu, and five icons in a capsule left each one
 * too small to aim at.
 */
const TABS = LINKS.filter((link) => link.href !== "/profile");

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/**
 * Whether the page has been scrolled at all.
 *
 * An external store rather than state set from an effect, for the same reason
 * `origin.tsx` is one: this is a single value that lives outside React and
 * changes in response to something React did not do. It also gets the value
 * right on the very first render after mount, which matters when you arrive
 * part-way down a page through the back button — an effect would paint the
 * transparent bar first and then correct it.
 *
 * The snapshot is a boolean, so scrolling only re-renders on the crossing
 * rather than on every pixel.
 */
function subscribeToScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** A few pixels of slack, so a rubber-band overscroll does not flicker it. */
const SCROLL_THRESHOLD = 8;

function useScrolled() {
  return useSyncExternalStore(
    subscribeToScroll,
    () => window.scrollY > SCROLL_THRESHOLD,
    // The server has no scroll position, and the first client render has to
    // agree with it or hydration complains. Top of the page is the honest
    // answer for a fresh load.
    () => false,
  );
}

/**
 * Which path the tabs should be lit from.
 *
 * A title page matches none of them, so the bar used to go dark and stop saying
 * where you were. It is not nowhere, though — it is wherever you set off from,
 * which is exactly what the origin holds.
 */
function tabPath(pathname: string, origin: string) {
  return pathname.startsWith("/title/") ? origin : pathname;
}

export function Nav({
  user,
  season,
  seasonSetting,
  notifications = [],
}: {
  user: NavUser;
  /** Which costume is on, if any. */
  season: Season | null;
  /** Friend requests and new badges, newest first. Empty when signed out. */
  notifications?: NotificationItem[];
  /**
   * What the temporary picker should show as chosen, or null for everyone who
   * does not get the picker — which is everyone but the instance's admin.
   */
  seasonSetting: SeasonSetting | null;
}) {
  const SeasonIcon = season ? SEASON_ICON[season] : null;
  const pathname = usePathname();
  const origin = useOrigin();
  // Where the search panel should appear, or null for closed — one piece of
  // state rather than two, so "open" and "which end" cannot disagree.
  const [searchAnchor, setSearchAnchor] = useState<"top" | "bottom" | null>(null);
  const searchOpen = searchAnchor !== null;
  const scrolled = useScrolled();

  // "/" opens search, the way most media apps do it.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (typing) return;

      e.preventDefault();
      setSearchAnchor("top");
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (pathname === "/login" || pathname === "/register") return null;

  return (
    <>
      {/*
        Glass rather than a painted bar: a saturated blur over a gradient that
        fades downwards, a hairline of light along the very top edge, and a soft
        shadow underneath instead of a hard border. The gradient matters — a flat
        translucent fill has a visible bottom line wherever content scrolls under
        it, and the fade is what dissolves that.

        The top padding is the status bar's height in the installed app, where
        the page draws underneath it — so the glass carries on up behind the
        clock instead of the row starting under it. In a browser tab, and in
        light mode where the status bar stays opaque, the inset is 0 and the
        padding costs nothing.
      */}
      <header className="sticky top-0 z-40 pt-[env(safe-area-inset-top)]">
        {/*
          The glass is its own layer rather than the header's own background,
          purely so it can fade.

          Animating `backdrop-filter` from none to 2xl is not something browsers
          interpolate usefully — it snaps, and on Safari it flickers the whole
          bar. Cross-fading the opacity of a layer that already *has* the blur
          sidesteps that entirely: at zero it is not painted at all, so the top
          of the page is genuinely transparent rather than a very faint pane, and
          there is no blur cost while it is invisible.

          `inset-0` covers the safe-area padding too, so on an installed phone
          app the glass still reaches up behind the status bar once it appears.
        */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 border-b border-ink-800/50 bg-gradient-to-b from-ink-950/90 to-ink-950/65 shadow-[0_8px_24px_-16px_rgb(0_0_0/0.9)] backdrop-blur-2xl backdrop-saturate-150 transition-opacity duration-300 ease-out before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-white/8 ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* Above the glass layer, which is absolutely positioned behind it. */}
        <div className="relative mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="group flex items-center gap-2.5 font-semibold tracking-tight">
            {/* Explicitly white, not `text-ink-950`: the ink ramp inverts in
                light mode, so that one drew a near-black T in the dark and a
                near-white one in the light. The tile underneath is the same
                violet-to-orange gradient either way, so the letter on it should
                be too. */}
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-flare-500 to-ember-500 text-sm font-black text-white shadow-lg shadow-flare-600/30 ring-1 ring-white/20 transition ring-inset group-hover:shadow-flare-600/50">
              T
            </span>
            <span className="text-lg tracking-tight">Trekker</span>
          </Link>

          {/* What time of year it is, in the one place that is on every page.
              Hidden on the narrowest screens, where the row is already full. */}
          {season && SeasonIcon && (
            <span className="hidden items-center gap-1.5 rounded-full border border-flare-500/40 bg-flare-600/15 px-2.5 py-1 text-[11px] font-medium text-flare-300 sm:inline-flex light:text-flare-600">
              <SeasonIcon size={12} />
              {SEASONS[season].chip}
            </span>
          )}

          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  isActive(tabPath(pathname, origin), href)
                    ? "bg-ink-800/80 font-medium text-ink-100 ring-1 ring-white/8 ring-inset"
                    : "text-ink-300 hover:bg-ink-800/60 hover:text-ink-100"
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {/* Desktop only. On a phone the tab bar carries its own search
                circle, and two ways to open the same panel a thumb's width
                apart is one of them doing nothing. */}
            <button
              type="button"
              onClick={() => setSearchAnchor("top")}
              aria-label="Search"
              title="Search (press /)"
              className="relative z-10 hidden h-11 w-11 touch-manipulation place-items-center rounded-lg text-ink-300 transition hover:bg-ink-800 hover:text-ink-100 md:grid"
            >
              <Search size={19} />
            </button>
            {user && <NotificationBell items={notifications} />}
            {user ? (
              <UserMenu
                name={user.name}
                email={user.email}
                avatarUrl={user.avatarUrl}
                seasonSetting={seasonSetting}
                canSwitchProfile={user.canSwitchProfile}
              />
            ) : (
              <Link
                href="/login"
                className="rounded-lg bg-flare-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-flare-500"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </header>

      {/*
        Mobile tab bar. Not a bar across the bottom edge but a floating capsule
        of the same glass as the back button, with the search set apart in its
        own circle — it is not a place in the app, it is a thing you do, and
        putting it in the row would have implied a fifth destination.

        Icons only: four glyphs in a capsule are wide enough to aim at, and the
        labels were the only reason the old bar needed two lines.

        Raised above the search overlay while that is open, so the bar the field
        opened from stays visible underneath it rather than being dimmed out.

        It sits low. The bottom inset on a phone with a home indicator is 34px,
        and a floating capsule held that far off the edge reads as hovering in
        the middle of nowhere rather than as the bottom of the app — so most of
        that inset is given back, leaving a gap the indicator can still be seen
        through. Everything else here is a size down from where it started, for
        the same reason: the shorter the bar, the more of the page is page.
      */}
      <nav
        className={`pointer-events-none fixed inset-x-0 bottom-0 flex items-center justify-center gap-1.5 px-4 pb-[max(0.5rem,calc(env(safe-area-inset-bottom)-0.75rem))] md:hidden ${
          searchOpen ? "z-[101]" : "z-40"
        }`}
      >
        <div className={`${FLOATING_SURFACE} pointer-events-auto grid flex-1 grid-cols-4 gap-1 p-1`}>
          {TABS.map(({ href, label, icon: Icon }) => {
            const active = isActive(tabPath(pathname, origin), href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                // White rather than the grey ramp: on glass the greys read as
                // disabled. `light:` puts them back to the ramp's near-black,
                // which is what white inverts to on paper.
                //
                // The colour does not change with the state — where you are is
                // said by the pill behind the glyph and by its weight, the way
                // iOS does it. A violet glyph in a violet-tinted app was one
                // accent too many.
                className={`flex h-10 touch-manipulation items-center justify-center rounded-full text-white transition light:text-ink-100 ${
                  active ? "bg-white/10 ring-1 ring-white/10 ring-inset light:bg-black/8 light:ring-black/5" : ""
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.3 : 1.9} />
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setSearchAnchor((current) => (current ? null : "bottom"))}
          aria-label="Search"
          aria-expanded={searchOpen}
          // A ring rather than a lighter fill for the open state: this element
          // *is* the glass, and a second background utility on it would race
          // `FLOATING_SURFACE`'s own with no way to say which should win.
          className={`${FLOATING_SURFACE} pointer-events-auto grid h-12 w-12 shrink-0 place-items-center text-white transition light:text-ink-100 ${
            searchOpen ? "ring-1 ring-white/20 ring-inset light:ring-black/10" : ""
          }`}
        >
          <Search size={20} strokeWidth={1.9} />
        </button>
      </nav>

      {searchAnchor && (
        <SearchOverlay anchor={searchAnchor} onClose={() => setSearchAnchor(null)} />
      )}
    </>
  );
}
