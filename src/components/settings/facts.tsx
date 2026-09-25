"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "../icon";
import { foldChevron, PRESS } from "../motion";
import { Unfold } from "../unfold";
import { lineFor, type LineKind, type SettingFacts } from "./summaries";

/*
 * Settings' shared state and its one presentation piece. The page renders
 * with the account's facts; each control reports what it now holds
 * (`useSettingFact`), and the phone's cards and the desktop's section list
 * write their one-line summaries from the same bag, so both stay right as
 * the rows save behind them.
 */

type Setter = <K extends keyof SettingFacts>(key: K, value: SettingFacts[K]) => void;

const Facts = createContext<{ facts: SettingFacts | null; set: Setter }>({ facts: null, set: () => undefined });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function SettingsFacts({ initial, children }: { initial: SettingFacts; children: ReactNode }) {
  const [facts, setFacts] = useState(initial);
  // A server render with newer facts (a region change refreshes the page) wins.
  const [seen, setSeen] = useState(initial);
  if (!same(seen, initial)) {
    setSeen(initial);
    setFacts(initial);
  }
  const set = useCallback<Setter>((key, value) => setFacts((f) => (same(f[key], value) ? f : { ...f, [key]: value })), []);
  return <Facts.Provider value={{ facts, set }}>{children}</Facts.Provider>;
}

/** Tells the page what a control now holds. Outside Settings (the avatar menu's theme) it does nothing. */
export function useSettingFact<K extends keyof SettingFacts>(key: K, value: SettingFacts[K] | undefined) {
  const { set } = useContext(Facts);
  const text = JSON.stringify(value);
  useEffect(() => {
    if (value !== undefined) set(key, value);
    // `text` stands for `value`, so an array rebuilt each render is not a change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, text, set]);
}

/** A summary line from the facts, for a list entry or a card's header. */
export function FactLine({ kind }: { kind: LineKind }) {
  const { facts } = useContext(Facts);
  return facts ? <>{lineFor(kind, facts)}</> : null;
}

const LG = "(min-width: 64rem)";

/**
 * One setting as the phone draws it: a folded card, its icon, title and what
 * it holds on the closed header, the controls inside. The header is a button
 * with `aria-expanded`, and the body an `Unfold` that stays mounted, so
 * opening and closing slide (the row by `grid-template-rows`, the controls
 * fading in a beat behind) and the chevron turns with it; a shut body is
 * `visibility: hidden`, so the keyboard and a screen reader skip it as they
 * skipped a shut `<details>`. From `lg` the fold is not a fold: the header
 * goes and the contents stand open in the section (`desk`), in CSS, so the
 * first paint is right at either width.
 *
 * Inside a card a ghost button would be surface on surface, so there it takes
 * the second surface.
 *
 * `open` is the card the address names (/settings/notifications), opened and,
 * on a phone, scrolled to, so one link lands right at either width.
 */
export function Fold({
  icon,
  title,
  line,
  text,
  open = false,
  desk = "flat",
  className = "",
  bodyClassName = "",
  children,
}: {
  icon: IconName;
  title: string;
  /** A summary worked out from the facts... */
  line?: LineKind;
  /** ...or one the server wrote (a connection's status). */
  text?: string;
  open?: boolean;
  /** From `lg`: rows standing in their section, or a tile of its own (Connections). */
  desk?: "flat" | "tile";
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const [shown, setShown] = useState(open);
  // A new address that names this card opens it; one that names another leaves it as it is.
  const [named, setNamed] = useState(open);
  if (named !== open) {
    setNamed(open);
    if (open) setShown(true);
  }

  useEffect(() => {
    if (open && !matchMedia(LG).matches) ref.current?.scrollIntoView({ block: "start" });
  }, [open]);

  return (
    <div
      ref={ref}
      className={`scroll-mt-4 rounded-2xl bg-surface shadow-elevation ${
        desk === "tile" ? "lg:p-4" : "lg:rounded-none lg:bg-transparent lg:shadow-none"
      } ${className}`}
    >
      <button
        type="button"
        aria-expanded={shown}
        aria-controls={id}
        onClick={() => setShown((o) => !o)}
        className={`${PRESS} flex w-full cursor-pointer items-center gap-3 rounded-2xl border-0 bg-transparent px-4 py-3 text-left text-ink lg:hidden`}
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-ink-2">
          <Icon name={icon} size={18} />
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-sm font-semibold">{title}</span>
          <span className="truncate text-xs text-ink-3">{line ? <FactLine kind={line} /> : text}</span>
        </span>
        <Icon name="chevR" size={18} className={`text-ink-3 ${foldChevron(shown)}`} />
      </button>
      <Unfold open={shown} desk id={id}>
        <div
          className={`flex flex-col gap-1 border-t border-line px-4 pb-1 max-lg:[&>:last-child]:border-b-0 max-lg:[&_.bg-surface]:bg-surface-2 lg:border-t-0 lg:p-0 ${bodyClassName}`}
        >
          {children}
        </div>
      </Unfold>
    </div>
  );
}
