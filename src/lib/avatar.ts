/**
 * Avatars are served from the database by /api/avatar/[id]. The version stamp
 * lets the response be cached forever while still updating on a new upload.
 */
export function avatarUrl(user: { id: string; avatarSetAt: Date | null }) {
  return user.avatarSetAt ? `/api/avatar/${user.id}?v=${user.avatarSetAt.getTime()}` : null;
}
