import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Film,
  Flame,
  Tv,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import {
  getReview,
  resolveMonth,
  selectableMonths,
  type ReviewData,
  type ReviewPeriod,
} from "@/lib/review";
import { formatHours, formatSpan } from "@/lib/format";
import { img } from "@/lib/tmdb";
import { BackButton } from "@/components/back-button";
import { QuoteFooter } from "@/components/quote-footer";
import { ReviewSwipe } from "@/components/review-swipe";
import { Count, Reveal } from "@/components/reveal";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Your review — Trekker" };

const PERIODS: { value: ReviewPeriod; label: string }[] = [
  { value: "year", label: "Year" },
  { value: "month", label: "Month" },
];

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; m?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { p, m } = await searchParams;
  const period: ReviewPeriod = p === "month" ? "month" : "year";

  const months = selectableMonths();
  const month = period === "month" ? resolveMonth(m) : null;
  const review = await getReview(user.id, period, month);

  const empty = review.totalMinutes === 0;
  const window = period === "year" ? "all this year" : `in ${review.label}`;

  const index = month ? months.indexOf(month) : -1;

  return (
    <ReviewSwipe
      previous={index > 0 ? months[index - 1] : null}
      next={index >= 0 && index < months.length - 1 ? months[index + 1] : null}
    >
    <>
      {/* This row sits outside `rise`: the animation makes that wrapper a
          backdrop root, and the glass on the back button can only blur what is
          inside one. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <BackButton fallback="/profile" />

        <nav className="flex gap-2">
          {PERIODS.map((option) => (
            <Link
              key={option.value}
              href={option.value === "year" ? "/review" : `/review?p=${option.value}`}
              aria-current={period === option.value ? "page" : undefined}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                period === option.value
                  ? "border-flare-500 bg-flare-600/20 text-ink-100"
                  : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="rise">
      {period === "month" && <MonthStepper months={months} current={month} />}

      {period === "month" && month === null ? (
        <div className="mt-8">
          <EmptyState
            title="No completed month yet"
            body="A month can only be recapped once it is over. Come back in February — the year is there in the meantime."
            href="/review"
            cta="See the year"
          />
        </div>
      ) : empty ? (
        <div className="mt-8">
          <EmptyState
            title={`Nothing logged ${period === "year" ? "this year" : window}`}
            body="Tick something off and it will start filling in."
            href="/discover"
            cta="Find something"
          />
        </div>
      ) : (
        <>
          <Opening review={review} period={period} />
          <Numbers review={review} />
          <Buckets review={review} period={period} />
          <TopShows review={review} period={period} />
          <TopMovies review={review} />
          <Closing review={review} window={window} />
        </>
      )}

      <QuoteFooter />
      </div>
    </>
    </ReviewSwipe>
  );
}

/**
 * Steps through the months that can be recapped: January up to the month just
 * gone. The ends are dead links rather than hidden ones, so the control does
 * not jump about as you move through the year.
 */
function MonthStepper({ months, current }: { months: string[]; current: string | null }) {
  if (months.length === 0 || !current) return null;

  const index = months.indexOf(current);
  const previous = index > 0 ? months[index - 1] : null;
  const next = index < months.length - 1 ? months[index + 1] : null;

  const label = (key: string) =>
    new Date(Number(key.slice(0, 4)), Number(key.slice(5)) - 1, 1).toLocaleDateString("en-GB", {
      month: "long",
      year: "numeric",
    });

  const step = "grid h-9 w-9 place-items-center rounded-full border transition";

  return (
    <div className="mt-4 flex items-center justify-center gap-3">
      {previous ? (
        <Link
          href={`/review?p=month&m=${previous}`}
          aria-label={`Go to ${label(previous)}`}
          className={`${step} border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100`}
        >
          <ChevronLeft size={17} />
        </Link>
      ) : (
        <span
          aria-hidden
          className={`${step} cursor-not-allowed border-ink-800 text-ink-700`}
        >
          <ChevronLeft size={17} />
        </span>
      )}

      <span className="min-w-44 text-center text-sm font-medium">{label(current)}</span>

      {next ? (
        <Link
          href={`/review?p=month&m=${next}`}
          aria-label={`Go to ${label(next)}`}
          className={`${step} border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100`}
        >
          <ChevronRight size={17} />
        </Link>
      ) : (
        <span
          aria-hidden
          title="The month in progress cannot be recapped yet"
          className={`${step} cursor-not-allowed border-ink-800 text-ink-700`}
        >
          <ChevronRight size={17} />
        </span>
      )}
    </div>
  );
}

/** The title card: one enormous figure, and the sentence that frames it. */
function Opening({ review, period }: { review: ReviewData; period: ReviewPeriod }) {
  const days = review.totalMinutes / 60 / 24;
  const hours = Math.round(review.totalMinutes / 60);

  return (
    <section className="relative mt-6 flex min-h-[62vh] flex-col justify-center overflow-hidden rounded-3xl border border-ink-800/70 bg-gradient-to-br from-flare-600/25 via-ink-950/40 to-ember-500/15 px-6 py-14 text-center sm:px-10 sm:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-24 h-80 w-80 rounded-full bg-flare-500/25 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-32 h-80 w-80 rounded-full bg-ember-500/20 blur-3xl"
      />

      <div className="relative">
        <Reveal>
          <p className="text-xs font-medium tracking-[0.3em] text-flare-300 uppercase">
            {period === "year" ? "Year in review" : "Month in review"}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-5xl">
            {review.label}
          </h1>
        </Reveal>

        <Reveal delay={250}>
          <p className="mt-10 text-[13px] tracking-wider text-ink-400 uppercase">
            You watched
          </p>
          {/*
            `-webkit-text-fill-color` spelled out: without it iOS paints the
            gradient's box behind the glyphs instead of only inside them, which
            reads as a pale block around the number.
          */}
          <p
            style={{ WebkitTextFillColor: "transparent" }}
            className="mt-1 bg-gradient-to-br from-flare-400 to-ember-400 bg-clip-text text-7xl font-black tracking-tighter text-transparent tabular-nums sm:text-[8rem]"
          >
            <Count to={hours} />
          </p>
          <p className="-mt-1 text-xl font-semibold tracking-tight text-ink-300 sm:text-2xl">
            hours
          </p>
        </Reveal>

        {days >= 1 && (
          <Reveal delay={500}>
            <p className="mx-auto mt-8 max-w-md text-base text-ink-400 sm:text-lg">
              That is <span className="text-ink-100">{days.toFixed(1)} solid days</span> — no
              sleeping, no stopping.
            </p>
          </Reveal>
        )}

        <Reveal delay={700}>
          <p className="mt-10 flex items-center justify-center gap-2 text-xs text-ink-500">
            Keep scrolling <ArrowRight size={13} className="rotate-90" />
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/** Four figures, revealed one after another. */
function Numbers({ review }: { review: ReviewData }) {
  const tiles = [
    {
      label: "Episodes",
      icon: <Tv size={14} />,
      value: <Count to={review.episodeCount} />,
      sub: `across ${review.showCount} show${review.showCount === 1 ? "" : "s"}`,
    },
    {
      label: "Films",
      icon: <Film size={14} />,
      value: <Count to={review.movieCount} />,
      sub: review.movieCount > 0 ? "start to finish" : "none this time",
    },
    {
      label: "Longest streak",
      icon: <Flame size={14} />,
      value: (
        <>
          <Count to={review.streak} /> <span className="text-2xl">days</span>
        </>
      ),
      sub: review.streak > 1 ? "without a night off" : "one at a time",
    },
    {
      label: "Busiest day",
      icon: <CalendarDays size={14} />,
      value: review.biggestDay ? <Count to={review.biggestDay.count} /> : <>0</>,
      sub: review.biggestDay
        ? review.biggestDay.date.toLocaleDateString("en-GB", {
            day: "numeric",
            month: "long",
          })
        : "nothing logged",
    },
  ];

  return (
    <section className="mt-6 grid gap-3 sm:grid-cols-2">
      {tiles.map((tile, index) => (
        <Reveal key={tile.label} delay={index * 110}>
          <div className="card h-full p-6">
            <p className="flex items-center gap-2 text-[11px] font-medium tracking-wider text-ink-400 uppercase">
              {tile.icon}
              {tile.label}
            </p>
            <p className="mt-3 text-5xl font-black tracking-tighter text-ink-100">
              {tile.value}
            </p>
            <p className="mt-1 text-sm text-ink-500">{tile.sub}</p>
          </div>
        </Reveal>
      ))}
    </section>
  );
}

function Buckets({ review, period }: { review: ReviewData; period: ReviewPeriod }) {
  const peak = Math.max(0, ...review.buckets.map((b) => b.minutes));
  if (peak === 0) return null;

  const best = review.buckets.reduce((a, b) => (b.minutes > a.minutes ? b : a));

  return (
    <Reveal className="mt-6">
      <section className="card p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          {period === "year" ? "How the year went" : "How the month went"}
        </h2>
        <p className="mt-1 text-sm text-ink-400">
          Your biggest stretch was{" "}
          <span className="text-flare-400">
            {period === "year" ? best.label : `day ${best.label}`}
          </span>{" "}
          at {formatHours(best.minutes)}.
        </p>

        <div className="mt-6 flex h-44 items-end gap-1">
          {review.buckets.map((bucket, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center gap-2">
              <div className="flex w-full flex-1 items-end">
                <div
                  title={`${bucket.label}: ${formatHours(bucket.minutes)}`}
                  style={{
                    height: `${Math.max(2, (bucket.minutes / peak) * 100)}%`,
                    // Staggered so the chart draws itself left to right.
                    ["--reveal-delay" as string]: `${Math.min(i * 55, 900)}ms`,
                  }}
                  className={`grow-bar w-full rounded-t-md ${
                    bucket.minutes === best.minutes
                      ? "bg-gradient-to-t from-ember-500/50 to-ember-400"
                      : bucket.minutes === 0
                        ? "bg-ink-800"
                        : "bg-gradient-to-t from-flare-600/40 to-flare-400"
                  }`}
                />
              </div>
              {/* A month has too many days to label every one. */}
              {(period === "year" || i % 5 === 0) && (
                <span className="text-[9px] text-ink-500">{bucket.label}</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </Reveal>
  );
}

function TopShows({ review, period }: { review: ReviewData; period: ReviewPeriod }) {
  if (review.topShows.length === 0) return null;

  const [leader, ...rest] = review.topShows;
  const art = img.poster(leader.poster, "w500");

  return (
    <section className="mt-8">
      <Reveal>
        <p className="text-[11px] font-medium tracking-[0.25em] text-flare-300 uppercase">
          {period === "year" ? "Show of the year" : "Show of the month"}
        </p>
      </Reveal>

      <Reveal delay={140} className="mt-3">
        <div className="card relative flex items-center gap-5 overflow-hidden p-5 sm:p-6">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-16 h-56 w-56 rounded-full bg-flare-500/15 blur-3xl"
          />
          <Link
            href={`/title/tv/${leader.showId}`}
            className="relative h-36 w-24 shrink-0 self-start overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800 sm:h-48 sm:w-32"
          >
            {art && <Image src={art} alt="" fill sizes="128px" className="object-cover" />}
          </Link>

          <div className="relative min-w-0 flex-1">
            <Link
              href={`/title/tv/${leader.showId}`}
              className="block text-2xl font-semibold tracking-tight hover:underline sm:text-3xl"
            >
              {leader.name}
            </Link>
            <p className="mt-2 text-4xl font-black tracking-tighter text-flare-400">
              {formatSpan(leader.minutes)}
            </p>
            <p className="mt-1 text-sm text-ink-400">
              More than anything else you watched {period === "year" ? "all year" : "all month"}.
            </p>
          </div>
        </div>
      </Reveal>

      {rest.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rest.map((show, index) => (
            <Reveal key={show.showId} delay={index * 90}>
              <li>
                <Link
                  href={`/title/tv/${show.showId}`}
                  className="card flex items-center gap-4 p-3 transition hover:border-flare-500/50 sm:p-4"
                >
                  <span className="w-6 shrink-0 text-center font-mono text-xl font-black text-ink-700 tabular-nums">
                    {index + 2}
                  </span>
                  <Poster src={img.poster(show.poster, "w185")} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{show.name}</span>
                  <span className="shrink-0 font-mono text-sm text-ink-300 tabular-nums">
                    {formatHours(show.minutes)}
                  </span>
                </Link>
              </li>
            </Reveal>
          ))}
        </ul>
      )}
    </section>
  );
}

function TopMovies({ review }: { review: ReviewData }) {
  if (review.topMovies.length === 0) return null;

  return (
    <section className="mt-10">
      <Reveal>
        <p className="text-[11px] font-medium tracking-[0.25em] text-ember-400 uppercase">
          Films you got round to
        </p>
      </Reveal>

      <div className="mt-3 grid grid-cols-3 gap-x-1.5 gap-y-6 sm:grid-cols-4 md:grid-cols-6">
        {review.topMovies.map((movie, index) => (
          <Reveal key={movie.movieId} delay={index * 80}>
            <Link href={`/title/movie/${movie.movieId}`} className="group" title={movie.title}>
              <div className="relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
                {img.poster(movie.poster) && (
                  <Image
                    src={img.poster(movie.poster)!}
                    alt=""
                    fill
                    sizes="160px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-sm font-medium">{movie.title}</p>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Closing({ review, window }: { review: ReviewData; window: string }) {
  return (
    <Reveal className="mt-10">
      <section className="rounded-3xl border border-ink-800/70 bg-gradient-to-br from-ember-500/15 via-transparent to-flare-600/20 px-6 py-14 text-center sm:py-20">
        <p className="mx-auto max-w-lg text-2xl leading-snug font-semibold tracking-tight sm:text-3xl">
          {review.episodeCount.toLocaleString("en-GB")} episode
          {review.episodeCount === 1 ? "" : "s"}, {review.movieCount} film
          {review.movieCount === 1 ? "" : "s"}, {review.showCount} show
          {review.showCount === 1 ? "" : "s"} — {window}.
        </p>
        <Link
          href="/discover"
          className="mt-8 inline-block rounded-xl bg-flare-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-flare-500"
        >
          Find the next one
        </Link>
      </section>
    </Reveal>
  );
}

function Poster({ src }: { src: string | null }) {
  return (
    <span className="relative block h-14 w-10 shrink-0 overflow-hidden rounded-md bg-ink-800">
      {src && <Image src={src} alt="" fill sizes="40px" className="object-cover" />}
    </span>
  );
}
