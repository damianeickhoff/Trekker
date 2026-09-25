import type { CSSProperties, ReactNode } from "react";
import type { CabinetBadge } from "@/lib/achievements";
import type { Person } from "@/lib/friends";
import { formatNumber } from "@/lib/levels";
import { titleHref } from "@/lib/marks";
import { BUCKET_NAMES } from "@/lib/popcorn";
import {
  formatSpan,
  hoursOf,
  RANGE_KEYS,
  RANGE_LABELS,
  type GenreShare,
  type Heatmap,
  type MostWatched,
  type RangeKey,
  type RatedRow,
  type Series,
  type Totals,
  type Weekdays,
} from "@/lib/profile";
import { whenLabel } from "@/lib/when";
import { Medal, TIER_NAME } from "../badges/medal";
import { Link } from "../link";
import { Count } from "../count";
import { DrawOnView } from "../draw";
import { HANDED_OVER, PRESS, ROW_WASH, ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { SegmentPill } from "../segment-pill";
import { Bucket } from "../popcorn";
import { Poster } from "../poster";
import { Bone } from "../skeleton";
import { ArtChip } from "../ui";
import { UserAvatar } from "../user-avatar";
export { RecordRowCard, recordLine } from "./record-row";

/*
 * The profile's pieces, from the approved mockup (`profile3*` in the round 5
 * generator), each drawn from what `lib/profile.ts` works out and each with
 * its bones beside it, box for box, for the streamed boundaries and the
 * route's skeleton alike.
 */

/** The panel every chart sits in: the surface, 18px round, lifted in light. */
export const PANEL = "rounded-[18px] bg-surface shadow-elevation";

// ---------------------------------------------------------------------------
// The range switch

/**
 * This month, This year, Last year, All time, kept in `?range=`. Links rather
 * than buttons so it works before any script, replacing the address so a few
 * taps do not pile up in history, and holding the scroll where it is. The
 * chosen fill is one pill that slides to the range pressed (`SegmentPill`),
 * at once, before the new figures are back.
 */
export function RangeSwitch({ base, current }: { base: string; current: RangeKey }) {
  return (
    <nav aria-label="Range" className="relative flex w-full rounded-[14px] bg-surface-2 p-[3px] lg:w-[520px]">
      <SegmentPill className="rounded-[11px] bg-primary" />
      {RANGE_KEYS.map((key) => (
        <Link
          key={key}
          href={key === "all" ? base : `${base}?range=${key}`}
          replace
          scroll={false}
          aria-current={key === current ? "page" : undefined}
          data-segment=""
          data-on={key === current ? "" : undefined}
          className={`${PRESS} relative flex h-9 flex-1 items-center justify-center whitespace-nowrap rounded-[11px] text-[13px] font-semibold text-ink-2 hover:text-ink data-on:bg-primary data-on:text-on-primary ${HANDED_OVER}`}
        >
          {RANGE_LABELS[key]}
        </Link>
      ))}
    </nav>
  );
}

// ---------------------------------------------------------------------------
// The big number and the four cards

export function BigNumber({ totals, range }: { totals: Totals; range: RangeKey }) {
  const viewings = totals.episodes + totals.filmViewings;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="mono-label">Time watched · {RANGE_LABELS[range].toLowerCase()}</span>
      <span className="font-display text-5xl font-extrabold leading-[0.95] tracking-[-0.045em] lg:text-[64px]">
        <SpanCount minutes={totals.totalMinutes} id="total" />
      </span>
      <span className="text-[13px] text-ink-2">
        <Count to={hoursOf(totals.totalMinutes)} once="hours" /> h · <Count to={viewings} once="viewings" /> {viewings === 1 ? "viewing" : "viewings"} across{" "}
        <Count to={totals.distinctFilms} once="films" /> {totals.distinctFilms === 1 ? "film" : "films"} and <Count to={totals.distinctShows} once="shows" />{" "}
        {totals.distinctShows === 1 ? "show" : "shows"}
      </span>
    </div>
  );
}

/**
 * `formatSpan`'s words with the leading figure counting up on first view,
 * once per visit (`Count once`): "12d 4h" counts its days.
 */
function SpanCount({ minutes, id }: { minutes: number; id: string }) {
  const m = Math.round(minutes);
  if (m < 60) return <><Count to={m} once={`${id}-m`} />m</>;
  if (m < 24 * 60) return <><Count to={Math.floor(m / 60)} once={`${id}-h`} />h {m % 60}m</>;
  const hours = Math.round(m / 60);
  return <><Count to={Math.floor(hours / 24)} once={`${id}-d`} />d {hours % 24}h</>;
}

function StatCard({ value, label, sub }: { value: ReactNode; label: string; sub: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-2xl bg-surface px-4 py-3.5 shadow-elevation">
      <span className="font-mono text-[10px] font-medium uppercase tracking-[0.05em] text-ink-3">{label}</span>
      <span className="truncate font-display text-[26px] font-extrabold leading-none tracking-[-0.03em]">{value}</span>
      <span className="truncate text-[11px] text-ink-3">{sub}</span>
    </div>
  );
}

export function StatCards({ totals }: { totals: Totals }) {
  const films =
    totals.filmViewings === totals.distinctFilms
      ? `${formatNumber(totals.distinctFilms)} ${totals.distinctFilms === 1 ? "film" : "films"}`
      : `${formatNumber(totals.filmViewings)} viewings · ${formatNumber(totals.distinctFilms)} different`;
  const streak = totals.longestStreak;
  return (
    <div className="grid grid-cols-2 gap-2 lg:gap-3">
      <StatCard value={formatSpan(totals.recent.minutes)} label={totals.recent.label} sub={totals.recent.sub} />
      <StatCard value={<SpanCount minutes={totals.tvMinutes} id="tv" />} label="TV time" sub={<><Count to={totals.episodes} once="episodes" /> {totals.episodes === 1 ? "episode" : "episodes"}</>} />
      <StatCard value={<SpanCount minutes={totals.filmMinutes} id="film" />} label="Film time" sub={films} />
      <StatCard
        value={`${formatNumber(streak)} ${streak === 1 ? "day" : "days"}`}
        label="Longest streak"
        sub={totals.currentStreak === null ? "best run" : `best run, ${formatNumber(totals.currentStreak)} now`}
      />
    </div>
  );
}

/** The big number's panel and the four cards: side by side from `lg`, stacked on phones. */
export function TopFigures({ totals, range }: { totals: Totals; range: RangeKey }) {
  return (
    <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-2 lg:gap-6">
      <div className="lg:flex lg:items-center lg:rounded-[18px] lg:bg-surface lg:p-6 lg:shadow-elevation">
        <BigNumber totals={totals} range={range} />
      </div>
      <StatCards totals={totals} />
    </div>
  );
}

export function TopFiguresBones() {
  return (
    <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-2 lg:gap-6">
      <div className="flex flex-col gap-2 lg:justify-center lg:rounded-[18px] lg:bg-surface lg:p-6">
        <Bone className="h-3 w-40 rounded" />
        <Bone className="h-12 w-56 rounded-lg lg:h-16 lg:w-72" />
        <Bone className="h-3 w-4/5 rounded" />
      </div>
      <div className="grid grid-cols-2 gap-2 lg:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[86px] rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Your time: the area chart

const UNIT_WORD = { day: "day", month: "month", year: "year" } as const;

/** "hours per year · peak 607 h in 2018", the section head's line. */
export function seriesMeta(series: Series) {
  const peak = series.points.reduce((best, p) => (p.minutes > best.minutes ? p : best), series.points[0]);
  const per = `hours per ${UNIT_WORD[series.unit]}`;
  return peak && peak.minutes > 0 ? `${per} · peak ${formatNumber(hoursOf(peak.minutes))} h in ${peak.long}` : per;
}

/**
 * Hours per bucket as a smooth amber line on a faint fill, the peak dotted
 * and labelled, the present bucket a hollow dot while it is still filling.
 * The path is drawn in a stretched 1000×100 box, so it fills any width with
 * no script, while the stroke keeps its weight (`non-scaling-stroke`) and the
 * dots and words are HTML placed by percentage, so they never stretch.
 */
export function AreaChart({ series }: { series: Series }) {
  const pts = series.points;
  const max = Math.max(1, ...pts.map((p) => p.minutes));
  const x = (i: number) => (pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100);
  const y = (m: number) => (1 - m / max) * 100;
  let d = `M${x(0) * 10},${y(pts[0]?.minutes ?? 0)}`;
  for (let i = 1; i < pts.length; i++) {
    const x0 = x(i - 1) * 10;
    const x1 = x(i) * 10;
    const cx = (x0 + x1) / 2;
    d += ` C${cx},${y(pts[i - 1].minutes)} ${cx},${y(pts[i].minutes)} ${x1},${y(pts[i].minutes)}`;
  }
  const area = `${d} L${x(pts.length - 1) * 10},100 L${x(0) * 10},100 Z`;
  const peak = pts.reduce((best, p, i) => (p.minutes > pts[best].minutes ? i : best), 0);
  const step = Math.max(1, Math.ceil((pts.length - 1) / 8));
  const last = pts.length - 1;

  return (
    // On first view the line draws from left to right and the fill fades in behind it (draw-wipe, draw-fade).
    <DrawOnView
      role="img"
      aria-label={`Hours watched per ${UNIT_WORD[series.unit]}: ${pts.map((p) => `${p.long} ${hoursOf(p.minutes)}`).join(", ")}`}
      className="relative h-[150px] lg:h-[200px]"
    >
      <div className="absolute inset-x-2 bottom-6 top-[22px]">
        <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true" className="draw-fade absolute inset-0 size-full overflow-visible [--delay:120ms]">
          <path d={area} className="fill-accent opacity-14" />
        </svg>
        <span aria-hidden="true" className="draw-wipe absolute inset-0">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
            <path
              d={d}
              fill="none"
              strokeWidth={2.5}
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              className="stroke-accent"
            />
          </svg>
        </span>
        {pts[peak] && pts[peak].minutes > 0 && (
          <>
            <span
              aria-hidden="true"
              className="draw-fade absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent [--delay:250ms]"
              style={{ left: `${x(peak)}%`, top: `${y(pts[peak].minutes)}%` }}
            />
            <span
              aria-hidden="true"
              className="draw-fade absolute -translate-x-1/2 whitespace-nowrap font-mono text-[10px] text-ink-2 [--delay:250ms]"
              style={{ left: `clamp(40px, ${x(peak)}%, calc(100% - 40px))`, top: `calc(${y(pts[peak].minutes)}% - 22px)` }}
            >
              {formatNumber(hoursOf(pts[peak].minutes))} h · {pts[peak].long}
            </span>
          </>
        )}
        {series.live && last !== peak && (
          <span
            aria-hidden="true"
            className="draw-fade absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent bg-bg [--delay:250ms]"
            style={{ left: `${x(last)}%`, top: `${y(pts[last].minutes)}%` }}
          />
        )}
      </div>
      <div aria-hidden="true" className="absolute inset-x-2 bottom-0 h-4">
        {pts.map((p, i) =>
          i % step === 0 ? (
            <span
              key={p.key}
              className={`absolute font-mono text-[10px] text-ink-3 ${i === 0 ? "" : i === last ? "-translate-x-full" : "-translate-x-1/2"}`}
              style={{ left: `${x(i)}%` }}
            >
              {p.label}
            </span>
          ) : null,
        )}
      </div>
    </DrawOnView>
  );
}

export function ChartBones() {
  return <Bone className="h-[182px] rounded-[18px] lg:h-[240px]" />;
}

// ---------------------------------------------------------------------------
// When you watch, what you watch, every day

/** Seven bars, minutes per weekday, the busiest amber. */
export function WeekBars({ weekdays }: { weekdays: Weekdays }) {
  const max = Math.max(1, ...weekdays.days.map((d) => d.minutes));
  return (
    // The bars grow from their baseline on first view, 30ms apart (draw-rise).
    <DrawOnView
      role="img"
      aria-label={`Hours by weekday, Monday first: ${weekdays.days.map((d) => hoursOf(d.minutes)).join(", ")}`}
      className="flex h-[84px] items-end gap-1.5 lg:h-24"
    >
      {weekdays.days.map((d, i) => {
        const top = i === weekdays.top;
        return (
          <span key={d.label} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
            <span
              className={`draw-rise block w-full rounded-t-md rounded-b-[3px] ${top ? "bg-accent" : "bg-surface-2"}`}
              style={{ height: `calc((100% - 18px) * ${d.minutes / max})`, minHeight: d.minutes ? 3 : 0, "--i": i } as CSSProperties}
            />
            <span className={`font-mono text-[10px] ${top ? "font-semibold text-accent-text" : "font-medium text-ink-3"}`}>{d.label}</span>
          </span>
        );
      })}
    </DrawOnView>
  );
}

/**
 * The genre balance's five shades, amber down to umber, from the mockup. Data
 * colours rather than theme tokens: they rank five things, and a rank should
 * read the same in either theme.
 */
const GENRE_SHADES = ["#F2B233", "#C98A2A", "#9A6D2F", "#6E5537", "#4E4238"];

export function GenreBalance({ genres }: { genres: GenreShare[] }) {
  if (genres.length === 0) {
    return <p className="m-0 text-[13px] text-ink-2">Genres fill in as the titles you have watched are described.</p>;
  }
  return (
    <div className="flex flex-col gap-2.5">
      {/* Each segment grows from nothing on first view, 30ms after the one before (draw-grow). */}
      <DrawOnView role="img" aria-label={genres.map((g) => `${g.name} ${g.share}%`).join(", ")} className="flex h-2.5 gap-0.5 overflow-hidden rounded-[5px]">
        {genres.map((g, i) => (
          <span key={g.name} className="draw-grow" style={{ width: `${g.share}%`, background: GENRE_SHADES[i], "--i": i } as CSSProperties} />
        ))}
      </DrawOnView>
      <div className="flex flex-wrap gap-x-3 gap-y-1.5">
        {genres.map((g, i) => (
          <span key={g.name} className="inline-flex items-center gap-1.5 text-xs text-ink-2">
            <span className="size-2 rounded-full" style={{ background: GENRE_SHADES[i] }} />
            {g.name}
            <span className="font-mono text-ink-3">{g.share}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

const HEAT_OPACITY = ["", "opacity-28", "opacity-50", "opacity-75", "opacity-100"];
const MONTH_LETTER = "JFMAMJJASOND";

/**
 * Half a year of days in one strip, weeks across and Monday first down. The
 * card held a year in two bands before; the owner preferred one strip, and
 * twenty-six weeks across a third of the column keeps the cells the size they
 * were. The month letters stand over the week a month starts in.
 */
export function HeatmapGrid({ heat }: { heat: Heatmap }) {
  const cols = heat.weeks.length;
  const columns = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <div aria-hidden="true" className="grid gap-[3px]" style={columns}>
          {heat.weeks.map((week, c) => {
            const first = week.find((cell) => cell.date.endsWith("-01"));
            return (
              <span key={c} className="h-3 overflow-visible font-mono text-[9px] leading-3 text-ink-3">
                {first ? MONTH_LETTER[Number(first.date.slice(5, 7)) - 1] : ""}
              </span>
            );
          })}
        </div>
        {/* On first view the cells fade in in reading order, row by row, 400ms from the first to the last (draw-cell). */}
        <DrawOnView
          role="img"
          aria-label={`${heat.daysWatched} days watched in the last six months`}
          className="grid grid-flow-col grid-rows-7 gap-[3px]"
          style={columns}
        >
          {heat.weeks.map((week, c) =>
            Array.from({ length: 7 }, (_, r) => {
              const cell = week[r];
              if (!cell) return <span key={`${c}-${r}`} className="aspect-square" />;
              return (
                <span key={cell.date} className="draw-cell block" style={{ "--delay": `${cellDelay(r, c, cols)}ms` } as CSSProperties}>
                  <span
                    title={`${cell.date} · ${cell.minutes ? formatSpan(cell.minutes) : "nothing"}`}
                    className={`block aspect-square rounded-[2px] ${cell.level ? `bg-accent ${HEAT_OPACITY[cell.level]}` : "bg-surface-2"}`}
                  />
                </span>
              );
            }),
          )}
        </DrawOnView>
      </div>
      <div className="flex items-center justify-between pt-0.5">
        <span className="text-[11px] text-ink-3">
          {formatNumber(heat.daysWatched)} {heat.daysWatched === 1 ? "day" : "days"} watched
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] text-ink-3">
          Less
          {[1, 2, 3, 4].map((l) => (
            <span key={l} className={`size-[9px] rounded-[2px] bg-accent ${HEAT_OPACITY[l]}`} />
          ))}
          More
        </span>
      </div>
    </div>
  );
}

/**
 * When a heatmap cell starts to fade in: in reading order (a row left to
 * right, then the next row), spread so the last cell starts `--fast` before
 * the 400ms are up and has faded by then.
 */
export function cellDelay(row: number, col: number, cols: number) {
  const n = 7 * cols;
  return Math.round(((row * cols + col) / Math.max(1, n - 1)) * (400 - 150));
}

/** One of the three equal cards: the head over a panel that fills the row's height and centres what it holds. */
export function RowCard({ title, meta, children }: { title: string; meta?: string; children: ReactNode }) {
  return (
    <>
      <div className="flex items-baseline gap-2.5">
        <h2 className="m-0 font-display text-xl font-bold leading-[1.05] tracking-[-0.025em]">{title}</h2>
        {meta && <span className="mono-label">{meta}</span>}
      </div>
      <div className={`flex grow flex-col justify-center p-4 lg:p-[18px] ${PANEL}`}>{children}</div>
    </>
  );
}

/** `tall` is the heatmap on phones, where the strip, its letters and legend stand taller than a row of bars. */
export function RowCardBones({ tall = false }: { tall?: boolean }) {
  return (
    <>
      <Bone className="h-5 w-36 rounded-md" />
      <Bone className={`grow rounded-[18px] ${tall ? "min-h-[158px] lg:min-h-[118px]" : "min-h-[118px]"}`} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Most watched

export function MostWatchedList({ rows }: { rows: MostWatched[] }) {
  if (rows.length === 0) return <p className="m-0 text-[13px] text-ink-2">Nothing watched in this window.</p>;
  const top = Math.max(1, rows[0].plays);
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {rows.map((r, i) => (
        <li key={`${r.mediaType}-${r.tmdbId}`}>
          <Link href={titleHref(r.mediaType, r.tmdbId)} className={`${ZOOM_GROUP} flex items-center gap-3 ${ROW_WASH}`}>
            <span aria-hidden="true" className="w-[22px] shrink-0 text-right font-display text-[22px] font-extrabold tracking-[-0.04em] text-ink-3 opacity-60">
              {i + 1}
            </span>
            <span className="block shrink-0 overflow-hidden rounded-md">
              <Poster path={r.poster} alt="" title={r.title} width={36} height={54} sizes="36px" className={`h-[54px] w-9 ${ZOOM}`} />
            </span>
            <span className="flex min-w-0 grow flex-col gap-[5px]">
              <span className="flex justify-between gap-2">
                <span className="truncate text-sm font-semibold">{r.title}</span>
                <span className="shrink-0 whitespace-nowrap font-mono text-[10px] text-ink-3">
                  {formatNumber(r.plays)} {r.mediaType === "tv" ? (r.plays === 1 ? "episode" : "episodes") : r.plays === 1 ? "viewing" : "viewings"} ·{" "}
                  {formatNumber(hoursOf(r.minutes))} h
                </span>
              </span>
              <span className="block h-[5px] overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${(r.plays / top) * 100}%` }} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function MostWatchedBones() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-5 w-[22px] rounded" />
          <Bone className="h-[54px] w-9 rounded-md" />
          <div className="flex grow flex-col gap-2">
            <Bone className="h-3.5 w-1/2 rounded" />
            <Bone className="h-[5px] rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Watching habits

export function HabitBones({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className={`h-[88px] rounded-2xl ${i >= 6 ? "hidden lg:block" : ""}`} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Trophy cabinet and friends

/** A cabinet medal or a friend's face answering the pointer: 1.08 over `--fast`, nothing with reduced motion. */
const GROW_ON_HOVER = "inline-flex transition-[scale] duration-(--fast) ease-out motion-safe:hover:scale-[1.08]";

/** Medals only, newest first, each with its own icon: a display case, not a to-do list. */
export function Cabinet({ badges, max, size }: { badges: CabinetBadge[]; max: number; size: number }) {
  if (badges.length === 0) return <p className="m-0 text-[13px] text-ink-2">No badges yet. The first comes with the first thing logged.</p>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
      {badges.slice(0, max).map((b) => (
        <li key={b.id} title={`${b.name}, ${TIER_NAME[b.tier].toLowerCase()}`} className="flex p-1">
          <span className={GROW_ON_HOVER}>
            <Medal tier={b.tier} icon={b.icon} size={size} />
          </span>
          <span className="sr-only">
            {b.name}, {TIER_NAME[b.tier]}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function CabinetBones({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className="m-1 size-10 rounded-full lg:size-11" />
      ))}
    </div>
  );
}

export function FriendFaces({ friends }: { friends: Person[] }) {
  if (friends.length === 0) {
    return (
      <p className="m-0 text-[13px] text-ink-2">
        No friends here yet.{" "}
        <Link href="/friends" className="font-semibold text-ink underline-offset-2 hover:underline">
          Find people
        </Link>
      </p>
    );
  }
  return (
    <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:px-0">
      {friends.map((f) => (
        <Link key={f.id} href={`/profiles/${f.id}`} className="flex w-[52px] shrink-0 flex-col items-center gap-1.5">
          <span className={GROW_ON_HOVER}>
            <UserAvatar id={f.id} name={f.name} src={f.avatar} size={44} />
          </span>
          <span className="max-w-full truncate text-xs font-semibold">{f.name.split(" ")[0]}</span>
        </Link>
      ))}
    </div>
  );
}

export function FaceBones() {
  return (
    <div className="flex gap-2.5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex w-[52px] flex-col items-center gap-1.5">
          <Bone className="size-11 rounded-full" />
          <Bone className="h-3 w-10 rounded" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ratings and reviews

/** The popcorn on a poster: the bucket and its name on the dark art chip, golden in amber. */
export function BucketChip({ score }: { score: number }) {
  return (
    <ArtChip small>
      <span className="-ml-0.5 inline-flex items-center gap-1">
        <Bucket level={score} size={14} className={score === 5 ? "text-accent" : "text-white"} />
        {BUCKET_NAMES[score - 1]}
      </span>
    </ArtChip>
  );
}

/** A rated title: its poster with the bucket bottom-left, the title, two lines of the review, and when. */
export function RatingCard({ row, fill = false }: { row: RatedRow; fill?: boolean }) {
  return (
    <Link
      href={titleHref(row.mediaType, row.tmdbId)}
      role="listitem"
      className={`${ZOOM_GROUP} flex min-w-0 shrink-0 flex-col gap-2 ${fill ? "w-full" : "w-[108px] lg:w-[126px]"}`}
    >
      <span className={`block rounded-[10px] ${ZOOM_SHADOW}`}>
        <span className="relative block aspect-[2/3] w-full overflow-hidden rounded-[10px] shadow-elevation">
          <Poster path={row.poster} alt="" title={row.title} width={126} height={189} sizes={fill ? "(min-width: 64rem) 160px, 33vw" : "(min-width: 64rem) 126px, 108px"} className={`size-full ${ZOOM}`} />
          <span className="absolute bottom-1.5 left-1.5 flex">
            <BucketChip score={row.score} />
          </span>
        </span>
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="truncate text-[13px] font-semibold">{row.title}</span>
        {row.review && <span className="line-clamp-2 text-xs leading-[1.35] text-ink-2">{row.review}</span>}
        <span className="text-[11px] text-ink-3">{whenLabel(row.at, new Date(), { today: "word" })}</span>
      </span>
    </Link>
  );
}

export function RatingBones({ count = 8 }: { count?: number }) {
  return (
    <div className="flex gap-2.5 overflow-hidden lg:gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex w-[108px] shrink-0 flex-col gap-2 lg:w-[126px]">
          <Bone className="aspect-[2/3] w-full rounded-[10px]" />
          <Bone className="h-3.5 w-3/4 rounded" />
          <Bone className="h-2.5 w-1/2 rounded" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Everything you watched

export function RecordBones({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-6">
      {Array.from({ length: count }, (_, i) => (
        <Bone key={i} className="h-[70px] rounded-xl" />
      ))}
    </div>
  );
}
