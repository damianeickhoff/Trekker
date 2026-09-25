import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cachedBell } from "@/lib/notifications";

/**
 * The bell's answer, for the browser to fetch after the page has painted: the
 * notifications, the newest badge for the unlock toast, and who is signed in
 * with their level for the sidebar. Cached a minute per person on the server;
 * never cached by the browser or the worker, since it is personal and short-lived.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json(await cachedBell(user.id), { headers: { "Cache-Control": "private, no-store" } });
}
