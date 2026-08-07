import Image from "next/image";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { ChevronRight } from "lucide-react";
import {
  fetchCategory,
  fetchSeasonPicks,
  getGenreArtwork,
  GENRES,
  SEASON_BAND,
  type SeasonPick,
} from "@/lib/catalogue";
import { currentSeason } from "@/lib/current-season";
import type { Season } from "@/lib/seasons";
import { getWatchStatuses } from "@/lib/stats";
import { getSuggestions } from "@/lib/suggestions";
import {
  catalogue,
  img,
  searchPaged,
  tmdbConfigured,
  type NormalisedItem,
} from "@/lib/tmdb";
import { CategoryNav } from "@/components/category-nav";
import { BillboardRail, NumberedRail, SectionBand } from "@/components/discover-sections";
import { CardRail, MediaCard, ScoreBadge, type WatchStatus } from "@/components/media-card";
import { getRequestMarks } from "@/lib/request-marks";
import { Rail } from "@/components/rail";
import { SpotlightCarousel } from "@/components/spotlight-carousel";
import { SearchBox } from "@/components/search-box";
import { EmptyState, SetupNotice } from "@/components/ui";

export const metadata = { title: "Discover — Trekker" };

const TYPE_FILTERS: { value: DiscoverType; label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "tv", label: "Shows" },
  { value: "movie", label: "Movies" },
];

type DiscoverType = "all" | "tv" | "movie";

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string }>;
}) {
  const { q, type } = await searchParams;
  const query = q?.trim() ?? "";
  const filter: DiscoverType = type === "tv" || type === "movie" ? type : "all";

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Discover</h1>
        <div className="mt-5">
          <SetupNotice />
        </div>
      </div>
    );
  }

  const user = await getCurrentUser();
  const [statuses, requests] = await Promise.all([
    user ? getWatchStatuses(user.id) : Promise.resolve(undefined),
    user ? getRequestMarks() : Promise.resolve(undefined),
  ]);

  if (query) {
    const results = await searchPaged(query).catch(() => null);
    const items = results?.items ?? [];

    return (
      <div className="rise">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Discover</h1>
        <div className="mt-5">
          <SearchBox initialQuery={query} />
        </div>

        <p className="mt-6 text-sm text-ink-400">
          {results?.totalResults?.toLocaleString("en-GB") ?? 0} result
          {results?.totalResults === 1 ? "" : "s"} for “{query}”
        </p>

        {items.length === 0 ? (
          <div className="mt-4">
            <EmptyState
              title="Nothing found"
              body="Try a shorter search, or check the spelling of the title."
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {items.map((item) => (
              <MediaCard
                key={`${item.mediaType}-${item.id}`}
                item={item}
                status={statuses?.get(`${item.mediaType}-${item.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // Narrowing the page skips the requests it cannot use, rather than fetching
  // everything and hiding half of it.
  const wantTv = filter !== "movie";
  const wantMovies = filter !== "tv";

  const [
    trending,
    popularTv,
    popularMovies,
    inCinemas,
    topMovies,
    topTv,
    upcoming,
    upcomingTv,
    newShows,
    genreArtwork,
    { season },
  ] = await Promise.all([
    catalogue(
      filter === "all" ? "/trending/all/week" : `/trending/${filter}/week`,
      filter === "all" ? undefined : filter,
    ).catch(() => null),
    wantTv ? fetchCategory("popular-tv").catch(() => null) : null,
    wantMovies ? fetchCategory("popular-movies").catch(() => null) : null,
    wantMovies ? fetchCategory("in-cinemas").catch(() => null) : null,
    wantMovies ? fetchCategory("top-rated-movies").catch(() => null) : null,
    wantTv ? fetchCategory("top-rated-tv").catch(() => null) : null,
    wantMovies ? fetchCategory("upcoming").catch(() => null) : null,
    wantTv ? fetchCategory("upcoming-tv").catch(() => null) : null,
    wantTv ? fetchCategory("new-shows").catch(() => null) : null,
    getGenreArtwork().catch(() => new Map<string, string | null>()),
    currentSeason(),
  ]);

  // Only fetched while a season is actually on, so the page costs no more than
  // it did for the other nine months of the year.
  const seasonPicks = season
    ? await fetchSeasonPicks(season, filter).catch(() => [])
    : [];

  const allSuggestions = user ? await getSuggestions(user.id).catch(() => []) : [];
  const suggestions =
    filter === "all"
      ? allSuggestions
      : allSuggestions.filter((item) => item.mediaType === filter);

  const spotlight = trending?.items.slice(0, 3) ?? [];
  // The spotlight already covers the top three, so the rail starts at #4.
  const trendingRest = trending?.items.slice(spotlight.length) ?? [];

  return (
    <div className="rise">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Discover</h1>
      <p className="mt-1 text-sm text-ink-400">
        {filter === "tv"
          ? "Shows only: what everyone is watching, plus the all-time greats."
          : filter === "movie"
            ? "Films only: what everyone is watching, plus the all-time greats."
            : "What everyone is watching right now, plus the all-time greats."}
      </p>
      <div className="mt-5">
        <SearchBox />
      </div>

      <nav className="mt-4 flex flex-wrap gap-2">
        {TYPE_FILTERS.map((option) => (
          <Link
            key={option.value}
            href={option.value === "all" ? "/discover" : `/discover?type=${option.value}`}
            aria-current={filter === option.value ? "page" : undefined}
            className={`rounded-full border px-3.5 py-1.5 text-sm transition ${
              filter === option.value
                ? "border-flare-500 bg-flare-600/20 text-ink-100"
                : "border-ink-700 text-ink-300 hover:border-flare-500 hover:bg-ink-800 hover:text-ink-100"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </nav>

      {spotlight.length > 0 && <Spotlight items={spotlight} />}

      {season && seasonPicks.length > 0 && (
        <SeasonBand
          season={season}
          picks={seasonPicks}
          statuses={statuses}
          requests={requests}
        />
      )}

      <NumberedRail
        title="The rest of the top 20"
        description="Where everything else placed this week."
        href="/discover/trending"
        watchedIds={statuses}
        requests={requests}
        items={trendingRest.slice(0, 17)}
        startRank={spotlight.length + 1}
      />

      {/* Below the chart rather than above it: the top 20 continues the
          spotlight directly overhead, and the browsing tools read better as
          "or go and look for something yourself" once that thought is
          finished. */}
      <GenrePicker
        artwork={genreArtwork}
        filter={filter}
        // The season's own genre goes to the front of the row rather than
        // sitting wherever the alphabet left it.
        lead={season ? SEASON_BAND[season].leadGenre : null}
      />

      <CategoryNav type={filter} season={season} />

      {suggestions.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">Things you may like</h2>
          <p className="mt-1 text-sm text-ink-400">
            Based on your watchlist and what you have been watching.
          </p>
          <div className="mt-3">
            <Rail>
              {suggestions.map((item) => (
                <MediaCard
                  key={`${item.mediaType}-${item.id}`}
                  item={item}
                  status={statuses?.get(`${item.mediaType}-${item.id}`)}
                  className="rail-item w-[132px] sm:w-[160px]"
                />
              ))}
            </Rail>
          </div>
        </section>
      )}
      {/* Films get the billboard; a shows-only page has no cinema listing, so
          the most popular series take that slot instead. */}
      <BillboardRail
        title={filter === "tv" ? "Everyone is watching" : "In cinemas now"}
        description={
          filter === "tv"
            ? "The series pulling the biggest audiences this week."
            : "On a screen bigger than yours, right now."
        }
        href={filter === "tv" ? "/discover/popular-tv" : "/discover/in-cinemas"}
        items={filter === "tv" ? (popularTv?.items ?? []) : (inCinemas?.items ?? [])}
      />

      {filter !== "tv" && (
        <CardRail
          title="Popular movies"
          href="/discover/popular-movies"
          watchedIds={statuses}
          requests={requests}
          items={popularMovies?.items ?? []}
        />
      )}
      {filter === "all" && (
        <CardRail
          title="Popular shows"
          href="/discover/popular-tv"
          watchedIds={statuses}
          requests={requests}
          items={popularTv?.items ?? []}
        />
      )}

      {/* Already out, but only just — the gap between "coming soon" and
          "popular", which is where a series you have not heard of yet lives. */}
      <CardRail
        title="New shows"
        description="Premiered in the last few months."
        href="/discover/new-shows"
        watchedIds={statuses}
        requests={requests}
        items={newShows?.items ?? []}
      />

      <SectionBand
        title="On the horizon"
        description="Not out yet. Worth knowing about."
        tone="cool"
      >
        <CardRail
          title="Upcoming shows"
          href="/discover/upcoming-tv"
          watchedIds={statuses}
          requests={requests}
          items={upcomingTv?.items ?? []}
          className="mt-4"
        />
        <CardRail
          title="Coming soon in cinemas"
          href="/discover/upcoming"
          watchedIds={statuses}
          requests={requests}
          items={upcoming?.items ?? []}
          className={filter === "all" ? "mt-6" : "mt-4"}
        />
      </SectionBand>

      <SectionBand
        title="The hall of fame"
        description="The highest rated of all time, by everyone who bothered to vote."
        tone="warm"
      >
        <CardRail
          title="Movies"
          href="/discover/top-rated-movies"
          watchedIds={statuses}
          requests={requests}
          items={topMovies?.items ?? []}
          className="mt-4"
        />
        <CardRail
          title="Shows"
          href="/discover/top-rated-tv"
          watchedIds={statuses}
          requests={requests}
          items={topTv?.items ?? []}
          className={filter === "all" ? "mt-6" : "mt-4"}
        />
      </SectionBand>
    </div>
  );
}

/**
 * The season's own shelf, at the top of the page where the seasonal thing is
 * the point. Every row is a real category with its own page behind it, so
 * "See all" is a proper listing rather than a dead end.
 */
function SeasonBand({
  season,
  picks,
  statuses,
  requests,
}: {
  season: Season;
  picks: SeasonPick[];
  statuses?: Map<string, WatchStatus>;
  requests?: Map<string, "pending" | "partial" | "available">;
}) {
  const band = SEASON_BAND[season];

  return (
    <SectionBand title={band.title} description={band.description} tone={band.tone}>
      {picks.map((pick, index) => (
        <CardRail
          key={pick.slug}
          title={pick.title}
          description={pick.blurb}
          href={`/discover/${pick.slug}`}
          watchedIds={statuses}
          requests={requests}
          items={pick.items}
          className={index === 0 ? "mt-4" : "mt-6"}
        />
      ))}
    </SectionBand>
  );
}

/** Genre tiles: the "find your next watch" entry point. */
function GenrePicker({
  artwork,
  filter,
  lead = null,
}: {
  artwork: Map<string, string | null>;
  filter: DiscoverType;
  /** A genre slug to put first, when the season has one worth pushing. */
  lead?: string | null;
}) {
  // `filter` returns a fresh array, so sorting it in place is safe. The lead
  // genre moves to the front and the rest keep the order they are declared in.
  const genres = GENRES.filter((genre) => filter !== "tv" || genre.tvId !== null).sort(
    (a, b) => Number(b.slug === lead) - Number(a.slug === lead),
  );

  return (
    <section className="mt-8">
      <div className="flex flex-wrap items-start justify-between gap-3 sm:items-center">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Find your next watch</h2>
          <p className="mt-1 text-sm text-ink-400">Pick a mood and dig in.</p>
        </div>
        {/* The one way in, because it is the better answer to "what shall I put
            on": four questions and four picks, rather than a grid of filters to
            reason your way through. `/discover/filter` is still routable and
            still linked from within itself, it simply no longer competes for
            attention here. */}
        <Link
          href="/discover/what-to-watch"
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-flare-600 to-flare-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-flare-600/25 transition hover:from-flare-500 hover:to-flare-400"
        >
          <span aria-hidden className="text-base leading-none">
            🍿
          </span>
          What to watch
        </Link>
      </div>

      <div className="mt-3">
        <Rail>
          {genres.map((genre) => {
            const backdrop = img.backdrop(artwork.get(genre.slug) ?? null, "w780");

            return (
              <Link
                key={genre.slug}
                // Carry the medium through, so a genre opened from the shows
                // view lands on shows.
                href={`/discover/genre/${genre.slug}${filter === "all" ? "" : `?type=${filter}`}`}
                className="rail-item group relative h-[88px] w-[186px] overflow-hidden rounded-xl border border-ink-700/70 transition hover:border-flare-500"
              >
                {backdrop && (
                  <Image
                    src={backdrop}
                    alt=""
                    fill
                    sizes="186px"
                    className="object-cover transition duration-700 group-hover:scale-110"
                  />
                )}
                <div className="absolute inset-0 bg-black/55 transition group-hover:bg-black/40" />
                <div className="absolute inset-0 bg-gradient-to-tr from-flare-600/40 to-transparent mix-blend-soft-light" />
                <span className="absolute inset-x-3 bottom-2.5 text-sm font-semibold text-white drop-shadow">
                  {genre.label}
                </span>
              </Link>
            );
          })}
        </Rail>
      </div>
    </section>
  );
}

function Spotlight({ items }: { items: NormalisedItem[] }) {
  const [lead, ...rest] = items;

  return (
    <section className="mt-6">
      {/* Mobile: one card at a time, swiped and auto-advancing. Desktop: the
          lead plus a stack. */}
      <div className="lg:hidden">
        <SpotlightCarousel>
          {items.map((item, i) => (
            <SpotlightCard key={item.id} item={item} rank={i + 1} lead />
          ))}
        </SpotlightCarousel>
      </div>

      <div className="hidden gap-3 lg:grid lg:grid-cols-[1.7fr_1fr]">
        <SpotlightCard item={lead} rank={1} lead />

        <div className="grid gap-3">
          {rest.map((item, i) => (
            <SpotlightCard key={item.id} item={item} rank={i + 2} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SpotlightCard({
  item,
  rank,
  lead = false,
}: {
  item: NormalisedItem;
  rank: number;
  lead?: boolean;
}) {
  const backdrop = img.backdrop(item.backdrop, lead ? "w1280" : "w780");

  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      // Black base: the artwork is absolutely positioned, and any sub-pixel
      // rounding at the edges would otherwise show the page behind it.
      className={`group relative flex overflow-hidden rounded-2xl bg-black shadow-xl shadow-black/40 transition duration-500 ${
        lead ? "min-h-[280px] sm:min-h-[360px]" : "min-h-[172px]"
      }`}
    >
      {/* Absolute fill rather than an aspect box: the card stretches to the
          grid row height, and the artwork has to stretch with it. The -1px
          inset closes the hairline the browser can leave along the edges. */}
      <div className="absolute -inset-px">
        {backdrop && (
          <Image
            src={backdrop}
            alt=""
            fill
            priority={lead}
            sizes={lead ? "(max-width: 1024px) 100vw, 760px" : "(max-width: 1024px) 50vw, 380px"}
            className="object-cover transition duration-[1200ms] ease-out group-hover:scale-[1.06]"
          />
        )}
        <div className="scrim-full absolute inset-0" />
        {/* Warm sheen across the top corner, and a soft highlight along the top
            edge only — a full inset ring reads as a white hairline in light
            mode, where it meets a pale page instead of a dark one. */}
        <div className="absolute inset-0 bg-gradient-to-br from-flare-600/25 via-transparent to-ember-500/15 mix-blend-soft-light" />
      </div>

      <div className={`relative mt-auto w-full ${lead ? "p-5 sm:p-7" : "p-4"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[0.15em] text-white uppercase backdrop-blur-md ${
              rank === 1 ? "shadow-lg shadow-ember-500/20" : ""
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                rank === 1 ? "bg-ember-400" : "bg-white/70"
              }`}
            />
            #{rank}
          </span>
          <ScoreBadge score={item.score} />
          <span className="text-[11px] text-white/70">
            {item.mediaType === "tv" ? "Show" : "Movie"}
            {item.year ? ` · ${item.year}` : ""}
          </span>
        </div>

        <h2
          className={`mt-2 font-semibold tracking-tight text-white drop-shadow-lg ${
            lead ? "text-2xl sm:text-4xl" : "text-base"
          }`}
        >
          {item.title}
        </h2>
        <p
          className={`mt-1.5 max-w-lg text-xs leading-relaxed text-white/75 ${
            lead ? "line-clamp-3" : "line-clamp-2"
          }`}
        >
          {item.overview}
        </p>

        {/* Explicitly black, not `text-ink-950`: the ink ramp inverts in light
            mode, which would put white text on this white pill. */}
        {lead && (
          <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-4 py-2 text-xs font-semibold text-black transition group-hover:bg-white">
            View details
            <ChevronRight size={14} />
          </span>
        )}
      </div>
    </Link>
  );
}
