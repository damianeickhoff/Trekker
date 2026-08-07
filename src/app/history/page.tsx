import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { countPlays, getHistoryPage } from "@/lib/profile";
import { BackButton } from "@/components/back-button";
import { HistoryFeed } from "@/components/history-feed";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Watch history — Trekker" };

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [first, total] = await Promise.all([
    getHistoryPage(user.id, 1),
    countPlays(user.id),
  ]);

  return (
    <>
      {/* Outside `rise`, so the glass on it can see the whole page — the
          animation makes that wrapper a backdrop root. */}
      <BackButton fallback="/profile" />

      <div className="rise">
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Watch history</h1>
      <p className="mt-1 text-sm text-ink-400">
        {total > 0
          ? `Every one of your ${total.toLocaleString("en-GB")} viewings, newest first.`
          : "Nothing logged yet."}
      </p>

      <div className="mt-6">
        {total === 0 ? (
          <EmptyState
            title="Nothing here yet"
            body="Mark something watched and it will start showing up, one day at a time."
            href="/discover"
            cta="Find something"
          />
        ) : (
          <HistoryFeed initialDays={first.days} initialMore={first.more} />
        )}
      </div>
      </div>
    </>
  );
}
