import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  label: z.string().max(120).optional(),
});

/** Registers this browser for reminders. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bad subscription" }, { status: 400 });
  }

  const { endpoint, keys, label } = parsed.data;

  // The endpoint is unique across the whole instance: if a browser was handed
  // to someone else, the row moves with it rather than being duplicated.
  await db.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      label: label ?? null,
    },
    update: { userId: user.id, p256dh: keys.p256dh, auth: keys.auth, label: label ?? null },
  });

  return NextResponse.json({ ok: true });
}

/** Unregisters it again. */
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { endpoint?: string } | null;
  if (!body?.endpoint) return NextResponse.json({ error: "Bad request" }, { status: 400 });

  await db.pushSubscription
    .deleteMany({ where: { endpoint: body.endpoint, userId: user.id } })
    .catch(() => undefined);

  return NextResponse.json({ ok: true });
}
