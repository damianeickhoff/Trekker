import type { ReactNode } from "react";
import { fillDown } from "@/lib/columns";
import { listDate, pastDay, todayKey } from "@/lib/dates";
import { marksFor } from "@/lib/home";
import { titleKey, type Mark } from "@/lib/marks";
import { hoursAndMinutes, progressVerdict, seasonToCome, verdictOnScore } from "@/lib/progress";
import { commentsFor, feelingTally, type FeelingScope } from "@/lib/social";
import {
  availabilityFor,
  hasAired,
  isEnded,
  minutesWatched,
  numberedSeasons,
  seasonEpisodes,
  watchedKeys,
  type NextEpisode,
  type Viewer,
} from "@/lib/title";
import { normalise, type CastMember, type TmdbListItem, type TvDetails } from "@/lib/tmdb";
import { db } from "@/lib/db";
import { friendsBySeasonEpisode } from "@/lib/friends-watched";
import { StatusMark } from "../artwork";
import { AvatarStack } from "./avatar-stack";
import { Icon } from "../icon";
import { Link } from "../link";
import { Poster } from "../poster";
import { Rail } from "../rail";
import { SectionHead } from "../section-head";
import { ArtChip, buttonClass, filterChipClass, StateChip } from "../ui";
import { RequestButton } from "./keep-buttons";
import { PersonTile } from "./people";
import { Comments, FeelingsPicker, FeelingsTally } from "./social";
import { EpisodeTick, MarkSeasonButton } from "./watch-buttons";
import { FILL, fillTo, ZOOM, ZOOM_GROUP, ZOOM_SHADOW } from "../motion";
import { Swap } from "../swap";

/*
 * The sections of the title and film pages. Tier 1 (progress) reads rows;
 * the episode list is tier 2; availability's streaming offers, cast, feelings,
 * comments and more like this are tier 3, each rendered inside its own
 * Suspense boundary by the page, behind the matching bones in `bones.tsx`.
 */

/** A panel on the page: its own surface and ink, so it never inherits a hero's colour. */
export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-surface text-ink shadow-elevation ${className}`}>{children}</div>;
}

/** A small uppercase label over a section. */
export function AsideLabel({ children, meta }: { children: ReactNode; meta?: ReactNode }) {
  const tone = "text-ink-3";
  return (
    <div className="flex items-baseline justify-between">
      <span className={`font-mono text-[11px] font-medium uppercase tracking-[0.05em] ${tone}`}>{children}</span>
      {meta && <span className={`text-xs ${tone}`}>{meta}</span>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Availability

/**
 * Where to watch it, as one line and one action: Play on Plex when it is on
 * the server, Request when Overseerr can fetch it, nothing when neither can
 * help. The Request button asks first when a service this person pays for
 * already has it.
 */
export async function AvailabilityPanel({
  userId,
  mediaType,
  tmdbId,
  inCinemas = false,
}: {
  userId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  inCinemas?: boolean;
}) {
  const a = await availabilityFor(userId, mediaType, tmdbId);
  const stream = a.stream ?? [];
  const notPlex = a.plexConnected ? "Not on Plex" : null;
  let title: string;
  let sub: string;
  let action: ReactNode = null;
  const button = buttonClass("ghost", "sm", "shrink-0");

  if (a.onPlex) {
    title = ["On Plex", ...a.mine].join(" · ");
    sub = ["On your server", a.mine.length ? "in your subscriptions" : null].filter(Boolean).join(" · ");
    if (a.plexUrl) {
      action = (
        <a href={a.plexUrl} target="_blank" rel="noreferrer" className={button}>
          <Icon name="play" size={18} />
          Play on Plex
        </a>
      );
    }
  } else if (a.mine.length) {
    title = `On ${a.mine.join(" · ")}`;
    sub = ["In your subscriptions", a.plexConnected ? "not on Plex" : null].filter(Boolean).join(" · ");
  } else if (a.available) {
    title = "Available";
    sub = "Overseerr says it has arrived · Play on Plex shows once the server is checked";
  } else if (a.requested) {
    title = "Requested";
    sub = ["Waiting on Overseerr", stream.length ? `streams on ${stream.slice(0, 2).join(", ")}` : null]
      .filter(Boolean)
      .join(" · ");
  } else {
    title = inCinemas ? "In cinemas now" : stream.length ? `Streams on ${stream.slice(0, 2).join(" · ")}` : "Not streaming yet";
    sub = [notPlex, stream.length ? "not on your services" : "not on your services yet"].filter(Boolean).join(" · ");
    if (a.stream === null && !a.plexConnected) sub = `No streaming information for ${a.region} yet`;
  }
  if (!a.onPlex && !a.requested && a.canRequest) {
    action = <RequestButton title={{ mediaType, tmdbId }} alreadyOn={a.mine} className={button} />;
  }
  if (a.requested && !a.onPlex) {
    action = (
      <span className={`${button} text-ink-2`}>
        <Icon name="clock" size={18} className="text-accent-text" />
        Requested
      </span>
    );
  }

  return (
    <Panel className="flex items-center gap-3 px-4 py-3.5">
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="font-display text-base font-bold tracking-[-0.02em]">{title}</span>
        <span className="text-xs text-ink-2">{sub}</span>
      </span>
      {action}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Progress

function Bar({ pct }: { pct: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-surface-2">
      <div className={FILL} style={fillTo(Math.min(100, Math.max(0, pct)))} />
    </div>
  );
}

/**
 * Where this person is in a show: the bar while there is ground to cover, and
 * once caught up, the written verdict in its place, "That's it, folks" for a
 * show that has ended and "More to come" for one with a season on the way.
 * Nothing before the first episode; a note instead once they stopped watching.
 */
export async function ProgressPanel({
  userId,
  details,
  viewer,
}: {
  userId: string;
  details: TvDetails;
  viewer: Viewer;
}) {
  if (viewer.dropped) {
    return (
      <Panel className="flex flex-col gap-1.5 border-l-4 border-l-accent p-4">
        <span className="font-display text-[17px] font-bold tracking-[-0.02em]">You stopped watching this</span>
        <span className="text-xs leading-[1.45] text-ink-2">
          It is out of Up next and off the calendar. Everything you logged is still here; pick it back up from the menu.
        </span>
      </Panel>
    );
  }
  const state = viewer.state;
  if (!state || state.watchedCount === 0) return null;

  const today = todayKey();
  const seasons = numberedSeasons(details).length;
  const verdict = progressVerdict({
    airedCount: state.airedCount,
    watchedCount: state.watchedCount,
    ended: isEnded(details.status),
    seasonToCome: seasonToCome(details),
  });
  const last = state.lastWatchedAt ? pastDay(todayKey(state.lastWatchedAt), today) : null;
  const s = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

  if (verdict !== "bar") {
    const hours = Math.round((await minutesWatched(userId, details.id)) / 60);
    const lines =
      verdict === "finished"
        ? [
            `Every last one of ${s(state.airedCount, "episode")} across ${s(seasons, "season")}: ${details.name} is done, and so are you.`,
            verdictOnScore(details.vote_count >= 10 ? Math.round(details.vote_average * 10) : null),
            `That is ${s(hours, "hour")} of your life, and there is no getting it back. Worth it, obviously.`,
          ]
        : [
            `Don't be sad, this isn't the end. You are level with all ${s(state.airedCount, "released episode")}, and ${details.name} has another season coming.`,
            details.next_episode_to_air?.air_date
              ? `It starts back up on ${listDate(details.next_episode_to_air.air_date)}, so keep the evening free.`
              : "No date announced yet, but nobody has called it done either. Sit tight.",
            `${s(hours, "hour")} in and counting.`,
          ];
    return (
      <Panel className="flex flex-col gap-2.5 p-4">
        <span className="font-display text-xl font-bold tracking-[-0.02em]">
          {verdict === "finished" ? "That’s it, folks" : "More to come"}
        </span>
        <div className="flex flex-col gap-1.5 text-[13px] leading-[1.45] text-ink-2">
          {lines.map((line) => (
            <p key={line} className="m-0">
              {line}
            </p>
          ))}
        </div>
        {last && <span className="text-xs text-ink-3">Last watched {last}</span>}
      </Panel>
    );
  }

  // Against every announced episode, not only the ones out: against aired
  // alone the bar would reach 100% mid-season and read as finished.
  const total = Math.max(state.totalCount, state.airedCount, state.watchedCount);
  const pct = total ? Math.round((state.watchedCount / total) * 100) : 0;
  const toGo = Math.max(state.airedCount - state.watchedCount, 0);

  const spent = await minutesWatched(userId, details.id);
  let time: string | null = null;
  if (toGo > 0) {
    const [aired, seen] = await Promise.all([
      db.showEpisode.findMany({
        where: { showId: details.id, seasonNumber: { gt: 0 }, airDate: { lte: today } },
        select: { seasonNumber: true, episodeNumber: true, runtime: true },
      }),
      watchedKeys(userId, details.id),
    ]);
    const fallback = details.episode_run_time?.[0] ?? 45;
    const minutes = aired
      .filter((e) => !seen.has(`${e.seasonNumber}:${e.episodeNumber}`))
      .reduce((sum, e) => sum + (e.runtime ?? fallback), 0);
    if (minutes > 0) time = hoursAndMinutes(minutes);
  }

  return (
    <Panel className="flex flex-col gap-2.5 p-4">
      <div className="flex items-baseline justify-between">
        <span className="font-display text-[17px] font-bold tracking-[-0.02em]">
          {state.watchedCount} of {s(total, "episode")}
        </span>
        <span className="font-mono text-xs font-medium tracking-[0.05em] text-accent-text">{pct}%</span>
      </div>
      <Bar pct={pct} />
      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-ink-2">
        <span>
          {toGo > 0 ? `${toGo} to go${time ? ` · ${time}` : ""}` : `${total - state.airedCount} still to air`}
          {spent > 0 && ` · ${hoursAndMinutes(spent)} watched`}
        </span>
        {last && <span>Last watched {last}</span>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Episodes

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * The season chips and that season's episodes: a tick each, the next one
 * marked, and Mark whole season for the aired gaps. Seasons are links, so the
 * choice is in the address and survives a reload. How far through the chosen
 * season this person is goes on one line over its episodes rather than on
 * every chip.
 */
export async function EpisodeList({
  userId,
  details,
  season,
  next,
}: {
  userId: string;
  details: TvDetails;
  season: number;
  next: NextEpisode | null;
}) {
  const today = todayKey();
  // Friends' faces on the rows come from one query for the whole season.
  const [episodes, seen, friends] = await Promise.all([
    seasonEpisodes(details.id, season),
    watchedKeys(userId, details.id),
    friendsBySeasonEpisode(userId, details.id, season),
  ]);
  const seasons = numberedSeasons(details);
  const specials = details.seasons.find((s) => s.season_number === 0 && s.episode_count > 0);
  const multi = seasons.length > 1;
  const unseenAired = episodes.some((e) => hasAired(e.airDate, today) && !seen.has(`${e.season}:${e.episode}`));
  const watchedHere = episodes.filter((e) => seen.has(`${e.season}:${e.episode}`)).length;
  const toGo = episodes.length - watchedHere;

  return (
    // Capped on a wide screen, where the two columns would otherwise run to
    // nearly 700px each and leave a row's date or runtime a long way from its name.
    <section aria-label="Episodes" className="flex min-w-0 flex-col gap-1.5 lg:gap-2 wide:max-w-[1100px]">
      <div className="flex items-center gap-2">
        <div className="no-scrollbar -ml-1 flex min-w-0 grow gap-2 overflow-x-auto py-1 pl-1">
          {seasons.map((s) => (
            <Link
              key={s.season_number}
              href={`/title/tv/${details.id}?season=${s.season_number}`}
              scroll={false}
              replace
              aria-current={s.season_number === season ? "true" : undefined}
              className={filterChipClass(s.season_number === season)}
            >
              Season {s.season_number}
            </Link>
          ))}
          {specials && (
            <Link href={`/title/tv/${details.id}?season=0`} scroll={false} replace className={filterChipClass(season === 0)}>
              Specials
            </Link>
          )}
        </div>
        {unseenAired && (
          <>
            <span className="lg:hidden">
              <MarkSeasonButton showId={details.id} season={season} label="Mark season" />
            </span>
            {/* On a desktop this line can sit in the hero's fade, grey on grey in
                light; the page colour behind it keeps it legible over any art. */}
            <span className="hidden rounded-full bg-bg px-2.5 py-1 lg:inline">
              <MarkSeasonButton showId={details.id} season={season} label="Mark whole season" />
            </span>
          </>
        )}
      </div>

      {/* Another season's episodes cross over this one's, the height following by `grid-template-rows` (`Swap`, `stack`). */}
      <Swap id={String(season)} mode="stack">
        <div className="flex min-w-0 flex-col gap-1.5 lg:gap-2">
          {episodes.length > 0 && (
            <p className="mono-label m-0 pt-1.5 lg:-ml-2 lg:mt-1.5 lg:self-start lg:rounded-md lg:bg-bg lg:px-2 lg:py-0.5 lg:text-ink-2">
              {watchedHere} of {episodes.length} watched{toGo > 0 ? ` · ${toGo} to go` : ""}
            </p>
          )}

          {episodes.length === 0 ? (
            <p className="m-0 py-4 text-[13px] text-ink-2">TMDB has not listed this season&rsquo;s episodes yet.</p>
          ) : (
            // Two lists rather than one grid, so the columns fill downwards and the
            // numbers read down each one (see `fillDown`).
            <div className="grid grid-cols-1 lg:grid-cols-2 lg:gap-x-8">
              {fillDown(episodes).map((column, i) => (
                <ul key={i} className="m-0 list-none p-0">
                  {column.map((e) => {
                    const key = `${e.season}:${e.episode}`;
                    const watched = seen.has(key);
                    const aired = hasAired(e.airDate, today);
                    const isNext = next?.season === e.season && next.episode === e.episode;
                    const code = `E${pad(e.episode)}`;
                    const label = `${multi || e.season === 0 ? `S${pad(e.season)} · ` : ""}${code} of ${details.name}`;
                    return (
                      <li key={key} className="flex h-[54px] min-w-0 items-center gap-3.5 border-b border-line px-1">
                        <Link
                          href={`/title/tv/${details.id}/episode/${e.season}/${e.episode}`}
                          className="flex min-w-0 grow items-center gap-3.5"
                        >
                          <span className={`w-8 shrink-0 font-mono text-xs font-semibold ${isNext ? "text-accent-text" : "text-ink-3"}`}>
                            {code}
                          </span>
                          <span className="flex min-w-0 grow items-center gap-2">
                            <span className={`truncate text-sm ${isNext ? "font-bold" : "font-medium"}`}>{e.name}</span>
                            {isNext && <StateChip small>Next</StateChip>}
                          </span>
                          <AvatarStack people={friends.get(e.episode) ?? []} />
                          <span className="shrink-0 whitespace-nowrap text-xs text-ink-3">
                            {watched ? "Watched" : aired ? (e.runtime ? `${e.runtime} min` : "") : e.airDate ? listDate(e.airDate) : "No date yet"}
                          </span>
                        </Link>
                        {aired || watched ? (
                          <EpisodeTick showId={details.id} season={e.season} episode={e.episode} label={label} watched={watched} />
                        ) : (
                          <span aria-hidden="true" className="size-7 shrink-0" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              ))}
            </div>
          )}
        </div>
      </Swap>
    </section>
  );
}

// ---------------------------------------------------------------------------
// People, and more like this

/**
 * The cast rail, under the standard section head at both widths: the title
 * and the chevron to the cast page, no count, like every other head on the
 * page. From `lg` the tiles are a single row of whole tiles spread to the
 * column's full width, so the chevron sits over the last one rather than over
 * a tile cut off by the edge; the rest are on the cast page. Tiles are the
 * desktop poster width (`--poster-desk`), so the cast lines up with More like
 * this.
 */
export function CastRail({ cast, href, title = "Cast" }: { cast: CastMember[]; href: string; title?: string }) {
  if (cast.length === 0) return null;
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
      <SectionHead title={title} href={href} />
      {/*
        From `lg`: as many fixed tracks as fit, spread edge to edge, and two
        whole rows; further tiles fall into rows of no height. The space
        between rows is each tile's own bottom margin, not a row gap, so a
        collapsed row takes none, and the rail's bottom padding is off here so
        the clip falls at the second row's foot rather than 12px into the
        third's faces. The negative margin gives the last tile's margin back.
      */}
      <Rail
        label={title}
        className="lg:grid lg:grid-cols-[repeat(auto-fill,var(--poster-desk))] lg:grid-rows-[repeat(2,auto)] lg:auto-rows-[0] lg:justify-between lg:gap-x-(--tile-gap) lg:gap-y-0 lg:overflow-hidden lg:-mb-5 lg:pb-0"
      >
        {cast.map((c) => (
          <PersonTile
            key={`${c.id}-${c.character}`}
            person={{ id: c.id, name: c.name, role: c.character, profile: c.profile_path }}
            className="w-[92px] lg:mb-5 lg:w-full"
            sizes="(min-width: 64rem) 93px, 92px"
          />
        ))}
      </Rail>
    </section>
  );
}

type Recommendation = NonNullable<ReturnType<typeof normalise>>;

/** TMDB's recommendations as list items, the ones with a poster. */
export function recommendations(items: TmdbListItem[], mediaType: "movie" | "tv"): Recommendation[] {
  return items
    .map((i) => normalise(i, mediaType))
    .filter((i): i is Recommendation => i !== null && Boolean(i.poster));
}

/** One recommendation: the poster, its audience score, and its Plex or request mark. */
export function RecommendationTile({
  item,
  mark,
  className,
  sizes,
}: {
  item: Recommendation;
  mark: Mark;
  className: string;
  sizes: string;
}) {
  return (
    <Link
      href={`/title/${item.mediaType}/${item.id}`}
      role="listitem"
      aria-label={item.title}
      className={`${ZOOM_GROUP} block aspect-[2/3] shrink-0 rounded-[10px] ${ZOOM_SHADOW} ${className}`}
    >
      <span className="relative block size-full overflow-hidden rounded-[10px] shadow-elevation">
        <Poster path={item.poster} alt="" title={item.title} width={154} height={231} sizes={sizes} className={`size-full ${ZOOM}`} />
        {item.score > 0 && (
          <span className="absolute right-1.5 top-1.5 flex">
            <ArtChip small>{item.score}%</ArtChip>
          </span>
        )}
        {mark && (
          <span className="absolute bottom-1.5 left-1.5 flex">
            <StatusMark mark={mark} />
          </span>
        )}
      </span>
    </Link>
  );
}

/**
 * TMDB's recommendations. Four across the desktop right-hand column from `xl`,
 * filling it; a rail everywhere else, at the desktop poster width from `lg`.
 * The chevron goes to all of them on a page of their own.
 */
export async function MoreLikeThis({
  items,
  mediaType,
  tmdbId,
}: {
  items: TmdbListItem[];
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  const list = recommendations(items, mediaType).slice(0, 12);
  if (list.length === 0) return null;
  const marks = await marksFor(list.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id })));

  return (
    <section aria-label="More like this" className="flex min-w-0 flex-col gap-3">
      <SectionHead title="More like this" href={`/title/${mediaType}/${tmdbId}/similar`} />
      <Rail
        label="More like this"
        className="xl:grid xl:grid-cols-4 xl:gap-(--tile-gap) xl:overflow-visible xl:[&>*:nth-child(n+9)]:hidden"
      >
        {list.map((i) => (
          <RecommendationTile
            key={`${i.mediaType}-${i.id}`}
            item={i}
            mark={marks[titleKey(i.mediaType, i.id)] ?? null}
            className="w-[108px] lg:w-(--poster-desk) xl:w-auto"
            sizes="(min-width: 64rem) 93px, 108px"
          />
        ))}
      </Rail>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Feelings and comments

export async function FeelingsSection({
  userId,
  mediaType,
  tmdbId,
  scope,
}: {
  userId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
  scope: FeelingScope;
}) {
  const tally = await feelingTally(userId, mediaType, tmdbId, scope);
  const people = `${tally.people} ${tally.people === 1 ? "person" : "people"}`;
  if (scope === "all-episodes") {
    if (tally.people === 0) return null;
    return (
      <section aria-label="How it felt" className="flex flex-col gap-2.5">
        <AsideLabel meta={people}>
          How it felt · everyone
        </AsideLabel>
        <FeelingsTally counts={tally.counts} />
      </section>
    );
  }
  return (
    <section aria-label="How it felt" className="flex flex-col gap-2.5">
      <AsideLabel meta={tally.people ? people : null}>
        How it felt · everyone
      </AsideLabel>
      <FeelingsPicker
        where={{ mediaType, tmdbId, season: scope.season, episode: scope.episode }}
        counts={tally.counts}
        mine={tally.mine}
      />
    </section>
  );
}

export async function CommentsSection({
  userId,
  mediaType,
  tmdbId,
}: {
  userId: string;
  mediaType: "movie" | "tv";
  tmdbId: number;
}) {
  const items = await commentsFor(userId, mediaType, tmdbId);
  return (
    <section aria-label="Comments">
      <Comments where={{ mediaType, tmdbId }} items={items} href={`/title/${mediaType}/${tmdbId}/comments`} />
    </section>
  );
}
