import Image from "next/image";
import type { BadgeState } from "@/lib/achievements";
import { formatNumber } from "@/lib/levels";
import type { Group } from "@/lib/achievements/catalogue";
import { DrawOnView } from "../draw";
import { Bone, BoneHead } from "../skeleton";
import { FILL, fillTo } from "../motion";

/*
 * The badges page's pieces: the level card, the badge count, one badge row
 * (the board's and Closest to earning's), and their bones.
 */

export type LevelCardData = {
  level: number;
  rank: string;
  xp: number;
  toNextLevel: number;
  percent: number;
  maxed: boolean;
  /** A poster to light the card with: the last thing watched. */
  art: string | null;
};

/**
 * The level, dark in both themes like a hero: the last thing watched, blurred,
 * behind a scrim, the level in an amber disc, the rank, and the bar. `big` is
 * the desktop column's. The badge count has its own card under it, so the one
 * bar here is the level's.
 */
export function LevelCard({ data, big = false }: { data: LevelCardData; big?: boolean }) {
  const line = [
    `${formatNumber(data.xp)} XP`,
    data.maxed ? "top level" : `${formatNumber(data.toNextLevel)} to Level ${data.level + 1}`,
  ].join(" · ");
  return (
    <div
      className={`relative flex items-center gap-[18px] overflow-hidden rounded-[20px] bg-night text-white ${big ? "p-[22px]" : "p-[18px]"}`}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {data.art && (
          <Image
            unoptimized
            src={`https://image.tmdb.org/t/p/w154/${data.art.replace(/^\//, "")}`}
            alt=""
            width={154}
            height={231}
            className="absolute -left-[12%] -top-[12%] h-[124%] w-[124%] max-w-none object-cover object-[center_30%] opacity-90 blur-[44px] saturate-150"
          />
        )}
        <span className="absolute inset-0 bg-linear-to-r from-black/55 to-black/75" />
      </span>
      <span
        className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-display font-extrabold text-black ${
          big ? "size-[72px] text-[30px]" : "size-[60px] text-[26px]"
        }`}
        aria-label={`Level ${data.level}`}
      >
        {data.level}
      </span>
      <span className="relative flex min-w-0 grow flex-col gap-1.5">
        <span className={`font-display font-bold tracking-[-0.02em] ${big ? "text-2xl" : "text-xl"}`}>{data.rank}</span>
        <span className="text-xs text-white/80">{line}</span>
        {/* The bar fills from nothing the first time it is seen (`draw-fill`). */}
        <DrawOnView as="span" className="block h-1.5 overflow-hidden rounded-full bg-white/25">
          <span className={`${FILL} draw-fill`} style={fillTo(data.percent)} />
        </DrawOnView>
      </span>
    </div>
  );
}

/** How much of the catalogue is earned: a card and bar of its own, apart from the level's. */
export function AchievementsCard({ earned, total }: { earned: number; total: number }) {
  const percent = total > 0 ? Math.floor((earned / total) * 100) : 0;
  return (
    <section aria-label="Badges earned" className="flex flex-col gap-2.5 rounded-2xl bg-surface p-4 shadow-elevation">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-semibold">
          {earned} of {total} earned
          <span className="font-normal text-ink-3"> · </span>
          <span className="font-mono text-xs font-medium text-accent-text">{percent}%</span>
        </span>
        <span className="mono-label">Badges</span>
      </div>
      <DrawOnView
        as="span"
        role="progressbar"
        aria-label="Badges earned"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={earned}
        className="block h-1.5 overflow-hidden rounded-full bg-surface-2"
      >
        <span className={`${FILL} draw-fill`} style={fillTo(percent)} />
      </DrawOnView>
    </section>
  );
}

/**
 * A legendary tile's hairline edge, gold into amber, the same gradient as its
 * medal's ring. The surface is translucent in dark, so the usual padding-box
 * trick would show the gradient through the whole tile; a masked overlay draws
 * the edge alone. Unearned it is fainter: a hint of what the tile will be.
 */
const LEGEND_EDGE =
  "relative before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:p-px before:bg-[linear-gradient(135deg,var(--color-gold),var(--accent)_55%,var(--color-gold))] before:[mask:linear-gradient(#000_0_0)_content-box_exclude,linear-gradient(#000_0_0)]";

export function legendEdge(badge: Pick<BadgeState, "tier" | "earned">) {
  if (badge.tier !== "legend") return "";
  return badge.earned ? LEGEND_EDGE : `${LEGEND_EDGE} before:opacity-45`;
}

export function BadgeRowBone() {
  return (
    <div className="flex items-center gap-3.5 rounded-2xl bg-surface p-3.5">
      <Bone className="size-[58px] rounded-full" />
      <div className="flex grow flex-col gap-1.5">
        <Bone className="h-3.5 w-2/3 rounded" />
        <Bone className="h-2.5 w-full rounded" />
        <Bone className="h-2.5 w-20 rounded" />
      </div>
    </div>
  );
}

/** The rows of a group: one column on phones, two from `sm`, three on a wide desktop. */
export const BADGE_GRID = "grid gap-2.5 sm:grid-cols-2 lg:gap-3 2xl:grid-cols-3";

/** Tailwind needs whole class names, so the chip bones' widths are spelled out. */
const CHIP_BONES = ["w-16", "w-[104px]", "w-20", "w-px", "w-20", "w-[72px]", "w-16", "w-24"];

/** Closest to earning, the search box and the filter chips, box for box. */
export function ControlsBones() {
  return (
    <>
      <section className="flex flex-col gap-2.5 lg:gap-3">
        <BoneHead />
        <div className="grid gap-2.5 lg:grid-cols-3 lg:gap-3">
          {[0, 1, 2].map((i) => (
            <BadgeRowBone key={i} />
          ))}
        </div>
      </section>
      <div className="flex flex-col gap-2.5">
        <Bone className="h-11 rounded-full" />
        <div className="-mx-5 flex gap-2 overflow-hidden px-5 lg:mx-0 lg:px-0">
          {CHIP_BONES.map((w, i) => (
            <Bone key={i} className={`h-[34px] rounded-full ${w}`} />
          ))}
        </div>
      </div>
    </>
  );
}

/** The board's bones, box for box: the controls, then the heads and a row of tiles per group. */
export function BoardBones({ groups }: { groups: readonly Group[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-5 lg:gap-[22px]">
      <ControlsBones />
      {groups.slice(0, 3).map((g) => (
        <section key={g} className="flex flex-col gap-2.5 lg:gap-3">
          <BoneHead />
          <div className={BADGE_GRID}>
            {[0, 1, 2, 3].map((i) => (
              <BadgeRowBone key={i} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/** The XP breakdown's bones: the head, and the rows open, as the panel is by default. */
export function XpPanelBones() {
  return (
    <div className="flex flex-col rounded-2xl bg-surface">
      <div className="flex h-11 items-center px-3.5">
        <Bone className="h-3.5 w-44 rounded" />
      </div>
      <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-0.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex h-[34px] items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <Bone className="h-3 w-28 rounded" />
              <Bone className="h-2 w-16 rounded" />
            </div>
            <Bone className="h-3 w-10 rounded" />
          </div>
        ))}
        <Bone className="mt-1 h-[72px] rounded-lg" />
      </div>
    </div>
  );
}
