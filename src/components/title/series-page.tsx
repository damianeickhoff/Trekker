import { Suspense } from "react";
import { dateParts, listDate, todayKey } from "@/lib/dates";
import { episodeCode } from "@/lib/marks";
import { redateFromTitle } from "@/lib/title-actions";
import {
  availabilityRow,
  audienceScore,
  friendsAverage,
  hasAired,
  isEnded,
  loadShow,
  nextEpisodeFor,
  numberedSeasons,
  requireUser,
  storedEpisodes,
  trailerKey,
  viewerOf,
  watchedKeys,
} from "@/lib/title";
import { seriesMeta, taglineOf } from "@/lib/meta-line";
import { openingSeason } from "@/lib/progress";
import { canStopWatching } from "@/lib/title-writes";
import type { TvDetails } from "@/lib/tmdb";
import { Back, BackButton } from "../back-button";
import { TickFlash, TickScope } from "../home/tick-flash";
import { WhenMenuProvider } from "../home/when-menu";
import { Icon } from "../icon";
import { PlexChip, QuietChip, RequestedChip, StateChip } from "../ui";
import { AsideBones, EpisodeListBones, MoreLikeBones, PanelBones, PeopleRailBones } from "./bones";
import { BackdropArt, HeroArt, HeroPoster, Score, ScoreRow, TitleFacts, TitleLogo } from "./hero";
import { FriendsWatchedShow } from "./friends-watched";
import { FavouriteButton, SaveButton, TitleMoreMenu } from "./keep-buttons";
import { YourRating } from "./popcorn-picker";
import {
  AvailabilityPanel,
  CastRail,
  CommentsSection,
  EpisodeList,
  FeelingsSection,
  MoreLikeThis,
  ProgressPanel,
} from "./sections";
import { TitleUnavailable } from "./unavailable";
import { MarkNextButton } from "./watch-buttons";
import {
  ACTIONS_MOBILE,
  TITLE_ASIDE,
  GLASS_ICON,
  GLASS_ICON_SM,
  GLASS_BUTTON,
  GHOST_ICON_46,
  PRIMARY_46,
  WHITE_BUTTON,
  DISABLED_46,
  DISABLED_WHITE,
} from "./styles";

/*
 * A series. Tier 1, awaited here: details from the TMDB cache (fetched if
 * missing, the one page allowed to), this person's `TitleState` and the
 * availability row. The episode list streams as tier 2; availability's
 * streaming offers, cast, feelings, comments and more like this as tier 3.
 *
 * One tree for both widths. Phones draw their own centred hero, then one
 * column ordered with `order-*`; from `lg` the same pieces sit in the grid the
 * mockups draw, with the right column's `aside` switching from `display:
 * contents` on phones, where its children join the column, to a block of its
 * own. From `xl` the hero row holds only the poster and the details, so the
 * backdrop shows whole; the right-hand column starts level with the season
 * chips and runs down beside the episodes and the cast (`TITLE_ASIDE`).
 */

/** "New on Sundays" while a season runs; "Back 12 Mar" when the next is a premiere. */
function scheduleChip(details: TvDetails, today: string): string | null {
  const next = details.next_episode_to_air;
  if (!next?.air_date || isEnded(details.status) || next.air_date < today) return null;
  if (next.episode_number > 1) return `New on ${dateParts(next.air_date).weekday}s`;
  return `Back ${listDate(next.air_date).slice(4)}`;
}

const pad = (n: number) => String(n).padStart(2, "0");

export async function SeriesPage({ id, season: asked }: { id: number; season: number | null }) {
  const user = await requireUser();
  const loaded = await loadShow(id);
  if (!loaded) return <TitleUnavailable />;
  const { details, logo } = loaded;
  const today = todayKey();

  const [viewer, avail, friends, seen] = await Promise.all([
    viewerOf(user.id, "tv", id),
    availabilityRow("tv", id),
    friendsAverage(user.id, "tv", id),
    watchedKeys(user.id, id),
  ]);
  const next = await nextEpisodeFor(user.id, details, viewer.state);
  const nextAired = next && hasAired(next.airDate, today) ? next : null;

  const seasons = numberedSeasons(details);
  const multi = seasons.length > 1;
  const facts = seriesMeta(details);
  const tagline = taglineOf(details);
  const network = details.networks?.[0]?.name ?? null;
  const schedule = scheduleChip(details, today);
  const audience = audienceScore(details);
  const trailer = trailerKey(details);
  const onPlex = avail?.onPlex ?? false;
  // Asked for through Overseerr and not arrived: the same answer the poster mark gives.
  const requested = !onPlex && avail?.overseerrStatus === "requested";
  const title = { mediaType: "tv" as const, tmdbId: id };
  const rated = viewer.rating !== null || (viewer.state?.watchedCount ?? 0) > 0;
  const stop = { dropped: viewer.dropped, allowed: canStopWatching(viewer.state) };

  // A season in the address is a choice somebody made; without one the page
  // opens on the season this person is in (`openingSeason`).
  const chosen = asked !== null && (asked === 0 || seasons.some((s) => s.season_number === asked)) ? asked : null;
  const season =
    chosen ??
    openingSeason({
      seasons: seasons.map((s) => s.season_number),
      stored: await storedEpisodes(id),
      seen,
      today,
      fallback: next,
      lastAiredSeason: details.last_episode_to_air?.season_number ?? null,
    });

  const markText = nextAired
    ? `Mark ${multi ? `S${pad(nextAired.season)} E${pad(nextAired.episode)}` : `E${pad(nextAired.episode)}`} watched`
    : null;
  // Nothing to mark: say why rather than showing a button that does nothing.
  const idleText = next?.airDate
    ? `Next ${listDate(next.airDate)}`
    : next
      ? "Up to date"
      : seen.size
        ? "All watched"
        : "Nothing out yet";
  const markTarget = nextAired
    ? {
        showId: id,
        season: nextAired.season,
        episode: nextAired.episode,
        label: `${episodeCode(nextAired.season, nextAired.episode)} of ${details.name}`,
      }
    : null;

  const scores = (
    <ScoreRow>
      {audience !== null && <Score value={`${audience}%`} label="Audience" />}
      {friends !== null && <Score value={friends.toFixed(1)} label="Friends" />}
      {rated && <YourRating target={{ kind: "title", mediaType: "tv", tmdbId: id }} initial={viewer.rating} />}
    </ScoreRow>
  );
  const quietChips = (
    <>
      {network && <QuietChip onHero>{network}</QuietChip>}
      {schedule && <QuietChip onHero>{schedule}</QuietChip>}
    </>
  );
  // A backdrop is the hero's picture. On phones the lettering stands large on
  // it in place of the poster; without one, the poster hero stands in (see
  // `BackdropArt`). Desktop keeps its poster beside the details either way.
  const backdrop = details.backdrop_path;

  return (
    <WhenMenuProvider redate={redateFromTitle}>
      <TickScope>
        {/* Phones: the centred hero. */}
        <div className="relative -mt-(--safe-top) flex min-h-[calc(500px+var(--safe-top))] flex-col pt-(--safe-top) lg:hidden">
          {backdrop ? (
            <BackdropArt path={backdrop}>
              <TickFlash size={52} />
            </BackdropArt>
          ) : (
            <HeroArt path={details.poster_path} />
          )}
          <div aria-hidden="true" className="h-[71px] shrink-0" />
          <header className="pointer-events-none fixed inset-x-0 top-(--safe-top) z-(--z-top-row) flex h-[71px] items-center justify-between px-5 pt-[27px] *:pointer-events-auto lg:hidden">
            <BackButton kind="glass" />
            <div className="flex gap-2">
              {trailer && (
                <a href={`https://www.youtube.com/watch?v=${trailer}`} target="_blank" rel="noreferrer" aria-label="Trailer" className={GLASS_ICON_SM}>
                  <Icon name="film" size={20} />
                </a>
              )}
              <TitleMoreMenu title={title} stop={stop} recommend className={GLASS_ICON_SM} />
            </div>
          </header>
          <div className="relative z-(--z-lift) flex grow flex-col items-center justify-end gap-3 px-5 pb-[18px] pt-3.5 text-center text-white">
            {!backdrop && (
              <HeroPoster path={details.poster_path} title={details.name} className="block h-[210px] w-[140px] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                <TickFlash size={52} />
              </HeroPoster>
            )}
            <TitleLogo logo={logo} title={details.name} size={backdrop ? "large" : "hero"} className="justify-center" />
            <TitleFacts tagline={tagline} facts={facts} centred />
            {scores}
            <div className="flex flex-wrap justify-center gap-1.5">
              {onPlex && <PlexChip />}
              {requested && <RequestedChip />}
              {quietChips}
            </div>
          </div>
        </div>

        <div className="relative flex flex-col gap-4 px-5 pt-1 lg:grid lg:grid-cols-[250px_minmax(0,1fr)] lg:items-start lg:gap-x-9 lg:gap-y-8 lg:px-10 lg:pt-10 xl:grid-cols-[250px_minmax(0,1fr)_var(--title-aside)] xl:grid-rows-[auto_auto_auto_1fr]">
          {/* Desktop: the artwork behind the first row, running on under the second. */}
          <div aria-hidden="true" className="relative -mx-10 -mb-[112px] -mt-10 hidden min-h-[520px] self-stretch lg:col-span-full lg:row-start-1 lg:block">
            {backdrop ? <BackdropArt path={backdrop} /> : <HeroArt path={details.poster_path} />}
          </div>

          {/* Desktop: "‹ Back" in the hero's top edge, above the poster, so nothing under it moves. A title has too many ways in to name one. */}
          <div className="absolute left-10 top-3 z-(--z-top-row) hidden lg:flex">
            <Back href="/" name="Back" history onHero desktopOnly />
          </div>

          <HeroPoster
            path={details.poster_path}
            title={details.name}
            className="hidden h-[375px] w-[250px] rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)] lg:col-start-1 lg:row-start-1 lg:block"
          >
            <TickFlash size={72} />
          </HeroPoster>

          <div className="relative hidden min-w-0 flex-col gap-[18px] pt-4 text-white lg:col-start-2 lg:row-start-1 lg:flex xl:col-end-4">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-1.5">
                <StateChip>Series</StateChip>
                {onPlex && <PlexChip />}
                {requested && <RequestedChip />}
                {quietChips}
              </div>
              <TitleLogo logo={logo} title={details.name} />
              <TitleFacts tagline={tagline} facts={facts} />
            </div>
            {scores}
            <div className="flex flex-wrap items-center gap-2">
              {markTarget ? (
                <MarkNextButton key={`${markTarget.season}-${markTarget.episode}`} {...markTarget} text={markText!} className={WHITE_BUTTON} />
              ) : (
                <span className={DISABLED_WHITE}>{idleText}</span>
              )}
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
                <TitleMoreMenu title={title} stop={stop} recommend className={GLASS_ICON} menuClassName="left-0" />
              </span>
            </div>
            {details.overview && (
              <p className="m-0 line-clamp-5 max-w-[560px] text-[15px] leading-normal text-white/78">{details.overview}</p>
            )}
          </div>

          {/* Phones: the actions under the hero, in the theme's own colours. */}
          <div className={`${ACTIONS_MOBILE} order-1`}>
            {markTarget ? (
              <MarkNextButton key={`${markTarget.season}-${markTarget.episode}`} {...markTarget} text={markText!} className={PRIMARY_46} />
            ) : (
              <span className={DISABLED_46}>{idleText}</span>
            )}
            <FavouriteButton title={title} initial={viewer.favourite} className={GHOST_ICON_46} />
            <SaveButton title={title} initial={viewer.saved} lists={viewer.lists} className={GHOST_ICON_46} />
          </div>

          <aside className={TITLE_ASIDE}>
            <div className="relative order-2 lg:order-none">
              <Suspense fallback={<PanelBones />}>
                <AvailabilityPanel userId={user.id} mediaType="tv" tmdbId={id} />
              </Suspense>
            </div>
            <div className="relative order-3 empty:hidden lg:order-none">
              <ProgressPanel userId={user.id} details={details} viewer={viewer} />
            </div>
            {/* Friends who watched: on phones straight after availability,
                whose order it shares (DOM order decides between the two), so
                before progress; from `lg` after progress and above How it
                felt. Usually absent, so no bones, and the block brings its own
                box: an empty wrapper waiting on the stream would still take a gap. */}
            <Suspense fallback={null}>
              <FriendsWatchedShow userId={user.id} showId={id} className="relative order-2 lg:order-none" />
            </Suspense>
            <div className="relative order-7 empty:hidden lg:order-none">
              <Suspense fallback={<AsideBones />}>
                <FeelingsSection userId={user.id} mediaType="tv" tmdbId={id} scope="all-episodes" />
              </Suspense>
            </div>
            <div className="relative order-8 lg:order-none">
              <Suspense fallback={<AsideBones rows={1} />}>
                <CommentsSection userId={user.id} mediaType="tv" tmdbId={id} />
              </Suspense>
            </div>
            {/* From `xl` More like this runs on under Comments in this column,
                which runs from the row under the hero to the page's end, so it follows the
                column's own content rather than waiting for the row beside
                it to end. Below `xl` the copy after the page's sections is
                drawn instead; only one is ever displayed. */}
            <div className="relative mt-4 hidden min-w-0 xl:block">
              <Suspense fallback={<MoreLikeBones />}>
                <MoreLikeThis items={details.recommendations?.results ?? []} mediaType="tv" tmdbId={id} />
              </Suspense>
            </div>
          </aside>

          <div className="relative order-4 min-w-0 lg:order-none lg:col-span-2">
            <Suspense fallback={<EpisodeListBones />}>
              <EpisodeList userId={user.id} details={details} season={season} next={next} />
            </Suspense>
          </div>

          {details.overview && (
            <p className="relative order-5 m-0 text-sm leading-normal text-ink-2 lg:hidden">{details.overview}</p>
          )}

          <div className="relative order-9 min-w-0 empty:hidden lg:order-none lg:col-span-2 xl:hidden">
            <Suspense fallback={<MoreLikeBones />}>
              <MoreLikeThis items={details.recommendations?.results ?? []} mediaType="tv" tmdbId={id} />
            </Suspense>
          </div>

          <div className="relative order-6 min-w-0 empty:hidden lg:order-none lg:col-span-full xl:col-span-2">
            <Suspense fallback={<PeopleRailBones />}>
              <CastRail cast={(details.credits?.cast ?? []).slice(0, 16)} href={`/title/tv/${id}/cast`} />
            </Suspense>
          </div>
        </div>
      </TickScope>
    </WhenMenuProvider>
  );
}
