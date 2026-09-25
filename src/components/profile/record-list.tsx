"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import type { RecordRow } from "@/lib/profile";
import { PRESS } from "../motion";
import { RecordRowCard } from "./record-row";

/**
 * Everything watched this week: the first `step` rows, and "Show more"
 * adding the next `step` under them, which fade and rise in 40ms apart
 * (`motion-rise-in`). The rows are all in the page already, so a press asks
 * nothing of the server. Once every row the page holds is showing, `after`
 * (the link to the whole history) takes the button's place.
 */
export function RecordList({ rows, step, after }: { rows: RecordRow[]; step: number; after?: ReactNode }) {
  const [shown, setShown] = useState(step);
  // Where the last press started, so only the rows it added arrive; the first rows are there on paint.
  const [from, setFrom] = useState(step);
  return (
    <>
      <div className="grid gap-2 lg:grid-cols-2 lg:gap-x-6">
        {rows.slice(0, shown).map((r, i) => (
          <div
            key={r.id}
            className={i >= from ? "motion-rise-in min-w-0" : "min-w-0"}
            style={i >= from ? ({ "--i": i - from } as CSSProperties) : undefined}
          >
            <RecordRowCard row={r} />
          </div>
        ))}
      </div>
      {shown < rows.length ? (
        <button
          type="button"
          onClick={() => {
            setFrom(shown);
            setShown(shown + step);
          }}
          className={`${PRESS} self-center rounded-full border-0 bg-transparent px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:bg-surface hover:text-ink`}
        >
          Show more ›
        </button>
      ) : (
        after
      )}
    </>
  );
}
