import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getAchievementEvidence } from "@/lib/achievements";

/**
 * The titles behind one achievement, fetched when its dialog opens.
 *
 * Always the viewer's own — the id in the path names the achievement, never a
 * user, so there is nothing here to point at somebody else's history.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { id } = await params;
  const evidence = await getAchievementEvidence(user.id, id);
  if (!evidence) return NextResponse.json({ error: "No such achievement" }, { status: 404 });

  return NextResponse.json(evidence);
}
