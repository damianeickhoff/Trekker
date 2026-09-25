import type { ReactNode } from "react";
import { formatNumber } from "@/lib/levels";
import { titleHref } from "@/lib/marks";
import { formatSpan, hoursOf } from "@/lib/profile";
import type { Review } from "@/lib/review";
import { Icon, type IconName } from "../icon";
import { Link } from "../link";
import { PosterCard } from "../poster-card";
import { BucketChip, PANEL } from "../profile/parts";
import { Rail } from "../rail";
import { Bone } from "../skeleton";
import { SectionHead } from "../section-head";
import { buttonClass, iconButtonClass, SectionTitle } from "../ui";
import { Count, Reveal } from "./reveal";

/*
 * The year review's cards, in the old app's order: the opening figure, four
 * tiles, the bars, the show of the period, the films, and a closing line. The
 * opening and closing cards are heroes, so night and white in both themes;
 * everything between is the page's own panels. Amber marks what the old app
 * lit: the biggest stretch on the chart and the busiest bar, and a faint glow
 * behind the opening figure, as the unlock toast glows behind its medal.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${formatNumber(n)} ${n === 1 ? one : many}`;

const HERO = "relative overflow-hidden rounded-[22px] bg-night text-center text-white";
/** The amber glow behind the figure: the one gradient, in the one accent. */
const GLOW = "pointer-events-none absolute left-1/2 top-1/2 size-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_22%,transparent),transparent)]";

export function Opening({ review }: { review: Review }) {
  const hours = hoursOf(review.totalMinutes);
  const days = review.totalMinutes / 60 / 24;
  return (
    <Reveal>
      <section aria-label="Time watched" className={`${HERO} flex min-h-[440px] flex-col justify-center px-6 py-12 lg:min-h-[480px] lg:py-16`}>
        <span aria-hidden="true" className={GLOW} />
        <div className="relative flex flex-col items-center">
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.2em] text-white/78">
            {review.period === "year" ? "Year in review" : "Month in review"}
          </span>
          <span className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-[-0.03em] lg:text-[36px]">{review.label}</span>
          <span className="mt-10 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-white/78">You watched</span>
          <span className="mt-1 font-display text-[88px] font-extrabold leading-[0.9] tracking-[-0.05em] lg:text-[128px]">
            <Count to={hours} />
          </span>
          <span className="font-display text-xl font-bold tracking-[-0.02em] text-white/78 lg:text-2xl">{hours === 1 ? "hour" : "hours"}</span>
          {days >= 1 && (
            <p className="m-0 mt-8 max-w-[360px] text-[15px] leading-[1.45] text-white/78">
              That is <strong className="font-semibold text-white">{days.toFixed(1)} solid days</strong>, no sleeping, no stopping.
            </p>
          )}
          <span className="mt-10 inline-flex items-center gap-1.5 text-xs text-white/60">
            Keep scrolling
            <Icon name="chevR" size={14} className="rotate-90" />
          </span>
        </div>
      </section>
    </Reveal>
  );
}

function Tile({ icon, label, value, sub, delay }: { icon: IconName; label: string; value: ReactNode; sub: string; delay: number }) {
  return (
    <Reveal delay={delay} className="min-w-0">
      <div className="flex h-full min-w-0 flex-col gap-1.5 rounded-2xl bg-surface px-4 py-4 shadow-elevation lg:px-5 lg:py-5">
        <span className="mono-label inline-flex items-center gap-1.5">
          <Icon name={icon} size={14} />
          {label}
        </span>
        <span className="truncate font-display text-[40px] font-extrabold leading-none tracking-[-0.04em] lg:text-5xl">{value}</span>
        <span className="truncate text-[13px] text-ink-3">{sub}</span>
      </div>
    </Reveal>
  );
}

export function Figures({ review }: { review: Review }) {
  const busy = review.busiestDay;
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      <Tile delay={0} icon="tv" label="Episodes" value={formatNumber(review.episodeCount)} sub={`across ${plural(review.showCount, "show")}`} />
      <Tile delay={90} icon="film" label="Films" value={formatNumber(review.filmCount)} sub={review.filmCount > 0 ? "start to finish" : "none this time"} />
      <Tile
        delay={180}
        icon="flame"
        label="Longest streak"
        value={
          <>
            {formatNumber(review.streak)} <span className="text-2xl tracking-[-0.02em]">{review.streak === 1 ? "day" : "days"}</span>
          </>
        }
        sub={review.streak > 1 ? "without a night off" : "one at a time"}
      />
      <Tile
        delay={270}
        icon="calendar"
        label="Busiest day"
        value={formatNumber(busy?.count ?? 0)}
        sub={busy ? busy.date.toLocaleDateString("en-GB", { day: "numeric", month: "long" }) : "nothing logged"}
      />
    </div>
  );
}

/** Minutes per month (per day for a month), the biggest stretch amber and named. */
export function Stretches({ review }: { review: Review }) {
  const { buckets, peak } = review;
  if (!peak) return null;
  const month = review.period === "month";
  return (
    <Reveal>
      <section aria-labelledby="review-bars" className={`flex flex-col gap-4 p-5 lg:p-6 ${PANEL}`}>
        <div className="flex flex-col gap-1.5">
          <SectionTitle>
            <span id="review-bars">{month ? "How the month went" : "How the year went"}</span>
          </SectionTitle>
          <p className="m-0 text-[13px] text-ink-2">
            Your biggest stretch was <strong className="font-semibold text-accent-text">{peak.long}</strong>, at {formatSpan(peak.minutes)}.
          </p>
        </div>
        <div
          role="img"
          aria-label={`Hours per ${month ? "day" : "month"}: ${buckets.map((b) => `${b.long} ${hoursOf(b.minutes)}`).join(", ")}`}
          className={`flex h-40 items-end lg:h-48 ${month ? "gap-[3px]" : "gap-1.5 lg:gap-2.5"}`}
        >
          {buckets.map((b, i) => {
            const top = b === peak;
            // A month has too many days to label every one: the first, then every fifth.
            const labelled = !month || i === 0 || (i + 1) % 5 === 0;
            return (
              <span key={b.long} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
                <span
                  className={`block w-full rounded-t-md rounded-b-[3px] ${top ? "bg-accent" : "bg-surface-2"}`}
                  style={{ height: `calc((100% - 18px) * ${b.minutes / peak.minutes})`, minHeight: b.minutes ? 3 : 0 }}
                />
                <span className={`h-3 font-mono text-[10px] leading-3 ${top ? "font-semibold text-accent-text" : "font-medium text-ink-3"}`}>
                  {labelled ? b.label : ""}
                </span>
              </span>
            );
          })}
        </div>
      </section>
    </Reveal>
  );
}

export function TopShows({ review }: { review: Review }) {
  const [leader, ...rest] = review.topShows;
  if (!leader) return null;
  const word = review.period === "year" ? "year" : "month";
  return (
    <section aria-labelledby="review-shows" className="flex flex-col gap-3">
      <Reveal>
        <span id="review-shows" className="mono-label">
          Show of the {word}
        </span>
      </Reveal>
      <Reveal delay={120}>
        <div className={`flex items-center gap-4 p-4 lg:gap-6 lg:p-5 ${PANEL}`}>
          <div role="list" className="shrink-0 self-start">
            <PosterCard item={{ mediaType: "tv", tmdbId: leader.tmdbId, title: leader.title, poster: leader.poster }} meta={plural(leader.episodes, "episode")} />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Link href={titleHref("tv", leader.tmdbId)} className="font-display text-2xl font-extrabold leading-[1.05] tracking-[-0.03em] hover:underline lg:text-[32px]">
              {leader.title}
            </Link>
            <span className="font-display text-[40px] font-extrabold leading-none tracking-[-0.04em] lg:text-5xl">{formatSpan(leader.minutes)}</span>
            <span className="text-[13px] text-ink-2">More than anything else you watched all {word}.</span>
          </div>
        </div>
      </Reveal>
      {rest.length > 0 && (
        <Reveal delay={200} className="flex flex-col gap-2.5 pt-2">
          <span className="mono-label">The runners-up</span>
          <Rail label="The runners-up" cards>
            {rest.map((s, i) => (
              <PosterCard
                key={s.tmdbId}
                item={{ mediaType: "tv", tmdbId: s.tmdbId, title: s.title, poster: s.poster }}
                chip={`#${i + 2}`}
                meta={formatSpan(s.minutes)}
              />
            ))}
          </Rail>
        </Reveal>
      )}
    </section>
  );
}

export function Films({ review }: { review: Review }) {
  if (review.films.length === 0) return null;
  return (
    <Reveal>
      <section aria-labelledby="review-films" className="flex flex-col gap-3">
        <SectionHead id="review-films" title="Films you got round to" meta={review.filmCount > review.films.length ? `latest ${review.films.length}` : undefined} />
        <Rail label="Films you got round to" cards>
          {review.films.map((f) => (
            <PosterCard
              key={f.tmdbId}
              item={{ mediaType: "movie", tmdbId: f.tmdbId, title: f.title, poster: f.poster, year: f.year }}
              corner={f.score ? <BucketChip score={f.score} /> : undefined}
            />
          ))}
        </Rail>
      </section>
    </Reveal>
  );
}

export function Closing({ review }: { review: Review }) {
  const window = review.period === "year" ? "all this year" : `in ${review.label}`;
  return (
    <Reveal>
      <section aria-label="In short" className={`${HERO} flex flex-col items-center gap-8 px-6 py-14 lg:py-20`}>
        <p className="m-0 max-w-[520px] font-display text-2xl font-bold leading-[1.2] tracking-[-0.02em] lg:text-[30px]">
          {plural(review.episodeCount, "episode")}, {plural(review.filmCount, "film")}, {plural(review.showCount, "show")}, {window}.
        </p>
        <Link href="/discover" className={buttonClass("white", "md")}>
          <Icon name="compass" size={18} />
          Find the next one
        </Link>
      </section>
    </Reveal>
  );
}

/**
 * Steps through the months that can be recapped. The ends are dead buttons
 * rather than missing ones, so the control does not jump about; the far end
 * says why it stops.
 */
export function MonthStepper({ months, current, href }: { months: string[]; current: string; href: (m: string) => string }) {
  const index = months.indexOf(current);
  const previous = index > 0 ? months[index - 1] : null;
  const next = index >= 0 && index < months.length - 1 ? months[index + 1] : null;
  const step = (month: string | null, icon: "chevL" | "chevR", why: string) =>
    month ? (
      <Link href={href(month)} replace scroll={false} aria-label={`Go to ${monthLabel(month)}`} className={iconButtonClass("ghost", "sm")}>
        <Icon name={icon} size={20} />
      </Link>
    ) : (
      <span aria-hidden="true" title={why} className={iconButtonClass("ghost", "sm", "cursor-not-allowed opacity-40")}>
        <Icon name={icon} size={20} />
      </span>
    );
  return (
    <div className="flex items-center justify-center gap-3">
      {step(previous, "chevL", "The review starts in January")}
      <span className="min-w-40 text-center text-[15px] font-semibold">{monthLabel(current)}</span>
      {step(next, "chevR", "The month in progress cannot be recapped yet")}
    </div>
  );
}

const monthLabel = (key: string) =>
  new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/** The page's bones: the header, the opening card and the four tiles. */
export function ReviewBones() {
  return (
    <>
      <Bone className="h-[440px] rounded-[22px] lg:h-[480px]" />
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Bone key={i} className="h-[118px] rounded-2xl lg:h-[130px]" />
        ))}
      </div>
    </>
  );
}
