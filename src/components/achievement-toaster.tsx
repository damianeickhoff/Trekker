"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Tier } from "@/lib/achievements";
import { BadgeMedal, tierLabel } from "./achievement-badge";

type Unlock = {
  id: string;
  key: string;
  name: string;
  description: string;
  icon: string;
  tier: Tier;
};

type Standing = { level: number; rank: string; xp: number };

/**
 * Three things worth celebrating, in ascending order of how rarely they happen:
 * a badge, a level, and a rank. They share one queue so they can never land on
 * top of one another.
 */
type Celebration =
  | ({ kind: "badge" } & Unlock)
  | { kind: "level"; id: string; level: number; rank: string }
  | { kind: "rank"; id: string; level: number; rank: string; from: string };

/** How long each one stays up. Matches `--unlock-life` on the timer bar. */
const LIFE_MS = 6000;
/** A rank change is rare enough to be worth reading twice. */
const RANK_LIFE_MS = 9000;
/** The gap between one leaving and the next arriving. */
const GAP_MS = 380;
/** How often to look when nothing else has prompted a check. */
const POLL_MS = 30_000;
/**
 * Two checks closer together than this are the same check. Short, because the
 * things that prompt one — a navigation, a badge appearing in the bell — often
 * happen within a moment of each other, and swallowing the second would put the
 * delay back.
 */
const DEBOUNCE_MS = 400;
/** What has already been celebrated, so a reload does not do it again. */
const SEEN_KEY = "trekker:announced-badges";
/** Where the level stood last time we looked, which is what a rise is measured against. */
const STANDING_KEY = "trekker:level-standing";

function readStanding(): Standing | null {
  try {
    const raw = window.localStorage.getItem(STANDING_KEY);
    return raw ? (JSON.parse(raw) as Standing) : null;
  } catch {
    return null;
  }
}

function writeStanding(standing: Standing) {
  try {
    window.localStorage.setItem(STANDING_KEY, JSON.stringify(standing));
  } catch {
    // Storage denied: no level celebrations, everything else still works.
  }
}

function readSeen(): Set<string> {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeSeen(seen: Set<string>) {
  try {
    // Only the recent tail is worth keeping — the window on the server is ten
    // minutes, so anything older can never come back round.
    window.localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-40)));
  } catch {
    // A browser with storage denied simply celebrates twice. Not worth failing.
  }
}

/**
 * The badge celebration, mounted once in the root layout so it can appear over
 * whatever page someone happens to be on.
 *
 * It polls rather than being handed the news with the page, because earning a
 * badge is usually not something the user did *here*: an episode scrobbled from
 * Plex runs the unlock check in the background, and there may be no navigation
 * for hours. The poll only runs while the tab is visible, and stops entirely
 * once the browser is hidden.
 *
 * Which unlocks have been announced is kept in this browser, not on the account.
 * Seeing the same badge celebrated on your phone and again on your laptop is
 * fine — arguably right — whereas a shared record would mean whichever device
 * happened to poll first swallowed it for the others.
 */
export function AchievementToaster({
  enabled,
  signal = 0,
}: {
  enabled: boolean;
  /**
   * When the newest badge was earned, from the server. Not read for its value —
   * it is watched so that a render which brings news prompts a look straight
   * away. Ticking an episode re-renders the layout without changing the URL, so
   * without this the celebration would wait for the next poll while the bell
   * had the news already.
   */
  signal?: number;
}) {
  /**
   * Everything earned and not yet seen off. The head of it is what is on
   * screen, so promoting the next one is a shift rather than a second piece of
   * state to keep in step with the first.
   */
  const [queue, setQueue] = useState<Celebration[]>([]);
  const [leaving, setLeaving] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const standing = useRef<Standing | null | undefined>(undefined);
  const lastLook = useRef(0);
  const pathname = usePathname();

  const dismiss = useCallback(() => setLeaving(true), []);

  useEffect(() => {
    if (!enabled) return;

    seen.current ??= readSeen();
    if (standing.current === undefined) standing.current = readStanding();
    let cancelled = false;

    async function look() {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - lastLook.current < DEBOUNCE_MS) return;
      lastLook.current = Date.now();

      try {
        const res = await fetch("/api/achievements/recent", { cache: "no-store" });
        if (!res.ok) return;

        const data = (await res.json()) as { items: Unlock[]; level: Standing | null };
        if (cancelled) return;

        const known = seen.current!;
        const fresh = data.items.filter((item) => !known.has(item.id));

        for (const item of fresh) known.add(item.id);
        if (fresh.length > 0) writeSeen(known);

        const added: Celebration[] = fresh.map((item) => ({ kind: "badge", ...item }));

        // A rise is measured against what we were told last time. The first
        // sighting of an account only writes the number down — there is nothing
        // to compare it against, and celebrating a level someone reached weeks
        // ago the moment they open the app would be a lie.
        const before = standing.current;
        const now = data.level;

        if (now) {
          if (before && now.level > before.level) {
            added.push(
              now.rank !== before.rank
                ? {
                    kind: "rank",
                    id: `rank:${now.rank}:${now.level}`,
                    level: now.level,
                    rank: now.rank,
                    from: before.rank,
                  }
                : { kind: "level", id: `level:${now.level}`, level: now.level, rank: now.rank },
            );
          }

          standing.current = now;
          writeStanding(now);
        }

        if (added.length === 0) return;

        // Badges first, then the level they pushed you to — the cause before
        // the consequence.
        setQueue((current) => [...current, ...added]);
      } catch {
        // Offline, or signed out in another tab. Try again next time.
      }
    }

    void look();
    const timer = window.setInterval(look, POLL_MS);
    // Coming back to the tab is the most likely moment for there to be news.
    document.addEventListener("visibilitychange", look);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", look);
    };
    // `pathname` and `signal` are in here on purpose. Arriving on a page is one
    // likely moment, because the render that got you there is often what
    // unlocked the badge; a fresh `signal` is the other, and covers ticking an
    // episode where the URL never changes. Waiting half a minute for a poll to
    // notice what the server already knows reads as broken.
  }, [enabled, pathname, signal]);

  // One at a time. A stack of five cards landing together is a wall rather than
  // a celebration, and the fifth would be gone before it was read — so each one
  // gets the screen to itself and the rest queue behind it.
  const item = queue[0] ?? null;
  const queued = Math.max(0, queue.length - 1);

  const life = item?.kind === "rank" ? RANK_LIFE_MS : LIFE_MS;

  useEffect(() => {
    if (!item) return;
    const timer = window.setTimeout(
      () => setLeaving(true),
      item.kind === "rank" ? RANK_LIFE_MS : LIFE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [item]);

  // The head is only dropped once its leaving animation has played out, so the
  // next one does not arrive over the top of the one going away.
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(() => {
      setQueue((current) => current.slice(1));
      setLeaving(false);
    }, GAP_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  if (!enabled || !item) return null;

  // A rank change takes the middle of the screen. It happens once every five
  // levels and is the only thing in the app that earns the interruption.
  if (item.kind === "rank") {
    return (
      <div className="rankup-layer" role="status" aria-live="polite">
        <div className="rankup-veil" aria-hidden />

        <article
          data-leaving={leaving}
          className="rankup-card card w-full max-w-sm border-flare-500/40 bg-ink-900/90 px-6 py-8 text-center shadow-2xl shadow-black/60 backdrop-blur-xl"
        >
          <div className="rankup-rays" aria-hidden />

          <div className="relative grid place-items-center">
            <span className="rankup-ring" aria-hidden />
            <span className="rankup-ring rankup-ring-late" aria-hidden />
            <span className="rankup-medal relative grid h-24 w-24 place-items-center rounded-full bg-gradient-to-br from-flare-500 to-ember-500 shadow-xl shadow-flare-600/40 ring-1 ring-white/25 ring-inset">
              <span className="font-mono text-3xl font-black text-white tabular-nums">
                {item.level}
              </span>
            </span>
          </div>

          <p className="relative mt-6 text-[11px] font-medium tracking-[0.22em] text-flare-400 uppercase">
            New rank
          </p>

          <p className="relative mt-1 flex items-center justify-center gap-2.5">
            <span className="rankup-from text-lg text-ink-500 line-through">{item.from}</span>
            <span className="rankup-to text-3xl font-semibold tracking-tight">{item.rank}</span>
          </p>

          <p className="relative mt-3 text-sm text-ink-400">
            Level {item.level} on Trekker.
          </p>

          <div className="relative mt-6 flex items-center justify-center gap-2">
            <Link
              href="/achievements"
              onClick={dismiss}
              className="rounded-xl bg-flare-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-flare-500"
            >
              See your progress
            </Link>
            <button
              type="button"
              onClick={dismiss}
              className="rounded-xl border border-ink-700 px-4 py-2 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              Nice
            </button>
          </div>
        </article>
      </div>
    );
  }

  return (
    <div className="unlock-layer" role="status" aria-live="polite">
      <article
        key={item.id}
        data-leaving={leaving}
        style={{ ["--unlock-life" as string]: `${life}ms` }}
        className={`unlock-toast card flex items-center gap-3.5 bg-ink-900/90 p-3.5 shadow-2xl shadow-black/50 backdrop-blur-xl ${
          item.kind === "level" ? "border-ember-400/45" : "border-flare-500/40"
        }`}
      >
        <div className="unlock-bloom" aria-hidden />
        <div className="unlock-sheen" aria-hidden />

        <span className="relative shrink-0">
          <span className="unlock-ring" aria-hidden />
          {item.kind === "level" ? (
            <span className="levelup-number grid h-[46px] w-[46px] place-items-center rounded-full bg-gradient-to-br from-flare-500 to-ember-500 ring-1 ring-white/20 ring-inset">
              <span className="font-mono text-lg font-black text-white tabular-nums">
                {item.level}
              </span>
            </span>
          ) : (
            <span className="unlock-medal block">
              <BadgeMedal icon={item.icon} tier={item.tier} unlocked percent={100} size={46} />
            </span>
          )}
        </span>

        <Link
          href={item.kind === "level" ? "/achievements" : `/achievements?badge=${item.key}`}
          onClick={dismiss}
          className="relative min-w-0 flex-1"
        >
          <p className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.14em] text-flare-400 uppercase">
            {item.kind === "level" ? "Level up" : `${tierLabel(item.tier)} badge earned`}
            {/* An import can land a dozen at once. Saying how many are behind
                this one turns a long queue from "why does this keep happening"
                into something you can watch arrive. */}
            {queued > 0 && (
              <span className="rounded-full bg-flare-600/20 px-1.5 py-0.5 tracking-normal normal-case">
                +{queued} more
              </span>
            )}
          </p>
          <p className="truncate text-sm font-semibold">
            {item.kind === "level" ? `Level ${item.level}` : item.name}
          </p>
          <p className="truncate text-xs text-ink-400">
            {item.kind === "level" ? `Still ${item.rank}. Keep going.` : item.description}
          </p>
        </Link>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="relative grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-500 transition hover:bg-ink-800 hover:text-ink-100"
        >
          <X size={14} />
        </button>

        <span className="unlock-timer" aria-hidden />
      </article>
    </div>
  );
}
