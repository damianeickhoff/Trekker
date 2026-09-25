import { Suspense, type ReactNode } from "react";
import { ACHIEVEMENTS, cabinetFor } from "@/lib/achievements";
import { formatNumber } from "@/lib/levels";
import {
  friendsOf,
  hoursOf,
  profileGenres,
  profileHabits,
  profileHeatmap,
  profileMostWatched,
  profileSeries,
  profileWeekdays,
  RANGE_LABELS,
  recentRatings,
  WEEKDAY_PLURAL,
  weekRecord,
  WEEK_ROWS,
  type ProfileHead,
  type RangeKey,
} from "@/lib/profile";
import { CountScope } from "../count";
import { Link } from "../link";
import { Rail } from "../rail";
import { SectionHead } from "../section-head";
import { Swap } from "../swap";
import { BoneHead } from "../skeleton";
import { HabitsGrid } from "./habits";
import { RecordList } from "./record-list";
import {
  AreaChart,
  Cabinet,
  CabinetBones,
  ChartBones,
  FaceBones,
  FriendFaces,
  GenreBalance,
  HabitBones,
  HeatmapGrid,
  MostWatchedBones,
  MostWatchedList,
  PANEL,
  RangeSwitch,
  RatingBones,
  RatingCard,
  RecordBones,
  RowCard,
  RowCardBones,
  seriesMeta,
  TopFiguresBones,
  WeekBars,
} from "./parts";

/*
 * The profile below the hero, shared by your own and a friend's: the range
 * switch and the big number (tier 1, worked out by the page), then every
 * other section in a boundary of its own. One tree for both widths: on phones
 * the wrappers are `contents` and the sections stack in the mockup's order by
 * `order`; from `lg` the wrappers are the mockup's grids. Each boundary is
 * keyed by the range, so a new range shows its bones rather than the old
 * figures while it is worked out.
 */

/** "Watching since 2003 · 2 friends · 4,005 h watched". */
export function heroLine(head: ProfileHead, lead?: string) {
  return [
    lead,
    head.since ? `Watching since ${head.since}` : "Nothing watched yet",
    `${formatNumber(head.friends)} ${head.friends === 1 ? "friend" : "friends"}`,
    `${formatNumber(hoursOf(head.minutes))} h watched`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function heroLevel(head: ProfileHead) {
  return { ...head.level, lifetime: head.level.lifetime.level };
}

type Body = { userId: string; range: RangeKey; base: string; own: boolean; plays: number };

function Section({ order, className = "", children }: { order: string; className?: string; children: ReactNode }) {
  return <section className={`flex min-w-0 flex-col gap-2.5 lg:order-none lg:gap-3 ${order} ${className}`}>{children}</section>;
}

/** The grids from `lg`; nothing of their own on phones, where their sections join the single column. */
const ROW3 = "contents lg:grid lg:grid-cols-3 lg:gap-6";

export function ProfileBody({ top, ...body }: Body & { top: ReactNode }) {
  const { userId, range, base, own } = body;
  // One CountScope for the visit: the figures count up once, and a new range crosses over to its own (Swap) rather than counting again.
  return (
    <CountScope>
    <div className="flex flex-col gap-[22px] px-5 pt-4 lg:gap-7 lg:px-10 lg:pt-6">
      <div className="order-1 flex items-center gap-6 lg:order-none">
        <RangeSwitch base={base} current={range} />
        <span className="hidden grow lg:block" />
        <span className="mono-label hidden lg:inline">Statistics follow the range</span>
      </div>
      <div className="order-2 lg:order-none">
        <Swap id={range} mode="crossfade">
          {top}
        </Swap>
      </div>

      <Section order="order-3">
        <Suspense key={range} fallback={<><BoneHead /><ChartBones /></>}>
          <TimeSection userId={userId} range={range} />
        </Suspense>
      </Section>

      <div className={`${ROW3} lg:items-stretch`}>
        <Section order="order-4">
          <Suspense key={range} fallback={<RowCardBones />}>
            <WhenSection userId={userId} range={range} />
          </Suspense>
        </Section>
        <Section order="order-5">
          <Suspense key={range} fallback={<RowCardBones />}>
            <WhatSection userId={userId} range={range} />
          </Suspense>
        </Section>
        <Section order="order-6">
          <Suspense fallback={<RowCardBones tall />}>
            <EveryDaySection userId={userId} />
          </Suspense>
        </Section>
      </div>

      <div className={`${ROW3} lg:items-start`}>
        <Section order="order-7" className="lg:col-span-2 lg:gap-3.5">
          <Suspense key={range} fallback={<><BoneHead /><MostWatchedBones /></>}>
            <MostSection userId={userId} range={range} />
          </Suspense>
        </Section>
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-[22px]">
          <Section order="order-9">
            <Suspense fallback={<><BoneHead /><CabinetBones /></>}>
              <CabinetSection userId={userId} own={own} />
            </Suspense>
          </Section>
          {own && (
            <Section order="order-10">
              <Suspense fallback={<><BoneHead /><FaceBones /></>}>
                <FriendsSection userId={userId} />
              </Suspense>
            </Section>
          )}
        </div>
      </div>

      <Section order="order-8" className="lg:gap-3.5">
        <Suspense key={range} fallback={<><BoneHead /><HabitBones /></>}>
          <HabitsSection userId={userId} range={range} />
        </Suspense>
      </Section>

      <Section order="order-11" className="lg:gap-3.5">
        <Suspense fallback={<><BoneHead /><RatingBones /></>}>
          <RatingsSection userId={userId} own={own} />
        </Suspense>
      </Section>

      <Section order="order-12" className="lg:gap-3.5">
        <Suspense fallback={<><BoneHead /><RecordBones /></>}>
          <RecordSection {...body} />
        </Suspense>
      </Section>
    </div>
    </CountScope>
  );
}

/** The page's bones below the hero, box for box with `ProfileBody` and its fallbacks. */
export function ProfileBodyBones({ own = true }: { own?: boolean }) {
  return (
    <div className="flex flex-col gap-[22px] px-5 pt-4 lg:gap-7 lg:px-10 lg:pt-6">
      <div className="h-[42px] w-full rounded-[14px] bg-surface-2 lg:w-[520px]" />
      <TopFiguresBones />
      <Section order="">
        <BoneHead />
        <ChartBones />
      </Section>
      <div className={`${ROW3} lg:items-stretch`}>
        <Section order="">
          <RowCardBones />
        </Section>
        <Section order="">
          <RowCardBones />
        </Section>
        <Section order="">
          <RowCardBones tall />
        </Section>
      </div>
      <div className={`${ROW3} lg:items-start`}>
        <Section order="" className="lg:col-span-2 lg:gap-3.5">
          <BoneHead />
          <MostWatchedBones />
        </Section>
        <div className="hidden lg:flex lg:min-w-0 lg:flex-col lg:gap-[22px]">
          <Section order="">
            <BoneHead />
            <CabinetBones />
          </Section>
          {own && (
            <Section order="">
              <BoneHead />
              <FaceBones />
            </Section>
          )}
        </div>
      </div>
      <Section order="" className="lg:gap-3.5">
        <BoneHead />
        <HabitBones />
      </Section>
    </div>
  );
}

async function TimeSection({ userId, range }: { userId: string; range: RangeKey }) {
  const series = await profileSeries(userId, range);
  return (
    <>
      {/* The peak in the line from `lg`; a phone has room for the span alone, as the mockup has it. */}
      <div className="lg:hidden">
        <SectionHead title="Your time" meta={RANGE_LABELS[range].toLowerCase()} />
      </div>
      <div className="hidden lg:block">
        <SectionHead title="Your time" meta={seriesMeta(series)} />
      </div>
      <div className={`px-4 pb-3 pt-4 lg:px-6 lg:pb-4 lg:pt-6 ${PANEL}`}>
        <AreaChart series={series} />
      </div>
    </>
  );
}

async function WhenSection({ userId, range }: { userId: string; range: RangeKey }) {
  const weekdays = await profileWeekdays(userId, range);
  return (
    <RowCard title="When you watch" meta={weekdays.top === null ? undefined : `${WEEKDAY_PLURAL[weekdays.top]} · ${weekdays.share}%`}>
      <WeekBars weekdays={weekdays} />
    </RowCard>
  );
}

async function WhatSection({ userId, range }: { userId: string; range: RangeKey }) {
  return (
    <RowCard title="What you watch">
      <GenreBalance genres={await profileGenres(userId, range)} />
    </RowCard>
  );
}

async function EveryDaySection({ userId }: { userId: string }) {
  return (
    <RowCard title="Every day" meta="last 6 months">
      <HeatmapGrid heat={await profileHeatmap(userId)} />
    </RowCard>
  );
}

async function MostSection({ userId, range }: { userId: string; range: RangeKey }) {
  const rows = await profileMostWatched(userId, range);
  return (
    <>
      <SectionHead title="Most watched" meta={`on repeat · ${RANGE_LABELS[range].toLowerCase()}`} />
      <MostWatchedList rows={rows} />
    </>
  );
}

async function HabitsSection({ userId, range }: { userId: string; range: RangeKey }) {
  const habits = await profileHabits(userId, range);
  return (
    <>
      <SectionHead title="Watching habits" />
      <HabitsGrid habits={habits} />
    </>
  );
}

async function CabinetSection({ userId, own }: { userId: string; own: boolean }) {
  const badges = await cabinetFor(userId);
  return (
    <>
      <SectionHead title="Trophy cabinet" meta={`${badges.length} of ${ACHIEVEMENTS.length}`} href={own ? "/badges" : undefined} />
      <span className="lg:hidden">
        <Cabinet badges={badges} max={7} size={40} />
      </span>
      <span className="hidden lg:block">
        <Cabinet badges={badges} max={own ? 8 : 16} size={44} />
      </span>
    </>
  );
}

async function FriendsSection({ userId }: { userId: string }) {
  const friends = await friendsOf(userId);
  return (
    <>
      <SectionHead title="Friends" meta={String(friends.length)} href="/friends" />
      <FriendFaces friends={friends} />
    </>
  );
}

async function RatingsSection({ userId, own }: { userId: string; own: boolean }) {
  const { count, rows } = await recentRatings(userId);
  return (
    <>
      <SectionHead title="Ratings and reviews" meta={`${formatNumber(count)} rated`} href={own && count > 0 ? "/profile/ratings" : undefined} />
      {rows.length ? (
        <Rail label="Ratings and reviews" className="gap-2.5! lg:gap-3!">
          {rows.map((r) => (
            <RatingCard key={`${r.mediaType}-${r.tmdbId}`} row={r} />
          ))}
        </Rail>
      ) : (
        <p className="m-0 text-[13px] text-ink-2">Nothing rated yet. The popcorn is on every title page.</p>
      )}
    </>
  );
}

/**
 * This week's viewings: the first `WEEK_ROWS`, and up to twice as many again
 * in the page for "Show more" to add in place (`RecordList`); past those,
 * the whole history is its own page.
 */
async function RecordSection({ userId, own, plays }: Body) {
  const { rows, more } = await weekRecord(userId, undefined, WEEK_ROWS * 3);
  const history =
    own && (rows.length > 0 || plays > 0) ? (
      <Link href="/history" className="self-center text-[13px] font-semibold text-ink-2 transition-colors duration-(--fast) ease-out hover:text-ink">
        {more ? "Show more" : "The whole history"} · {formatNumber(plays)} {plays === 1 ? "viewing" : "viewings"} ›
      </Link>
    ) : null;
  return (
    <>
      <SectionHead title="Everything you watched" meta="this week" href={own ? "/history" : undefined} />
      {rows.length ? (
        <RecordList rows={rows} step={WEEK_ROWS} after={history} />
      ) : (
        <>
          <p className="m-0 text-[13px] text-ink-2">Nothing yet this week.</p>
          {history}
        </>
      )}
    </>
  );
}
