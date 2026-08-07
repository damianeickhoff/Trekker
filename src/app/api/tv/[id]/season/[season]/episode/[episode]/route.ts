import { NextResponse } from "next/server";
import { getEpisodeDetail, tmdbConfigured } from "@/lib/tmdb";

/**
 * One episode, with its cast — fetched when the episode dialog opens rather
 * than for every row in a season, which would be forty lookups to show one.
 *
 * Nothing here is per-user, so there is no session to check: it is the same
 * public TMDB data the title page already shows.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; season: string; episode: string }> },
) {
  if (!tmdbConfigured()) {
    return NextResponse.json({ error: "TMDB is not configured" }, { status: 503 });
  }

  const { id, season, episode } = await params;
  const showId = Number(id);
  const seasonNumber = Number(season);
  const episodeNumber = Number(episode);

  if (
    !Number.isInteger(showId) ||
    !Number.isInteger(seasonNumber) ||
    !Number.isInteger(episodeNumber)
  ) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const detail = await getEpisodeDetail(showId, seasonNumber, episodeNumber);
  if (!detail) return NextResponse.json({ error: "Episode not found" }, { status: 404 });

  return NextResponse.json(detail);
}
