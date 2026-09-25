import { formatNumber } from "@/lib/levels";
import { FILL, fillTo } from "./motion";

/**
 * "Level 14 · Rookie" and "2,340 XP to 15" over the amber bar: the profile
 * hero's line and the sidebar's, from the same numbers. On a hero it is white;
 * the track is a translucent grey that reads on either.
 */
export function LevelLine({
  level,
  rank,
  toNextLevel,
  percent,
  maxed,
  onHero = false,
}: {
  level: number;
  rank: string;
  toNextLevel: number;
  percent: number;
  maxed: boolean;
  onHero?: boolean;
}) {
  return (
    <span className="flex w-full flex-col gap-1.5">
      <span className={`flex justify-between gap-3 text-xs ${onHero ? "text-white/78" : "text-ink-2"}`}>
        <span>
          <strong className={onHero ? "text-white" : "text-ink"}>Level {level}</strong> · {rank}
        </span>
        <span>{maxed ? "Top level" : `${formatNumber(toNextLevel)} XP to ${level + 1}`}</span>
      </span>
      <span
        role="progressbar"
        aria-label={`Level ${level}, ${percent}% of the way to ${level + 1}`}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="block h-1.5 overflow-hidden rounded-full bg-[rgba(128,128,128,0.35)]"
      >
        <span className={FILL} style={fillTo(percent)} />
      </span>
    </span>
  );
}
