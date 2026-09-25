"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { SIDEBAR_KEY } from "@/lib/boot-script";
import { Icon } from "./icon";
import { Link } from "./link";
import { NAV, SIDEBAR_NEWS, isActive } from "./nav";
import { useBell } from "./bell/bell-provider";
import { AvatarMenu } from "./avatar-menu";
import { BellMenu } from "./bell/bell";
import { TrekkerMark } from "./trekker-mark";
import { Wordmark } from "./ui";
import { PRESS } from "./motion";

/**
 * The collapsed state is an attribute on <html>, not React state: the boot
 * script sets it before paint from localStorage, and CSS (`collapsed:`) does
 * the rest. So the server render never disagrees with the client and the rail
 * never jumps from wide to narrow on load.
 */
function setCollapsed(collapsed: boolean) {
  const root = document.documentElement;
  if (collapsed) root.dataset.sidebar = "collapsed";
  else delete root.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Private windows can refuse storage; the rail still toggles for this visit.
  }
}

/**
 * Desktop: 224px with search, the bell and the level line, or a 76px icon
 * rail. Who is signed in and their level come from the bell's answer, fetched
 * after paint, so the sidebar never waits on a user row.
 */
export function Sidebar() {
  const pathname = usePathname();
  const newsUnread = useBell().data?.newsUnread ?? 0;
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" jumps to search from anywhere that is not already taking typing.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      e.preventDefault();
      const input = searchRef.current;
      if (input && input.offsetParent !== null) input.focus();
      else router.push("/search");
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <aside className="sticky top-0 z-(--z-popover) hidden h-dvh w-56 shrink-0 flex-col gap-7 border-r border-line bg-bg px-4 pb-5 pt-6 lg:flex collapsed:w-[76px] collapsed:items-center collapsed:px-3.5">
      <div className="flex items-center justify-between pl-2.5 collapsed:hidden">
        <Link href="/" aria-label="Trekker home">
          <Wordmark size={26} />
        </Link>
        <span className="flex items-center gap-0.5">
          <BellMenu />
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            className={`${PRESS} inline-flex size-7 items-center justify-center rounded-lg text-ink-3 hover:text-ink`}
          >
            <Icon name="chevL" size={18} />
          </button>
        </span>
      </div>
      <Link
        href="/"
        aria-label="Trekker home"
        className="hidden size-10 items-center justify-center rounded-full bg-accent text-black collapsed:inline-flex"
      >
        <TrekkerMark height={22} />
      </Link>

      <nav aria-label="Main" className="flex flex-col gap-1 collapsed:gap-1.5">
        {NAV.flatMap((item) => (item.href === SIDEBAR_NEWS.after ? [item, SIDEBAR_NEWS] : [item])).map((item) => {
          const active = isActive(pathname, item.href);
          const count = item.href === SIDEBAR_NEWS.href ? newsUnread : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors duration-(--fast) ease-out collapsed:size-12 collapsed:justify-center collapsed:rounded-[14px] collapsed:px-0 ${
                active
                  ? "bg-surface text-ink collapsed:bg-accent collapsed:text-black"
                  : "text-ink-2 hover:text-ink"
              }`}
            >
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full collapsed:hidden ${active ? "bg-accent" : "bg-transparent"}`}
              />
              <Icon name={item.icon} size={20} className="collapsed:hidden" />
              <Icon name={item.icon} size={22} className="hidden collapsed:block" />
              <span className="collapsed:hidden">{item.label}</span>
              {count > 0 && (
                // Unread is state, so the count is amber; on the rail a dot says the same.
                <>
                  <span className="ml-auto rounded-full bg-accent px-1.5 font-mono text-[11px] font-semibold leading-[18px] text-black collapsed:hidden">
                    {count > 99 ? "99+" : count}
                  </span>
                  <span aria-hidden="true" className="absolute right-2.5 top-2.5 hidden size-2 rounded-full bg-accent collapsed:block" />
                  <span className="sr-only">, {count} unread</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      <form action="/search" role="search" className="collapsed:hidden">
        <label className="flex h-[42px] items-center gap-2.5 rounded-xl bg-surface px-3 text-ink-3">
          <Icon name="search" size={18} />
          <input
            ref={searchRef}
            type="search"
            name="q"
            placeholder="Search"
            aria-label="Search"
            className="min-w-0 grow border-0 bg-transparent text-sm text-ink outline-none placeholder:text-ink-3"
          />
          <span className="rounded border border-line px-[5px] py-px font-mono text-[11px]">/</span>
        </label>
      </form>
      <Link
        href="/search"
        aria-label="Search"
        className={`${PRESS} hidden size-12 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-elevation collapsed:inline-flex hover:bg-surface-2`}
      >
        <Icon name="search" size={20} />
      </Link>

      <span className="grow" />

      {/* The whole card opens the avatar menu: Profile, Settings, the screensaver, the theme, Sign out. */}
      <div className="w-full collapsed:hidden">
        <AvatarMenu variant="sidebar" />
      </div>

      <BellMenu className="hidden collapsed:block" />
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        aria-label="Expand sidebar"
        className={`${PRESS} hidden size-12 items-center justify-center rounded-[14px] text-ink-3 hover:text-ink collapsed:inline-flex`}
      >
        <Icon name="chevR" size={20} />
      </button>
      <div className="hidden collapsed:block">
        <AvatarMenu variant="rail" />
      </div>
    </aside>
  );
}
