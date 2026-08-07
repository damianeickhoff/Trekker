"use client";

import Image from "next/image";
import Link from "next/link";
import { Cast, Pause } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlexSession } from "@/lib/plex";
import { scoreTone } from "./media-card";
import { PlexOpen } from "./plex-open";

/**
 * What the people you watch with are watching, right now.
 *
 * Not you. The card used to lead with your own session, which is the one fact on
 * a dashboard that the reader already has — you know what you put on, you are
 * sitting in front of it. What is worth a glance is that somebody else started
 * something, and that is now all this shows.
 *
 * And it is a strip rather than a panel. It carried a poster, a backdrop, a
 * headline, a subtitle, a progress bar and a button, at the size of a hero, for
 * a fact that expires in an hour — so it pushed the things you came for down the
 * page. What survives is what the glance is made of: whose face, what they are
 * on, and how far through. The rest is a press away on the title itself.
 *
 * Polled rather than pushed: the server has no channel to this app, and a
 * request every fifteen seconds against a machine on the same network is
 * cheaper than the plumbing a live connection would need. That poll is also what
 * logs a finished film for anyone without a Plex Pass webhook, so it keeps
 * running whether or not there is anything here to draw.
 */
export function NowWatching({ enabled }: { enabled: boolean }) {
  const [friends, setFriends] = useState<PlexSession[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/plex/now-playing", { cache: "no-store" });
        const data = (await res.json()) as { friends?: PlexSession[] };
        if (!cancelled) setFriends(data.friends ?? []);
      } catch {
        // A server that has gone away is the same as nobody watching.
        if (!cancelled) setFriends([]);
      }
    }

    poll();
    const timer = setInterval(poll, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  if (friends.length === 0) return null;

  return (
    <div className="mt-4 space-y-2">
      {friends.map((session) => (
        <FriendStrip key={session.who?.id ?? session.title} session={session} />
      ))}
    </div>
  );
}

function FriendStrip({ session }: { session: PlexSession }) {
  const titleHref = session.tmdbId ? `/title/${session.mediaType}/${session.tmdbId}` : null;
  const name = session.who?.name ?? "Someone";

  return (
    <section className="fade-in card relative overflow-hidden">
      {/* The artwork stays — it is what made the old card worth looking at — but
          as a wash behind one line of text rather than as the thing being
          looked at. */}
      {session.art && (
        <Image
          src={session.art}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 1100px"
          className="object-cover opacity-20"
          unoptimized
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/85 to-ink-950/40" />

      <div className="relative flex items-center gap-3 px-3 py-2.5">
        <Face who={session.who} />

        <div className="min-w-0 flex-1">
          {/* The title first and the person second. Whose session it is decides
              whether you read on; what they are watching is the thing you came
              to read.

              The year and the score ride with the title because they are facts
              about it, and both are short enough to sit on the same line — which
              is the only line the title has. Only the name truncates; a year
              clipped to "20" and a score to "8" would be worse than absent. */}
          <p className="flex items-baseline gap-1.5 text-sm font-medium">
            <span className="min-w-0 truncate">
              {titleHref ? (
                <Link href={titleHref} className="hover:underline">
                  {session.title}
                </Link>
              ) : (
                session.title
              )}
            </span>
            {session.year && (
              <span className="shrink-0 font-normal text-ink-400 tabular-nums">
                {session.year}
              </span>
            )}
            {session.score !== null && session.score > 0 && (
              <span
                className={`shrink-0 font-mono text-[11px] tabular-nums ${scoreTone(session.score)}`}
              >
                {session.score}%
              </span>
            )}
          </p>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-400">
            {session.paused && <Pause size={10} className="shrink-0" fill="currentColor" />}
            {name} {session.paused ? "paused" : "is watching"}
            {session.subtitle ? ` · ${session.subtitle}` : ""}
          </p>
        </div>

        <span className="shrink-0 font-mono text-[11px] text-ink-400 tabular-nums">
          {session.remaining}m
        </span>

        <PlexOpen
          webHref={session.href}
          appHref={session.appHref}
          title="Open on Plex"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-[#e5a00d]/50 text-[#e5a00d] transition hover:bg-[#e5a00d]/10"
        >
          <Cast size={13} />
          <span className="sr-only">Open on Plex</span>
        </PlexOpen>
      </div>

      {/* Flush with the bottom edge, as a player's own scrubber is. It is a
          shape to be caught out of the corner of an eye rather than a figure to
          be read, which is why there is no percentage beside it. */}
      <div className="absolute inset-x-0 bottom-0 h-[3px] bg-white/10 light:bg-black/10">
        <div
          className="h-full bg-gradient-to-r from-flare-500 to-ember-400 transition-[width] duration-1000"
          style={{ width: `${session.progress}%` }}
        />
      </div>
    </section>
  );
}

function Face({ who }: { who: PlexSession["who"] }) {
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-flare-600 to-ember-500 text-xs font-black text-white">
      {who?.avatar ? (
        <Image
          src={who.avatar}
          alt=""
          width={32}
          height={32}
          className="h-8 w-8 object-cover"
          unoptimized
        />
      ) : (
        (who?.name ?? "?").slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
