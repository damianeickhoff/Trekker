import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { fetchDiscover, parseDiscoverFilters } from "@/lib/catalogue";
import { expandProviders, getUserProviders } from "@/lib/providers";
import { getRequestMarks } from "@/lib/request-marks";
import { getWatchStatuses } from "@/lib/stats";
import { tmdbConfigured } from "@/lib/tmdb";
import { MediaCard } from "@/components/media-card";
import { DiscoverFilterBar } from "@/components/discover-filters";
import { EmptyState, SetupNotice } from "@/components/ui";

export const metadata = { title: "Browse · Trekker" };

type Search = Record<string, string | undefined>;

/**
 * Browsing with the query left open.
 *
 * Everything lives in `searchParams` rather than in client state: a set of
 * filters is then a link, which is the natural thing to want to keep or send to
 * someone, and paging is an ordinary anchor rather than something to reimplement.
 */
export default async function DiscoverFilterPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  if (!tmdbConfigured()) {
    return (
      <div className="rise">
        <SetupNotice />
      </div>
    );
  }

  const params = await searchParams;
  const page = Math.min(Math.max(Number(params.page) || 1, 1), 500);

  const user = await getCurrentUser();
  const subscribed = user ? await getUserProviders(user.id) : [];

  // The URL carries the word "mine" rather than a list of provider ids, so a
  // link shared with someone else filters by *their* subscriptions instead of
  // silently carrying the sender's around. Expanded here because TMDB lists one
  // service under several ids and a title comes back under any of them.
  const resolved =
    params.providers === "mine"
      ? { ...params, providers: [...expandProviders(subscribed)].join(",") }
      : params;

  const filters = parseDiscoverFilters(resolved);

  const [results, statuses, requests] = await Promise.all([
    fetchDiscover(filters, page).catch(() => null),
    user ? getWatchStatuses(user.id) : Promise.resolve(undefined),
    // The category and genre grids do not mark requests; this one does, since
    // it is the page most likely to turn up something you have not got.
    user ? getRequestMarks() : Promise.resolve(undefined),
  ]);

  const href = (next: Record<string, string>) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) query.set(key, value);
    }
    for (const [key, value] of Object.entries(next)) {
      if (value) query.set(key, value);
      else query.delete(key);
    }
    return `/discover/filter?${query.toString()}`;
  };

  return (
    <div className="rise">
      <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
        Discover
      </p>
      <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">Browse</h1>
      <p className="mt-1.5 text-sm text-ink-400">
        {results
          ? `${results.totalResults.toLocaleString("en-GB")} ${
              filters.kind === "tv" ? "shows" : "films"
            } match.`
          : "Narrow it down however you like."}
      </p>

      <div className="mt-5">
        <DiscoverFilterBar filters={filters} hasProviders={subscribed.length > 0} />
      </div>

      {!results || results.items.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing matches"
            body="Nothing came back for that combination. Try widening the years, or dropping the score."
          />
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {results.items.map((item) => (
              <MediaCard
                key={`${item.mediaType}-${item.id}`}
                item={item}
                status={statuses?.get(`${item.mediaType}-${item.id}`)}
                request={requests?.get(`${item.mediaType}-${item.id}`)}
              />
            ))}
          </div>

          <nav className="mt-8 flex items-center justify-between gap-3">
            {page > 1 ? (
              <Link
                href={href({ page: String(page - 1) })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-600/70 bg-ink-900/70 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
              >
                <ChevronLeft size={16} />
                Previous
              </Link>
            ) : (
              <span />
            )}

            <span className="text-xs text-ink-500">
              Page {page} of {results.totalPages}
            </span>

            {page < results.totalPages ? (
              <Link
                href={href({ page: String(page + 1) })}
                className="inline-flex items-center gap-1.5 rounded-xl border border-ink-600/70 bg-ink-900/70 px-4 py-2.5 text-sm font-medium text-ink-100 transition hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
              >
                Next
                <ChevronRight size={16} />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </div>
  );
}
