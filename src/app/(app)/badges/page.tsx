import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Board, BadgeFilters, GroupNav } from "@/components/badges/board";
import { AchievementsCard, BoardBones, LevelCard, type LevelCardData } from "@/components/badges/parts";
import { RefreshOnFresh } from "@/components/badges/refresh-on-fresh";
import { XpPanel } from "@/components/badges/xp-panel";
import { Link } from "@/components/link";
import { MobileTop } from "@/components/page";
import { buttonClass } from "@/components/ui";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/icon";
import { ACHIEVEMENTS, boardFor, earnedByGroup, GROUPS, type Group } from "@/lib/achievements";
import { getLevelBreakdown } from "@/lib/achievements/xp";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Badges" };

/**
 * The level and every badge. Tier 1 is the stored unlocks and the level, which
 * give the level card, the badge count, the XP breakdown and the group counts
 * at once; the progress on each badge is measured from the whole history in a
 * streamed boundary behind bones of the board, and anything it finds reached
 * is written as it goes. `?group=` opens on one group; choosing another, and
 * every other filter, is the client's (`badges/board.tsx`), so a tap never
 * waits for the board to be measured again.
 */

function parseGroup(value: string | string[] | undefined): Group | null {
  return GROUPS.find((g) => g.toLowerCase() === value) ?? null;
}

export default async function BadgesPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const group = parseGroup((await searchParams).group);

  const [level, stored, last, prefs] = await Promise.all([
    getLevelBreakdown(user.id),
    earnedByGroup(user.id),
    db.play.findFirst({
      where: { userId: user.id, poster: { not: null } },
      orderBy: { watchedAt: "desc" },
      select: { poster: true },
    }),
    db.user.findUnique({ where: { id: user.id }, select: { xpPanelCollapsed: true } }),
  ]);
  const card: LevelCardData = {
    level: level.level,
    rank: level.rank,
    xp: level.xp,
    toNextLevel: level.toNextLevel,
    percent: level.percent,
    maxed: level.maxed,
    art: last?.poster ?? null,
  };

  return (
    <BadgeFilters initialGroup={group}>
      <MobileTop title="Badges" />
      <h1 className="sr-only hidden lg:block">Badges</h1>
      <div className="flex flex-col gap-5 px-5 pt-2.5 lg:grid lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-10 lg:px-10 lg:pt-7">
        <div className="flex flex-col gap-5 lg:gap-[18px]">
          <div className="flex flex-col gap-3">
            <div className="lg:hidden">
              <LevelCard data={card} />
            </div>
            <div className="hidden lg:block">
              <LevelCard data={card} big />
            </div>
            <AchievementsCard earned={stored.earned} total={ACHIEVEMENTS.length} />
            <XpPanel
              sources={level.sources}
              xp={level.xp}
              lifetime={{ xp: level.lifetime.xp, level: level.lifetime.level, rank: level.lifetime.rank }}
              collapsed={prefs?.xpPanelCollapsed ?? false}
            />
          </div>

          <GroupNav groups={GROUPS} counts={stored.counts} earned={stored.earned} total={ACHIEVEMENTS.length} />
          <p className="m-0 hidden text-xs leading-normal text-ink-3 lg:block">
            Progress is worked out from your history every time you open this page. Genre and decade badges fill in as
            titles are looked up.
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-5 lg:gap-[22px]">
          {stored.earned === 0 && (
            <EmptyState
              icon="trophy"
              title="No badges yet"
              action={
                <Link href="/search" className={buttonClass("primary", "sm")}>
                  <Icon name="search" size={18} />
                  Find something you have seen
                </Link>
              }
            >
              The first comes with the first thing you log. Everything below shows how close you are to each one.
            </EmptyState>
          )}
          <Suspense fallback={<BoardBones groups={group ? [group] : GROUPS} />}>
            <BoardSection userId={user.id} />
          </Suspense>
        </div>
      </div>
    </BadgeFilters>
  );
}

async function BoardSection({ userId }: { userId: string }) {
  const board = await boardFor(userId);
  return (
    <div className="flex min-w-0 flex-col gap-5 lg:gap-[22px]">
      {board.fresh.length > 0 && <RefreshOnFresh />}
      <Board badges={board.badges} groups={GROUPS} />
      {board.pending > 0 && (
        <p className="m-0 text-xs leading-normal text-ink-3">
          {board.pending.toLocaleString("en-GB")} titles are still being looked up, so genre, decade and franchise badges
          read low for now. They fill in over the next few visits.
        </p>
      )}
    </div>
  );
}
