"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "../icon";
import { Link } from "../link";
import { COLLAPSE_MS } from "../exit-list";
import { EXIT, Presence, usePresence } from "../presence";
import { AvatarPlaceholder, iconButtonClass, type ButtonKind } from "../ui";
import { UserAvatar } from "../user-avatar";
import { useBell } from "./bell-provider";
import { NoNotes, NoteBones, NoteRow } from "./notes";
import { PRESS } from "../motion";

/** The amber dot on the bell while anything is unread. */
function Dot({ ring = "var(--bg)" }: { ring?: string }) {
  return (
    <span
      aria-hidden="true"
      className="absolute right-1 top-1 size-2.5 rounded-full bg-accent"
      style={{ boxShadow: `0 0 0 2px ${ring}` }}
    />
  );
}

/**
 * The bell as a link, on a phone: to the notifications page. `glass` on the
 * profile hero, where the mockups put it.
 */
export function BellLink({ kind = "ghost" }: { kind?: ButtonKind }) {
  const { data } = useBell();
  const unread = data?.unread ?? 0;
  return (
    <Link
      href="/notifications"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      className={iconButtonClass(kind, "sm", "relative")}
    >
      <Icon name="bell" size={20} />
      {unread > 0 && <Dot ring={kind === "glass" ? "transparent" : "var(--bg)"} />}
    </Link>
  );
}

/**
 * The desktop bell, in the sidebar: a popover over whatever page is open,
 * beside the sidebar at either of its widths. It closes on a press outside
 * (which is also any other link), on Escape and on opening a notification.
 */
export function BellMenu({ className = "" }: { className?: string }) {
  const { data, markAll, clear } = useBell();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;
  const { mounted, state } = usePresence(open, EXIT.fast);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((o) => !o)}
        className={`${PRESS} relative inline-flex size-7 items-center justify-center rounded-lg text-ink-3 hover:text-ink collapsed:size-12 collapsed:rounded-[14px]`}
      >
        <Icon name="bell" size={18} className="collapsed:hidden" />
        <Icon name="bell" size={22} className="hidden collapsed:block" />
        {unread > 0 && <Dot />}
      </button>
      {mounted && (
        <div
          role="dialog"
          aria-label="Notifications"
          data-state={state}
          className="motion-pop origin-top-left fixed left-[240px] top-6 z-(--z-sheet) flex max-h-[calc(100dvh-48px)] w-[420px] flex-col gap-1 overflow-y-auto rounded-[18px] bg-popover px-[18px] pb-3.5 pt-2 text-ink shadow-[0_20px_60px_rgba(0,0,0,0.45)] collapsed:left-[92px]"
        >
          <div className="flex items-center justify-between pb-1 pt-2">
            <span className="font-display text-lg font-bold tracking-[-0.02em]">Notifications</span>
            <span className="flex items-center gap-3.5">
              {unread > 0 && (
                <button type="button" onClick={() => void markAll()} className={`${PRESS} text-xs font-semibold text-ink-2 hover:text-ink`}>
                  Mark all read
                </button>
              )}
              {!!data?.items.length && (
                <button
                  type="button"
                  onClick={() => void clear()}
                  title="Remove these from the list. Nothing behind them is changed."
                  className={`${PRESS} text-xs font-semibold text-ink-2 hover:text-ink`}
                >
                  Clear
                </button>
              )}
            </span>
          </div>
          {!data ? (
            <NoteBones />
          ) : (
            <>
              {/* Cleared, the rows fade and fold away (`motion-collapse`) and the empty state rises into their place. */}
              <Presence open={data.items.length > 0} exit={COLLAPSE_MS}>
                <div className="motion-collapse grid shrink-0 grid-rows-[1fr]">
                  <div className="flex min-h-0 flex-col gap-1">
                    {data.items.map((n) => (
                      <NoteRow key={n.key} note={n} onOpen={() => setOpen(false)} />
                    ))}
                  </div>
                </div>
              </Presence>
              {data.items.length === 0 && <NoNotes />}
            </>
          )}
          <Link href="/settings/notifications" onClick={() => setOpen(false)} className="pt-2.5 text-center text-xs font-semibold text-ink-2 hover:text-ink">
            Notification settings
          </Link>
        </div>
      )}
    </div>
  );
}

/** The signed-in person's avatar in the chrome, once the bell has said who they are. */
export function MeAvatar({ size = 36 }: { size?: number }) {
  const me = useBell().data?.me;
  if (!me) return <AvatarPlaceholder size={size} />;
  return <UserAvatar id={me.id} name={me.name} src={me.avatar} size={size} ring />;
}

/** The sidebar's name and level line: "Lvl 14 · Rookie". A full name takes two lines before it is cut. */
export function MeLine() {
  const me = useBell().data?.me;
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="line-clamp-2 break-words text-[13px] font-bold leading-[1.25]">{me?.name ?? "Profile"}</span>
      <span className="mono-label truncate text-[10px]">{me ? `Lvl ${me.level} · ${me.rank}` : " "}</span>
    </span>
  );
}
