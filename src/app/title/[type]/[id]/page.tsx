import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, CircleSlash, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getRatingContext } from "@/lib/rating-context";
import { getRequestMarks } from "@/lib/request-marks";
import { getFriendReviews } from "@/lib/reviews";
import { getWatchStatuses } from "@/lib/stats";
import {
  countAiredEpisodes,
  getMovie,
  getTv,
  img,
  normalise,
  pickLogo,
  pickTrailer,
  tmdbConfigured,
  type NormalisedItem,
  type Review,
  type TitleLogo,
} from "@/lib/tmdb";
import { CardRail } from "@/components/media-card";
import { BackButton } from "@/components/back-button";
import { avatarUrl } from "@/lib/avatar";
import { displayEmail } from "@/lib/plex-seat";
import { getNotifications } from "@/lib/notification-centre";
import { heroColours, type HeroColours } from "@/lib/palette";
import { getSeasonEpisodes } from "@/lib/up-next-rail";
import { NotificationBell } from "@/components/notification-bell";
import { UserMenu } from "@/components/user-menu";
import { ScoreStats } from "@/components/score-stats";
import { MarkShowButton } from "@/components/mark-show-button";
import { TitleBackdrop } from "@/components/title-backdrop";
import { TitleHeroArt } from "@/components/title-hero-art";
import { SeerrBadge } from "@/components/seerr-badge";
import { Rail } from "@/components/rail";
import { RatingWidget } from "@/components/rating-widget";
import { SeasonBrowser } from "@/components/season-browser";
import { ShowProgress } from "@/components/show-progress";
import { ShowSections } from "@/components/show-sections";
import { UpNextRail } from "@/components/up-next-rail";
import { Synopsis } from "@/components/synopsis";
import { TrackButtons } from "@/components/track-buttons";
import { FavouriteButton } from "@/components/favourite-button";
import { getSaveState, type SaveState } from "@/lib/lists";
import { SetupNotice, Skeleton, SkeletonRail, WatchedPill } from "@/components/ui";
import { TitleMenu } from "@/components/title-menu";
import { TitleReviews } from "@/components/title-reviews";
import { TitleTrailer } from "@/components/title-trailer";
import { TrailerButton } from "@/components/trailer-button";
import { StreamingStrip } from "@/components/where-to-watch";

type Params = { type: string; id: string };

export default async function TitlePage({ params }: { params: Promise<Params> }) {
  const { type, id } = await params;
  const tmdbId = Number(id);
  if ((type !== "movie" && type !== "tv") || !Number.isInteger(tmdbId)) notFound();

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const user = await getCurrentUser();

  return type === "movie" ? (
    <MovieView tmdbId={tmdbId} user={user} />
  ) : (
    <TvView tmdbId={tmdbId} user={user} />
  );
}

/**
 * The page's background, in the colour the hero's fade ends on.
 *
 * Phone only, like the fade it continues — desktop keeps the app's own
 * background under the older backdrop treatment.
 *
 * Mounted outside the article's `.rise` wrapper deliberately: `.rise` animates a
 * transform, which makes it the containing block for anything fixed inside it,
 * and this has to be fixed to the window.
 */
function PageTint({ colour }: { colour: string | null }) {
  if (!colour) return null;

  return (
    <div
      aria-hidden
      style={{ backgroundColor: colour }}
      className="page-tint pointer-events-none fixed inset-0 -z-20 sm:hidden"
    />
  );
}

/**
 * Everything `getCurrentUser` returns, rather than the two fields the page used
 * to need. The floating row on a phone stands in for the nav now, and the avatar
 * menu in it wants the name, the email and the avatar stamp.
 */
type SessionUser = Awaited<ReturnType<typeof getCurrentUser>>;

/**
 * The "you might also like" rail, and the two lookups that decorate it.
 *
 * Those lookups are why this is its own component. `getWatchStatuses` resolves
 * how far you have got with *every show you have ever watched* — a TMDB request
 * or two per show, six at a time — and `getRequestMarks` is a round trip to
 * Overseerr. Both were being started up with the page's own data so they would
 * not be awaited inside the JSX, which fixed one problem and created a worse
 * one: nothing at all could be sent to the browser until a fan-out across the
 * viewer's whole library had finished, for the sake of a tick in the corner of
 * some posters at the very bottom of the page.
 *
 * Down here behind a `Suspense`, the page renders as soon as the title itself is
 * ready and this arrives when it arrives. Same trick the score figures and the
 * streaming strip already use.
 */
async function Recommendations({
  items,
  user,
}: {
  items: NormalisedItem[];
  user: SessionUser;
}) {
  const [watchedIds, requests] = await Promise.all([
    user ? getWatchStatuses(user.id) : Promise.resolve(undefined),
    user ? getRequestMarks() : Promise.resolve(undefined),
  ]);

  /**
   * Nothing already seen. A suggestion is a suggestion — a row of films you
   * watched years ago is a list of things you have no decision left to make
   * about, and it was crowding out the ones you do.
   *
   * A show you are part-way through stays: "continue" is still an answer to
   * "what next", and dropping it would hide the very thing being recommended.
   */
  const unseen = items.filter((item) => {
    const status = watchedIds?.get(`${item.mediaType}-${item.id}`);
    return status !== "watched" && status !== "completed";
  });

  if (unseen.length === 0) return null;

  return (
    <CardRail
      title="You might also like"
      items={unseen}
      watchedIds={watchedIds}
      requests={requests}
    />
  );
}

/**
 * Holds a chip-sized space while a badge works out what it says.
 *
 * These all reach a server the browser is not waiting on — Plex, Overseerr,
 * OMDb — so they arrive after the rest of the page. With nothing in their place
 * the action row assembled itself in front of the viewer and everything beside
 * them jumped sideways as each one landed.
 */
function ChipFallback({ width }: { width: string }) {
  return <Skeleton className={`h-9 ${width} rounded-xl`} />;
}

/**
 * The bell and the avatar, floating at the top of a phone's title page.
 *
 * They are the two things the hidden nav took with it that are worth having
 * everywhere — one tells you something happened, the other is the way to the
 * rest of the account. Rendered exactly as the header renders them, in the same
 * order, at the same end of the row: a page that hides the nav should still put
 * its hand on the same two things in the same corner.
 */
async function TitleChrome({ user }: { user: NonNullable<SessionUser> }) {
  const { items } = await getNotifications(user.id);

  return (
    // The same material as the back button facing it across the row, and as
    // every card further down. `[&_button]:text-white` reaches the bell inside,
    // which is otherwise a ramp grey that reads as disabled here; the avatar has
    // no glyph to colour and is unaffected.
    <div className="ios-surface pointer-events-auto flex h-[42px] items-center rounded-full border border-ink-600/80 px-1 shadow-lg shadow-black/40 [&_button]:h-[42px] [&_button]:w-[42px] [&_button]:text-white">
      <NotificationBell items={items} />
      <UserMenu
        name={user.name}
        email={displayEmail(user.email)}
        avatarUrl={avatarUrl(user)}
        seasonSetting={null}
        canSwitchProfile={Boolean(user.plexAccountId)}
      />
    </div>
  );
}

/**
 * The heart and the overflow menu, on the end of the action row.
 *
 * Both layouts put them in the same place now. They used to float at the top of
 * the page on a phone, which asked the corner reserved for getting *out* of a
 * title to also carry decisions about it. Down here they join the watch and
 * watchlist buttons, and all four are the same claim in different words — "I
 * have seen this", "I mean to", "I love it", "and the rest".
 *
 * Both are square at the pills' own height rather than sized to their glyphs:
 * controls of three different heights on one row read as an accident.
 */
function TitleExtras({
  user,
  trailerKey,
  title,
  backdrop,
  isCover,
  mediaType,
  tmdbId,
  favourite,
  show,
}: {
  user: SessionUser;
  /** Opens the trailer from the action row. Desktop only — see `TrailerButton`. */
  trailerKey: string | null;
  title: string;
  backdrop: string | null;
  isCover: boolean;
  mediaType: "movie" | "tv";
  tmdbId: number;
  /** The title as the heart needs it, and whether it is already hearted. */
  favourite: { on: boolean; poster: string | null; score: number | null; year: string | null };
  show?: { showId: number; dropped: boolean; canDrop: boolean };
}) {
  return (
    <>
      {/* Ahead of the heart, so the row reads watch · save · trailer · love ·
          more — the two claims about the film, then the two about you. */}
      {trailerKey && <TrailerButton videoKey={trailerKey} title={title} />}
      {user && (
        <FavouriteButton
          variant="button"
          initial={favourite.on}
          item={{
            mediaType,
            tmdbId,
            title,
            poster: favourite.poster,
            score: favourite.score,
            year: favourite.year,
          }}
        />
      )}
      {user && (
        <TitleMenu
          variant="button"
          backdrop={backdrop}
          title={title}
          isCover={isCover}
          show={show}
          request={
            /* Keyed because this node is built on the server and handed to a
               client component. Crossing that boundary turns `TitleMenu`'s
               children into a real runtime array rather than the static list
               the compiler saw, and React validates keys on arrays — so the
               menu warned about a child it never mapped over. */
            <Suspense key="request" fallback={null}>
              <SeerrBadge
                userId={user.id}
                mediaType={mediaType}
                tmdbId={tmdbId}
                title={title}
                variant="menu"
              />
            </Suspense>
          }
        />
      )}
    </>
  );
}

async function trackingState(
  user: SessionUser,
  mediaType: "movie" | "tv",
  tmdbId: number,
) {
  if (!user) {
    return {
      watched: false,
      watchedAt: null,
      plays: 0,
      saveState: { targets: [], favourite: false } satisfies SaveState,
      rating: null,
      coverBackdrop: null,
      dropped: false,
    };
  }

  const [movie, saveState, rating, profile, dropped] = await Promise.all([
    mediaType === "movie"
      ? db.watchedMovie.findUnique({
          where: { userId_movieId: { userId: user.id, movieId: tmdbId } },
        })
      : Promise.resolve(null),
    getSaveState(user.id, mediaType, tmdbId),
    db.rating.findUnique({
      where: { userId_mediaType_tmdbId: { userId: user.id, mediaType, tmdbId } },
    }),
    db.user.findUnique({ where: { id: user.id }, select: { coverBackdrop: true } }),
    mediaType === "tv"
      ? db.droppedShow.findUnique({
          where: { userId_showId: { userId: user.id, showId: tmdbId } },
        })
      : Promise.resolve(null),
  ]);

  return {
    watched: Boolean(movie),
    // The pill shows the most recent viewing — "when did I last see this" is
    // what someone looking at the button wants to know. `watchedAt` on the row
    // is the first one, and it is what the rewatch history is measured from.
    watchedAt: movie?.lastWatchedAt ?? movie?.watchedAt ?? null,
    plays: movie?.plays ?? 0,
    saveState,
    rating,
    coverBackdrop: profile?.coverBackdrop ?? null,
    dropped: Boolean(dropped),
  };
}

async function MovieView({ tmdbId, user }: { tmdbId: number; user: SessionUser }) {
  const movie = await getMovie(tmdbId).catch(() => null);
  if (!movie) notFound();

  // Started together rather than awaited one after another inside the JSX. Both
  // of these belong to the recommendation rail at the very bottom of the page,
  // and awaiting them down there held up everything above it too.
  const [state, friendReviews, colours] = await Promise.all([
    trackingState(user, "movie", tmdbId),
    user ? getFriendReviews(user.id, "movie", tmdbId) : Promise.resolve([]),
    // In here rather than after: it is a second trip to TMDB and a decode, and
    // awaiting it on its own added all of that to the page's critical path for
    // no reason — everything it needs is already known by this point.
    heroColours(movie.backdrop_path ?? movie.poster_path),
  ]);

  const recommendations = movie.recommendations.results
    .map((r) => normalise(r, "movie"))
    .filter((r) => r !== null);

  const movieTrailer = pickTrailer(movie.videos);

  return (
    <>
      <PageTint colour={colours?.tint ?? null} />
      {/*
        Outside the `rise` article, on purpose, and above it in the tree.

        Two reasons, both structural. A sticky element can only travel inside its
        own parent, so this has to be a sibling of the whole page rather than
        live in the header — otherwise it has forty pixels to work with and never
        appears to stick at all. And `.rise` animates transform and opacity,
        which makes it a backdrop root: anything inside it can only blur what is
        also inside it, which left these controls frosted over the artwork and
        clear over everything else.
      */}
      <BackButton
        actions={
          // Phones only: this row stands in for the header they cannot see, and
          // on desktop the header itself is still there.
          user && (
            <div className="sm:hidden">
              <Suspense fallback={null}>
                <TitleChrome user={user} />
              </Suspense>
            </div>
          )
        }
      />

      <article className="rise title-page">
      <Hero
        title={movie.title}
        tagline={movie.tagline}
        overview={movie.overview}
        poster={movie.poster_path}
        logo={pickLogo(movie.images)}
        colours={colours}
        watchedOn={state.watchedAt}
        plays={state.plays}
        backdrop={movie.backdrop_path}
        meta={[
          movie.release_date?.slice(0, 4),
          movie.genres.map((g) => g.name).join(", ") || null,
          movie.runtime ? `${movie.runtime} min` : null,
          `${movie.vote_count.toLocaleString("en-GB")} vote${movie.vote_count === 1 ? "" : "s"}`,
          movie.status,
        ]}
        scores={
          <Suspense fallback={<Skeleton className="h-11 w-56 rounded-lg sm:h-6 sm:w-72 sm:rounded-full" />}>
            <ScoreStats
              imdbId={movie.external_ids?.imdb_id ?? null}
              audience={Math.round(movie.vote_average * 10)}
            />
          </Suspense>
        }
        actions={
          <TrackButtons
            signedIn={Boolean(user)}
            initialWatched={state.watched}
            initialWatchedAt={state.watchedAt}
            initialPlays={state.plays}
            saveState={state.saveState}
            item={{
              mediaType: "movie",
              tmdbId,
              title: movie.title,
              poster: movie.poster_path,
              runtime: movie.runtime,
              score: Math.round(movie.vote_average * 10),
              releaseDate: movie.release_date,
            }}
          />
        }
        extras={
          <TitleExtras
            user={user}
            trailerKey={movieTrailer?.key ?? null}
            title={movie.title}
            backdrop={movie.backdrop_path}
            isCover={state.coverBackdrop === movie.backdrop_path}
            mediaType="movie"
            tmdbId={tmdbId}
            favourite={{
              on: state.saveState.favourite,
              poster: movie.poster_path,
              score: Math.round(movie.vote_average * 10),
              year: movie.release_date?.slice(0, 4) ?? null,
            }}
          />
        }
        // Nothing to rate until you have seen it.
        rating={
          user && state.watched ? (
            <RatingWidget
              mediaType="movie"
              tmdbId={tmdbId}
              title={movie.title}
              poster={movie.poster_path}
              initialScore={state.rating?.score ?? null}
              initialReview={state.rating?.review ?? null}
              signedIn
              context={await getRatingContext(
                user.id,
                "movie",
                tmdbId,
                Math.round(movie.vote_average * 10) || null,
              )}
            />
          ) : null
        }
        streaming={
          <Suspense fallback={<ChipFallback width="w-48" />}>
            <StreamingStrip
              mediaType="movie"
              tmdbId={tmdbId}
              userId={user?.id ?? null}
              title={movie.title}
              year={movie.release_date?.slice(0, 4) ?? null}
            />
          </Suspense>
        }
      />

      <Cast cast={movie.credits.cast} href={`/title/movie/${tmdbId}/cast`} />
      {movieTrailer && (
        <div className="sm:hidden">
          <TitleTrailer videoKey={movieTrailer.key} title={movie.title} />
        </div>
      )}
      <Reviews reviews={movie.reviews.results} />
      <TitleReviews
        mediaType="movie"
        tmdbId={tmdbId}
        rated={state.rating !== null}
        initialReview={state.rating?.review ?? null}
        friends={friendReviews}
        signedIn={Boolean(user)}
      />
      <Suspense fallback={<SkeletonRail label="Loading recommendations" />}>
        <Recommendations items={recommendations.slice(0, 14)} user={user} />
      </Suspense>
      </article>
    </>
  );
}

async function TvView({ tmdbId, user }: { tmdbId: number; user: SessionUser }) {
  const show = await getTv(tmdbId).catch(() => null);
  if (!show) notFound();

  const seasons = show.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0);

  const [state, watchedEpisodes, friendReviews, colours] = await Promise.all([
    trackingState(user, "tv", tmdbId),
    user
      ? db.watchedEpisode.findMany({
          where: { userId: user.id, showId: tmdbId },
          select: { seasonNumber: true, episodeNumber: true, watchedAt: true },
        })
      : Promise.resolve([]),
    user ? getFriendReviews(user.id, "tv", tmdbId) : Promise.resolve([]),
    // In here rather than after — see the note in `MovieView`.
    heroColours(show.backdrop_path ?? show.poster_path),
  ]);

  const watchedCounts: Record<number, number> = {};
  for (const e of watchedEpisodes) {
    watchedCounts[e.seasonNumber] = (watchedCounts[e.seasonNumber] ?? 0) + 1;
  }

  // Progress is measured against released episodes, not the full order.
  const airedEpisodes = countAiredEpisodes(show);
  const orderedEpisodes = seasons.reduce((sum, s) => sum + s.episode_count, 0);
  const unaired = Math.max(0, orderedEpisodes - airedEpisodes);
  const ended = show.status === "Ended" || show.status === "Canceled";

  // The most recent episode of this show the viewer logged, whichever it was.
  const lastWatchedAt = watchedEpisodes.reduce<Date | null>(
    (latest, e) => (!latest || e.watchedAt > latest ? e.watchedAt : latest),
    null,
  );

  /**
   * "More to come" is about a whole season being pending, not about a season
   * that is still airing week to week. If the current run has episodes left in
   * it, the progress bar is still the honest thing to show — there is ground
   * left to cover inside the season the viewer is already on.
   */
  const lastAired = show.last_episode_to_air;
  const currentSeason = show.seasons.find(
    (s) => s.season_number === lastAired?.season_number,
  );
  const currentSeasonStillAiring = Boolean(
    lastAired && currentSeason && lastAired.episode_number < currentSeason.episode_count,
  );
  const nextSeasonPending = show.next_episode_to_air
    ? show.next_episode_to_air.season_number > (lastAired?.season_number ?? 0)
    : // No date announced: a returning series still has one coming, eventually.
      show.status === "Returning Series";

  const seasonToCome = !ended && !currentSeasonStillAiring && nextSeasonPending;

  const nextUp = findNextEpisode(seasons, watchedEpisodes);

  // Resume where they left off: the season of the next unwatched episode, or
  // failing that the furthest season they have watched anything in.
  const furthestWatched = watchedEpisodes.reduce(
    (highest, e) => Math.max(highest, e.seasonNumber),
    0,
  );
  const resumeSeason =
    nextUp?.season ?? (furthestWatched > 0 ? furthestWatched : undefined);

  const recommendations = show.recommendations.results
    .map((r) => normalise(r, "tv"))
    .filter((r) => r !== null);

  const runtime = show.episode_run_time?.[0] ?? 42;
  const showTrailer = pickTrailer(show.videos);

  return (
    <>
      <PageTint colour={colours?.tint ?? null} />
      {/* Outside the `rise` article — see the note in the film view. */}
      <BackButton
        actions={
          // Phones only — see the film view.
          user && (
            <div className="sm:hidden">
              <Suspense fallback={null}>
                <TitleChrome user={user} />
              </Suspense>
            </div>
          )
        }
      />

      <article className="rise title-page">
      <Hero
        title={show.name}
        tagline={show.tagline}
        overview={show.overview}
        overviewDesktopOnly
        poster={show.poster_path}
        logo={pickLogo(show.images)}
        colours={colours}
        backdrop={show.backdrop_path}
        meta={[
          show.first_air_date?.slice(0, 4),
          show.genres.map((g) => g.name).join(", ") || null,
          `${show.number_of_seasons} season${show.number_of_seasons === 1 ? "" : "s"}, ${show.number_of_episodes} episodes`,
          `${show.vote_count.toLocaleString("en-GB")} vote${show.vote_count === 1 ? "" : "s"}`,
          show.status,
        ]}
        scores={
          <Suspense fallback={<Skeleton className="h-11 w-56 rounded-lg sm:h-6 sm:w-72 sm:rounded-full" />}>
            <ScoreStats
              imdbId={show.external_ids?.imdb_id ?? null}
              audience={Math.round(show.vote_average * 10)}
            />
          </Suspense>
        }
        actions={
          <TrackButtons
            signedIn={Boolean(user)}
            initialWatched={false}
            saveState={state.saveState}
            item={{
              mediaType: "tv",
              tmdbId,
              title: show.name,
              poster: show.poster_path,
              score: Math.round(show.vote_average * 10),
            }}
          />
        }
        extras={
          <TitleExtras
            user={user}
            trailerKey={showTrailer?.key ?? null}
            title={show.name}
            backdrop={show.backdrop_path}
            isCover={state.coverBackdrop === show.backdrop_path}
            mediaType="tv"
            tmdbId={tmdbId}
            favourite={{
              on: state.saveState.favourite,
              poster: show.poster_path,
              score: Math.round(show.vote_average * 10),
              year: show.first_air_date?.slice(0, 4) ?? null,
            }}
            show={{
              showId: tmdbId,
              dropped: state.dropped,
              canDrop: !(ended && nextUp === null),
            }}
          />
        }
        // One episode in is enough to have a view; nothing watched is not.
        rating={
          user && watchedEpisodes.length > 0 ? (
            <RatingWidget
              mediaType="tv"
              tmdbId={tmdbId}
              title={show.name}
              poster={show.poster_path}
              initialScore={state.rating?.score ?? null}
              initialReview={state.rating?.review ?? null}
              signedIn
              context={await getRatingContext(
                user.id,
                "tv",
                tmdbId,
                Math.round(show.vote_average * 10) || null,
              )}
            />
          ) : null
        }
        streaming={
          <Suspense fallback={<ChipFallback width="w-48" />}>
            <StreamingStrip
              mediaType="tv"
              tmdbId={tmdbId}
              userId={user?.id ?? null}
              title={show.name}
              year={show.first_air_date?.slice(0, 4) ?? null}
            />
          </Suspense>
        }
      />

      {/* Given up on: say so, and drop the progress panel with it. "You are 34%
          through" is an answer to a question this viewer has stopped asking,
          and leaving it up made stopping look like it had not registered. */}
      {user && state.dropped && (
        // Loud enough to be the answer to "why is this not in my up next any
        // more" without being an error: an amber left edge and a tinted panel,
        // which is the shape the eye already reads as "a state, deliberately
        // chosen" rather than "something went wrong".
        <div className="card mt-6 flex flex-wrap items-center gap-4 border-l-4 border-l-ember-500 border-ink-700/70 bg-ember-500/10 p-5 light:bg-ember-500/15">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ember-500/20 text-ember-400">
            <CircleSlash size={21} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-semibold text-ember-400">You stopped watching this</p>
            <p className="mt-1 text-sm text-ink-300">
              It is out of your up next and off the calendar. Everything you logged is still
              here — pick it back up whenever.
            </p>
          </div>
        </div>
      )}

      <ShowSections
        details={
          <>
            {/* Phone only: on desktop this is still up in the hero, beside the
                poster, which is where a show's synopsis has always been. */}
            {show.overview && (
              <section className="mt-6 sm:hidden">
                <Synopsis text={show.overview} />
              </section>
            )}
            {showTrailer && (
              <div className="sm:hidden">
                <TitleTrailer videoKey={showTrailer.key} title={show.name} />
              </div>
            )}
            <Cast cast={show.credits.cast} href={`/title/tv/${tmdbId}/cast`} />
            <Reviews reviews={show.reviews.results} />
            <TitleReviews
              mediaType="tv"
              tmdbId={tmdbId}
              rated={state.rating !== null}
              initialReview={state.rating?.review ?? null}
              friends={friendReviews}
              signedIn={Boolean(user)}
            />
            <Suspense fallback={<SkeletonRail label="Loading recommendations" />}>
              <Recommendations items={recommendations.slice(0, 14)} user={user} />
            </Suspense>
          </>
        }
        episodes={
          <>
      {user && !state.dropped && watchedEpisodes.length > 0 && (
        <ShowProgress
          showName={show.name}
          ended={ended}
          seasonToCome={seasonToCome}
          airedEpisodes={airedEpisodes}
          unaired={unaired}
          watchedCount={watchedEpisodes.length}
          seasonCount={seasons.length}
          runtime={runtime}
          score={Math.round(show.vote_average * 10)}
          nextAirDate={show.next_episode_to_air?.air_date ?? null}
          lastWatchedAt={lastWatchedAt}
          nextUp={nextUp}
        />
      )}

      {seasons.length > 0 && (
        <Suspense fallback={<SkeletonRail label="Loading episodes" />}>
          <UpNext
            show={show}
            showId={tmdbId}
            seasons={seasons.map((season) => season.season_number)}
            seasonSizes={Object.fromEntries(
              seasons.map((season) => [season.season_number, season.episode_count]),
            )}
            watchedCounts={watchedCounts}
            from={resumeSeason ?? seasons[0]!.season_number}
            watched={watchedEpisodes}
            signedIn={Boolean(user)}
          />
        </Suspense>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 pr-3 sm:pr-4">
        <h2 className="text-lg font-semibold tracking-tight">
          <span className="sm:hidden">All episodes</span>
          <span className="hidden sm:inline">Episodes</span>
        </h2>
        {user && seasons.length > 0 && (
          <MarkShowButton
            showId={tmdbId}
            showName={show.name}
            showPoster={show.poster_path}
            hasProgress={watchedEpisodes.length > 0}
            fullyWatched={airedEpisodes > 0 && watchedEpisodes.length >= airedEpisodes}
            watched={watchedEpisodes.length}
            total={airedEpisodes + unaired}
          />
        )}
      </div>
      {seasons.length > 0 ? (
        <SeasonBrowser
          showId={tmdbId}
          showName={show.name}
          showPoster={show.poster_path}
          signedIn={Boolean(user)}
          initialSeason={resumeSeason}
          watchedCounts={watchedCounts}
          seasons={seasons.map((s) => ({
            seasonNumber: s.season_number,
            name: s.name,
            episodeCount: s.episode_count,
            score: Math.round((s.vote_average ?? 0) * 10),
          }))}
        />
      ) : (
        <p className="mt-3 text-sm text-ink-400">No episodes listed yet.</p>
      )}

            {/* Phone only: desktop has no tabs, so the copy in the Details
                half below is already the one and only. */}
            <div className="sm:hidden">
              <Suspense fallback={<SkeletonRail label="Loading recommendations" />}>
                <Recommendations items={recommendations.slice(0, 14)} user={user} />
              </Suspense>
            </div>
          </>
        }
      />
      </article>
    </>
  );
}

/**
 * The "watch next" row, and the one season it starts from.
 *
 * Its own component behind a `Suspense` for the same reason the recommendations
 * are: it costs a TMDB request, and the progress card above it is ready long
 * before that lands. Only the season the viewer is up to is fetched here — the
 * row asks for the rest itself, as they scroll towards them.
 */
async function UpNext({
  show,
  showId,
  seasons,
  seasonSizes,
  watchedCounts,
  from,
  watched,
  signedIn,
}: {
  show: { name: string; poster_path: string | null; status?: string | null };
  showId: number;
  /** Season numbers with episodes, ascending. */
  seasons: number[];
  /** Season number → episode count, and → how many are logged. */
  seasonSizes: Record<number, number>;
  watchedCounts: Record<number, number>;
  from: number;
  watched: { seasonNumber: number; episodeNumber: number }[];
  signedIn: boolean;
}) {
  const episodes = await getSeasonEpisodes(showId, from);
  if (episodes.length === 0) return null;

  return (
    <UpNextRail
      showId={showId}
      showName={show.name}
      showPoster={show.poster_path}
      seasons={seasons}
      seasonSizes={seasonSizes}
      watchedCounts={watchedCounts}
      initialSeason={from}
      initialEpisodes={episodes}
      initialWatched={watched.map((w) => `${w.seasonNumber}-${w.episodeNumber}`)}
      signedIn={signedIn}
      // TMDB only flips a show to Ended once it is actually over, so this is
      // what separates a season finale from a series one.
      showEnded={show.status === "Ended" || show.status === "Canceled"}
    />
  );
}

/** First unwatched episode, scanning seasons in order. */
function findNextEpisode(
  seasons: { season_number: number; episode_count: number }[],
  watched: { seasonNumber: number; episodeNumber: number }[],
) {
  if (watched.length === 0) return null;
  const seen = new Set(watched.map((w) => `${w.seasonNumber}-${w.episodeNumber}`));

  for (const season of seasons) {
    for (let ep = 1; ep <= season.episode_count; ep++) {
      if (!seen.has(`${season.season_number}-${ep}`)) {
        return { season: season.season_number, episode: ep };
      }
    }
  }
  return null;
}

function Hero({
  title,
  tagline,
  overview,
  overviewDesktopOnly,
  poster,
  logo,
  backdrop,
  colours,
  meta,
  /** When this was last watched, in words. Null when it has not been. */
  watchedOn,
  plays,
  actions,
  extras,
  scores,
  rating,
  streaming,
}: {
  title: string;
  tagline: string;
  overview: string;
  /**
   * A show's synopsis belongs to the Details tab at phone widths, and to the
   * hero on desktop where there are no tabs. Films keep it here at every width.
   */
  overviewDesktopOnly?: boolean;
  poster: string | null;
  /**
   * The film's own title treatment, where TMDB has one. Plenty of titles have
   * none, so the heading is set in type whenever this is null.
   */
  logo: TitleLogo | null;
  backdrop: string | null;
  /** Sampled from the artwork, for the fade under it. Phone only. */
  colours: HeroColours | null;
  /** Year · genres · length · votes · status, in that order, blanks dropped. */
  meta: (string | null | undefined)[];
  /**
   * The raw date rather than a formatted one. It used to arrive pre-printed,
   * which is what let this drift away from the chip an episode wears — the
   * wording, the year, the way a rewatch is counted were all decided here
   * instead of in the one component that draws it.
   */
  watchedOn?: Date | string | null;
  plays?: number;
  /** The primary pair: watch and watchlist. */
  actions: React.ReactNode;
  /**
   * The heart and the overflow menu, on the same row as the primary pair — on
   * both layouts. They are square icons at the pills' height, so the row still
   * fits a phone; if it does not, it wraps.
   */
  extras?: React.ReactNode;
  /** IMDb / audience / critics, as figures. */
  scores?: React.ReactNode;
  /** The viewer's own score bar, directly under the primary buttons. */
  rating?: React.ReactNode;
  /** Your server and the streaming services, in one strip. */
  streaming?: React.ReactNode;
}) {
  const posterUrl = img.poster(poster, "w342");
  const logoUrl = img.logo(logo?.path);

  /**
   * The two views want the same pieces in a different order.
   *
   * Desktop: buttons and the secondary chips share one row at the foot of the
   * text column, streaming sits under the hero, the score bar under that.
   * Mobile: buttons, then the score bar directly beneath them, then the chips
   * and streaming as panels below.
   *
   * Rather than render anything twice — `TitleMenu` and the trailer are stateful
   * and a second copy would be a second dropdown — the wrappers are `contents`
   * at phone widths. That dissolves them, every piece becomes a direct child of
   * this header, and `order` is free to put them in any sequence. On desktop the
   * same wrappers are real boxes again and the layout is exactly what it was.
   */
  return (
    <header className="relative max-sm:flex max-sm:flex-col max-sm:gap-5 max-sm:pt-3 max-sm:pb-5">
      {/* Two treatments, because the two layouts are doing different jobs.
          Desktop puts the text beside the artwork, where a wide backdrop
          dissolving into the page is exactly right and always was. A phone puts
          the text on the artwork, which is what the colour-matched fade, the
          blur and the parallax are all for. */}
      <div className="hidden sm:block">
        <TitleBackdrop backdrop={backdrop} />
      </div>
      <TitleHeroArt backdrop={backdrop} poster={poster} colours={colours} />

      {/*
        The row runs from the title down to the bottom of the button row. On
        desktop it holds a floor of 400px whatever the film — so the poster
        beside it lines up with both ends — and grows past it when the synopsis
        is opened.
      */}
      <div className="relative flex flex-col gap-5 pt-3 max-sm:contents sm:min-h-[400px] sm:flex-row sm:gap-6 sm:pt-5">
        {/* A fixed height rather than the height of the row: the row is free to
            grow when the synopsis is opened, and the poster should hold its
            shape when it does rather than stretch to follow. */}
        <div className="relative mx-auto hidden h-48 w-32 shrink-0 self-start overflow-hidden rounded-xl bg-ink-800 shadow-2xl shadow-black/50 sm:mx-0 sm:block sm:aspect-2/3 sm:h-[400px] sm:w-auto">
          {posterUrl && (
            <Image src={posterUrl} alt="" fill sizes="270px" className="object-cover" />
          )}
        </div>

        {/* Only the text above the buttons is clipped to the row. The button
            row itself must not be, or the overflow menu is cut off the moment
            it opens. */}
        <div className="flex min-w-0 flex-1 flex-col max-sm:contents">
          {/* Pushed down the artwork on a phone so the title lands where the
              plate has already faded out, and centred over it. */}
          <div className="artwork-text flex min-h-0 flex-1 flex-col pt-[228px] text-center max-sm:order-1 sm:pt-0 sm:text-left">
            {/* The heading stays in the markup whether or not there is a logo:
                the logo is artwork with the title drawn into it, and a page
                whose only h1 is an image has no heading at all as far as a
                screen reader or a search engine is concerned. It is hidden only
                where the logo is actually shown — on a phone. */}
            <h1
              className={`text-3xl leading-tight font-semibold tracking-tight sm:text-4xl sm:leading-none ${
                logoUrl ? "max-sm:sr-only" : ""
              }`}
            >
              {title}
            </h1>

            {logoUrl && (
              <Image
                src={logoUrl}
                alt=""
                aria-hidden
                // Sized from the height so wide wordmarks and tall stacked
                // lockups both land at a sensible size; the ratio TMDB reports
                // supplies the width. `max-w-*` is the guard for the very wide
                // ones on a narrow phone.
                width={Math.round(96 * (logo?.ratio ?? 2))}
                height={96}
                priority
                className="hero-logo mx-auto h-auto max-h-28 w-auto max-w-[min(100%,22rem)] object-contain sm:hidden"
              />
            )}

            {/* Everything from the subtitle down, grouped only so the blur can
                be hung off the top of it. A logo is whatever height the artwork
                happens to be and the heading is one line or two, so measuring
                down from the top of the page to find this point was never going
                to hold — anchoring to the element itself always does. */}
            <div className="relative flex min-h-0 flex-1 flex-col">
              {/* Full width of the window, not of the column: held to the
                  container it showed its own left and right edges as a pair of
                  soft seams down the sides of the text. It runs well past the
                  bottom of this group too, so the button row is inside it and
                  the mask's fade-out lands on empty page rather than on text.

                  Flush with the top of this group, not above it: the mask ramps
                  downwards from here, so the artwork carrying the title
                  treatment stays completely sharp. */}
              <div
                aria-hidden
                className="hero-veil pointer-events-none absolute top-0 -bottom-56 left-1/2 -z-[1] w-screen -translate-x-1/2 sm:hidden"
              />

              {tagline && <p className="mt-1.5 text-sm ios-dim text-ink-300 italic sm:mt-1">{tagline}</p>}

              {/* One line of facts rather than a line plus a rack of genre pills.
                  The pills were the same information at three times the height,
                  and they pushed the synopsis out of a fixed-height row. */}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-medium text-ink-100/60 sm:justify-start">
                {meta
                  .filter((m): m is string => Boolean(m))
                  .map((m, i) => (
                    <span key={m}>
                      {i > 0 && <span className="mr-2 text-ink-100/60">·</span>}
                      {m}
                    </span>
                  ))}
              </div>

              <div className="mt-4">{scores}</div>

              {/* Takes the space left between the genres and the buttons, with
                  the text centred in it — so a two-line synopsis is not left
                  stranded against the row above. */}
              <div
                className={`flex min-h-0 flex-1 flex-col justify-center py-4 ${
                  overviewDesktopOnly ? "max-sm:hidden" : ""
                }`}
              >
                {overview && <Synopsis text={overview} />}

                {/* Under the synopsis rather than on the watch button, which now
                    says what tapping it does. Only films reach this: a show's
                    date is per episode and belongs to the episode. Alignment is
                    left to the column's own `text-align`, so it follows the
                    rest of the hero — centred on a phone, left on desktop. */}
                {watchedOn && (
                  <p className="mt-2.5">
                    <WatchedPill at={watchedOn} plays={plays} />
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* The foot of the column, so the poster ends level with it however
              much or little there is to say about the film. Centred on a phone
              along with everything else over the artwork. */}
          {/* One line on a phone, whatever the labels say. The watch and save
              pair takes the space the two icons do not, and shares it equally
              between its own halves — so the row is a pair of matching buttons
              and a pair of matching squares rather than four different widths.
              Desktop is unchanged: `contents` dissolves the wrapper, and the row
              wraps as it always did. */}
          <div className="mt-auto flex items-center justify-center gap-2.5 max-sm:order-2 sm:flex-wrap sm:justify-start">
            <div className="min-w-0 flex-1 sm:contents">{actions}</div>
            {extras}
          </div>
        </div>
      </div>

      {/* Streaming under the hero on desktop, and the score bar under that. On
          a phone `order` lifts the score bar up to sit directly beneath the
          watch button, where it belongs — you mark something watched, then say
          what you thought of it. */}
      <div className="relative pb-5 max-sm:contents">
        <div className="mt-5 empty:hidden max-sm:order-4 max-sm:mt-0">
          {streaming}
        </div>
        <div className="mt-6 empty:hidden max-sm:order-3 max-sm:mt-0">{rating}</div>
      </div>
    </header>
  );
}

function Cast({
  cast,
  href,
}: {
  cast: { id: number; name: string; character: string; profile_path: string | null }[];
  /** The full list, for everyone the rail does not reach. */
  href: string;
}) {
  if (cast.length === 0) return null;

  return (
    <section className="mt-8">
      {/* The heading is the link. A rail of eighteen answers "who is in this";
          finding one particular face means reading a list, and that lives on a
          page of its own. */}
      <Link
        href={href}
        className="mb-3 inline-flex items-center gap-1 text-lg font-semibold tracking-tight transition hover:text-flare-400"
      >
        Cast
        <ChevronRight size={18} className="opacity-60" />
      </Link>
      <Rail>
        {cast.slice(0, 18).map((person) => {
          const src = img.profile(person.profile_path);
          return (
            <Link
              key={person.id}
              href={`/person/${person.id}`}
              className="rail-item group w-[104px]"
            >
              <div className="relative aspect-square overflow-hidden rounded-xl bg-ink-800">
                {src && (
                  <Image
                    src={src}
                    alt=""
                    fill
                    sizes="104px"
                    className="object-cover transition duration-500 group-hover:scale-105"
                  />
                )}
              </div>
              <p className="mt-2 line-clamp-1 text-xs font-medium">{person.name}</p>
              <p className="ios-dim line-clamp-1 text-[11px] text-ink-400">{person.character}</p>
            </Link>
          );
        })}
      </Rail>
    </section>
  );
}

function Reviews({ reviews }: { reviews: Review[] }) {
  if (reviews.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">What people are saying</h2>
      <Rail>
        {reviews.slice(0, 8).map((review) => (
          <article
            key={review.id}
            className="rail-item card w-[280px] p-4 sm:w-[340px]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-medium text-ink-100">{review.author}</p>
              {review.author_details.rating != null && (
                <span className="flex shrink-0 items-center gap-1 font-mono text-xs font-semibold text-ink-100">
                  <Star size={12} fill="currentColor" className="text-ember-400" />
                  {review.author_details.rating}/10
                </span>
              )}
            </div>
            <p className="ios-dim mt-2 line-clamp-6 text-xs leading-relaxed text-ink-300">
              {review.content}
            </p>
            <p className="ios-dim mt-2 font-mono text-[11px] text-ink-300">
              {new Date(review.created_at).toLocaleDateString("en-GB")}
            </p>
          </article>
        ))}
      </Rail>
    </section>
  );
}
