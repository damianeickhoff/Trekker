import "server-only";
import { cache } from "react";
import { avatarUrl } from "./avatar";
import { db } from "./db";

/**
 * Friendships are one row per pair, owned by whoever sent the request. Nothing
 * is visible between two people until the addressee accepts — which is why
 * every read here goes through `status: "accepted"` rather than trusting the
 * existence of a row.
 */

export type FriendState =
  | "self"
  | "friends"
  /** You asked them, and they have not answered. */
  | "requested"
  /** They asked you, and you have not answered. */
  | "incoming"
  | "none";

export type FriendSummary = {
  id: string;
  name: string;
  avatar: string | null;
  createdAt: Date;
  movieCount: number;
  episodeCount: number;
  ratingCount: number;
};

const SUMMARY = {
  id: true,
  name: true,
  avatarSetAt: true,
  createdAt: true,
  _count: { select: { movies: true, episodes: true, ratings: true } },
} as const;

type SummaryRow = {
  id: string;
  name: string;
  avatarSetAt: Date | null;
  createdAt: Date;
  _count: { movies: number; episodes: number; ratings: number };
};

function toSummary(user: SummaryRow): FriendSummary {
  return {
    id: user.id,
    name: user.name,
    avatar: avatarUrl(user),
    createdAt: user.createdAt,
    movieCount: user._count.movies,
    episodeCount: user._count.episodes,
    ratingCount: user._count.ratings,
  };
}

/** Ids of everyone this user is actually friends with. Memoised per request. */
export const getFriendIds = cache(async (userId: string): Promise<string[]> => {
  const rows = await db.friendship.findMany({
    where: {
      status: "accepted",
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });

  return rows.map((row) => (row.requesterId === userId ? row.addresseeId : row.requesterId));
});

export async function areFriends(userId: string, otherId: string) {
  if (userId === otherId) return true;
  return (await getFriendIds(userId)).includes(otherId);
}

/** Where the viewer stands with one other person. */
export async function friendState(viewerId: string, otherId: string): Promise<FriendState> {
  if (viewerId === otherId) return "self";

  const row = await db.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, addresseeId: otherId },
        { requesterId: otherId, addresseeId: viewerId },
      ],
    },
  });

  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requesterId === viewerId ? "requested" : "incoming";
}

export async function getFriends(userId: string): Promise<FriendSummary[]> {
  const ids = await getFriendIds(userId);
  if (ids.length === 0) return [];

  const users = await db.user.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    select: SUMMARY,
  });

  return users.map(toSummary);
}

export type FriendRequest = { id: string; person: FriendSummary; createdAt: Date };

/** Requests waiting on this user to answer. */
export async function getIncomingRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await db.friendship.findMany({
    where: { addresseeId: userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { requester: { select: SUMMARY } },
  });

  return rows.map((row) => ({
    id: row.id,
    person: toSummary(row.requester),
    createdAt: row.createdAt,
  }));
}

/** Requests this user has sent that nobody has answered yet. */
export async function getOutgoingRequests(userId: string): Promise<FriendRequest[]> {
  const rows = await db.friendship.findMany({
    where: { requesterId: userId, status: "pending" },
    orderBy: { createdAt: "desc" },
    include: { addressee: { select: SUMMARY } },
  });

  return rows.map((row) => ({
    id: row.id,
    person: toSummary(row.addressee),
    createdAt: row.createdAt,
  }));
}

/**
 * Everyone else on the instance who is not already a friend and has no request
 * either way — the list you can actually act on.
 */
export async function getSuggestedPeople(userId: string): Promise<FriendSummary[]> {
  const involved = await db.friendship.findMany({
    where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    select: { requesterId: true, addresseeId: true },
  });

  const known = new Set([userId]);
  for (const row of involved) {
    known.add(row.requesterId);
    known.add(row.addresseeId);
  }

  const users = await db.user.findMany({
    where: { id: { notIn: [...known] } },
    orderBy: { createdAt: "asc" },
    select: SUMMARY,
  });

  return users.map(toSummary);
}
