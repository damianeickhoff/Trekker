import { todayKey } from "@/lib/dates";
import type { Person } from "@/lib/friends";
import {
  friendsProgress,
  friendsWhoWatchedEpisode,
  friendsWhoWatchedFilm,
  progressLine,
  viewingLine,
} from "@/lib/friends-watched";
import { Link } from "../link";
import { ROW_WASH } from "../motion";
import { PopcornShown } from "../popcorn";
import { UserAvatar } from "../user-avatar";
import { AsideLabel } from "./sections";

/*
 * Friends who watched, in a title's aside and on an episode page: one row per
 * friend, most recent viewing first, with when (or how far, on a show) and
 * their popcorn where they gave some. Most titles have none, so each block
 * is absent rather than empty, and the page streams it with no bones: a
 * skeleton for something usually not there would only be a flicker.
 */

type Row = { friend: Person; line: string; score: number | null };

/** `className` places the block in its page: it is its own box, drawn only when there is someone to show. */
function FriendsBlock({ rows, className }: { rows: Row[]; className: string }) {
  if (rows.length === 0) return null;
  return (
    <section aria-label="Friends who watched" className={`flex flex-col gap-1.5 ${className}`}>
      <AsideLabel meta={`${rows.length} ${rows.length === 1 ? "friend" : "friends"}`}>Friends who watched</AsideLabel>
      <ul className="m-0 flex list-none flex-col p-0">
        {rows.map((r) => (
          <li key={r.friend.id}>
            <Link href={`/profiles/${r.friend.id}`} className={`flex min-w-0 items-center gap-3 py-1.5 ${ROW_WASH}`}>
              <UserAvatar id={r.friend.id} name={r.friend.name} src={r.friend.avatar} size={32} />
              <span className="flex min-w-0 grow flex-col">
                <span className="truncate text-[13px] font-semibold">{r.friend.name}</span>
                <span className="truncate text-xs text-ink-3">{r.line}</span>
              </span>
              {r.score !== null && <PopcornShown level={r.score} size={20} className="shrink-0 text-ink-2" />}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export async function FriendsWatchedFilm({ userId, tmdbId, className }: { userId: string; tmdbId: number; className: string }) {
  const today = todayKey();
  const rows = await friendsWhoWatchedFilm(userId, tmdbId);
  return <FriendsBlock rows={rows.map((r) => ({ friend: r.friend, line: viewingLine(r, today), score: r.score }))} className={className} />;
}

export async function FriendsWatchedEpisode({
  userId,
  showId,
  season,
  episode,
  className,
}: {
  userId: string;
  showId: number;
  season: number;
  episode: number;
  className: string;
}) {
  const today = todayKey();
  const rows = await friendsWhoWatchedEpisode(userId, showId, season, episode);
  return <FriendsBlock rows={rows.map((r) => ({ friend: r.friend, line: viewingLine(r, today), score: r.score }))} className={className} />;
}

export async function FriendsWatchedShow({ userId, showId, className }: { userId: string; showId: number; className: string }) {
  const today = todayKey();
  const rows = await friendsProgress(userId, showId, today);
  return <FriendsBlock rows={rows.map((r) => ({ friend: r.friend, line: progressLine(r, today), score: r.score }))} className={className} />;
}
