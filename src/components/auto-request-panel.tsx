"use client";

import { CloudDownload, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { runAutoRequestNow, setAutoRequest } from "@/lib/list-actions";
import { AUTO_REQUEST_MAX } from "@/lib/auto-request-limits";

/**
 * Letting a smart list ask Overseerr for what it finds.
 *
 * Only offered on a saved list, because the whole feature is about what happens
 * on a schedule — there is nothing to schedule against a list that does not
 * exist yet.
 *
 * The copy does the heavy lifting here. This is the one setting in the app that
 * spends someone else's disk without being pressed, so it says plainly what it
 * will do, how much of it, and when.
 */
export function AutoRequestPanel({
  listId,
  initialEnabled,
  initialScope,
  initialCap,
  lastRunAt,
  /** False when the instance has no Overseerr, which makes all of this moot. */
  seerrConnected,
}: {
  listId: string;
  initialEnabled: boolean;
  initialScope: "missing" | "all";
  initialCap: number;
  lastRunAt: string | null;
  seerrConnected: boolean;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [scope, setScope] = useState<"missing" | "all">(initialScope);
  const [cap, setCap] = useState(initialCap);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(next: { enabled?: boolean; scope?: "missing" | "all"; cap?: number }) {
    const merged = { enabled, scope, cap, ...next };

    setEnabled(merged.enabled);
    setScope(merged.scope);
    setCap(merged.cap);
    setSaved(false);
    setNote(null);

    startTransition(async () => {
      const result = await setAutoRequest({ listId, ...merged });
      if (result.ok) setSaved(true);
      else setNote(result.error ?? "That did not save");
    });
  }

  function runNow() {
    setNote(null);
    startTransition(async () => {
      const result = await runAutoRequestNow(listId);

      if (!result.ok) {
        setNote(result.error ?? "That did not run");
        return;
      }

      // Reported in full, including what it decided *not* to do — "asked for
      // nothing" with no reason reads as broken.
      const parts = [`Asked for ${result.requested.length}`];
      if (result.skippedKnown > 0) parts.push(`${result.skippedKnown} already known to Overseerr`);
      if (result.skippedOwned > 0) parts.push(`${result.skippedOwned} you can already stream`);
      setNote(`${parts.join(" · ")}.`);
    });
  }

  if (!seerrConnected) {
    return (
      <p className="ios-dim rounded-lg border border-ink-700 bg-ink-900/50 px-2.5 py-2 text-[11px] text-ink-400">
        Needs Overseerr connected on this instance. Once it is, a list can ask for what it finds
        on its own.
      </p>
    );
  }

  return (
    <>
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => save({ enabled: e.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-flare-500"
        />
        <span className="min-w-0">
          <span className="block text-sm">Ask Overseerr for what this finds</span>
          <span className="ios-dim mt-0.5 block text-xs text-ink-400">
            Once a day, when the nightly job rebuilds this list, it asks Overseerr for what it
            found. Nothing happens the moment you open the list.
          </span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4 space-y-4 border-t border-ink-800 pt-4">
          <div>
            <p className="text-xs font-medium tracking-wide text-ink-300 uppercase">
              What to ask for
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Choice on={scope === "missing"} onClick={() => save({ scope: "missing" })}>
                Only what I cannot stream
              </Choice>
              <Choice on={scope === "all"} onClick={() => save({ scope: "all" })}>
                Everything on the list
              </Choice>
            </div>
            <p className="ios-dim mt-1.5 text-xs text-ink-400">
              {scope === "missing"
                ? "Skips anything already streaming on a service you have ticked in Settings. Something available only to rent still counts as missing."
                : "Asks for every title, even ones you could already watch on a service you pay for."}
            </p>
          </div>

          <div>
            <label
              htmlFor="auto-request-cap"
              className="text-xs font-medium tracking-wide text-ink-300 uppercase"
            >
              At most per run
            </label>
            <div className="mt-2 flex items-center gap-3">
              <input
                id="auto-request-cap"
                type="range"
                min={1}
                max={AUTO_REQUEST_MAX}
                value={cap}
                onChange={(e) => setCap(Number(e.target.value))}
                onPointerUp={() => save({ cap })}
                onKeyUp={() => save({ cap })}
                className="h-1.5 min-w-0 flex-1 accent-flare-500"
              />
              <span className="w-16 shrink-0 text-right font-mono text-sm tabular-nums">
                {cap} {cap === 1 ? "title" : "titles"}
              </span>
            </div>
            <p className="ios-dim mt-1.5 text-xs text-ink-400">
              {/* Said out loud because a cap is only reassuring if you know it
                  cannot be raised past it by accident. */}
              Never more than {AUTO_REQUEST_MAX} in one run, whatever this says. Titles Overseerr
              already knows about do not count against it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-ink-800 pt-4">
            <button
              type="button"
              onClick={runNow}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-xl border border-ink-700 px-3 py-2 text-xs font-medium text-ink-200 transition hover:border-flare-500 hover:text-flare-400 disabled:opacity-60"
            >
              {pending ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <CloudDownload size={14} />
              )}
              Run it now
            </button>

            {lastRunAt && !note && (
              <span className="ios-dim text-xs text-ink-400">
                Last asked for something on {new Date(lastRunAt).toLocaleDateString("en-GB")}
              </span>
            )}
            {note && <span className="text-xs text-ink-200">{note}</span>}
            {saved && !note && !pending && (
              <span className="text-xs text-fresh-500">Saved</span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Choice({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        on
          ? "border-flare-500 bg-flare-600/25 text-flare-200 light:text-flare-700"
          : "border-ink-700 text-ink-300 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}
