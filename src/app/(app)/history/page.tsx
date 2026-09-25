import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { BackHeader } from "@/components/page";
import { RecordRowCard } from "@/components/profile/parts";
import { buttonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { longDate, todayKey } from "@/lib/dates";
import { formatNumber } from "@/lib/levels";
import { formatSpan, HISTORY_PAGE, historyPage } from "@/lib/profile";

export const metadata: Metadata = { title: "History" };

/**
 * Everything watched, day by day, newest first: the profile's "Everything you
 * watched" in full, with the same rows. Paged by viewings (`?page=`, forty a
 * page) rather than by days, so a day with an import in it cannot make one
 * page enormous; a day cut by the page edge simply continues on the next.
 * Reached from the profile and from Home's Recently watched, so the way back
 * goes through history.
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { page: asked } = await searchParams;
  const page = Math.max(1, Math.floor(Number(asked)) || 1);
  const { days, more, total } = await historyPage(user.id, page);
  const today = todayKey();
  const pages = Math.max(1, Math.ceil(total / HISTORY_PAGE));

  return (
    <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
      <BackHeader
        back={<Back href="/profile" name="Back" history />}
        title="History"
        meta={
          <span className="mono-label">
            {formatNumber(total)} {total === 1 ? "viewing" : "viewings"}
            {pages > 1 ? ` · page ${page} of ${formatNumber(pages)}` : ""}
          </span>
        }
      />
      {days.length === 0 ? (
        <EmptyState
          icon="history"
          title={page > 1 ? "Nothing this far back" : "Nothing watched yet"}
          action={
            <Link href={page > 1 ? "/history" : "/search"} className={buttonClass("ghost", "sm")}>
              <Icon name={page > 1 ? "history" : "search"} size={18} />
              {page > 1 ? "Back to the newest" : "Find something you have seen"}
            </Link>
          }
        >
          {page > 1 ? "The history ends before this page." : "Everything you mark watched lands here, day by day."}
        </EmptyState>
      ) : (
        days.map((day) => (
          <section key={day.key} aria-label={longDate(day.key)} className="flex flex-col gap-2.5">
            <div className="flex items-baseline gap-3">
              <h2 className="m-0 font-display text-lg font-bold tracking-[-0.02em]">
                {day.key === today ? "Today" : longDate(day.key)}
                {day.key.slice(0, 4) !== today.slice(0, 4) ? ` ${day.key.slice(0, 4)}` : ""}
              </h2>
              <span className="mono-label">{formatSpan(day.minutes)}</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-6">
              {day.rows.map((r) => (
                <RecordRowCard key={r.id} row={r} day={false} />
              ))}
            </div>
          </section>
        ))
      )}
      {(page > 1 || more) && (
        <nav aria-label="Pages" className="flex justify-between gap-3 pb-2">
          {page > 1 ? (
            <Link href={page === 2 ? "/history" : `/history?page=${page - 1}`} className={buttonClass("ghost", "sm")}>
              <Icon name="chevL" size={18} />
              Newer
            </Link>
          ) : (
            <span />
          )}
          {more && (
            <Link href={`/history?page=${page + 1}`} className={buttonClass("ghost", "sm")}>
              Older
              <Icon name="chevR" size={18} />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
