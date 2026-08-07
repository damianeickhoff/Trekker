"use client";

import { useRouter } from "next/navigation";
import { Loader2, Plus } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { createList } from "@/lib/list-actions";
import { Popover } from "./popover";

/**
 * Making an empty list to fill by hand.
 *
 * A name and nothing else, so it stays a popover rather than a page — the
 * question "what shall I call it?" does not need a screen of its own. Smart
 * lists do, which is why that one is a link and this is not.
 */
export function NewListButton() {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const anchor = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function create() {
    const name = draft.trim();
    if (!name) return;

    startTransition(async () => {
      const result = await createList({ name, kind: "manual" });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setDraft("");
      setOpen(false);
      router.push(`/watchlist/list/${result.id}`);
    });
  }

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        // Sized to sit on a heading rather than under one: this is a control
        // belonging to the row beside it, not a call to action for the page, and
        // at full button size it competed with the title it was standing next to.
        // `whitespace-nowrap` is what stops "New list" folding onto two lines
        // when the heading beside it is long.
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-600/70 bg-ink-900/50 px-3 py-1.5 text-sm font-medium whitespace-nowrap text-ink-100 transition hover:border-flare-500 hover:bg-ink-800 light:border-ink-600 light:bg-white/85 light:hover:bg-white"
      >
        {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        New list
      </button>

      {open && (
        <Popover anchor={anchor} onClose={() => setOpen(false)} align="end" width={264}>
          <div className="p-3">
            <p className="mb-2 text-[11px] text-ink-400">
              A list you fill yourself, from the Save button on any title.
            </p>
            <input
              autoFocus
              value={draft}
              maxLength={60}
              placeholder="List name"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") create();
                if (event.key === "Escape") setOpen(false);
              }}
              className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3 py-2 text-base outline-none focus:border-flare-500 sm:text-sm"
            />
            {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
            <button
              type="button"
              disabled={!draft.trim() || pending}
              onClick={create}
              className="mt-2.5 w-full rounded-lg bg-flare-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-50"
            >
              Create list
            </button>
          </div>
        </Popover>
      )}
    </>
  );
}
