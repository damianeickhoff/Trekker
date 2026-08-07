import { CalendarCheck, Clock, Layers, Star, Tv } from "lucide-react";
import { relativeDay, todayKey } from "@/lib/calendar";
import { formatWatched } from "@/lib/dates";

/**
 * The show progress card, in three moods.
 *
 * A progress bar only says something useful while there is ground left to
 * cover. Once someone is caught up the bar is permanently full and tells them
 * nothing, so it is replaced by the answer to the question they actually have:
 * is there more coming, or was that the end?
 */
export function ShowProgress({
  showName,
  ended,
  seasonToCome,
  airedEpisodes,
  unaired,
  watchedCount,
  seasonCount,
  runtime,
  score,
  nextAirDate,
  lastWatchedAt,
  nextUp,
}: {
  showName: string;
  /** Ended or cancelled — nothing further is coming. */
  ended: boolean;
  /**
   * A whole further season is pending. False while the current season is still
   * airing week to week: that is ordinary progress, not a cliffhanger.
   */
  seasonToCome: boolean;
  airedEpisodes: number;
  unaired: number;
  watchedCount: number;
  seasonCount: number;
  /** Minutes per episode. */
  runtime: number;
  /** Audience score as a percentage. */
  score: number;
  nextAirDate: string | null;
  /** When the viewer last logged an episode of this show. */
  lastWatchedAt: Date | null;
  nextUp: { season: number; episode: number } | null;
}) {
  const hours = Math.round((watchedCount * runtime) / 60);
  const caughtUp = airedEpisodes > 0 && watchedCount >= airedEpisodes;

  const lastSeen = lastWatchedAt ? (
    <p className="ios-dim mt-3 flex items-center gap-1.5 text-xs text-ink-400">
      <CalendarCheck size={13} />
      Last episode watched {formatWatched(lastWatchedAt)}
    </p>
  ) : null;

  const stats = (
    <StatChips
      hours={hours}
      episodes={watchedCount}
      seasons={seasonCount}
      score={score}
      unaired={caughtUp && seasonToCome ? unaired : 0}
    />
  );

  if (caughtUp && ended) {
    return (
      <Verdict
        heading="That’s it, folks 🎉"
        tone="finished"
        stats={stats}
        footer={lastSeen}
        lines={[
          `Every last one of ${airedEpisodes} episode${
            airedEpisodes === 1 ? "" : "s"
          } across ${seasonCount} season${
            seasonCount === 1 ? "" : "s"
          } — ${showName} is done, and so are you.`,
          verdictOnScore(score),
          hoursLine(hours, true),
        ]}
      />
    );
  }

  if (caughtUp && seasonToCome) {
    return (
      <Verdict
        heading="More to come 👀"
        tone="waiting"
        stats={stats}
        footer={lastSeen}
        lines={[
          `Don’t be sad — this isn’t the end. You are level with all ${airedEpisodes} released episode${
            airedEpisodes === 1 ? "" : "s"
          } across ${seasonCount} season${
            seasonCount === 1 ? "" : "s"
          }, and ${showName} has another one coming.`,
          nextSeasonLine(nextAirDate),
          `${hours} hour${
            hours === 1 ? "" : "s"
          } in and counting. Enjoy the free evenings while they last 😏`,
        ]}
      />
    );
  }

  /**
   * Measured against every episode there is, not only the ones out so far.
   *
   * Against aired episodes alone the bar hits 100% while a season is still
   * running, which reads as "finished" when the honest answer is "up to date" —
   * and then retreats from full the week after, which is worse.
   */
  const total = airedEpisodes + unaired;
  const progress = total ? (watchedCount / total) * 100 : 0;

  return (
    <div className="card mt-5 p-4">
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium">
          {watchedCount} of {airedEpisodes} released episode
          {airedEpisodes === 1 ? "" : "s"}
          {unaired > 0 && (
            <span className="ios-dim ml-1.5 font-normal text-ink-400">· {unaired} still to air</span>
          )}
        </span>
        <span className="ios-dim font-mono text-ink-400 tabular-nums">{Math.round(progress)}%</span>
      </div>

      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800 max-sm:bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400 transition-[width] duration-700 max-sm:bg-white max-sm:bg-none"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>

      <p className="ios-dim mt-2 flex items-center gap-1.5 text-xs text-ink-400">
        <Clock size={12} />
        {hours}h spent on this show
        {nextUp && (
          <>
            {" · next up "}
            <span className="font-mono ios-bright text-flare-400">
              S{String(nextUp.season).padStart(2, "0")}E
              {String(nextUp.episode).padStart(2, "0")}
            </span>
          </>
        )}
      </p>

      {lastSeen}
    </div>
  );
}

function Verdict({
  heading,
  tone,
  lines,
  stats,
  footer,
}: {
  heading: string;
  tone: "finished" | "waiting";
  lines: string[];
  stats: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section
      className={`card mt-5 overflow-hidden p-5 sm:p-6 max-sm:bg-none ${
        tone === "finished"
          ? "bg-gradient-to-br from-ember-500/18 via-transparent to-flare-600/12"
          : "bg-gradient-to-br from-flare-600/18 via-transparent to-fresh-500/10"
      }`}
    >
      <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{heading}</h2>

      <div className="mt-2 max-w-2xl space-y-1.5 text-sm leading-relaxed text-ink-300">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>

      {stats}
      {footer}
    </section>
  );
}

function StatChips({
  hours,
  episodes,
  seasons,
  score,
  unaired,
}: {
  hours: number;
  episodes: number;
  seasons: number;
  score: number;
  unaired: number;
}) {
  const chips = [
    { icon: <Clock size={13} />, label: "Watched", value: `${hours.toLocaleString("en-GB")}h` },
    { icon: <Tv size={13} />, label: "Episodes", value: episodes.toLocaleString("en-GB") },
    { icon: <Layers size={13} />, label: "Seasons", value: String(seasons) },
    ...(score ? [{ icon: <Star size={13} />, label: "Audience", value: `${score}%` }] : []),
    ...(unaired > 0
      ? [{ icon: <Tv size={13} />, label: "Still to air", value: String(unaired) }]
      : []),
  ];

  return (
    <dl
      className="mt-5 grid gap-2"
      style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}
    >
      {chips.map((chip) => (
        <div
          key={chip.label}
          className="ios-surface min-w-0 rounded-xl border border-ink-700/70 bg-ink-900/50 px-2.5 py-2 max-sm:border-white/15"
        >
          <dt className="ios-dim flex items-center gap-1 text-[10px] font-medium tracking-wide text-ink-400 uppercase">
            {chip.icon}
            <span className="truncate">{chip.label}</span>
          </dt>
          <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums sm:text-base">
            {chip.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The crowd's verdict, read back with the appropriate amount of sympathy. */
function verdictOnScore(score: number) {
  if (!score) return "Nobody has rated it enough to say much — you got there first.";
  if (score >= 80) return `The crowd settled on ${score}%, so you picked a genuinely great one.`;
  if (score >= 70) return `At ${score}% the internet agrees it was worth the hours.`;
  if (score >= 50)
    return `The crowd only managed ${score}%, which means you saw something they missed.`;
  return `${score}% from everyone else. You finished it anyway — that is commitment.`;
}

function nextSeasonLine(nextAirDate: string | null) {
  if (!nextAirDate) {
    return "No date announced yet, but nobody has called it done either. Sit tight.";
  }

  const when = relativeDay(nextAirDate, todayKey()).toLowerCase();
  return `It starts back up ${when}, so keep the evening free.`;
}

function hoursLine(hours: number, finished: boolean) {
  const days = hours / 24;
  const spent =
    days >= 1
      ? `${hours.toLocaleString("en-GB")} hours — ${days.toFixed(1)} solid days`
      : `${hours} hour${hours === 1 ? "" : "s"}`;

  return finished
    ? `That is ${spent} of your life, and there is no getting it back. Worth it, obviously.`
    : `That is ${spent} so far.`;
}
