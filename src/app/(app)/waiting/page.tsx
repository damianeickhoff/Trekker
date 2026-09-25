import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ExitList } from "@/components/exit-list";
import { WaitingRow } from "@/components/home/up-next";
import { WhenMenuProvider } from "@/components/home/when-menu";
import { Link } from "@/components/link";
import { Back } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { BackHeader } from "@/components/page";
import { buttonClass, filterChipClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { todayKey } from "@/lib/dates";
import { networksFor } from "@/lib/home";
import { hoursAndMinutes } from "@/lib/progress";
import { getWaiting, parseWaitingSort, WAITING_SORTS } from "@/lib/waiting";

export const metadata: Metadata = { title: "Still to watch" };

/**
 * Every show with an aired episode still to watch, where Home's Also waiting
 * leads. The same rows as Home with the same tick and when-menu, in Home's
 * order unless a chip asks for another; the order is in the address
 * (`?sort=az|left|aired`), so it survives a reload and the back button. A tick
 * records through the same action as Home's, which re-renders this route, and
 * holds the show's place, so the row advances where it is rather than jumping.
 * The back button goes to Home, where this list is reached from, rather than
 * back through history: a sort chip replaces the entry, but a tick does not
 * leave one either, so Home is always the right answer.
 */
export default async function WaitingPage({ searchParams }: { searchParams: Promise<{ sort?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { sort: asked } = await searchParams;
  const sort = parseWaitingSort(asked);
  const { rows, minutes } = await getWaiting(user.id, sort, todayKey());
  const networks = await networksFor(rows.map((r) => r.showId));
  const shows = `${rows.length} ${rows.length === 1 ? "show" : "shows"}`;
  const meta = rows.length ? `${shows} · ${hoursAndMinutes(minutes)} left` : shows;

  return (
    <WhenMenuProvider>
      <div className="flex flex-col gap-5 px-5 lg:gap-6 lg:px-10 lg:pt-7">
        <BackHeader
          back={<Back href="/" name="Home" />}
          title="Still to watch"
          meta={<span className="mono-label">{meta}</span>}
        />
        {rows.length === 0 ? (
          <EmptyState
            icon="tv"
            title="Nothing waiting"
            action={
              <Link href="/discover" className={buttonClass("ghost", "sm")}>
                <Icon name="compass" size={18} />
                Browse Discover
              </Link>
            }
          >
            When a show you are watching has a new episode out, it turns up here.
          </EmptyState>
        ) : (
          <>
            {/* Vertical padding inside the scroller, so the chips' shadows are not clipped by it. */}
            <nav aria-label="Sort" className="no-scrollbar -mx-5 -my-2 flex gap-1.5 overflow-x-auto px-5 py-2 lg:mx-0 lg:px-0">
              {WAITING_SORTS.map(([s, label]) => (
                <Link
                  key={s}
                  href={s === "next" ? "/waiting" : `/waiting?sort=${s}`}
                  replace
                  scroll={false}
                  aria-current={s === sort ? "true" : undefined}
                  className={filterChipClass(s === sort)}
                >
                  {label}
                </Link>
              ))}
            </nav>
            <ExitList label="Still to watch" className="flex flex-col lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-2" gap="pb-2 lg:pb-0">
              {rows.map((row) => (
                <WaitingRow key={row.showId} row={row} network={networks[row.showId] ?? null} />
              ))}
            </ExitList>
          </>
        )}
      </div>
    </WhenMenuProvider>
  );
}
