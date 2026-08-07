"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { PenLine } from "lucide-react";
import { saveReview } from "@/lib/actions";
import type { FriendReview } from "@/lib/reviews";

/**
 * What you and the people you know made of it, as opposed to the TMDB reviews
 * from strangers directly above.
 *
 * The editor only writes to an existing rating — see `saveReview`. So when the
 * viewer has not scored the title yet this says so rather than offering a box
 * that would silently fail to save.
 */

function tone(score: number) {
  if (score >= 70) return "text-emerald-400 light:text-emerald-700";
  if (score >= 50) return "text-amber-400 light:text-amber-700";
  return "text-red-400 light:text-red-600";
}

function when(date: Date) {
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TitleReviews({
  mediaType,
  tmdbId,
  rated,
  initialReview,
  friends,
  signedIn,
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  /** Whether the viewer has scored this title. Without a score there is nothing to attach a review to. */
  rated: boolean;
  initialReview: string | null;
  friends: FriendReview[];
  signedIn: boolean;
}) {
  const [saved, setSaved] = useState(initialReview);
  const [draft, setDraft] = useState(initialReview ?? "");
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  // Nothing to write and nothing to read: no empty section.
  if (!signedIn && friends.length === 0) return null;
  if (signedIn && !rated && friends.length === 0 && !saved) return null;

  const dirty = draft.trim() !== (saved ?? "");

  function commit() {
    const text = draft.trim();
    startTransition(async () => {
      await saveReview({ mediaType, tmdbId, review: text });
      setSaved(text || null);
      setEditing(false);
    });
  }

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-semibold tracking-tight">Reviews</h2>

      {signedIn && (
        <div className="card p-4">
          {!rated ? (
            <p className="text-sm text-ink-400">
              Give it a score first — the slider is up by the watch button — and you can write
              about it here.
            </p>
          ) : editing || !saved ? (
            <>
              <textarea
                value={draft}
                maxLength={4000}
                disabled={pending}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={`What did you make of this ${mediaType === "tv" ? "show" : "film"}?`}
                className="min-h-28 w-full resize-y rounded-xl border border-ink-700/70 bg-ink-900/60 p-3 text-sm leading-relaxed text-ink-100 outline-none transition placeholder:text-ink-400 focus:border-flare-500 disabled:opacity-60 light:bg-white/70"
              />
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                <span className="mr-auto text-[11px] text-ink-400">
                  Only your friends can read this.
                </span>
                {saved !== null && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      setDraft(saved);
                      setEditing(false);
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-ink-300 transition hover:text-ink-100 disabled:opacity-60"
                  >
                    Cancel
                  </button>
                )}
                <button
                  type="button"
                  disabled={pending || !dirty}
                  onClick={commit}
                  className="rounded-lg bg-flare-600 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-40"
                >
                  {draft.trim() ? "Save review" : "Delete review"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-ink-100">{saved}</p>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[11px] text-ink-400">Your review</span>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(saved);
                    setEditing(true);
                  }}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-flare-400 transition hover:text-flare-300"
                >
                  <PenLine size={13} />
                  Edit
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {friends.length > 0 && (
        <ul className="mt-3 space-y-3">
          {friends.map((review) => (
            <li key={review.id} className="card p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-flare-600 to-ember-500 text-sm font-black text-white">
                  {review.avatar ? (
                    <Image
                      src={review.avatar}
                      alt=""
                      width={36}
                      height={36}
                      className="h-9 w-9 object-cover"
                      unoptimized
                    />
                  ) : (
                    review.author.slice(0, 1).toUpperCase()
                  )}
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/profiles/${review.authorId}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {review.author}
                  </Link>
                  <p className="text-[11px] text-ink-400">{when(review.updatedAt)}</p>
                </div>

                <span className={`shrink-0 text-sm font-semibold tabular-nums ${tone(review.score)}`}>
                  {review.score}%
                </span>
              </div>

              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap text-ink-300">
                {review.review}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
