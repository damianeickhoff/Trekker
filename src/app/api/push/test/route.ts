import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { pushConfigured, sendToUser } from "@/lib/push";

/** Sends the caller a notification, so a new device can prove itself. */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  if (!pushConfigured()) {
    return NextResponse.json({ error: "Push is not configured" }, { status: 503 });
  }

  const { sent, failed } = await sendToUser(user.id, {
    title: "Trekker",
    body: "Notifications are working. This is what a reminder will look like.",
    url: "/calendar",
    tag: "trekker-test",
  });

  if (sent === 0) {
    return NextResponse.json(
      { error: failed > 0 ? "Your browser refused the message" : "No devices registered" },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, sent });
}
