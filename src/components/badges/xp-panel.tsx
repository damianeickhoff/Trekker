"use client";

import { useState, useTransition } from "react";
import type { XpSource } from "@/lib/achievements/xp";
import { setXpPanelCollapsed } from "@/lib/badges-actions";
import { BADGE_XP, formatNumber } from "@/lib/levels";
import { Icon } from "../icon";
import { foldChevron, PRESS } from "../motion";
import { Unfold } from "../unfold";

/**
 * Where the XP came from, under the level card. Every row is what was earned
 * here, not over a lifetime: episodes and films logged on Trekker rather than
 * imported, badges earned rather than carried in, shows finished since the
 * starting line. That is what the level is made of, and a breakdown that did
 * not add up to it would be worse than none, so each row says how many and
 * what each was worth. Rows worth nothing yet stay: they answer "what else
 * counts?".
 *
 * The breakdown is reasoning behind the level rather than the level itself, so
 * it folds away; the choice is saved on the account, like Home's challenges,
 * and the panel changes at once without waiting for the save.
 */
export function XpPanel({
  sources,
  xp,
  lifetime,
  collapsed: initial,
}: {
  sources: XpSource[];
  xp: number;
  lifetime: { xp: number; level: number; rank: string };
  collapsed: boolean;
}) {
  const [collapsed, setCollapsed] = useState(initial);
  const [, startTransition] = useTransition();

  function toggle() {
    const next = !collapsed;
    setCollapsed(next);
    startTransition(() => setXpPanelCollapsed(next));
  }

  const carried = Math.max(0, lifetime.xp - xp);

  return (
    <section aria-label="Where the XP comes from" className="rounded-2xl bg-surface shadow-elevation">
      <h2 className="m-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="xp-breakdown"
          className={`${PRESS} flex h-11 w-full items-center gap-2.5 border-0 bg-transparent px-3.5 text-left text-ink`}
        >
          <Icon name="gauge" size={16} className="text-ink-2" />
          <span className="min-w-0 truncate text-[13px] font-semibold">Where the XP comes from</span>
          <span className="grow" />
          <Icon name="chevR" size={16} className={`text-ink-3 ${foldChevron(!collapsed)}`} />
        </button>
      </h2>
      <Unfold open={!collapsed} id="xp-breakdown">
        <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-0.5">
          <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
            {sources.map((s) => (
              <li key={s.key} className="flex h-[34px] items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={`truncate text-[13px] ${s.xp > 0 ? "font-semibold" : "text-ink-3"}`}>{s.label}</span>
                  <span className="truncate font-mono text-[10px] tracking-[0.03em] text-ink-3">{detail(s)}</span>
                </span>
                <span className={`shrink-0 font-mono text-[13px] font-semibold ${s.xp > 0 ? "" : "text-ink-3"}`}>
                  {formatNumber(s.xp)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-1 flex flex-col gap-1.5 border-t border-line pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-semibold">Earned on Trekker</span>
              <span className="font-mono text-[15px] font-bold text-accent-text">{formatNumber(xp)} XP</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] text-ink-2">Lifetime</span>
              <span className="font-mono text-xs font-medium text-ink-2">
                {formatNumber(lifetime.xp)} XP · LVL {lifetime.level}
              </span>
            </div>
            <p className="m-0 text-[11px] leading-snug text-ink-3">
              {carried > 0
                ? `The ${formatNumber(carried)} XP an imported history brought counts towards the lifetime level of ${lifetime.level} (${lifetime.rank}), never this one.`
                : "Your whole history, imports included. Everything so far was done here, so the two agree."}
            </p>
          </div>
        </div>
      </Unfold>
    </section>
  );
}

/** "828 × 12", or for the sources whose worth varies, what decides it. */
function detail(s: XpSource) {
  const n = formatNumber(s.count);
  if (s.rate !== null) return `${n} × ${formatNumber(s.rate)}`;
  if (s.key === "badges") return `${n} · ${formatNumber(Math.min(...BADGE_WORTH))} to ${formatNumber(Math.max(...BADGE_WORTH))} by tier`;
  return `${n} won · what each paid`;
}

const BADGE_WORTH = Object.values(BADGE_XP);
