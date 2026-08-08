import Image from "next/image";
import Link from "next/link";
import { Film, Tv } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { addDays, getUpcoming, todayKey } from "@/lib/calendar";
import { getMonthlyChallenges } from "@/lib/challenges";
import { getUpNext } from "@/lib/continue-watching";
import { getFriendIds } from "@/lib/friends";
import { db } from "@/lib/db";
import { getOnThisDay } from "@/lib/on-this-day";
import { getRecentActivity, withArtwork } from "@/lib/social";
import { backfillScores, getStats, getWatchStatuses } from "@/lib/stats";
import { img, tmdbConfigured, trending } from "@/lib/tmdb";
import { ActivityRail } from "@/components/activity-rail";
import { ChallengeBar } from "@/components/challenge-bar";
import { CardRail, ScoreBadge } from "@/components/media-card";
import { Rail } from "@/components/rail";
import { FeaturedUpNext, UpNextCard } from "@/components/up-next-card";
import { NowWatching } from "@/components/now-watching";
import { OnThisDay } from "@/components/on-this-day";
import { QuoteFooter } from "@/components/quote-footer";
import { UpcomingRail } from "@/components/upcoming-rail";
import { EmptyState, SectionTitle, SetupNotice } from "@/components/ui";

export default async function HomePage() {
  const user = await getCurrentUser();
  const hasTmdb = tmdbConfigured();

  const trendingItems = hasTmdb ? await trending("all", "week").catch(() => []) : [];

  if (!user) {
    return (
      <div className="rise">
        <section className="card relative overflow-hidden px-6 py-12 sm:px-10 sm:py-16">
          <div className="relative max-w-xl">
            <p className="text-xs font-semibold tracking-[0.2em] text-flare-400 uppercase">
              Your watch log
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
              Every episode. Every movie.{" "}
              <span className="bg-gradient-to-r from-flare-400 to-ember-400 bg-clip-text text-transparent">
                Every hour.
              </span>
            </h1>
            <p className="mt-4 text-sm text-ink-300 sm:text-base">
              Trekker keeps track of what you have watched, what is next, and exactly how much
              of your life you have handed over to television.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/register"
                className="rounded-xl bg-flare-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-flare-500"
              >
                Create your profile
              </Link>
              <Link
                href="/discover"
                className="rounded-xl border border-ink-700 px-5 py-3 text-sm font-medium text-ink-100 transition hover:bg-ink-800"
              >
                Browse without an account
              </Link>
            </div>
          </div>
        </section>

        {!hasTmdb && (
          <div className="mt-6">
            <SetupNotice />
          </div>
        )}

        <CardRail title="Trending this week" items={trendingItems.slice(0, 14)} href="/discover" />
      </div>
    );
  }

  const today = todayKey();

  const [stats, upNext, statuses, recentPlays, onThisDay, friendActivity, upcoming, month] =
    await Promise.all([
      getStats(user.id),
      getUpNext(user.id, 10),
      getWatchStatuses(user.id),
      // One query, already in order: the log is the mixed chronological answer
      // this rail wants, and it is the only source that shows a film turning up
      // again because it was watched again.
      db.play.findMany({
        where: { userId: user.id },
        orderBy: { watchedAt: "desc" },
        take: 14,
      }),
      getOnThisDay(user.id),
      // Friends only: nobody's history is public on this instance.
      getFriendIds(user.id)
        .then((ids) => getRecentActivity({ userIds: ids, take: 12 }))
        // Wide cards, so they need wide artwork.
        .then(withArtwork),
      // One entry per show (`episodes: "next"`) keeps this to a single cached
      // TMDB call per title and gives the rail eight different titles rather
      // than one show's whole run.
      //
      // From *tomorrow*, not today. Everywhere else in the app an air date of
      // today already counts as released — `hasBeenReleased` says so, and TMDB
      // moves `last_episode_to_air` on the day — so today's episode is already
      // sitting in "Up next". Listing it here as well said "landing soon" about
      // something the page was simultaneously offering to log.
      //
      // The calendar still starts from today, because a calendar showing every
      // day except the current one would be absurd.
      getUpcoming(user.id, {
        from: addDays(today, 1),
        to: addDays(today, 120),
        maxShows: 40,
        episodes: "next",
      }).catch(() => []),
      // Four indexed reads and no network — see `lib/challenges`. Also what
      // records a challenge as won, so opening the dashboard is enough.
      getMonthlyChallenges(user.id).catch(() => null),
    ]);

  // Movies logged before scores were stored show "—" until this fills them in.
  // The score belongs to the film rather than to the sitting, so it is still
  // read from — and written back to — the watched row.
  const filmIds = [...new Set(recentPlays.filter((p) => p.mediaType === "movie").map((p) => p.tmdbId))];
  const filmRows = await backfillScores(
    await db.watchedMovie.findMany({
      where: { userId: user.id, movieId: { in: filmIds } },
      select: { id: true, movieId: true, score: true },
    }),
  );
  const filmScores = new Map(filmRows.map((row) => [row.movieId, row.score]));

  // No Plex identity means nothing to match a session against, so the card
  // never polls rather than polling and always finding nothing.
  const identity = await db.user.findUnique({
    where: { id: user.id },
    select: { plexAccountId: true, plexUsername: true, challengesCollapsed: true },
  });
  const plexLinked = Boolean(identity?.plexAccountId || identity?.plexUsername);

  // One mixed row: what you watched last, whatever form it took.
  const recentlyWatched = recentPlays.map((play) => {
    if (play.mediaType === "tv") {
      return {
        key: `play-${play.id}`,
        watchedAt: play.watchedAt,
        href: `/title/tv/${play.tmdbId}`,
        poster: play.poster,
        title: play.title,
        kind: "tv" as const,
        subtitle: `S${String(play.seasonNumber ?? 0).padStart(2, "0")}E${String(
          play.episodeNumber ?? 0,
        ).padStart(2, "0")} · ${play.episodeName ?? ""}`,
        badge: null as React.ReactNode,
      };
    }

    return {
      key: `play-${play.id}`,
      watchedAt: play.watchedAt,
      href: `/title/movie/${play.tmdbId}`,
      poster: play.poster,
      title: play.title,
      kind: "movie" as const,
      subtitle: `Watched ${play.watchedAt.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
      })}`,
      badge: <ScoreBadge score={filmScores.get(play.tmdbId) ?? 0} />,
    };
  });

  return (
    <div className="rise">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Hey, {user.name.split(" ")[0]}.
      </h1>
      <p className="mt-1 text-sm text-ink-400">
        {upNext.length > 0
          ? "Pick up where you left off."
          : "Let us find you something to watch."}
      </p>

      {!hasTmdb && (
        <div className="mt-6">
          <SetupNotice />
        </div>
      )}

      {/* Only mounts its polling loop when there is a Plex identity to poll for. */}
      <NowWatching enabled={plexLinked} />

      {/* Above the hero: a standing invitation, small enough not to compete
          with the thing anyone actually came here for. */}
      {month && (
        <div className="mt-5">
          <ChallengeBar month={month} collapsed={identity?.challengesCollapsed ?? false} />
        </div>
      )}

      {upNext.length > 0 ? (
        <>
          <div className={month ? "" : "mt-5"}>
            <FeaturedUpNext item={upNext[0]} />
          </div>

          {upNext.length > 1 && (
            <>
              <SectionTitle href="/profile" cta="Your stats">
                Also waiting for you
              </SectionTitle>
              <Rail>
                {upNext.slice(1).map((item) => (
                  <UpNextCard key={item.showId} item={item} />
                ))}
              </Rail>
            </>
          )}
        </>
      ) : (
        <div className="mt-5">
          <EmptyState
            title={stats.episodeCount > 0 ? "You are all caught up" : "Nothing on the go"}
            body={
              stats.episodeCount > 0
                ? "Every show you are watching has run out of released episodes. Time to start something new."
                : "Find a show, open it and tick off the episodes you have already seen."
            }
            href="/discover"
            cta="Discover shows"
          />
        </div>
      )}

      <UpcomingRail entries={upcoming.slice(0, 8)} today={today} />

      {trendingItems.length > 0 && (
        <CardRail
          title="Trending this week"
          items={trendingItems.slice(0, 14)}
          href="/discover/trending"
          watchedIds={statuses}
        />
      )}

      {friendActivity.length > 0 && (
        <>
          <SectionTitle href="/friends" cta="Your friends">
            What your friends have been watching
          </SectionTitle>
          <ActivityRail entries={friendActivity} />
        </>
      )}

      <OnThisDay entries={onThisDay} />

      {recentlyWatched.length > 0 && (
        <>
          <SectionTitle>Recently watched</SectionTitle>
          <Rail>
            {recentlyWatched.map((item) => (
              <PosterTile
                key={item.key}
                href={item.href}
                poster={item.poster}
                title={item.title}
                subtitle={item.subtitle}
                kind={item.kind}
                badge={item.badge}
              />
            ))}
          </Rail>
        </>
      )}

      <QuoteFooter />
    </div>
  );
}

/** Poster tile used by the "recent" rails: artwork, title, one line of detail. */
function PosterTile({
  href,
  poster,
  title,
  subtitle,
  kind,
  badge,
}: {
  href: string;
  poster: string | null;
  title: string;
  subtitle: string;
  kind: "tv" | "movie";
  badge?: React.ReactNode;
}) {
  const src = img.poster(poster);
  const Icon = kind === "tv" ? Tv : Film;

  return (
    <Link href={href} className="rail-item group w-[152px] sm:w-[184px]" title={title}>
      <div className="relative aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {src ? (
          <Image
            src={src}
            alt=""
            fill
            sizes="160px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="grid h-full place-items-center text-ink-600">
            <Icon size={26} />
          </div>
        )}
        {badge && <div className="absolute inset-x-2 bottom-2">{badge}</div>}
      </div>

      <p className="mt-2 line-clamp-1 text-sm font-medium text-ink-100">{title}</p>
      <p className="line-clamp-1 text-xs text-ink-400">{subtitle}</p>
    </Link>
  );
}
