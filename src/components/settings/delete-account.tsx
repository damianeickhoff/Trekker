"use client";

import { useState, useTransition } from "react";
import { deleteMyAccount } from "@/lib/settings-actions";
import { Dialog, DialogTitle } from "../lists/dialog";
import { Presence } from "../presence";
import { buttonClass } from "../ui";

const WORD = "delete";

/**
 * Deleting an account, behind a typed word: there is no undo, and a dialog
 * with a red button is one press from an accident. The worker is told to
 * forget cached pages first, as signing out does.
 */
export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = typed.trim().toLowerCase() === WORD;

  const confirm = () =>
    start(async () => {
      navigator.serviceWorker?.controller?.postMessage({ type: "clear-pages" });
      const outcome = await deleteMyAccount(typed);
      if (outcome && !outcome.ok) setError(outcome.error);
    });

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass("ghost", "sm")}>
        Delete
      </button>
      <Presence open={open}>
        <Dialog label="Delete my account" onClose={() => !pending && setOpen(false)}>
          <DialogTitle>Delete my account</DialogTitle>
          <p className="m-0 text-sm leading-normal text-ink-2">
            Everything you logged goes with it: viewings, ratings, lists, badges and friends. There is no undo.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="mono-label">Type &ldquo;{WORD}&rdquo; to confirm</span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              className="h-[46px] w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink outline-none focus:border-ink-3"
            />
          </label>
          {error && <p className="m-0 text-[13px] text-ink-2">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} disabled={pending} className={buttonClass("ghost", "md")}>
              Cancel
            </button>
            <button type="button" onClick={confirm} disabled={!ready || pending} className={buttonClass("primary", "md")}>
              {pending ? "Deleting" : "Delete for good"}
            </button>
          </div>
        </Dialog>
      </Presence>
    </>
  );
}
