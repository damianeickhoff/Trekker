import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { BackHeader } from "@/components/page";
import { RatingCard } from "@/components/profile/parts";
import { getCurrentUser } from "@/lib/auth";
import { formatNumber } from "@/lib/levels";
import { recentRatings } from "@/lib/profile";

export const metadata: Metadata = { title: "Ratings and reviews" };

/**
 * Everything you have rated, newest first, where the profile's rail leads:
 * the same cards in a grid, as many columns as fit at the rail's width.
 */
export default async function RatingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { count, rows } = await recentRatings(user.id, null);
  const reviews = rows.filter((r) => r.review).length;

  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href="/profile" name="Profile" />}
        title="Ratings and reviews"
        meta={
          <span className="mono-label">
            {formatNumber(count)} rated · {formatNumber(reviews)} {reviews === 1 ? "review" : "reviews"}
          </span>
        }
      />
      {rows.length === 0 ? (
        <EmptyState icon="star" title="Nothing rated yet">
          The popcorn is on every title page.
        </EmptyState>
      ) : (
        <div
          role="list"
          className="grid grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-x-2.5 gap-y-5 lg:grid-cols-[repeat(auto-fill,minmax(126px,1fr))] lg:gap-x-3"
        >
          {rows.map((r) => (
            <RatingCard key={`${r.mediaType}-${r.tmdbId}`} row={r} fill />
          ))}
        </div>
      )}
    </div>
  );
}
