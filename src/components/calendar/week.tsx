import type { Landing } from "@/lib/calendar";
import { dateParts, relativeDay, shortDay, type Week } from "@/lib/dates";
import { titleHref, titleKey, type Mark } from "@/lib/marks";
import { StatusMark, TickMark } from "../artwork";
import { EmptyState } from "../empty-state";
import { Icon } from "../icon";
import { buttonClass } from "../ui";
import { landingCode, landingDetail, landingMeta } from "../landing-label";
import { Link } from "../link";
import { Poster } from "../poster";
import { ROW_WASH, ZOOM, ZOOM_GROUP } from "../motion";
import { DayStrip } from "./day-strip";
import { dayLayout } from "./day-layout";
import { WeekArrival, WeekSwipe } from "./week-swipe";

/*
 * One week of the calendar. Phones get the strip of seven days with a dot per
 * arrival and, below it, only the days that have something; desktops get seven
 * columns side by side, whose posters shrink as a day fills (`dayLayout`).
 */

function groupByDay(week: Week, items: Landing[]) {
  const days = new Map<string, Landing[]>(week.days.map((d) => [d, []]));
  for (const item of items) days.get(item.date)?.push(item);
  return days;
}

/** On a phone a film is "Film" beside its code; the column says how it arrives. */
const agendaCode = (l: Landing) => (l.mediaType === "movie" ? "Film" : landingCode(l));

export function WeekView({
  week,
  items,
  marks,
  today,
}: {
  week: Week;
  items: Landing[];
  marks: Record<string, Mark>;
  today: string;
}) {
  const days = groupByDay(week, items);
  const busy = [...days.entries()].filter(([, list]) => list.length > 0);

  return (
    // A new week comes in from the side it was travelled to (`WeekArrival`).
    <WeekArrival start={week.start} className="flex flex-col gap-[18px] lg:gap-[22px]">
      <WeekSwipe previous={week.previous} next={week.next} className="flex flex-col gap-[18px] lg:hidden">
        <DayStrip
          today={today}
          days={week.days.map((day) => {
            const count = days.get(day)?.length ?? 0;
            const p = dateParts(day);
            return { day, weekday: p.weekday, date: Number(p.day), count, name: `${p.weekday} ${p.day}, ${count ? `${count} landing` : "nothing landing"}` };
          })}
        />

        {busy.length === 0 ? (
          <QuietWeek next={week.next} />
        ) : (
          busy.map(([day, list]) => (
            <section key={day} id={`day-${day}`} aria-label={shortDay(day)} className="flex scroll-mt-4 flex-col gap-2">
              <div className="flex items-baseline gap-2.5">
                <h2
                  className={`m-0 font-display text-[17px] font-bold tracking-[-0.02em] ${day === today ? "text-accent-text" : "text-ink"}`}
                >
                  {shortDay(day)}
                </h2>
                <span className="mono-label">{relativeDay(day, today)}</span>
              </div>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {list.map((l) => (
                  <li key={l.key}>
                    <AgendaItem item={l} />
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </WeekSwipe>

      {/* Top-aligned, so a busy day does not stretch the quiet ones beside it. */}
      <div className="hidden grid-cols-7 items-start gap-2.5 lg:grid">
        {week.days.map((day) => (
          <DayColumn key={day} day={day} items={days.get(day) ?? []} marks={marks} isToday={day === today} />
        ))}
      </div>
      {busy.length === 0 && (
        <div className="hidden lg:block">
          <QuietWeek next={week.next} />
        </div>
      )}
    </WeekArrival>
  );
}

/** A week with nothing in it, at either width: say so, and offer the next one. */
function QuietWeek({ next }: { next: string }) {
  return (
    <EmptyState
      icon="calendar"
      title="A quiet week"
      action={
        <Link href={`/calendar?w=${next}`} className={buttonClass("ghost", "sm")}>
          Next week
          <Icon name="chevR" size={18} />
        </Link>
      }
    >
      Nothing you watch or saved lands this week. Air dates for your shows and release dates for saved films show up here.
    </EmptyState>
  );
}

function AgendaItem({ item }: { item: Landing }) {
  const meta = landingMeta(item);
  return (
    <Link
      href={titleHref(item.mediaType, item.tmdbId)}
      className={`${ZOOM_GROUP} flex items-center gap-3 rounded-[14px] bg-surface py-2.5 pl-2.5 pr-3 shadow-elevation transition-colors duration-(--fast) ease-out hover:bg-surface-2`}
    >
      <span className="block shrink-0 overflow-hidden rounded-[7px]">
        <Poster path={item.poster} alt="" title={item.title} width={44} height={66} sizes="44px" className={`h-[66px] w-11 ${ZOOM}`} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0 font-mono text-[11px] font-semibold tracking-[0.05em] text-accent-text">
            {agendaCode(item)}
          </span>
          {meta && <span className="truncate text-[11px] text-ink-3">{meta}</span>}
        </span>
        <span className="truncate text-sm font-semibold">{item.title}</span>
        <span className="truncate text-xs text-ink-2">{landingDetail(item)}</span>
      </span>
      <span role="img" aria-label={item.watched ? "Watched" : "Not watched yet"} className="flex">
        <TickMark on={item.watched} size={28} />
      </span>
    </Link>
  );
}

function DayColumn({
  day,
  items,
  marks,
  isToday,
}: {
  day: string;
  items: Landing[];
  marks: Record<string, Mark>;
  isToday: boolean;
}) {
  const p = dateParts(day);
  const layout = dayLayout(items.length);
  return (
    <section
      aria-label={`${p.weekday} ${p.day}`}
      className={`flex min-w-0 flex-col gap-2.5 rounded-2xl p-3 ${isToday ? "bg-surface shadow-elevation" : ""}`}
    >
      <div className="flex items-baseline gap-2">
        <span
          className={`font-display text-[26px] font-bold leading-none tracking-[-0.02em] ${
            isToday ? "rounded-lg bg-accent px-2 py-1 text-black" : ""
          }`}
        >
          {p.day}
        </span>
        <span className="mono-label">{isToday ? "Today" : p.weekday.slice(0, 3)}</span>
      </div>

      {items.length === 0 && <span className="pt-1.5 text-xs text-ink-3">Nothing landing</span>}

      {layout.kind === "poster" &&
        items.slice(0, layout.posters).map((l) => {
          const mark = marks[titleKey(l.mediaType, l.tmdbId)] ?? null;
          return (
            <Link key={l.key} href={titleHref(l.mediaType, l.tmdbId)} className={`${ZOOM_GROUP} flex min-w-0 flex-col gap-2`}>
              <span
                className={`relative block aspect-[2/3] max-w-full overflow-hidden rounded-[10px] shadow-elevation ${layout.className}`}
              >
                <Poster
                  path={l.poster}
                  alt=""
                  title={l.title}
                  width={layout.width}
                  height={Math.round(layout.width * 1.5)}
                  sizes={layout.sizes}
                  className={`size-full ${ZOOM}`}
                />
                {l.watched && (
                  <span role="img" aria-label="Watched" className="absolute right-1.5 top-1.5 flex">
                    <TickMark on onArt size={layout.tick} />
                  </span>
                )}
                {mark && (
                  <span className="absolute bottom-1.5 left-1.5 flex">
                    <StatusMark mark={mark} />
                  </span>
                )}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="font-mono text-[11px] font-semibold tracking-[0.05em] text-accent-text">{landingCode(l)}</span>
                <span className="truncate text-[13px] font-semibold">{l.title}</span>
              </span>
            </Link>
          );
        })}
      {items.slice(layout.kind === "poster" ? layout.posters : 0).map((l) => (
        <Link key={l.key} href={titleHref(l.mediaType, l.tmdbId)} className={`${ZOOM_GROUP} flex min-w-0 items-center gap-2 ${ROW_WASH}`}>
          <span className="block shrink-0 overflow-hidden rounded-[5px]">
            <Poster path={l.poster} alt="" title={l.title} width={36} height={54} sizes="36px" className={`h-[54px] w-9 ${ZOOM}`} />
          </span>
          <span className="flex min-w-0 grow flex-col gap-0.5">
            <span className="font-mono text-[10px] font-semibold tracking-[0.05em] text-accent-text">{landingCode(l)}</span>
            <span className="truncate text-xs font-semibold">{l.title}</span>
          </span>
          {l.watched && (
            <span role="img" aria-label="Watched" className="flex">
              <TickMark on size={16} />
            </span>
          )}
        </Link>
      ))}
    </section>
  );
}
