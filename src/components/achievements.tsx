"use client";

import Link from "next/link";
import type { AchievementState, Badge } from "@/lib/achievements";
import { BadgeMedal, formatUnlocked, tierLabel } from "./achievement-badge";
import { useOpenBadge } from "./achievement-wall";

/**
 * One achievement. Earned ones state when; the rest carry the bar, the count
 * and — where the measure can say something useful — which year or which
 * franchise is closest.
 */
export function AchievementCard({ item }: { item: AchievementState }) {
  const { setOpen } = useOpenBadge();

  return (
    <button
      type="button"
      onClick={() => setOpen(item.id)}
      // `items-center` keeps the medal on the card's own centre line rather than
      // hanging off the top, which is what made it look adrift on the cards tall
      // enough to carry a progress bar.
      className={`card flex w-full items-center gap-3.5 p-4 text-left transition ${
        item.unlocked
          ? "border-flare-500/30 bg-gradient-to-br from-flare-600/10 to-transparent hover:border-flare-500/60"
          : "hover:border-flare-500/30 hover:bg-ink-800/30"
      }`}
    >
      <BadgeMedal
        icon={item.icon}
        tier={item.tier}
        unlocked={item.unlocked}
        percent={item.percent}
      />

      {/*
        A column stretched to the card's full height, with the status pinned to
        the bottom of it. Grid rows are all as tall as their tallest card, so a
        card with less in it used to simply end early and leave a gap; now every
        card's last line sits on the same baseline as its neighbours' and the
        spare height goes between the description and the status instead.
      */}
      <div className="flex min-w-0 flex-1 flex-col self-stretch">
        <div className="flex items-baseline justify-between gap-2">
          <p className={`truncate text-sm font-semibold ${item.unlocked ? "" : "text-ink-300"}`}>
            {item.name}
          </p>
          <span className="shrink-0 font-mono text-[10px] tracking-wider text-ink-500 uppercase">
            {tierLabel(item.tier)}
          </span>
        </div>

        <p className="mt-0.5 line-clamp-2 text-xs text-ink-400">{item.description}</p>

        {item.unlocked ? (
          <p className="mt-auto pt-2 text-xs font-medium text-flare-400">
            Earned{item.unlockedAt ? ` ${formatUnlocked(item.unlockedAt)}` : ""}
          </p>
        ) : (
          <div className="mt-auto pt-2">
            {!item.binary && (
              <div className="h-1.5 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
                  style={{ width: `${Math.max(2, item.percent)}%` }}
                />
              </div>
            )}
            <p
              className={`flex items-baseline justify-between gap-2 text-[11px] text-ink-500 ${
                item.binary ? "" : "mt-1.5"
              }`}
            >
              <span className="truncate">{item.detail ?? item.description}</span>
              <span className="shrink-0 font-mono tabular-nums">
                {item.binary ? item.label : `${item.label} · ${item.percent}%`}
              </span>
            </p>
          </div>
        )}
      </div>
    </button>
  );
}

export function AchievementGroup({
  category,
  items,
  tally,
}: {
  category: string;
  items: AchievementState[];
  /**
   * The category's real score, when `items` is a filtered view of it. Without
   * this a "in progress" view would head every category with "0 / 5", which
   * reads as having earned none of them rather than as a filter being on.
   */
  tally?: { earned: number; total: number };
}) {
  const earned = tally?.earned ?? items.filter((i) => i.unlocked).length;
  const total = tally?.total ?? items.length;

  // Earned first, then whatever is closest — the wall reads as "here is what
  // you have, and here is what is nearly yours".
  const ordered = [...items].sort((a, b) => {
    if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
    return b.percent - a.percent;
  });

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{category}</h2>
        <span className="font-mono text-xs text-ink-400 tabular-nums">
          {earned} / {total}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map((item) => (
          <AchievementCard key={item.id} item={item} />
        ))}
      </div>
    </section>
  );
}

/**
 * The row of earned badges for a profile page. Deliberately shows nothing about
 * what is still locked: someone else's profile is a display case, not a
 * to-do list.
 */
export function BadgeShelf({
  badges,
  total,
  href,
  title = "Achievements",
  emptyBody,
}: {
  badges: Badge[];
  total: number;
  /** Where "See all" goes, when the viewer is allowed to see all. */
  href?: string;
  title?: string;
  emptyBody?: string;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            The trophy cabinet
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">
            {title}
            <span className="ml-2 font-mono text-sm font-normal text-ink-400 tabular-nums">
              {badges.length} / {total}
            </span>
          </h2>
        </div>
        {href && (
          <Link href={href} className="text-sm text-flare-400 hover:text-flare-500">
            See all
          </Link>
        )}
      </div>

      {badges.length === 0 ? (
        <div className="card px-5 py-8 text-center">
          <p className="text-sm text-ink-400">
            {emptyBody ?? "No badges yet."}{" "}
            {href && (
              <Link href={href} className="text-flare-400 hover:text-flare-500">
                See what is on offer
              </Link>
            )}
          </p>
        </div>
      ) : (
        // A grid rather than a wrapping flex row: fixed-width items leave
        // whatever does not divide evenly as dead space at the end of each row,
        // which read as the cabinet being off-centre. These stretch to fill the
        // width instead, so the gaps are equal and there is nothing left over.
        <div className="card grid grid-cols-[repeat(auto-fit,minmax(88px,1fr))] gap-4 p-5">
          {badges.map((badge) => {
            const label = `${badge.name} — ${badge.description} (earned ${formatUnlocked(
              badge.unlockedAt,
            )})`;
            const inside = (
              <>
                <BadgeMedal icon={badge.icon} tier={badge.tier} unlocked percent={100} size={56} />
                <span className="line-clamp-2 text-[11px] leading-tight text-ink-300">
                  {badge.name}
                </span>
              </>
            );

            // Only the viewer's own cabinet links through. The detail page shows
            // *your* films and episodes, so offering it from someone else's
            // profile would answer a question nobody asked.
            return href ? (
              <Link
                key={badge.id}
                href={`/achievements?badge=${badge.id}`}
                title={label}
                className="flex flex-col items-center gap-1.5 text-center transition hover:opacity-80"
              >
                {inside}
              </Link>
            ) : (
              <span
                key={badge.id}
                title={label}
                className="flex flex-col items-center gap-1.5 text-center"
              >
                {inside}
              </span>
            );
          })}
        </div>
      )}
    </section>
  );
}
