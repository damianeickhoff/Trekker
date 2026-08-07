"use client";

import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings, Sparkles, Trophy, User as UserIcon, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { logout } from "@/lib/auth-actions";
import type { SeasonSetting } from "@/lib/seasons";
import { scrollMovedAnchor } from "./anchored";
import { SeasonSwitcher } from "./season-switcher";

export function UserMenu({
  name,
  email,
  avatarUrl,
  seasonSetting,
}: {
  name: string;
  email: string;
  avatarUrl: string | null;
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
            className="ios-menu fixed z-50 w-60 overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/70 backdrop-blur-2xl backdrop-saturate-150 light:bg-white/70"
          >
          <div className="border-b border-ink-800 px-3 py-3">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="truncate text-xs text-ink-400">{email}</p>
          </div>

          <div className="py-1">
            <Link
              href="/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <UserIcon size={15} />
              Profile
            </Link>
            {/* These three had no way in at all beyond a link buried on the
                profile page — the mobile bar's five slots are full, so the
                account menu is where they can live. */}
            <Link
              href="/achievements"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Trophy size={15} />
              Achievements
            </Link>
            <Link
              href="/friends"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Users size={15} />
              Friends
            </Link>
            <Link
              href="/review"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Sparkles size={15} />
              Your year
            </Link>
            <Link
              href="/settings"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              <Settings size={15} />
              Settings
            </Link>
          </div>

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
