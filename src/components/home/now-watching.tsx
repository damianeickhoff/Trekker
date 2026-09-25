"use client";

import { useEffect, useState } from "react";
import type { Watching } from "@/lib/now-playing";
import { useBell } from "../bell/bell-provider";
import { Link } from "../link";
import { Poster } from "../poster";
import { SectionTitle } from "../ui";
import { FILL, fillTo } from "../motion";

/**
 * "Now watching in the house": whoever else is playing something on the Plex
 * server, from `/api/now-playing` every twenty seconds. Only on Home, only
 * rendered when Plex is linked, and only while the tab is visible: a hidden
 * tab stops asking and asks again the moment it is back. Not you, as in the
 * current app: what you put on is the one thing on a dashboard you already
 * know. Nothing is drawn while nobody else is watching.
 */

const EVERY_MS = 20_000;

export function NowWatching() {
  const me = useBell().data?.me?.id ?? null;
  const [watching, setWatching] = useState<Watching[]>([]);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setInterval> | null = null;
    const ask = async () => {
      try {
        const res = await fetch("/api/now-playing", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { watching: Watching[] | null };
        if (live) setWatching(data.watching ?? []);
      } catch {
        // A server gone away is the same as nobody watching.
        if (live) setWatching([]);
      }
    };
    const start = () => {
      void ask();
      timer ??= setInterval(ask, EVERY_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      live = false;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const others = watching.filter((w) => !me || w.userId !== me);
  if (others.length === 0) return null;

  return (
    <section aria-labelledby="now-watching" className="order-4 flex flex-col gap-3 lg:gap-3.5">
      <SectionTitle>
        <span id="now-watching">Now watching in the house</span>
      </SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-2 p-0 lg:grid lg:grid-cols-2 lg:gap-3">
        {others.map((w, i) => {
          const body = (
            <>
              <Poster path={w.poster} alt="" title={w.title} width={40} height={60} sizes="40px" className="h-[60px] w-10 rounded-md" />
              <span className="flex min-w-0 grow flex-col gap-1">
                <span className="truncate text-sm font-semibold">
                  {w.title}
                  {w.code && <span className="ml-1.5 font-mono text-xs font-normal text-ink-3">{w.code}</span>}
                </span>
                <span className="truncate text-xs text-ink-2">
                  {[w.who, w.player].filter(Boolean).join(" · ")}
                </span>
                <span
                  className="h-1.5 overflow-hidden rounded-full bg-surface-2"
                  role="progressbar"
                  aria-label={`${w.progress}% through`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={w.progress}
                >
                  <span className={FILL} style={fillTo(w.progress)} />
                </span>
              </span>
            </>
          );
          const row = "flex items-center gap-3 rounded-[18px] bg-surface p-3 shadow-elevation";
          return (
            <li key={`${w.userId ?? w.who}-${i}`}>
              {w.href ? (
                <Link href={w.href} className={row}>
                  {body}
                </Link>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
