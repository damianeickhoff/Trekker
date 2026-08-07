"use client";

import Image from "next/image";
import Link from "next/link";
import { Cast } from "lucide-react";
import { useEffect, useState } from "react";
import type { PlexSession } from "@/lib/plex";
import { PlexOpen } from "./plex-open";

/**
 * What is playing on Plex right now — the viewer's own session, and any friends
 * watching something at the same time.
 *
 * Polled rather than pushed: the server has no channel to this app, and a
 * request every fifteen seconds against a machine on the same network is
 * cheaper than the plumbing a live connection would need. Renders nothing until
 * something is actually playing, so a dashboard with no Plex looks no different
 * from one where nobody is watching.
 */
export function NowWatching({ enabled }: { enabled: boolean }) {
  const [session, setSession] = useState<PlexSession | null>(null);
  const [friends, setFriends] = useState<PlexSession[]>([]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/plex/now-playing", { cache: "no-store" });
        const data = (await res.json()) as {
          session: PlexSession | null;
          friends?: PlexSession[];
        };
        if (cancelled) return;
        setSession(data.session);
        setFriends(data.friends ?? []);
      } catch {
        // A server that has gone away is the same as nothing playing.
        if (!cancelled) {
          setSession(null);
          setFriends([]);
        }
      }
    }

    poll();
    const timer = setInterval(poll, 15_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled]);

  if (!session && friends.length === 0) return null;

  return (
    <>
      {session && <SessionCard session={session} />}
      {friends.map((friend) => (
        <SessionCard key={friend.who?.id ?? friend.title} session={friend} compact />
      ))}
    </>
  );
}

function SessionCard({ session, compact = false }: { session: PlexSession; compact?: boolean }) {
  const titleHref = session.tmdbId ? `/title/${session.mediaType}/${session.tmdbId}` : null;

  return (
    <section className="fade-in card relative mt-4 overflow-hidden">
      {session.art && (
        <Image
          src={session.art}
          alt=""
          fill
          sizes="(max-width: 1024px) 100vw, 1100px"
          className="object-cover opacity-25"
          unoptimized
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-r from-ink-950 via-ink-950/80 to-transparent" />

      <div className="relative flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
        <div
          className={`relative shrink-0 overflow-hidden rounded-lg bg-ink-800 ${
            compact ? "h-[84px] w-14" : "h-24 w-16 sm:h-28 sm:w-20"
          }`}
        >
          {session.thumb && (
            <Image
              src={session.thumb}
              alt=""
              fill
              sizes="80px"
              className="object-cover"
              unoptimized
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-ember-400 uppercase">
            <Cast size={12} />
            {session.who
              ? `${session.who.name} is ${session.paused ? "paused" : "watching"}`
              : session.paused
                ? "Paused on Plex"
                : "Watching now"}
          </p>

          {/* The title belongs to Trekker; Plex gets its own button below, so
              neither destination has to be guessed at. */}
          {titleHref ? (
            <Link
              href={titleHref}
              className={`mt-1 block truncate font-semibold tracking-tight hover:underline ${
                compact ? "text-base" : "text-lg sm:text-xl"
              }`}
            >
              {session.title}
            </Link>
          ) : (
            <p
              className={`mt-1 truncate font-semibold tracking-tight ${
                compact ? "text-base" : "text-lg sm:text-xl"
              }`}
            >
              {session.title}
            </p>
          )}
          <p className="truncate text-sm text-ink-400">{session.subtitle}</p>

          <div className="mt-3 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400 transition-[width] duration-1000"
                style={{ width: `${session.progress}%` }}
              />
            </div>
            <span className="shrink-0 font-mono text-xs text-ink-400 tabular-nums">
              {session.remaining}m left
            </span>
          </div>

          {/* No player name: which browser or box it happens to be running on
              is Plex's business, not something worth a line here. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
            <PlexOpen
              webHref={session.href}
              appHref={session.appHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5a00d]/50 px-2.5 py-1 text-[11px] font-semibold text-[#e5a00d] transition hover:bg-[#e5a00d]/10"
            >
              <Cast size={12} />
              Open on Plex
            </PlexOpen>
          </div>
        </div>
      </div>
    </section>
  );
}
