import type { BackfillProgress } from "@/lib/refresh";
import { BackfillRefresher } from "./backfill-refresher";
import { FILL, fillTo } from "../motion";

/**
 * Shown while the import backfill works out where someone is in each show,
 * instead of an empty Home. The numbers come from the user row, which the job
 * updates after every show; the refresher re-reads it every few seconds.
 */
export function BackfillCard({ progress }: { progress: BackfillProgress }) {
  const counting = progress.total === 0;
  const share = counting ? 0 : Math.min(progress.done / progress.total, 1);
  const label = counting
    ? "Counting the shows in your history"
    : `Working out where you are in ${progress.total} ${progress.total === 1 ? "show" : "shows"}`;

  return (
    <section
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-[22px] bg-surface p-4 shadow-elevation lg:p-6"
    >
      <span className="mono-label">Getting ready</span>
      <p className="m-0 font-display text-lg font-bold leading-[1.15] tracking-[-0.02em] lg:text-[22px]">{label}</p>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total || 1}
        aria-valuenow={progress.done}
      >
        <div className={FILL} style={fillTo(Math.round(share * 100))} />
      </div>
      {!counting && (
        <span className="font-mono text-xs text-ink-3">
          {progress.done} of {progress.total}
        </span>
      )}
      <BackfillRefresher />
    </section>
  );
}
