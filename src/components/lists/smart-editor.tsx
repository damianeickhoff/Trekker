"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { GENRES } from "@/lib/genres";
import { findPeople, previewSmartList, saveSmartListAction, type Preview } from "@/lib/list-actions";
import { KNOWN_PROVIDERS } from "@/lib/providers";
import {
  DECADES,
  foldSummaries,
  KINDS,
  lengthLabel,
  MAX_LENGTHS,
  RUNTIME_CEILING,
  sentence,
  SOURCES,
  statusesFor,
  withKind,
  YEAR_CEILING,
  YEAR_FLOOR,
  type SmartFilters,
} from "@/lib/smart-filters";
import { MATCH_CAP } from "@/lib/smart-query";
import { Count } from "../count";
import { Swap } from "../swap";
import { Back } from "../back-button";
import { FoldRow, RangeSlider, smallChip, toggleIn, ToggleRow } from "../filter-controls";
import { Icon } from "../icon";
import { Link } from "../link";
import { SEGMENT_TRACK, SEGMENT_TRACK_PILL, segmentOption } from "../motion";
import { BackHeader } from "../page";
import { Poster } from "../poster";
import { SegmentPill } from "../segment-pill";
import { ArtChip, buttonClass, Field } from "../ui";

/*
 * The smart list editor. The preview re-runs the same query the saved list
 * will, a moment after every change, and shows the first twenty: pinned across
 * the top on a phone, beside the controls on a desktop. The filters are folded
 * into six sections, each saying on its closed header what it holds, so the
 * form reads as six lines rather than a wall of chips; above them, the whole
 * question as one sentence, which is what to check before saving.
 */

type Props = {
  listId: string | null;
  initialName: string;
  initialFilters: SmartFilters;
  certifications: string[];
  /** Where Discard and the back button go: the list being edited, or the lists page. */
  back: string;
  initialAutoRequest: boolean;
  /** The auto-request switch is offered only when there is an Overseerr to ask. */
  seerrConnected: boolean;
};

type Fold = "what" | "genre" | "services" | "people" | "status" | "certificate";

const PREVIEW_DELAY_MS = 450;

export function SmartEditor({ listId, initialName, initialFilters, certifications, back, initialAutoRequest, seerrConnected }: Props) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [f, setF] = useState<SmartFilters>(initialFilters);
  const [autoRequest, setAutoRequest] = useState(initialAutoRequest);
  const [open, setOpen] = useState<Fold | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, startPreview] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(0);

  const set = (patch: Partial<SmartFilters>) => setF((current) => ({ ...current, ...patch }));

  // The preview: the same question as Save would store, asked a moment after
  // the last change; an answer to an older question is dropped on arrival.
  useEffect(() => {
    const ticket = ++asked.current;
    const timer = setTimeout(() => {
      startPreview(async () => {
        const answer = await previewSmartList(f);
        if (ticket === asked.current) setPreview(answer);
      });
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [f]);

  const summaries = foldSummaries(f);
  // What the live preview matches: shown out of the query's whole total, not
  // the sixty a saved list keeps. Nothing while TMDB has not answered.
  // "12 of 48 match", its figures counting to a new answer rather than jumping (`Count on="change"`).
  const matched = preview?.ok ? <MatchLine shown={preview.items.length} total={preview.total} /> : null;
  const saveLabel = listId ? "Save changes" : "Save list";
  const notes = [preview?.trendingNote, preview?.tvNote].filter((n): n is string => Boolean(n));

  function save() {
    setError(null);
    startSave(async () => {
      const result = await saveSmartListAction(listId, name, f, seerrConnected ? autoRequest : undefined);
      if ("error" in result) setError(result.error);
      else router.push(`/lists/${result.id}`);
    });
  }

  const fold = (key: Fold) => ({ open: open === key, onToggle: () => setOpen((o) => (o === key ? null : key)) });

  const filters = (
    <>
      <FoldRow label="What" value={summaries.what} {...fold("what")}>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={f.kind === k.value}
              // A status the new kind has no such thing as goes with the switch.
              onClick={() => setF((current) => withKind(current, k.value))}
              className={smallChip(f.kind === k.value)}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SOURCES.map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={f.source === s.value}
              title={s.blurb}
              onClick={() => set({ source: s.value })}
              className={smallChip(f.source === s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs text-ink-3">{SOURCES.find((s) => s.value === f.source)?.blurb}</p>
      </FoldRow>

      <FoldRow label="Genre" value={summaries.genre} {...fold("genre")}>
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

      <FoldRow label="Services" value={summaries.services} {...fold("services")}>
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
        {f.providers.length > 1 && <p className="m-0 text-xs text-ink-3">Streaming on any one of them.</p>}
      </FoldRow>

      <FoldRow label="People" value={summaries.people} {...fold("people")}>
        <PeoplePicker picks={f.cast} onChange={(cast) => set({ cast })} />
      </FoldRow>

      <FoldRow label="Status" value={summaries.status} {...fold("status")}>
        <div className="flex flex-wrap gap-1.5">
          {statusesFor(f.kind).map((s) => (
            <button
              key={s.value}
              type="button"
              aria-pressed={f.statuses.includes(s.value)}
              onClick={() => set({ statuses: toggleIn(f.statuses, s.value) })}
              className={smallChip(f.statuses.includes(s.value))}
            >
              {s.label}
              {f.kind === "both" && <span className="font-mono text-[10px] uppercase opacity-60">{s.applies === "tv" ? "shows" : "films"}</span>}
            </button>
          ))}
        </div>
      </FoldRow>

      <FoldRow label="Certificate" value={summaries.certificate} {...fold("certificate")}>
        <div className="flex flex-wrap gap-1.5">
          {certifications.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={f.certifications.includes(c)}
              onClick={() => set({ certifications: toggleIn(f.certifications, c) })}
              className={smallChip(f.certifications.includes(c))}
            >
              {c}
            </button>
          ))}
        </div>
        <p className="m-0 text-xs text-ink-3">Films only: TMDB keeps no certificates for television.</p>
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
        {f.mode === "advanced" ? (
          <>
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
              label="Length"
              min={0}
              max={RUNTIME_CEILING}
              step={10}
              value={[f.runtimeMin, f.runtimeMax]}
              format={lengthLabel}
              onChange={([runtimeMin, runtimeMax]) => set({ runtimeMin, runtimeMax })}
            />
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Decade"
              value={f.decade === null ? "" : String(f.decade)}
              onChange={(v) => set({ decade: v ? Number(v) : null })}
              options={[["", "Any"], ...DECADES.map((d) => [String(d), `${d}s`] as [string, string])]}
            />
            <Select
              label="Length"
              value={f.maxRuntime === null ? "" : String(f.maxRuntime)}
              onChange={(v) => set({ maxRuntime: v ? Number(v) : null })}
              options={[["", "Any"], ...MAX_LENGTHS.map((m) => [String(m), `Under ${lengthLabel(m)}`] as [string, string])]}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <ToggleRow label="Leave out what I have seen" on={f.hideWatched} onChange={(hideWatched) => set({ hideWatched })} />
        <ToggleRow label="Leave out what is already on a list" on={f.hideSaved} onChange={(hideSaved) => set({ hideSaved })} />
        {seerrConnected && (
          <ToggleRow
            label="Auto-request new titles"
            hint="Each morning's rebuild asks Overseerr for what is new on the list, unseen and not on Plex, twenty a day at most. Titles already streaming on a service you pay for are skipped."
            on={autoRequest}
            onChange={setAutoRequest}
          />
        )}
      </div>
    </>
  );

  const readback = (
    <p className="m-0 font-display text-base font-medium leading-[1.4] text-ink-2">
      {sentence(f).map((p, i) => (p.strong ? <strong key={i} className="font-semibold text-ink">{p.text}</strong> : <span key={i}>{p.text}</span>))}
    </p>
  );

  const modeSwitch = (
    <div className="flex items-center justify-between lg:pt-1.5">
      <span className="mono-label">Filters</span>
      <div role="radiogroup" aria-label="Filter mode" className={SEGMENT_TRACK}>
        <SegmentPill className={SEGMENT_TRACK_PILL} />
        {(["simple", "advanced"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={f.mode === m}
            data-segment=""
            data-on={f.mode === m ? "" : undefined}
            onClick={() => set({ mode: m })}
            className={segmentOption}
          >
            {m === "simple" ? "Simple" : "Advanced"}
          </button>
        ))}
      </div>
    </div>
  );

  const nameField = <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Horror on Netflix, 70%+" />;
  const title = listId ? "Edit smart list" : "New smart list";
  const backButton = <Back href={back} name={listId ? initialName : "Lists"} />;
  const canSave = Boolean(name.trim()) && !saving;
  const items = preview?.items ?? [];
  const faded = previewing ? "opacity-60" : "";
  // Which answer the preview shows: a new one crosses over the last (`Swap`).
  const answer = items.map((i) => `${i.mediaType}-${i.tmdbId}`).join(",");

  return (
    <>
      {/* Phones */}
      <div className="flex flex-col lg:hidden">
        <div className="px-5 pb-2">
          <BackHeader back={backButton} title={title} />
        </div>
        <div className="sticky top-0 z-(--z-top-row) flex flex-col gap-2.5 bg-bg px-5 pb-3 pt-1">
          <div className="flex items-baseline justify-between">
            <span className="mono-label">Preview</span>
            {matched && <span className="mono-label text-accent-text">{matched}</span>}
          </div>
          <Swap id={answer} mode="crossfade">
          <div className={`no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 transition-opacity duration-(--fast) ease-out ${faded}`}>
            {items.length
              ? items.map((i) => (
                  <Poster
                    key={`${i.mediaType}-${i.tmdbId}`}
                    path={i.poster}
                    alt={i.title}
                    title={i.title}
                    width={72}
                    height={108}
                    sizes="72px"
                    className="h-[108px] w-[72px] rounded-lg"
                  />
                ))
              : Array.from({ length: 5 }, (_, n) => <span key={n} className="block h-[108px] w-[72px] shrink-0 rounded-lg bg-surface-2" />)}
          </div>
          </Swap>
          <PreviewState preview={preview} previewing={previewing} />
        </div>
        <div className="flex flex-col gap-2.5 px-5 pb-28">
          {nameField}
          {readback}
          {modeSwitch}
          {filters}
          {notes.map((n) => (
            <p key={n} className="m-0 text-xs text-ink-3">
              {n}
            </p>
          ))}
          {error && <p className="m-0 text-[13px] text-ink-2">{error}</p>}
        </div>
        {/* A solid page-colour bar under the button, faded in over its top 24px, so
            the controls scrolling beneath never show through it (they did through
            the disabled button's translucency). */}
        <div className="fixed inset-x-0 bottom-0 z-(--z-tab-bar) bg-[linear-gradient(to_bottom,transparent,var(--bg)_24px)] px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-6">
          <button type="button" disabled={!canSave} onClick={save} className={`${buttonClass("primary", "md")} h-[50px] w-full`}>
            <Icon name="check" size={18} />
            {saving ? "Saving…" : saveLabel}
          </button>
        </div>
      </div>

      {/* Desktop */}
      {/*
        The way back alone on the first row, as BackHeader has it, then the two
        columns on one grid row aligned by first baseline: the title's and the
        preview heading's, so the columns start level whatever their sizes.
        (BackHeader itself cannot be used here: its back row would be the left
        column's first baseline.)
      */}
      <div className="hidden grid-cols-[460px_minmax(0,1fr)] items-baseline gap-x-10 gap-y-4 px-10 pt-7 lg:grid">
        <div className="col-span-2 flex items-center">{backButton}</div>
        <div className="flex flex-col gap-3.5">
          <h1 className="m-0 font-display text-[30px] font-bold leading-[1.05] tracking-[-0.025em]">{title}</h1>
          {nameField}
          {readback}
          {modeSwitch}
          <div className="flex flex-col">{filters}</div>
          {error && <p className="m-0 text-[13px] text-ink-2">{error}</p>}
          <div className="flex gap-2 pt-1.5">
            <button type="button" disabled={!canSave} onClick={save} className={`${buttonClass("primary", "md")} h-[46px]`}>
              <Icon name="check" size={18} />
              {saving ? "Saving…" : saveLabel}
            </button>
            <Link href={back} className={`${buttonClass("ghost", "md")} h-[46px]`}>
              Discard
            </Link>
          </div>
        </div>

        <div className="sticky top-7 flex min-w-0 flex-col gap-3.5">
          <div className="flex items-baseline gap-3">
            <h2 className="m-0 font-display text-[22px] font-bold leading-[1.05] tracking-[-0.025em]">Preview</h2>
            <span className="mono-label">
              {matched ? <>{matched} · re-runs on every change</> : "re-runs on every change"}
            </span>
          </div>
          <Swap id={answer} mode="crossfade">
          <div className={`grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-3 transition-opacity duration-(--fast) ease-out ${faded}`}>
            {items.map((i) => (
              <div key={`${i.mediaType}-${i.tmdbId}`} className="flex min-w-0 flex-col gap-1.5">
                <span className="relative block aspect-[2/3] overflow-hidden rounded-[10px] shadow-elevation">
                  <Poster path={i.poster} alt="" title={i.title} width={122} height={183} sizes="122px" className="size-full" />
                  {i.score > 0 && (
                    <span className="absolute right-1.5 top-1.5 flex">
                      <ArtChip small>{i.score}%</ArtChip>
                    </span>
                  )}
                </span>
                <span className="truncate text-xs font-semibold">{i.title}</span>
              </div>
            ))}
          </div>
          </Swap>
          <PreviewState preview={preview} previewing={previewing} />
          {notes.map((n) => (
            <span key={n} className="text-xs text-ink-3">
              {n}
            </span>
          ))}
        </div>
      </div>
    </>
  );
}

/** `matchLine`'s words, the figures as counts that move when a new answer changes them. */
function MatchLine({ shown, total }: { shown: number; total: number }) {
  return (
    <>
      <Count to={shown} on="change" /> of {total > MATCH_CAP ? `${MATCH_CAP}+` : <Count to={total} on="change" />} match
    </>
  );
}

function PreviewState({ preview, previewing }: { preview: Preview | null; previewing: boolean }) {
  if (!preview) return previewing ? <span className="text-xs text-ink-3">Asking TMDB…</span> : null;
  if (!preview.ok) return <span className="text-xs text-ink-3">TMDB could not be reached, so there is nothing to preview. Saving still works.</span>;
  if (preview.count === 0) return <span className="text-xs text-ink-3">Nothing matches. Loosen a filter or two.</span>;
  return null;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="mono-label">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-[46px] w-full rounded-xl border border-line bg-surface px-3 text-[15px] text-ink outline-none focus:border-ink-3"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

/** People: a name search a moment after typing stops, and the chosen as chips. Five at most. */
function PeoplePicker({ picks, onChange }: { picks: SmartFilters["cast"]; onChange: (p: SmartFilters["cast"]) => void }) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: number; name: string; department: string | null }[]>([]);
  const [, startSearch] = useTransition();
  const asked = useRef(0);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const ticket = ++asked.current;
    const timer = setTimeout(() => {
      startSearch(async () => {
        const people = await findPeople(term);
        if (ticket === asked.current) setFound(people);
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const shown = query.trim().length < 2 ? [] : found.filter((p) => !picks.some((c) => c.id === p.id));

  return (
    <div className="flex flex-col gap-2">
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {picks.map((p) => (
            <button key={p.id} type="button" aria-label={`Remove ${p.name}`} onClick={() => onChange(picks.filter((c) => c.id !== p.id))} className={smallChip(true)}>
              {p.name}
              <Icon name="x" size={13} />
            </button>
          ))}
        </div>
      )}
      {picks.length < 5 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an actor or director"
          aria-label="Search for a person"
          className="h-10 w-full rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-ink-3"
        />
      )}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {shown.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange([...picks, { id: p.id, name: p.name }]);
                setQuery("");
              }}
              className={smallChip(false)}
            >
              <Icon name="plus" size={13} />
              {p.name}
              {p.department && <span className="font-mono text-[10px] uppercase text-ink-3">{p.department === "Acting" ? "actor" : p.department}</span>}
            </button>
          ))}
        </div>
      )}
      <p className="m-0 text-xs text-ink-3">Films only: TMDB cannot look for people in shows. Everyone chosen must be in it.</p>
    </div>
  );
}
