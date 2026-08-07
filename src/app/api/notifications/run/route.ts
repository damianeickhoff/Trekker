import { NextResponse } from "next/server";
import { getUpcoming } from "@/lib/calendar";
import { db } from "@/lib/db";
import { pushConfigured, sendToUser } from "@/lib/push";
import { todayKey } from "@/lib/calendar";

/**
 * "What is on tonight" — one notification per user per day, listing what airs
 * or releases today from the shows they watch and the things on their list.
 *
 * There is no scheduler inside the app, so something outside has to call this
 * once a day. On Windows that is a Task Scheduler entry running:
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/notifications/run
 *
 * The secret is required: without it, anyone who could reach the instance could
 * make everyone's phone buzz.
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return run(req);
}

export async function GET(req: Request) {
  return run(req);
}

async function run(req: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const offered = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (offered !== secret) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  const today = todayKey();

  // Only users with at least one registered device, so a quiet instance costs
  // nothing beyond this query.
  const devices = await db.pushSubscription.findMany({
    where: { lastSent: { not: today } },
    select: { userId: true },
    distinct: ["userId"],
  });

  const results: { userId: string; entries: number; sent: number }[] = [];

  for (const { userId } of devices) {
    const entries = await getUpcoming(userId, { from: today, to: today }).catch(() => []);
    if (entries.length === 0) continue;

    const first = entries[0];
    const others = entries.length - 1;

    const { sent } = await sendToUser(userId, {
      title: entries.length === 1 ? "On tonight" : `${entries.length} things on tonight`,
      body:
        others > 0
          ? `${first.title} — ${first.detail}, and ${others} more.`
          : `${first.title} — ${first.detail}.`,
      url: "/calendar",
      tag: `tonight-${today}`,
    });

    // Marked whatever the outcome: a push service that refused us today will
    // refuse us again in an hour, and a repeat notification is worse than none.
    await db.pushSubscription.updateMany({ where: { userId }, data: { lastSent: today } });

    results.push({ userId, entries: entries.length, sent });
  }

  return NextResponse.json({ date: today, notified: results.length, results });
}
