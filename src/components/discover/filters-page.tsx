import { db } from "@/lib/db";
import { fetchFiltered, parsePage, seenAmong } from "@/lib/discover";
import { filterHref, readFilterQuery } from "@/lib/discover-filters";
import { marksFor } from "@/lib/home";
import { titleKey } from "@/lib/marks";
import { regionFor } from "@/lib/providers";
import { requireUser } from "@/lib/title";
import { tmdbConfigured } from "@/lib/tmdb";
import { Back } from "../back-button";
import { BackHeader } from "../page";
import { FilterPanel } from "./filter-panel";
import { EmptyNote, GRID_POSTER_SIZES, Pager, POSTER_GRID } from "./parts";
import { GridTile } from "./tiles";

/*
 * `/discover/filters`: genre, services, score, years, length and the two
 * leave-outs, the smart list editor's controls asking the smart list
 * builder's question, with a page of the answer under them. The question is
 * the address; a page is `GRID_PAGE` titles from the TMDB pages they span,
 * through the cache.
 */

type Search = Record<string, string | string[] | undefined>;

export async function FiltersScreen({ search }: { search: Search }) {
  const user = await requireUser();
  const state = readFilterQuery(search);
  const page = parsePage(search.page);

  return (
    <div className="flex flex-col gap-5 px-5 pb-10 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader back={<Back href="/discover" name="Discover" />} title="Filters" />
      <FilterPanel initial={state}>
        <Results userId={user.id} search={search} page={page} />
      </FilterPanel>
    </div>
  );
}

async function Results({ userId, search, page }: { userId: string; search: Search; page: number }) {
  if (!tmdbConfigured()) {
    return (
      <EmptyNote title="TMDB is not set up">
        Filters ask TMDB. Add <code>TMDB_API_KEY</code> to the server&apos;s environment and restart it.
      </EmptyNote>
    );
  }
  const state = readFilterQuery(search);
  const me = await db.user.findUnique({ where: { id: userId }, select: { region: true } });
  const result = await fetchFiltered(state, page, {
    userId,
    region: regionFor(me?.region),
    today: new Date().toISOString().slice(0, 10),
  });
  if (!result) {
    return (
      <EmptyNote title="This page could not be loaded">
        TMDB did not answer and nothing is stored here for it yet. Try again in a minute.
      </EmptyNote>
    );
  }

  const [seen, marks] = await Promise.all([
    seenAmong(userId, result.items),
    marksFor(result.items.map((i) => ({ mediaType: i.mediaType, tmdbId: i.id }))),
  ]);
  const count = result.total.toLocaleString("en-GB");

  return (
    <section aria-labelledby="results" className="flex flex-col gap-3 pt-2 lg:gap-4">
      <div className="flex items-baseline gap-3">
        <h2 id="results" className="m-0 font-display text-xl font-bold leading-[1.05] tracking-[-0.025em] lg:text-[22px]">
          Results
        </h2>
        <span className="mono-label">
          {result.total === 1 ? "1 title" : `${count} titles`}
          {result.totalPages > 1 ? ` · page ${result.page} of ${result.totalPages}` : ""}
        </span>
      </div>
      {result.items.length ? (
        <div role="list" aria-label="Results" className={POSTER_GRID}>
          {result.items.map((item) => {
            const key = titleKey(item.mediaType, item.id);
            return <GridTile key={key} item={item} mark={marks[key] ?? null} seen={seen.has(key)} sizes={GRID_POSTER_SIZES} />;
          })}
        </div>
      ) : (
        <EmptyNote title="Nothing matches">
          {result.total > 0
            ? "Everything on this page was left out. Try the next page, or let the leave-outs go."
            : "Loosen a filter or two."}
        </EmptyNote>
      )}
      <Pager page={result.page} totalPages={result.totalPages} hrefFor={(p) => filterHref(state, p)} />
    </section>
  );
}
