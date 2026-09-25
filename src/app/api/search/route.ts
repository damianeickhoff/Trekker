import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { marksFor } from "@/lib/home";
import { titleKey } from "@/lib/marks";
import { parseSearchType, runSearch, titleLine, type ResultTitle, type SearchAnswer } from "@/lib/search";
import { tmdbConfigured, type ListItem } from "@/lib/tmdb";

/**
 * The search box's answers. TMDB is asked through the cache table, where a
 * search keeps for an hour; the marks (on Plex, requested) are rows. Behind
 * sign-in, so never cached by the browser.
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  const type = parseSearchType(url.searchParams.get("type"));
  const empty: SearchAnswer = { query, shows: [], films: [], people: [] };
  const headers = { "Cache-Control": "private, no-store" };
  if (query.length < 2) return NextResponse.json(empty, { headers });
  if (!tmdbConfigured()) return NextResponse.json({ ...empty, error: "Search needs a TMDB key" }, { headers });

  try {
    const grouped = await runSearch(query, type);
    const titles = [...grouped.shows, ...grouped.films];
    const marks = await marksFor(titles.map((t) => ({ mediaType: t.mediaType, tmdbId: t.id })));
    const shape = (t: ListItem): ResultTitle => ({
      mediaType: t.mediaType,
      id: t.id,
      title: t.title,
      poster: t.poster,
      score: t.score,
      line: titleLine(t),
      mark: marks[titleKey(t.mediaType, t.id)] ?? null,
    });
    const answer: SearchAnswer = {
      query,
      shows: grouped.shows.map(shape),
      films: grouped.films.map(shape),
      people: grouped.people,
    };
    return NextResponse.json(answer, { headers });
  } catch {
    return NextResponse.json({ ...empty, error: "TMDB did not answer. Try again in a moment." }, { headers });
  }
}
