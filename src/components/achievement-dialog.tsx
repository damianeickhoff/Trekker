"use client";

import Image from "next/image";
import Link from "next/link";
import { Film, Loader2, Tv, User as UserIcon, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { AchievementState, EvidenceItem } from "@/lib/achievements";
import { img } from "@/lib/images";
import { BadgeMedal, formatUnlocked, tierLabel } from "./achievement-badge";

type Evidence = {
  caption: string;
  items: EvidenceItem[];
  pendingLookups: number;
};

/**
 * One achievement, and what earned it.
 *
 * The header is drawn from data the wall already had, so the dialog is complete
 * the instant it opens; only the list of titles is fetched, and it arrives under
 * a skeleton of the right shape. Tapping a badge should never feel like leaving
 * the page you were on.
 */
export function AchievementDialog({
  item,
  onClose,
}: {
  item: AchievementState;
  onClose: () => void;
}) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [failed, setFailed] = useState(false);

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

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/achievements/${item.id}`, { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: Evidence) => setEvidence(data))
      .catch((error: Error) => {
        if (error.name === "AbortError") return;
        setFailed(true);
      });

    return () => controller.abort();
  }, [item.id]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={item.name}
        onClick={(e) => e.stopPropagation()}
        className="fade-in flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border border-ink-700/70 bg-ink-900 shadow-2xl shadow-black/60 sm:max-h-[85vh] sm:rounded-3xl"
      >
        {/* The header carries the tier's own colour as a wash, so a legend badge
            and a bronze one do not open the same grey box. */}
        <header
          className={`relative shrink-0 overflow-hidden border-b border-ink-800 p-5 sm:p-6 ${
            item.unlocked
              ? "bg-gradient-to-br from-flare-600/25 via-transparent to-ember-500/15"
              : "bg-gradient-to-br from-ink-800/60 to-transparent"
          }`}
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -top-20 -right-12 h-52 w-52 rounded-full bg-flare-500/15 blur-3xl"
          />

          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-4 right-4 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink-950/50 text-ink-300 transition hover:bg-ink-800 hover:text-ink-100"
          >
            <X size={17} />
          </button>

          <div className="relative flex items-center gap-4 pr-10 sm:gap-5">
            <BadgeMedal
              icon={item.icon}
              tier={item.tier}
              unlocked={item.unlocked}
              percent={item.percent}
              size={68}
            />

            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-wider text-flare-400 uppercase">
                {item.category} · {tierLabel(item.tier)}
              </p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight sm:text-2xl">
                {item.name}
              </h2>
              <p className="mt-1 text-sm text-ink-400">{item.description}</p>
            </div>
          </div>

          <div className="relative mt-4">
            {item.unlocked ? (
              <p className="inline-flex items-center gap-2 rounded-full bg-fresh-500/15 px-3 py-1.5 text-xs font-medium text-fresh-500">
                Earned{item.unlockedAt ? ` ${formatUnlocked(item.unlockedAt)}` : ""}
              </p>
            ) : (
              <>
                <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-flare-500 to-ember-400"
                    style={{ width: `${Math.max(2, item.percent)}%` }}
                  />
                </div>
                <p className="mt-1.5 flex items-baseline justify-between gap-3 text-xs text-ink-500">
                  <span className="truncate">{item.detail ?? "Not earned yet"}</span>
                  <span className="shrink-0 font-mono tabular-nums">
                    {item.binary ? item.label : `${item.label} · ${item.percent}%`}
                  </span>
                </p>
              </>
            )}
          </div>
        </header>

        <div className="min-h-0 grow overflow-y-auto overscroll-contain p-5 sm:p-6">
          {failed ? (
            <p className="py-10 text-center text-sm text-ink-400">
              Could not load what earned this. Close and try again.
            </p>
          ) : !evidence ? (
            <PosterSkeleton />
          ) : evidence.items.length === 0 ? (
            <p className="py-10 text-center text-sm text-ink-400">
              Nothing counts towards this yet. Once something does, it will be listed here.
            </p>
          ) : (
            <>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold tracking-tight">{evidence.caption}</h3>
                <span className="shrink-0 font-mono text-xs text-ink-500 tabular-nums">
                  {evidence.items.length}
                </span>
              </div>

              {evidence.pendingLookups > 0 && (
                <p className="mb-3 rounded-lg border border-ember-500/25 bg-ember-500/10 px-3 py-2 text-xs text-ink-300">
                  Still looking up {evidence.pendingLookups} titles on TMDB, so this may be short
                  of a few.
                </p>
              )}

              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
                {evidence.items.map((entry) => (
                  <EvidenceTile key={entry.key} item={entry} onNavigate={onClose} />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * One title as a poster.
 *
 * The artwork is the point — a wall of covers says "these are the thirteen
 * horror films" far faster than thirteen lines of text — but the reason each one
 * counted still has to be legible, so it sits under the tile rather than on it.
 */
function EvidenceTile({ item, onNavigate }: { item: EvidenceItem; onNavigate: () => void }) {
  const poster = img.poster(item.poster);
  const Icon = item.mediaType === "tv" ? Tv : item.mediaType ? Film : UserIcon;

  const art = (
    <>
      <span className="relative block aspect-2/3 overflow-hidden rounded-xl border border-ink-700/60 bg-ink-800">
        {poster ? (
          <Image
            src={poster}
            alt=""
            fill
            sizes="150px"
            className="object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <span className="grid h-full place-items-center text-ink-600">
            <Icon size={22} />
          </span>
        )}
      </span>
      <span className="mt-1.5 block truncate text-xs font-medium text-ink-100">{item.title}</span>
      {item.note && (
        <span className="block truncate text-[11px] text-ink-500" title={item.note}>
          {item.note}
        </span>
      )}
    </>
  );

  return (
    <li>
      {item.mediaType && item.tmdbId ? (
        <Link
          href={`/title/${item.mediaType}/${item.tmdbId}`}
          onClick={onNavigate}
          title={item.title}
          className="group block"
        >
          {art}
        </Link>
      ) : (
        <span className="block" title={item.title}>
          {art}
        </span>
      )}
    </li>
  );
}

function PosterSkeleton() {
  return (
    <div role="status" aria-label="Loading">
      <div className="mb-3 flex items-center gap-2 text-xs text-ink-500">
        <Loader2 size={13} className="animate-spin" />
        Working out what earned this…
      </div>
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i}>
            <span className="skeleton block aspect-2/3 rounded-xl" />
            <span className="skeleton mt-1.5 block h-3 w-4/5 rounded" />
            <span className="skeleton mt-1 block h-2.5 w-2/5 rounded" />
          </li>
        ))}
      </ul>
    </div>
  );
}
