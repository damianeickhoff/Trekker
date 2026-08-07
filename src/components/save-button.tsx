"use client";

import { Bookmark, BookmarkCheck, Check, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toggleInList, type TitleInput } from "@/lib/list-actions";
import type { SaveState, SaveTarget } from "@/lib/lists";
import { Popover } from "./popover";

/**
 * "Save" — the button that used to say "Watchlist".
 *
 * It was renamed because it no longer does one thing. The watchlist is still
 * the first row of the menu and still the answer most of the time, but it is
 * now one of several places a title can go, and a button labelled after one of
 * its destinations would be lying about the other ones.
 *
 * It only ever *files* a title. Making a list is a separate act with a name to
 * think of, and it belongs on the lists page where you can see what you already
 * have — offering it from the corner of a title page is how people end up with
 * four lists that mean the same thing.
 *
 * The corollary is that with no lists of your own there is nothing to choose
 * between, so the menu does not open at all: the button is a plain watchlist
 * toggle, exactly as it was before any of this existed. A menu of one option is
 * not a choice, it is an extra press.
 *
 * State is optimistic and the server's answer overwrites it. A title toggled on
 * a list is a small, obviously reversible act; making the user watch a spinner
 * for it would cost more than the occasional flicker when a call fails.
 */
export function SaveButton({
  item,
  initial,
  /** Marks the title watched, which takes it off the watchlist behind our back. */
  watchlistCleared,
}: {
  item: TitleInput;
  initial: SaveState;
  watchlistCleared?: boolean;
}) {
  const [targets, setTargets] = useState<SaveTarget[]>(initial.targets);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const anchor = useRef<HTMLButtonElement>(null);

  // `pruneWatchlist` on the server drops a film from the watchlist the moment it
  // is marked watched, so the row here has to follow — otherwise the menu shows
  // a tick against a list the title is no longer on.
  const shown = watchlistCleared
    ? targets.map((target) => (target.id === "watchlist" ? { ...target, holds: false } : target))
    : targets;

  const savedCount = shown.filter((target) => target.holds).length;

  // The watchlist is always the first target, so anything beyond it is a list
  // the user made — which is the only thing there is to choose between.
  const hasChoice = shown.length > 1;

  function set(listId: string, holds: boolean) {
    setTargets((current) =>
      current.map((target) => (target.id === listId ? { ...target, holds } : target)),
    );
  }

  function toggle(target: SaveTarget) {
    set(target.id, !target.holds);
    setError(null);

    startTransition(async () => {
      const result = await toggleInList({ listId: target.id, item });
      set(target.id, result.holds);
      if ("error" in result && result.error) setError(result.error);
    });
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={pending}
        onClick={() => {
          // Nothing to choose between: this is the watchlist toggle it always
          // was, and opening a one-row menu to say so would be a press wasted.
          if (!hasChoice) {
            toggle(shown[0]);
            return;
          }
          setOpen((v) => !v);
        }}
        aria-haspopup={hasChoice ? "dialog" : undefined}
        aria-pressed={hasChoice ? undefined : savedCount > 0}
        aria-expanded={hasChoice ? open : undefined}
        // The quiet half of the pair beside "Mark watched": the same pill,
        // hollow instead of filled. Solid-plus-outline is what makes one of two
        // equally sized buttons read as the primary one — without it they just
        // compete.
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3.5 max-sm:w-[50px] max-sm:shrink-0 max-sm:px-0 text-sm font-semibold backdrop-blur-sm transition active:scale-[0.98] disabled:opacity-60 ${
          savedCount > 0
            ? "border-flare-500/70 bg-flare-600/20 text-flare-300 hover:border-flare-400 hover:bg-flare-600/35 light:bg-flare-600/15 light:hover:bg-flare-600/25"
            : "ios-surface border-ink-600/70 bg-ink-900/50 text-ink-100 hover:border-flare-500 hover:bg-ink-800/80 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
        }`}
      >
        {pending ? (
          <Loader2 size={16} className="shrink-0 animate-spin" />
        ) : savedCount > 0 ? (
          <BookmarkCheck size={16} className="shrink-0" />
        ) : (
          <Bookmark size={16} className="shrink-0" />
        )}
        <span className="hidden truncate sm:inline">Save</span>
        {/* Two or more is worth counting; one is already said by the filled icon. */}
        {savedCount > 1 && (
          <span className="shrink-0 font-mono text-xs tabular-nums opacity-70">
            · {savedCount}
          </span>
        )}
      </button>

      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} width={272}>
          <p className="border-b border-ink-800 px-3.5 py-2.5 text-[11px] text-ink-400">
            Save to
          </p>

          <div className="max-h-64 overflow-y-auto py-1">
            {shown.map((target) => (
              <button
                key={target.id}
                type="button"
                onClick={() => toggle(target)}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-ink-200 transition hover:bg-ink-800"
              >
                <span
                  className={`grid h-4 w-4 shrink-0 place-items-center rounded border transition ${
                    target.holds
                      ? "border-flare-500 bg-flare-600 text-white"
                      : "border-ink-600"
                  }`}
                >
                  {target.holds && <Check size={11} strokeWidth={3.5} />}
                </span>
                <span className="truncate">{target.name}</span>
              </button>
            ))}
          </div>

          {/* Smart lists are deliberately absent from the rows above: what is on
              one is the answer to a question, so a title put there by hand would
              vanish at the next refresh. */}

          {error && (
            <p className="border-t border-ink-800 px-3.5 py-2 text-xs text-red-400">{error}</p>
          )}
        </Popover>
      )}
    </>
  );
}
