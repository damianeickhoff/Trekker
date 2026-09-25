import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { SEGMENT_CHIP_PILL, segmentChip } from "@/components/motion";
import { ChannelButtons, channelHref } from "@/components/news/channels";
import { ChipMemory } from "@/components/news/chip-memory";
import { FeedFold } from "@/components/news/feed-fold";
import { MarkAllNews } from "@/components/news/mark-all";
import { Arrival, Arrivals, NewsMeta, NewsRefresh, RefreshButton } from "@/components/news/news-refresh";
import { LeadCarousel } from "@/components/news/lead-carousel";
import { BigPressCard, SmallPressCard, type Relation } from "@/components/news/press-cards";
import { TrailerRail } from "@/components/news/trailer-rail";
import { YourCompactRow, YourRailCard, YourSmallCard } from "@/components/news/your-cards";
import { PageBody } from "@/components/page";
import { Rail } from "@/components/rail";
import { SectionHead } from "@/components/section-head";
import { SegmentPill } from "@/components/segment-pill";
import { buttonClass, iconButtonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { dateParts, longDate, todayKey } from "@/lib/dates";
import { newsFor } from "@/lib/news";
import {
  CHIPS,
  artKey,
  channelsFrom,
  chipFrom,
  chipLabel,
  arrangeFeed,
  chooseLeads,
  entriesFor,
  isAbout,
  openingChip,
  pressFor,
  pressForReader,
  relationsFor,
  subjectFrom,
  titleArt,
  trailersFrom,
  TRAILER_DAYS,
  type Chip,
  type Entry,
} from "@/lib/news-page";
import { newsPrefs, visibleFeeds } from "@/lib/news-settings";
import { nothingUnder } from "@/lib/news-words";
import { feedList } from "@/lib/press";
import { newsReadAt } from "@/lib/refresh";
import { agoLabel, shortAgo } from "@/lib/when";

export const metadata: Metadata = { title: "News" };

const DAY_MS = 24 * 60 * 60 * 1000;

/** "Thu 24 Sep": the phone's meta line, where the long date does not fit beside the count. */
function shortDate(date: string) {
  const p = dateParts(date);
  return `${p.weekday.slice(0, 3)} ${p.day} ${p.month.slice(0, 3)}`;
}
/** The desktop column's For you card: the newest five. */
const FOR_YOU_ROWS = 5;

/**
 * News as a news app (Round 10, the Pick boards). One page, read from rows
 * only; after it has painted, `NewsRefresh` asks the server to read the
 * feeds and look at followed people if they are due, and draws it again.
 *
 * - **Chips** replace Round 9's two tabs, each an address (`?tab=`, with
 *   `for-you` and `popular` still landing): For you is what you follow (T2);
 *   Top every headline; the rest your own news of their kind and the
 *   headlines classified so (`lib/news-page.ts`). Without one it opens as
 *   Settings › News says: For you (or Top when For you is empty), Top, or the
 *   chip last used in this browser.
 * - **The lead stories**: a carousel of the three newest headlines under the
 *   chip with a picture, those naming a title first (`chooseLeads`,
 *   `LeadCarousel`); they are not repeated below. New trailers follow it.
 * - **The feed**: one pair of big cards at the top, the first two headlines
 *   with a picture (`arrangeFeed`), and every other row small, your own
 *   news with the amber chip.
 * - **Your channels** filter the page to one subject (`?subject=`).
 * - **New trailers** at the foot.
 *
 * Desktop draws the feed beside a 340px column (For you, Your channels);
 * phones stack the header, the channels, the chips, the lead, a For you
 * rail, the feed and the trailers. Headlines are only those from the
 * sources this person reads, within their reading window.
 */
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[]; subject?: string | string[] }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const asked = await searchParams;
  const now = new Date();
  const prefs = await newsPrefs(user.id);
  const [yours, allPress, feeds] = await Promise.all([newsFor(user.id), pressForReader(user.id, prefs.keepDays, now), visibleFeeds(user.id)]);

  const named = chipFrom(asked.tab);
  const chip = openingChip(named, prefs.openOn, yours.length, allPress.length);
  const subject = subjectFrom(asked.subject);

  // Under the chip and the subject: the lead's pool and the feed.
  const about = (e: Entry) => !subject || isAbout(e, subject);
  const pool = (chip === "for-you" ? allPress : pressFor(chip, allPress)).filter((row) => about({ type: "press", row }));
  const leads = chooseLeads(pool);
  const leadIds = new Set(leads.map((l) => l.id));
  const entries = entriesFor(chip, yours, allPress).filter((e) => about(e) && !leadIds.has(e.row.id));
  const hadLead = leads.length > 0;

  const unread = yours.filter((r) => !r.read).length;
  const channels = channelsFrom(yours, now);
  const channelsNew = channels.reduce((sum, c) => sum + c.unread, 0);
  const trailerSince = new Date(now.getTime() - TRAILER_DAYS * DAY_MS).toISOString();

  // Pictures and years for your rows' cards and the trailers, and "watching" for the headlines' titles:
  // the cache's rows and the account's, never TMDB.
  const matched = allPress.flatMap((p) => (p.match ? [p.match] : []));
  const drawn = [
    ...yours.filter((r) => r.subject !== "person").map((r) => ({ mediaType: r.mediaType, tmdbId: r.tmdbId })),
    ...allPress.filter((p) => p.tag === "trailer" && p.at >= trailerSince).flatMap((p) => (p.match ? [p.match] : [])),
    // A headline with no picture of its own shows the title it names instead.
    ...allPress.filter((p) => !p.imageUrl).flatMap((p) => (p.match ? [p.match] : [])),
  ];
  const [art, relations] = await Promise.all([titleArt(drawn), relationsFor(user.id, matched)]);
  const relation = (row: { match: { mediaType: "movie" | "tv"; tmdbId: number } | null }): Relation =>
    row.match ? (relations.get(artKey(row.match.mediaType, row.match.tmdbId)) ?? null) : null;
  const trailers = trailersFrom(yours, allPress, art, now);
  const pressArt = (row: { match: { mediaType: "movie" | "tv"; tmdbId: number } | null }) =>
    row.match ? art.get(artKey(row.match.mediaType, row.match.tmdbId)) : undefined;
  // The chosen channel's name, for "Nothing under Top for Silo yet."
  const subjectName = subject ? (channels.find((c) => c.subject.kind === subject.kind && c.subject.id === subject.id)?.name ?? null) : null;

  const today = todayKey(now);
  const readAt = newsReadAt();
  const updated = readAt ? `updated ${agoLabel(new Date(readAt).toISOString(), now)}` : null;
  const pressOff = feedList().length === 0 && feeds.length === 0;

  return (
    <NewsRefresh>
      <ChipMemory chip={chip} named={named !== null} openLast={prefs.openOn === "last"} />
      <PageBody className="lg:gap-6">
        <header className="flex min-h-[66px] items-center gap-3 pt-[22px] lg:min-h-0 lg:items-end lg:pt-0">
          <div className="flex min-w-0 grow items-center gap-3 lg:flex-col lg:items-start lg:gap-2">
            <Back href="/" name="Home" />
            <div className="flex min-w-0 flex-col gap-px lg:flex-row lg:items-baseline lg:gap-3.5">
              <h1 className="m-0 font-display text-[26px] font-extrabold leading-none tracking-[-0.035em] lg:text-[30px] lg:font-bold lg:leading-[1.05] lg:tracking-[-0.025em]">
                News
              </h1>
              <span className="lg:hidden">
                <NewsMeta date={shortDate(today)} rest={unread ? `${unread} unread` : null} />
              </span>
              <span className="hidden lg:inline">
                <NewsMeta date={longDate(today)} rest={updated} />
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {unread > 0 && (
              <span className="hidden lg:inline-flex">
                <MarkAllNews />
              </span>
            )}
            <RefreshButton />
            <Link href="/settings/news" aria-label="News settings" className={iconButtonClass("ghost", "sm", "max-lg:hidden")}>
              <Icon name="settings" size={20} />
            </Link>
          </div>
        </header>

        {channels.length > 0 && (
          <section aria-labelledby="channels-phone" className="-mt-2 flex flex-col gap-1.5 lg:hidden">
            <div className="flex items-baseline gap-2.5">
              <h2 id="channels-phone" className="m-0 font-display text-[19px] font-bold leading-[1.05] tracking-[-0.025em]">
                Your channels
              </h2>
              {channelsNew > 0 && <span className="mono-label text-[10px]">{channelsNew} new</span>}
            </div>
            <ChannelButtons channels={channels} chip={chip} chosen={subject} />
          </section>
        )}

        {/* Vertical padding inside the row, so the chips' shadows are not clipped by it; a phone swipes it. */}
        <nav aria-label="News" className="no-scrollbar relative -mx-5 -mb-2 -mt-3 flex gap-2 overflow-x-auto px-5 py-2 lg:mx-0 lg:-mt-2 lg:flex-wrap lg:overflow-visible lg:px-0">
          <SegmentPill className={SEGMENT_CHIP_PILL} />
          {CHIPS.map(({ id, label }) => (
            <Link
              key={id}
              href={channelHref(id, subject)}
              replace
              scroll={false}
              aria-current={chip === id ? "page" : undefined}
              data-segment=""
              data-on={chip === id ? "" : undefined}
              className={`${segmentChip} max-lg:h-8`}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-[22px] lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-col gap-[22px] lg:gap-5">
            {hadLead && <LeadCarousel slides={leads.map((row) => ({ row, relation: relation(row), age: shortAgo(row.at, now) }))} />}

            <TrailerRail cards={trailers} />

            {chip !== "for-you" && yours.length > 0 && (
              <section aria-labelledby="for-you-phone" className="flex flex-col gap-2 lg:hidden">
                <SectionHead id="for-you-phone" title="For you" meta={unread ? `${unread} unread` : undefined} href={channelHref("for-you", null)} />
                <Rail label="For you">
                  {yours.slice(0, 10).map((row) => (
                    <YourRailCard key={row.id} row={row} age={shortAgo(row.at, now)} markOnOpen={prefs.markOnOpen} />
                  ))}
                </Rail>
              </section>
            )}

            <section aria-labelledby="feed-head" className="flex min-w-0 flex-col gap-3 lg:gap-4">
              <div className="flex items-baseline gap-2.5 lg:hidden">
                <h2 id="feed-head" className="m-0 font-display text-[19px] font-bold leading-[1.05] tracking-[-0.025em]">
                  {chip === "top" ? "Top stories" : chipLabel(chip)}
                </h2>
                <span className="mono-label text-[10px]">
                  {chip === "for-you" ? (unread ? `${unread} unread` : "") : `${new Set(pool.map((p) => p.source)).size || "no"} sources`}
                </span>
                <span className="grow" />
                {chip === "for-you" && unread > 0 && <MarkAllNews />}
              </div>
              <Arrivals key={`${chip}:${subject ? `${subject.kind}:${subject.id}` : ""}`} ids={entries.map((e) => e.row.id)}>
                <Feed chip={chip} entries={entries} hadLead={hadLead} pressOff={pressOff} anyPress={allPress.length > 0} subjectName={subjectName}>
                  {arrangeFeed(entries).map(({ entry: e, big }) =>
                    e.type === "yours" ? (
                      <Arrival key={e.row.id} id={e.row.id} className="min-w-0">
                        <YourSmallCard
                          row={e.row}
                          art={art.get(artKey(e.row.mediaType, e.row.tmdbId))}
                          age={shortAgo(e.row.at, now)}
                          markOnOpen={prefs.markOnOpen}
                        />
                      </Arrival>
                    ) : (
                      <Arrival key={e.row.id} id={e.row.id} className="min-w-0">
                        {big ? (
                          <BigPressCard row={e.row} relation={relation(e.row)} age={shortAgo(e.row.at, now)} art={pressArt(e.row)} />
                        ) : (
                          <SmallPressCard row={e.row} age={shortAgo(e.row.at, now)} art={pressArt(e.row)} />
                        )}
                      </Arrival>
                    ),
                  )}
                </Feed>
              </Arrivals>
            </section>
          </div>

          <aside aria-label="What you follow" className="hidden flex-col gap-[18px] lg:flex">
            <section aria-labelledby="for-you-desk" className="flex flex-col gap-1 rounded-[18px] bg-surface px-[18px] pb-3.5 pt-4 shadow-elevation">
              <div className="flex items-baseline justify-between">
                <h2 id="for-you-desk" className="m-0 font-display text-lg font-bold leading-[1.05] tracking-[-0.025em]">
                  For you
                </h2>
                <span className="mono-label">{unread ? `${unread} unread` : yours.length ? "all read" : ""}</span>
              </div>
              {yours.length === 0 ? (
                <p className="m-0 py-2 text-[13px] leading-normal text-ink-2">
                  When a show you watch is renewed or dated, or someone you follow has new work, it lands here.
                </p>
              ) : (
                <div className="flex flex-col">
                  {yours.slice(0, FOR_YOU_ROWS).map((row) => (
                    <YourCompactRow key={row.id} row={row} age={shortAgo(row.at, now)} markOnOpen={prefs.markOnOpen} />
                  ))}
                </div>
              )}
              <Link href={channelHref("for-you", null)} replace scroll={false} className="pt-2 text-[13px] font-semibold text-accent-text hover:underline">
                Everything you follow ›
              </Link>
            </section>

            <section aria-labelledby="channels-desk" className="flex flex-col gap-1 rounded-[18px] bg-surface px-[18px] pb-3.5 pt-4 shadow-elevation">
              <div className="flex items-baseline justify-between">
                <h2 id="channels-desk" className="m-0 font-display text-lg font-bold leading-[1.05] tracking-[-0.025em]">
                  Your channels
                </h2>
                {channelsNew > 0 && <span className="mono-label">{channelsNew} new</span>}
              </div>
              {channels.length > 0 ? (
                <>
                  <span className="text-xs text-ink-3">Tap one to read only its news.</span>
                  <ChannelButtons channels={channels} chip={chip} chosen={subject} wrap />
                </>
              ) : (
                <span className="py-1 text-xs text-ink-3">Follow someone, or watch or save a show, and each gets a button here.</span>
              )}
              <div className="flex items-center gap-3.5 pt-2">
                <Link href={channelHref("for-you", null)} replace scroll={false} className="text-[13px] font-semibold text-accent-text hover:underline">
                  Everything you follow ›
                </Link>
                <span className="grow" />
                <Link href="/settings/news" className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-3 hover:text-ink">
                  <Icon name="settings" size={14} />
                  Sources and push
                </Link>
              </div>
            </section>
          </aside>
        </div>

      </PageBody>
    </NewsRefresh>
  );
}

/**
 * The feed's grid, one column on phones and two once the column is wide
 * enough (a container query, since the desktop's column is what is left
 * beside the 340px one). Empty, it says why: For you's own empty state, Top's
 * when no feeds are read, or a line naming the chip.
 */
function Feed({
  chip,
  entries,
  hadLead,
  pressOff,
  anyPress,
  subjectName,
  children,
}: {
  chip: Chip;
  entries: Entry[];
  hadLead: boolean;
  pressOff: boolean;
  anyPress: boolean;
  /** The channel chosen, if any. */
  subjectName: string | null;
  children: ReactNode;
}) {
  if (entries.length > 0) {
    return (
      <div className="@container flex flex-col gap-4">
        <FeedFold className="grid grid-cols-1 items-start gap-3 @min-[640px]:grid-cols-2 @min-[640px]:gap-4">{children}</FeedFold>
      </div>
    );
  }
  if (chip === "for-you") {
    return (
      <EmptyState
        icon="clapperboard"
        title="No news yet"
        action={
          <Link href="/discover" className={buttonClass("ghost", "sm")}>
            <Icon name="compass" size={18} />
            Find something to follow
          </Link>
        }
      >
        When a show you watch is renewed or gets a date, a saved film moves or gets a trailer, or someone you follow has new work, it lands here.
      </EmptyState>
    );
  }
  if (chip === "top" && !anyPress && !hadLead) {
    return (
      <EmptyState icon="clapperboard" title={pressOff ? "Popular news is off" : "No headlines yet"}>
        {pressOff
          ? "This instance reads no news feeds. Its admin can set them with NEWS_FEEDS."
          : "Headlines from entertainment sites arrive with the nightly refresh, and shortly after the server starts."}
      </EmptyState>
    );
  }
  return <p className="m-0 py-2 text-sm text-ink-3">{nothingUnder(chipLabel(chip), subjectName, hadLead)}</p>;
}
