"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { refreshNews } from "@/lib/news-actions";
import { Icon } from "../icon";
import { iconButtonClass } from "../ui";

/** A tab coming back after this long asks again; the server decides whether anything is due. */
const AGAIN_AFTER_MS = 5 * 60 * 1000;

const Refresh = createContext<{ checking: boolean; check: (force?: boolean) => void }>({ checking: false, check: () => undefined });

/**
 * News refreshed on opening (Round 9 follow-ups). After the page has painted
 * (an effect, then a frame, so first paint is the rows as they were), it asks
 * the server to read the feeds and look at followed people if they are due
 * (`refreshNews`), and again when the tab comes back after five minutes. The
 * Refresh button (Round 10) asks the same, past the feeds' five minutes.
 * While one runs the meta line says "checking…"; when one ran, the page draws
 * itself again, so the line's "updated" time is the new one and any new rows
 * rise in (`Arrival`).
 */
export function NewsRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(false);
  const [, startTransition] = useTransition();
  const last = useRef(0);
  const alive = useRef(true);

  const check = useCallback(
    (force = false) => {
      last.current = Date.now();
      setChecking(true);
      refreshNews(force)
        .catch(() => ({ checked: false, added: 0 }))
        .then((result) => {
          if (!alive.current) return;
          if (result.checked) startTransition(() => router.refresh());
          setChecking(false);
        });
    },
    [router],
  );

  useEffect(() => {
    alive.current = true;
    const frame = requestAnimationFrame(() => check());
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - last.current > AGAIN_AFTER_MS) check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive.current = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return <Refresh.Provider value={{ checking, check }}>{children}</Refresh.Provider>;
}

/**
 * The quiet line beside the title: the date, then when the feeds were last
 * read (or how many are unread, on a phone), and "checking…" in its place
 * while a refresh runs. Polite live region, so a screen reader hears it.
 */
export function NewsMeta({ date, rest }: { date: string; rest: string | null }) {
  const { checking } = useContext(Refresh);
  const tail = checking ? "checking…" : rest;
  return (
    <span aria-live="polite" className="mono-label text-[10px] lg:text-[11px]">
      {tail ? `${date} · ${tail}` : date}
    </span>
  );
}

/** The round Refresh button: the same refresh the page runs on opening, past the feeds' five minutes. */
export function RefreshButton() {
  const { checking, check } = useContext(Refresh);
  return (
    <button type="button" aria-label="Refresh" disabled={checking} onClick={() => check(true)} className={iconButtonClass("ghost", "sm", "disabled:opacity-60")}>
      <Icon name="refresh" size={20} />
    </button>
  );
}

const Seen = createContext<ReadonlySet<string> | null>(null);

/**
 * The rows the page was first drawn with. A row that turns up later (after a
 * refresh drew the page again) rises in as it mounts, as `ExitList`'s
 * arrivals do (`motion-rise-in`); every row on first paint is simply there.
 * Keyed by chip, so switching chips is a first paint again.
 */
export function Arrivals({ ids, children }: { ids: string[]; children: ReactNode }) {
  const [seen] = useState<ReadonlySet<string>>(() => new Set(ids));
  return <Seen.Provider value={seen}>{children}</Seen.Provider>;
}

/** One row's wrapper: rises in if the page was not first drawn with it. */
export function Arrival({ id, children, className = "" }: { id: string; children: ReactNode; className?: string }) {
  const seen = useContext(Seen);
  const rise = seen && !seen.has(id) ? "motion-rise-in" : "";
  return <div className={`${rise} ${className}`.trim() || undefined}>{children}</div>;
}
