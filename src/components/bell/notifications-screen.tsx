"use client";

import { useEffect, useState } from "react";
import { COLLAPSE_MS } from "../exit-list";
import { Link } from "../link";
import { Presence } from "../presence";
import { buttonClass } from "../ui";
import { useBell } from "./bell-provider";
import { NoNotes, NoteBones, NoteRow } from "./notes";

/** Mark all read, for the page's top row. Only while something is unread. */
export function MarkAllRead() {
  const { data, markAll } = useBell();
  if (!data?.unread) return null;
  return (
    <button type="button" onClick={() => void markAll()} className={buttonClass("ghost", "sm", "h-9! px-4!")}>
      Mark all read
    </button>
  );
}

/**
 * Clear, beside it: everything on the list goes rather than greying out.
 * Nothing behind a notification changes, so it says so on hover.
 */
export function ClearAll() {
  const { data, clear } = useBell();
  if (!data?.items.length) return null;
  return (
    <button
      type="button"
      onClick={() => void clear()}
      title="Remove these from the list. Nothing behind them is changed."
      className={buttonClass("ghost", "sm", "h-9! px-4!")}
    >
      Clear
    </button>
  );
}

/** The page's two list actions, side by side. */
export function NoteActions() {
  return (
    <span className="flex items-center gap-2">
      <MarkAllRead />
      <ClearAll />
    </span>
  );
}

/**
 * Whether this device will be told without opening the app. Only the browser
 * knows: a subscription belongs to it, not to the account.
 */
function usePushState() {
  const [state, setState] = useState<"on" | "off" | "unsupported" | null>(null);
  useEffect(() => {
    let live = true;
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported" as const;
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      return sub ? ("on" as const) : ("off" as const);
    })()
      .then((s) => live && setState(s))
      .catch(() => live && setState("off"));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

/** The phone's notifications: New, then Earlier, from the answer the bell already holds. */
export function NotificationsScreen() {
  const { data } = useBell();
  const push = usePushState();
  const fresh = data?.items.filter((i) => !i.read) ?? [];
  const earlier = data?.items.filter((i) => i.read) ?? [];

  return (
    <div className="flex flex-col gap-1.5">
      {!data ? (
        <>
          <span className="mono-label">New</span>
          <NoteBones />
        </>
      ) : (
        <>
          {/* Cleared, the rows fade and fold away (`motion-collapse`) and the empty state rises into their place. */}
          <Presence open={data.items.length > 0} exit={COLLAPSE_MS}>
            <div className="motion-collapse grid grid-rows-[1fr]">
              <div className="flex min-h-0 flex-col gap-1.5">
                {fresh.length > 0 && <span className="mono-label">New</span>}
                {fresh.map((n) => (
                  <NoteRow key={n.key} note={n} />
                ))}
                {earlier.length > 0 && <span className={`mono-label ${fresh.length ? "pt-3" : ""}`}>Earlier</span>}
                {earlier.map((n) => (
                  <NoteRow key={n.key} note={n} />
                ))}
              </div>
            </div>
          </Presence>
          {data.items.length === 0 && <NoNotes withSettings />}
        </>
      )}
      {push && (
        <span className="pt-2.5 text-xs text-ink-3">
          {push === "on"
            ? "Push is on for this device. "
            : push === "off"
              ? "Push is off for this device. "
              : "This browser cannot take push notifications. "}
          {push !== "unsupported" && (
            <Link href="/settings/notifications" className="font-semibold text-ink-2 hover:text-ink">
              Change it in Settings.
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
