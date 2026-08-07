import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFriendIds } from "@/lib/friends";
import { avatarUrl } from "@/lib/avatar";
import {
  describeSession,
  getPlexConnection,
  getSessions,
  matchSession,
  type PlexSession,
  type SessionMetadata,
} from "@/lib/plex";
import { syncPlexHistory } from "@/lib/plex-history";
import { logPlexScrobble } from "@/lib/plex-scrobble";
import { syncPlexWatchlist } from "@/lib/plex-watchlist-sync";

/**
 * Who is watching what on Plex right now — the viewer, and any friends with a
 * linked Plex account. Answers `{ session: null, friends: [] }` rather than an
 * error for every "nothing is playing" case, so the card has one shape to deal
 * with.
 */

/**
 * The same poll doubles as the trigger for pulling Plex across, so ticking
 * something off there — or adding to the watchlist there — turns up here
 * without anyone pressing a button. Throttled per user, in memory: this runs
 * every fifteen seconds and a sync is a good deal more expensive than a session
 * list.
 */
const SYNC_EVERY_MS = 10 * 60 * 1000;
const lastSync = new Map<string, number>();

function maybeSync(userId: string) {
  const previous = lastSync.get(userId) ?? 0;
  if (Date.now() - previous < SYNC_EVERY_MS) return;
  lastSync.set(userId, Date.now());

  // Deliberately not awaited: the card should not wait on an import, and a
  // failure here must not turn into a failed poll.
  void syncPlexHistory(userId).catch((error) => {
    console.error("Plex history sync failed", error);
  });
  void syncPlexWatchlist(userId).catch((error) => {
    console.error("Plex watchlist sync failed", error);
  });
}

/**
 * Logs whatever is playing once it is far enough through to count as watched.
 *
 * This is the fallback for anyone without a Plex Pass, whose webhook is not an
 * option. Ninety percent is roughly where Plex itself scrobbles, and credits
 * mean the last few minutes are rarely watched.
 *
 * The set below is only a shortcut — it saves this poll two TMDB round trips a
 * tick while something sits at the end of a film. It is *not* what stops a
 * duplicate: it lives in one process and the webhook path never consults it, so
 * a Plex Pass user with both routes live would sail straight past it. The real
 * guard is the duplicate window in `recordPlay`, which is a query and therefore
 * sees every writer.
 */
const SCROBBLE_AT = 90;
const recentlyScrobbled = new Set<string>();

async function scrobbleIfFinished(userId: string, session: SessionMetadata) {
  if (!session.duration) return;

  const progress = ((session.viewOffset ?? 0) / session.duration) * 100;
  if (progress < SCROBBLE_AT) return;

  const key = `${userId}:${session.ratingKey}`;
  if (recentlyScrobbled.has(key)) return;
  recentlyScrobbled.add(key);
  // Short enough that the set cannot grow without bound. It does not need to
  // match the duplicate window — anything that slips through lands on it.
  setTimeout(() => recentlyScrobbled.delete(key), 60 * 60 * 1000).unref?.();

  const isEpisode = session.type === "episode";

  await logPlexScrobble(userId, {
    type: isEpisode ? "episode" : "movie",
    ratingKey: session.ratingKey ?? null,
    grandparentRatingKey: session.grandparentRatingKey ?? null,
    title: session.title ?? "Untitled",
    showTitle: session.grandparentTitle ?? null,
    year: session.year ?? null,
    seasonNumber: session.parentIndex ?? null,
    episodeNumber: session.index ?? null,
    watchedAt: new Date(),
  }).catch((error) => {
    console.error("Could not log a finished Plex session", error);
  });
}

export async function GET() {
  const empty = { session: null, friends: [] as PlexSession[] };

  const user = await getCurrentUser();
  if (!user) return NextResponse.json(empty);

  const [connection, identity, friendIds] = await Promise.all([
    getPlexConnection(),
    db.user.findUnique({
      where: { id: user.id },
      select: { plexAccountId: true, plexUsername: true },
    }),
    getFriendIds(user.id),
  ]);

  if (!connection || !identity) return NextResponse.json(empty);

  maybeSync(user.id);

  // One call to the server, matched against everyone we care about.
  const sessions = await getSessions(connection);
  if (sessions.length === 0) return NextResponse.json(empty);

  const mine = matchSession(sessions, {
    accountId: identity.plexAccountId,
    username: identity.plexUsername,
  });

  if (mine) void scrobbleIfFinished(user.id, mine);

  const friendAccounts =
    friendIds.length > 0
      ? await db.user.findMany({
          where: {
            id: { in: friendIds },
            OR: [{ plexAccountId: { not: null } }, { plexUsername: { not: null } }],
          },
          select: {
            id: true,
            name: true,
            plexAccountId: true,
            plexUsername: true,
            avatarSetAt: true,
            avatarType: true,
          },
        })
      : [];

  const [session, friends] = await Promise.all([
    mine ? describeSession(connection, mine) : null,
    Promise.all(
      friendAccounts.map(async (friend) => {
        const match = matchSession(sessions, {
          accountId: friend.plexAccountId,
          username: friend.plexUsername,
        });
        if (!match || match === mine) return null;

        const described = await describeSession(connection, match);
        if (!described) return null;

        return {
          ...described,
          who: { id: friend.id, name: friend.name, avatar: avatarUrl(friend) },
        };
      }),
    ),
  ]);

  return NextResponse.json({
    session,
    friends: friends.filter((f) => f !== null),
  });
}
