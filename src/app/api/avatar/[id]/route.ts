import { getSession } from "@/lib/auth";
import { readAvatar } from "@/lib/avatar";

/**
 * A profile picture. The address carries the moment it was set (`?v=`), so
 * the answer never changes and is cached as immutable; a new picture is a new
 * address. Private, because it sits behind sign-in.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getSession())) return new Response(null, { status: 401 });
  const { id } = await params;
  const avatar = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? await readAvatar(id) : null;
  if (!avatar) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(avatar.bytes), {
    headers: {
      "Content-Type": avatar.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
