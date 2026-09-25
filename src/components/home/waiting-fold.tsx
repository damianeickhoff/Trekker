"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Icon } from "../icon";
import { foldChevron, PRESS } from "../motion";
import { SectionHead } from "../section-head";
import { Unfold } from "../unfold";

/*
 * Also waiting on a phone folds away under its head, the count still showing,
 * and stays folded in this browser (localStorage: a per-viewer convenience,
 * so a read that throws, or a private window, simply leaves it open). From
 * `lg` it is the section it always was, open, its chevron the way to
 * `/waiting`; on a phone the fold's own chevron takes that place and the way
 * to `/waiting` is "Show all N" under the rows.
 *
 * The stored choice is read after paint (the server cannot know it), so a
 * folded list is drawn open for the first frame and then shut without a
 * transition; only a press animates.
 */

const KEY = "trekker:also-waiting-folded";

function storedFolded() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

export function WaitingFold({ meta, children }: { meta: string; children: ReactNode }) {
  const folded = useSyncExternalStore(subscribe, storedFolded, () => false);
  // A press wins over storage, so a browser that refuses the write still folds.
  const [chosen, setChosen] = useState<boolean | null>(null);
  const open = chosen ?? !folded;

  function toggle() {
    const next = !open;
    setChosen(next);
    try {
      localStorage.setItem(KEY, next ? "0" : "1");
    } catch {
      // Not remembered, but still folded for this visit.
    }
  }

  return (
    <section aria-labelledby="also-waiting" className="order-3 flex flex-col xl:hidden">
      <SectionHead id="also-waiting" title="Also waiting" meta={meta} href="/waiting" hrefClassName="max-lg:hidden">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls="also-waiting-rows"
          aria-label={open ? "Fold Also waiting" : "Unfold Also waiting"}
          className={`${PRESS} -my-2 -mr-2 inline-flex size-9 items-center justify-center self-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface hover:text-ink lg:hidden`}
        >
          <Icon name="chevR" size={18} className={foldChevron(open)} />
        </button>
      </SectionHead>
      <Unfold open={open} desk still={chosen === null} id="also-waiting-rows" className="flex flex-col gap-3 pt-3">
        {children}
      </Unfold>
    </section>
  );
}
