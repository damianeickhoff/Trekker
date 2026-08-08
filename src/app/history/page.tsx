import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { countPlays, getHistoryPage, type HistoryFilter } from "@/lib/profile";
import { BackButton } from "@/components/back-button";
import { HistoryFeed } from "@/components/history-feed";
import { HistoryFilters } from "@/components/history-filters";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Watch history — Trekker" };

/** Only the values the filter understands; anything else is no filter at all. */
function readFilter(params: Record<string, string | string[] | undefined>): HistoryFilter {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" ? value : null;
  };

  const type = one("type");
  const source = one("source");

  return {
    q: one("q"),
    mediaType: type === "movie" || type === "tv" ? type : null,
    source: source && ["manual", "plex", "trakt", "backfill"].includes(source) ? source : null,
  };
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Read from the URL rather than held in client state, so a filtered view is a
  // link, survives a reload, and steps properly under the back button.
  const filter = readFilter(await searchParams);
  const narrowed = Boolean(filter.q || filter.mediaType || filter.source);

  const [first, matching, total] = await Promise.all([
    getHistoryPage(user.id, 1, filter),
    countPlays(user.id, filter),
    // The unfiltered total as well, so the heading can still say how much there
    // is when the filter has cut it down to eleven rows.
    narrowed ? countPlays(user.id) : Promise.resolve(0),
  ]);

  const everything = narrowed ? total : matching;

  return (
    <>
      {/* Outside `rise`, so the glass on it can see the whole page — the
          animation makes that wrapper a backdrop root. */}
      <BackButton fallback="/profile" />

      <div className="rise">
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Watch history</h1>
        <p className="mt-1 text-sm text-ink-400">
          {everything > 0
            ? `Every one of your ${everything.toLocaleString("en-GB")} viewings, newest first.`
            : "Nothing logged yet."}
        </p>

        {everything > 0 && <HistoryFilters total={matching} />}

        <div className="mt-6">
          {everything === 0 ? (
            <EmptyState
              title="Nothing here yet"
              body="Mark something watched and it will start showing up, one day at a time."
              href="/discover"
              cta="Find something"
            />
          ) : matching === 0 ? (
            <div className="card px-6 py-12 text-center text-sm text-ink-400">
              Nothing in your history matches that.
            </div>
          ) : (
            <HistoryFeed
              /**
               * Keyed on the filter so changing it remounts the feed. Its list
               * of days and its page number are internal state; without this,
               * page two of the new filter would be appended to page one of the
               * old one.
               */
              key={`${filter.q ?? ""}|${filter.mediaType ?? ""}|${filter.source ?? ""}`}
              initialDays={first.days}
              initialMore={first.more}
              filter={filter}
            />
          )}
        </div>
      </div>
    </>
  );
}
