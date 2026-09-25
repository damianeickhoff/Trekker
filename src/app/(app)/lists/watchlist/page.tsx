import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { SortChips } from "@/components/lists/sort-chips";
import { EmptyBlock } from "@/components/lists/tiles";
import { TitleGrid } from "@/components/lists/title-grid";
import { Back } from "@/components/back-button";
import { BackHeader } from "@/components/page";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { parseWatchlistSort, WATCHLIST_SORTS } from "@/lib/list-sorts";
import { plural, watchlistRows, withMarks } from "@/lib/lists";

export const metadata: Metadata = { title: "Watchlist" };

/**
 * The watchlist in full: every row in one of five orders, with the cross that
 * takes a title off on hover, or after a long press on a phone.
 */
export default async function WatchlistPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sort = parseWatchlistSort((await searchParams).sort);
  const { rows, streamingCount } = await watchlistRows(user.id, sort);
  const items = await withMarks(rows);
  const meta = [plural(rows.length, "title"), streamingCount ? `${streamingCount} streaming now` : null].filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href="/lists" name="Lists" />}
        title="Watchlist"
        meta={<span className="mono-label">{meta}</span>}
      />
      {items.length === 0 ? (
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
      ) : (
        <>
          <SortChips base="/lists/watchlist" sorts={WATCHLIST_SORTS} current={sort} />
          <TitleGrid items={items} label="Watchlist" remove={{ mode: "hover", target: { kind: "watchlist" } }} />
        </>
      )}
    </div>
  );
}
