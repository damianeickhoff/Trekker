import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BellLink } from "@/components/bell/bell";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { Link } from "@/components/link";
import { ProfileHero } from "@/components/profile/hero";
import { TopFigures } from "@/components/profile/parts";
import { heroLevel, heroLine, ProfileBody } from "@/components/profile/sections";
import { ShareButton } from "@/components/profile/share-button";
import { buttonClass, IconLink } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import { isRangeKey, profileHead, profileTotals, type RangeKey } from "@/lib/profile";

export const metadata: Metadata = { title: "Profile" };

/**
 * Your profile, to the round 5 mockup. Tier 1 is the hero (cached counts on
 * `User`, the level, the most watched show's backdrop) and the big number with
 * its four cards, from the window's plays. Everything below streams in its
 * own boundary (`ProfileBody`). The range lives in `?range=`, and every figure
 * but the heatmap, the ratings and this week's record follows it.
 */
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { range: asked } = await searchParams;
  const range: RangeKey = isRangeKey(asked) ? asked : "all";
  const [head, totals] = await Promise.all([profileHead(user.id), profileTotals(user.id, range)]);
  if (!head) redirect("/login");

  return (
    <>
      <ProfileHero
        person={head}
        art={head.art}
        line={heroLine(head)}
        level={heroLevel(head)}
        title="Profile"
        phoneRight={
          <>
            <IconLink href="/review" icon="sparkle" label="Your review" kind="glass" />
            <BellLink kind="glass" />
            <IconLink href="/settings" icon="settings" label="Settings" kind="glass" />
          </>
        }
        deskTopRight={
          <>
            <ShareButton path={`/profiles/${head.id}`} />
            <Link href="/profile/edit" className={buttonClass("glass", "sm")}>
              <Icon name="settings" size={18} />
              Edit profile
            </Link>
          </>
        }
        deskRight={
          <>
            <Link href="/badges" className={buttonClass("glass", "sm")}>
              <Icon name="trophy" size={18} />
              Badges
            </Link>
            <Link href="/review" className={buttonClass("white", "sm")}>
              <Icon name="sparkle" size={18} />
              Your year
            </Link>
          </>
        }
      />
      {head.plays === 0 ? (
        <NoHistory />
      ) : (
        <ProfileBody userId={user.id} range={range} base="/profile" own plays={head.plays} top={<TopFigures totals={totals} range={range} />} />
      )}
    </>
  );
}

/**
 * Nothing logged yet: every section below the hero is worked out from the
 * history, so rather than a page of empty charts, one block saying where it
 * all comes from.
 */
function NoHistory() {
  return (
    <div className="px-5 pt-4 lg:px-10 lg:pt-6">
      <EmptyState
        icon="film"
        title="No history yet"
        action={
          <Link href="/search" className={buttonClass("primary", "sm")}>
            <Icon name="search" size={18} />
            Find something you have seen
          </Link>
        }
      >
        Your time, your habits, what you watch most and your trophy cabinet all come from what you mark watched.
      </EmptyState>
    </div>
  );
}
