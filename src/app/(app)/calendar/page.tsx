
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { WideTile } from "@/components/artwork";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { BacklogBones, ComingUpBones, WeekBones } from "@/components/calendar-skeleton";
import { BacklogTile } from "@/components/calendar/backlog";
import { WeekView } from "@/components/calendar/week";
import { landingCode } from "@/components/landing-label";
import { Link } from "@/components/link";
import { PRESS } from "@/components/motion";
import { MobileTop, PhoneAccount } from "@/components/page";
import { Rail } from "@/components/rail";
import { SectionHead } from "@/components/section-head";
import { buttonClass, IconLink, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getAgenda, getComingUp } from "@/lib/calendar";
import { dateParts, landingWhen, resolveWeek, todayKey, type Week } from "@/lib/dates";
import { marksFor } from "@/lib/home";
import { titleKey } from "@/lib/marks";
import { episodesLeft, getBacklog } from "@/lib/waiting";

export const metadata: Metadata = { title: "Calendar" };

/**
 * The calendar: a schedule of what is coming, never a diary of what was
 * watched. `?w=` names any day of the week to show. The header is drawn at
 * once from the date alone; the week and Coming up stream from rows, each in
 * its own boundary, keyed by the week so moving weeks shows the bones again
 * rather than last week's days under this week's heading. Under them the
 * backlog: a quiet week is the best moment to point at what is already out.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ w?: string | string[] }> }) {
  const { w } = await searchParams;
  const today = todayKey();
  const week = resolveWeek(w, today);
  const href = (start: string) => `/calendar?w=${start}`;

  return (
    <>
      <MobileTop
        title="Calendar"
        right={
          <>
            <IconLink href={href(week.previous)} icon="chevL" label="Previous week" />
            <IconLink href={href(week.next)} icon="chevR" label="Next week" />
            <PhoneAccount />
          </>
        }
      />
      <div className="flex flex-col gap-[18px] px-5 pt-2.5 lg:gap-[22px] lg:px-10 lg:pt-7">
        <div className="flex items-baseline justify-between lg:hidden">
          <span className="mono-label">{week.range}</span>
          {week.offset === 0 ? (
            <span className="text-xs font-semibold text-ink-3">{week.title}</span>
          ) : (
            <Link href="/calendar" className="text-xs font-semibold text-ink-2">
              This week
            </Link>
          )}
        </div>
        <div className="hidden items-center gap-4 lg:flex">
          <PageTitle>{week.title}</PageTitle>
          <span className="mono-label text-xs">{week.range}</span>
          <span className="grow" />
          <Link
            href="/calendar"
            aria-current={week.offset === 0 ? "date" : undefined}
            className={`${PRESS} inline-flex h-[38px] items-center rounded-full bg-surface px-[18px] text-sm font-semibold text-ink shadow-elevation hover:bg-surface-2`}
          >
            Today
          </Link>
          <IconLink href={href(week.previous)} icon="chevL" label="Previous week" />
          <IconLink href={href(week.next)} icon="chevR" label="Next week" />
        </div>

        <Suspense key={`week-${week.start}`} fallback={<WeekBones />}>
          <WeekTier week={week} today={today} />
        </Suspense>
        <Suspense key={`coming-${week.start}`} fallback={<ComingUpBones />}>
          <ComingUpTier week={week} today={today} />
        </Suspense>
        {/* Not keyed by the week: the backlog is today's, whichever week is shown. */}
        <Suspense fallback={<BacklogBones />}>
          <BacklogTier today={today} />
        </Suspense>
      </div>
    </>
  );
}

async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

async function WeekTier({ week, today }: { week: Week; today: string }) {
  const user = await requireUser();
  const items = await getAgenda(user.id, week.start, week.end);
  const marks = await marksFor(items);
  return <WeekView week={week} items={items} marks={marks} today={today} />;
}

async function ComingUpTier({ week, today }: { week: Week; today: string }) {
  const user = await requireUser();
  const items = await getComingUp(user.id, week.end, today);
  if (items.length === 0) return null;
  const marks = await marksFor(items);
  const first = dateParts(items[0].date).month;
  const last = dateParts(items[items.length - 1].date).month;

  return (
    <section aria-labelledby="coming-up" className="flex flex-col gap-3 pt-1 lg:gap-3.5">
      <SectionHead id="coming-up" title="Coming up" meta={first === last ? first : `${first} – ${last}`} />
      <Rail label="Coming up">
        {items.map((l) => (
          <WideTile
            key={l.key}
            item={l}
            when={landingWhen(l.date, today)}
            code={landingCode(l)}
            mark={marks[titleKey(l.mediaType, l.tmdbId)] ?? null}
            className="h-[132px] w-[236px] lg:h-[134px] lg:w-[240px]"
            sizes="(min-width: 64rem) 240px, 236px"
          />
        ))}
      </Rail>
    </section>
  );
}

/**
 * Aired and unseen, as on `/waiting`: one rail of posters, the most recently
 * aired first, in the calendar's own language rather than Still to watch's
 * rows. Stop watching takes a show off, since Up next leaves dropped shows out.
 */
async function BacklogTier({ today }: { today: string }) {
  const user = await requireUser();
  const { rows, total } = await getBacklog(user.id, today);
  return (
    <section aria-labelledby="backlog" className="flex flex-col gap-3 pt-1 lg:gap-3.5">
      {rows.length === 0 ? (
        <>
          <SectionHead id="backlog" title="Backlog" meta="none" />
          <EmptyState
            icon="check"
            title="Nothing in the backlog"
            action={
              <Link href="/discover" className={buttonClass("ghost", "sm")}>
                <Icon name="compass" size={18} />
                Browse Discover
              </Link>
            }
          >
            Every aired episode of what you watch is seen. New ones land here the week they air.
          </EmptyState>
        </>
      ) : (
        <>
          <SectionHead id="backlog" title="Backlog" meta={`${total} ${total === 1 ? "show" : "shows"}`} href="/waiting" />
          <Rail label="Backlog">
            {rows.map((row) => (
              <BacklogTile key={row.showId} row={row} left={episodesLeft(row)} />
            ))}
          </Rail>
        </>
      )}
    </section>
  );
}
