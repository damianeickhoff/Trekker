"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { signOut } from "@/lib/auth-actions";
import { THEME_COOKIE, parseThemePreference } from "@/lib/theme";
import { MeAvatar, MeLine } from "./bell/bell";
import { useBell } from "./bell/bell-provider";
import { Icon, type IconName } from "./icon";
import { Link } from "./link";
import { PRESS } from "./motion";
import { EXIT, usePresence } from "./presence";
import { ThemePicker } from "./theme-picker";

/**
 * The avatar menu: Profile, Settings, the screensaver, the theme and Sign out,
 * from the sidebar's profile card on desktop and the avatar top-right of a tab
 * page on phones. One control where the card used to carry two icons beside
 * the name, which cut the level line short.
 *
 * Someone who came in through a Plex Home also gets Switch person, which signs
 * out and starts the Plex sign-in again: a managed profile holds no token that
 * can reach the rest of the household, so going through the front door is the
 * only honest way to hand the device over.
 *
 * The panel is portalled to the body and placed from the button's position,
 * because every place the button stands is inside a stacking context of its
 * own (a tab page's top row, the sidebar) that a later section can paint over,
 * as Home's Up next card did. From the body, at `--z-popover`, it is over
 * everything but the tab bar and the sheets.
 */

type Variant = "phone" | "sidebar" | "rail";

const GAP = 8;

/**
 * Where the panel goes, measured when it opens. The phone's hangs from the top
 * row in page coordinates, so it scrolls away with the row; the sidebar never
 * moves, so its menus are fixed to the window beside it.
 */
function placeFor(variant: Variant, r: DOMRect): CSSProperties {
  if (variant === "phone") {
    return { position: "absolute", top: r.bottom + window.scrollY + GAP, right: document.documentElement.clientWidth - r.right };
  }
  if (variant === "sidebar") return { position: "fixed", bottom: window.innerHeight - r.top + GAP, left: r.left };
  return { position: "fixed", bottom: window.innerHeight - r.bottom, left: r.right + 14 };
}

function themeNow() {
  const raw = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${THEME_COOKIE}=`))
    ?.slice(THEME_COOKIE.length + 1);
  return parseThemePreference(raw);
}

const item =
  "flex h-11 w-full items-center gap-3 rounded-xl border-0 bg-transparent px-3 text-left text-sm font-semibold text-ink transition-colors duration-(--fast) ease-out hover:bg-surface";

function Item({ href, icon, label, onPick }: { href: string; icon: IconName; label: string; onPick: () => void }) {
  return (
    <Link role="menuitem" href={href} onClick={onPick} className={item}>
      <Icon name={icon} size={18} className="text-ink-2" />
      {label}
    </Link>
  );
}

export function AvatarMenu({ variant }: { variant: Variant }) {
  const pathname = usePathname();
  const me = useBell().data?.me;
  // Null while shut; where it stands while open.
  const [place, setPlace] = useState<CSSProperties | null>(null);
  const open = place !== null;
  // Where it stood, kept while it leaves.
  const { mounted, state } = usePresence(open, EXIT.fast);
  const [kept, setKept] = useState<CSSProperties | null>(place);
  if (place && place !== kept) setKept(place);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Into the menu, so the keyboard does not have to find it at the foot of
    // the document; a click's focus shows no ring, so a pointer sees nothing.
    panel.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus({ preventScroll: true });
    const inside = (t: EventTarget | null) =>
      t instanceof Node && (panel.current?.contains(t) || button.current?.contains(t));
    const onDown = (e: PointerEvent) => !inside(e.target) && setPlace(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setPlace(null);
      button.current?.focus();
    };
    // Measured once, so a new window size would leave it beside nothing.
    const onResize = () => setPlace(null);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const close = () => setPlace(null);
  const trigger = {
    ref: button,
    type: "button" as const,
    // On the card the visible name leads the label, so it is found by what it says.
    "aria-label": variant === "sidebar" && me ? `${me.name}, account menu` : "Account menu",
    "aria-haspopup": "menu" as const,
    "aria-expanded": open,
    onClick: () => setPlace(open || !button.current ? null : placeFor(variant, button.current.getBoundingClientRect())),
  };

  return (
    <div className={variant === "sidebar" ? "w-full" : undefined}>
      {variant === "sidebar" ? (
        // The whole card is the button, so its name and level line are never squeezed by icons beside them.
        <button
          {...trigger}
          className={`${PRESS} flex w-full cursor-pointer items-center gap-3 rounded-[14px] border-0 bg-surface p-2.5 text-left text-ink hover:bg-surface-2 transition-colors`}
        >
          <MeAvatar size={36} />
          <MeLine />
        </button>
      ) : (
        // On a phone a 40px box, as the search and bell buttons beside it are: the 36px face and its 2px ring fill it.
        <button
          {...trigger}
          className={`${PRESS} inline-flex cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 ${variant === "phone" ? "size-10" : ""}`}
        >
          <MeAvatar size={variant === "rail" ? 40 : 36} />
        </button>
      )}
      {mounted &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label="Account"
            data-state={state}
            style={place ?? kept ?? undefined}
            onBlur={(e) => {
              // Tabbing out of the last item leaves the menu, and shuts it.
              const to = e.relatedTarget;
              if (to instanceof Node && !panel.current?.contains(to) && !button.current?.contains(to)) close();
            }}
            className={`motion-pop z-(--z-popover) flex w-64 flex-col gap-0.5 rounded-[18px] bg-popover p-1.5 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.45)] ${
              variant === "phone" ? "origin-top-right" : "origin-bottom-left"
            }`}
          >
            <Item href="/profile" icon="user" label="Profile" onPick={close} />
            <Item href="/settings" icon="settings" label="Settings" onPick={close} />
            {/* A link, so the page it starts from is where waking returns. */}
            <Item href={`/screensaver?from=${encodeURIComponent(pathname)}`} icon="tv" label="Screensaver" onPick={close} />
            <div className="flex flex-col gap-2 px-3 pb-2 pt-2.5">
              <span className="mono-label">Theme</span>
              <ThemePicker initial={themeNow()} />
            </div>
            <span aria-hidden="true" className="mx-3 my-1 h-px bg-line" />
            {me?.plexHome && (
              // A full navigation: the sign-in leg signs this person out and leaves for plex.tv.
              <a
                role="menuitem"
                href="/api/plex/pin?switch=1"
                onClick={() => navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" })}
                className={item}
              >
                <Icon name="shuffle" size={18} className="text-ink-2" />
                Switch person
              </a>
            )}
            <form action={signOut} onSubmit={() => navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" })}>
              <button type="submit" role="menuitem" className={item}>
                <Icon name="x" size={18} className="text-ink-2" />
                Sign out
              </button>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
