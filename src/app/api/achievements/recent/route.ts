import { NextResponse } from "next/server";
import { getLevel } from "@/lib/achievements";
import { ACHIEVEMENTS_BY_ID } from "@/lib/achievements/catalogue";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * Badges unlocked in the last few minutes.
 *
 * What the celebration on the front end reads. It has to be a poll rather than
 * something pushed down with the page, because the moment a badge is earned is
 * usually not a moment the user did anything: an episode scrobbled from Plex
 * runs the unlock check in the background, and there may be no navigation for
 * hours afterwards. The window is short and the query is one indexed read.
 */
const WINDOW_MS = 10 * 60 * 1000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ items: [], level: null });

  // The level comes down with it so the front end can notice a level or a rank
  // having moved. There is nothing to store for that: it compares what it is
  // told now against what it was told last time.
  const [rows, level] = await Promise.all([
    db.unlockedAchievement.findMany({
      where: { userId: user.id, unlockedAt: { gte: new Date(Date.now() - WINDOW_MS) } },
      orderBy: { unlockedAt: "asc" },
      take: 10,
    }),
    getLevel(user.id),
  ]);

  const items = rows
    .map((row) => {
      const achievement = ACHIEVEMENTS_BY_ID.get(row.key);
      if (!achievement) return null;

      return {
        // Includes the moment, so a badge cleared and earned again announces
        // itself a second time rather than being taken for one already seen.
        id: `${row.key}:${row.unlockedAt.getTime()}`,
        key: row.key,
        name: achievement.name,
        description: achievement.description,
        icon: achievement.icon,
        tier: achievement.tier,
      };
    })
    .filter((item) => item !== null);

  return NextResponse.json(
    { items, level: { level: level.level, rank: level.rank, xp: level.xp } },
    // Never cached: the whole point is that it is current.
    { headers: { "Cache-Control": "no-store" } },
  );
}
