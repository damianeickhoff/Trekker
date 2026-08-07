import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fetchPlexImage, getPlexConnection } from "@/lib/plex";

/**
 * Proxies Plex artwork.
 *
 * Plex serves images only with a token attached, and that token must not reach
 * the browser — so the bytes come through here instead. Signed-in only, and the
 * path is restricted to Plex's own metadata roots so this cannot be pointed at
 * arbitrary endpoints on the server.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse(null, { status: 401 });

  const path = request.nextUrl.searchParams.get("path") ?? "";
  if (!/^\/(library|photo)\/[\w/.-]*$/.test(path)) {
    return new NextResponse(null, { status: 400 });
  }

  const connection = await getPlexConnection();
  if (!connection) return new NextResponse(null, { status: 404 });

  const image = await fetchPlexImage(connection, path);
  if (!image) return new NextResponse(null, { status: 404 });

  return new NextResponse(image.body, {
    headers: {
      "Content-Type": image.contentType,
      // Artwork for a given rating key does not change; the session does.
      "Cache-Control": "private, max-age=3600",
    },
  });
}
