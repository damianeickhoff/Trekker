import {
  CalendarDays,
  Clapperboard,
  Flame,
  Hourglass,
  Layers,
  PieChart,
  RotateCcw,
  ThumbsUp,
  Timer,
  Trophy,
  UserRound,
} from "lucide-react";
import type { FunStats } from "@/lib/fun-stats";
import { formatHours } from "@/lib/format";

/** Cards this panel can be told to leave out, because something else says it better. */
export type FunStatKey = "genre" | "weekday";

/**
 * The "how do you actually watch" panel, shared by both profile pages.
 *
 * `omit` exists because your own profile now draws the genre split and the
 * weekday pattern as charts, and a one-line card repeating either would be the
 * same fact twice on one screen. A friend's profile has neither chart, so it
 * still wants both cards — which is why this is a prop rather than a deletion.
 */
export function FunStatsPanel({
  stats,
  omit = [],
}: {
  stats: FunStats;
  omit?: FunStatKey[];
}) {
  const cards: { icon: React.ReactNode; label: string; value: string; sub?: string }[] = [];

  if (stats.topGenres.length > 0 && !omit.includes("genre")) {
    cards.push({
      icon: <PieChart size={14} />,
      label: "Favourite genre",
      value: stats.topGenres[0].name,
      sub: stats.topGenres
        .slice(1)
        .map((g) => g.name)
        .join(" · "),
    });
  }

  if (stats.busiestWeekday && !omit.includes("weekday")) {
    cards.push({
      icon: <CalendarDays size={14} />,
      label: "Busiest day",
      value: stats.busiestWeekday.label,
      sub: `${formatHours(stats.busiestWeekday.minutes)} watched on ${
        stats.busiestWeekday.label
      }s`,
    });
  }

  if (stats.biggestDay) {
    cards.push({
      icon: <Trophy size={14} />,
      label: "Biggest session",
      value: formatHours(stats.biggestDay.minutes),
      sub: stats.biggestDay.date.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }),
    });
  }

  if (stats.longestStreak > 1) {
    cards.push({
      icon: <Flame size={14} />,
      label: "Longest streak",
      value: `${stats.longestStreak} days`,
      sub: "in a row with something logged",
    });
  }

  if (stats.mostWatchedShow) {
    cards.push({
      icon: <Clapperboard size={14} />,
      label: "Most watched show",
      value: stats.mostWatchedShow.name,
      sub: `${stats.mostWatchedShow.count} episode${
        stats.mostWatchedShow.count === 1 ? "" : "s"
      }`,
    });
  }

  if (stats.mostRewatched) {
    cards.push({
      icon: <RotateCcw size={14} />,
      label: "Most rewatched",
      value: stats.mostRewatched.title,
      sub: `watched ${stats.mostRewatched.count} times`,
    });
  }

  if (stats.topActor) {
    cards.push({
      icon: <UserRound size={14} />,
      label: "Most watched actor",
      value: stats.topActor.name,
      sub: `in ${stats.topActor.count} titles you have watched`,
    });
  }

  if (stats.topFranchise) {
    cards.push({
      icon: <Layers size={14} />,
      label: "Top franchise",
      value: stats.topFranchise.name,
      sub: `${stats.topFranchise.count} films watched`,
    });
  }

  if (stats.oldestMovie) {
    cards.push({
      icon: <Hourglass size={14} />,
      label: "Oldest film",
      value: stats.oldestMovie.title,
      sub: `released in ${stats.oldestMovie.year}`,
    });
  }

  if (stats.averageEpisode) {
    cards.push({
      icon: <Timer size={14} />,
      label: "Average episode",
      value: `${stats.averageEpisode}m`,
      sub: stats.binges > 0 ? `${stats.binges} binge days (4+ episodes)` : undefined,
    });
  }

  /**
   * The thumbs, which until now were stored and never shown anywhere but the
   * season they were given on.
   *
   * Named by show rather than by episode: "the best episode of Breaking Bad" is
   * a thing you would have to pick between six you liked, and this is a stat
   * card, not an argument.
   */
  if (stats.episodeVerdicts) {
    const { liked, disliked, favouriteShow } = stats.episodeVerdicts;

    cards.push({
      icon: <ThumbsUp size={14} />,
      label: "Episodes you rated",
      value: favouriteShow ? favouriteShow.name : `${liked} liked`,
      sub: favouriteShow
        ? `${favouriteShow.liked} episodes you liked · ${liked} liked, ${disliked} not`
        : `${disliked} you did not`,
    });
  }

  if (cards.length === 0) return null;

  return (
    <section className="mt-8">
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        The pattern
      </p>
      <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">Watching habits</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="card p-4 transition hover:border-flare-500/40 hover:bg-ink-800/30"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ink-400 uppercase">
              {card.icon}
              {card.label}
            </p>
            <p className="mt-1.5 truncate text-lg font-semibold tracking-tight" title={card.value}>
              {card.value}
            </p>
            {card.sub && <p className="mt-0.5 line-clamp-1 text-xs text-ink-400">{card.sub}</p>}
          </div>
        ))}
      </div>
    </section>
  );
}
