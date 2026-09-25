import { NextResponse } from "next/server";
import { pushConfigured } from "@/lib/push";
import { runDailyPush } from "@/lib/push-job";

/**
 * The morning push, once a day from outside, at an hour people are awake:
 *
 *   curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/notifications/run
 *
 * The secret is required: without it, anyone who could reach the instance
 * could make everyone's phone buzz.
 */

export const dynamic = "force-dynamic";

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
  if (!pushConfigured()) return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  return NextResponse.json(await runDailyPush());
}
