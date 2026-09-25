import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nowPlaying } from "@/lib/now-playing";

/**
 * Who in the house is watching something on Plex, for the screensaver's card,
 * which asks every twenty seconds while it is on screen. `watching` is null
 * when the instance has no Plex connection, so the card stays away.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ watching: await nowPlaying() }, { headers: { "Cache-Control": "private, no-store" } });
}
