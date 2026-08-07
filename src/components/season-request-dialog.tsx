"use client";

import { Check, CloudDownload, Loader2, TriangleAlert, X } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { requestTitle } from "@/lib/actions";
import type { SeerrSeason, SeerrStatusKind } from "@/lib/seerr";

/**
 * Pick which seasons to ask for.
 *
 * The request button used to send `seasons: "all"` and nothing else, which is
 * fine for a show nobody has touched and wrong for the common case: the server
 * already holds seasons two and three, and what you actually want is season
 * one. Overseerr has always accepted a list; there was simply no way to say one.
 *
 * Seasons already on the server, or already asked for, are shown but not
 * selectable — they are the context that makes the remaining choice make sense,
 * and hiding them would leave a list with unexplained gaps in the numbering.
 */

type Chip = { label: string; tone: string };

/**
 * What a season's status is called.
 *
 * Two facts about the season decide it, and they are not the same fact. Whether
 * anything has aired settles "not out yet"; whether anything is still to come
 * settles what a partial download means. A season part-way through its run is
 * both released and still airing — reading either one alone got that case wrong.
 *
 * Overseerr reports "partially available" for two different situations: the
 * server is missing episodes that exist, and the server has everything that
 * exists of a season still going out weekly. Only the first is a gap. Calling
 * the second one "partly there" made every currently-running show look broken.
 */
function statusChip(season: { kind: SeerrStatusKind; airing: boolean; released: boolean }): Chip | null {
  switch (season.kind) {
    case "requestable":
      // Nothing on the server, which is only worth remarking on when there is
      // nothing to have yet either.
      return season.released
        ? null
        : { label: "Not aired yet", tone: "border-ink-600 text-ink-400" };
    case "pending":
      return { label: "Requested", tone: "border-flare-500/40 text-flare-300" };
    case "partial":
      return season.airing
        ? { label: "Complete for now", tone: "border-emerald-500/40 text-emerald-400" }
        : { label: "Partly there", tone: "border-ember-500/40 text-ember-400" };
    case "available":
      return { label: "Available", tone: "border-emerald-500/40 text-emerald-400" };
  }
}

export function SeasonRequestDialog({
  tmdbId,
  title,
  seasons,
  alreadyOn,
  onClose,
  onRequested,
}: {
  tmdbId: number;
  title: string;
  seasons: SeerrSeason[];
  /** Services the viewer pays for that already carry this show. */
  alreadyOn: string[];
  onClose: () => void;
  /** Which seasons went through, so the caller can update its own label. */
  onRequested: (seasonNumbers: number[]) => void;
}) {
  const missing = seasons.filter((season) => season.kind === "requestable");

  // Everything missing, pre-ticked: the common case is "get me the rest", and
  // starting from an empty list would make that the most work.
  const [picked, setPicked] = useState<number[]>(() => missing.map((s) => s.seasonNumber));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(seasonNumber: number) {
    setPicked((current) =>
      current.includes(seasonNumber)
        ? current.filter((n) => n !== seasonNumber)
        : [...current, seasonNumber].sort((a, b) => a - b),
    );
  }

  function send() {
    setConfirming(false);
    startTransition(async () => {
      const res = await requestTitle({ mediaType: "tv", tmdbId, seasons: picked });
      if (res.ok) {
        onRequested(picked);
        onClose();
      } else {
        setError(res.error ?? "Request failed");
      }
    });
  }

  const allMissingPicked = picked.length === missing.length && missing.length > 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Request seasons of ${title}`}
        onClick={(e) => e.stopPropagation()}
        className="fade-in flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-ink-700/70 bg-ink-900 shadow-2xl shadow-black/60 sm:max-h-[85vh] sm:rounded-3xl"
      >
        <header className="relative shrink-0 border-b border-ink-800 bg-gradient-to-br from-flare-600/20 to-transparent p-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 grid h-8 w-8 place-items-center rounded-full bg-ink-800 text-ink-300 transition hover:bg-ink-700 hover:text-ink-100"
          >
            <X size={16} />
          </button>

          <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
            Request
          </p>
          <h2 className="mt-0.5 pr-10 text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-1 text-xs text-ink-400">
            {missing.length === 0
              ? "Every season is already on the server or on its way."
              : `${missing.length} of ${seasons.length} season${
                  seasons.length === 1 ? "" : "s"
                } missing.`}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {missing.length > 1 && (
            <div className="mb-3 flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setPicked(allMissingPicked ? [] : missing.map((s) => s.seasonNumber))
                }
                className="text-xs font-medium text-flare-400 transition hover:text-flare-300"
              >
                {allMissingPicked ? "Clear all" : "Select all missing"}
              </button>
            </div>
          )}

          <ul className="space-y-1.5">
            {seasons.map((season) => {
              const status = statusChip(season);
              const selectable = season.kind === "requestable";
              const checked = picked.includes(season.seasonNumber);

              return (
                <li key={season.seasonNumber}>
                  <label
                    className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                      selectable
                        ? `cursor-pointer ${
                            checked
                              ? "border-flare-500/70 bg-flare-600/15"
                              : "border-ink-700/70 hover:border-ink-600 hover:bg-ink-800/50"
                          }`
                        : "border-ink-800 bg-ink-900/40 opacity-70"
                    }`}
                  >
                    {selectable ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={pending}
                        onChange={() => toggle(season.seasonNumber)}
                        className="h-4 w-4 shrink-0 accent-flare-500"
                      />
                    ) : (
                      <Check size={16} className="shrink-0 text-ink-500" />
                    )}

                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{season.name}</span>
                      <span className="block text-xs text-ink-400">
                        {season.episodeCount} episode{season.episodeCount === 1 ? "" : "s"}
                      </span>
                    </span>

                    {status && (
                      <span
                        className={`shrink-0 rounded-full border bg-ink-900/60 px-2 py-0.5 text-[11px] font-semibold ${status.tone}`}
                      >
                        {status.label}
                      </span>
                    )}
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <footer className="shrink-0 border-t border-ink-800 p-4">
          {confirming ? (
            <>
              <p className="flex items-start gap-2 text-sm text-ink-200">
                <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ember-400" />
                <span>
                  You can already watch this on{" "}
                  <span className="font-semibold text-ink-100">{alreadyOn.join(" and ")}</span>.
                  Request it anyway?
                </span>
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={send}
                  className="rounded-xl bg-flare-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500"
                >
                  Request anyway
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
                >
                  Never mind
                </button>
              </div>
            </>
          ) : (
            <>
              {error && <p className="mb-2 text-xs text-red-300">{error}</p>}
              <button
                type="button"
                disabled={picked.length === 0 || pending}
                onClick={() => {
                  // Downloading something you already pay for is the one request
                  // worth querying — so it asks, once, rather than quietly
                  // filing it.
                  if (alreadyOn.length > 0) setConfirming(true);
                  else send();
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-flare-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-40"
              >
                {pending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CloudDownload size={16} />
                )}
                {picked.length === 0
                  ? "Pick a season"
                  : `Request ${picked.length} season${picked.length === 1 ? "" : "s"}`}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
