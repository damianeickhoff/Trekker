import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SortChips } from "@/components/lists/sort-chips";
import { EmptyBlock } from "@/components/lists/tiles";
import { TitleGrid } from "@/components/lists/title-grid";
import { Back } from "@/components/back-button";
import { BackHeader } from "@/components/page";
import { getCurrentUser } from "@/lib/auth";
import { FAVOURITE_SORTS, parseFavouriteSort } from "@/lib/list-sorts";
import { favouriteRows, plural, withMarks } from "@/lib/lists";

export const metadata: Metadata = { title: "Favourites" };

/**
 * Favourites in full. No cross: a favourite is taken back with the heart on
 * its title page, the same single press that gave it.
 */
export default async function FavouritesPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const sort = parseFavouriteSort((await searchParams).sort);
  const items = await withMarks(await favouriteRows(user.id, sort));

  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href="/lists" name="Lists" />}
        title="Favourites"
        meta={<span className="mono-label">{plural(items.length, "title")}</span>}
      />
      {items.length === 0 ? (
        <EmptyBlock icon="heart" title="No favourites yet">
          The heart sits beside the trailer on every title page. One press, no list to choose.
        </EmptyBlock>
      ) : (
        <>
          <SortChips base="/lists/favourites" sorts={FAVOURITE_SORTS} current={sort} />
          <TitleGrid items={items} label="Favourites" />
        </>
      )}
    </div>
  );
}
