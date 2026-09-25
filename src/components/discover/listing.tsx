import type { ReactNode } from "react";
import { db } from "@/lib/db";
import {
  CATEGORIES,
  fetchForYou,
  fetchGenre,
  GRID_PAGE,
  seenAmong,
  tryCategoryGrid,
  withType,
  type CategorySlug,
  type DiscoverType,
} from "@/lib/discover";
import { findGenre } from "@/lib/genres";
import { marksFor } from "@/lib/home";
import { titleKey } from "@/lib/marks";
import { regionFor } from "@/lib/providers";
import { requireUser } from "@/lib/title";
import type { ListItem } from "@/lib/tmdb";
import { Back } from "../back-button";
import { Link } from "../link";
import { BackHeader } from "../page";
import { CategoryChips, EmptyNote, GRID_POSTER_SIZES, Pager, POSTER_GRID, TypeChips } from "./parts";
import { GridTile } from "./tiles";

/*
 * A category's page and a genre's page: the way back to Discover, the name
 * and what it lists, on a category's page the row of categories, the filter
 * where it means something, and one page of posters with their ticks and
 * marks: `GRID_PAGE` of them, from the TMDB pages they span, through the
 * cache; the next page is a link, not an endless scroll.
 */

function Screen({
  type,
  title,
  meta,
  category,
  controls,
  items,
  seen,
  marks,
  empty,
  pager,
}: {
  type: DiscoverType;
  title: string;
  meta: string;
  /** On a category's page, which one: the row of categories stands under the title. */
  category?: string;
  controls?: ReactNode;
  items: ListItem[];
  seen: Set<string>;
  marks: Record<string, "plex" | "requested" | null>;
  empty: ReactNode;
  pager: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href={withType("/discover", type)} name="Discover" />}
        title={title}
        meta={<span className="mono-label">{meta}</span>}
      />
      {category && <CategoryChips type={type} current={category} />}
      {controls}
      {items.length ? (
        <div role="list" aria-label={title} className={POSTER_GRID}>
          {items.map((item) => {
            const key = titleKey(item.mediaType, item.id);
            return <GridTile key={key} item={item} mark={marks[key] ?? null} seen={seen.has(key)} sizes={GRID_POSTER_SIZES} />;
          })}
        </div>
      ) : (
        empty
      )}
      {pager}
    </div>
  );
}

async function decorate(userId: string, items: ListItem[]) {
  return Promise.all([seenAmong(userId, items), marksFor(items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id })))]);
}

const unreachable = (
  <EmptyNote title="This page could not be loaded">
    TMDB did not answer and nothing is stored here for it yet. Try again in a minute.
  </EmptyNote>
);

export async function CategoryScreen({ slug, type, page }: { slug: CategorySlug; type: DiscoverType; page: number }) {
  const user = await requireUser();
  const me = await db.user.findUnique({ where: { id: user.id }, select: { region: true } });
  const category = CATEGORIES[slug];
  // Only Trending follows the filter; the rest are one medium each.
  const shown: DiscoverType = category.medium ? "all" : type;
  const ctx = { type: shown, region: regionFor(me?.region), today: new Date().toISOString().slice(0, 10) };
  const result = await tryCategoryGrid(slug, ctx, page);
  const items = result?.items ?? [];
  const [seen, marks] = await decorate(user.id, items);
  const base = `/discover/${slug}`;

  // The filter rides along even where the list ignores it, for the row of
  // categories and the way back.
  return (
    <Screen
      type={type}
      title={category.title}
      meta={category.blurb}
      category={slug}
      controls={category.medium ? null : <TypeChips base={base} current={type} />}
      items={items}
      seen={seen}
      marks={marks}
      empty={result ? <EmptyNote title="Nothing here">TMDB has nothing on this page.</EmptyNote> : unreachable}
      pager={result && <Pager base={base} type={type} page={result.page} totalPages={result.totalPages} />}
    />
  );
}

export async function GenreScreen({ slug, type, page }: { slug: string; type: DiscoverType; page: number }) {
  const user = await requireUser();
  const genre = findGenre(slug)!;
  const result = await fetchGenre(slug, type, page, new Date().toISOString().slice(0, 10));
  const items = result?.items ?? [];
  const [seen, marks] = await decorate(user.id, items);
  const noTv = genre.tvId === null;
  const base = `/discover/genre/${slug}`;
  const what = type === "tv" ? "Shows" : type === "movie" || noTv ? "Films" : "Films and shows";

  return (
    <Screen
      type={type}
      title={genre.label}
      meta={result && page > 1 ? `${what} · page ${page}` : what}
      controls={
        <div className="flex flex-col gap-3">
          <TypeChips base={base} current={type} disabled={noTv ? "tv" : undefined} />
          {noTv && (
            <p className="m-0 text-[13px] leading-[1.45] text-ink-2">
              {genre.label} has no television equivalent on TMDB, so this page lists films only.
            </p>
          )}
        </div>
      }
      items={items}
      seen={seen}
      marks={marks}
      empty={
        result === null ? (
          unreachable
        ) : (
          <EmptyNote title="Nothing here">
            {noTv && type === "tv" ? (
              <>
                There are no {genre.label.toLowerCase()} shows to list.{" "}
                <Link href={withType(base, "movie")} className="font-semibold text-ink underline">
                  See the films
                </Link>
                .
              </>
            ) : (
              "TMDB has nothing on this page."
            )}
          </EmptyNote>
        )
      }
      pager={result && <Pager base={base} type={type} page={page} totalPages={result.totalPages} />}
    />
  );
}

/**
 * "Things you may like" in full: every recommendation the last five titles
 * watched brought back, `GRID_PAGE` to a page. The list is built whole (five
 * cached answers), so its pages are slices of it rather than TMDB pages.
 */
export async function ForYouScreen({ type, page }: { type: DiscoverType; page: number }) {
  const user = await requireUser();
  const all = await fetchForYou(user.id, type);
  const totalPages = Math.max(1, Math.ceil((all?.length ?? 0) / GRID_PAGE));
  const shown = Math.min(page, totalPages);
  const items = (all ?? []).slice((shown - 1) * GRID_PAGE, shown * GRID_PAGE);
  const [seen, marks] = await decorate(user.id, items);
  const base = "/discover/for-you";

  return (
    <Screen
      type={type}
      title="Things you may like"
      meta="From the last five titles you watched"
      category="for-you"
      controls={<TypeChips base={base} current={type} />}
      items={items}
      seen={seen}
      marks={marks}
      empty={
        all === null ? (
          unreachable
        ) : (
          <EmptyNote title="Nothing to go on yet">
            Recommendations come from what you watch. Mark something watched and this fills up.
          </EmptyNote>
        )
      }
      pager={<Pager base={base} type={type} page={shown} totalPages={totalPages} />}
    />
  );
}
