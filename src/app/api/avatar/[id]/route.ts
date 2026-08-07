import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const user = await db.user.findUnique({
    where: { id },
    select: { avatarData: true, avatarType: true },
  });

  if (!user?.avatarData || !user.avatarType) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(user.avatarData), {
    headers: {
      "Content-Type": user.avatarType,
      // The URL carries a version stamp, so this can be cached hard.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
