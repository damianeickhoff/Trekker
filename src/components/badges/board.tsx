"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { BadgeState } from "@/lib/achievements";
import type { Group } from "@/lib/achievements/catalogue";
import {
  closestToEarning,
  matches,
  showCounts,
  SHOW_LABEL,
  SHOWS,
  TIER_LABEL,
  TIERS,
  type Filters,
  type Show,
} from "@/lib/achievements/filter";
import { BADGE_XP, type Tier } from "@/lib/levels";
import { DrawOnView } from "../draw";
import { EmptyState } from "../empty-state";
import { Icon } from "../icon";
import { Dialog, DialogTitle } from "../lists/dialog";
import { SEGMENT_CHIP_PILL, segmentChip, PRESS } from "../motion";
import { Presence } from "../presence";
import { SectionHead } from "../section-head";
import { SegmentPill } from "../segment-pill";
import { buttonClass } from "../ui";
import { TIER_BG } from "./medal";
import { BADGE_GRID } from "./parts";
import { BadgeRow, badgeLine, MedalRing } from "./row";

/*
 * The badges page's narrowing: the group (the list beside the board, chips on
 * phones), All / In progress / Earned, a tier, and a search. All of it is held
 * here, on the client, because the whole board is already on the page.
 *
 * The group used to be a link to `?group=`, which made every tap a server
 * navigation. The board below is measured afresh on each render (`boardFor`:
 * the whole history, title lookups and writes), and a change of search
 * params alone keeps the same Suspense boundary, so React held the old screen,
 * highlight and all, until that finished. Nothing answered the tap, and the
 * second tap was the one people saw land. Now the tap changes state at once,
 * and the address is rewritten in place so a reload or a shared link still
 * opens on the same group.
 */

type State = Filters & {
  setGroup: (g: Group | null) => void;
  setShow: (s: Show) => void;
  setTier: (t: Tier | null) => void;
  setQuery: (q: string) => void;
};

const BadgeFiltersContext = createContext<State | null>(null);

function useFilters(): State {
  const state = useContext(BadgeFiltersContext);
  if (!state) throw new Error("useFilters outside BadgeFilters");
  return state;
}

export function BadgeFilters({ initialGroup, children }: { initialGroup: Group | null; children: ReactNode }) {
  const [group, setGroupState] = useState(initialGroup);
  const [show, setShow] = useState<Show>("all");
  const [tier, setTier] = useState<Tier | null>(null);
  const [query, setQuery] = useState("");

  const state = useMemo<State>(
    () => ({
      group,
      show,
      tier,
      query,
      setGroup(g) {
        setGroupState(g);
        // In place, not a navigation: Next keeps its router in step with a
        // native replaceState without asking the server for anything.
        const url = new URL(window.location.href);
        if (g) url.searchParams.set("group", g.toLowerCase());
        else url.searchParams.delete("group");
        window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
      },
      setShow,
      setTier,
      setQuery,
    }),
    [group, show, tier, query],
  );

  return <BadgeFiltersContext.Provider value={state}>{children}</BadgeFiltersContext.Provider>;
}

type Counts = Record<Group, { earned: number; total: number }>;

/** A chip in a set whose chosen fill is one sliding pill (`SegmentPill`, `segmentChip`). */
function chip(on: boolean, extra = "") {
  return { "data-segment": "", "data-on": on ? "" : undefined, className: `${segmentChip} ${extra}` };
}

/** The groups: chips on phones, a list with counts beside the board on desktop. */
export function GroupNav({
  groups,
  counts,
  earned,
  total,
}: {
  groups: readonly Group[];
  counts: Counts;
  earned: number;
  total: number;
}) {
  const { group, setGroup } = useFilters();
  const row = (on: boolean) =>
    `flex h-10 w-full items-center justify-between rounded-[10px] border-0 px-3 text-left text-sm font-semibold text-ink transition-colors duration-(--fast) ease-out ${
      on ? "bg-surface" : "bg-transparent hover:bg-surface"
    }`;
  return (
    <>
      {/* The chosen chip's fill is one pill that slides to the chip pressed (`SegmentPill`). */}
      <nav aria-label="Badge groups" className="no-scrollbar relative -mx-5 -my-2 flex gap-2 overflow-x-auto px-5 py-2 lg:hidden">
        <SegmentPill className={SEGMENT_CHIP_PILL} />
        <button type="button" aria-pressed={!group} onClick={() => setGroup(null)} {...chip(!group)}>
          All {total}
        </button>
        {groups.map((g) => (
          <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} {...chip(group === g)}>
            {g}
          </button>
        ))}
      </nav>
      <nav aria-label="Badge groups" className="hidden flex-col gap-0.5 lg:flex">
        <button type="button" aria-pressed={!group} onClick={() => setGroup(null)} className={row(!group)}>
          All badges
          <span className="mono-label">
            {earned}/{total}
          </span>
        </button>
        {groups.map((g) => (
          <button key={g} type="button" aria-pressed={group === g} onClick={() => setGroup(g)} className={row(group === g)}>
            {g}
            <span className="mono-label">
              {counts[g].earned}/{counts[g].total}
            </span>
          </button>
        ))}
      </nav>
    </>
  );
}

/** Closest to earning, the search and filters, and the groups of tiles they leave. */
export function Board({ badges, groups }: { badges: BadgeState[]; groups: readonly Group[] }) {
  const filters = useFilters();
  const { show, tier, query, setShow, setTier, setQuery } = filters;

  const closest = useMemo(() => closestToEarning(badges), [badges]);
  const counts = useMemo(() => showCounts(badges), [badges]);
  // Only tiers the catalogue has: a chip that could never show anything is a promise it cannot keep.
  const tiers = useMemo(() => TIERS.filter((t) => badges.some((b) => b.tier === t)), [badges]);
  const shown = badges.filter((b) => matches(b, filters));

  const sections = groups
    .filter((g) => !filters.group || g === filters.group)
    .map((g) => {
      const all = badges.filter((b) => b.group === g);
      return {
        group: g,
        items: shown.filter((b) => b.group === g),
        // The group's real score, so a narrowed view does not head every group
        // with "0 of 5" as though nothing in it had been earned.
        earned: all.filter((b) => b.earned).length,
        total: all.length,
      };
    })
    .filter((s) => s.items.length > 0);

  const needle = query.trim();
  // The badge open in its detail; kept by `Presence` while the sheet leaves.
  const [open, setOpen] = useState<BadgeState | null>(null);

  return (
    <>
      {closest.length > 0 && (
        <section aria-label="Closest to earning" className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
          <SectionHead title="Closest to earning" meta="Nearly there" />
          <div role="list" aria-label="Closest to earning" className="grid gap-2.5 lg:grid-cols-3 lg:gap-3">
            {closest.map((b) => (
              <BadgeRow key={b.id} badge={b} onOpen={() => setOpen(b)} />
            ))}
          </div>
        </section>
      )}

      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="relative">
          <Icon name="search" size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search badges"
            aria-label="Search badges"
            className="h-11 w-full rounded-full border border-line bg-surface pl-10 pr-10 text-sm text-ink outline-none placeholder:text-ink-3 focus:border-ink-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {query !== "" && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className={`${PRESS} absolute right-1.5 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:text-ink`}
            >
              <Icon name="x" size={14} />
            </button>
          )}
        </div>
        <div className="no-scrollbar -mx-5 flex items-center gap-2 overflow-x-auto px-5 lg:mx-0 lg:flex-wrap lg:overflow-visible lg:px-0">
          <div role="group" aria-label="Which badges to show" className="relative -my-2 flex gap-2 py-2">
            <SegmentPill className={SEGMENT_CHIP_PILL} />
            {SHOWS.map((s) => (
              <button key={s} type="button" aria-pressed={show === s} onClick={() => setShow(s)} {...chip(show === s)}>
                {SHOW_LABEL[s]}
                <span className="ml-1.5 font-mono text-[11px] font-medium opacity-60">{counts[s]}</span>
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-line" />
          <div role="group" aria-label="Tier" className="relative -my-2 flex gap-2 py-2">
            {/* No tier chosen, no pill: a chosen tier clears on a second tap. */}
            <SegmentPill className={SEGMENT_CHIP_PILL} />
            {tiers.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={tier === t}
                // A chosen tier clears on a second tap, as there is no "All tiers" chip to go back to.
                onClick={() => setTier(tier === t ? null : t)}
                {...chip(tier === t, "gap-1.5")}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${
                    t === "legend" ? "bg-[linear-gradient(135deg,var(--color-gold),var(--accent))]" : TIER_BG[t]
                  }`}
                />
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={needle ? "search" : "trophy"}
          title={needle ? "Nothing matches" : show === "done" ? "Nothing earned here yet" : "All done"}
        >
          {needle
            ? `No badge mentions “${needle}”. Try a shorter search.`
            : show === "done"
              ? "Nothing in this view has been earned so far. Clear a filter to see what is on the way."
              : "There is nothing left to chase in this view: every badge in it is yours."}
        </EmptyState>
      ) : (
        sections.map((s) => (
          <section key={s.group} aria-label={s.group} className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
            <div className="lg:hidden">
              <SectionHead title={s.group} meta={`${s.earned}/${s.total}`} />
            </div>
            <div className="hidden items-baseline gap-3 lg:flex">
              <h2 className="m-0 font-display text-[22px] font-bold leading-[1.05] tracking-[-0.025em]">{s.group}</h2>
              <span className="mono-label">
                {s.earned} of {s.total} earned
              </span>
            </div>
            {/* Rows, the old app's layout: one column on phones, two from sm, three on a wide desktop. */}
            <div role="list" aria-label={s.group} className={BADGE_GRID}>
              {s.items.map((b) => (
                <BadgeRow key={b.id} badge={b} onOpen={() => setOpen(b)} />
              ))}
            </div>
          </section>
        ))
      )}

      <Presence open={open !== null}>{open && <BadgeDetail badge={open} onClose={() => setOpen(null)} />}</Presence>
    </>
  );
}

/**
 * A badge opened from its row: the medal large in its ring (the arc drawing
 * as the sheet arrives), the name, its tier, group and what it is worth, the
 * description and the same line the row gives. A sheet on phones, a dialog on
 * a desktop (`Dialog`).
 */
function BadgeDetail({ badge, onClose }: { badge: BadgeState; onClose: () => void }) {
  return (
    <Dialog label={badge.name} onClose={onClose}>
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <DrawOnView as="span" className="inline-flex">
          <MedalRing badge={badge} size={92} medal={72} pop={1} />
        </DrawOnView>
        <DialogTitle>{badge.name}</DialogTitle>
        <span className="mono-label">
          {TIER_LABEL[badge.tier]} · {badge.group} · {BADGE_XP[badge.tier].toLocaleString("en-GB")} XP
        </span>
        <p className="m-0 text-sm leading-normal text-ink-2">{badge.description}</p>
        <span className={`font-mono text-xs font-medium tracking-[0.03em] ${badge.earned ? "text-accent-text" : "text-ink-3"}`}>
          {badgeLine(badge)}
        </span>
      </div>
      <button type="button" onClick={onClose} className={buttonClass("ghost", "md", "w-full")}>
        Close
      </button>
    </Dialog>
  );
}
