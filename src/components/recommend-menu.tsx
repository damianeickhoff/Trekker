"use client";

import Image from "next/image";
import { Check, Loader2, Send, UserRound } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import {
  recommendTargets,
  recommendTitle,
  type RecommendState,
} from "@/lib/recommend-actions";

/**
 * Sending a title to a friend, from inside the overflow menu.
 *
 * Folded away until asked for: the friend list needs a round trip, and most
 * openings of that menu are for something else. Nothing is fetched until the row
 * is pressed.
 */

type Target = { id: string; name: string; avatar: string | null; sent: boolean };

export function RecommendRow({
  mediaType,
  tmdbId,
  title,
  poster,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  title: string;
  poster: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [note, setNote] = useState("");
  const [state, setState] = useState<RecommendState>({});
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || targets) return;

    recommendTargets(mediaType, tmdbId)
      .then(setTargets)
      // An empty list and a failed lookup look the same to the reader, and both
      // mean "nothing to do here" — so neither needs its own state.
      .catch(() => setTargets([]));
  }, [open, targets, mediaType, tmdbId]);

  function send(target: Target) {
    startTransition(async () => {
      const result = await recommendTitle({
        toUserId: target.id,
        mediaType,
        tmdbId,
        title,
        poster,
        note: note.trim() || null,
      });

      setState(result);
      // Marked here rather than re-fetched: the server has already said yes, and
      // a second round trip to learn what we just did would be for nothing.
      if (result.ok) {
        setTargets((current) =>
          (current ?? []).map((t) => (t.id === target.id ? { ...t, sent: true } : t)),
        );
      }
    });
  }

  return (
    <div className="border-t border-ink-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-2.5 px-3 py-3 text-left text-sm text-ink-200 transition hover:bg-ink-800"
      >
        <Send size={15} className="mt-0.5 shrink-0 text-ink-500" />
        <span>
          Recommend to a friend
          <span className="mt-0.5 block text-xs text-ink-500">
            It turns up in their notifications.
          </span>
        </span>
      </button>

      {open && (
        <div className="border-t border-ink-800 bg-ink-900/50 px-3 py-3">
          {targets === null ? (
            <p className="flex items-center gap-2 text-xs text-ink-500">
              <Loader2 size={13} className="animate-spin" />
              Looking up your friends…
            </p>
          ) : targets.length === 0 ? (
            <p className="text-xs text-ink-500">
              You have no friends on this instance yet — add someone and they will show up here.
            </p>
          ) : (
            <>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={280}
                placeholder="Why? (optional)"
                className="w-full rounded-lg border border-ink-700 bg-ink-900/70 px-2.5 py-1.5 text-xs outline-none placeholder:text-ink-600 focus:border-flare-500"
              />

              <ul className="mt-2 space-y-1">
                {targets.map((target) => (
                  <li key={target.id}>
                    <button
                      type="button"
                      disabled={pending || target.sent}
                      onClick={() => send(target)}
                      className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left text-sm transition hover:bg-ink-800 disabled:opacity-50 disabled:hover:bg-transparent"
                    >
                      <span className="relative grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-ink-800 text-ink-500">
                        {target.avatar ? (
                          <Image
                            src={target.avatar}
                            alt=""
                            width={28}
                            height={28}
                            unoptimized
                            className="h-7 w-7 object-cover"
                          />
                        ) : (
                          <UserRound size={13} />
                        )}
                      </span>

                      <span className="min-w-0 flex-1 truncate text-ink-200">{target.name}</span>

                      {target.sent ? (
                        <Check size={14} className="shrink-0 text-fresh-500" />
                      ) : (
                        <Send size={13} className="shrink-0 text-ink-500" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>

              {state.error && <p className="mt-2 text-xs text-red-400">{state.error}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
