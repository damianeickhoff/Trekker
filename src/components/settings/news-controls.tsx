"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import type { OpenOn } from "@/lib/news-settings";
import { addNewsFeed, deleteNewsFeed, saveNewsFeed, saveNewsPush, saveNewsReading, saveNewsSource } from "@/lib/news-settings-actions";
import { Icon } from "../icon";
import { PRESS, SEGMENT_TRACK, SEGMENT_TRACK_PILL, segmentOption } from "../motion";
import { SegmentPill } from "../segment-pill";
import { buttonClass, iconButtonClass } from "../ui";
import { Problem, Switch, useSaved } from "./controls";
import { useSettingFact } from "./facts";

/*
 * Settings › News's controls (Round 10). Each shows its new state at once and
 * saves behind it, as every Settings control does; a save that fails puts the
 * old state back and says so. The sources are drawn twice from one state, as
 * the desktop's rows and the phone's chips, so the two never disagree.
 */

const FAILED = "That did not save. Try again in a moment.";

/** One of Settings › News's cards: on a desktop a card of its own with its title, on a phone a mono heading inside the one folded card. */
export function NewsCard({ title, meta, lede, children }: { title: string; meta?: ReactNode; lede?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col lg:rounded-[18px] lg:bg-surface lg:px-[18px] lg:pb-2 lg:pt-4 lg:shadow-elevation">
      <h3 className="mono-label m-0 pt-4 lg:hidden">{title}</h3>
      <div className="hidden items-baseline justify-between gap-3 lg:flex">
        <h3 className="m-0 font-display text-lg font-bold tracking-[-0.025em]">{title}</h3>
        {meta && <span className="mono-label">{meta}</span>}
      </div>
      {lede && <p className="m-0 hidden pb-1 pt-1 text-xs text-ink-3 lg:block">{lede}</p>}
      <div className="flex min-w-0 flex-col lg:[&>:last-child]:border-b-0">{children}</div>
    </section>
  );
}

/**
 * A row whose control is a segmented one: beside its label from `lg`, as
 * Settings' rows are, but under it on a phone, where label and track side by
 * side would squeeze "7 days" onto two lines.
 */
export function StackedRow({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-14 min-w-0 flex-col items-start gap-2 border-b border-line py-2.5 lg:flex-row lg:items-center lg:gap-3 lg:py-2">
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-semibold">{label}</span>
        {sub && <span className="text-xs text-ink-3">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

type Source = { name: string; enabled: boolean };
type Own = { id: string; url: string; name: string; enabled: boolean };

const CAP = 10;

/**
 * The Sources card: a switch per source name the instance reads, and under them
 * the person's own feeds, each with its switch and a cross that removes it
 * (and its headlines), then the field to add one. On a phone the same, as
 * chips, own feeds among them, the field under them.
 */
export function NewsSources({ initialSources, initialFeeds }: { initialSources: Source[]; initialFeeds: Own[] }) {
  const [sources, setSources] = useState(initialSources);
  const [feeds, setFeeds] = useState(initialFeeds);
  // A newer server answer wins, as in `useSaved`: a reload painted from the worker's cache is re-read after paint.
  const [seen, setSeen] = useState(() => JSON.stringify([initialSources, initialFeeds]));
  const fresh = JSON.stringify([initialSources, initialFeeds]);
  if (seen !== fresh) {
    setSeen(fresh);
    setSources(initialSources);
    setFeeds(initialFeeds);
  }
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const on = sources.filter((s) => s.enabled).length + feeds.filter((f) => f.enabled).length;
  useSettingFact("newsSources", on);
  // Chips pressed on this visit: only their tick pops in, never the ones the page opened with.
  const [pressed, setPressed] = useState<ReadonlySet<string>>(new Set());
  const press = (key: string) => setPressed((p) => new Set(p).add(key));

  const toggleSource = (name: string, chip = false) => {
    if (chip) press(name);
    const before = sources;
    const next = sources.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s));
    setSources(next);
    setError(null);
    start(async () => {
      const outcome = await saveNewsSource(name, next.find((s) => s.name === name)!.enabled).catch(() => ({ ok: false as const, error: FAILED }));
      if (!outcome.ok) {
        setSources(before);
        setError(outcome.error);
      }
    });
  };
  const toggleFeed = (id: string, chip = false) => {
    if (chip) press(id);
    const before = feeds;
    const next = feeds.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
    setFeeds(next);
    setError(null);
    start(async () => {
      const outcome = await saveNewsFeed(id, next.find((f) => f.id === id)!.enabled).catch(() => ({ ok: false as const, error: FAILED }));
      if (!outcome.ok) {
        setFeeds(before);
        setError(outcome.error);
      }
    });
  };
  const remove = (id: string) => {
    const before = feeds;
    setFeeds(feeds.filter((f) => f.id !== id));
    setError(null);
    start(async () => {
      const outcome = await deleteNewsFeed(id).catch(() => ({ ok: false as const, error: FAILED }));
      if (!outcome.ok) {
        setFeeds(before);
        setError(outcome.error);
      }
    });
  };

  const total = sources.length + feeds.length;
  return (
    <NewsCard title="Sources" meta={`${on} of ${total} on`} lede="Headline, source and link only; the article stays on their site.">
      {/* The desktop's rows. */}
      <div className="hidden flex-col lg:flex">
        {sources.map((s) => (
          <div key={s.name} className="flex min-h-[51px] items-center gap-3 border-b border-line py-2">
            <span className={`grow text-sm font-semibold ${s.enabled ? "text-ink" : "text-ink-3"}`}>{s.name}</span>
            <Switch on={s.enabled} label={`Read ${s.name}`} onToggle={() => toggleSource(s.name)} />
          </div>
        ))}
        {sources.length === 0 && <p className="m-0 border-b border-line py-3 text-xs text-ink-3">This instance reads no feeds of its own.</p>}
        <h4 className="mono-label m-0 pb-1 pt-5">Your own feeds</h4>
        {feeds.map((f) => (
          <div key={f.id} className="flex min-h-[61px] items-center gap-3 border-b border-line py-2">
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-2">
                <span className={`truncate text-sm font-semibold ${f.enabled ? "text-ink" : "text-ink-3"}`}>{f.name}</span>
                <YoursChip />
              </span>
              <span className="truncate text-[11px] text-ink-3">{f.url}</span>
            </span>
            <Switch on={f.enabled} label={`Read ${f.name}`} onToggle={() => toggleFeed(f.id)} />
            <button type="button" aria-label={`Remove ${f.name}`} onClick={() => remove(f.id)} className={iconButtonClass("ghost", "sm", "size-8! bg-surface-2! shadow-none!")}>
              <Icon name="x" size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* The phone's chips. */}
      <div className="flex flex-wrap gap-2 pb-1 pt-2 lg:hidden">
        {sources.map((s) => (
          <SourceChip key={s.name} name={s.name} on={s.enabled} pop={pressed.has(s.name)} onToggle={() => toggleSource(s.name, true)} />
        ))}
        {feeds.map((f) => (
          <SourceChip key={f.id} name={f.name} on={f.enabled} yours pop={pressed.has(f.id)} onToggle={() => toggleFeed(f.id, true)} />
        ))}
      </div>

      <AddFeed count={feeds.length} onAdded={(f) => setFeeds((all) => [...all, f])} />
      <Problem error={error} />
    </NewsCard>
  );
}

function YoursChip() {
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-md bg-accent px-[7px] font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-black">
      Yours
    </span>
  );
}

/** A phone's source chip: amber with a tick when read, since what you read is state; plain otherwise. */
function SourceChip({ name, on, yours = false, pop, onToggle }: { name: string; on: boolean; yours?: boolean; pop: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`Read ${name}${yours ? ", your own feed" : ""}`}
      onClick={onToggle}
      className={`${PRESS} inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-semibold ${
        on ? "border-transparent bg-accent text-black" : "border-line bg-transparent text-ink-2"
      }`}
    >
      {on && <Icon name="check" size={14} className={pop ? "motion-tick-in" : ""} />}
      {name}
      {yours && <span className="font-mono text-[9px] uppercase tracking-[0.05em] opacity-70">Yours</span>}
    </button>
  );
}

/**
 * Paste an RSS or Atom address and Add: the server reads it once, six
 * seconds at most, and keeps it only if it answered with a feed. Ten at most;
 * at the cap the field says so instead of taking another.
 */
function AddFeed({ count, onAdded }: { count: number; onAdded: (feed: Own) => void }) {
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const full = count >= CAP;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = address.trim();
    if (!url || pending || full) return;
    setError(null);
    start(async () => {
      const outcome = await addNewsFeed(url).catch(() => ({ ok: false as const, error: FAILED }));
      if (outcome.ok) {
        onAdded(outcome.feed);
        setAddress("");
      } else {
        setError(outcome.error);
      }
    });
  };
  return (
    <form onSubmit={submit} className="flex min-w-0 flex-col gap-2 pb-3 pt-3">
      <div className="flex min-w-0 items-center gap-2">
        <label className="flex h-10 min-w-0 grow items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 text-ink-3 focus-within:border-ink-3">
          <Icon name="link" size={16} className="shrink-0" />
          <input
            type="url"
            inputMode="url"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            disabled={full || pending}
            placeholder={full ? `${CAP} feeds: remove one to add another` : "Paste a feed address, RSS or Atom"}
            aria-label="Feed address"
            className="h-full min-w-0 grow border-0 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
        </label>
        <button type="submit" disabled={full || pending || !address.trim()} className={buttonClass("primary", "sm", "disabled:opacity-60")}>
          <Icon name="plus" size={16} />
          {pending ? "Reading…" : "Add"}
        </button>
      </div>
      {error ? (
        <span role="alert" className="text-xs text-ink-2">
          {error}
        </span>
      ) : (
        <span className="text-[11px] text-ink-3">
          {full ? `You have ${CAP} feeds, the most there is room for.` : "Read for you alone, on the same terms: headline, source and link."}
        </span>
      )}
    </form>
  );
}

/** "Open on": which chip News opens on without one in the address. */
export function OpenOnPicker({ initial }: { initial: OpenOn }) {
  const { value, error, save } = useSaved(initial);
  const options: [OpenOn, string][] = [
    ["for-you", "For you"],
    ["top", "Top"],
    ["last", "Last used"],
  ];
  return (
    <span className="flex flex-col items-end gap-1">
      <div role="radiogroup" aria-label="Open News on" className={SEGMENT_TRACK}>
        <SegmentPill className={SEGMENT_TRACK_PILL} />
        {options.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={value === id}
            data-segment=""
            data-on={value === id ? "" : undefined}
            onClick={() => value !== id && save(id, (v) => saveNewsReading("openOn", v))}
            className={`${segmentOption} whitespace-nowrap max-sm:px-2.5`}
          >
            {label}
          </button>
        ))}
      </div>
      <Problem error={error} />
    </span>
  );
}

/** "Keep stories for": seven days or thirty. */
export function KeepPicker({ initial }: { initial: number }) {
  const { value, error, save } = useSaved(initial === 7 ? 7 : 30);
  return (
    <span className="flex flex-col items-end gap-1">
      <div role="radiogroup" aria-label="Keep stories for" className={SEGMENT_TRACK}>
        <SegmentPill className={SEGMENT_TRACK_PILL} />
        {[7, 30].map((days) => (
          <button
            key={days}
            type="button"
            role="radio"
            aria-checked={value === days}
            data-segment=""
            data-on={value === days ? "" : undefined}
            onClick={() => value !== days && save(days, (v) => saveNewsReading("keepDays", v))}
            className={`${segmentOption} whitespace-nowrap max-sm:px-2.5`}
          >
            {days} days
          </button>
        ))}
      </div>
      <Problem error={error} />
    </span>
  );
}

/** "Mark read when opened": on by default; off, only Mark all read clears the count. */
export function MarkReadSwitch({ initial }: { initial: boolean }) {
  const { value, error, save } = useSaved(initial);
  return (
    <span className="flex flex-col items-end gap-1">
      <Switch on={value} label="Mark news read when opened" onToggle={() => save(!value, (v) => saveNewsReading("markOnOpen", v))} />
      <Problem error={error} />
    </span>
  );
}

/**
 * One of News's two pushes, saved through `saveNewsPush` so the pages that
 * read the account row read it again; it tells the list line as it changes.
 */
export function NewsPushSwitch({ topic, initial, label }: { topic: "news" | "news-people"; initial: boolean; label: string }) {
  const { value, error, save } = useSaved(initial);
  useSettingFact(topic === "news" ? "news" : "newsPeople", value);
  return (
    <span className="flex flex-col items-end gap-1">
      <Switch on={value} label={label} onToggle={() => save(!value, (v) => saveNewsPush(topic, v))} />
      <Problem error={error} />
    </span>
  );
}

/** "Popular news": never pushed, so the switch is shown off and cannot be turned on. */
export function NeverSwitch({ label }: { label: string }) {
  return <Switch on={false} disabled label={label} onToggle={() => undefined} />;
}
