import { barWidth } from "@/lib/format";
import { formatXp, type LevelProgress } from "@/lib/levels";

/**
 * The level on a profile card: the number, the rank it carries, and how far
 * through the current level the XP has got.
 *
 * The bar is always the *Trekker* level — what has been earned here, starting
 * from zero. What a carried-in history was worth rides along as a note after the
 * rank rather than as a second bar: it is context for the number, not another
 * thing to fill in.
 *
 * Sized in two: full on your own profile, where there is room to say how much is
 * left, and a tighter version for a friend's card.
 */
export function LevelBar({
  level,
  compact = false,
}: {
  level: LevelProgress & {
    next?: { title: string; level: number } | null;
    lifetime?: { level: number; rank: string; xp: number };
  };
  compact?: boolean;
}) {
  // Only worth saying when the two differ — on an account with nothing carried
  // in they are the same number, and printing it twice explains nothing.
  const lifetime =
    level.lifetime && level.lifetime.level > level.level ? level.lifetime : null;
  return (
    <div className={compact ? "" : "mt-3"}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="inline-flex items-baseline gap-1.5 rounded-lg border border-flare-500/40 bg-flare-600/15 px-2 py-0.5">
          <span className="text-[10px] font-medium tracking-wider text-flare-300 uppercase light:text-flare-600">
            Lv
          </span>
          <span className="font-mono text-sm font-bold text-flare-300 tabular-nums light:text-flare-600">
            {level.level}
          </span>
        </span>

        <span className="text-sm font-semibold tracking-tight">{level.rank}</span>

        {lifetime && (
          <span
            className="text-[11px] text-ink-400"
            title={`Everything on record, imported history included: ${formatXp(
              lifetime.xp,
            )} — level ${lifetime.level}, ${lifetime.rank}`}
          >
            lifetime {lifetime.level}
          </span>
        )}

        <span className="ml-auto font-mono text-[11px] text-ink-400 tabular-nums">
          {level.maxed
            ? formatXp(level.xp)
            : `${level.intoLevel.toLocaleString("en-GB")} / ${level.levelSpan.toLocaleString(
                "en-GB",
              )}`}
        </span>
      </div>

      {/* The floor is there so that one episode into a level shows *something*
          rather than rounding down to an empty bar. It has to stop short of
          zero, though: an account that has earned nothing was being drawn with
          a sliver of progress it had not made, which is the one number on this
          bar that has to be honest. */}
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
          style={{ width: `${barWidth(level.percent)}%` }}
        />
      </div>

      {!compact && (
        <p className="mt-1 text-[11px] text-ink-400">
          {level.maxed ? (
            <>Top of the ladder — {formatXp(level.xp)} earned.</>
          ) : (
            <>
              {formatXp(level.toNextLevel)} to level {level.level + 1}
              {level.next ? ` · ${level.next.title} at ${level.next.level}` : ""} ·{" "}
              {formatXp(level.xp)} in total
            </>
          )}
        </p>
      )}
    </div>
  );
}
