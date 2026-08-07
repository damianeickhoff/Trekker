import {
  Award,
  Boxes,
  CheckCheck,
  Film,
  Gauge,
  PenLine,
  Target,
  Tv,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { LevelState } from "@/lib/achievements";
import { MAX_LEVEL, formatXp } from "@/lib/levels";

const ICONS: Record<string, LucideIcon> = {
  award: Award,
  boxes: Boxes,
  "check-check": CheckCheck,
  film: Film,
  gauge: Gauge,
  "pen-line": PenLine,
  target: Target,
  tv: Tv,
};

/**
 * Where the XP came from, on the achievements page.
 *
 * Every row is what was earned **here**, not over a lifetime: episodes and films
 * logged on Trekker rather than imported, badges earned rather than carried in,
 * shows finished since the starting line. That is what the bar above is made of,
 * and a breakdown that did not add up to it would be worse than none.
 *
 * The whole point is that it adds up in public: every row says how many of a
 * thing and what each was worth, so a level is never a number the app just
 * decided on. Rows worth nothing yet stay in the list — they are the answer to
 * "what else counts?".
 */
export function LevelPanel({ level }: { level: LevelState }) {
  const biggest = Math.max(1, ...level.sources.map((source) => source.xp));

  return (
    <section className="mt-8">
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        Experience
      </p>
      <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">
        Level {level.level} · {level.rank}
      </h2>

      <div className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
          <p className="text-sm text-ink-300">
            {level.maxed ? (
              <>Level {MAX_LEVEL} is the top of the ladder.</>
            ) : (
              <>
                <span className="font-semibold text-ink-100">
                  {formatXp(level.toNextLevel)}
                </span>{" "}
                to level {level.level + 1}
                {level.next && (
                  <>
                    , and {level.next.title} at level {level.next.level}
                  </>
                )}
                .
              </>
            )}
          </p>
          <p className="font-mono text-xs text-ink-400 tabular-nums">
            {level.intoLevel.toLocaleString("en-GB")} /{" "}
            {level.levelSpan.toLocaleString("en-GB")} this level
          </p>
        </div>

        <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
            style={{ width: `${Math.max(2, level.percent)}%` }}
          />
        </div>

        <ul className="mt-5 divide-y divide-ink-800">
          {level.sources.map((source) => {
            const Icon = ICONS[source.icon] ?? Zap;
            const share = (source.xp / biggest) * 100;

            return (
              <li key={source.key} className="flex items-center gap-3 py-2.5">
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                    source.xp > 0
                      ? "bg-flare-600/15 text-flare-400"
                      : "bg-ink-800/60 text-ink-600"
                  }`}
                >
                  <Icon size={15} />
                </span>

                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-sm ${
                      source.xp > 0 ? "text-ink-100" : "text-ink-400"
                    }`}
                  >
                    {source.label}
                  </p>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-800">
                    <div
                      className="h-full rounded-full bg-flare-500/70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                </div>

                <span className="shrink-0 text-right">
                  <span className="block font-mono text-sm font-semibold tabular-nums">
                    {source.xp.toLocaleString("en-GB")}
                  </span>
                  <span className="block font-mono text-[10px] text-ink-500 tabular-nums">
                    {source.detail}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-3 space-y-1.5 border-t border-ink-800 pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Earned on Trekker</span>
            <span className="font-mono text-lg font-bold text-flare-400 tabular-nums">
              {formatXp(level.xp)}
            </span>
          </div>

          {level.carriedXp > 0 && (
            <p className="pt-1 text-xs text-ink-500">
              A further {formatXp(level.carriedXp)} came in with your imported history —
              counted towards your lifetime level of {level.lifetime.level} (
              {level.lifetime.rank}), but not towards this one. Everything above is what you
              have watched, rated and won here.
            </p>
          )}
        </div>

        {level.syncedAt === null && (
          <p className="mt-3 text-[11px] text-ink-500">
            Shows finished and franchises completed are worked out on this page — they will
            count from your next visit.
          </p>
        )}
      </div>
    </section>
  );
}
