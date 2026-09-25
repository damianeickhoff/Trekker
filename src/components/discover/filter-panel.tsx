"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition, type ReactNode } from "react";
import {
  DEFAULT_FILTER_STATE,
  FILTER_SORTS,
  filterHref,
  filterQuery,
  isFiltered,
  toSmartFilters,
  type FilterState,
  type FilterType,
} from "@/lib/discover-filters";
import { findGenre, GENRES } from "@/lib/genres";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import { lengthLabel, RUNTIME_CEILING, sentence, YEAR_CEILING, YEAR_FLOOR } from "@/lib/smart-filters";
import { tvNote } from "@/lib/smart-query";
import { FoldRow, RangeSlider, smallChip, toggleIn, ToggleRow } from "../filter-controls";
import { Icon } from "../icon";
import { PRESS } from "../motion";

/*
 * The filter page's controls. They edit a copy of the filters here and write
 * it to the address a moment after the last change, which re-renders the
 * results below on the server; the address is the state, so a set of filters
 * is a link and the back button leaves the page rather than undoing a slider.
 * A change always lands on page one: page seven of a question that no longer
 * exists is never what anybody meant.
 */

const APPLY_DELAY_MS = 450;

const TYPES: [FilterType, string][] = [
  ["all", "Everything"],
  ["tv", "Shows"],
  ["movie", "Films"],
];

type Fold = "genre" | "services";

export function FilterPanel({ initial, children }: { initial: FilterState; children: ReactNode }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [open, setOpen] = useState<Fold | null>(null);
  const [applying, startApply] = useTransition();
  const set = (patch: Partial<FilterState>) => setF((current) => ({ ...current, ...patch }));

  // Written once the controls have been still for a moment. The address the
  // server rendered is `initial`, so a change that has already landed is
  // not written again.
  useEffect(() => {
    if (filterQuery(f) === filterQuery(initial)) return;
    const timer = setTimeout(() => startApply(() => router.replace(filterHref(f), { scroll: false })), APPLY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [f, initial, router]);

  const smart = toSmartFilters(f);
  const note = tvNote(smart);
  const genres = f.genres.length ? f.genres.map((g) => findGenre(g)?.label ?? g).join(", ") : "Any";
  const services = f.providers.length
    ? f.providers.map((id) => KNOWN_PROVIDERS.find((p) => p.id === id)?.name ?? id).join(", ")
    : "Any";

  return (
    <>
      <div className="flex flex-col gap-3.5 lg:max-w-[560px]">
        <p className="m-0 font-display text-base font-medium leading-[1.4] text-ink-2">
          {sentence(smart).map((p, i) =>
            p.strong ? (
              <strong key={i} className="font-semibold text-ink">
                {p.text}
              </strong>
            ) : (
              <span key={i}>{p.text}</span>
            ),
          )}
        </p>

        <div className="flex flex-col gap-2">
          <div role="radiogroup" aria-label="Show" className="flex flex-wrap gap-1.5">
            {TYPES.map(([value, label]) => (
              <button key={value} type="button" role="radio" aria-checked={f.type === value} onClick={() => set({ type: value })} className={smallChip(f.type === value)}>
                {label}
              </button>
            ))}
          </div>
          <div role="radiogroup" aria-label="Order" className="flex flex-wrap gap-1.5">
            {FILTER_SORTS.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={f.sort === s.value} onClick={() => set({ sort: s.value })} className={smallChip(f.sort === s.value)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          <FoldRow label="Genre" value={genres} open={open === "genre"} onToggle={() => setOpen((o) => (o === "genre" ? null : "genre"))}>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button
                  key={g.slug}
                  type="button"
                  aria-pressed={f.genres.includes(g.slug)}
                  onClick={() => set({ genres: toggleIn(f.genres, g.slug) })}
                  className={smallChip(f.genres.includes(g.slug))}
                >
                  {g.label}
                </button>
              ))}
            </div>
            {f.genres.length > 1 && <p className="m-0 text-xs text-ink-3">Every genre chosen must match.</p>}
          </FoldRow>

          <FoldRow label="Services" value={services} open={open === "services"} onToggle={() => setOpen((o) => (o === "services" ? null : "services"))}>
            <div className="flex flex-wrap gap-1.5">
              {KNOWN_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={f.providers.includes(p.id)}
                  onClick={() => set({ providers: toggleIn(f.providers, p.id) })}
                  className={smallChip(f.providers.includes(p.id))}
                >
                  {p.name}
                </button>
              ))}
            </div>
            {f.providers.length > 1 && <p className="m-0 text-xs text-ink-3">Streaming on any one of them, where you live.</p>}
          </FoldRow>

          <div className="flex flex-col gap-4 py-3.5">
            <RangeSlider
              label="Score"
              min={0}
              max={100}
              step={5}
              value={[f.scoreMin, f.scoreMax]}
              format={(n) => `${n}%`}
              onChange={([scoreMin, scoreMax]) => set({ scoreMin, scoreMax })}
            />
            <RangeSlider
              label="Years"
              min={YEAR_FLOOR}
              max={YEAR_CEILING}
              step={1}
              value={[f.yearMin, f.yearMax]}
              format={(n) => String(n)}
              onChange={([yearMin, yearMax]) => set({ yearMin, yearMax })}
            />
            <RangeSlider
              // TMDB reads a series' length as its episodes'.
              label={f.type === "tv" ? "Episode length" : "Length"}
              min={0}
              max={RUNTIME_CEILING}
              step={10}
              value={[f.runtimeMin, f.runtimeMax]}
              format={lengthLabel}
              onChange={([runtimeMin, runtimeMax]) => set({ runtimeMin, runtimeMax })}
            />
          </div>

          <ToggleRow label="Leave out what I have seen" on={f.hideWatched} onChange={(hideWatched) => set({ hideWatched })} />
          <ToggleRow label="Leave out what is already on a list" on={f.hideSaved} onChange={(hideSaved) => set({ hideSaved })} />
        </div>

        {note && <p className="m-0 text-xs text-ink-3">{note}</p>}
        {isFiltered(f) && (
          <button
            type="button"
            onClick={() => setF({ ...DEFAULT_FILTER_STATE })}
            className={`${PRESS} inline-flex items-center gap-1.5 self-start border-0 bg-transparent p-0 text-[13px] font-semibold text-ink-2 hover:text-ink`}
          >
            <Icon name="x" size={14} />
            Clear filters
          </button>
        )}
      </div>

      {/* The results are the server's; while a new question is on its way they fade rather than vanish. */}
      <div aria-busy={applying} className={applying ? "opacity-60" : ""}>
        {children}
      </div>
    </>
  );
}
