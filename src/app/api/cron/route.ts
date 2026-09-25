import { NextResponse } from "next/server";
import { runDailyPass, runPendingBackfills, runPlexHistoryPass, runReturningPass } from "@/lib/refresh";

/**
 * The refresh jobs, for hosts that prefer an external scheduler to the timers
 * the server starts itself. The same functions the timers call:
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" "http://localhost:3000/api/cron?job=daily"
 *
 * `job` is `returning` (the six-hourly pass), `daily` (availability, watchlist
 * enrichment, housekeeping), `backfill` (anyone not yet backfilled) or `plex`
 * (everyone's Plex history, the half-hourly pass). The
 * secret is required: without it anyone who could reach the instance could
 * set it fetching.
 */

export const dynamic = "force-dynamic";

const JOBS = {
  returning: runReturningPass,
  daily: runDailyPass,
  backfill: runPendingBackfills,
  plex: runPlexHistoryPass,
} as const;

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });

  const offered = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (offered !== secret) return NextResponse.json({ error: "Not authorised" }, { status: 401 });

  const name = new URL(request.url).searchParams.get("job") ?? "daily";
  if (!(name in JOBS)) {
    return NextResponse.json({ error: `Unknown job. Use one of: ${Object.keys(JOBS).join(", ")}` }, { status: 400 });
  }

  const result = await JOBS[name as keyof typeof JOBS]();
  return NextResponse.json({ job: name, result });
}
