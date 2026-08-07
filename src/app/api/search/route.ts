import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { avatarUrl } from "@/lib/avatar";
import { db } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import { searchCast, searchPaged, tmdbConfigured } from "@/lib/tmdb";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!query) return NextResponse.json({ results: [], people: [], cast: [] });

  const [data, people, cast] = await Promise.all([
    tmdbConfigured() ? searchPaged(query).catch(() => null) : null,
    searchPeople(query),
    // Actors and crew. Named apart from `people`, which is other users of this
    // instance — two quite different things that would otherwise collide.
    tmdbConfigured() ? searchCast(query).catch(() => []) : [],
  ]);

  return NextResponse.json({
    people,
    cast,
    results: (data?.items ?? []).slice(0, 7).map((item) => ({
      id: item.id,
      mediaType: item.mediaType,
      title: item.title,
      year: item.year,
      poster: item.poster,
      score: item.score,
    })),
  });
}

/**
 * Other people on the instance. Only offered to signed-in users, and it returns
 * no more than a name and a picture — what you can actually see of someone is
 * decided by `/profiles/[id]`, which stays private until you are friends.
 */
async function searchPeople(query: string) {
  const viewer = await getCurrentUser();
  if (!viewer) return [];

  const [users, friendIds] = await Promise.all([
    db.user.findMany({
      where: { name: { contains: query }, id: { not: viewer.id } },
      orderBy: { name: "asc" },
      take: 4,
      select: { id: true, name: true, avatarSetAt: true },
    }),
    getFriendIds(viewer.id),
  ]);

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    avatar: avatarUrl(user),
    isFriend: friendIds.includes(user.id),
  }));
}
