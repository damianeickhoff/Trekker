import { Suspense } from "react";
import {
  ChallengeBannerBones,
  LandingBones,
  RecentBones,
  TrendingBones,
  UpNextBones,
} from "@/components/home-skeleton";
import {
  ChallengesTier,
  FriendsWatchedTier,
  LandingSoonTier,
  NewsTier,
  NowWatchingTier,
  OnThisDayTier,
  RecentlyWatchedTier,
  TrendingTier,
  UpNextTier,
} from "@/components/home/tiers";
import { WhenMenuProvider } from "@/components/home/when-menu";
import { MobileTop, PageBody } from "@/components/page";
import { longDate, todayKey } from "@/lib/dates";

/**
 * Home. Nothing here awaits: the chrome, the header and every tier's skeleton
 * go out in the first bytes, and each tier streams into its own boundary as
 * its rows are read (see `components/home/tiers.tsx`). The page is one flex
 * column whose pieces carry `order-*`, the same at every width: the
 * challenges, the Up next card, Also waiting, Now watching in the house (when
 * Plex is linked and someone else is watching), Landing soon, Trending this
 * week, News (Round 10: at both widths, and after Trending), Friends watched,
 * On this day, and Recently watched last. What changes
 * with width is which piece draws Also waiting, never where things sit: from
 * `xl` the card carries it and its own section hides.
 */
export default function HomePage() {
  return (
    <>
      <MobileTop title="wordmark" />
      <WhenMenuProvider>
        <PageBody>
          <h1 className="order-0 m-0 hidden shrink-0 font-display text-[26px] font-bold leading-[1.05] tracking-[-0.025em] lg:block">
            {longDate(todayKey())}
          </h1>

          <Suspense fallback={<ChallengeBannerBones />}>
            <ChallengesTier />
          </Suspense>
          <Suspense fallback={<UpNextBones />}>
            <UpNextTier />
          </Suspense>
          {/* No bones: it is absent unless someone else is watching right now, and draws after a fetch anyway. */}
          <Suspense fallback={null}>
            <NowWatchingTier />
          </Suspense>
          <Suspense fallback={<LandingBones />}>
            <LandingSoonTier />
          </Suspense>
          <Suspense fallback={<TrendingBones />}>
            <TrendingTier />
          </Suspense>
          {/* No bones: News is absent unless something happened. After Trending by source order, sharing its `order-6`. */}
          <Suspense fallback={null}>
            <NewsTier />
          </Suspense>
          {/* No bones for Friends watched and On this day: each is absent more
              often than not, and a skeleton for something that then does not
              come is a jump of its own. */}
          <Suspense fallback={null}>
            <FriendsWatchedTier />
          </Suspense>
          <Suspense fallback={null}>
            <OnThisDayTier />
          </Suspense>
          <Suspense fallback={<RecentBones />}>
            <RecentlyWatchedTier />
          </Suspense>
        </PageBody>
      </WhenMenuProvider>
    </>
  );
}
