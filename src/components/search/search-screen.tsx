"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ResultTitle, SearchAnswer, SearchType } from "@/lib/search";
import { RECENT_KEY, rememberQuery } from "@/lib/search-recent";
import { titleHref } from "@/lib/marks";
import { StatusMark } from "../artwork";
import { Icon } from "../icon";
import { Link } from "../link";
import { ROW_WASH, ZOOM, ZOOM_GROUP, PRESS } from "../motion";
import { EmptyState } from "../empty-state";
import { Poster } from "../poster";
import { Bone } from "../skeleton";
import { PersonPhoto } from "../title/people";
import { buttonClass, filterChipClass } from "../ui";

/**
 * Search: the box, the four chips, and the answers grouped as the mockups
 * draw them. Asked of `/api/search` 300ms after the last key, the previous
 * question abandoned when a new one starts. The query and the chip live in
 * the address (replaced, not pushed), so Back returns to the results rather
 * than walking through every letter typed. Recent searches are this
 * browser's own, kept when a search is submitted or a result opened.
 */

const CHIPS: [SearchType, string][] = [
  ["all", "Everything"],
  ["tv", "Shows"],
  ["movie", "Films"],
  ["person", "People"],
];

/** How many of each kind Everything shows before "see all" takes over. */
const PER_GROUP = 5;
const DEBOUNCE_MS = 300;

function readRecent(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function writeRecent(list: string[]) {
  try {
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    // Storage refused: nothing is remembered, and search still works.
  }
}

function TitleRow({ item, onOpen }: { item: ResultTitle; onOpen: () => void }) {
  return (
    <Link href={titleHref(item.mediaType, item.id)} onClick={onOpen} className={`${ZOOM_GROUP} flex items-center gap-3 ${ROW_WASH}`}>
      {/* The row washes and its poster zooms in its frame. */}
      <span className="block shrink-0 overflow-hidden rounded-md">
        <Poster path={item.poster} alt="" title={item.title} width={44} height={66} sizes="44px" className={`h-[66px] w-11 ${ZOOM}`} />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{item.title}</span>
        <span className="text-xs text-ink-2">{item.line}</span>
      </span>
      <StatusMark mark={item.mark} />
      {item.score > 0 && <span className="mono-label shrink-0">{item.score}%</span>}
    </Link>
  );
}

function PersonRow({ person, onOpen }: { person: SearchAnswer["people"][number]; onOpen: () => void }) {
  return (
    <Link href={`/person/${person.id}`} onClick={onOpen} className={`${ZOOM_GROUP} flex items-center gap-3 ${ROW_WASH}`}>
      <span className="block shrink-0 overflow-hidden rounded-[10px]">
        <PersonPhoto id={person.id} name={person.name} path={person.profile} sizes="44px" text="text-[15px]" className={`w-11 ${ZOOM}`} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-sm font-semibold">{person.name}</span>
        {person.line && <span className="truncate text-xs text-ink-2">{person.line}</span>}
      </span>
    </Link>
  );
}

function RowBones() {
  return (
    <div className="flex flex-col gap-2.5 lg:gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-[66px] w-11 rounded-md" />
          <div className="flex grow flex-col gap-1.5">
            <Bone className="h-3.5 w-3/4 rounded" />
            <Bone className="h-3 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Group({
  title,
  count,
  more,
  children,
}: {
  title: string;
  count: number;
  more?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5 lg:gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="m-0 font-display text-lg font-bold leading-[1.05] tracking-[-0.025em]">{title}</h2>
        <span className="mono-label">{count}</span>
        <span className="grow" />
        {more && (
          <button type="button" onClick={more} aria-label={`All ${title.toLowerCase()}`} className="inline-flex self-center border-0 bg-transparent p-0 text-ink-3 transition-[translate,color] duration-(--fast) ease-out hover:translate-x-0.5 hover:text-ink">
            <Icon name="chevR" size={18} />
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2.5 lg:gap-3">{children}</div>
    </section>
  );
}

export function SearchScreen({ initialQuery, initialType }: { initialQuery: string; initialType: SearchType }) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<SearchType>(initialType);
  const [answer, setAnswer] = useState<SearchAnswer | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLInputElement>(null);

  // Storage is only readable in the browser, after hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- storage exists only here
    setRecent(readRecent());
  }, []);

  useEffect(() => {
    const q = query.trim();
    const url = q ? `/search?q=${encodeURIComponent(q)}${type === "all" ? "" : `&type=${type}`}` : "/search";
    window.history.replaceState(window.history.state, "", url);
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=${type}`, { signal: controller.signal });
        if (res.ok) setAnswer((await res.json()) as SearchAnswer);
      } catch {
        // Abandoned for a newer question, or offline: the last answer stays.
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, type]);

  const remember = (q = query) => {
    const next = rememberQuery(readRecent(), q);
    writeRecent(next);
    setRecent(next);
  };
  const forget = () => {
    writeRecent([]);
    setRecent([]);
  };

  const q = query.trim();
  const current = answer && answer.query === q ? answer : null;
  const total = current ? current.shows.length + current.films.length + current.people.length : 0;
  const cap = (n: number) => (type === "all" ? Math.min(n, PER_GROUP) : n);
  const open = () => remember();

  const results = current && (
    <>
      {current.error && <p className="m-0 text-[13px] text-ink-2">{current.error}</p>}
      {!current.error && total === 0 && (
        <EmptyState
          icon="search"
          title={<>Nothing for &ldquo;{q}&rdquo;</>}
          action={
            type === "all" ? undefined : (
              <button type="button" onClick={() => setType("all")} className={buttonClass("ghost", "sm")}>
                <Icon name="search" size={18} />
                Search everything
              </button>
            )
          }
        >
          {type === "all"
            ? "Check the spelling, or try the original title. Trekker searches TMDB, so anything released will be there."
            : "Check the spelling, or look beyond this one kind: it may be filed under another."}
        </EmptyState>
      )}
      {total > 0 && (
        <div className={`grid grid-cols-1 items-start gap-[18px] ${type === "all" ? "lg:grid-cols-3 lg:gap-10" : ""}`}>
          {(type === "all" || type === "tv") && current.shows.length > 0 && (
            <Group title="Shows" count={current.shows.length} more={type === "all" && current.shows.length > PER_GROUP ? () => setType("tv") : undefined}>
              <div className={type === "tv" ? "grid gap-2.5 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-3" : "contents"}>
                {current.shows.slice(0, cap(current.shows.length)).map((t) => (
                  <TitleRow key={`tv-${t.id}`} item={t} onOpen={open} />
                ))}
              </div>
            </Group>
          )}
          {(type === "all" || type === "movie") && current.films.length > 0 && (
            <Group title="Films" count={current.films.length} more={type === "all" && current.films.length > PER_GROUP ? () => setType("movie") : undefined}>
              <div className={type === "movie" ? "grid gap-2.5 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-3" : "contents"}>
                {current.films.slice(0, cap(current.films.length)).map((t) => (
                  <TitleRow key={`movie-${t.id}`} item={t} onOpen={open} />
                ))}
              </div>
            </Group>
          )}
          {(type === "all" || type === "person") && current.people.length > 0 && (
            <Group title="People" count={current.people.length} more={type === "all" && current.people.length > PER_GROUP ? () => setType("person") : undefined}>
              <div className={type === "person" ? "grid gap-2.5 lg:grid-cols-3 lg:gap-x-10 lg:gap-y-3" : "contents"}>
                {current.people.slice(0, cap(current.people.length)).map((p) => (
                  <PersonRow key={`person-${p.id}`} person={p} onOpen={open} />
                ))}
              </div>
            </Group>
          )}
        </div>
      )}
    </>
  );

  const recentBlock = recent.length > 0 && (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-3">
        <h2 className="m-0 font-display text-xl font-bold leading-[1.05] tracking-[-0.025em] lg:text-[22px]">Recent searches</h2>
        <span className="grow" />
        <button type="button" onClick={forget} className={`${PRESS} text-xs font-semibold text-ink-2 hover:text-ink`}>
          Clear
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {recent.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setQuery(r);
              box.current?.focus();
            }}
            className={`${PRESS} inline-flex h-[34px] items-center gap-2 rounded-full bg-surface px-3 text-[13px] font-semibold shadow-elevation hover:bg-surface-2`}
          >
            <Icon name="clock" size={14} />
            {r}
          </button>
        ))}
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-[18px] px-5 pt-4 lg:mx-auto lg:w-full lg:max-w-[1040px] lg:gap-6 lg:px-10 lg:pt-10">
      <div className="flex items-center gap-2.5">
        <form
          role="search"
          className="grow"
          onSubmit={(e) => {
            e.preventDefault();
            remember();
            box.current?.blur();
          }}
        >
          <label className="flex h-12 items-center gap-3 rounded-[14px] bg-surface px-4 text-ink-3 shadow-elevation focus-within:shadow-[0_0_0_2px_var(--accent)] lg:h-14 lg:rounded-2xl">
            <Icon name="search" size={20} />
            <input
              ref={box}
              type="search"
              name="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // The page exists to type into; landing here without the box ready would be a second tap.
              autoFocus
              enterKeyHint="search"
              autoComplete="off"
              placeholder="Shows, films and people"
              aria-label="Search"
              className="min-w-0 grow border-0 bg-transparent text-base text-ink outline-none placeholder:text-ink-3 [&::-webkit-search-cancel-button]:hidden lg:text-lg"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear"
                onClick={() => {
                  setQuery("");
                  box.current?.focus();
                }}
                className={`${PRESS} inline-flex text-ink-3 hover:text-ink`}
              >
                <Icon name="x" size={18} />
              </button>
            )}
          </label>
        </form>
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
          className={`${PRESS} whitespace-nowrap text-sm font-semibold text-ink-2 lg:hidden`}
        >
          Cancel
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <div className="no-scrollbar -mx-5 flex gap-1.5 overflow-x-auto px-5 lg:mx-0 lg:px-0">
          {CHIPS.map(([t, label]) => (
            <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)} className={filterChipClass(type === t)}>
              {label}
            </button>
          ))}
        </div>
        <span className="grow" />
        {current && total > 0 && (
          <span className="mono-label hidden lg:inline">
            {total} {total === 1 ? "result" : "results"} for &ldquo;{q}&rdquo;
          </span>
        )}
      </div>

      {q.length >= 2 && !current && (
        <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-3 lg:gap-10">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex flex-col gap-3">
              <Bone className="h-5 w-24 rounded-md" />
              <RowBones />
            </div>
          ))}
        </div>
      )}
      {q.length >= 2 && results}
      {(q.length < 2 || total > 0) && recentBlock}
      {q.length < 2 && recent.length === 0 && (
        <p className="m-0 text-[13px] text-ink-2">Search every show, film and person TMDB knows. Two letters is enough to start.</p>
      )}
    </div>
  );
}
