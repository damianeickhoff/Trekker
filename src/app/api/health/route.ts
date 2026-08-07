import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * Is this instance actually serving? For the container's `HEALTHCHECK`, and for
 * whatever sits in front of it.
 *
 * It touches the database on purpose. A check that only proves the HTTP server
 * answered would pass through the failure this deployment is most likely to
 * meet: the database file becoming unreadable or locked under it — a permission
 * that got reset, a volume that came back empty, SQLite blocking on a network
 * filesystem. The process survives all three and serves errors on every page,
 * which is exactly the state a health check exists to notice.
 *
 * `SELECT 1` rather than a real query: it proves the file is open and answering
 * without depending on any table, so a half-applied migration cannot make a
 * working instance look dead.
 *
 * Unauthenticated, because the thing calling it is Docker and cannot hold a
 * session. Safe to leave that way — the answer is one boolean either way, and
 * it says nothing about who is on the instance or what is on it.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Health check failed", error);
    // 503 rather than 500: the instance is not broken, it is not ready, and
    // that is the distinction a proxy needs to decide whether to keep sending
    // traffic here.
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
