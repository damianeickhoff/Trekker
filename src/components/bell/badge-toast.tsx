"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/levels";
import type { NewestBadge } from "@/lib/notifications";
import { Medal } from "../badges/medal";
import { Link } from "../link";
import { EXIT, usePresence } from "../presence";
import { useBell } from "./bell-provider";

/**
 * "Badge earned", over whatever page is open, when the newest badge in the
 * bell's answer is newer than the last one this browser announced. It never
 * asks the server anything itself: the bell has already fetched the answer,
 * on navigation, on return to the tab and once a minute.
 *
 * What has been announced is kept in this browser, not on the account: seeing
 * a badge celebrated on the phone and again on the laptop is right, whereas a
 * shared mark would let whichever device looked first swallow it for the
 * other. The first sighting on a browser only writes the mark down, since
 * celebrating a badge from last month the moment the app opens would be a lie.
 */

const KEY = "trekker:badge-announced";
const LIFE_MS = 8000;

function readMark(): number | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === null ? null : Number(raw);
  } catch {
    return null;
  }
}

function writeMark(at: number) {
  try {
    window.localStorage.setItem(KEY, String(at));
  } catch {
    // Storage refused: no celebrations in this browser, and nothing breaks.
  }
}

export function BadgeToast() {
  const { data } = useBell();
  const [shown, setShown] = useState<NewestBadge | null>(null);
  const badge = data?.newestBadge ?? null;

  useEffect(() => {
    if (!badge) return;
    const at = Date.parse(badge.at);
    const mark = readMark();
    writeMark(Math.max(at, mark ?? 0));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the mark lives in storage, which only an effect may read
    if (mark !== null && at > mark) setShown(badge);
  }, [badge]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), LIFE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  // The badge it showed, kept while it leaves the way it came.
  const { mounted, state } = usePresence(shown !== null, EXIT.base);
  const [kept, setKept] = useState<NewestBadge | null>(shown);
  if (shown && shown !== kept) setKept(shown);
  const badgeShown = shown ?? kept;

  if (!mounted || !badgeShown) return null;
  const me = data?.me;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-3.5 z-(--z-toast) flex justify-center lg:inset-x-auto lg:bottom-8 lg:right-8 lg:top-auto">
      <div
        role="status"
        data-state={state}
        className="motion-toast pointer-events-auto relative flex w-full max-w-[440px] items-center gap-3.5 overflow-hidden rounded-[18px] bg-night px-4 py-3.5 text-white shadow-[0_20px_60px_rgba(0,0,0,0.5)] lg:w-[440px]"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: "radial-gradient(circle at 12% 50%, rgba(242,178,51,0.35), transparent 45%)" }}
        />
        <Medal tier={badgeShown.tier} icon={badgeShown.icon} size={52} ring="#0b0c10" className="relative" />
        <span className="relative flex min-w-0 grow flex-col gap-[3px]">
          <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-accent">
            Badge earned{badgeShown.xp ? ` · +${formatNumber(badgeShown.xp)} XP` : ""}
          </span>
          <span className="font-display text-[17px] font-bold tracking-[-0.02em]">{badgeShown.name}</span>
          <span className="text-xs text-white/70">
            {badgeShown.description}
            {me && !me.maxed ? ` Level ${me.level + 1} is ${formatNumber(me.toNextLevel)} XP away.` : ""}
          </span>
        </span>
        <Link href="/badges" onClick={() => setShown(null)} className="relative whitespace-nowrap text-[13px] font-semibold text-accent">
          See it
        </Link>
      </div>
    </div>
  );
}
