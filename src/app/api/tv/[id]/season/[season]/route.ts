import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getSeason } from "@/lib/tmdb";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; season: string }> },
) {
  const { id, season } = await params;
  const showId = Number(id);
  const seasonNumber = Number(season);

  if (!Number.isInteger(showId) || !Number.isInteger(seasonNumber)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const data = await getSeason(showId, seasonNumber).catch(() => null);
  if (!data) {
    return NextResponse.json({ error: "Season not found on TMDB" }, { status: 404 });
  }

  // Deliberately separate: a database or session problem must not stop the
  // episode list from rendering, it should only cost the watched ticks.
  let watched: {
    episodeNumber: number;
    watchedAt: Date;
    lastWatchedAt: Date | null;
    plays: number;
  }[] = [];
  let rated: { episodeNumber: number; liked: boolean }[] = [];
  try {
    const user = await getCurrentUser();
    if (user) {
      [watched, rated] = await Promise.all([
        db.watchedEpisode.findMany({
          where: { userId: user.id, showId, seasonNumber },
          select: {
            episodeNumber: true,
            watchedAt: true,
            lastWatchedAt: true,
            plays: true,
          },
        }),
        db.episodeRating.findMany({
          where: { userId: user.id, showId, seasonNumber },
          select: { episodeNumber: true, liked: true },
        }),
      ]);
    }
  } catch (error) {
    console.error("Could not load watched episodes", error);
  }

  return NextResponse.json({
    episodes: data.episodes.map((e) => ({
      episodeNumber: e.episode_number,
      seasonNumber: e.season_number,
      name: e.name,
      overview: e.overview,
      runtime: e.runtime,
      airDate: e.air_date,
      still: e.still_path,
      score: Math.round((e.vote_average ?? 0) * 10),
      // What the episode is in the run — premiere, finale, mid-season — so a
      // season the row fetches itself is badged the same as the one that
      // arrived with the page.
      episodeType: e.episode_type ?? null,
    })),
    watched: watched.map((w) => w.episodeNumber),
    // Keyed by episode so the browser can show when each one was logged. The
    // most recent viewing, not the first — "when did I last see this" is what
    // the row is answering.
    watchedAt: Object.fromEntries(
      watched.map((w) => [w.episodeNumber, (w.lastWatchedAt ?? w.watchedAt).toISOString()]),
    ),
    /** Episode number → how many times it has been watched. */
    plays: Object.fromEntries(watched.map((w) => [w.episodeNumber, w.plays])),
    ratings: Object.fromEntries(rated.map((r) => [r.episodeNumber, r.liked])),
  });
}
