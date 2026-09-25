import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * This browser's push subscription, turned on or off from Settings. The
 * endpoint is unique across the instance: a browser handed to someone else
 * moves its row to them rather than being told about two people.
 */

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; label?: unknown };

const text = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = text(body?.endpoint, 2000);
  const p256dh = text(body?.keys?.p256dh, 500);
  const auth = text(body?.keys?.auth, 500);
  if (!endpoint || !p256dh || !auth || !/^https:\/\//.test(endpoint)) {
    return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  }
  const label = text(body?.label, 120);
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: user.id, endpoint, p256dh, auth, label },
    update: { userId: user.id, p256dh, auth, label },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as Body | null;
  const endpoint = text(body?.endpoint, 2000);
  if (!endpoint) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return NextResponse.json({ ok: true });
}
