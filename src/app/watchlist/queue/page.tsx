import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Dices } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getRequestMarks } from "@/lib/request-marks";
import { getWatchlist } from "@/lib/watchlist";
import { WatchlistGrid } from "@/components/watchlist-grid";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Watchlist — Trekker" };

/**
 * The watchlist in full.
 *
 * What `/watchlist` used to be, moved down one level now that the top of the
 * section belongs to all the lists at once. It keeps its own grid, with the
 * sorting and the streaming filter, because it is the one list people work
 * through rather than merely look at — and none of that is worth carrying over
 * to a list of twelve favourites.
 */
export default async function WatchlistQueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, requests] = await Promise.all([getWatchlist(user.id), getRequestMarks()]);

  return (
    <div className="rise">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={15} />
        All lists
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Watchlist</h1>
          <p className="mt-1 text-sm text-ink-400">
            {items.length === 0
              ? "Things you mean to get round to."
              : `${items.length} title${items.length === 1 ? "" : "s"} waiting for you.`}
          </p>
        </div>

        {items.length > 0 && (
          <Link
            href="/tonight"
            className="inline-flex items-center gap-2 rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
          >
            <Dices size={16} />
            Pick for me
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Your watchlist is empty"
            body="Hit Save on any film or show, pick the watchlist, and it will turn up here."
            href="/discover"
            cta="Find something"
          />
        </div>
      ) : (
        <WatchlistGrid
          items={items.map((item) => ({
            ...item,
            // Dates do not survive the boundary as Date objects.
            addedAt: item.addedAt.toISOString(),
            request: requests.get(`${item.mediaType}-${item.tmdbId}`),
          }))}
        />
      )}
    </div>
  );
}
