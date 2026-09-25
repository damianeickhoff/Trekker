import { Suspense } from "react";
import { daysBetween, pastDay, todayKey } from "@/lib/dates";
import { filmMeta, taglineOf } from "@/lib/meta-line";
import { redateFromTitle } from "@/lib/title-actions";
import {
  audienceScore,
  availabilityRow,
  friendsAverage,
  instanceAdmin,
  loadFilm,
  requireUser,
  trailerKey,
  viewerOf,
} from "@/lib/title";
import type { MovieDetails } from "@/lib/tmdb";
import { Back, BackButton } from "../back-button";
import { TickFlash, TickScope } from "../home/tick-flash";
import { WhenMenuProvider } from "../home/when-menu";
import { Icon } from "../icon";
import { PlexChip, QuietChip, RequestedChip, StateChip } from "../ui";
import { AsideBones, MoreLikeBones, PanelBones, PeopleRailBones } from "./bones";
import { BackdropArt, HeroArt, HeroPoster, Score, ScoreRow, TitleFacts, TitleLogo } from "./hero";
import { FavouriteButton, SaveButton, TitleMoreMenu } from "./keep-buttons";
import { YourRating } from "./popcorn-picker";
import { AvailabilityPanel, CastRail, CommentsSection, FeelingsSection, MoreLikeThis } from "./sections";
import {
  ACTIONS_MOBILE,
  TITLE_ASIDE,
  GHOST_ICON_46,
  GLASS_BUTTON,
  GLASS_ICON,
  GLASS_ICON_SM,
  PRIMARY_46,
  WHITE_BUTTON,
} from "./styles";
import { TitleUnavailable } from "./unavailable";
import { WatchToggle } from "./watch-buttons";

/*
 * A film. The same tree as a series (see `series-page.tsx`), with one-tap
 * Mark watched in place of the episode button, no progress or episodes, and
 * the cast beside More like this on desktop, as the mockup lays it out.
 */

/** "1 h 48", as the mockups write a running time. */
export function runtimeLabel(minutes: number | null | undefined) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`;
}

/**
 * Out in cinemas and recent enough that that is where it is: the first six
 * weeks after its primary release date. Streaming, when it arrives, shows in
 * the availability panel instead.
 */
function inCinemas(details: MovieDetails, today: string) {
  if (!details.release_date || details.release_date > today) return false;
  return daysBetween(details.release_date, today) <= 42;
}

export async function FilmPage({ id }: { id: number }) {
  const user = await requireUser();
  const loaded = await loadFilm(id);
  if (!loaded) return <TitleUnavailable />;
  const { details, logo } = loaded;
  const today = todayKey();

  const [viewer, avail, friends, admin] = await Promise.all([
    viewerOf(user.id, "movie", id),
    availabilityRow("movie", id),
    friendsAverage(user.id, "movie", id),
    instanceAdmin(),
  ]);

  const facts = filmMeta(details);
  const tagline = taglineOf(details);
  const audience = audienceScore(details);
  const trailer = trailerKey(details);
  const cinemas = inCinemas(details, today);
  const onPlex = avail?.onPlex ?? false;
  const plexConnected = Boolean(admin?.plexUrl && admin?.plexToken);
  const title = { mediaType: "movie" as const, tmdbId: id };
  const seen = viewer.film;
  const watchedLabel = seen ? pastDay(todayKey(seen.lastWatchedAt ?? seen.watchedAt), today) : null;
  const target = { kind: "film" as const, tmdbId: id, label: details.title };

  const scores = (
    <ScoreRow>
      {audience !== null && <Score value={`${audience}%`} label="Audience" />}
      {friends !== null && <Score value={friends.toFixed(1)} label="Friends" />}
      {(seen || viewer.rating !== null) && (
        <YourRating target={{ kind: "title", mediaType: "movie", tmdbId: id }} initial={viewer.rating} />
      )}
    </ScoreRow>
  );
  const chips = (
    <>
      {cinemas && <StateChip small>In cinemas</StateChip>}
      {onPlex ? (
        <PlexChip small />
      ) : avail?.overseerrStatus === "requested" ? (
        <RequestedChip small />
      ) : (
        plexConnected && <QuietChip onHero>Not on Plex</QuietChip>
      )}
    </>
  );
  // A backdrop is the hero's picture. On phones the lettering stands large on
  // it in place of the poster; without one, the poster hero stands in (see
  // `BackdropArt`). Desktop keeps its poster beside the details either way.
  const backdrop = details.backdrop_path;

  return (
    <WhenMenuProvider redate={redateFromTitle}>
      <TickScope>
        <div className="relative flex min-h-[500px] flex-col lg:hidden">
          {backdrop ? (
            <BackdropArt path={backdrop}>
              <TickFlash size={52} />
            </BackdropArt>
          ) : (
            <HeroArt path={details.poster_path} />
          )}
          <header className="relative z-(--z-top-row) flex h-[60px] shrink-0 items-center justify-between px-5 pt-4">
            <BackButton kind="glass" />
            <div className="flex gap-2">
              {trailer && (
                <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noreferrer" aria-label="Trailer" className={GLASS_ICON_SM}>
                  <Icon name="film" size={20} />
                </a>
              )}
              <TitleMoreMenu title={title} recommend className={GLASS_ICON_SM} />
            </div>
          </header>
          <div className="relative z-(--z-lift) flex grow flex-col items-center justify-end gap-3 px-5 pb-[18px] pt-3.5 text-center text-white">
            {!backdrop && (
              <HeroPoster path={details.poster_path} title={details.title} className="block h-[210px] w-[140px] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                <TickFlash size={52} />
              </HeroPoster>
            )}
            <TitleLogo logo={logo} title={details.title} size={backdrop ? "large" : "hero"} className="justify-center" />
            <TitleFacts tagline={tagline} facts={facts} centred />
            {scores}
            <div className="flex flex-wrap justify-center gap-1.5">{chips}</div>
          </div>
        </div>

        <div className="relative flex flex-col gap-4 px-5 pt-1 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-x-9 lg:gap-y-8 lg:px-10 lg:pt-10 xl:grid-cols-[250px_minmax(0,1fr)_var(--title-aside)] xl:grid-rows-[auto_auto_1fr]">
          <div aria-hidden="true" className="relative -mx-10 -mb-[112px] -mt-10 hidden min-h-[520px] self-stretch lg:col-span-full lg:row-start-1 lg:block">
            {backdrop ? <BackdropArt path={backdrop} /> : <HeroArt path={details.poster_path} />}
          </div>

          {/* Desktop: "‹ Back" in the hero's top edge, above the poster, so nothing under it moves. A title has too many ways in to name one. */}
          <div className="absolute left-10 top-3 z-(--z-top-row) hidden lg:flex">
            <Back href="/" name="Back" history onHero desktopOnly />
          </div>

          <HeroPoster
            path={details.poster_path}
            title={details.title}
            className="hidden h-[375px] w-[250px] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)] lg:col-start-1 lg:row-start-1 lg:block"
          >
            <TickFlash size={72} />
          </HeroPoster>

          <div className="relative hidden min-w-0 flex-col gap-[18px] pt-4 text-white lg:col-start-2 lg:row-start-1 lg:flex xl:col-end-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5">
                <StateChip small>Film</StateChip>
                {chips}
              </div>
              <TitleLogo logo={logo} title={details.title} />
              <TitleFacts tagline={tagline} facts={facts} />
            </div>
            {scores}
            <div className="flex flex-wrap items-center gap-2">
              <WatchToggle target={target} watched={watchedLabel} className={WHITE_BUTTON} />
              {trailer && (
                <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noreferrer" className={GLASS_BUTTON}>
                  <Icon name="film" size={18} />
                  Trailer
                </a>
              )}
              {/* The icon buttons wrap as one, so More is never left on a line of its own. */}
              <span className="flex shrink-0 items-center gap-2">
                <FavouriteButton title={title} initial={viewer.favourite} className={GLASS_ICON} />
                <SaveButton title={title} initial={viewer.saved} lists={viewer.lists} className={GLASS_ICON} menuClassName="left-0" />
                <TitleMoreMenu title={title} recommend className={GLASS_ICON} menuClassName="left-0" />
              </span>
            </div>
            {details.overview && (
              <p className="m-0 line-clamp-5 max-w-[560px] text-[15px] leading-normal text-white/78">{details.overview}</p>
            )}
          </div>

          <div className={`${ACTIONS_MOBILE} order-1`}>
            <WatchToggle target={target} watched={watchedLabel} className={PRIMARY_46} />
            <FavouriteButton title={title} initial={viewer.favourite} className={GHOST_ICON_46} />
            <SaveButton title={title} initial={viewer.saved} lists={viewer.lists} className={GHOST_ICON_46} />
          </div>

          <aside className={TITLE_ASIDE}>
            <div className="relative order-2 lg:order-none">
              <Suspense fallback={<PanelBones />}>
                <AvailabilityPanel userId={user.id} mediaType="movie" tmdbId={id} inCinemas={cinemas} />
              </Suspense>
            </div>
            <div className="relative order-5 lg:order-none">
              <Suspense fallback={<AsideBones />}>
                <FeelingsSection userId={user.id} mediaType="movie" tmdbId={id} scope={{ season: 0, episode: 0 }} />
              </Suspense>
            </div>
            <div className="relative order-6 lg:order-none lg:col-span-2 xl:col-span-1">
              <Suspense fallback={<AsideBones rows={1} />}>
                <CommentsSection userId={user.id} mediaType="movie" tmdbId={id} />
              </Suspense>
            </div>
            {/* From `xl` More like this runs on under Comments in this column,
                which runs from the row under the hero to the page's end, so it follows the
                column's own content rather than waiting for the row beside
                it to end. Below `xl` the copy after the page's sections is
                drawn instead; only one is ever displayed. */}
            <div className="relative mt-4 hidden min-w-0 xl:block">
              <Suspense fallback={<MoreLikeBones />}>
                <MoreLikeThis items={details.recommendations?.results ?? []} mediaType="movie" tmdbId={id} />
              </Suspense>
            </div>
          </aside>

          {details.overview && (
            <p className="relative order-3 m-0 text-sm leading-normal text-ink-2 lg:hidden">{details.overview}</p>
          )}

          <div className="relative order-4 min-w-0 empty:hidden lg:order-none lg:col-span-2">
            <Suspense fallback={<PeopleRailBones />}>
              <CastRail cast={(details.credits?.cast ?? []).slice(0, 16)} href={`/title/movie/${id}/cast`} />
            </Suspense>
          </div>

          <div className="relative order-7 min-w-0 empty:hidden lg:order-none lg:col-span-2 xl:hidden">
            <Suspense fallback={<MoreLikeBones />}>
              <MoreLikeThis items={details.recommendations?.results ?? []} mediaType="movie" tmdbId={id} />
            </Suspense>
          </div>
        </div>
      </TickScope>
    </WhenMenuProvider>
  );
}
