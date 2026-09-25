
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyBlock, ListTile } from "@/components/lists/tiles";
import { PosterCard } from "@/components/poster-card";
import { NewListButton, NewMenu } from "@/components/lists/new-list";
import { SortMenu } from "@/components/lists/sort-menu";
import { Link } from "@/components/link";
import { MobileTop, PageBody, PhoneAccount } from "@/components/page";
import { Rail } from "@/components/rail";
import { SectionHead } from "@/components/section-head";
import { buttonClass, IconLink, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icon";
import { getCurrentUser } from "@/lib/auth";
import { parseWatchlistSort, sortHref, sortLabel, WATCHLIST_SORTS } from "@/lib/list-sorts";
import { favouriteRows, listCards, plural, RAIL_SIZE, watchlistRows, withMarks, type ListCard } from "@/lib/lists";

export const metadata: Metadata = { title: "Lists" };

/**
 * The lists section in four rows, every one of them read from rows: the
 * watchlist, the lists you made and the smart lists (tiles, one per list,
 * side by side on desktop), and favourites last, as the owner ordered them.
 * The watchlist and favourites are rails of the standard poster card. Smart lists never rebuild here; the
 * daily job keeps them. The watchlist's order is in the address (`?sort=`).
 */
export default async function ListsPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sort = parseWatchlistSort((await searchParams).sort);

  const [watchlist, favourites, cards] = await Promise.all([
    watchlistRows(user.id, sort),
    favouriteRows(user.id, "added"),
    listCards(user.id),
  ]);
  const [watchRail, faveRail] = await Promise.all([
    withMarks(watchlist.rows.slice(0, RAIL_SIZE)),
    withMarks(favourites.slice(0, RAIL_SIZE)),
  ]);
  const manual = cards.filter((c) => c.kind === "manual");
  const smart = cards.filter((c) => c.kind === "smart");

  const watchMeta = watchlist.rows.length
    ? [plural(watchlist.rows.length, "title"), watchlist.streamingCount ? `${watchlist.streamingCount} streaming now` : null]
        .filter(Boolean)
        .join(" · ")
    : "empty";

  const watchSection = (
    <section aria-labelledby="watchlist-head" className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
      <RowHead
        id="watchlist-head"
        title="Watchlist"
        meta={watchMeta}
        href={watchlist.rows.length ? "/lists/watchlist" : undefined}
        sort={
          watchlist.rows.length > 1 ? (
            <SortMenu
              current={sortLabel(WATCHLIST_SORTS, sort)}
              options={WATCHLIST_SORTS.map(([s, label]) => ({ href: sortHref("/lists", WATCHLIST_SORTS, s), label, on: s === sort }))}
            />
          ) : null
        }
      />
      {watchRail.length ? (
        <Rail label="Watchlist" cards>
          {watchRail.map((item) => (
            <PosterCard key={`${item.mediaType}-${item.tmdbId}`} item={item} mark={item.mark} />
          ))}
        </Rail>
      ) : (
        <EmptyBlock
          icon="bookmark"
          title="Nothing on your watchlist"
          action={
            <Link href="/discover" className={buttonClass("primary", "sm")}>
              <Icon name="compass" size={18} />
              Browse Discover
            </Link>
          }
        >
          Press Save on any title page. Films come off when you watch them; shows once you are caught up and they have ended.
        </EmptyBlock>
      )}
    </section>
  );

  const faveSection = (
    <section aria-labelledby="favourites-head" className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
      <RowHead
        id="favourites-head"
        title="Favourites"
        meta={favourites.length ? plural(favourites.length, "title") : "empty"}
        href={favourites.length ? "/lists/favourites" : undefined}
      />
      {faveRail.length ? (
        <Rail label="Favourites" cards>
          {faveRail.map((item) => (
            <PosterCard key={`${item.mediaType}-${item.tmdbId}`} item={item} mark={item.mark} />
          ))}
        </Rail>
      ) : (
        <EmptyBlock icon="heart" title="No favourites yet">
          The heart sits beside the trailer on every title page. One press, no list to choose.
        </EmptyBlock>
      )}
    </section>
  );

  return (
    <>
      <MobileTop
        title="Lists"
        right={
          <>
            <IconLink href="/search" icon="search" label="Search" />
            <NewMenu />
            <PhoneAccount />
          </>
        }
      />
      <PageBody className="lg:gap-[26px]">
        <div className="hidden items-center gap-4 lg:flex">
          <PageTitle>Lists</PageTitle>
          <span className="grow" />
          <Link href="/lists/new" className={buttonClass("ghost", "sm")}>
            <Icon name="sparkle" size={18} />
            New smart list
          </Link>
          <NewListButton variant="primary" />
        </div>

        {watchSection}

        <div className="grid gap-6 lg:grid-cols-2 lg:gap-10">
          <section aria-labelledby="mine-head" className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
            <RowHead id="mine-head" title="My lists" meta={manual.length ? plural(manual.length, "list") : "none"} />
            {manual.length ? (
              <Rail label="My lists">
                {manual.map((card) => (
                  <Tile key={card.id} card={card} />
                ))}
                <span className="contents lg:hidden">
                  <NewListButton variant="tile" />
                </span>
              </Rail>
            ) : (
              <EmptyBlock icon="list" title="Make your first list" action={<NewListButton variant="ghost" />}>
                Lists are made here and nowhere else, so you can see what you already have before adding another.
              </EmptyBlock>
            )}
          </section>

          <section aria-labelledby="smart-head" className="flex min-w-0 flex-col gap-3 lg:gap-3.5">
            <RowHead
              id="smart-head"
              title="Smart lists"
              meta={smart.length ? `${plural(smart.length, "list")} · rebuilt daily` : "none"}
            />
            {smart.length ? (
              <Rail label="Smart lists">
                {smart.map((card) => (
                  <Tile key={card.id} card={card} />
                ))}
              </Rail>
            ) : (
              <EmptyBlock
                icon="sparkle"
                title="A list that fills itself"
                action={
                  <Link href="/lists/new" className={buttonClass("ghost", "md")}>
                    <Icon name="sparkle" size={18} />
                    New smart list
                  </Link>
                }
              >
                Pick a genre, a service, a score and a decade. It rebuilds every day.
              </EmptyBlock>
            )}
          </section>
        </div>
        {faveSection}
      </PageBody>
    </>
  );
}

function Tile({ card }: { card: ListCard }) {
  return (
    <ListTile
      card={card}
      className="w-[150px] lg:w-[164px]"
      cellClass="h-[63px] lg:h-[69px]"
      sizes="(min-width: 64rem) 82px, 75px"
    />
  );
}

/**
 * A row's head: the section title and its count, the desktop's sort where
 * there is one, and the chevron to the row in full.
 */
function RowHead({ id, title, meta, href, sort }: { id: string; title: string; meta: string; href?: string; sort?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      <div className="min-w-0 grow">
        <SectionHead id={id} title={title} meta={meta} />
      </div>
      {sort && <div className="hidden lg:flex">{sort}</div>}
      {href && (
        <Link href={href} aria-label={`See all ${title}`} className="inline-flex self-center text-ink-3 transition-[translate,color] duration-(--fast) ease-out hover:translate-x-0.5 hover:text-ink">
          <Icon name="chevR" size={18} />
        </Link>
      )}
    </div>
  );
}
