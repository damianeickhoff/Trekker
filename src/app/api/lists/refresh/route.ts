import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { autoRequestAll } from "@/lib/auto-request";
import { isStale, refreshSmartList } from "@/lib/lists";
import { tmdbConfigured } from "@/lib/tmdb";

/**
 * Rebuilds every smart list that has aged out.
 *
 * There is no scheduler inside the app, so something outside has to call this
 * once a day — the same arrangement `/api/notifications/run` uses, and the same
 * secret guards it. On Windows that is a Task Scheduler entry running:
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/lists/refresh
 *
 * Nothing depends on it being set up. A smart list is also rebuilt on the way
 * into the lists page and on the way into its own page whenever its cache is
 * over a day old, so an instance with no cron entry is a day behind at worst
 * and pays for the rebuild on the first view instead. What the job buys is that
 * the first view of the day is fast rather than slow.
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

  if (!tmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured" }, { status: 503 });
  }

  const lists = await db.mediaList.findMany({ where: { kind: "smart" } });
  const stale = lists.filter((list) => isStale(list.refreshedAt));

  const results: { id: string; name: string; items: number; ok: boolean }[] = [];

  // Serial on purpose. Each rebuild is already several TMDB requests deep, and
  // an instance with a dozen lists on it firing all of them at once is how you
  // get rate limited into an empty list rather than a refreshed one.
  for (const list of stale) {
    const items = await refreshSmartList(list).catch(() => null);
    results.push({
      id: list.id,
      name: list.name,
      items: items?.length ?? 0,
      ok: items !== null,
    });
  }

  /**
   * Auto-requesting runs here and nowhere else.
   *
   * A smart list also rebuilds itself when a stale one is opened, and hanging
   * this off that path would mean *viewing* a list could file twenty requests —
   * which is not a thing a page load should be able to do. Tying it to the
   * nightly job keeps it to once a day, on a schedule somebody chose.
   *
   * After the rebuild, so a run asks for what the list says today rather than
   * what it said yesterday.
   */
  const auto = await autoRequestAll().catch(() => ({ lists: 0, requested: 0, errors: 1 }));

  return NextResponse.json({
    checked: lists.length,
    refreshed: results.filter((r) => r.ok).length,
    results,
    autoRequest: auto,
  });
}
