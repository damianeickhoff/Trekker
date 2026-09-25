"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BellData } from "@/lib/notifications";
import { clearAll, readAll, readOne } from "@/lib/notification-actions";

/**
 * The bell's data for the whole signed-in chrome: the notifications, the
 * newest badge for the toast, and who is signed in with their level for the
 * sidebar and the avatars. Fetched from `/api/notifications` after the page
 * has painted, never by a layout, so no screen waits on it.
 *
 * Asked again on navigation (at most every fifteen seconds; the server holds
 * the answer a minute anyway), when the tab comes back into view, and once a
 * minute while it is visible. Nothing else polls: the unlock toast reads what
 * this already fetched.
 */

type Bell = {
  data: BellData | null;
  refresh: () => void;
  markAll: () => Promise<void>;
  /** Empties the list at once, badge and all; the server catches up behind it. */
  clear: () => Promise<void>;
  markOne: (key: string) => void;
};

const BellContext = createContext<Bell>({
  data: null,
  refresh: () => undefined,
  markAll: async () => undefined,
  clear: async () => undefined,
  markOne: () => undefined,
});

export const useBell = () => useContext(BellContext);

const MIN_GAP_MS = 15_000;
const POLL_MS = 60_000;

export function BellProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [data, setData] = useState<BellData | null>(null);
  const last = useRef(0);
  const inFlight = useRef(false);

  const load = useCallback(async (force = false) => {
    if (inFlight.current) return;
    if (!force && Date.now() - last.current < MIN_GAP_MS) return;
    inFlight.current = true;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.ok) {
        setData((await res.json()) as BellData);
        last.current = Date.now();
      }
    } catch {
      // Offline or signed out: the bell keeps what it had.
    } finally {
      inFlight.current = false;
    }
  }, []);

  // After paint, and again whenever the page changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the fetch is the external system; its answer lands after an await
    void load();
  }, [pathname, load]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, POLL_MS);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [load]);

  const markAll = useCallback(async () => {
    setData((d) => (d ? { ...d, unread: 0, items: d.items.map((i) => ({ ...i, read: true })) } : d));
    await readAll().catch(() => undefined);
    void load(true);
  }, [load]);

  const clear = useCallback(async () => {
    setData((d) => (d ? { ...d, unread: 0, items: [] } : d));
    await clearAll().catch(() => undefined);
    void load(true);
  }, [load]);

  const markOne = useCallback((key: string) => {
    setData((d) => {
      if (!d) return d;
      const item = d.items.find((i) => i.key === key);
      if (!item || item.read) return d;
      return { ...d, unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.key === key ? { ...i, read: true } : i)) };
    });
    void readOne(key).catch(() => undefined);
  }, []);

  const value = useMemo(
    () => ({ data, refresh: () => void load(true), markAll, clear, markOne }),
    [data, load, markAll, clear, markOne],
  );
  return <BellContext.Provider value={value}>{children}</BellContext.Provider>;
}
