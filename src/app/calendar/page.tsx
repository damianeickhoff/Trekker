import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Film, Sparkles, Tv } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  addDays,
  getUpcoming,
  isValidDateKey,
  relativeDay,
  startOfWeek,
  todayKey,
  weekDays,
  type CalendarEntry,
  type CalendarKind,
  type CalendarTag,
} from "@/lib/calendar";
import { getUpNext, type UpNext } from "@/lib/continue-watching";
import { img, tmdbConfigured } from "@/lib/tmdb";
import { CalendarWeek } from "@/components/calendar-week";
import { SetupNotice } from "@/components/ui";

export const metadata = { title: "Calendar — Trekker" };

const KIND: Record<CalendarKind, { dot: string; label: string }> = {
  episode: { dot: "bg-flare-500", label: "New episode" },
  premiere: { dot: "bg-ember-400", label: "Premiere" },
  release: { dot: "bg-fresh-500", label: "Film release" },
};

// One chip style everywhere, with the colour carried by the dot rather than the
// whole pill — the same way the audience score reads on a title page.
const TAG: Record<CalendarTag, { label: string; dot: string }> = {
  "series-premiere": { label: "Premiere", dot: "bg-fresh-500" },
  "season-premiere": { label: "Premiere", dot: "bg-fresh-500" },
  "season-finale": { label: "Season finale", dot: "bg-ember-400" },
  finale: { label: "Finale", dot: "bg-red-500" },
};

function fadeDelay(index: number) {
  return { "--fade-delay": `${Math.min(index, 8) * 55}ms` } as React.CSSProperties;
}

function utc(date: string) {
  return new Date(`${date}T00:00:00Z`);
}

function weekLabel(start: string, end: string) {
  const sameMonth = start.slice(0, 7) === end.slice(0, 7);

  const from = utc(start).toLocaleDateString("en-GB", {
    day: "numeric",
    ...(sameMonth ? {} : { month: "short" }),
    timeZone: "UTC",
  });
  const to = utc(end).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

  return `${from} – ${to}`;
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ w?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = todayKey();
  const { w } = await searchParams;
  const weekStart = startOfWeek(isValidDateKey(w) ? w : today);
  const weekEnd = addDays(weekStart, 6);
  const days = weekDays(weekStart);

  const entries = await getUpcoming(user.id, { from: weekStart, to: weekEnd });

  // An empty week is a dead end unless it can point somewhere. One cheap
  // look-ahead — next episode per show only — turns it into a signpost.
  // An empty week is also the moment to mention what is already waiting, so it
  // reads as "here is something to watch" rather than "come back later".
  const [lookahead, behind] =
    entries.length === 0
      ? await Promise.all([
          getUpcoming(user.id, {
            from: addDays(weekEnd, 1),
            to: addDays(weekEnd, 120),
            maxShows: 40,
            episodes: "next",
          }).catch(() => []),
          getUpNext(user.id, 4).catch(() => []),
        ])
      : [[], []];

  const byDate = new Map<string, CalendarEntry[]>();
  for (const entry of entries) {
    const day = byDate.get(entry.date);
    if (day) day.push(entry);
    else byDate.set(entry.date, [entry]);
  }

  return (
    <div className="rise">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Calendar</h1>
      <p className="mt-1 text-sm text-ink-400">
        {entries.length > 0
          ? `${entries.length} thing${
              entries.length === 1 ? "" : "s"
            } landing this week, in the order they arrive.`
          : "Air dates for what you watch, releases from your watchlist."}
      </p>

      {!tmdbConfigured() && (
        <div className="mt-6">
          <SetupNotice />
        </div>
      )}

      <CalendarWeek
        weekStart={weekStart}
        label={weekLabel(weekStart, weekEnd)}
        previous={addDays(weekStart, -7)}
        next={addDays(weekStart, 7)}
        isCurrentWeek={weekStart === startOfWeek(today)}
      >
        {/* Desktop gets a panel so the strip, the timeline's rail and the item
            cards all sit inside a margin instead of against the page edge.
            Mobile keeps the full width it needs. */}
        <div className="mt-4 sm:rounded-2xl sm:border sm:border-ink-800/80 sm:bg-ink-900/30 sm:p-6">
          <WeekStrip days={days} today={today} byDate={byDate} />

          {entries.length === 0 ? (
            <QuietWeek next={lookahead[0]} behind={behind} today={today} />
          ) : (
            <ol className="mt-7">
              {days
                .filter((date) => byDate.has(date))
                .map((date, index, shown) => (
                  <DaySection
                    key={date}
                    date={date}
                    today={today}
                    entries={byDate.get(date)!}
                    index={index}
                    last={index === shown.length - 1}
                  />
                ))}
            </ol>
          )}
        </div>
      </CalendarWeek>
    </div>
  );
}

/**
 * The week at a glance: seven tiles, each carrying a dot per thing landing that
 * day. Deliberately not interactive — everything it summarises is already on
 * the same screen, so a tile that looked tappable would only disappoint. Only
 * today is styled differently.
 */
function WeekStrip({
  days,
  today,
  byDate,
}: {
  days: string[];
  today: string;
  byDate: Map<string, CalendarEntry[]>;
}) {
  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((date, index) => {
        const entries = byDate.get(date) ?? [];
        const isToday = date === today;

        return (
          <div
            key={date}
            className={`fade-in flex flex-col items-center rounded-xl border px-1 py-2 ${
              isToday
                ? "border-flare-500 bg-flare-600/15 text-flare-300"
                : "border-ink-800/70 text-ink-300"
            } ${date < today && !isToday ? "opacity-55" : ""}`}
            style={fadeDelay(index)}
          >
            <span className="text-[10px] font-medium tracking-wider uppercase">
              {utc(date).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}
            </span>
            <span className="mt-0.5 text-lg font-semibold tabular-nums sm:text-xl">
              {utc(date).getUTCDate()}
            </span>
            {/* Fixed-height strip so tiles line up whether or not they have dots. */}
            <span className="mt-1 flex h-1.5 items-center justify-center gap-[3px]">
              {entries.slice(0, 4).map((entry) => (
                <span
                  key={entry.key}
                  className={`h-1.5 w-1.5 rounded-full ${KIND[entry.kind].dot}`}
                />
              ))}
              {entries.length > 4 && (
                <span className="text-[9px] leading-none text-ink-400">+</span>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** One day of the week, as a stop on the timeline. */
function DaySection({
  date,
  today,
  entries,
  index,
  last,
}: {
  date: string;
  today: string;
  entries: CalendarEntry[];
  index: number;
  last: boolean;
}) {
  const isToday = date === today;
  const past = date < today;

  return (
    <li
      className={`fade-in relative pb-7 pl-6 last:pb-0 ${past ? "opacity-70" : ""}`}
      style={fadeDelay(index)}
    >
      {/* Marker and the line that joins it to the next day. The ring is the
          panel colour, so the line appears to pass behind the dot. */}
      <span
        className={`absolute top-1.5 left-0 h-2.5 w-2.5 rounded-full ring-4 ring-ink-950 sm:ring-ink-900 ${
          isToday ? "bg-flare-500" : "bg-ink-600"
        }`}
      />
      {!last && <span className="absolute top-5 bottom-0 left-[4.5px] w-px bg-ink-800" />}

      <p className="text-sm font-semibold tracking-tight">
        {utc(date).toLocaleDateString("en-GB", {
          weekday: "long",
          day: "numeric",
          month: "long",
          timeZone: "UTC",
        })}
        <span className={`ml-2 font-normal ${isToday ? "text-flare-400" : "text-ink-400"}`}>
          {relativeDay(date, today)}
        </span>
      </p>

      <ul className="mt-2.5 space-y-2">
        {entries.map((entry, position) => (
          <EntryRow key={entry.key} entry={entry} position={position} />
        ))}
      </ul>
    </li>
  );
}

function EntryRow({ entry, position }: { entry: CalendarEntry; position: number }) {
  const art = img.backdrop(entry.backdrop, "w780") ?? img.poster(entry.poster, "w500");
  const Icon = entry.mediaType === "tv" ? Tv : Film;

  return (
    <li className="fade-in" style={fadeDelay(position + 1)}>
      <Link
        href={`/title/${entry.mediaType}/${entry.tmdbId}`}
        className="card group flex items-center gap-3 p-2 transition hover:border-flare-500/50"
      >
        <span className="relative aspect-16/9 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-40">
          {art ? (
            <Image
              src={art}
              alt=""
              fill
              sizes="160px"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <span className="grid h-full place-items-center text-ink-600">
              <Icon size={20} />
            </span>
          )}
        </span>

        <span className="min-w-0 flex-1 py-1">
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND[entry.kind].dot}`} />
            <span className="text-[10px] font-medium tracking-wider text-ink-400 uppercase">
              {KIND[entry.kind].label}
            </span>
            {/* A series premiere already says so in its own label. */}
            {entry.tag && entry.kind !== "premiere" && (
              <span className="ml-0.5 inline-flex items-center gap-1.5 rounded-full border border-ink-600/70 bg-ink-900/70 px-2 py-0.5 text-[10px] font-semibold text-ink-200 light:border-ink-600 light:bg-white/80">
                <span className={`h-1.5 w-1.5 rounded-full ${TAG[entry.tag].dot}`} />
                {TAG[entry.tag].label}
              </span>
            )}
          </span>
          <span className="mt-0.5 line-clamp-1 block text-sm font-semibold text-ink-100">
            {entry.title}
          </span>
          <span className="line-clamp-1 block text-xs text-ink-400">{entry.detail}</span>
        </span>

        <ArrowRight
          size={16}
          className="mr-1.5 hidden shrink-0 text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-flare-400 sm:block"
        />
      </Link>
    </li>
  );
}

/** Nothing scheduled: say so with some warmth, and point at whatever is next. */
function QuietWeek({
  next,
  behind,
  today,
}: {
  next?: CalendarEntry;
  behind: UpNext[];
  today: string;
}) {
  const art = next
    ? (img.backdrop(next.backdrop, "w780") ?? img.poster(next.poster, "w500"))
    : null;

  return (
    <>
    <div className="fade-in card mt-6 px-4 py-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-flare-600/30 to-ember-500/20 text-flare-300">
        <Sparkles size={22} />
      </span>
      <h3 className="mt-3 text-base font-semibold">Nothing lands this week</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-400">
        {next
          ? "Enjoy the quiet. Here is the next thing with your name on it."
          : "No air dates and no releases for anything you are tracking. Add something to your watchlist and it will turn up here."}
      </p>

      {next ? (
        <Link
          href={`/calendar?w=${startOfWeek(next.date)}`}
          className="group mx-auto mt-5 flex w-full max-w-sm items-center gap-3 rounded-2xl border border-ink-700/70 bg-ink-900/50 p-2 text-left transition hover:border-flare-500/60"
        >
          <span className="relative aspect-16/9 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800">
            {art && <Image src={art} alt="" fill sizes="112px" className="object-cover" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-1 block text-sm font-medium text-ink-100">
              {next.title}
            </span>
            <span className="mt-0.5 block text-xs text-ink-400">
              {next.detail} · {relativeDay(next.date, today).toLowerCase()}
            </span>
          </span>
          <ArrowRight
            size={16}
            className="mr-1 shrink-0 text-ink-500 transition group-hover:translate-x-0.5 group-hover:text-flare-400"
          />
        </Link>
      ) : (
        <Link
          href="/discover"
          className="mt-5 inline-block rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-flare-500"
        >
          Find something
        </Link>
      )}
    </div>

    {behind.length > 0 && <Behind shows={behind} />}
    </>
  );
}

/**
 * Nothing airing is only bad news if you are up to date. Most people are not,
 * so a quiet week is the best moment to point at the backlog.
 */
function Behind({ shows }: { shows: UpNext[] }) {
  return (
    <section className="fade-in mt-5" style={fadeDelay(1)}>
      <h3 className="text-[11px] font-medium tracking-wider text-ink-500 uppercase">
        Meanwhile, you are behind on
      </h3>

      <ul className="mt-2 space-y-2">
        {shows.map((show, index) => {
          const remaining = Math.max(0, show.totalEpisodes - show.watchedCount);
          const still = show.still ? `https://image.tmdb.org/t/p/w300${show.still}` : null;

          return (
            <li key={show.showId} className="fade-in" style={fadeDelay(index + 2)}>
              <Link
                href={`/title/tv/${show.showId}`}
                className="card group flex items-center gap-3 p-2 transition hover:border-flare-500/50"
              >
                <span className="relative aspect-16/9 w-28 shrink-0 overflow-hidden rounded-lg bg-ink-800 sm:w-40">
                  {still ? (
                    <Image
                      src={still}
                      alt=""
                      fill
                      sizes="160px"
                      className="object-cover transition duration-500 group-hover:scale-105"
                    />
                  ) : (
                    <span className="grid h-full place-items-center text-ink-600">
                      <Tv size={20} />
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1 py-1">
                  <span className="text-[10px] font-medium tracking-wider text-ink-400 uppercase">
                    {remaining > 0
                      ? `${remaining} episode${remaining === 1 ? "" : "s"} waiting`
                      : "Pick it back up"}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-sm font-semibold text-ink-100">
                    {show.showName}
                  </span>
                  <span className="line-clamp-1 block text-xs text-ink-400">
                    Next: {String(show.seasonNumber).padStart(2, "0")}×
                    {String(show.episodeNumber).padStart(2, "0")} · {show.episodeName}
                  </span>
                </span>

                <ArrowRight
                  size={16}
                  className="mr-1.5 hidden shrink-0 text-ink-600 transition group-hover:translate-x-0.5 group-hover:text-flare-400 sm:block"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
