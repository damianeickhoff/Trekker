import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getShowcase } from "@/lib/screensaver";

/**
 * The slideshow, rebuilt.
 *
 * The screensaver is server-rendered once and then may be the only thing on a
 * screen for a fortnight, which is long enough for "trending this week" to mean
 * a different week and for the temperature to be a season out. Rather than
 * reloading the page — which would restart the run, lose the wake lock and
 * flash — it asks for a fresh set every half hour and swaps them in.
 *
 * Signed out is an empty answer rather than a redirect: the caller is a poll
 * inside a page that is already open, and it treats an empty run as a blip and
 * keeps showing what it has.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ slides: [], weather: null }, { status: 401 });

  const showcase = await getShowcase(user.id);
  return NextResponse.json(showcase);
}
