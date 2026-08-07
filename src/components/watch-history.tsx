import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Film, Tv } from "lucide-react";
import { img } from "@/lib/images";
import { formatHours } from "@/lib/format";
import type { HistoryDay, HistoryPlay } from "@/lib/profile";

/**
 * Everything watched, newest first.
 *
 * Built in the calendar's visual language on purpose — a dot on a rail per day,
 * cards hanging off it — because it is the same kind of thing read in the other
 * direction. The calendar is what is coming; this is what happened. Anyone who
 * has used one should not have to learn the other.
 *
 * The pieces are exported separately so the profile's one-week slice and the
 * full history page can share them without either owning the other.
 */

export function fadeDelay(index: number) {
  return { "--fade-delay": `${Math.min(index, 8) * 55}ms` } as React.CSSProperties;
}

function dayLabel(date: Date) {
  const today = new Date();
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(date, today)) return "Today";
  if (same(date, yesterday)) return "Yesterday";
  return null;
}

/** The panel the timeline sits in — a margin on desktop, full width on a phone. */
export function TimelinePanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="sm:rounded-2xl sm:border sm:border-ink-800/80 sm:bg-ink-900/30 sm:p-6">
      {children}
    </div>
  );
}

export function DayTimeline({ days, last = true }: { days: HistoryDay[]; last?: boolean }) {
  return (
    <ol>
      {days.map((day, index) => (
        <DaySection
          key={day.key}
          day={day}
          index={index}
          last={last && index === days.length - 1}
        />
      ))}
    </ol>
  );
}

function DaySection({ day, index, last }: { day: HistoryDay; index: number; last: boolean }) {
  const relative = dayLabel(day.date);

  return (
    <li className="fade-in relative pb-7 pl-6 last:pb-0" style={fadeDelay(index)}>
      {/* Marker and the line joining it to the next day. The ring is the panel
          colour, so the line appears to pass behind the dot. */}
      <span
        className={`absolute top-1.5 left-0 h-2.5 w-2.5 rounded-full ring-4 ring-ink-950 sm:ring-ink-900 ${
          relative ? "bg-flare-500" : "bg-ink-600"
        }`}
      />
      {!last && <span className="absolute top-5 bottom-0 left-[4.5px] w-px bg-ink-800" />}

      <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold tracking-tight">
        {day.date.toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
        {relative && <span className="font-normal text-flare-400">{relative}</span>}
        <span className="font-mono text-xs font-normal text-ink-500">
          {formatHours(day.minutes)}
        </span>
      </p>

      <ul className="mt-2.5 space-y-2">
        {day.plays.map((play, position) => (
          <PlayRow key={play.id} play={play} position={position} />
        ))}
      </ul>
    </li>
  );
}

function PlayRow({ play, position }: { play: HistoryPlay; position: number }) {
  const poster = img.poster(play.poster, "w185");
  const Icon = play.mediaType === "tv" ? Tv : Film;

  return (
    <li className="fade-in" style={fadeDelay(position + 1)}>
      <Link
        href={`/title/${play.mediaType}/${play.tmdbId}`}
        className="card group flex items-center gap-3 p-2 transition hover:border-flare-500/50"
      >
        {/* A poster rather than the calendar's wide still: the play log stores
            poster paths and nothing else, and a 16:9 crop of a 2:3 image is
            somebody's chin. */}
        <span className="relative h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-ink-800">
          {poster ? (
            <Image
              src={poster}
              alt=""
              fill
              sizes="44px"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="grid h-full place-items-center text-ink-600">
              <Icon size={18} />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1 py-1">
          <span className="flex items-center gap-1.5">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                play.mediaType === "tv" ? "bg-flare-500" : "bg-ember-400"
              }`}
            />
            <span className="text-[10px] font-medium tracking-wider text-ink-400 uppercase">
              {play.mediaType === "tv" ? "Episode" : "Film"}
            </span>
            <span className="font-mono text-[10px] text-ink-500">
              {play.watchedAt.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-1 block text-sm font-semibold text-ink-100">
            {play.title}
          </span>
          {/* A film has no season and episode to say, so on a phone the runtime
              stands in. On desktop it has its own column and saying it twice
              would only be noise. */}
          <span className={`line-clamp-1 block text-xs text-ink-400 ${play.detail ? "" : "sm:hidden"}`}>
            {play.detail ?? `${play.runtime} min`}
          </span>
        </span>

        {/*
          A wide row put the title against the left edge and the arrow against
          the right with half a screen of nothing between them. The runtime is
          the one fact that belongs at the far end — it is the row's measure —
          and on an episode it was not shown anywhere at all, because the third
          line spends itself on the episode number and name. It stays off a
          phone, where there is no gap to fill and no room to fill it.
        */}
        <span className="ios-dim hidden shrink-0 font-mono text-xs text-ink-500 sm:block">
          {play.runtime} min
        </span>

        <ArrowRight
          size={16}
          className="mr-1.5 hidden shrink-0 text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-flare-400 sm:block"
        />
      </Link>
    </li>
  );
}

/** This week's slice, as it appears on the profile. */
export function WeekHistory({ days, total }: { days: HistoryDay[]; total: number }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            The record
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Everything you watched</h2>
        </div>
        <span className="font-mono text-xs text-ink-400">
          {total.toLocaleString("en-GB")} viewing{total === 1 ? "" : "s"} all told
        </span>
      </div>

      <TimelinePanel>
        {days.length === 0 ? (
          <p className="py-6 text-sm text-ink-400">Nothing logged this week yet.</p>
        ) : (
          <DayTimeline days={days} />
        )}

        <div className="mt-6 border-t border-ink-800 pt-5 text-center">
          <Link
            href="/history"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/50 px-4 py-2.5 text-sm text-ink-200 transition hover:border-flare-500 hover:bg-ink-800"
          >
            Show more
            <ArrowRight size={15} />
          </Link>
          <p className="mt-2 text-xs text-ink-500">This week only — the rest is on its own page.</p>
        </div>
      </TimelinePanel>
    </section>
  );
}
