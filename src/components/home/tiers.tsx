import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getLandingSoon } from "@/lib/calendar";
import { monthlyChallenges } from "@/lib/challenges";
import { addDays, dateParts, landingWhen, todayKey, watchedWhen } from "@/lib/dates";
import { db } from "@/lib/db";
import { seenAmong, tryCategory } from "@/lib/discover";
import { friendViewings } from "@/lib/friends";
import { filmBackdrops, getCardExtras, marksFor, networksFor } from "@/lib/home";
import { cachedChallengeProgress, cachedOnThisDay, cachedRecentlyWatched } from "@/lib/home-cache";
import { episodeCode, titleHref, titleKey } from "@/lib/marks";
import { regionFor } from "@/lib/providers";
import { plexLinked } from "@/lib/now-playing";
import { ensureBackfill } from "@/lib/refresh";
import { importProgress } from "@/lib/trakt-import";
import { getUpNext } from "@/lib/title-state";
import { Icon } from "../icon";
import { Link } from "../link";
import { ArtChip, buttonClass, StateChip } from "../ui";
import { PosterCard, WideCard } from "../poster-card";
import { Rail } from "../rail";
import { UserAvatar } from "../user-avatar";
import { SectionHead } from "../section-head";
import { EmptyState } from "../empty-state";
import { agoLabel, shortAgo } from "@/lib/when";
import { newsFor } from "@/lib/news";
import { artKey, titleArt } from "@/lib/news-page";
import { newsPrefs } from "@/lib/news-settings";
import { HomeNewsCard } from "../news/your-cards";
import { FirstRun } from "./first-run";
import { BackfillCard } from "./backfill-card";
import { ImportCard } from "./import-card";
import { NowWatching } from "./now-watching";
import { ChallengeStrip } from "./challenge-strip";
import { AlsoWaitingList, UpNextCard, WAITING_ROWS } from "./up-next";

/*
 * Home's tiers, each an async server component rendered inside its own
 * Suspense boundary, so each streams in on its own and a slow one holds up
 * nothing else. Every read is rows; none reaches the network.
 *
 * 1. Up next and Also waiting, from `TitleState` (and the backfill card).
 * 2. Landing soon, from `ShowEpisode` and the watchlist; Recently watched,
 *    from `Play`.
 * 3. The monthly challenges; On this day, from `Play`; Friends watched.
 *
 * The exception is Trending this week, Discover's trending answer, which is a
 * cached row for an hour and then asked of TMDB again by whichever request
 * finds it stale. It is in a boundary of its own, so that one request waits on
 * TMDB for that rail alone.
 *
 * The order, one flex column at every width: the challenges, the Up next
 * card, Also waiting (its own section below `xl`, the card's panel from it),
 * Now watching, Landing soon, Trending this week, News (Round 10: after
 * Trending, sharing its `order-6` and following it in the source, so the
 * flex order settles the tie by source order), Friends watched, On this day,
 * Recently watched.
 */

/** The row read, not just the signature: a revoked session stops here. */
async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * How many shows the card and Also waiting draw from. Also waiting shows six
 * (the card's panel three), and its count and "Show all N" must count them
 * all; the ceiling only keeps a vast backlog from swelling the page, and the
 * query reads every candidate row whatever it is.
 */
const UP_NEXT_TAKE = 100;

export async function UpNextTier() {
  const user = await requireUser();
  const today = todayKey();
  const [imported, upNext, counts] = await Promise.all([
    importProgress(user.id),
    getUpNext(user.id, UP_NEXT_TAKE, today),
    db.user.findUnique({ where: { id: user.id }, select: { playCount: true, _count: { select: { watchlist: true } } } }),
  ]);
  // An import resets the backfill as it ends; until then the backfill waits for it.
  const progress = imported.running ? { running: false, total: 0, done: 0 } : await ensureBackfill(user.id);
  // Nothing watched and nothing saved: the first run, three ways in instead of an empty card.
  if (!progress.running && !imported.running && counts && counts.playCount === 0 && counts._count.watchlist === 0) {
    return <FirstRun name={user.name} />;
  }
  const [first, ...rest] = upNext;
  // Networks only for the rows drawn from `lg`, which are the only ones that show them.
  const [extras, networks] = await Promise.all([
    first ? getCardExtras(user.id, first.showId, first) : null,
    networksFor(rest.slice(0, WAITING_ROWS).map((r) => r.showId)),
  ]);

  return (
    <>
      {imported.running && <ImportCard progress={imported} />}
      {progress.running && <BackfillCard progress={progress} />}
      {first && extras ? (
        <UpNextCard row={first} extras={extras} waiting={rest} networks={networks} today={today} />
      ) : (
        !progress.running &&
        !imported.running && (
          <EmptyState
            icon="tv"
            title="Nothing waiting"
            className="order-2"
            action={
              <Link href="/calendar" className={buttonClass("ghost", "sm")}>
                <Icon name="calendar" size={18} />
                See what is coming
              </Link>
            }
          >
            When a show you are watching has a new episode out, it turns up here.
          </EmptyState>
        )
      )}
      <AlsoWaitingList rows={rest} networks={networks} />
    </>
  );
}

/**
 * Now watching in the house, only where Plex is linked: the one Home piece
 * that asks the network, from the browser after paint (`NowWatching`), and
 * never while the tab is hidden. A database read decides whether it is drawn
 * at all, so an instance without Plex never polls.
 */
export async function NowWatchingTier() {
  await requireUser();
  return (await plexLinked()) ? <NowWatching /> : null;
}

/**
 * News about what they follow (T2; Round 10, the Home boards): a rail of the
 * five newest For you stories at both widths, 268px cards on desktop and
 * 220px in a phone's swipe rail, each the title's backdrop from the cache (or
 * its poster) with the kind chip, a followed person's face on its corner, the
 * headline in two lines and "Lanterns · 2 h". The head's count is unread For
 * you news, as the sidebar's is; the chevron goes to `/news`. Absent when
 * there is none, so it has no bones. Headlines from feeds never come here.
 */
const NEWS_RAIL = 5;

export async function NewsTier() {
  const user = await requireUser();
  const [news, prefs] = await Promise.all([newsFor(user.id), newsPrefs(user.id)]);
  if (news.length === 0) return null;
  const unread = news.filter((n) => !n.read).length;
  const rows = news.slice(0, NEWS_RAIL);
  const art = await titleArt(rows.map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId })));
  const now = new Date();
  return (
    <section aria-labelledby="home-news" className="order-6 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead id="home-news" title="News" meta={unread ? `${unread} unread · about what you follow` : "about what you follow"} href="/news" />
      <Rail label="News">
        {rows.map((row) => (
          <HomeNewsCard key={row.id} row={row} art={art.get(artKey(row.mediaType, row.tmdbId))} age={shortAgo(row.at, now)} markOnOpen={prefs.markOnOpen} />
        ))}
      </Rail>
    </section>
  );
}

/**
 * Tiles the Landing soon rail draws. It stops here because it loads all its
 * artwork at once when it comes into view, and the calendar is one tap away
 * for the rest.
 */
const LANDING_RAIL = 12;

export async function LandingSoonTier() {
  const user = await requireUser();
  const today = todayKey();
  const all = await getLandingSoon(user.id, today);
  if (all.length === 0) return null;
  const items = all.slice(0, LANDING_RAIL);
  const [marks, films] = await Promise.all([
    marksFor(items),
    filmBackdrops(items.filter((l) => l.mediaType === "movie").map((l) => l.tmdbId)),
  ]);

  return (
    <section aria-labelledby="landing-soon" className="order-5 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead id="landing-soon" title="Landing soon" meta="next 3 weeks" href="/calendar" />
      <Rail label="Landing soon" cards>
        {items.map((l) => {
          const premiere = l.tag === "season-premiere" || l.tag === "series-premiere";
          return (
            <WideCard
              key={l.key}
              href={titleHref(l.mediaType, l.tmdbId)}
              label={`${l.title}, ${landingWhen(l.date, today)}`}
              backdrop={l.backdrop ?? films.get(l.tmdbId) ?? null}
              poster={l.poster}
              title={l.title}
              line={landingLine(l)}
              mark={marks[titleKey(l.mediaType, l.tmdbId)] ?? null}
              chips={
                <>
                  <StateChip small>{landingWhen(l.date, today)}</StateChip>
                  {premiere && <ArtChip small>Premiere</ArtChip>}
                </>
              }
            />
          );
        })}
      </Rail>
    </section>
  );
}

/** Under a Landing soon title: the episode's code, or how a film arrives. */
function landingLine(l: Awaited<ReturnType<typeof getLandingSoon>>[number]) {
  if (l.mediaType === "tv") return episodeCode(l.seasonNumber, l.episodeNumber);
  return l.kind === "streaming" ? "Streaming" : "In cinemas";
}

/**
 * Trending this week, as Discover has it: the same cached answer, so the two
 * pages never disagree and neither costs the other a request.
 */
export async function TrendingTier() {
  const user = await requireUser();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { region: true } });
  const page = await tryCategory("trending", { type: "all", region: regionFor(me?.region), today: todayKey() });
  const items = (page?.items ?? []).slice(0, 20);
  if (items.length === 0) return null;
  const [marks, seen] = await Promise.all([
    marksFor(items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id }))),
    seenAmong(user.id, items),
  ]);

  return (
    <section aria-labelledby="trending-week" className="order-6 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead id="trending-week" title="Trending this week" href="/discover/trending" />
      <Rail label="Trending this week" cards>
        {items.map((item) => (
          <PosterCard
            key={titleKey(item.mediaType, item.id)}
            item={{ ...item, tmdbId: item.id }}
            mark={marks[titleKey(item.mediaType, item.id)] ?? null}
            seen={seen.has(titleKey(item.mediaType, item.id))}
          />
        ))}
      </Rail>
    </section>
  );
}

export async function RecentlyWatchedTier() {
  const user = await requireUser();
  const items = await cachedRecentlyWatched(user.id);
  if (items.length === 0) return null;
  const marks = await marksFor(items);
  const today = todayKey();
  const weekStart = addDays(today, -6);
  const thisWeek = items.filter((i) => todayKey(new Date(i.watchedAt)) >= weekStart).length;

  return (
    <section aria-labelledby="recently-watched" className="order-9 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead
        id="recently-watched"
        title="Recently watched"
        meta={thisWeek ? `${thisWeek} this week` : "none this week"}
        href="/history"
      />
      <Rail label="Recently watched" cards>
        {items.map((item) => (
          <PosterCard
            key={titleKey(item.mediaType, item.tmdbId)}
            item={item}
            mark={marks[titleKey(item.mediaType, item.tmdbId)] ?? null}
            // When it was watched, on the dark art chip rather than amber: it
            // is a fact about the viewing, not state that asks for anything.
            chip={watchedWhen(todayKey(new Date(item.watchedAt)), today)}
            // The play log has no release year; what was watched last says more here anyway.
            meta={item.mediaType === "tv" ? `Show · ${episodeCode(item.seasonNumber, item.episodeNumber)}` : "Film"}
          />
        ))}
      </Rail>
    </section>
  );
}

export async function ChallengesTier() {
  const user = await requireUser();
  const now = new Date();
  const [progress, prefs] = await Promise.all([
    cachedChallengeProgress(user.id, now),
    db.user.findUnique({ where: { id: user.id }, select: { challengesCollapsed: true } }),
  ]);
  const data = await monthlyChallenges(user.id, now, progress);
  if (data.cards.length === 0) return null;
  return (
    <div className="order-1">
      <ChallengeStrip data={data} collapsed={prefs?.challengesCollapsed ?? false} />
    </div>
  );
}

/**
 * What was watched on this date in earlier years, the year on each poster.
 * Most days there is nothing, and then the section is not drawn at all.
 */
export async function OnThisDayTier() {
  const user = await requireUser();
  const items = await cachedOnThisDay(user.id);
  if (items.length === 0) return null;
  const marks = await marksFor(items);

  return (
    <section aria-labelledby="on-this-day" className="order-8 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead id="on-this-day" title="On this day" meta={`${dateParts(todayKey()).day} ${dateParts(todayKey()).month}`} />
      <Rail label="On this day" cards>
        {items.map((item) => (
          <PosterCard
            key={`${item.year}:${titleKey(item.mediaType, item.tmdbId)}`}
            item={{ ...item, year: null }}
            chip={String(item.year)}
            mark={marks[titleKey(item.mediaType, item.tmdbId)] ?? null}
            meta={`${item.mediaType === "tv" ? "Show" : "Film"} · watched in ${item.year}`}
          />
        ))}
      </Rail>
    </section>
  );
}

/**
 * What friends have been watching, as the old app's rail had it: wide cards,
 * each the episode's still or the title's backdrop, the friend and when on
 * chips, "Again" for a rewatch, and the title and episode at the foot.
 * Somebody with no friends has nothing to be told here, so the section goes,
 * and so does it when they have watched nothing yet.
 */
export async function FriendsWatchedTier() {
  const user = await requireUser();
  const rows = await friendViewings(user.id);
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="friends-watched" className="order-7 flex flex-col gap-3 lg:gap-3.5">
      <SectionHead id="friends-watched" title="Friends watched" meta="latest" href="/friends" />
      <Rail label="Friends watched" cards>
        {rows.map((r) => (
          <WideCard
            key={r.key}
            href={titleHref(r.mediaType, r.tmdbId)}
            label={`${r.friend.name} watched ${r.title}`}
            backdrop={r.image}
            poster={r.poster}
            title={r.title}
            line={
              r.mediaType === "tv"
                ? [episodeCode(r.seasonNumber, r.episodeNumber), r.episodeName].filter(Boolean).join(" · ")
                : "Film"
            }
            chips={
              <>
                <ArtChip small>
                  <span className="-ml-1 inline-flex items-center gap-1.5 normal-case">
                    <UserAvatar id={r.friend.id} name={r.friend.name} src={r.friend.avatar} size={16} />
                    {r.friend.name}
                  </span>
                </ArtChip>
                <ArtChip small>
                  <span className="inline-flex items-center gap-1">
                    <Icon name={r.mediaType === "tv" ? "tv" : "film"} size={11} />
                    {shortWhen(r.at)}
                  </span>
                </ArtChip>
                {r.again && <ArtChip small>Again</ArtChip>}
              </>
            }
          />
        ))}
      </Rail>
    </section>
  );
}

/** A friend's viewing on a chip: how long ago within the week, then the day and month, as the old app wrote it. */
function shortWhen(iso: string) {
  const at = new Date(iso);
  if (Date.now() - at.getTime() < 7 * 86_400_000) return agoLabel(iso);
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
