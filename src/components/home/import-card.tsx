import type { ImportProgress } from "@/lib/trakt-import";
import { BackfillRefresher } from "./backfill-refresher";
import { FILL, fillTo } from "../motion";

/**
 * Shown while an import runs, like the backfill's card and beside it: which
 * stage, and how far through it. The numbers are the account row's, which the
 * import writes as it goes; the refresher re-reads Home every few seconds.
 */
export function ImportCard({ progress }: { progress: ImportProgress }) {
  const counting = progress.total === 0;
  const share = counting ? 0 : Math.min(progress.done / progress.total, 1);
  return (
    <section role="status" aria-live="polite" className="flex flex-col gap-3 rounded-[22px] bg-surface p-4 shadow-elevation lg:p-6">
      <span className="mono-label">Importing from Trakt</span>
      <p className="m-0 font-display text-lg font-bold leading-[1.15] tracking-[-0.02em] lg:text-[22px]">
        {progress.stage ?? "Reading your history"}
      </p>
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
