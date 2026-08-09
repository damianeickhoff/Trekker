"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FEELINGS } from "@/lib/feelings";
import { setFeeling } from "@/lib/comment-actions";
import type { FeelingTally } from "@/lib/comments";

/**
 * How a film landed, in one tap, from everybody who has seen it.
 *
 * A score says how good something was and a review says why. Neither answers
 * what it was actually like to sit through, which is the thing people ask each
 * other about — and the answer is cheap enough that somebody will give it when
 * they would never write a paragraph.
 *
 * Public, unlike a review. That is the point of the tally: "four people found
 * this tense" is a fact about the film, and it needs more than your friends to
 * be one.
 */

export function TitleFeelings({
  mediaType,
  tmdbId,
  tally,
  mine,
  signedIn,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  /** Only feelings somebody picked; the rest are drawn at zero from `FEELINGS`. */
  tally: FeelingTally[];
  /** The reader's own pick, or null. */
  mine: string | null;
  signedIn: boolean;
}) {
  const [picked, setPicked] = useState(mine);
  const [counts, setCounts] = useState(() => new Map(tally.map((row) => [row.feeling, row.count])));
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0);

  // Signed out with nothing to show is an empty heading. Signed out *with*
  // something to show is worth reading, which is why this is not gated on
  // being signed in.
  if (!signedIn && total === 0) return null;

  function pick(id: string) {
    // Moved before the server answers, and the tally with it: this is a chip
    // that has to feel like a switch, and a round trip in the middle of one
    // reads as it not having worked.
    const next = picked === id ? null : id;
    const optimistic = new Map(counts);

    if (picked) optimistic.set(picked, Math.max(0, (optimistic.get(picked) ?? 1) - 1));
    if (next) optimistic.set(next, (optimistic.get(next) ?? 0) + 1);

    setPicked(next);
    setCounts(optimistic);

    const write = setFeeling({ mediaType, tmdbId, feeling: id });
    startTransition(async () => {
      const res = await write;
      // The server is the one that decides, and it may disagree — a feeling
      // that no longer exists in the catalogue, say.
      if (res.error) {
        setPicked(picked);
        setCounts(counts);
      }
    });
    // Outside the transition, so the chips revive as soon as the write lands
    // rather than when a whole page has re-rendered behind them.
    void write.then(() => router.refresh());
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold tracking-tight">How it felt</h2>
        <p className="text-[11px] text-ink-400">
          {total === 0
            ? "Nobody has said yet. Everyone can see this."
            : `${total} ${total === 1 ? "person" : "people"} · everyone can see this`}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FEELINGS.map((feeling) => {
          const count = counts.get(feeling.id) ?? 0;
          const on = picked === feeling.id;

          // Nothing to press when signed out, and nothing to say about a
          // feeling nobody picked — so it goes rather than sitting at zero.
          if (!signedIn && count === 0) return null;

          const label = (
            <>
              <span aria-hidden>{feeling.emoji}</span>
              <span>{feeling.label}</span>
              {count > 0 && (
                <span className="font-mono text-[11px] tabular-nums opacity-70">{count}</span>
              )}
            </>
          );

          const shape =
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition";

          if (!signedIn) {
            return (
              <span
                key={feeling.id}
                className={`${shape} border-ink-700 text-ink-300`}
              >
                {label}
              </span>
            );
          }

          return (
            <button
              key={feeling.id}
              type="button"
              disabled={pending}
              aria-pressed={on}
              onClick={() => pick(feeling.id)}
              className={`${shape} active:scale-[0.97] disabled:opacity-60 ${
                on
                  ? "border-flare-500/70 bg-flare-600/20 text-flare-300"
                  : "ios-surface border-ink-700 text-ink-300 hover:border-flare-500 hover:text-ink-100 light:border-ink-600 light:bg-white/85"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
