import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Back } from "@/components/back-button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { PageBody } from "@/components/page";
import { Closing, Figures, Films, MonthStepper, Opening, Stretches, TopShows } from "@/components/review/parts";
import { MonthSwipe } from "@/components/review/reveal";
import { SEGMENT_CHIP_PILL, segmentChip } from "@/components/motion";
import { SegmentPill } from "@/components/segment-pill";
import { buttonClass, PageTitle } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { getReview, resolveMonth, selectableMonths, type ReviewPeriod } from "@/lib/review";

export const metadata: Metadata = { title: "Your review" };

const monthHref = (month: string) => `/review?p=month&m=${month}`;

/**
 * The year review, the old app's recap in the rebuild's design: this year so
 * far, or one finished month (`?p=month&m=YYYY-MM`), told a card at a time.
 * Reached from the profile's Your year, so the way back names Profile. All of
 * it from the play log (`lib/review.ts`); nothing here reaches TMDB.
 */
export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ p?: string; m?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { p, m } = await searchParams;
  const period: ReviewPeriod = p === "month" ? "month" : "year";
  const months = selectableMonths();
  const month = period === "month" ? resolveMonth(m) : null;
  const review = await getReview(user.id, period, month);
  const index = month ? months.indexOf(month) : -1;

  let body;
  if (!review) {
    body = (
      <EmptyState
        icon="calendar"
        title="No finished month yet"
        action={
          <Link href="/review" replace scroll={false} className={buttonClass("ghost", "sm")}>
            <Icon name="sparkle" size={18} />
            See the year
          </Link>
        }
      >
        A month can be looked back on once it is over. Come back in February; the year is there in the meantime.
      </EmptyState>
    );
  } else if (review.totalMinutes === 0) {
    body = (
      <EmptyState
        icon="film"
        title={period === "year" ? "Nothing logged this year" : `Nothing logged in ${review.label}`}
        action={
          <Link href="/discover" className={buttonClass("ghost", "sm")}>
            <Icon name="compass" size={18} />
            Find something
          </Link>
        }
      >
        Mark something watched and this starts filling in.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <Opening review={review} />
        <Figures review={review} />
        <Stretches review={review} />
        <TopShows review={review} />
        <Films review={review} />
        <Closing review={review} />
      </>
    );
  }

  return (
    <MonthSwipe previous={index > 0 ? months[index - 1] : null} next={index >= 0 && index < months.length - 1 ? months[index + 1] : null}>
      <PageBody className="pb-10">
        <header className="flex flex-col gap-2 lg:gap-4">
          <div className="flex h-[71px] items-center pt-[27px] lg:h-auto lg:pt-0">
            <Back href="/profile" name="Profile" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PageTitle>Your review</PageTitle>
            <nav aria-label="Period" className="relative flex gap-1.5">
              <SegmentPill className={SEGMENT_CHIP_PILL} />
              <Link href="/review" replace scroll={false} aria-current={period === "year" ? "page" : undefined} data-segment="" data-on={period === "year" ? "" : undefined} className={segmentChip}>
                Year
              </Link>
              <Link href="/review?p=month" replace scroll={false} aria-current={period === "month" ? "page" : undefined} data-segment="" data-on={period === "month" ? "" : undefined} className={segmentChip}>
                Month
              </Link>
            </nav>
          </div>
        </header>
        {period === "month" && month && <MonthStepper months={months} current={month} href={monthHref} />}
        {body}
      </PageBody>
    </MonthSwipe>
  );
}
