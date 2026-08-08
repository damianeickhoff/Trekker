"use client";

import Image from "next/image";
import Link from "next/link";
import { Bell, Check, CloudDownload, Target, Trophy, UserPlus } from "lucide-react";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import {
  clearNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notification-actions";
import type { NotificationItem } from "@/lib/notification-centre";
import { scrollMovedAnchor } from "./anchored";

/**
 * The bell, and the list behind it.
 *
 * Portalled to the body for the same reason the account menu is: the header
 * carries a backdrop-filter, and one nested inside another has only its parent
 * to sample, so a blurred panel inside the header has nothing behind it.
 *
 * Read state is optimistic. Marking something read is not worth a spinner, and
 * the count is recomputed on the server anyway on the next navigation.
 */
/** Sentinel for "mark the lot", which is not a key any notification can have. */
const ALL = "*";

export function NotificationBell({ items }: { items: NotificationItem[] }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  /**
   * Read state applied straight away, before the server has been told.
   *
   * `useOptimistic` rather than a piece of state of its own precisely because
   * it throws itself away once fresh server data arrives: the layout revalidates
   * after a mark, and from that point the `read` flags on `items` are the truth.
   * Keeping a set by hand meant remembering to clear it, and getting that wrong
   * would leave an accepted request's key stuck as "read" for the life of the
   * page.
   */
  const [optimisticRead, addOptimisticRead] = useOptimistic(
    new Set<string>(),
    (current: Set<string>, key: string) =>
      key === ALL ? new Set(items.map((item) => item.key)) : new Set(current).add(key),
  );

  /** Cleared items vanish rather than grey out, so they are tracked apart. */
  const [optimisticGone, addOptimisticGone] = useOptimistic(
    false,
    () => true,
  );

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
    // Anchored to a rect measured when it opened, so anything that moves that
    // rect has to close it rather than leave it floating.
    function onResize() {
      setOpen(false);
    }

    /**
     * The page scrolling moves the bell, so the panel has to go. Scrolling
     * inside the panel does not, and neither does a rail or carousel elsewhere
     * on the page — see `scrollMovedAnchor`.
     */
    function onScroll(e: Event) {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (!scrollMovedAnchor(e, ref.current)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      // Kept on screen on a phone, where the bell is close to the right edge
      // and the panel is wider than the space beside it.
      setAnchor({ top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) });
    }
    setOpen(true);
  }

  function isRead(item: NotificationItem) {
    return item.read || optimisticRead.has(item.key);
  }

  function markOne(key: string) {
    startTransition(async () => {
      addOptimisticRead(key);
      await markNotificationRead(key);
    });
  }

  function markAll() {
    startTransition(async () => {
      addOptimisticRead(ALL);
      await markAllNotificationsRead();
    });
  }

  function clearAll() {
    startTransition(async () => {
      addOptimisticGone(true);
      await clearNotifications();
    });
  }

  const visible = optimisticGone ? [] : items;
  // Counted from the list rather than passed in beside it, so the badge and the
  // panel can never disagree about how many are unread.
  const count = visible.filter((item) => !isRead(item)).length;

  return (
    <div ref={ref} className="relative z-10">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          count > 0 ? `Notifications, ${count} unread` : "Notifications"
        }
        className="relative grid h-11 w-11 touch-manipulation place-items-center rounded-full text-ink-300 transition hover:text-ink-100"
      >
        <Bell size={19} />
        {count > 0 && (
          <span className="absolute top-1.5 right-1.5 grid min-w-[17px] place-items-center rounded-full bg-flare-600 px-1 text-[10px] font-bold text-white tabular-nums">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open &&
        anchor &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: anchor.top, right: anchor.right }}
            className="ios-menu fixed z-50 max-h-[70vh] w-[min(22rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-ink-700/70 bg-ink-850/70 backdrop-blur-2xl backdrop-saturate-150 light:bg-white/70"
          >
            <div className="flex items-center justify-between gap-3 border-b border-ink-800 px-3 py-2.5">
              <p className="text-sm font-medium">Notifications</p>
              <div className="flex items-center gap-3">
                {count > 0 && (
                  <button
                    type="button"
                    onClick={markAll}
                    className="text-xs text-flare-400 transition hover:text-flare-500"
                  >
                    Mark all as read
                  </button>
                )}
                {visible.length > 0 && (
                  <button
                    type="button"
                    onClick={clearAll}
                    title="Remove these from the list. Nothing behind them is changed."
                    className="text-xs text-ink-400 transition hover:text-ink-100"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-ink-400">
                Nothing waiting for you.
              </p>
            ) : (
              <ul className="max-h-[calc(70vh-42px)] overflow-y-auto overscroll-contain py-1">
                {visible.map((item) => {
                  const read = isRead(item);
                  const Icon =
                    item.kind === "friend-request"
                      ? UserPlus
                      : item.kind === "challenge"
                        ? Target
                        : item.kind === "auto-request"
                          ? CloudDownload
                          : Trophy;

                  return (
                    <li key={item.key} className="flex items-start gap-2.5 px-3 py-2.5">
                      <span
                        className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full ${
                          read ? "bg-ink-800 text-ink-500" : "bg-flare-600/20 text-flare-400"
                        }`}
                      >
                        {item.avatar ? (
                          <Image
                            src={item.avatar}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 object-cover"
                            unoptimized
                          />
                        ) : (
                          <Icon size={15} />
                        )}
                      </span>

                      <Link
                        href={item.href}
                        onClick={() => {
                          setOpen(false);
                          // Following it is not the same as dealing with it, so
                          // this only marks it seen — a request you opened and
                          // did not answer is still waiting on the friends page.
                          if (!read) markOne(item.key);
                        }}
                        className="min-w-0 grow"
                      >
                        <p
                          className={`text-sm leading-snug ${
                            read ? "text-ink-400" : "font-medium text-ink-100"
                          }`}
                        >
                          {item.title}
                        </p>
                        {/* Both a step up the ramp from where they were. The
                            body of a notification is the notification — it is
                            what tells you who asked to be your friend — so it
                            does not belong at the same weight as a decorative
                            glyph in an empty state. */}
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{item.body}</p>
                        <p className="mt-0.5 text-[11px] text-ink-500">{ago(item.at)}</p>
                      </Link>

                      {!read && (
                        <button
                          type="button"
                          onClick={() => markOne(item.key)}
                          title="Mark as read"
                          aria-label={`Mark "${item.title}" as read`}
                          className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-500 transition hover:bg-ink-800 hover:text-ink-100"
                        >
                          <Check size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function ago(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
