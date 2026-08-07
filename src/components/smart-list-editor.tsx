"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  Calendar,
  ChevronDown,
  Clapperboard,
  EyeOff,
  Film,
  Loader2,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Tags,
  Tv,
} from "lucide-react";
import { img } from "@/lib/images";
import { createList, previewSmartList, updateSmartList } from "@/lib/list-actions";
import { GENRES, findGenre } from "@/lib/genres";
import type { Provider } from "@/lib/providers";
import {
  DECADES,
  DEFAULT_FILTERS,
  RUNTIME_CEILING,
  RUNTIME_FLOOR,
  SOURCES,
  STATUSES,
  YEAR_CEILING,
  YEAR_FLOOR,
  describeFilters,
  runtimeBounds,
  yearBounds,
  type SmartFilters,
  type SmartKind,
} from "@/lib/smart-filters";
import type { NormalisedItem } from "@/lib/tmdb";
import { ScoreBadge } from "./media-card";
import { RangeSlider } from "./range-slider";

/**
 * Building a standing question, with the answer visible the whole time.
 *
 * The preview is the entire point of this screen, so it is not a "run" button:
 * every change re-runs the query and redraws the posters. It stays on screen at
 * every width — pinned across the top on a phone, beside the controls on a
 * desktop — the previous results stay up while the new ones are fetched rather
 * than blanking, and the panel says how many came back, because "eleven
 * matches" is the fact that tells you whether the filters are too tight.
 *
 * Everything below the name is folded away by default, one section at a time,
 * each showing what it currently holds on its own closed header. Laid out flat
 * this is nine controls and about sixty chips, which is a wall rather than a
 * form: the fold turns it into six lines you can read in a glance, and you open
 * only the one you came to change. The summaries are what make that work — a
 * closed section that did not say "Sci-fi, Thriller" would just be hiding
 * things.
 *
 * `previewSmartList` runs the same query the saved list will. That has to stay
 * true: a preview of a different query is worse than no preview at all.
 */

/** Long enough that dragging a slider is one request, short enough to feel live. */
const DEBOUNCE_MS = 260;

const RUNTIME_CHOICES = [
  { value: "", label: "Any length" },
  { value: "95", label: "Under 95m" },
  { value: "120", label: "Under 2h" },
  { value: "150", label: "Under 2h30" },
];

const KIND_LABELS: Record<SmartKind, string> = {
  movie: "Films",
  tv: "Shows",
  both: "Films & shows",
};

export function SmartListEditor({
  initialName,
  initialFilters,
  /** Set when editing; absent when making a new one. */
  listId,
  providers,
  certifications,
  region,
}: {
  initialName: string;
  initialFilters: SmartFilters;
  listId?: string;
  providers: Provider[];
  certifications: string[];
  region: string;
}) {
  const [name, setName] = useState(initialName);
  const [filters, setFilters] = useState<SmartFilters>(initialFilters);
  const [items, setItems] = useState<NormalisedItem[]>([]);
  const [missingTv, setMissingTv] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const router = useRouter();

  // Answers can come back out of order — a broad query started first will
  // outlive the narrow one typed after it. Only the newest is allowed to land.
  const run = useRef(0);

  useEffect(() => {
    const ticket = ++run.current;

    const timer = setTimeout(async () => {
      const result = await previewSmartList(filters).catch(() => null);
      if (ticket !== run.current) return;

      setItems(result?.items ?? []);
      setMissingTv(result?.genresWithoutTv ?? []);
      setLoading(false);
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [filters]);

  /**
   * Every change to the question goes through here, and every one of them puts
   * the preview into its loading state.
   *
   * Marked here rather than inside the effect that does the fetching: setting
   * state from an effect body schedules a second render for something already
   * known at the moment the user pressed the control. It also reads better —
   * "you changed it, so what is on screen is now out of date" is a fact about
   * the press, not about the request that follows it.
   */
  function patch(changes: Partial<SmartFilters>) {
    setLoading(true);
    setFilters((current) => ({ ...current, ...changes }));
  }

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the list a name");
      return;
    }

    startSaving(async () => {
      const result = listId
        ? await updateSmartList({ listId, name: trimmed, filters })
        : await createList({ name: trimmed, kind: "smart", filters });

      if (!result.ok) {
        setError(result.error);
        return;
      }

      router.push(`/watchlist/list/${result.id}`);
    });
  }

  const wantsTv = filters.kind !== "movie";
  const wantsFilms = filters.kind !== "tv";
  const statuses = STATUSES.filter(
    (status) => (status.applies === "tv" && wantsTv) || (status.applies === "movie" && wantsFilms),
  );
  const showCertifications = wantsFilms && certifications.length > 0;

  const genreNames = filters.genres.map((slug) => findGenre(slug)?.label ?? slug);
  const providerNames = providers
    .filter((provider) => filters.providers.includes(provider.id))
    .map((provider) => provider.name);

  const years = yearBounds(filters);
  const runtimes = runtimeBounds(filters);

  const rangeSummary = [
    filters.scoreMin > 0 || filters.scoreMax < 100
      ? `${filters.scoreMin}–${filters.scoreMax}%`
      : null,
    years.from !== null && years.to === years.from + 9
      ? `${years.from}s`
      : years.from !== null || years.to !== null
        ? `${years.from ?? YEAR_FLOOR}–${years.to ?? YEAR_CEILING}`
        : null,
    runtimes.max !== null && runtimes.min === null
      ? `under ${runtimes.max}m`
      : runtimes.min !== null || runtimes.max !== null
        ? `${runtimes.min ?? 0}–${runtimes.max ?? RUNTIME_CEILING}m`
        : null,
  ].filter(Boolean);

  const leaveOutSummary = [
    filters.hideWatched ? "seen" : null,
    filters.hideSaved ? "already saved" : null,
  ].filter(Boolean);

  const detailCount = filters.statuses.length + filters.certifications.length;

  return (
    <div className="mt-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      {/* ==================================================================
          The answer.

          First in the DOM so that on a phone it is pinned above the controls
          you are turning; on a desktop it moves to the right column and sticks
          there while the filters scroll past it. Either way it never leaves the
          screen, which is the only thing that makes "live" mean anything.
          ================================================================== */}
      {/* Sticky at every width, and `top-*` is the only thing that changes with
          it — `relative` here would have shifted the panel 80px down the page
          in normal flow, leaving its top edge below the name card it is
          supposed to sit level with. Sticky offsets nothing until you scroll,
          which is exactly the difference. It sticks inside a grid column
          because the grid is `items-start`: the item is content-height, but its
          grid *area* is the full row, and that is what sticky travels within. */}
      <div className="sticky top-16 z-20 -mx-4 mb-5 border-b border-ink-800/70 bg-ink-950/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-20 lg:order-last lg:mx-0 lg:mb-0 lg:overflow-hidden lg:rounded-2xl lg:border lg:border-ink-800 lg:bg-ink-900/40 lg:px-5 lg:py-5 lg:backdrop-blur-none">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            {/* A quiet pulse while a query is out, steady when it has landed —
                the smallest possible way to say "this is live". */}
            <span
              className={`h-1.5 w-1.5 rounded-full transition ${
                loading ? "animate-pulse bg-flare-400" : "bg-fresh-500"
              }`}
              aria-hidden
            />
            {loading ? "Finding matches…" : items.length === 0 ? "No matches" : "Preview"}
          </h2>
          {items.length > 0 && (
            <span className="rounded-full border border-ink-700 px-2 py-0.5 font-mono text-[11px] tabular-nums text-ink-300">
              {items.length === 20 ? "top 20" : items.length}
            </span>
          )}
        </div>

        {/* A horizontal strip on a phone, a grid on a desktop — the same
            markup, because duplicating it is how the two drift apart. Held at
            partial opacity while a new answer is on its way, so a change you
            just made is visibly being acted on rather than appearing to have
            done nothing. */}
        <div
          className={`mt-3 flex gap-2.5 overflow-x-auto pb-1 transition-opacity duration-200 lg:grid lg:grid-cols-4 lg:gap-3 lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden ${
            loading ? "opacity-40" : "opacity-100"
          }`}
          style={{ scrollbarWidth: "none" }}
        >
          {items.map((item) => (
            <Link
              key={`${item.mediaType}-${item.id}`}
              href={`/title/${item.mediaType}/${item.id}`}
              title={item.title}
              className="group w-[76px] shrink-0 lg:w-auto"
            >
              <div className="relative aspect-2/3 overflow-hidden rounded-lg border border-ink-700/60 bg-ink-800">
                {img.poster(item.poster) ? (
                  <Image
                    src={img.poster(item.poster)!}
                    alt=""
                    fill
                    sizes="120px"
                    className="object-cover md:transition md:duration-500 md:group-hover:scale-105"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-ink-600">
                    {item.mediaType === "tv" ? <Tv size={18} /> : <Film size={18} />}
                  </div>
                )}
                <div className="absolute inset-x-1 bottom-1 origin-bottom-left scale-90">
                  <ScoreBadge score={item.score} />
                </div>
              </div>
              <p className="mt-1 line-clamp-1 text-[11px] text-ink-300">{item.title}</p>
            </Link>
          ))}

          {items.length === 0 && !loading && (
            <p className="py-6 text-sm text-ink-400 lg:col-span-4">
              Nothing on TMDB fits all of these at once. Widening the score, the years or the
              services is usually enough.
            </p>
          )}
        </div>

        {missingTv.length > 0 && (
          <p className="mt-2.5 text-[11px] text-ember-400">
            TMDB has no television equivalent for{" "}
            {missingTv.map((slug) => findGenre(slug)?.label ?? slug).join(", ")}, so this list is
            films only.
          </p>
        )}

        <p className="mt-3 hidden border-t border-ink-800 pt-3 text-[11px] text-ink-500 lg:block">
          The saved list keeps sixty titles and rebuilds itself once a day.
        </p>
      </div>

      {/* ==================================================================
          The question.
          ================================================================== */}
      <div className="space-y-3">
        {/* The name, given a card of its own and the largest type on the page.
            It is the one thing here that is not a filter, and the sentence
            underneath is the whole question read back in words — which is what
            you check before saving, rather than re-reading six sections. */}
        <div className="relative overflow-hidden rounded-2xl border border-ink-800 bg-ink-900/40 p-5">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-24 -right-20 h-52 w-52 rounded-full bg-flare-600/20 blur-3xl"
          />
          <div className="relative">
            <label
              htmlFor="smart-list-name"
              className="text-[11px] font-medium tracking-wider text-ink-400 uppercase"
            >
              List name
            </label>
            <input
              id="smart-list-name"
              value={name}
              maxLength={60}
              placeholder="Nineties sci-fi I have not seen"
              onChange={(event) => {
                setName(event.target.value);
                setError(null);
              }}
              className="mt-1 w-full bg-transparent text-xl font-semibold tracking-tight text-ink-100 outline-none placeholder:text-ink-600"
            />
            <p className="mt-2.5 flex items-start gap-2 border-t border-ink-800 pt-2.5 text-xs text-ink-400">
              <Sparkles size={13} className="mt-px shrink-0 text-flare-400" />
              <span>{describeFilters(filters, (slug) => findGenre(slug)?.label ?? slug)}</span>
            </p>
          </div>
        </div>

        <Section
          icon={Clapperboard}
          label="What to include"
          summary={`${KIND_LABELS[filters.kind]} · ${
            SOURCES.find((s) => s.value === filters.source)?.label ?? "Anything"
          }`}
          active={filters.kind !== DEFAULT_FILTERS.kind || filters.source !== DEFAULT_FILTERS.source}
          defaultOpen
        >
          <Row label="Medium">
            <Segmented
              options={[
                { value: "movie", label: "Films" },
                { value: "tv", label: "Shows" },
                { value: "both", label: "Both" },
              ]}
              value={filters.kind}
              onChange={(kind) => patch({ kind: kind as SmartKind })}
            />
          </Row>

          <Row label="What kind of thing" hint="How the catalogue is ranked before filtering.">
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((source) => (
                <Chip
                  key={source.value}
                  on={filters.source === source.value}
                  title={source.blurb}
                  onClick={() => patch({ source: source.value })}
                >
                  {source.label}
                </Chip>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">
              {filters.source === "trending"
                ? "Trending is TMDB's own weekly ranking, which takes no filters — genre, score and years are applied to what comes back, and length and services cannot be."
                : SOURCES.find((s) => s.value === filters.source)?.blurb}
            </p>
          </Row>
        </Section>

        <Section
          icon={Tags}
          label="Genre"
          summary={genreNames.length > 0 ? genreNames.join(", ") : "Any genre"}
          count={filters.genres.length}
          active={filters.genres.length > 0}
        >
          <p className="mb-2.5 text-[11px] text-ink-500">Every genre picked has to match.</p>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((genre) => (
              <Chip
                key={genre.slug}
                on={filters.genres.includes(genre.slug)}
                onClick={() => patch({ genres: toggleIn(filters.genres, genre.slug) })}
              >
                {genre.label}
              </Chip>
            ))}
          </div>
        </Section>

        <Section
          icon={MonitorPlay}
          label="Where to watch"
          summary={providerNames.length > 0 ? providerNames.join(", ") : "Anywhere"}
          count={filters.providers.length}
          active={filters.providers.length > 0}
        >
          <p className="mb-2.5 text-[11px] text-ink-500">
            Streaming in {region}. Any one of them will do.
          </p>
          <div className="flex flex-wrap gap-2">
            {providers.map((provider) => (
              <Chip
                key={provider.id}
                on={filters.providers.includes(provider.id)}
                onClick={() => patch({ providers: toggleIn(filters.providers, provider.id) })}
              >
                {provider.name}
              </Chip>
            ))}
          </div>
        </Section>

        {(statuses.length > 0 || showCertifications) && (
          <Section
            icon={ShieldCheck}
            label="Status and classification"
            summary={
              detailCount === 0
                ? "Any status, any rating"
                : [
                    ...filters.statuses.map(
                      (slug) => STATUSES.find((s) => s.value === slug)?.label ?? slug,
                    ),
                    ...filters.certifications,
                  ].join(", ")
            }
            count={detailCount}
            active={detailCount > 0}
          >
            {statuses.length > 0 && (
              <Row label="Production status">
                <div className="flex flex-wrap gap-2">
                  {statuses.map((status) => (
                    <Chip
                      key={status.value}
                      on={filters.statuses.includes(status.value)}
                      title={status.applies === "tv" ? "Shows only" : "Films only"}
                      onClick={() => patch({ statuses: toggleIn(filters.statuses, status.value) })}
                    >
                      {status.label}
                    </Chip>
                  ))}
                </div>
              </Row>
            )}

            {showCertifications && (
              <Row
                label="Classification"
                hint={`${region} ratings. TMDB only carries these for films.`}
              >
                <div className="flex flex-wrap gap-2">
                  {certifications.map((certification) => (
                    <Chip
                      key={certification}
                      on={filters.certifications.includes(certification)}
                      onClick={() =>
                        patch({
                          certifications: toggleIn(filters.certifications, certification),
                        })
                      }
                    >
                      {certification}
                    </Chip>
                  ))}
                </div>
              </Row>
            )}
          </Section>
        )}

        <Section
          icon={Calendar}
          label="Score, years and length"
          summary={rangeSummary.length > 0 ? rangeSummary.join(" · ") : "No limits"}
          count={rangeSummary.length}
          active={rangeSummary.length > 0}
          /* The mode switch belongs on the header rather than inside: it is
             about how this section asks its questions, and putting it here
             means you can flip it without opening anything. */
          aside={
            <Segmented
              small
              options={[
                { value: "simple", label: "Simple" },
                { value: "advanced", label: "Advanced" },
              ]}
              value={filters.mode}
              onChange={(mode) => patch({ mode: mode as "simple" | "advanced" })}
            />
          }
        >
          <div className="space-y-5">
            <RangeSlider
              label="Audience score"
              min={0}
              max={100}
              step={5}
              value={[filters.scoreMin, filters.scoreMax]}
              onChange={([scoreMin, scoreMax]) => patch({ scoreMin, scoreMax })}
              format={(value) => `${value}%`}
            />

            {filters.mode === "advanced" ? (
              <>
                {/* In advanced mode the decade and the length stop being a pair
                    of dropdowns and become sliders of the same kind as the score
                    above — which is the point of the mode: three questions asked
                    the same way, instead of one slider and two menus. */}
                <RangeSlider
                  label="Years"
                  min={YEAR_FLOOR}
                  max={YEAR_CEILING}
                  value={[filters.yearMin, filters.yearMax]}
                  onChange={([yearMin, yearMax]) => patch({ yearMin, yearMax })}
                />
                <RangeSlider
                  label="Runtime"
                  min={RUNTIME_FLOOR}
                  max={RUNTIME_CEILING}
                  step={5}
                  value={[filters.runtimeMin, filters.runtimeMax]}
                  onChange={([runtimeMin, runtimeMax]) => patch({ runtimeMin, runtimeMax })}
                  format={(value) => `${value}m`}
                  maxLabel="any"
                />
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm text-ink-300">
                  Decade
                  <select
                    value={filters.decade === null ? "" : String(filters.decade)}
                    onChange={(event) =>
                      patch({ decade: event.target.value ? Number(event.target.value) : null })
                    }
                    className="mt-1.5 w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-sm text-ink-100 light:bg-white"
                  >
                    <option value="">Any decade</option>
                    {DECADES.map((year) => (
                      <option key={year} value={String(year)}>
                        {year}s
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-sm text-ink-300">
                  Runtime
                  <select
                    value={filters.maxRuntime === null ? "" : String(filters.maxRuntime)}
                    onChange={(event) =>
                      patch({ maxRuntime: event.target.value ? Number(event.target.value) : null })
                    }
                    className="mt-1.5 w-full rounded-lg border border-ink-700 bg-ink-900 px-2.5 py-2 text-sm text-ink-100 light:bg-white"
                  >
                    {RUNTIME_CHOICES.map((option) => (
                      <option key={option.label} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </div>
        </Section>

        <Section
          icon={EyeOff}
          label="Leave out"
          summary={
            leaveOutSummary.length > 0 ? `Hiding what I have ${leaveOutSummary.join(" and ")}` : "Nothing"
          }
          count={leaveOutSummary.length}
          active={leaveOutSummary.length > 0}
        >
          <div className="space-y-2.5">
            <Toggle
              on={filters.hideWatched}
              onChange={(hideWatched) => patch({ hideWatched })}
              label="Things I have already seen"
            />
            <Toggle
              on={filters.hideSaved}
              onChange={(hideSaved) => patch({ hideSaved })}
              label="Things already on my watchlist or another list"
            />
          </div>
        </Section>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {/* Pinned to the bottom of the viewport on a phone, where the sections
            above are long enough that a button at the end of them is a scroll
            away from wherever you happen to be. */}
        <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t border-ink-800/70 bg-ink-950/85 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pt-2 lg:pb-8 lg:backdrop-blur-none">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="inline-flex items-center gap-2 rounded-xl bg-flare-600 px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_28px_-10px] shadow-flare-600/80 transition active:scale-[0.98] hover:bg-flare-500 disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {listId ? "Save changes" : "Create list"}
          </button>

          <button
            type="button"
            onClick={() => {
              setLoading(true);
              // The mode survives a reset: it is how you like to be asked, not
              // part of the question being reset.
              setFilters({ ...DEFAULT_FILTERS, mode: filters.mode });
            }}
            className="text-sm text-ink-400 transition hover:text-ink-100"
          >
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * One folded group of controls.
 *
 * Native `<details>` rather than a `useState` accordion: it arrives with the
 * keyboard behaviour, the focus handling and the expanded/collapsed
 * announcement already correct, and there is no state here worth owning. The
 * only work left is hiding the default marker and turning the chevron.
 */
function Section({
  icon: Icon,
  label,
  summary,
  count,
  active = false,
  defaultOpen = false,
  aside,
  children,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  /** What this section currently holds, read on the closed header. */
  summary: string;
  /** How many choices are made in here, when that is a number worth showing. */
  count?: number;
  active?: boolean;
  defaultOpen?: boolean;
  /** A control that belongs on the header rather than inside the fold. */
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className={`card group overflow-hidden transition ${
        active ? "border-flare-500/35" : ""
      }`}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition hover:bg-ink-800/40 [&::-webkit-details-marker]:hidden">
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl border transition ${
            active
              ? "border-flare-500/45 bg-flare-600/20 text-flare-300"
              : "border-ink-700 bg-ink-800/50 text-ink-400"
          }`}
        >
          <Icon size={16} />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-sm font-medium text-ink-100">
            {label}
            {count !== undefined && count > 0 && (
              <span className="rounded-full bg-flare-600/25 px-1.5 py-px font-mono text-[10px] tabular-nums text-flare-300">
                {count}
              </span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-400">{summary}</span>
        </span>

        {/* Stops a press on the switch from folding the section under it. */}
        {aside && (
          <span
            onClick={(event) => event.preventDefault()}
            className="hidden shrink-0 sm:block"
          >
            {aside}
          </span>
        )}

        <ChevronDown
          size={16}
          className="shrink-0 text-ink-500 transition group-open:rotate-180"
        />
      </summary>

      <div className="border-t border-ink-800 px-4 py-4">
        {/* The header copy is hidden on a phone, so the control has to appear
            inside the fold as well or it would be unreachable there. */}
        {aside && <div className="mb-4 sm:hidden">{aside}</div>}
        {children}
      </div>
    </details>
  );
}

/** A labelled control inside an open section. */
function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-5 first:mt-0">
      <p className="text-xs font-medium tracking-wider text-ink-400 uppercase">{label}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>}
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Chip({
  on,
  onClick,
  title,
  children,
}: {
  on: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={on}
      className={`rounded-full border px-3 py-1.5 text-sm transition ${
        on
          ? "border-flare-500 bg-flare-600/25 text-flare-200 light:text-flare-700"
          : "border-ink-700 text-ink-300 hover:border-ink-600 hover:bg-ink-800 hover:text-ink-100"
      }`}
    >
      {children}
    </button>
  );
}

function Segmented({
  options,
  value,
  onChange,
  small = false,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  small?: boolean;
}) {
  return (
    <div className="inline-flex rounded-xl border border-ink-700 bg-ink-900/60 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-lg transition ${small ? "px-2.5 py-1 text-xs" : "px-3.5 py-1.5 text-sm"} ${
            value === option.value
              ? "bg-flare-600 font-medium text-white"
              : "text-ink-300 hover:bg-ink-800 hover:text-ink-100"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-300">
      <input
        type="checkbox"
        checked={on}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-flare-600"
      />
      {label}
    </label>
  );
}
