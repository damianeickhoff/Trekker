import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { parseTraktExport, TraktError } from "@/lib/trakt";
import { startImport } from "@/lib/trakt-import";

/**
 * The Trakt sheet's upload: the export zip Trakt emails, or one JSON file
 * from it. Read here, so a file that is not an export is refused on the spot;
 * the import itself runs behind the answer, with its progress on Home.
 */

export const dynamic = "force-dynamic";

/** An export of a long history is a few megabytes; this is room and a ceiling. */
const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get("file");
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: "That upload could not be read." }, { status: 400 });
  }
  if (!file || file.size === 0) return NextResponse.json({ error: "Choose the file Trakt sent you." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is larger than any Trakt export." }, { status: 413 });

  let bundle;
  try {
    bundle = parseTraktExport(Buffer.from(await file.arrayBuffer()), file.name);
  } catch (error) {
    return NextResponse.json({ error: error instanceof TraktError ? error.message : "That file could not be read." }, { status: 400 });
  }

  void startImport(user.id, "trakt-file", async () => bundle);
  return NextResponse.json({
    ok: true,
    found: { films: bundle.movies.length, shows: bundle.shows.length, ratings: bundle.ratings.length, watchlist: bundle.watchlist.length },
  });
}
