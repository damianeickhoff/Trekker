import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Star, Tv } from "lucide-react";
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
            /*
              Lower and taller than it was, on a phone especially.
              `blur-3xl` spreads the picture about 60px in every direction, so
              the visible top of the wash always sits higher than the box that
              holds it — which means the box has to start lower than where you
              want the colour to appear, not level with it. The extra height is
              what carries the hold down past the still; see `.episode-wash` in
              globals.css for where the fade actually falls.
            */
            className="episode-wash pointer-events-none absolute -top-10 left-1/2 -z-10 h-[820px] w-screen -translate-x-1/2 overflow-hidden sm:-top-16 sm:h-[720px]"
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

              {/*
                One row of chips rather than a line of dot-separated text above a
                row of chips.

                The facts and the marks were two different treatments stacked on
                top of each other, and the app only has one: a bordered pill, as
                the episode dialog and the season header use. Read as a single
                row they are what they always were — everything worth knowing
                about this episode before you decide to watch it.

                Where it sits in the run, and what you have done about it, are
                reasons to open an episode rather than decoration: "is this the
                finale" changes whether tonight is the night, and "did I already
                see this" is the question the page exists to answer.
              */}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Fact>
                  S{seasonNumber} E{episodeNumber}
                </Fact>

                {detail.airDate && (
                  <Fact icon={CalendarDays}>{formatAirDate(detail.airDate)}</Fact>
                )}

                {detail.runtime ? <Fact icon={Clock}>{detail.runtime} min</Fact> : null}

                {detail.score > 0 && (
                  <Fact icon={Star} tone="text-ember-400 light:text-ember-500" filled>
                    {(detail.score / 10).toFixed(1)}
                    {detail.votes > 0 && (
                      <span className="ios-dim ml-1 text-ink-400">
                        ({detail.votes.toLocaleString("en-GB")})
                      </span>
                    )}
                  </Fact>
                )}
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

/**
 * One fact about the episode, as a pill.
 *
 * The same shape the episode dialog and the season header use — a bordered
 * capsule at 11px — so a fact reads the same wherever the app states one.
 */
function Fact({
  icon: Icon,
  tone = "text-ink-200",
  filled = false,
  children,
}: {
  icon?: typeof Clock;
  /** Colour for the icon and value, where the fact carries one. */
  tone?: string;
  /** Solid glyph, for the star. */
  filled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-ink-600/70 bg-ink-900/70 px-2.5 py-1 text-[11px] max-sm:border-white/15 max-sm:bg-white/10 light:border-ink-600 light:bg-white/80 ${tone}`}
    >
      {Icon && <Icon size={12} fill={filled ? "currentColor" : "none"} />}
      {children}
    </span>
  );
}
