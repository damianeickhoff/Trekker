import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Heart } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { getFavourites } from "@/lib/lists";
import { getRequestMarks } from "@/lib/request-marks";
import { ListGrid } from "@/components/list-grid";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Favourites — Trekker" };

export default async function FavouritesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [items, requests] = await Promise.all([getFavourites(user.id), getRequestMarks()]);

  return (
    <div className="rise">
      <Link
        href="/watchlist"
        className="inline-flex items-center gap-1.5 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ArrowLeft size={15} />
        All lists
      </Link>

      <h1 className="mt-3 flex items-center gap-2.5 text-2xl font-semibold tracking-tight sm:text-3xl">
        <Heart size={24} className="text-rose-400" fill="currentColor" />
        Favourites
      </h1>
      <p className="mt-1 text-sm text-ink-400">
        {items.length === 0
          ? "Everything you have hearted turns up here."
          : `${items.length} title${items.length === 1 ? "" : "s"} you love.`}
      </p>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Nothing hearted yet"
            body="The heart sits next to Save on every film and show. Press it and it lands here."
            href="/discover"
            cta="Find something"
          />
        </div>
      ) : (
        <ListGrid items={items} requests={Object.fromEntries(requests)} />
      )}
    </div>
  );
}
