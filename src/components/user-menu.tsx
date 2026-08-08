"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LogOut,
  MonitorPlay,
  Settings,
  Sparkles,
  Trophy,
  User as UserIcon,
  Users,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout } from "@/lib/auth-actions";
import { switchProfile } from "@/lib/plex-profile-actions";
import type { SeasonSetting } from "@/lib/seasons";
import { scrollMovedAnchor } from "./anchored";
import { SeasonSwitcher } from "./season-switcher";

export function UserMenu({
  name,
  email,
  avatarUrl,
  seasonSetting,
  canSwitchProfile = false,
}: {
  name: string;
  /**
   * The line under the name. Usually the address on the account — but a managed
   * Plex Home profile has no address of its own, and what is stored for it is a
   * placeholder nobody should be shown, so the caller substitutes something
   * true instead.
   */
  email: string;
  avatarUrl: string | null;
  /** Signed in through Plex, so there may be a household to hand this back to. */
  canSwitchProfile?: boolean;
  /**
   * TEMPORARY: what the preview switch should show as chosen, or null to leave
   * it out entirely — which is everyone but the instance's admin.
   */
  seasonSetting: SeasonSetting | null;
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  async function startScreensaver() {
    setOpen(false);
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Refused, or a browser that will not do it here. Worth having anyway.
    }
    router.push(`/screensaver?from=${encodeURIComponent(pathname)}`);
  }

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // The menu is anchored to a rect measured at open time, so anything that
    // moves that rect has to close it rather than leave it floating.
    function onReflow() {
      setOpen(false);
    }

    // ...but only scrolling that actually moves it — see `scrollMovedAnchor`.
    function onScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (!scrollMovedAnchor(e, ref.current)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onReflow);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onReflow);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) setAnchor({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  return (
    <div ref={ref} className="relative z-10">
      {/* 44px hit area with a 36px avatar inside it: the visual size stayed the
          same, the tap target did not. */}
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="grid h-11 w-11 touch-manipulation place-items-center rounded-full"
      >
        <span className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-flare-600 to-flare-400 text-sm font-semibold text-white ring-flare-400 transition hover:ring-2">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 object-cover"
            unoptimized
          />
        ) : (
          name.slice(0, 1).toUpperCase()
        )}
        </span>
      </button>

      {/*
        Rendered into the body rather than inside the header. The header already
        carries a backdrop-filter, and a backdrop-filter nested inside another
        one can only sample its parent's backdrop — so the menu's own blur had
        nothing behind it to blur. A portal puts it back over the page.
      */}
      {open &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: anchor.top, right: anchor.right }}
            className="ios-menu fixed z-50 w-72 overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/70 backdrop-blur-2xl backdrop-saturate-150 light:bg-white/70"
          >
          {/* Rows are 44px tall rather than 36, which is the smallest thing a
              thumb hits reliably — the same floor the floating controls use.
              The width went with them: at 240px the longer labels sat closer
              to the edge than the icons did to the other one. */}
          <div className="border-b border-ink-800 px-3.5 py-3">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-ink-400">{email}</p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <UserIcon size={17} />
              Profile
            </Link>
            {/* These three had no way in at all beyond a link buried on the
                profile page — the mobile bar's five slots are full, so the
                account menu is where they can live. */}
            <Link
              href="/achievements"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Trophy size={17} />
              Achievements
            </Link>
            <Link
              href="/friends"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Users size={17} />
              Friends
            </Link>
            <Link
              href="/review"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Sparkles size={17} />
              Your year
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Settings size={17} />
              Settings
            </Link>
            {/* A button rather than a link, and the one thing in this menu that
                is: the browser only hands over the whole screen in response to
                a press, so the request has to be made inside this click. The
                navigation is what the link would have done anyway. */}
            <button
              type="button"
              onClick={startScreensaver}
              className="flex w-full items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <MonitorPlay size={17} />
              Screensaver
            </button>
          </div>

          {/* Handing the phone, or the shared iPad, to somebody else in the
              Plex Home. It signs out on the way — see `switchProfile` — because
              a profile holds no credentials for the rest of the household, so
              the only way back to the picker is through the front door. */}
          {canSwitchProfile && (
            <form action={switchProfile} className="border-t border-ink-800 py-1">
              <button
                type="submit"
                className="flex w-full items-center gap-3 px-3.5 py-3 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
              >
                <UsersRound size={17} />
                Switch profile
              </button>
            </form>
          )}

          {seasonSetting !== null && (
            <SeasonSwitcher current={seasonSetting} onPicked={() => setOpen(false)} />
          )}

          <form action={logout} className="p-2 pt-1">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm font-semibold text-red-400 transition hover:border-red-500/60 hover:bg-red-500/20 light:text-red-600"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
