import Image from "next/image";
import { Suspense } from "react";
import { longDate, pastDay, todayKey } from "@/lib/dates";
import { episodeCode, plexWebUrl } from "@/lib/marks";
import { redateFromTitle } from "@/lib/title-actions";
import {
  availabilityRow,
  instanceAdmin,
  friendsEpisodeAverage,
  loadShow,
  numberedSeasons,
  requireUser,
  seasonEpisodes,
  viewerOf,
  type EpisodeItem,
} from "@/lib/title";
import { episodeRatingOf } from "@/lib/title-writes";
import { getEpisode, type EpisodeDetails, type TvDetails } from "@/lib/tmdb";
import { tmdbSrc } from "@/lib/tmdb-image-loader";
import { db } from "@/lib/db";
import { BackButton } from "../back-button";
import { TickFlash, TickScope } from "../home/tick-flash";
import { WhenMenuProvider } from "../home/when-menu";
import { Icon } from "../icon";
import { Link } from "../link";
import { Rail } from "../rail";
import { SectionHead } from "../section-head";
import { PlexChip } from "../ui";
import { AsideBones, PeopleRailBones } from "./bones";
import { EpisodeArrival } from "./episode-travel";
import { BackdropArt, HeroArt, TitleLogo } from "./hero";
import { SaveButton, TitleMoreMenu } from "./keep-buttons";
import { PersonTile } from "./people";
import { PopcornPicker } from "./popcorn-picker";
import { FeelingsSection, Panel } from "./sections";
import { GHOST_46, GLASS_46, GLASS_ICON_SM, PRIMARY_46, WHITE_46 } from "./styles";
import { TitleUnavailable } from "./unavailable";
import { WatchToggle } from "./watch-buttons";

/*
 * One episode. Tier 1: the show from the cache, the episode itself (its
 * still, synopsis and credits in one cached request), and this person's
 * viewing and rating. Cast and the previous and next episodes stream in.
 * On phones the navigator is a pill where the tab bar would be, since a
 * detail page has none; on desktop it is two cards at the foot.
 */

const pad = (n: number) => String(n).padStart(2, "0");

type Neighbour = { season: number; episode: number; name: string } | null;

/**
 * The episodes either side, across a season boundary where there is one. The
 * neighbouring season comes from the stored rows or the cache like any other.
 */
async function neighbours(details: TvDetails, season: number, episode: number, list: EpisodeItem[]) {
  const seasons = numberedSeasons(details).map((s) => s.season_number);
  const i = list.findIndex((e) => e.episode === episode);
  let prev: Neighbour = i > 0 ? { season, episode: list[i - 1].episode, name: list[i - 1].name } : null;
  let next: Neighbour = i >= 0 && i < list.length - 1 ? { season, episode: list[i + 1].episode, name: list[i + 1].name } : null;

  if (!prev && season > 1 && seasons.includes(season - 1)) {
    const before = await seasonEpisodes(details.id, season - 1);
    const last = before.at(-1);
    if (last) prev = { season: last.season, episode: last.episode, name: last.name };
  }
  if (!next && seasons.includes(season + 1)) {
    const after = await seasonEpisodes(details.id, season + 1);
    const first = after[0];
    if (first) next = { season: first.season, episode: first.episode, name: first.name };
  }
  return { prev, next };
}

function href(showId: number, n: NonNullable<Neighbour>) {
  return `/title/tv/${showId}/episode/${n.season}/${n.episode}`;
}

async function Navigator({ details, season, episode, list }: { details: TvDetails; season: number; episode: number; list: EpisodeItem[] }) {
  const { prev, next } = await neighbours(details, season, episode, list);
  const index = list.findIndex((e) => e.episode === episode) + 1;
  const code = (n: NonNullable<Neighbour>) => (n.season === season ? `E${pad(n.episode)}` : `S${pad(n.season)} · E${pad(n.episode)}`);

  const card = (n: NonNullable<Neighbour>, dir: "prev" | "next") => (
    <Link
      href={href(details.id, n)}
      data-travel-to={dir}
      className={`flex w-[260px] min-w-0 items-center gap-2.5 rounded-[14px] bg-surface px-3.5 py-3 text-ink shadow-elevation transition-colors duration-(--fast) ease-out hover:bg-surface-2 ${dir === "next" ? "ml-auto flex-row-reverse text-right" : ""}`}
    >
      <Icon name={dir === "next" ? "chevR" : "chevL"} size={18} className="text-ink-3" />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="mono-label text-[10px]!">{episodeCode(n.season, n.episode)}</span>
        <span className="truncate text-[13px] font-semibold">{n.name}</span>
      </span>
    </Link>
  );

  const side = (n: Neighbour, dir: "prev" | "next") =>
    n ? (
      <Link
        href={href(details.id, n)}
        data-travel-to={dir}
        aria-label={`${dir === "prev" ? "Previous" : "Next"}: ${n.name}`}
        className={`inline-flex h-11 min-w-0 max-w-[40%] items-center gap-1.5 rounded-[22px] px-2.5 text-white ${dir === "next" ? "flex-row-reverse text-right" : ""}`}
      >
        <Icon name={dir === "next" ? "chevR" : "chevL"} size={18} />
        <span className={`flex min-w-0 flex-col gap-px ${dir === "next" ? "items-end" : ""}`}>
          <span className="font-mono text-[10px] tracking-[0.05em] text-white/60">{code(n)}</span>
          <span className="max-w-full truncate text-xs font-semibold">{n.name}</span>
        </span>
      </Link>
    ) : (
      <span className="w-11" />
    );

  return (
    <>
      <nav
        aria-label="Episodes"
        data-episode-nav=""
        className="fixed inset-x-4 bottom-[max(18px,env(safe-area-inset-bottom))] z-(--z-tab-bar) flex h-[60px] items-center justify-between rounded-[30px] bg-pill px-2 text-white shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur-[16px] lg:hidden"
      >
        {side(prev, "prev")}
        {index > 0 && (
          <span className="shrink-0 font-mono text-[11px] tracking-[0.05em] text-white/60">
            {index} OF {list.length}
          </span>
        )}
        {side(next, "next")}
      </nav>
      <nav aria-label="Episodes" className="hidden justify-between gap-3 lg:flex">
        {prev ? card(prev, "prev") : <span />}
        {next && card(next, "next")}
      </nav>
    </>
  );
}

/** The regulars in this episode, then its guest stars, marked as such. */
function EpisodeCast({ showId, credits }: { showId: number; credits: EpisodeDetails["credits"] }) {
  const regulars = credits?.cast ?? [];
  const guests = credits?.guest_stars ?? [];
  const people = [
    ...regulars.map((c) => ({ id: c.id, name: c.name, role: c.character, profile: c.profile_path })),
    ...guests
      .filter((g) => !regulars.some((r) => r.id === g.id))
      .map((c) => ({ id: c.id, name: c.name, role: c.character ? `${c.character} · guest` : "Guest", profile: c.profile_path })),
  ];
  if (people.length === 0) return null;
  const meta = `${people.length} in this episode${guests.length ? ` · ${guests.length} guest ${guests.length === 1 ? "star" : "stars"}` : ""}`;
  return (
    <section aria-label="Cast" className="flex min-w-0 flex-col gap-2.5 lg:gap-3.5">
      <SectionHead title="Cast" meta={meta} href={`/title/tv/${showId}/cast`} />
      <Rail label="Cast" className="lg:gap-3.5">
        {people.map((p) => (
          <PersonTile key={`${p.id}-${p.role}`} person={p} className="w-[92px] lg:w-[129px]" sizes="(min-width: 64rem) 129px, 92px" />
        ))}
      </Rail>
    </section>
  );
}

/** The show on the Plex server: Plex's own deep links are per show, not per episode. */
function PlayOnPlex({ url, className }: { url: string | null; className: string }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className={className}>
      <Icon name="play" size={18} />
      Play on Plex
    </a>
  );
}

export async function EpisodePage({ id, season, episode }: { id: number; season: number; episode: number }) {
  const user = await requireUser();
  const loaded = await loadShow(id);
  if (!loaded) return <TitleUnavailable />;
  const { details, logo } = loaded;
  const today = todayKey();

  const [ep, list, viewer, avail, watched, mine, friends, admin] = await Promise.all([
    getEpisode(id, season, episode).catch(() => null),
    seasonEpisodes(id, season),
    viewerOf(user.id, "tv", id),
    availabilityRow("tv", id),
    db.watchedEpisode.findUnique({
      where: { userId_showId_seasonNumber_episodeNumber: { userId: user.id, showId: id, seasonNumber: season, episodeNumber: episode } },
      select: { watchedAt: true, lastWatchedAt: true },
    }),
    episodeRatingOf(user.id, id, season, episode),
    friendsEpisodeAverage(user.id, id, season, episode),
    instanceAdmin(),
  ]);
  const row = list.find((e) => e.episode === episode);
  if (!ep && !row) return <TitleUnavailable />;

  const name = ep?.name || row?.name || `Episode ${episode}`;
  const airDate = ep?.air_date ?? row?.airDate ?? null;
  const runtime = ep?.runtime ?? row?.runtime ?? null;
  const still = ep?.still_path ?? row?.still ?? null;
  const overview = ep?.overview || null;
  const tmdb = ep?.vote_average ? ep.vote_average.toFixed(1) : null;
  const network = details.networks?.[0]?.name ?? null;
  const director = ep?.credits?.crew?.find((c) => c.job === "Director")?.name ?? ep?.crew?.find((c) => c.job === "Director")?.name;
  const code = episodeCode(season, episode);
  const facts = [airDate ? longDate(airDate) : "No air date yet", runtime ? `${runtime} min` : null, network].filter(Boolean);
  const watchedLabel = watched ? pastDay(todayKey(watched.lastWatchedAt ?? watched.watchedAt), today) : null;
  const aired = Boolean(airDate && airDate <= today);
  const target = { kind: "episode" as const, showId: id, season, episode, label: `${code} of ${details.name}` };
  const title = { mediaType: "tv" as const, tmdbId: id };
  const onPlex = avail?.onPlex ?? false;
  const plexUrl = onPlex ? plexWebUrl(admin?.plexMachineId, avail?.plexRatingKey) : null;
  // The show's backdrop, sharp, as on the show's own page (and the same file,
  // so it is usually cached by now); the blurred poster where it has none.
  const art = details.backdrop_path ? <BackdropArt path={details.backdrop_path} /> : <HeroArt path={details.poster_path} />;
  const back = `/title/tv/${id}?season=${season}`;

  const image = (className: string, sizes: string) =>
    still ? (
      <Image src={tmdbSrc(still)} alt="" width={780} height={439} sizes={sizes} priority className={`block object-cover ${className}`} />
    ) : (
      <span className={`block bg-white/10 ${className}`} />
    );

  const ratingPanel = (big: boolean) => (
    <Panel className={`flex flex-col gap-2 ${big ? "max-w-[460px] px-[18px] py-4" : "px-3.5 py-3"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="mono-label">Your rating</span>
        <span className="text-xs text-ink-3">
          {[friends !== null ? `Friends ${friends.toFixed(1)}` : null, tmdb ? `TMDB ${tmdb}` : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      <PopcornPicker target={{ kind: "episode", showId: id, season, episode }} initial={mine} size={38} />
    </Panel>
  );

  const watchButton = (className: string) =>
    aired || watchedLabel ? (
      <WatchToggle target={target} watched={watchedLabel} className={className} />
    ) : (
      <span className={`${className} opacity-60`}>{airDate ? `Out ${longDate(airDate)}` : "Not out yet"}</span>
    );

  return (
    <WhenMenuProvider redate={redateFromTitle}>
      <TickScope>
        {/* Phones */}
        <div className="lg:hidden">
          <div className="relative flex h-[296px] flex-col">
            {art}
            <header className="relative z-(--z-top-row) flex h-[60px] shrink-0 items-center justify-between px-5 pt-4">
              <BackButton kind="glass" />
              <div className="flex gap-2">
                <SaveButton title={title} initial={viewer.saved} lists={viewer.lists} className={GLASS_ICON_SM} />
                <TitleMoreMenu title={title} className={GLASS_ICON_SM} />
              </div>
            </header>
            <EpisodeArrival className="relative z-(--z-lift) flex grow items-end px-5">
              <span className="relative block h-[196px] w-full overflow-hidden rounded-t-[14px] shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                {image("size-full", "(min-width: 64rem) 640px, 100vw")}
                <TickFlash size={52} />
              </span>
            </EpisodeArrival>
          </div>
          <EpisodeArrival className="flex flex-col gap-3.5 px-5 pt-3.5">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                {/* TMDB's lettering is white, drawn for artwork. Here it stands on
                    the page, so in light it gets a night backing to stay full white
                    rather than washing out to grey on paper. */}
                <Link href={back} className="flex light:rounded-md light:bg-night light:px-1.5 light:py-1">
                  <TitleLogo logo={logo} title={details.name} size="small" />
                </Link>
                <span className="font-mono text-xs font-semibold tracking-[0.05em] text-accent-text">{code}</span>
                {onPlex && <PlexChip small />}
              </div>
              <h1 className="m-0 font-display text-[30px] font-extrabold leading-[0.98] tracking-[-0.035em]">{name}</h1>
              <span className="text-xs text-ink-2">{facts.join(" · ")}</span>
            </div>
            <div className="flex items-center gap-2">
              {watchButton(PRIMARY_46)}
              <PlayOnPlex url={plexUrl} className={GHOST_46} />
            </div>
            {ratingPanel(false)}
            {overview && <p className="m-0 text-sm leading-normal text-ink-2">{overview}</p>}
          </EpisodeArrival>
        </div>

        {/* Desktop */}
        <div className="relative hidden flex-col gap-7 px-10 pt-8 lg:flex">
          <div aria-hidden="true" className="absolute inset-x-0 top-0 h-[520px]">
            {art}
          </div>
          <div className="relative flex items-center justify-between">
            <Link href={back} aria-label={`Back to ${details.name}`} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-white/80 hover:text-white">
              <Icon name="chevL" size={16} />
              {details.name}
            </Link>
            <div className="flex gap-2">
              <SaveButton title={title} initial={viewer.saved} lists={viewer.lists} className={GLASS_ICON_SM} />
              <TitleMoreMenu title={title} className={GLASS_ICON_SM} />
            </div>
          </div>
          <EpisodeArrival className="relative grid grid-cols-2 items-start gap-9 xl:grid-cols-[640px_minmax(0,1fr)]">
            <span className="relative block aspect-video overflow-hidden rounded-2xl shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
              {image("size-full", "(min-width: 64rem) 640px, 100vw")}
              <TickFlash size={72} />
            </span>
            <div className="flex min-w-0 flex-col justify-between gap-3.5 text-white xl:min-h-[360px]">
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2.5">
                  <Link href={back} className="flex">
                    <TitleLogo logo={logo} title={details.name} size="small" />
                  </Link>
                  <span className="font-mono text-[13px] font-semibold tracking-[0.05em] text-accent">{code}</span>
                  {onPlex && <PlexChip small />}
                </div>
                <h1 className="m-0 font-display text-[48px] font-extrabold leading-[0.95] tracking-[-0.035em] text-balance">{name}</h1>
                <span className="text-sm text-white/78">{[...facts, director ? `directed by ${director}` : null].filter(Boolean).join(" · ")}</span>
                <div className="flex flex-wrap items-center gap-2.5">
                  {watchButton(WHITE_46)}
                  <PlayOnPlex url={plexUrl} className={GLASS_46} />
                </div>
                {overview && <p className="m-0 line-clamp-4 max-w-[480px] text-[15px] leading-normal text-white/85">{overview}</p>}
              </div>
              {ratingPanel(true)}
            </div>
          </EpisodeArrival>
        </div>

        {/* Both widths from here: one column of sections under the hero.
            Positioned, so it paints over the foot of the desktop artwork above,
            which runs past the hero and used to cover the cast's head. */}
        <div className="relative flex flex-col gap-4 px-5 pt-4 lg:gap-7 lg:px-10 lg:pt-7">
          <Suspense fallback={<PeopleRailBones />}>
            <EpisodeCast showId={id} credits={ep?.credits ?? (ep ? { cast: [], guest_stars: ep.guest_stars ?? [], crew: [] } : undefined)} />
          </Suspense>
          <Suspense fallback={<AsideBones />}>
            <FeelingsSection userId={user.id} mediaType="tv" tmdbId={id} scope={{ season, episode }} />
          </Suspense>
          <Suspense fallback={null}>
            <Navigator details={details} season={season} episode={episode} list={list} />
          </Suspense>
        </div>
      </TickScope>
    </WhenMenuProvider>
  );
}
