import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, Star, Tv } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEpisodeDetail, getTv, img, tmdbConfigured } from "@/lib/tmdb";
import { BackButton } from "@/components/back-button";
import { EpisodeControls } from "@/components/episode-controls";
import { EpisodePager } from "@/components/episode-pager";
import { Rail } from "@/components/rail";
import { SetupNotice, WatchedPill } from "@/components/ui";

type Params = { type: string; id: string; season: string; episode: string };

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { id, season, episode } = await params;
  const detail = tmdbConfigured()
    ? await getEpisodeDetail(Number(id), Number(season), Number(episode))
    : null;

  return { title: detail ? `${detail.name} — Trekker` : "Episode — Trekker" };
}

/**
 * One episode, as a page rather than as a dialog.
 *
 * It was a modal, and the modal was the problem. Opening a cast member from
 * inside it left the page entirely, so coming back landed on the show — the
 * episode had never been anywhere the browser could return to. A route has an
 * address, which fixes that by construction rather than by intercepting the
 * back button.
 *
 * The shape follows the still. It is the one thing on the page worth looking at
 * rather than reading, so it sits at the top as a card with its neighbours
 * showing at the edges — which is both the swipe's affordance and the only
 * honest way to say "there are more of these either side".
 */
export default async function EpisodePage({ params }: { params: Promise<Params> }) {
  const { type, id, season, episode } = await params;
  const showId = Number(id);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    type !== "tv" ||
    !Number.isInteger(showId) ||
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber)
  ) {
    notFound();
  }

  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const [detail, show, user] = await Promise.all([
    getEpisodeDetail(showId, seasonNumber, episodeNumber),
    getTv(showId).catch(() => null),
    getCurrentUser(),
  ]);

  if (!detail || !show) notFound();

  const [watched, rating] = user
    ? await Promise.all([
        db.watchedEpisode.findUnique({
          where: {
            userId_showId_seasonNumber_episodeNumber: {
              userId: user.id,
              showId,
              seasonNumber,
              episodeNumber,
            },
          },
          select: { watchedAt: true, lastWatchedAt: true, plays: true },
        }),
        db.episodeRating.findUnique({
          where: {
            userId_showId_seasonNumber_episodeNumber: {
              userId: user.id,
              showId,
              seasonNumber,
              episodeNumber,
            },
          },
          select: { liked: true },
        }),
      ])
    : [null, null];

  const neighbours = surrounding(show.seasons, seasonNumber, episodeNumber);
  const href = (at: { season: number; episode: number } | null) =>
    at ? `/title/tv/${showId}/episode/${at.season}/${at.episode}` : null;

  const still = img.still(detail.still, "w780");
  const aired = Boolean(detail.airDate) && detail.airDate! <= new Date().toISOString().slice(0, 10);
  const people = [...detail.cast, ...detail.guests];

  return (
    <>
      {/* The show's name rather than the episode's: the episode is the page you
          are on, and the thing worth naming is where you will land. */}
      <BackButton to="href" fallback={`/title/tv/${showId}`} title={show.name} />

      <EpisodePager previous={href(neighbours.previous)} next={href(neighbours.next)}>
        {/* The wash behind everything, built from this episode's own still —
            the same idea as a title page's hero, at the scale of one episode. */}
        {still && (
          <div
            aria-hidden
            className="episode-wash pointer-events-none absolute -top-24 left-1/2 -z-10 h-[520px] w-screen -translate-x-1/2 -translate-y-4 overflow-hidden"
          >
            <Image src={still} alt="" fill priority sizes="100vw" className="scale-125 object-cover blur-3xl saturate-125" />
            <div className="episode-wash-fade absolute inset-0" />
          </div>
        )}

        <div className="rise relative lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-8">
          {/*
            The card, with the episodes either side of it showing at the edges.

            They are deliberately inert — pieces of scenery, not controls. Their
            job is to say that the page continues sideways, which the swipe then
            does; making them tappable would be a third way to do the same thing
            and a second target under the same thumb.
          */}
          <div className="relative">
            <Neighbour side="left" show={Boolean(neighbours.previous)} />
            <Neighbour side="right" show={Boolean(neighbours.next)} />

            <div className="episode-still relative aspect-video overflow-hidden rounded-2xl bg-ink-800 shadow-2xl shadow-black/30 light:shadow-black/10">
              {still ? (
                <Image src={still} alt="" fill priority sizes="100vw" className="object-cover" />
              ) : (
                <div className="grid h-full w-full place-items-center text-ink-600">
                  <Tv size={28} />
                </div>
              )}
            </div>

            {/* On the still rather than under the page: they move the picture,
                and a control belongs where the thing it moves is. Off to the
                sides so neither sits over a face. */}
            <Step href={href(neighbours.previous)} direction="previous" />
            <Step href={href(neighbours.next)} direction="next" />
          </div>

          <div className="min-w-0">
          <header className="mt-5 flex items-start justify-between gap-4 lg:mt-0">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{detail.name}</h1>

              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-ink-300">
                <span>
                  S{seasonNumber} E{episodeNumber}
                </span>
                {detail.airDate && (
                  <>
                    <span className="opacity-50">·</span>
                    <span>{formatAirDate(detail.airDate)}</span>
                  </>
                )}
                {detail.runtime && (
                  <>
                    <span className="opacity-50">·</span>
                    <span>{detail.runtime} min</span>
                  </>
                )}
                {detail.score > 0 && (
                  <>
                    <span className="opacity-50">·</span>
                    <span className="inline-flex items-center gap-1">
                      <Star size={13} className="text-ember-400" fill="currentColor" />
                      {(detail.score / 10).toFixed(1)}
                      {detail.votes > 0 && (
                        <span className="text-ink-400">
                          ({detail.votes.toLocaleString("en-GB")})
                        </span>
                      )}
                    </span>
                  </>
                )}
              </p>

              {/* Where it sits in the run, and what you have done about it.
                  Both are reasons to open an episode rather than decoration:
                  "is this the finale" changes whether tonight is the night, and
                  "did I already see this" is the question the page exists to
                  answer. */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {milestone(detail.episodeType) && (
                  <span className="rounded-full border border-ember-500/40 bg-ember-500/10 px-2.5 py-1 text-[11px] font-semibold text-ember-400">
                    {milestone(detail.episodeType)}
                  </span>
                )}

                {!aired && (
                  <span className="rounded-full border border-ink-700 px-2.5 py-1 text-[11px] font-medium text-ink-400">
                    Not aired yet
                  </span>
                )}

                {watched && (
                  <WatchedPill
                    at={watched.lastWatchedAt ?? watched.watchedAt}
                    plays={watched.plays}
                  />
                )}
              </div>
            </div>

            <EpisodeControls
              showId={showId}
              showName={show.name}
              showPoster={show.poster_path}
              seasonNumber={seasonNumber}
              episodeNumber={episodeNumber}
              episodeName={detail.name}
              runtime={detail.runtime}
              airDate={detail.airDate}
              initialWatched={Boolean(watched)}
              initialRating={rating?.liked}
              aired={aired}
              signedIn={Boolean(user)}
            />
          </header>

          {detail.overview && (
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-ink-100">
              {detail.overview}
            </p>
          )}
          </div>

          {people.length > 0 && (
            <section className="mt-8 lg:col-span-2">
              {/* The heading is the way to the full list, crew included — the
                  rail shows the faces, the page answers "who else". */}
              <Link
                href={`/title/tv/${showId}/episode/${seasonNumber}/${episodeNumber}/cast`}
                className="mb-3 inline-flex items-center gap-1 text-lg font-semibold tracking-tight transition hover:text-flare-400"
              >
                Cast &amp; Crew
                <ChevronRight size={18} className="opacity-60" />
              </Link>

              <Rail>
                {people.map((person) => (
                  <Link
                    key={`${person.id}-${person.character}`}
                    href={`/person/${person.id}`}
                    className="rail-item w-[124px]"
                  >
                    <span className="relative block aspect-2/3 overflow-hidden rounded-xl bg-ink-800">
                      {img.profile(person.profile) ? (
                        <Image
                          src={img.profile(person.profile)!}
                          alt=""
                          fill
                          sizes="124px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="grid h-full w-full place-items-center text-ink-600">
                          <Tv size={20} />
                        </span>
                      )}
                    </span>

                    <span className="mt-2 block truncate text-sm font-medium text-ink-100">
                      {person.name}
                    </span>
                    {person.character && (
                      <span className="block truncate text-xs text-ink-400">
                        {person.character}
                      </span>
                    )}
                  </Link>
                ))}
              </Rail>
            </section>
          )}

        </div>
      </EpisodePager>
    </>
  );
}

/** A sliver of the episode either side, showing past the card's edge. */
function Neighbour({ side, show }: { side: "left" | "right"; show: boolean }) {
  if (!show) return null;

  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-4 bottom-4 w-6 rounded-2xl bg-ink-800 ${
        side === "left" ? "-left-4" : "-right-4"
      }`}
    />
  );
}

/**
 * TMDB's `episode_type`, said out loud.
 *
 * "standard" is every other episode, so it earns no badge — a label on all
 * twenty-two of a season's episodes tells you nothing about any of them.
 */
function milestone(type: string | null) {
  if (type === "premiere") return "Season premiere";
  if (type === "finale") return "Season finale";
  if (type === "mid_season") return "Mid-season finale";
  return null;
}

function formatAirDate(value: string) {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
  * One step along, as a control on the still itself.
  *
  * The same two moves the swipe makes, for anyone not using a finger — and on
  * desktop, where there is no swipe at all, the only way through a season
  * without going back to the list each time.
  */
function Step({ href, direction }: { href: string | null; direction: "previous" | "next" }) {
  if (!href) return null;

  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;

  return (
    <Link
      href={href}
      aria-label={direction === "previous" ? "Previous episode" : "Next episode"}
      className={`absolute top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-white/20 bg-black/45 text-white shadow-lg shadow-black/40 backdrop-blur-md transition hover:bg-black/65 light:border-black/10 ${
        direction === "previous" ? "left-3" : "right-3"
      }`}
    >
      <Icon size={20} />
    </Link>
  );
}

/**
 * The episodes either side of this one, crossing season boundaries.
 *
 * A finale and the premiere after it are one step apart to anyone watching, so
 * running off the end of a season carries on into the next rather than stopping
 * — which is the same reason the "watch next" row does not stop there either.
 */
function surrounding(
  seasons: { season_number: number; episode_count: number }[],
  seasonNumber: number,
  episodeNumber: number,
) {
  const ordered = seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const index = ordered.findIndex((s) => s.season_number === seasonNumber);
  const here = ordered[index];
  if (!here) return { previous: null, next: null };

  const before = ordered[index - 1];
  const after = ordered[index + 1];

  return {
    previous:
      episodeNumber > 1
        ? { season: seasonNumber, episode: episodeNumber - 1 }
        : before
          ? { season: before.season_number, episode: before.episode_count }
          : null,
    next:
      episodeNumber < here.episode_count
        ? { season: seasonNumber, episode: episodeNumber + 1 }
        : after
          ? { season: after.season_number, episode: 1 }
          : null,
  };
}
