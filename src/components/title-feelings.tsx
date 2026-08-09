"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { FEELINGS } from "@/lib/feelings";
import { setFeeling } from "@/lib/comment-actions";
import type { FeelingTally } from "@/lib/comments";

/**
 * How a film landed, in one tap, from everybody who has seen it.
 *
 * Directly under the slider, because it is the next sentence in the same
 * thought: you mark something watched, you say how good it was, you say what it
 * was like. A score is a judgement and this is not — which is why the two sit
 * together rather than this being filed with the writing further down.
 *
 * Public, unlike a review. That is the point of the tally: "four people found
 * this tense" is a fact about the film, and it needs more than your friends to
 * be one.
 *
 * Colours follow the title page's own rules rather than the ink ramp: `ios-dim`
 * and `ios-surface` are what turn into white-on-glass below 40rem, where the
 * page is dark whatever the theme says, and the plain utilities beside them are
 * what render everywhere else. Neither works alone — see `globals.css`, "Title
 * pages".
 */

/** The unselected tile: glass on a phone, a real surface everywhere else. */
const TILE =
  "ios-surface border-ink-700/70 bg-ink-900/50 hover:border-flare-500 light:border-ink-600 light:bg-white/85";

/**
 * The selected one takes no `ios-surface`, deliberately. That rule is unlayered
 * and beats utilities below 40rem, so a chip carrying both would have its accent
 * repainted white on a phone — the same split `favourite-button.tsx` makes.
 */
const TILE_ON =
  "border-flare-400/60 bg-flare-600/25 shadow-[0_8px_24px_-12px] shadow-flare-500/80";

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

  // Signed out with nothing to show is a caption over nothing.
  if (!signedIn && total === 0) return null;

  function pick(id: string) {
    // Moved before the server answers, and the tally with it: this is a tile
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
    // Outside the transition, so the tiles revive as soon as the write lands
    // rather than when a whole page has re-rendered behind them.
    void write.then(() => router.refresh());
  }

  return (
    <div className="mt-4">
      <p className="ios-dim mb-2 text-xs text-ink-400">
        {total === 0
          ? "How did it feel? Everyone here can see this."
          : `How it felt, according to ${total} ${total === 1 ? "person" : "people"}.`}
      </p>

      {/* Four across, so eight is two clean rows and every tile is the same
          square whatever its label runs to. */}
      <div className="grid grid-cols-4 gap-2">
        {FEELINGS.map((feeling) => {
          const count = counts.get(feeling.id) ?? 0;
          const on = picked === feeling.id;

          const inner = (
            <>
              <span aria-hidden className="text-xl leading-none">
                {feeling.emoji}
              </span>
              <span
                className={`text-center text-[10px] leading-tight ${
                  on ? "ios-bright text-ink-100" : "ios-dim text-ink-400"
                }`}
              >
                {feeling.label}
              </span>
              {count > 0 && (
                <span
                  className={`font-mono text-[10px] tabular-nums ${
                    on ? "ios-bright text-ink-100" : "ios-dim text-ink-400"
                  }`}
                >
                  {count}
                </span>
              )}
            </>
          );

          const shape =
            "flex aspect-square flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 transition";

          if (!signedIn) {
            return (
              <span key={feeling.id} className={`${shape} ${TILE}`}>
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
              className={`${shape} active:scale-[0.97] disabled:opacity-60 ${on ? TILE_ON : TILE}`}
            >
              {inner}
            </button>
          );
        })}
      </div>
    </div>
  );
}
