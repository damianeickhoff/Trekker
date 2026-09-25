import { NextResponse } from "next/server";
import { handlePlexWebhook } from "@/lib/plex-webhook";
import { viewingChangedOutside } from "@/lib/viewing";

/**
 * The Plex webhook: see `lib/plex-webhook.ts`. The address the Plex sheet
 * shows; `/api/plex/webhook`, the current app's, answers the same way.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const answer = await handlePlexWebhook(request);
  if (answer.userId) viewingChangedOutside(answer.userId);
  return NextResponse.json(answer.body, { status: answer.status });
}
