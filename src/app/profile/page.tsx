import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Film, Sparkles, Trophy, Tv } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getLevel, type LevelState } from "@/lib/achievements";
import { avatarUrl } from "@/lib/avatar";
import { displayEmail } from "@/lib/plex-seat";
import { LevelBar } from "@/components/level-bar";
import { db } from "@/lib/db";
import { getFunStats } from "@/lib/fun-stats";
import { countPlays, getMostWatched, getWeekHistory } from "@/lib/profile";
import { isRangeKey, resolveRange, type RangeKey } from "@/lib/range";
import { FunStatsPanel } from "@/components/fun-stats";
import { MonthlyLine } from "@/components/monthly-line";
import {
  GenreSplit,
  MostWatchedPanel,
  RatingsRail,
  WeekdayBars,
} from "@/components/profile-panels";
import { RangeFilter } from "@/components/range-filter";
import { WeekHistory } from "@/components/watch-history";
import { formatHours, formatSpan } from "@/lib/format";
import { getStats } from "@/lib/stats";
import { TitleBackdrop } from "@/components/title-backdrop";
import { StatTile } from "@/components/ui";

export const metadata = { title: "Profile — Trekker" };

/** What the middle tile says, which depends on how wide the window is. */
function middleTile(range: RangeKey, last30: number, daily: number) {
  return range === "all"
    ? { label: "Last 30 days", value: formatSpan(last30), sub: "the recent run" }
    : { label: "Daily average", value: formatSpan(daily), sub: "across this window" };
}

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const rangeKey: RangeKey = isRangeKey(params.range) ? params.range : "all";
  const range = resolveRange(rangeKey);

  const [stats, ratings, ratingCount, funStats, mostWatched, week, playCount, cover, level] =
    await Promise.all([
      getStats(user.id, range),
      db.rating.findMany({
        where: { userId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 20,
      }),
      db.rating.count({ where: { userId: user.id } }),
      getFunStats(user.id, range),
      getMostWatched(user.id, 5, range),
      // The week is the week, whatever the filter above says — it is a record of
      // what just happened rather than another cut of the same statistics.
      getWeekHistory(user.id),
      countPlays(user.id),
      db.user.findUnique({
        where: { id: user.id },
        select: { coverBackdrop: true, coverTitle: true },
      }),
      // Counted columns only — see `lib/achievements/xp.ts`. Cheap enough to
      // belong on the banner rather than behind a link.
      getLevel(user.id),
    ]);

  const avatar = avatarUrl(user);
  const middle = middleTile(rangeKey, stats.last30Minutes, stats.dailyAverage);

  return (
    <div className="rise relative">
      {/* The chosen cover is the page's own backdrop, exactly as on a title
          page — full-bleed, reaching up behind the header and dissolving. */}
      {cover?.coverBackdrop && <TitleBackdrop backdrop={cover.coverBackdrop} />}

      <ProfileBanner
        name={user.name}
        email={displayEmail(user.email)}
        avatar={avatar}
        createdAt={user.createdAt}
        totalMinutes={stats.totalMinutes}
        level={level}
        cover={
          cover?.coverBackdrop
            ? { backdrop: cover.coverBackdrop, title: cover.coverTitle }
            : null
        }
      />

      {/* The window everything below is measured over. */}
      <div className="fade-in mt-4" style={fadeDelay(0)}>
        <RangeFilter active={rangeKey} />
      </div>

      {/*
        One headline and three footnotes, rather than four tiles of equal weight.
        Total time is the number this whole page is about — everything else is a
        way of cutting it up — and giving it the same box as "last 30 days" said
        the opposite.
      */}
      <div className="fade-in mt-3" style={fadeDelay(1)}>
        <div className="card relative overflow-hidden bg-gradient-to-br from-flare-600/25 via-transparent to-ember-500/10 p-6 sm:p-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-flare-500/15 blur-3xl"
          />
          <p className="relative flex items-center gap-1.5 text-[11px] font-medium tracking-wider text-ink-400 uppercase">
            <Clock size={13} />
            Time watched · {range.label}
          </p>
          <p className="relative mt-2 text-4xl font-semibold tracking-tight tabular-nums sm:text-6xl">
            {formatSpan(stats.totalMinutes)}
          </p>
          <p className="relative mt-1.5 text-sm text-ink-300">
            {formatHours(stats.totalMinutes)} in total ·{" "}
            {(stats.movieCount + stats.episodeCount).toLocaleString("en-GB")} viewing
            {stats.movieCount + stats.episodeCount === 1 ? "" : "s"} across{" "}
            {stats.distinctMovies.toLocaleString("en-GB")} film
            {stats.distinctMovies === 1 ? "" : "s"} and {stats.showCount.toLocaleString("en-GB")}{" "}
            show{stats.showCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      {/* Three across at every width. Two-up would leave a hole under the pair
          now that the headline has been promoted out of this row. */}
      <div className="fade-in mt-3 grid grid-cols-3 gap-3" style={fadeDelay(2)}>
        <StatTile label={middle.label} value={middle.value} sub={middle.sub} />
        <StatTile
          label="TV time"
          icon={<Tv size={13} />}
          value={formatSpan(stats.tvMinutes)}
          sub={`${stats.episodeCount} episode${stats.episodeCount === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Movie time"
          icon={<Film size={13} />}
          value={formatSpan(stats.movieMinutes)}
          // The count is sittings, to match the hours beside it. The
          // parenthetical only shows up once the two have parted company, which
          // is the moment it starts to mean something.
          sub={
            stats.movieCount === stats.distinctMovies
              ? `${stats.movieCount} movie${stats.movieCount === 1 ? "" : "s"}`
              : `${stats.movieCount} viewings · ${stats.distinctMovies} different`
          }
        />
      </div>

      <div className="fade-in mt-3" style={fadeDelay(3)}>
        <MonthlyLine series={stats.series} title={range.label} live={stats.seriesLive} />
      </div>

      {/*
        Two charts side by side, then the ranked list at full width.

        All three shared a row at first, which looked tidy in the abstract and
        ragged in practice: five poster rows are simply taller than seven bars or
        five legend chips, so one card filled its box and the other two trailed
        dead space. A list wants width and a chart wants a square, and pretending
        otherwise cost both.
      */}
      <div className="fade-in mt-3 grid gap-3 lg:grid-cols-2" style={fadeDelay(4)}>
        <WeekdayBars weekday={stats.weekday} />
        <GenreSplit genres={funStats.topGenres} />
      </div>

      <div className="fade-in mt-3" style={fadeDelay(5)}>
        <MostWatchedPanel items={mostWatched} />
      </div>

      {/* The genre and weekday cards would repeat the two charts above. */}
      <FunStatsPanel stats={funStats} omit={["genre", "weekday"]} />

      <RatingsRail ratings={ratings} total={ratingCount} />

      <WeekHistory days={week} total={playCount} />
    </div>
  );
}

/** Staggered reveal, same helper the calendar uses. */
function fadeDelay(index: number) {
  return { "--fade-delay": `${Math.min(index, 8) * 55}ms` } as React.CSSProperties;
}

function Avatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  return (
    <span
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 font-black text-white"
    >
      {src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size }}
          className="object-cover"
          unoptimized
        />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}

function ProfileBanner({
  name,
  email,
  avatar,
  createdAt,
  totalMinutes,
  level,
  cover,
}: {
  name: string;
  email: string;
  avatar: string | null;
  createdAt: Date;
  totalMinutes: number;
  level: LevelState;
  /** Backdrop chosen from a title page, with the title it came from. */
  cover: { backdrop: string; title: string | null } | null;
}) {
  return (
    <header
      // With a cover behind the whole page the card would only fight it, so it
      // steps back to a thin frame and lets the artwork through.
      className={`relative overflow-hidden rounded-2xl p-5 sm:p-6 ${
        cover
          ? // Heavy enough to read against: a light frame over a bright still
            // left the email and the "tracking since" line barely legible.
            "border border-ink-100/10 bg-ink-950/60 backdrop-blur-md"
          : "card bg-gradient-to-br from-flare-600/20 via-transparent to-ember-500/12"
      }`}
    >
      {/* Soft light behind the avatar, so the corner is not a flat wash. */}
      {!cover && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 rounded-full bg-flare-500/20 blur-3xl"
        />
      )}

      {/*
        `break-words` rather than `truncate`: a long name should wrap onto a
        second line and use the width the card has, not disappear behind an
        ellipsis. The two buttons stay on the row beside it — with their labels
        hidden on a phone they are narrow enough not to crowd it.
      */}
      <div className="relative flex flex-wrap items-center gap-4">
        <Avatar name={name} src={avatar} size={72} />

        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight break-words">{name}</h1>
          <p className="truncate text-sm text-ink-300" title={email}>
            {email}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            Tracking since{" "}
            {createdAt.toLocaleDateString("en-GB", { month: "long", year: "numeric" })} ·{" "}
            <span className="text-ink-200">{formatHours(totalMinutes)} watched</span>
          </p>
          {cover?.title && (
            <p className="mt-1 text-[11px] break-words text-ink-400">Cover: {cover.title}</p>
          )}
        </div>

        {/* Own line below the name on a phone, where the avatar and the two
            buttons have already used the row up. */}
        <div className="order-last w-full">
          <LevelBar level={level} />
        </div>

        <div className="flex items-center gap-2 max-sm:order-2 max-sm:w-full">
          <Link
            href="/achievements"
            className="inline-flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/50 px-3.5 py-2 text-sm text-ink-200 backdrop-blur-sm transition hover:border-flare-500 hover:bg-ink-800"
          >
            <Trophy size={15} />
            <span className="hidden sm:inline">Achievements</span>
          </Link>

          <Link
            href="/review"
            className="inline-flex items-center gap-2 rounded-xl border border-flare-500/50 bg-flare-600/20 px-3.5 py-2 text-sm font-medium text-flare-300 backdrop-blur-sm transition hover:bg-flare-600/30"
          >
            <Sparkles size={15} />
            <span className="hidden sm:inline">Your review</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
