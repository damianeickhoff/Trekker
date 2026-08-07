"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteList, refreshList, renameList } from "@/lib/list-actions";
import { Popover } from "./popover";

/**
 * Rename, rebuild, delete — the three things you can do to a list you made.
 *
 * Only ever rendered for lists that are actually rows in `MediaList`. The
 * watchlist and the favourites deliberately have none of these: they cannot be
 * renamed without breaking what they mean, and they cannot be deleted at all.
 */
export function ListMenu({
  listId,
  name,
  kind,
  /** Where to go after deleting. Omitted on the overview, which stays put. */
  redirectTo,
}: {
  listId: string;
  name: string;
  kind: "manual" | "smart";
  redirectTo?: string;
}) {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState(name);
  const [pending, startTransition] = useTransition();
  const anchor = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  function close() {
    setOpen(false);
    setRenaming(false);
    setConfirming(false);
  }

  const row =
    "flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm text-ink-200 transition hover:bg-ink-800";

  return (
    <>
      <button
        ref={anchor}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Options for ${name}`}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
      >
        {pending ? <Loader2 size={16} className="animate-spin" /> : <MoreHorizontal size={16} />}
      </button>

      {open && (
        <Popover anchor={anchor} onClose={close} align="end" width={244}>
          {renaming ? (
            <div className="p-3">
              <input
                autoFocus
                value={draft}
                maxLength={60}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setRenaming(false);
                  if (event.key !== "Enter") return;
                  startTransition(async () => {
                    await renameList({ listId, name: draft });
                    close();
                    router.refresh();
                  });
                }}
                className="w-full rounded-xl border border-ink-700 bg-ink-900/70 px-3 py-2 text-base outline-none focus:border-flare-500 sm:text-sm"
              />
              <div className="mt-2 flex items-center gap-2">
                <button
                  type="button"
                  disabled={!draft.trim() || pending}
                  onClick={() =>
                    startTransition(async () => {
                      await renameList({ listId, name: draft });
                      close();
                      router.refresh();
                    })
                  }
                  className="rounded-lg bg-flare-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500 disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setRenaming(false)}
                  className="text-xs text-ink-400 transition hover:text-ink-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : confirming ? (
            <div className="p-3">
              <p className="text-sm text-ink-200">
                Delete “{name}”?
                <span className="mt-1 block text-xs text-ink-500">
                  {kind === "smart"
                    ? "The filters go with it. Nothing you have watched is affected."
                    : "The titles on it are only removed from this list."}
                </span>
              </p>
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      await deleteList(listId);
                      close();
                      if (redirectTo) router.push(redirectTo);
                      else router.refresh();
                    })
                  }
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-500 disabled:opacity-50"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs text-ink-400 transition hover:text-ink-100"
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <div className="py-1">
              {kind === "smart" && (
                <>
                  <Link
                    href={`/watchlist/list/${listId}/edit`}
                    className={row}
                    onClick={close}
                  >
                    <SlidersHorizontal size={15} className="shrink-0 text-ink-500" />
                    Edit filters
                  </Link>
                  <button
                    type="button"
                    onClick={() =>
                      startTransition(async () => {
                        await refreshList(listId);
                        close();
                        router.refresh();
                      })
                    }
                    className={row}
                  >
                    <RefreshCw size={15} className="shrink-0 text-ink-500" />
                    Refresh now
                  </button>
                </>
              )}

              <button type="button" onClick={() => setRenaming(true)} className={row}>
                <Pencil size={15} className="shrink-0 text-ink-500" />
                Rename
              </button>

              <button
                type="button"
                onClick={() => setConfirming(true)}
                className={`${row} border-t border-ink-800 text-red-500 hover:bg-red-500/10 hover:text-red-400`}
              >
                <Trash2 size={15} className="shrink-0" />
                Delete list
              </button>
            </div>
          )}
        </Popover>
      )}
    </>
  );
}
