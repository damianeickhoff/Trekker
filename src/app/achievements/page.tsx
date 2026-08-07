import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Trophy } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { byCategory, getAchievementBoard, getLevel } from "@/lib/achievements";
import { LevelPanel } from "@/components/level-panel";
import { tmdbConfigured } from "@/lib/tmdb";
import { AchievementBoard } from "@/components/achievement-board";
import { AchievementCard } from "@/components/achievements";
import { AchievementWall } from "@/components/achievement-wall";
import { barWidth } from "@/lib/format";
import { SetupNotice } from "@/components/ui";

export const metadata = { title: "Achievements — Trekker" };

export default async function AchievementsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // The board first: it is what refreshes the two completion counts the level
  // reads, so asking for the level afterwards spends this visit's numbers
  // rather than the previous one's.
  const board = await getAchievementBoard(user.id);
  const level = await getLevel(user.id);

  const panels = await db.user.findUnique({
    where: { id: user.id },
    select: { xpPanelCollapsed: true },
  });

  // What is nearly done, ignoring anything not actually started — a wall of
  // "0%" suggestions is no use to anyone.
  const closest = board.achievements
    .filter((a) => !a.unlocked && a.percent > 0)
    .sort((a, b) => b.percent - a.percent)
    .slice(0, 3);

  return (
    <div className="rise">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1 text-sm text-ink-400 transition hover:text-ink-100"
      >
        <ChevronLeft size={15} /> Profile
      </Link>

      <header className="card relative mt-3 overflow-hidden bg-gradient-to-br from-flare-600/20 via-transparent to-ember-500/12 p-5 sm:p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 h-64 w-64 rounded-full bg-ember-500/15 blur-3xl"
        />

        <div className="relative flex flex-wrap items-center gap-5">
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-flare-600 to-ember-500 text-white">
            <Trophy size={30} strokeWidth={1.9} />
          </span>

          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">Achievements</h1>
            <p className="mt-0.5 text-sm text-ink-400">
              {board.unlockedCount} of {board.total} earned · level {level.level},{" "}
              {level.rank}
            </p>

            <div className="mt-3 h-2 max-w-md overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
                style={{ width: `${barWidth(board.percent, 1.5)}%` }}
              />
            </div>
          </div>

          <p className="font-mono text-4xl font-black tracking-tight text-flare-400 tabular-nums">
            {board.percent}%
          </p>
        </div>
      </header>

      {!tmdbConfigured() && (
        <div className="mt-4">
          <SetupNotice />
        </div>
      )}

      {board.pendingLookups > 0 && (
        <p className="mt-4 rounded-xl border border-ink-700/60 bg-ink-900/40 px-4 py-3 text-xs text-ink-400">
          Still looking up {board.pendingLookups} title
          {board.pendingLookups === 1 ? "" : "s"} on TMDB — the genre, language and franchise
          challenges will read low until that finishes. It picks up where it left off each time
          you open this page.
        </p>
      )}

      <LevelPanel level={level} collapsed={panels?.xpPanelCollapsed ?? false} />

      {board.justUnlocked.length > 0 && (
        <section className="mt-6">
          <p className="text-[11px] font-medium tracking-wider text-ember-400 uppercase">
            Just now
          </p>
          <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">
            {board.justUnlocked.length === 1 ? "New badge" : "New badges"}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {board.justUnlocked.map((item) => (
              <AchievementCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      {closest.length > 0 && (
        <section className="mt-6">
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            Nearly there
          </p>
          <h2 className="mt-0.5 mb-3 text-lg font-semibold tracking-tight">Closest to earning</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {closest.map((item) => (
              <AchievementCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <AchievementBoard
        achievements={board.achievements}
        categories={byCategory(board.achievements).map((group) => group.category)}
      />

      {/* The dialog for whichever badge `?badge=` names — mounted once here
          rather than one per card, since only ever one is open. */}
      <Suspense fallback={null}>
        <AchievementWall achievements={board.achievements} />
      </Suspense>
    </div>
  );
}
