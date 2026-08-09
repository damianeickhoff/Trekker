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
 *
 * The chips carry their own weight rather than sitting on the section's
 * background — a bar of flat outlines reads as a form, and this is meant to
 * read as a reaction. The one you picked is filled; the ones with the most
 * behind them keep a faint tint so the shape of the answer is visible before
 * any number is read.
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
  const most = Math.max(0, ...counts.values());

  // Signed out with nothing to show is an empty heading. Signed out *with*
  // something to show is worth reading, which is why this is not gated on being
  // signed in.
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
      // The server decides, and it may disagree — a feeling that no longer
      // exists in the catalogue, say.
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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div>
          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            Everyone who watched
          </p>
          <h2 className="mt-0.5 text-lg font-semibold tracking-tight">How it felt</h2>
        </div>

        {total > 0 && (
          <span className="ios-surface shrink-0 rounded-full border border-ink-700/70 px-2.5 py-1 font-mono text-[11px] tabular-nums text-ink-300 backdrop-blur-sm">
            {total} {total === 1 ? "answer" : "answers"}
          </span>
        )}
      </div>

      <div className="card p-3 sm:p-4">
        <div className="flex flex-wrap gap-2">
          {FEELINGS.map((feeling) => {
            const count = counts.get(feeling.id) ?? 0;
            const on = picked === feeling.id;
            // Faint tint on whatever is leading, so the answer has a shape
            // before anybody reads a number. Only once there is something to
            // lead — one answer is not a consensus.
            const leading = !on && count > 0 && count === most && total > 1;

            // Nothing to press when signed out, and nothing to say about a
            // feeling nobody picked — so it goes rather than sitting at zero.
            if (!signedIn && count === 0) return null;

            const inner = (
              <>
                <span aria-hidden className="text-base leading-none">
                  {feeling.emoji}
                </span>
                <span>{feeling.label}</span>
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${
                      on ? "bg-white/20 text-white" : "bg-white/10 text-ink-300"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </>
            );

            const shape =
              "inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs font-medium transition";

            if (!signedIn) {
              return (
                <span key={feeling.id} className={`${shape} border-ink-700/70 text-ink-300`}>
                  {inner}
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
                    ? "border-flare-400/60 bg-flare-600/25 text-white shadow-[0_8px_24px_-12px] shadow-flare-500/80"
                    : leading
                      ? "border-ink-600/70 bg-white/[0.07] text-ink-100 hover:border-flare-500"
                      : "border-ink-700/70 text-ink-300 hover:border-flare-500 hover:text-ink-100"
                }`}
              >
                {inner}
              </button>
            );
          })}
        </div>

        <p className="mt-3 text-[11px] text-ink-400">
          {total === 0
            ? "Nobody has said yet — everyone on this instance can see this."
            : "Everyone on this instance can see this."}
        </p>
      </div>
    </section>
  );
}
