"use client";

import { Check, CloudDownload, Loader2, TriangleAlert } from "lucide-react";
import { useState, useTransition } from "react";
import { requestTitle } from "@/lib/actions";
import type { SeerrSeason, SeerrState, SeerrStatusKind } from "@/lib/seerr";
import { SeasonRequestDialog } from "./season-request-dialog";

const LABELS: Record<SeerrStatusKind, string> = {
  requestable: "Request",
  pending: "Requested",
  partial: "Partly available",
  available: "Available",
};

/** The line under the label in the menu form, where there is room for one. */
const NOTES: Record<SeerrStatusKind, string> = {
  requestable: "Ask your Overseerr to fetch it.",
  pending: "Already asked for — it is on its way.",
  partial: "Some of it is on the server already.",
  available: "It is on the server.",
};

export function SeerrButton({
  mediaType,
  tmdbId,
  title,
  initialState,
  /** Services the viewer subscribes to that already carry this title. */
  alreadyOn = [],
  mayRequest = true,
  variant = "button",
}: {
  mediaType: "movie" | "tv";
  tmdbId: number;
  /** Only used as the season dialog's heading. */
  title?: string;
  initialState: SeerrState;
  alreadyOn?: string[];
  /**
   * Whether this account has access to the Plex server the request would fill.
   *
   * Shown rather than hidden when false. A missing row leaves someone wondering
   * whether the feature exists, whether it is broken, or whether they did
   * something wrong; a row that says why is shorter than the email that
   * question turns into.
   */
  mayRequest?: boolean;
  /**
   * `menu` renders a row for the overflow menu instead of a standalone button.
   * Requesting is a once-per-title action, so it does not earn a permanent seat
   * in the hero row — but the logic behind it is the same either way, which is
   * why this is a variant rather than a second component.
   */
  variant?: "button" | "menu";
}) {
  const [kind, setKind] = useState<SeerrStatusKind>(initialState.kind);
  const [seasons, setSeasons] = useState<SeerrSeason[]>(initialState.seasons ?? []);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const missing = seasons.filter((season) => season.kind === "requestable");

  /**
   * A show is actionable whenever *any* season is still missing, not only when
   * the whole title reads as untouched. That gap is the whole point of the
   * season picker: a series with two of three seasons on the server reports
   * "partially available", which used to grey the button out and leave no way
   * to ask for the third.
   */
  const somethingToRequest = seasons.length > 0 ? missing.length > 0 : kind === "requestable";
  const actionable = somethingToRequest && mayRequest;

  function send() {
    setConfirming(false);
    startTransition(async () => {
      const res = await requestTitle({ mediaType, tmdbId });
      if (res.ok) {
        setKind("pending");
        setError(null);
      } else {
        setError(res.error ?? "Request failed");
      }
    });
  }

  /** Opens the picker for a show, or files a film straight away. */
  function begin() {
    if (seasons.length > 0) {
      setPicking(true);
      return;
    }
    if (alreadyOn.length > 0) setConfirming(true);
    else send();
  }

  /** Marks the chosen seasons as filed, without another round trip. */
  function afterRequest(requested: number[]) {
    const chosen = new Set(requested);
    const next = seasons.map((season) =>
      chosen.has(season.seasonNumber) ? { ...season, kind: "pending" as const } : season,
    );
    setSeasons(next);
    setError(null);
    if (next.every((season) => season.kind !== "requestable")) setKind("pending");
  }

  const dialog =
    picking && seasons.length > 0 ? (
      <SeasonRequestDialog
        tmdbId={tmdbId}
        title={title ?? "this show"}
        seasons={seasons}
        alreadyOn={alreadyOn}
        onClose={() => setPicking(false)}
        onRequested={afterRequest}
      />
    ) : null;

  if (variant === "menu") {
    // A show with something missing says so, however the title as a whole reads.
    const label = !mayRequest
      ? "Requesting unavailable"
      : seasons.length > 0 && missing.length > 0 && missing.length < seasons.length
        ? "Request seasons"
        : LABELS[kind];

    const note = !mayRequest
      ? "Only people with access to this Plex server can request titles."
      : seasons.length > 0 && missing.length > 0
        ? `${missing.length} of ${seasons.length} season${
            seasons.length === 1 ? "" : "s"
          } missing — pick which.`
        : NOTES[kind];

    return (
      /**
       * Tinted rather than plain, because this is the one row in the menu that
       * is about the title itself rather than about your own record of it — and
       * the only one that reaches off the box to another service. The wash is
       * on the wrapper so the confirmation panel below sits on it too, and so
       * the button's own `disabled:hover` cannot clear it.
       */
      <div className="border-b border-ink-800 bg-flare-600/10">
        {dialog}
        <button
          type="button"
          disabled={!actionable || pending}
          onClick={begin}
          className="flex w-full items-start gap-2.5 px-3 py-3 text-left text-sm text-ink-200 transition hover:bg-flare-600/15 disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent"
        >
          {pending ? (
            <Loader2 size={15} className="mt-0.5 shrink-0 animate-spin text-ink-500" />
          ) : actionable ? (
            <CloudDownload size={15} className="mt-0.5 shrink-0 text-flare-400" />
          ) : (
            <Check size={15} className="mt-0.5 shrink-0 text-ink-500" />
          )}
          <span>
            {label}
            <span className="mt-0.5 block text-xs text-ink-500">{note}</span>
          </span>
        </button>

        {confirming && (
          <div className="border-t border-ink-800 bg-ink-900/60 px-3 py-3">
            <p className="flex items-start gap-2 text-xs text-ink-200">
              <TriangleAlert size={14} className="mt-0.5 shrink-0 text-ember-400" />
              <span>
                You can already watch this on{" "}
                <span className="font-semibold text-ink-100">{alreadyOn.join(" and ")}</span>.
                Request it anyway?
              </span>
            </p>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={send}
                className="rounded-lg bg-flare-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500"
              >
                Request anyway
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
              >
                Never mind
              </button>
            </div>
          </div>
        )}

        {error && <p className="px-3 pb-2 text-xs text-red-300">{error}</p>}
      </div>
    );
  }

  return (
    <span className="relative inline-flex flex-col gap-1">
      {dialog}
      <button
        disabled={!actionable || pending}
        // A show opens the picker; a film goes straight out. Downloading
        // something you already pay for is the one request worth querying, so
        // that asks once rather than quietly filing it.
        onClick={begin}
        className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium backdrop-blur-sm transition disabled:opacity-100 ${
          actionable
            ? "border-flare-500 bg-ink-900/70 text-flare-400 hover:bg-flare-600/20 light:bg-white/85"
            : "cursor-default border-ink-600/70 bg-ink-900/70 text-ink-300 light:border-ink-600 light:bg-white/85 light:text-ink-200"
        }`}
      >
        {pending ? (
          <Loader2 size={15} className="animate-spin" />
        ) : actionable ? (
          <CloudDownload size={15} />
        ) : (
          <Check size={15} />
        )}
        {seasons.length > 0 && missing.length > 0 && missing.length < seasons.length
          ? "Request seasons"
          : LABELS[kind]}
      </button>

      {confirming && (
        <span className="absolute top-full left-0 z-50 mt-2 w-72 rounded-2xl border border-ink-700/70 bg-ink-850/95 p-3 backdrop-blur-2xl">
          <span className="flex items-start gap-2 text-sm text-ink-200">
            <TriangleAlert size={15} className="mt-0.5 shrink-0 text-ember-400" />
            <span>
              You can already watch this on{" "}
              <span className="font-semibold text-ink-100">{alreadyOn.join(" and ")}</span>.
              Request it anyway?
            </span>
          </span>

          <span className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={send}
              className="rounded-lg bg-flare-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-flare-500"
            >
              Request anyway
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-lg border border-ink-700 px-3 py-1.5 text-xs text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
            >
              Never mind
            </button>
          </span>
        </span>
      )}

      {error && <span className="text-xs text-red-300">{error}</span>}
    </span>
  );
}
