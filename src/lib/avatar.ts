import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { db } from "./db";

/**
 * Profile pictures live as files on the data volume, `/data/avatars` in the
 * container, beside the database, so the database stays a database and a
 * picture is served straight off the disk. The current app kept them in
 * `User.avatarData`; those are still served, and written out to a file the
 * first time anyone asks, so an old picture moves across by being looked at.
 *
 * Every address carries the moment the picture was set (`?v=`), which is what
 * lets the answer be cached as immutable: a new picture is a new address.
 */

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** `AVATAR_DIR`, else `avatars` beside the database file. */
export function avatarDir() {
  if (process.env.AVATAR_DIR?.trim()) return path.resolve(process.env.AVATAR_DIR.trim());
  const url = process.env.DATABASE_URL ?? "file:./data/trekker.db";
  const file = url.replace(/^file:/, "");
  return path.join(path.dirname(path.resolve(file)), "avatars");
}

/** One file per person; replacing the picture overwrites it. */
export function avatarFile(userId: string) {
  // Ids are cuids, but a path built from one is still checked.
  if (!/^[A-Za-z0-9_-]+$/.test(userId)) throw new Error("bad user id");
  return path.join(avatarDir(), userId);
}

export function avatarUrl(user: { id: string; avatarSetAt: Date | null; hasPicture?: boolean }): string | null {
  if (!user.avatarSetAt) return null;
  return `/api/avatar/${user.id}?v=${user.avatarSetAt.getTime()}`;
}

/** Stores a picture already checked for type and size. */
export async function saveAvatar(userId: string, bytes: Buffer, type: string) {
  await fs.mkdir(avatarDir(), { recursive: true });
  await fs.writeFile(avatarFile(userId), bytes);
  await db.user.update({
    where: { id: userId },
    // The old column is cleared so the database does not keep a second copy.
    data: { avatarType: type, avatarSetAt: new Date(), avatarData: null },
  });
}

export async function removeAvatar(userId: string) {
  await fs.rm(avatarFile(userId), { force: true });
  await db.user.update({ where: { id: userId }, data: { avatarType: null, avatarSetAt: null, avatarData: null } });
}

/** The picture's bytes and type, moving one still in the database out to a file. */
export async function readAvatar(userId: string): Promise<{ bytes: Buffer; type: string } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { avatarType: true, avatarSetAt: true },
  });
  if (!user?.avatarSetAt) return null;
  const type = user.avatarType && AVATAR_TYPES[user.avatarType] ? user.avatarType : "image/jpeg";
  try {
    return { bytes: await fs.readFile(avatarFile(userId)), type };
  } catch {
    const row = await db.user.findUnique({ where: { id: userId }, select: { avatarData: true } });
    if (!row?.avatarData) return null;
    const bytes = Buffer.from(row.avatarData);
    await fs.mkdir(avatarDir(), { recursive: true }).catch(() => undefined);
    await fs.writeFile(avatarFile(userId), bytes).catch(() => undefined);
    return { bytes, type };
  }
}
